// Struttura dati Room e helper di costruzione.
//
// Una Room rappresenta una singola "schermata" di gioco. Contiene:
//   - id: identificatore univoco (per ora stringa, in M3 sara la coordinata di griglia).
//   - exits: oggetto con chiavi 'N' | 'S' | 'E' | 'O', ognuna null oppure un oggetto
//       { pos, target, targetExit }
//     dove `pos` e una coordinata lungo il lato (x per N/S, y per E/O), che indica
//     l'inizio dell'apertura (l'apertura va da `pos` a `pos + DOOR_*_*`),
//     `target` e l'id della stanza collegata, `targetExit` e la direzione corrispondente
//     in quella stanza (es. N <-> S, E <-> O).
//   - platforms: lista di rettangoli solidi interni alla stanza ({x, y, w, h});
//     di default sono one-way, oppure pieni con oneWay:false. Il campo `kind`
//     serve solo al rendering/debug (platform, solidPlatform, hill).
//   - enemySpawns: lista di punti di spawn nemici (vuoto in M2, popolato da M5).
//   - pickupSpawns: lista di punti di spawn pickup (vuoto in M2, popolato da M5).
//
// I solidi effettivi (pareti con gap nelle uscite + piattaforme) vengono costruiti
// una volta sola in fase di caricamento della stanza tramite `buildSolids`.

import {
  ROOM_W, ROOM_H, WALL_THICKNESS,
  DOOR_NS_WIDTH, DOOR_EW_HEIGHT,
  DEBUG,
} from '../config.js';
import { drawDoorEdge, drawNpcSprite, drawRoomAtmosphere, drawSolidBlock } from '../graphics/sprites.js';
import { t } from '../i18n.js';

// Dimensione del cartello dei comandi nella stanza iniziale. La posizione
// (x) viene calcolata dinamicamente da Room.getControlsSignRect() in modo
// da non sovrapporsi a player, viandante, uscita sud o colline.
export const CONTROLS_SIGN = {
  w: 28,
  h: 40,
};

