// Stanze hardcoded per la milestone M2: testano transizioni in tutte e 4 le
// direzioni (N, S, E, O). In M3 verranno sostituite dalla generazione procedurale.
//
// Struttura del grafo:
//
//                 [north]
//                    |
//                    | (S<->N x=180)
//                    |
//   [west] -- (E<->O y=120) -- [center] -- (E<->O y=280) -- [east]
//                    |
//                    | (S<->N x=420)
//                    |
//                 [south]
//
// Vincolo: l'asse di un'apertura coincide tra le due celle collegate.
//
// Calcoli salto base:
//   - JUMP_VELOCITY = 540 px/s, GRAVITY = 1800 px/s^2
//   - altezza massima teorica = 540^2 / (2*1800) = 81 px
//   - margine di sicurezza usato qui: ogni "gradino" verticale ha diff <= 55 px
//     (~32% di margine sotto al limite). Le piattaforme sono one-way, quindi
//     in salita si attraversano e si atterra in caduta.
//
// I dati usano tre famiglie:
//   - oneWayPlatform: classica piattaforma attraversabile dal basso;
//   - solidPlatform: blocco pieno, collide da tutti i lati;
//   - hill: segmenti solidi che partono sempre dal terreno.

import { Room } from './room.js';
import { ROOM_H, ROOM_W, WALL_THICKNESS } from '../config.js';

const PLATFORM_H = 12;
const GROUND_Y = ROOM_H - WALL_THICKNESS;
const LOOSE_PLATFORM_MAX_COUNT = 2;

function oneWayPlatform(x, y, w, h = PLATFORM_H) {
  return { x, y, w, h, kind: 'platform' };
}

function solidPlatform(x, y, w, h) {
  return { x, y, w, h, oneWay: false, kind: 'solidPlatform' };
}

function hill(x, stepW, heights) {
  return heights.map((height, i) => ({
    x: x + i * stepW,
    y: GROUND_Y - height,
    w: stepW,
    h: height,
    oneWay: false,
    kind: 'hill',
  }));
}

