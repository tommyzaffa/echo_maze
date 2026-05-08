// Collisioni AABB minimali per M1.
// Risoluzione asse-per-asse: spostamento orizzontale, poi verticale.
// Sufficiente a velocità basse; per velocità alte (dash, schianto) sarà
// rimpiazzata da AABB swept in milestone successive (vedi §16 della spec).

export function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function rangesOverlap(a0, a1, b0, b1) {
  return a0 < b1 && a1 > b0;
}

function clipRectToBounds(rect, bounds) {
  const x0 = Math.max(rect.x, bounds.x);
  const y0 = Math.max(rect.y, bounds.y);
  const x1 = Math.min(rect.x + rect.w, bounds.x + bounds.w);
  const y1 = Math.min(rect.y + rect.h, bounds.y + bounds.h);
  if (x1 <= x0 || y1 <= y0) return null;
  return { ...rect, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Taglia una hitbox rettangolare lungo la sua direzione di emissione.
// Usata per attacchi/proiettili visivi: i solidi one-way non bloccano, muri e
// blocchi pieni si. `bounds` evita che l'effetto esca dalla stanza logica.
export function clipDirectionalRect(rect, solids, direction, bounds) {
  const out = clipRectToBounds(rect, bounds);
  if (!out) return null;

  const dirX = Math.sign(direction.x);
  const dirY = Math.sign(direction.y);

  for (const solid of solids) {
    if (solid.oneWay) continue;

    if (dirX > 0) {
      if (!rangesOverlap(out.y, out.y + out.h, solid.y, solid.y + solid.h)) continue;
      const right = out.x + out.w;
      if (solid.x < right && solid.x + solid.w > out.x) {
        out.w = Math.max(0, solid.x - out.x);
      }
    } else if (dirX < 0) {
      if (!rangesOverlap(out.y, out.y + out.h, solid.y, solid.y + solid.h)) continue;
      const right = out.x + out.w;
      if (solid.x < right && solid.x + solid.w > out.x) {
        out.x = Math.min(right, Math.max(out.x, solid.x + solid.w));
        out.w = Math.max(0, right - out.x);
      }
    } else if (dirY > 0) {
      if (!rangesOverlap(out.x, out.x + out.w, solid.x, solid.x + solid.w)) continue;
      const bottom = out.y + out.h;
      if (solid.y < bottom && solid.y + solid.h > out.y) {
        out.h = Math.max(0, solid.y - out.y);
      }
    } else if (dirY < 0) {
      if (!rangesOverlap(out.x, out.x + out.w, solid.x, solid.x + solid.w)) continue;
      const bottom = out.y + out.h;
      if (solid.y < bottom && solid.y + solid.h > out.y) {
        out.y = Math.min(bottom, Math.max(out.y, solid.y + solid.h));
        out.h = Math.max(0, bottom - out.y);
      }
    }
  }

  return out.w > 0 && out.h > 0 ? out : null;
}

// Sposta `entity` di (dx, dy) risolvendo collisioni contro i solidi statici.
// L'entità deve avere {x, y, w, h, vx, vy, onGround}.
// Aggiorna onGround=true se atterra su un solido durante lo step.
//
// I solidi possono essere "pieni" o "one-way" (s.oneWay === true).
// Le piattaforme one-way (tipiche delle piattaforme in aria):
//   - non bloccano il movimento orizzontale (ci si passa di lato);
//   - non bloccano la salita (ci si passa attraverso dal basso);
//   - bloccano solo l'atterraggio sul bordo superiore quando l'entità,
//     prima dello step verticale, era completamente sopra il piano.
export function moveAndCollide(entity, dx, dy, solids) {
  // --- asse X ---
  entity.x += dx;
  if (dx !== 0) {
    for (const s of solids) {
      if (s.oneWay) continue;            // one-way: trasparenti orizzontalmente
      if (!rectsOverlap(entity, s)) continue;
      if (dx > 0) entity.x = s.x - entity.w;
      else        entity.x = s.x + s.w;
      entity.vx = 0;
    }
  }

  // --- asse Y ---
  entity.y += dy;
  entity.onGround = false;
  if (dy !== 0) {
    for (const s of solids) {
      if (!rectsOverlap(entity, s)) continue;
      if (s.oneWay) {
        // Solo quando si sta cadendo (dy > 0) e si arriva dall'alto.
        if (dy <= 0) continue;
        const prevBottom = entity.y - dy + entity.h;
        // Tolleranza di 0.5 px per piedi appena sopra il piano (es. atterraggio
        // perfetto a velocità basse / coyote frame).
        if (prevBottom > s.y + 0.5) continue;
        entity.y = s.y - entity.h;
        entity.onGround = true;
        entity.vy = 0;
      } else {
        if (dy > 0) {
          entity.y = s.y - entity.h;
          entity.onGround = true;
        } else {
          entity.y = s.y + s.h;
        }
        entity.vy = 0;
      }
    }
  }
}