function rectsOverlapAabb(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

export const DIR_OPPOSITE = { N: 'S', S: 'N', E: 'O', O: 'E' };

function overlapsSouthGap(exits, x, w, padding = 0) {
  if (!exits.S) return false;
  const gapStart = exits.S.pos - padding;
  const gapEnd = exits.S.pos + DOOR_NS_WIDTH + padding;
  return x < gapEnd && x + w > gapStart;
}

function chooseFloorMarkerX(exits, preferredX, w) {
  const minX = WALL_THICKNESS + 8;
  const maxX = ROOM_W - WALL_THICKNESS - 8 - w;
  const preferred = Math.max(minX, Math.min(preferredX, maxX));
  const candidates = [preferred];

  for (let step = 1; step <= 10; step += 1) {
    const offset = step * 34;
    candidates.push(preferred - offset, preferred + offset);
  }

  for (const rawX of candidates) {
    const x = Math.max(minX, Math.min(rawX, maxX));
    if (!overlapsSouthGap(exits, x, w, 10)) return x;
  }

  return preferred;
}

export class Room {
  constructor(data) {
    this.id = data.id;
    this.exits = {
      N: data.exits?.N ?? null,
      S: data.exits?.S ?? null,
      E: data.exits?.E ?? null,
      O: data.exits?.O ?? null,
    };
    this.platforms = data.platforms ?? [];
    this.enemySpawns = data.enemySpawns ?? [];
    this.pickupSpawns = data.pickupSpawns ?? [];
    this.meta = data.meta ?? {};
    this.solids = this._buildSolids();
  }

  // Costruisce la lista di rettangoli statici della stanza:
  // pareti/pavimento/soffitto con gap dove ci sono uscite, piu le piattaforme.
  _buildSolids() {
    const T = WALL_THICKNESS;
    const W = ROOM_W;
    const H = ROOM_H;
    const out = [];

    // --- Soffitto (lato N) ---
    if (this.exits.N) {
      const dx = this.exits.N.pos;
      const dw = DOOR_NS_WIDTH;
      if (dx > 0)        out.push({ x: 0,      y: 0, w: dx,         h: T });
      if (dx + dw < W)   out.push({ x: dx + dw, y: 0, w: W - (dx + dw), h: T });
    } else {
      out.push({ x: 0, y: 0, w: W, h: T });
    }

    // --- Pavimento (lato S) ---
    if (this.exits.S) {
      const dx = this.exits.S.pos;
      const dw = DOOR_NS_WIDTH;
      if (dx > 0)        out.push({ x: 0,      y: H - T, w: dx,         h: T });
      if (dx + dw < W)   out.push({ x: dx + dw, y: H - T, w: W - (dx + dw), h: T });
    } else {
      out.push({ x: 0, y: H - T, w: W, h: T });
    }

    // --- Parete sinistra (lato O) ---
    if (this.exits.O) {
      const dy = this.exits.O.pos;
      const dh = DOOR_EW_HEIGHT;
      if (dy > 0)        out.push({ x: 0, y: 0,      w: T, h: dy });
      if (dy + dh < H)   out.push({ x: 0, y: dy + dh, w: T, h: H - (dy + dh) });
    } else {
      out.push({ x: 0, y: 0, w: T, h: H });
    }

    // --- Parete destra (lato E) ---
    if (this.exits.E) {
      const dy = this.exits.E.pos;
      const dh = DOOR_EW_HEIGHT;
      if (dy > 0)        out.push({ x: W - T, y: 0,      w: T, h: dy });
      if (dy + dh < H)   out.push({ x: W - T, y: dy + dh, w: T, h: H - (dy + dh) });
    } else {
      out.push({ x: W - T, y: 0, w: T, h: H });
    }

    // --- Piattaforme interne ---
    // Default one-way (piattaforme "in aria", attraversabili dal basso e di
    // lato; bloccano solo l'atterraggio dall'alto). Le piattaforme che fanno
    // da terreno/collina possono passare oneWay:false nei dati per restare
    // solide su tutti i lati.
    for (const p of this.platforms) {
      out.push({
        x: p.x, y: p.y, w: p.w, h: p.h,
        oneWay: p.oneWay !== false,
        kind: p.kind ?? (p.oneWay === false ? 'solidPlatform' : 'platform'),
      });
    }

    return out;
  }

  // Calcola la posizione di spawn del giocatore quando entra dalla direzione `entryDir`
  // (la direzione del lato di QUESTA stanza da cui il giocatore entra).
  // Ritorna { x, y, vx, vy }.
  getSpawnFromEntry(entryDir, playerW, playerH) {
    const T = WALL_THICKNESS;
    const exit = this.exits[entryDir];
    if (!exit) {
      // Fallback: centro stanza, sul pavimento.
      return {
        x: (ROOM_W - playerW) / 2,
        y: ROOM_H - T - playerH,
        vx: 0,
        vy: 0,
      };
    }
    switch (entryDir) {
      case 'N': {
        // Entra dall'alto (porta nel soffitto): spawna appena sotto il soffitto,
        // centrato nell'apertura, con una piccola velocita verso il basso.
        return {
          x: exit.pos + (DOOR_NS_WIDTH - playerW) / 2,
          y: T + 1,
          vx: 0,
          vy: 60,
        };
      }
      case 'S': {
        // Entra dal basso (apertura nel pavimento): spawna sul bordo del pavimento
        // accanto all'apertura. Sceglie il lato con piu spazio per evitare di
        // ricadere subito nell'apertura.
        const gapStart = exit.pos;
        const gapEnd = exit.pos + DOOR_NS_WIDTH;
        const spaceLeft = gapStart;
        const spaceRight = ROOM_W - gapEnd;
        const onRight = spaceRight >= spaceLeft;
        const x = onRight
          ? Math.min(gapEnd + 6, ROOM_W - T - playerW)
          : Math.max(gapStart - 6 - playerW, T);
        return {
          x,
          y: ROOM_H - T - playerH,
          vx: 0,
          vy: 0,
        };
      }
      case 'O': {
        // Entra da sinistra: spawna appena dentro la parete sinistra, centrato sulla porta.
        return {
          x: T + 2,
          y: exit.pos + (DOOR_EW_HEIGHT - playerH) / 2,
          vx: 0,
          vy: 0,
        };
      }
      case 'E': {
        // Entra da destra: spawna appena dentro la parete destra.
        return {
          x: ROOM_W - T - playerW - 2,
          y: exit.pos + (DOOR_EW_HEIGHT - playerH) / 2,
          vx: 0,
          vy: 0,
        };
      }
    }
  }

  // Disegna pavimento/pareti/piattaforme + un piccolo evidenziatore visivo per
  // le aperture (utile per testare in M2). Le aperture sono semplicemente gap
  // nei solidi, ma rendiamo evidente il loro perimetro.
  render(ctx, colors) {
    // Sfondo stanza.
    drawRoomAtmosphere(ctx, this, colors);

    // Solidi (pareti + piattaforme).
    for (const s of this.solids) this._renderSolid(ctx, colors, s);

    // Evidenziatore delle uscite (piccola fascia colorata sul bordo dell'apertura
    // per renderle visibili durante il test della M2).
    ctx.fillStyle = colors.DOOR;
    const T = WALL_THICKNESS;
    if (this.exits.N) drawDoorEdge(ctx, this.exits.N.pos, 0, DOOR_NS_WIDTH, 3, colors.DOOR);
    if (this.exits.S) drawDoorEdge(ctx, this.exits.S.pos, ROOM_H - 3, DOOR_NS_WIDTH, 3, colors.DOOR);
    if (this.exits.O) drawDoorEdge(ctx, 0, this.exits.O.pos, 3, DOOR_EW_HEIGHT, colors.DOOR);
    if (this.exits.E) drawDoorEdge(ctx, ROOM_W - 3, this.exits.E.pos, 3, DOOR_EW_HEIGHT, colors.DOOR);

    this._renderMarkers(ctx, colors);

    if (DEBUG.SHOW_ROOM_LABELS) {
      ctx.fillStyle = colors.LABEL;
      ctx.font = '12px ui-monospace, Menlo, monospace';
      const tags = [];
      if (this.meta.deadEnd) tags.push(t('roomTagDead'));
      if (this.meta.miniboss) tags.push(t('roomTagBoss', { boss: this.meta.minibossArchetype ?? 'random' }));
      if (this.meta.checkpoint) tags.push(t('roomTagCheckpoint'));
      if (this.meta.npc) tags.push(this.meta.npc);
      if (this.meta.cloneStart) tags.push(t('roomTagClone'));
      ctx.fillText(`${t('roomLabel', { id: this.id })}${tags.length ? ` | ${tags.join(' ')}` : ''}`, T + 4, T + 14);
    }
  }

  _renderSolid(ctx, colors, s) {
    drawSolidBlock(ctx, s, colors);
  }

  _renderMarkers(ctx, colors) {
    const cx = ROOM_W / 2;
    const cy = ROOM_H - WALL_THICKNESS - 24;

    if (this.meta.npc) {
      const npcW = 28;
      const npcH = 42;
      const npcX = chooseFloorMarkerX(this.exits, ROOM_W / 2 + 18, npcW) + npcW / 2;
      const npcY = ROOM_H - WALL_THICKNESS - npcH;
      drawNpcSprite(ctx, this.meta.npc, npcX - npcW / 2, npcY, npcW, npcH);
    }

    if (this.meta.cloneStart) {
      ctx.strokeStyle = colors.CLONE_START;
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - 18, cy - 18, 36, 18);
    }

    if (this.meta.isStartRoom) {
      this._renderControlsSign(ctx);
    }
  }

  // Calcola (con cache) la posizione del cartello in modo che non si
  // sovrapponga al player (spawn al centro), al viandante (npc), all'uscita
  // sud o alle colline/piattaforme che intersecano la fascia del cartello.
  getControlsSignRect() {
    if (this._controlsSignRect) return this._controlsSignRect;
    const w = CONTROLS_SIGN.w;
    const h = CONTROLS_SIGN.h;
    const y = ROOM_H - WALL_THICKNESS - h;

    const avoid = [];

    // Buffer attorno allo spawn del player (centro stanza, sul pavimento).
    const spawnW = 96;
    const spawnH = 96;
    avoid.push({
      x: ROOM_W / 2 - spawnW / 2,
      y: ROOM_H - WALL_THICKNESS - spawnH,
      w: spawnW,
      h: spawnH,
    });

    // Viandante: stesso anchor usato in _renderMarkers (chooseFloorMarkerX).
    if (this.meta.npc) {
      const npcW = 28;
      const npcH = 42;
      const npcX = chooseFloorMarkerX(this.exits, ROOM_W / 2 + 18, npcW);
      avoid.push({
        x: npcX - 16,
        y: ROOM_H - WALL_THICKNESS - npcH - 8,
        w: npcW + 32,
        h: npcH + 16,
      });
    }

    // Colline/piattaforme che invadono la fascia verticale del cartello.
    for (const solid of this.solids) {
      if (solid.kind === 'platform' && solid.oneWay) continue;
      if (solid.y + solid.h <= y) continue;
      if (solid.y >= y + h) continue;
      avoid.push({
        x: solid.x - 6,
        y: solid.y,
        w: solid.w + 12,
        h: solid.h,
      });
    }

    const minX = WALL_THICKNESS + 8;
    const maxX = ROOM_W - WALL_THICKNESS - 8 - w;

    // Anchor preferiti, dal piu desiderato al fallback.
    const anchors = [0.78, 0.22, 0.85, 0.15, 0.65, 0.35, 0.5].map((p) => ROOM_W * p);

    for (const cx of anchors) {
      for (let offset = 0; offset <= 120; offset += 8) {
        const signs = offset === 0 ? [0] : [-1, 1];
        for (const dir of signs) {
          const rawX = Math.round(cx - w / 2 + dir * offset);
          const x = Math.max(minX, Math.min(rawX, maxX));
          if (overlapsSouthGap(this.exits, x, w, 14)) continue;
          const rect = { x, y, w, h };
          let blocked = false;
          for (const a of avoid) {
            if (rectsOverlapAabb(rect, a)) { blocked = true; break; }
          }
          if (blocked) continue;
          this._controlsSignRect = rect;
          return rect;
        }
      }
    }

    // Fallback: posizione originale, anche se non perfetta.
    const fallbackX = Math.max(minX, Math.min(Math.round(ROOM_W * 0.78 - w / 2), maxX));
    this._controlsSignRect = { x: fallbackX, y, w, h };
    return this._controlsSignRect;
  }

  _renderControlsSign(ctx) {
    // Cartello di legno: paletto verticale + asse orizzontale con un piccolo
    // bordo. Niente testo qui sopra: il dettaglio dei comandi appare nel
    // pannello modale quando il giocatore interagisce.
    const rect = this.getControlsSignRect();
    const { x, y, w, h } = rect;

    ctx.save();
    // Paletto
    const poleW = 4;
    ctx.fillStyle = '#5a4530';
    ctx.fillRect(x + Math.floor((w - poleW) / 2), y + 14, poleW, h - 14);
    // Asse principale
    const boardH = 22;
    ctx.fillStyle = '#8a6a3e';
    ctx.fillRect(x, y, w, boardH);
    // Bordo asse
    ctx.strokeStyle = '#3a2a18';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, boardH - 1);
    // Venatura/dettaglio
    ctx.fillStyle = 'rgba(58, 42, 24, 0.55)';
    ctx.fillRect(x + 3, y + 7, w - 6, 1);
    ctx.fillRect(x + 3, y + 14, w - 6, 1);
    // Glifo "i" informativo
    ctx.fillStyle = '#f4ecd8';
    ctx.fillRect(x + Math.floor(w / 2), y + 5, 2, 2);
    ctx.fillRect(x + Math.floor(w / 2), y + 9, 2, 9);
    ctx.restore();
  }
}