function hashSeed(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seed) {
  let t = hashSeed(seed);
  return () => {
    t += 0x6D2B79F5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function rectsTooClose(a, b, padding) {
  return (
    a.x - padding < b.x + b.w &&
    a.x + a.w + padding > b.x &&
    a.y - padding < b.y + b.h &&
    a.y + a.h + padding > b.y
  );
}

function loosePlatforms(seed, existing) {
  const rng = seededRandom(seed);
  const count = randomInt(rng, 0, LOOSE_PLATFORM_MAX_COUNT);
  const out = [];

  for (let attempt = 0; attempt < 24 && out.length < count; attempt += 1) {
    const w = randomInt(rng, 56, 112);
    const h = randomInt(rng, 0, 1) ? 8 : PLATFORM_H;
    const x = randomInt(rng, WALL_THICKNESS + 18, ROOM_W - WALL_THICKNESS - 18 - w);
    const y = randomInt(rng, 76, GROUND_Y - 78);
    const candidate = { ...oneWayPlatform(x, y, w, h), loose: true };

    if ([...existing, ...out].some((p) => rectsTooClose(candidate, p, 24))) {
      continue;
    }

    out.push(candidate);
  }

  return out;
}

function withLoosePlatforms(seed, required) {
  return [...required, ...loosePlatforms(seed, required)];
}

export function createTestRooms() {
  const rooms = new Map();

  // -------------------------------------------------------------------------
  // CENTER: stanza di partenza, 4 uscite.
  // - N a x=180 (soffitto): scaletta zigzag fino a sotto la porta.
  // - E a y=280 (parete dx, ras pavimento): walk-in.
  // - S a x=420 (apertura nel pavimento): cadi nella stanza sud.
  // - O a y=120 (parete sx rialzata): la p3 raggiunge il muro sx
  //   (player in piedi su p3 -> y=144, dentro la porta y=120..184).
  // Pavimento top y=344. Diff piedi -> top piattaforma sempre <= 55 px.
  // -------------------------------------------------------------------------
  rooms.set('center', new Room({
    id: 'center',
    exits: {
      N: { pos: 180, target: 'north', targetExit: 'S' },
      E: { pos: 280, target: 'east',  targetExit: 'O' },
      S: { pos: 420, target: 'south', targetExit: 'N' },
      O: { pos: 120, target: 'west',  targetExit: 'E' },
    },
    platforms: withLoosePlatforms('center', [
      oneWayPlatform(120, 290, 120), // p1 (diff 54 dal pavimento)
      oneWayPlatform(80,  235, 120), // p2 (diff 55, overlap con p1)
      oneWayPlatform(16,  180, 120), // p3 (diff 55) - sostiene uscita O
      oneWayPlatform(120, 125, 120), // p4 (diff 55)
      oneWayPlatform(180, 70,  80),  // p5 (diff 55) - sotto la porta N
      solidPlatform(300, 258, 76, 18),
      ...hill(508, 26, [22, 36, 22]),
    ]),
  }));

  // -------------------------------------------------------------------------
  // NORTH: una sola uscita S verso center (gap nel pavimento a x=180..236).
  // Per uscire basta camminare verso il gap e cadere. Piattaforme di test
  // raggiungibili coi salti base.
  // -------------------------------------------------------------------------
  rooms.set('north', new Room({
    id: 'north',
    exits: {
      S: { pos: 180, target: 'center', targetExit: 'N' },
    },
    platforms: withLoosePlatforms('north', [
      oneWayPlatform(280, 290, 140), // diff 54
      oneWayPlatform(440, 235, 140), // diff 55, gap orizzontale 20
      solidPlatform(500, 184, 72, 20),
      ...hill(36, 28, [24, 42, 60, 42]),
    ]),
  }));

  // -------------------------------------------------------------------------
  // EAST: una sola uscita O verso center, a y=280..344 (ras pavimento).
  // Walk-in. Piattaforme di test sopra al percorso.
  // -------------------------------------------------------------------------
  rooms.set('east', new Room({
    id: 'east',
    exits: {
      O: { pos: 280, target: 'center', targetExit: 'E' },
    },
    platforms: withLoosePlatforms('east', [
      oneWayPlatform(220, 290, 120), // diff 54
      oneWayPlatform(380, 235, 120), // diff 55, gap orizzontale 20
      oneWayPlatform(94, 248, 72, 8),
      solidPlatform(496, 294, 56, 28),
      ...hill(348, 24, [20, 40, 60, 40, 20]),
    ]),
  }));

  // -------------------------------------------------------------------------
  // SOUTH: una sola uscita N (soffitto) verso center, a x=420..476.
  // Quando entri da N (caduta) le piattaforme p5..p1 fanno da scalini di
  // discesa. Per ripartire risali la stessa scaletta.
  // -------------------------------------------------------------------------
  rooms.set('south', new Room({
    id: 'south',
    exits: {
      N: { pos: 420, target: 'center', targetExit: 'S' },
    },
    platforms: withLoosePlatforms('south', [
      oneWayPlatform(80,  290, 120), // p1 (diff 54)
      oneWayPlatform(220, 235, 120), // p2 (diff 55, gap 20)
      oneWayPlatform(320, 180, 140), // p3 (diff 55, overlap con p2)
      oneWayPlatform(380, 125, 140), // p4 (diff 55, overlap con p3)
      oneWayPlatform(420, 70,  80),  // p5 (diff 55) - sotto la porta N
      solidPlatform(36, 252, 76, 18),
      ...hill(512, 24, [18, 36, 54, 36, 18]),
    ]),
  }));

  // -------------------------------------------------------------------------
  // WEST: una sola uscita E (parete dx) verso center, a y=120..184.
  // Tre gradini: floor -> p1 -> p2 -> p3 (p3 arriva a x=624 = muro dx,
  // player in piedi su p3 ha y=144, dentro la porta).
  // -------------------------------------------------------------------------
  rooms.set('west', new Room({
    id: 'west',
    exits: {
      E: { pos: 120, target: 'center', targetExit: 'O' },
    },
    platforms: withLoosePlatforms('west', [
      oneWayPlatform(400, 290, 120), // p1 (diff 54)
      oneWayPlatform(480, 235, 120), // p2 (diff 55, overlap con p1)
      oneWayPlatform(504, 180, 120), // p3 (diff 55) - sostiene uscita E
      solidPlatform(292, 292, 64, 24),
      ...hill(96, 24, [22, 40, 58, 40, 22]),
    ]),
  }));

  return rooms;
}
