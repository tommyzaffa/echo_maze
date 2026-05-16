import { COLORS, ROOM_H, ROOM_W, WALL_THICKNESS } from '../config.js';

function nowSeconds() {
  return typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function withAlpha(ctx, alpha, draw) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  draw();
  ctx.restore();
}

function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function strokeRect(ctx, x, y, w, h, color, lineWidth = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
}

function diamond(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
  ctx.fill();
}

function roundedPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function roundRect(ctx, x, y, w, h, r, color) {
  ctx.fillStyle = color;
  roundedPath(ctx, x, y, w, h, r);
  ctx.fill();
}

function strokeRoundRect(ctx, x, y, w, h, r, color, lineWidth = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  roundedPath(ctx, x, y, w, h, r);
  ctx.stroke();
}

function ellipse(ctx, cx, cy, rx, ry, color, rotation = 0) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, rotation, 0, Math.PI * 2);
  ctx.fill();
}

function strokeLine(ctx, x1, y1, x2, y2, color, lineWidth = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function strokeArc(ctx, cx, cy, rx, ry, start, end, color, lineWidth = 2, rotation = 0) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, rotation, start, end);
  ctx.stroke();
}

function fillPoly(ctx, points, color) {
  if (points.length === 0) return;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.fill();
}

function drawLooseDiamond(ctx, cx, cy, rx, ry, color) {
  fillPoly(ctx, [
    [cx, cy - ry],
    [cx + rx, cy],
    [cx, cy + ry],
    [cx - rx, cy],
  ], color);
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean.padEnd(6, '0').slice(0, 6);
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function mixHex(a, b, amount) {
  const ar = hexToRgb(a);
  const br = hexToRgb(b);
  const mix = (from, to) => Math.round(from + (to - from) * amount).toString(16).padStart(2, '0');
  return `#${mix(ar.r, br.r)}${mix(ar.g, br.g)}${mix(ar.b, br.b)}`;
}

function actorShadow(ctx, x, y, w, h, alpha = 0.28) {
  withAlpha(ctx, alpha, () => {
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h + 2, Math.max(7, w * 0.48), 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

function glowRect(ctx, x, y, w, h, color, alpha = 0.24) {
  withAlpha(ctx, alpha, () => {
    rect(ctx, x - 2, y - 2, w + 4, h + 4, color);
  });
}

function glowEllipse(ctx, cx, cy, rx, ry, color, alpha = 0.2) {
  withAlpha(ctx, alpha, () => {
    ellipse(ctx, cx, cy, rx, ry, color);
  });
}

function seededUnit(seed, salt = 0) {
  const value = Math.sin((seed + 1) * 91.17 + salt * 37.31) * 10000;
  return value - Math.floor(value);
}

function hashString(value) {
  const text = String(value ?? '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function roomStyle(room) {
  const seed = hashString(room?.id ?? 'room');
  const accents = ['#7af0ff', '#ffd166', '#d985ff', '#66f0a6', '#ff7c9a'];
  let accent = accents[seed % accents.length];
  if (room?.meta?.miniboss) accent = '#ff5c7a';
  else if (room?.meta?.checkpoint) accent = '#58d4ff';
  else if (room?.meta?.npc) accent = '#ffd166';
  else if (room?.meta?.cloneStart) accent = '#b7ff72';

  return {
    seed,
    accent,
    secondary: accents[(seed + 2) % accents.length],
    plate: mixHex('#171927', accent, 0.1),
    haze: mixHex('#111521', accent, 0.16),
  };
}

export function drawRoomAtmosphere(ctx, room, colors = COLORS) {
  const style = roomStyle(room);
  const t = nowSeconds();
  const gradient = ctx.createRadialGradient(ROOM_W * 0.52, ROOM_H * 0.35, 20, ROOM_W * 0.52, ROOM_H * 0.45, ROOM_W * 0.78);
  gradient.addColorStop(0, style.haze);
  gradient.addColorStop(0.45, colors.BG);
  gradient.addColorStop(1, '#05070d');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, ROOM_W, ROOM_H);

  withAlpha(ctx, 0.22, () => {
    const stripe = ctx.createLinearGradient(0, WALL_THICKNESS, ROOM_W, ROOM_H - WALL_THICKNESS);
    stripe.addColorStop(0, 'rgba(122, 240, 255, 0)');
    stripe.addColorStop(0.48, style.accent);
    stripe.addColorStop(1, 'rgba(122, 240, 255, 0)');
    ctx.fillStyle = stripe;
    for (let i = 0; i < 4; i += 1) {
      const y = WALL_THICKNESS + 38 + i * 62 + Math.sin(t * 0.45 + i + style.seed) * 3;
      ctx.fillRect(WALL_THICKNESS, y, ROOM_W - WALL_THICKNESS * 2, 1);
    }
  });

  withAlpha(ctx, 0.13, () => {
    ctx.strokeStyle = '#3a4058';
    ctx.lineWidth = 1;
    for (let x = WALL_THICKNESS + 10; x < ROOM_W - WALL_THICKNESS; x += 52) {
      const bend = Math.sin(t * 0.3 + x * 0.04 + style.seed) * 4;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, WALL_THICKNESS + 8);
      ctx.bezierCurveTo(x + bend, ROOM_H * 0.32, x - bend, ROOM_H * 0.68, x + 0.5, ROOM_H - WALL_THICKNESS - 8);
      ctx.stroke();
    }
    for (let y = WALL_THICKNESS + 24; y < ROOM_H - WALL_THICKNESS; y += 48) {
      ctx.beginPath();
      ctx.moveTo(WALL_THICKNESS + 8, y + 0.5);
      ctx.lineTo(ROOM_W - WALL_THICKNESS - 8, y + 0.5);
      ctx.stroke();
    }
  });

  withAlpha(ctx, 0.18, () => {
    ctx.fillStyle = '#05070d';
    for (let i = 0; i < 8; i += 1) {
      const w = 46 + seededUnit(style.seed, i + 10) * 90;
      const h = 20 + seededUnit(style.seed, i + 20) * 42;
      const x = WALL_THICKNESS + seededUnit(style.seed, i + 30) * (ROOM_W - WALL_THICKNESS * 2 - w);
      const y = WALL_THICKNESS + 12 + seededUnit(style.seed, i + 40) * (ROOM_H * 0.6);
      roundedPath(ctx, x, y, w, h, 2);
      ctx.fill();
      if (seededUnit(style.seed, i + 50) > 0.45) {
        rect(ctx, x + 6, y + 5, Math.max(12, w * 0.28), 1, style.accent);
      }
    }
  });

  withAlpha(ctx, 0.22, () => {
    for (let i = 0; i < 34; i += 1) {
      const drift = Math.sin(t * (0.4 + seededUnit(style.seed, i) * 0.8) + i) * 2.2;
      const x = WALL_THICKNESS + seededUnit(style.seed, i + 60) * (ROOM_W - WALL_THICKNESS * 2);
      const y = WALL_THICKNESS + seededUnit(style.seed, i + 90) * (ROOM_H - WALL_THICKNESS * 2);
      const size = seededUnit(style.seed, i + 120) > 0.82 ? 2 : 1;
      ctx.fillStyle = seededUnit(style.seed, i + 150) > 0.72 ? style.secondary : '#46506d';
      ctx.fillRect(Math.round(x + drift), Math.round(y), size, size);
    }
  });

  withAlpha(ctx, 0.24, () => {
    const fog = ctx.createLinearGradient(0, ROOM_H - 110, 0, ROOM_H);
    fog.addColorStop(0, 'rgba(5, 7, 13, 0)');
    fog.addColorStop(1, style.plate);
    ctx.fillStyle = fog;
    ctx.fillRect(0, ROOM_H - 110, ROOM_W, 110);
  });
}

export function drawSolidBlock(ctx, solid, colors = COLORS) {
  const isWall = !solid.kind;
  const isHill = solid.kind === 'hill';
  const base = isWall
    ? colors.WALL
    : isHill ? colors.HILL : solid.oneWay === false ? colors.SOLID_PLATFORM : colors.PLATFORM;
  const top = isWall
    ? '#54576f'
    : isHill ? colors.HILL_TOP : solid.oneWay === false ? colors.SOLID_PLATFORM_TOP : colors.PLATFORM_TOP;
  const bevel = Math.min(isWall ? 5 : 4, solid.h);
  const g = ctx.createLinearGradient(solid.x, solid.y, solid.x, solid.y + solid.h);
  g.addColorStop(0, mixHex(base, top, 0.5));
  g.addColorStop(0.18, base);
  g.addColorStop(1, mixHex(base, '#05070d', isWall ? 0.38 : 0.28));
  ctx.fillStyle = g;
  ctx.fillRect(Math.round(solid.x), Math.round(solid.y), Math.round(solid.w), Math.round(solid.h));
  rect(ctx, solid.x, solid.y, solid.w, bevel, top);

  withAlpha(ctx, isWall ? 0.2 : 0.24, () => {
    ctx.fillStyle = isWall ? '#161a28' : '#090b13';
    ctx.fillRect(solid.x, solid.y + solid.h - 2, solid.w, 2);
  });

  withAlpha(ctx, isWall ? 0.18 : 0.26, () => {
    ctx.fillStyle = isHill ? '#d2ffd2' : '#e9fbff';
    const step = isWall ? 34 : 24;
    const offset = Math.abs(Math.round(solid.x + solid.y)) % step;
    for (let x = solid.x + 6 - offset; x < solid.x + solid.w - 4; x += step) {
      const y = solid.y + Math.min(bevel + 2, solid.h - 2);
      ctx.fillRect(Math.round(x), Math.round(y), isWall ? 7 : 9, 1);
    }
  });

  if (isHill) {
    withAlpha(ctx, 0.18, () => {
      ctx.fillStyle = '#c9ffd0';
      for (let x = solid.x + 7; x < solid.x + solid.w - 6; x += 18) {
        ctx.fillRect(x, solid.y + 2, 5, 1);
      }
    });
  } else if (!isWall) {
    withAlpha(ctx, 0.34, () => {
      const shine = ctx.createLinearGradient(solid.x, solid.y, solid.x + solid.w, solid.y);
      shine.addColorStop(0, '#d9e4ff');
      shine.addColorStop(0.45, '#7af0ff');
      shine.addColorStop(1, 'rgba(122, 240, 255, 0)');
      ctx.fillStyle = shine;
      ctx.fillRect(solid.x + 4, solid.y + 1, Math.max(8, solid.w * 0.42), 1);
    });
    withAlpha(ctx, 0.16, () => {
      ctx.strokeStyle = '#05070d';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(solid.x + solid.w - 12, solid.y + 3);
      ctx.lineTo(solid.x + solid.w - 4, solid.y + solid.h - 2);
      ctx.stroke();
    });
  }
}

export function drawDoorEdge(ctx, x, y, w, h, color = COLORS.DOOR) {
  const t = nowSeconds();
  const horizontal = w >= h;
  glowRect(ctx, x, y, w, h, color, 0.28);
  rect(ctx, x, y, w, h, color);
  withAlpha(ctx, 0.72, () => {
    ctx.fillStyle = '#e9fbff';
    if (horizontal) {
      const scan = x + ((t * 48) % Math.max(1, w));
      ctx.fillRect(scan, y, Math.min(6, x + w - scan), h);
      strokeLine(ctx, x + 4, y + h + 5, x + w - 4, y + h + 5, color, 1.2);
    } else {
      const scan = y + ((t * 48) % Math.max(1, h));
      ctx.fillRect(x, scan, w, Math.min(6, y + h - scan));
      strokeLine(ctx, x + w + 5, y + 4, x + w + 5, y + h - 4, color, 1.2);
    }
  });
}

const PLAYER_ART = {
  cloak: '#282433',
  cloakMid: '#383145',
  cloakLight: '#6d6682',
  cloakDark: '#10121b',
  armor: '#151923',
  armorMid: '#252b38',
  armorLight: '#788196',
  leather: '#0b0e15',
  visor: '#62f4ff',
  visorCore: '#e8ffff',
  guitar: '#161c27',
  guitarPanel: '#2a3140',
  guitarEdge: '#c6d0df',
  amber: '#ffd166',
  poison: '#66f0a6',
  hurt: '#fff3f3',
  skin: '#d8a275',
};
const PLAYER_VISUAL_SCALE = 0.84;

function playerPose(player, t) {
  const moving = Math.abs(player.vx ?? 0) > 8;
  const crouch = player.isCrouching;
  const dash = (player.dashTimer ?? 0) > 0;
  const attacking = (player.attackTimer ?? 0) > 0;
  const hurt = (player.invulnTimer ?? 0) > 0;
  const airborne = !player.onGround;
  const slam = player.groundSlamActive || (player.groundSlamImpactTimer ?? 0) > 0;
  const run = player.isRunning && moving;
  const speed = run ? 22 : 14;
  const walkPhase = moving && player.onGround ? Math.sin(t * speed) : 0;
  const breath = Math.sin(t * 3.1) * 0.9;
  const hover = crouch ? 0 : airborne ? (player.vy < 0 ? -1.5 : 1.5) : breath;
  const attackAmount = attacking ? clamp((player.attackTimer ?? 0) / 0.13, 0, 1) : 0;
  const dir = player.attackDir ?? { x: player.facing, y: 0 };
  return {
    moving,
    crouch,
    dash,
    attacking,
    hurt,
    airborne,
    slam,
    run,
    rising: airborne && (player.vy ?? 0) < 0,
    falling: airborne && (player.vy ?? 0) >= 0,
    facing: player.facing >= 0 ? 1 : -1,
    walkPhase,
    breath,
    hover,
    attackAmount,
    attackDir: dir,
    lean: dash ? 0.18 : run ? 0.08 * Math.sign(player.vx || player.facing || 1) : 0,
    cloakLift: dash ? 9 : airborne ? 5 : Math.abs(walkPhase) * 2,
    glow: 0.68 + Math.sin(t * 4.7) * 0.18,
    trim: player.weaponLevel >= 5 ? PLAYER_ART.poison : PLAYER_ART.amber,
  };
}

function drawPlayerLocalFigure(ctx, pose, ghost = false) {
  const palette = ghost
    ? { ...PLAYER_ART, cloak: PLAYER_ART.visor, cloakMid: PLAYER_ART.visor, armor: '#d9fdff', armorMid: '#92f8ff', leather: '#50e9ff' }
    : PLAYER_ART;
  const alphaScale = ghost ? 0.44 : 1;
  const crouchY = pose.crouch ? 8 : 0;
  const squashX = pose.crouch ? 1.14 : pose.dash ? 1.18 : 1;
  const squashY = pose.crouch ? 0.75 : pose.dash ? 0.9 : pose.rising ? 1.04 : pose.falling ? 0.97 : 1;

  ctx.save();
  ctx.translate(pose.lean * 14, pose.hover + crouchY);
  ctx.scale(squashX, squashY);

  drawPlayerBackCloak(ctx, pose, palette, alphaScale);
  if (!pose.attacking) {
    drawSignalSword(ctx, 16, -18, pose.crouch ? 20 : 25, pose.trim, PLAYER_ART.visorCore, pose.crouch ? 1.38 : 1.05 + pose.walkPhase * 0.03, alphaScale);
  }
  drawPlayerLegs(ctx, pose, palette, alphaScale);
  drawPlayerTorso(ctx, pose, palette, alphaScale);
  drawPlayerArms(ctx, pose, palette, alphaScale);
  drawPlayerHood(ctx, pose, palette, alphaScale);
  drawPlayerForegroundTears(ctx, pose, palette, alphaScale);

  if (pose.slam) drawPlayerSlamCharge(ctx, pose);
  if (pose.hurt && !ghost) drawPlayerHurtGlint(ctx);

  ctx.restore();
}

function drawPlayerBackCloak(ctx, pose, palette, alphaScale) {
  const lift = pose.cloakLift;
  const sway = pose.walkPhase * 1.8;
  withAlpha(ctx, alphaScale, () => {
    ctx.fillStyle = palette.cloakDark;
    ctx.beginPath();
    ctx.moveTo(-13, -37);
    ctx.bezierCurveTo(-27, -33, -31, -18, -25, -5 - lift * 0.25);
    ctx.lineTo(-17, -8 - lift);
    ctx.lineTo(-12, -2 - lift * 0.4);
    ctx.lineTo(-7, -8 + sway);
    ctx.lineTo(-2, -1);
    ctx.lineTo(4, -7 - sway);
    ctx.lineTo(9, -2 - lift * 0.3);
    ctx.lineTo(18, -8 - lift);
    ctx.bezierCurveTo(26, -16, 24, -31, 12, -37);
    ctx.quadraticCurveTo(0, -31, -13, -37);
    ctx.fill();

    ctx.fillStyle = palette.cloak;
    ctx.beginPath();
    ctx.moveTo(-12, -36);
    ctx.bezierCurveTo(-21, -30, -24, -15, -19, -5 - lift * 0.22);
    ctx.lineTo(-13, -6 - lift * 0.85);
    ctx.lineTo(-8, -2 - lift * 0.25);
    ctx.lineTo(-4, -8 + sway * 0.6);
    ctx.lineTo(1, -3);
    ctx.lineTo(6, -8 - sway * 0.55);
    ctx.lineTo(12, -4 - lift * 0.45);
    ctx.lineTo(18, -8 - lift * 0.85);
    ctx.bezierCurveTo(22, -18, 20, -31, 11, -36);
    ctx.quadraticCurveTo(0, -29, -12, -36);
    ctx.fill();
  });
}

function drawPlayerLegs(ctx, pose, palette, alphaScale) {
  const s = pose.walkPhase;
  const airborneTuck = pose.airborne ? (pose.rising ? -2 : 1) : 0;
  withAlpha(ctx, alphaScale, () => {
    if (pose.crouch) {
      strokeLine(ctx, -8, -15, -16, -5, palette.armorLight, 4.2);
      strokeLine(ctx, 7, -15, 15, -5, palette.armorLight, 4.2);
      roundRect(ctx, -21, -5, 15, 6, 2, palette.leather);
      roundRect(ctx, 7, -5, 16, 6, 2, palette.leather);
      return;
    }

    strokeLine(ctx, -5, -19, -8 + s * 3, -8 + Math.max(0, s) * 2 + airborneTuck, palette.armorLight, 4.4);
    strokeLine(ctx, 5, -19, 8 - s * 3, -8 + Math.max(0, -s) * 2 - airborneTuck, palette.armorLight, 4.4);
    strokeLine(ctx, -5, -18, -8 + s * 3, -8 + Math.max(0, s) * 2 + airborneTuck, palette.armor, 2.4);
    strokeLine(ctx, 5, -18, 8 - s * 3, -8 + Math.max(0, -s) * 2 - airborneTuck, palette.armor, 2.4);

    const leftFootX = -14 + s * 3;
    const rightFootX = 4 - s * 3;
    roundRect(ctx, leftFootX, -4 + Math.max(0, s) * 1.2, 16, 5, 2, palette.leather);
    roundRect(ctx, rightFootX, -4 + Math.max(0, -s) * 1.2, 16, 5, 2, palette.leather);
    rect(ctx, leftFootX + 2, -4 + Math.max(0, s) * 1.2, 8, 1.2, palette.armorLight);
    rect(ctx, rightFootX + 2, -4 + Math.max(0, -s) * 1.2, 8, 1.2, palette.armorLight);
  });
}

function drawPlayerTorso(ctx, pose, palette, alphaScale) {
  const y = pose.crouch ? -31 : -36;
  withAlpha(ctx, alphaScale, () => {
    roundRect(ctx, -12, y, 24, 22, 5, palette.armor);
    roundRect(ctx, -9, y + 4, 18, 15, 4, palette.armorMid);
    strokeLine(ctx, -13, y + 2, 11, y + 18, '#080b12', 2.8);
    strokeLine(ctx, -12, y + 1, 10, y + 17, palette.cloakLight, 1);
    diamond(ctx, 0, y + 12, 4.2, palette.visor);
    glowEllipse(ctx, 0, y + 12, 7, 5, palette.visor, 0.18);

    strokeLine(ctx, -14, y + 6, -21, y + 13, palette.cloakMid, 5);
    strokeLine(ctx, 14, y + 6, 21, y + 13, palette.cloakMid, 5);
    strokeLine(ctx, -14, y + 6, -20, y + 12, palette.cloakLight, 1.2);
    strokeLine(ctx, 14, y + 6, 20, y + 12, palette.cloakLight, 1.2);
  });
}

function drawPlayerArms(ctx, pose, palette, alphaScale) {
  const torsoY = pose.crouch ? -31 : -36;
  withAlpha(ctx, alphaScale, () => {
    if (pose.attacking) {
      if (pose.attackDir.y < 0) {
        strokeLine(ctx, -6, torsoY + 13, 1, torsoY - 6, palette.armorLight, 4);
        strokeLine(ctx, 8, torsoY + 12, 13, torsoY - 3, palette.trim, 3);
      } else if (pose.attackDir.y > 0) {
        strokeLine(ctx, -7, torsoY + 12, -4, torsoY + 28, palette.armorLight, 4);
        strokeLine(ctx, 7, torsoY + 12, 6, torsoY + 28, palette.trim, 3);
      } else {
        strokeLine(ctx, -8, torsoY + 12, 9, torsoY + 8, palette.armorLight, 4);
        strokeLine(ctx, 5, torsoY + 12, 20, torsoY + 10, palette.trim, 3);
      }
      return;
    }

    strokeLine(ctx, -9, torsoY + 12, -17, torsoY + 22 + pose.walkPhase, palette.armorLight, 3.2);
    ellipse(ctx, -18, torsoY + 24 + pose.walkPhase, 3.2, 3.7, palette.skin);
    strokeLine(ctx, 9, torsoY + 10, 18, torsoY + 16 - pose.walkPhase, palette.trim, 3.3);
    ellipse(ctx, 19, torsoY + 17 - pose.walkPhase, 3.3, 3.8, palette.skin);
  });
}

function drawPlayerHood(ctx, pose, palette, alphaScale) {
  const hoodY = pose.crouch ? -46 : -51;
  const breathing = pose.crouch ? 0 : pose.breath * 0.22;
  withAlpha(ctx, alphaScale, () => {
    glowEllipse(ctx, 0, hoodY + 19, 18, 9, palette.visor, 0.12 * pose.glow);

    ctx.fillStyle = palette.cloakDark;
    ctx.beginPath();
    ctx.moveTo(-2, hoodY);
    ctx.bezierCurveTo(-19, hoodY + 1, -29, hoodY + 16, -20, hoodY + 30);
    ctx.quadraticCurveTo(-8, hoodY + 38, 12, hoodY + 30);
    ctx.bezierCurveTo(25, hoodY + 21, 21, hoodY + 3, -2, hoodY);
    ctx.fill();

    ctx.fillStyle = palette.cloak;
    ctx.beginPath();
    ctx.moveTo(-1, hoodY + breathing);
    ctx.bezierCurveTo(-17, hoodY + 2, -25, hoodY + 14, -18, hoodY + 27);
    ctx.lineTo(-10, hoodY + 24);
    ctx.lineTo(-5, hoodY + 29);
    ctx.lineTo(2, hoodY + 25);
    ctx.lineTo(8, hoodY + 30);
    ctx.lineTo(16, hoodY + 24);
    ctx.bezierCurveTo(20, hoodY + 13, 17, hoodY + 3, -1, hoodY + breathing);
    ctx.fill();

    ellipse(ctx, 0, hoodY + 19, 12.8, 10, '#06080d');
    roundRect(ctx, -10.5, hoodY + 16, 21, 5.6, 2.8, palette.visor);
    withAlpha(ctx, 0.72, () => {
      rect(ctx, -2, hoodY + 15.2, 4, 7, palette.visorCore);
      rect(ctx, 9, hoodY + 16.3, 4, 5, palette.visorCore);
    });
    strokeLine(ctx, -8, hoodY + 25, -5, hoodY + 32, palette.armorLight, 1.5);
    strokeLine(ctx, 8, hoodY + 25, 5, hoodY + 32, palette.armorLight, 1.5);

    strokeLine(ctx, 13, hoodY + 9, 16, hoodY - 6, palette.armorLight, 1.8);
    ellipse(ctx, 16, hoodY + 9, 3.4, 5.8, palette.armorMid, 0.1);
    ellipse(ctx, 16.2, hoodY + 8.3, 1.6, 3.4, palette.visor);
    ellipse(ctx, 16.8, hoodY - 6.5, 1.5, 2.4, palette.visor);
  });
}

function drawPlayerForegroundTears(ctx, pose, palette, alphaScale) {
  const y = pose.crouch ? -29 : -35;
  withAlpha(ctx, alphaScale * 0.92, () => {
    ctx.fillStyle = palette.cloakMid;
    ctx.beginPath();
    ctx.moveTo(-17, y);
    ctx.bezierCurveTo(-18, y + 11, -14, y + 24, -8, y + 30);
    ctx.lineTo(-4, y + 23);
    ctx.lineTo(1, y + 31);
    ctx.lineTo(6, y + 24);
    ctx.lineTo(12, y + 28);
    ctx.bezierCurveTo(18, y + 13, 15, y + 4, 10, y);
    ctx.quadraticCurveTo(0, y + 7, -17, y);
    ctx.fill();

    strokeLine(ctx, -11, y + 6, -4, y + 28, palette.cloakLight, 1);
    strokeLine(ctx, 8, y + 5, 3, y + 25, palette.cloakLight, 1);
  });
}

function drawPlayerGuitar(ctx, config) {
  const {
    x = 0,
    y = 0,
    angle = 0,
    scale = 1,
    glow = 1,
    trim = PLAYER_ART.amber,
    alpha = 1,
  } = config;

  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);

  withAlpha(ctx, 0.2 * glow, () => {
    ctx.fillStyle = PLAYER_ART.visor;
    ctx.beginPath();
    ctx.ellipse(0, 7, 16, 19, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  strokeLine(ctx, 0, -32, 0, 9, '#070910', 6);
  strokeLine(ctx, 0, -31, 0, 9, PLAYER_ART.guitarEdge, 1.4);
  strokeLine(ctx, -3, -26, 3, -26, '#495266', 0.8);
  strokeLine(ctx, -3, -19, 3, -19, '#495266', 0.8);
  strokeLine(ctx, -3, -12, 3, -12, '#495266', 0.8);
  strokeLine(ctx, -3, -5, 3, -5, '#495266', 0.8);

  ctx.fillStyle = PLAYER_ART.guitar;
  ctx.beginPath();
  ctx.moveTo(-12, 1);
  ctx.lineTo(-3, -5);
  ctx.lineTo(6, -2);
  ctx.lineTo(15, 8);
  ctx.lineTo(8, 17);
  ctx.lineTo(-9, 16);
  ctx.lineTo(-17, 8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = PLAYER_ART.guitarEdge;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = PLAYER_ART.guitarPanel;
  ctx.beginPath();
  ctx.moveTo(-8, 3);
  ctx.lineTo(1, 0);
  ctx.lineTo(9, 8);
  ctx.lineTo(4, 13);
  ctx.lineTo(-8, 12);
  ctx.closePath();
  ctx.fill();
  roundRect(ctx, -3.5, 3, 7, 14, 2, PLAYER_ART.visor);
  withAlpha(ctx, 0.55 * glow, () => {
    glowRect(ctx, -4, 2, 8, 15, PLAYER_ART.visor, 0.55);
  });

  ellipse(ctx, 8, 11, 1.7, 1.7, trim);
  ellipse(ctx, 12, 9, 1.5, 1.5, '#e8eaf2');
  ellipse(ctx, 11, 14, 1.5, 1.5, '#e8eaf2');

  ctx.fillStyle = '#080b12';
  ctx.beginPath();
  ctx.moveTo(-6, -35);
  ctx.lineTo(7, -34);
  ctx.lineTo(10, -27);
  ctx.lineTo(1, -29);
  ctx.lineTo(-7, -27);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = PLAYER_ART.guitarEdge;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ellipse(ctx, -5, -30, 1.2, 1.2, PLAYER_ART.visor);
  ellipse(ctx, 0, -31, 1.2, 1.2, PLAYER_ART.visor);
  ellipse(ctx, 5, -30, 1.2, 1.2, PLAYER_ART.visor);

  ctx.restore();
}

function drawPlayerSlamCharge(ctx, pose) {
  withAlpha(ctx, 0.62, () => {
    strokeLine(ctx, -12, -55, 12, -55, COLORS.SUPER_ATTACK_CORE, 2);
    strokeLine(ctx, -7, -61, 7, -61, PLAYER_ART.visor, 2.2);
    strokeLine(ctx, -2, -67, 2, -67, PLAYER_ART.visor, 1.6);
  });
}

function drawPlayerHurtGlint(ctx) {
  withAlpha(ctx, 0.62, () => {
    strokeLine(ctx, -17, -45, 17, -10, PLAYER_ART.hurt, 1.5);
    strokeLine(ctx, 15, -43, -15, -9, PLAYER_ART.hurt, 1.2);
  });
}

function drawPlayerSignalFlecks(ctx, pose, t) {
  if (pose.crouch) return;
  const intensity = pose.dash ? 0.56 : pose.run ? 0.34 : 0.2;
  withAlpha(ctx, intensity, () => {
    ctx.fillStyle = PLAYER_ART.visor;
    for (let i = 0; i < 5; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (16 + i * 2) + Math.sin(t * 2.4 + i) * 2;
      const y = -44 + i * 7 + Math.cos(t * 3 + i) * 1.5;
      ctx.fillRect(Math.round(x), Math.round(y), i === 0 ? 2 : 1, i > 2 ? 2 : 1);
    }
  });
  if (pose.run || pose.dash) {
    withAlpha(ctx, pose.dash ? 0.48 : 0.24, () => {
      strokeLine(ctx, -24, -17, -38, -13 + pose.walkPhase * 2, PLAYER_ART.visor, 1.4);
      strokeLine(ctx, -18, -8, -32, -4 - pose.walkPhase * 2, pose.trim, 1.1);
    });
  }
}

function drawSonicArc(ctx, cx, cy, rx, ry, start, end, color, core, alpha) {
  withAlpha(ctx, alpha, () => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, start, end);
    ctx.stroke();
  });
  withAlpha(ctx, 0.75, () => {
    ctx.strokeStyle = core;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.9, ry * 0.88, 0, start, end);
    ctx.stroke();
  });
}

const SIGNAL_ART = {
  void: '#060810',
  void2: '#0d101a',
  shell: '#171b28',
  shell2: '#232738',
  glass: '#93f7ff',
  glassCore: '#f1feff',
  amber: '#ffd166',
  wound: '#fff3f3',
  green: '#91ff76',
};

const CAMOUFLAGE_PLAYER_ART = {
  accent: '#66f0a6',
  core: '#efffe8',
  secondary: '#91ff76',
  trim: '#66f0a6',
  shell: '#12331f',
  shell2: '#205b35',
  void: '#041108',
  void2: '#082015',
  limb: '#baf7c6',
};

function drawSignalShard(ctx, cx, cy, size, color, rotation = 0, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  fillPoly(ctx, [
    [0, -size],
    [size * 0.5, -size * 0.18],
    [size * 0.22, size],
    [-size * 0.46, size * 0.42],
    [-size * 0.28, -size * 0.48],
  ], color);
  ctx.restore();
}

function drawSignalSword(ctx, cx, cy, length, color, core, rotation = 0, alpha = 1) {
  const blade = Math.max(14, length);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  withAlpha(ctx, 0.32, () => {
    strokeLine(ctx, 0, 4, 0, -blade, color, 7);
  });
  fillPoly(ctx, [
    [0, -blade - 4],
    [4.2, -blade + 4],
    [2.1, 1],
    [-2.1, 1],
    [-4.2, -blade + 4],
  ], color);
  fillPoly(ctx, [
    [0, -blade - 1],
    [1.6, -blade + 5],
    [0.8, -2],
    [-0.8, -2],
    [-1.6, -blade + 5],
  ], core);
  strokeLine(ctx, -8, 2, 8, 2, color, 3.2);
  strokeLine(ctx, -5, 2, 5, 2, core, 1.1);
  strokeLine(ctx, 0, 3, 0, 11, '#10131d', 4);
  strokeLine(ctx, 0, 3, 0, 10, '#c7d2ea', 1.2);
  diamond(ctx, 0, 13, 2.8, color);
  ctx.restore();
}

function drawSignalMask(ctx, cx, cy, w, h, accent, core, blink = 0, options = {}) {
  glowEllipse(ctx, cx, cy, w * 0.64, h * 0.54, accent, 0.15);
  ellipse(ctx, cx, cy, w * 0.5, h * 0.5, options.void ?? SIGNAL_ART.void);
  strokeArc(ctx, cx, cy, w * 0.53, h * 0.53, Math.PI * 0.08, Math.PI * 0.92, mixHex(accent, '#ffffff', 0.35), 1.3);
  strokeArc(ctx, cx, cy, w * 0.53, h * 0.53, Math.PI * 1.08, Math.PI * 1.92, '#32384f', 1.1);
  const eyeH = Math.max(2, h * (0.16 - blink * 0.1));
  roundRect(ctx, cx - w * 0.28, cy - eyeH / 2, w * 0.56, eyeH, eyeH / 2, accent);
  rect(ctx, cx - 1, cy - eyeH * 0.9, 2, eyeH * 1.8, core);
}

function drawSignalPlayerLocal(ctx, pose, ghost = false, options = {}) {
  const t = nowSeconds();
  const accent = ghost ? (options.ghostAccent ?? '#9bf6ff') : (options.accent ?? SIGNAL_ART.glass);
  const core = ghost ? (options.ghostCore ?? '#ffffff') : (options.core ?? SIGNAL_ART.glassCore);
  const voidColor = options.void ?? SIGNAL_ART.void;
  const void2 = options.void2 ?? SIGNAL_ART.void2;
  const shell = options.shell ?? SIGNAL_ART.shell;
  const shell2 = options.shell2 ?? SIGNAL_ART.shell2;
  const trim = pose.trim ?? options.trim ?? SIGNAL_ART.amber;
  const secondary = options.secondary ?? SIGNAL_ART.amber;
  const limb = options.limb ?? '#bac7df';
  const alpha = ghost ? (options.ghostAlpha ?? 0.42) : (options.alpha ?? 1);
  const crouch = pose.crouch ? 6 : 0;
  const squashX = pose.crouch ? 1.18 : pose.dash ? 1.22 : 1;
  const squashY = pose.crouch ? 0.72 : pose.dash ? 0.88 : 1;
  const floatY = pose.hover + crouch;
  const stride = pose.walkPhase;
  const pulse = 0.7 + Math.sin(t * 4.2) * 0.18;

  ctx.save();
  ctx.globalAlpha *= alpha;
  if (pose.crouch) {
    const crouchPulse = 0.74 + Math.sin(t * 4.1) * 0.16;
    ctx.translate(pose.lean * 5, pose.hover + 2);

    withAlpha(ctx, 0.18 + crouchPulse * 0.1, () => {
      strokeArc(ctx, 0, -17, 25, 10, Math.PI * 0.05, Math.PI * 1.95, accent, 1.4);
      strokeArc(ctx, 0, -15, 17, 7, Math.PI * 1.08, Math.PI * 1.92, secondary, 1.1);
    });

    withAlpha(ctx, 0.92, () => {
      ctx.fillStyle = void2;
      ctx.beginPath();
      ctx.moveTo(-18, -24);
      ctx.bezierCurveTo(-22, -17, -18, -8, -8, -5);
      ctx.lineTo(0, -1);
      ctx.lineTo(9, -5);
      ctx.bezierCurveTo(19, -9, 21, -19, 13, -25);
      ctx.quadraticCurveTo(0, -30, -18, -24);
      ctx.fill();

      roundRect(ctx, -15, -22, 30, 15, 6, shell);
      roundRect(ctx, -10, -17, 20, 11, 4, shell2);
      drawLooseDiamond(ctx, 0, -11, 4.6, 5.8, trim);
    });

    drawSignalMask(ctx, 0, -26, 24, 15, accent, core, 0.16, { void: voidColor });
    withAlpha(ctx, 0.86, () => {
      strokeLine(ctx, -12, -20, -22, -8, limb, 2.6);
      strokeLine(ctx, 12, -20, 22, -8, trim, 2.6);
      roundRect(ctx, -21, -4, 16, 4, 2, voidColor);
      roundRect(ctx, 5, -4, 16, 4, 2, voidColor);
    });

    if (options.corrupted && !ghost) {
      withAlpha(ctx, 0.72, () => {
        strokeLine(ctx, -11, -34, -19, -43, accent, 1.2);
        strokeLine(ctx, 11, -34, 19, -43, accent, 1.2);
        drawSignalShard(ctx, -20, -45, 3.5, core, -0.2);
        drawSignalShard(ctx, 20, -45, 3.5, core, 0.2);
        strokeLine(ctx, -13, -27, 13, -12, accent, 0.9);
      });
    }

    ctx.restore();
    return;
  }

  ctx.translate(pose.lean * 12, floatY);
  ctx.scale(squashX, squashY);

  withAlpha(ctx, 0.2 + pulse * 0.12, () => {
    strokeArc(ctx, 0, -28, 24, 18, Math.PI * 0.08, Math.PI * 1.88, accent, 1.3, Math.sin(t * 1.1) * 0.18);
    strokeArc(ctx, 1, -28, 16, 11, Math.PI * 1.1, Math.PI * 2.05, secondary, 1.1, -Math.sin(t * 0.9) * 0.22);
  });

  withAlpha(ctx, 0.88, () => {
    ctx.fillStyle = void2;
    ctx.beginPath();
    ctx.moveTo(-2, -49);
    ctx.bezierCurveTo(-18, -46, -24, -34, -19, -22);
    ctx.bezierCurveTo(-14, -10, -9, -4, -2, -1);
    ctx.bezierCurveTo(7, -7, 16, -13, 18, -25);
    ctx.bezierCurveTo(21, -39, 12, -49, -2, -49);
    ctx.fill();

    ctx.fillStyle = shell;
    ctx.beginPath();
    ctx.moveTo(-9, -43);
    ctx.bezierCurveTo(-18, -36, -17, -18, -9, -8);
    ctx.lineTo(-2, -2);
    ctx.lineTo(4, -10);
    ctx.lineTo(13, -7);
    ctx.bezierCurveTo(15, -20, 12, -36, 3, -44);
    ctx.quadraticCurveTo(-2, -39, -9, -43);
    ctx.fill();
  });

  drawSignalMask(ctx, 0, -34, 25, 17, accent, core, pose.hurt ? 0.65 : 0, { void: voidColor });
  if (!options.corrupted && !ghost) {
    withAlpha(ctx, 0.86, () => {
      strokeLine(ctx, -7, -44, -13, -51, secondary, 1.15);
      strokeLine(ctx, 7, -44, 13, -51, secondary, 1.15);
      diamond(ctx, -14, -52, 1.8, secondary);
      diamond(ctx, 14, -52, 1.8, secondary);
    });
  }
  withAlpha(ctx, 0.9, () => {
    roundRect(ctx, -10, -24, 20, 17, 5, shell2);
    drawLooseDiamond(ctx, 0, -15, 4.6, 6.5, trim);
    strokeLine(ctx, -8, -23, 7, -8, voidColor, 2);
    strokeLine(ctx, -7, -23, 6, -8, '#6c738d', 0.9);
  });

  withAlpha(ctx, 0.9, () => {
    strokeLine(ctx, -7, -8, -13 + stride * 2, -1 + Math.max(0, stride) * 1.4, limb, 2.8);
    strokeLine(ctx, 7, -8, 13 - stride * 2, -1 + Math.max(0, -stride) * 1.4, limb, 2.8);
    roundRect(ctx, -17 + stride * 2, -2, 12, 4, 2, voidColor);
    roundRect(ctx, 5 - stride * 2, -2, 12, 4, 2, voidColor);
  });

  const armLift = pose.attacking ? -5 : 0;
  strokeLine(ctx, -11, -21, -21, -14 + stride, '#aeb8d0', 2.4);
  strokeLine(ctx, 11, -21, 22, -18 - stride + armLift, trim, 2.4);
  if (!pose.attacking) {
    drawSignalSword(ctx, 27, -18 - stride, 19, trim, core, 1.1 + Math.sin(t * 5) * 0.08, 0.95);
  }

  if (options.corrupted && !ghost) {
    withAlpha(ctx, 0.76, () => {
      strokeLine(ctx, -12, -45, -22, -55, accent, 1.4);
      strokeLine(ctx, 10, -44, 18, -54, accent, 1.4);
      drawSignalShard(ctx, -23, -57, 4, core, -0.35 + Math.sin(t * 3) * 0.15);
      drawSignalShard(ctx, 19, -56, 4, core, 0.35 + Math.cos(t * 3) * 0.15);
      strokeLine(ctx, -16, -29, 16, -12, mixHex(accent, '#ffffff', 0.2), 0.9);
      strokeLine(ctx, 13, -37, -14, -18, accent, 0.9);
    });
  }

  if (pose.dash || pose.run) {
    withAlpha(ctx, pose.dash ? 0.48 : 0.28, () => {
      strokeLine(ctx, -17, -29, -34, -25 + stride * 2, accent, 1.4);
      strokeLine(ctx, -12, -16, -30, -10 - stride * 2, secondary, 1.1);
    });
  }

  if (pose.slam) {
    withAlpha(ctx, 0.65, () => {
      strokeLine(ctx, -12, -57, 12, -57, COLORS.SUPER_ATTACK_CORE, 2);
      drawSignalShard(ctx, 0, -65, 5, accent, Math.PI * 0.25);
    });
  }

  if (pose.hurt && !ghost) {
    withAlpha(ctx, 0.75, () => {
      strokeLine(ctx, -17, -45, 16, -8, SIGNAL_ART.wound, 1.5);
      strokeLine(ctx, 16, -42, -14, -11, SIGNAL_ART.wound, 1.2);
    });
  }

  ctx.restore();
}

export function drawPlayerSprite(ctx, player, x, y, options = {}) {
  const alpha = options.alpha ?? 1;
  const t = nowSeconds();
  const pose = playerPose(player, t);
  const cx = x + player.w / 2;
  const feetY = y + player.h;
  const camouflaged = options.camouflaged === true;
  const spriteOptions = camouflaged ? CAMOUFLAGE_PLAYER_ART : {};

  ctx.save();
  ctx.globalAlpha *= alpha;
  if (!pose.crouch) {
    actorShadow(ctx, x - 3, y, player.w + 6, player.h, pose.dash ? 0.14 : 0.26);
  }

  if (pose.dash) {
    for (let i = 1; i <= 4; i += 1) {
      ctx.save();
      ctx.globalAlpha *= 0.2 / i;
      ctx.translate(cx - pose.facing * i * 10, feetY);
      ctx.scale(pose.facing * PLAYER_VISUAL_SCALE, PLAYER_VISUAL_SCALE);
      drawSignalPlayerLocal(ctx, pose, true, spriteOptions);
      ctx.restore();
    }
  }

  ctx.translate(cx, feetY);
  ctx.scale(pose.facing * PLAYER_VISUAL_SCALE, PLAYER_VISUAL_SCALE);
  drawSignalPlayerLocal(ctx, pose, false, spriteOptions);
  if (camouflaged) {
    withAlpha(ctx, 0.5 + Math.sin(t * 6) * 0.12, () => {
      strokeArc(ctx, 0, -28, 28, 22, Math.PI * 0.12, Math.PI * 1.88, CAMOUFLAGE_PLAYER_ART.accent, 1.2);
    });
  }
  drawPlayerSignalFlecks(ctx, pose, t);
  ctx.restore();
}

export function drawPlayerAttack(ctx, attack, player) {
  if (!attack) return;
  const dir = attack.direction ?? player.attackDir ?? { x: player.facing, y: 0 };
  const poison = (attack.poisonDuration ?? 0) > 0;
  const core = poison ? '#d8ffca' : '#e9fbff';
  const trim = poison ? PLAYER_ART.poison : PLAYER_ART.amber;
  const cx = attack.x + attack.w / 2;
  const cy = attack.y + attack.h / 2;

  ctx.save();

  if (dir.y !== 0) {
    const up = dir.y < 0;
    const baseY = up ? attack.y + attack.h : attack.y;
    const length = Math.max(30, attack.h * 0.78);
    drawSignalSword(ctx, cx, baseY - dir.y * 4, length, trim, core, up ? 0 : Math.PI, 0.98);
  } else {
    const facing = dir.x >= 0 ? 1 : -1;
    const baseX = facing > 0 ? attack.x : attack.x + attack.w;
    const length = Math.max(32, attack.w * 0.82);
    ctx.save();
    ctx.translate(baseX + facing * 6, cy + 1);
    ctx.scale(facing, 1);
    drawSignalSword(ctx, 0, 0, length, trim, core, Math.PI / 2, 0.98);
    ctx.restore();
  }

  ctx.restore();
}

export function drawGroundSlamWave(ctx, slam) {
  if (!slam) return;
  const cx = slam.x + slam.w / 2;
  const cy = slam.y + slam.h * 0.62;
  ctx.save();
  withAlpha(ctx, 0.3, () => {
    ctx.fillStyle = COLORS.STOP_FIELD;
    ctx.beginPath();
    ctx.ellipse(cx, cy, slam.w / 2, slam.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  withAlpha(ctx, 0.78, () => {
    ctx.strokeStyle = COLORS.SUPER_ATTACK_CORE;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(cx, cy, slam.w / 2 - 4, slam.h / 2 - 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.strokeStyle = COLORS.RAIN_SPEAR;
  ctx.lineWidth = 1.2;
  for (let i = -2; i <= 2; i += 1) {
    ctx.beginPath();
    ctx.moveTo(cx + i * 14 - 8, cy + 1);
    ctx.lineTo(cx + i * 14 + 7, cy + 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + i * 14 + 8, cy + 1);
    ctx.lineTo(cx + i * 14 - 7, cy + 7);
    ctx.stroke();
  }
  withAlpha(ctx, 0.32, () => {
    strokeLine(ctx, cx - 34, cy - 4, cx + 34, cy - 4, PLAYER_ART.visor, 2);
    strokeLine(ctx, cx - 22, cy - 11, cx + 22, cy - 11, PLAYER_ART.amber, 1.4);
  });
  ctx.restore();
}

function enemyAccent(enemy) {
  if (enemy.type !== 'miniboss') {
    return {
      walker: COLORS.ENEMY_WALKER,
      flyer: COLORS.ENEMY_FLYER,
      shooter: COLORS.ENEMY_SHOOTER,
      charger: COLORS.ENEMY_CHARGER,
      clone: COLORS.ENEMY_CLONE,
    }[enemy.type] ?? COLORS.MINIBOSS;
  }

  const palette = {
    skimmer: '#7ce7ff',
    warden: '#c992ff',
    charger: '#ff5570',
    sentinel: '#ff9770',
    orbiter: '#ffd166',
    architect: '#7af0ff',
    mirage: '#d985ff',
    magnetar: '#72e4ff',
    threader: '#66f0a6',
    bellows: '#f0f3ff',
    rainmaker: '#ffd166',
    phase: '#d985ff',
    sawbloom: '#ffbd68',
    burrower: '#73b27c',
    ricochet: '#fff4a6',
    harpoon: '#ff7c9a',
    chronos: '#b296ff',
    prism: '#9bf6ff',
    sonar: '#fff4a6',
    lockjaw: '#ff9770',
  };
  return palette[enemy.archetype] ?? COLORS.MINIBOSS;
}

function drawMinibossBody(ctx, enemy, x, y, accent, core) {
  const t = nowSeconds();
  const cx = x + enemy.w / 2;
  const feetY = y + enemy.h;
  const breath = Math.sin(t * 2.2 + enemy.id) * 1.2;
  const dir = enemy.direction >= 0 ? 1 : -1;

  glowEllipse(ctx, cx, y + enemy.h * 0.55, enemy.w * 0.55, enemy.h * 0.48, accent, 0.15);
  ctx.fillStyle = '#151823';
  ctx.beginPath();
  ctx.moveTo(cx, y + 1 + breath);
  ctx.bezierCurveTo(x + 4, y + 6, x + 3, y + enemy.h * 0.28, cx - enemy.w * 0.34, y + enemy.h * 0.42);
  ctx.lineTo(x + 5, feetY - 5);
  ctx.quadraticCurveTo(cx, feetY - 1, x + enemy.w - 5, feetY - 5);
  ctx.lineTo(cx + enemy.w * 0.34, y + enemy.h * 0.42);
  ctx.bezierCurveTo(x + enemy.w - 3, y + enemy.h * 0.28, x + enemy.w - 4, y + 6, cx, y + 1 + breath);
  ctx.fill();

  ctx.fillStyle = '#2a3043';
  ctx.beginPath();
  ctx.moveTo(cx - enemy.w * 0.3, y + enemy.h * 0.34);
  ctx.bezierCurveTo(cx - enemy.w * 0.42, y + enemy.h * 0.56, cx - enemy.w * 0.3, feetY - 5, cx, feetY - 7);
  ctx.bezierCurveTo(cx + enemy.w * 0.3, feetY - 5, cx + enemy.w * 0.42, y + enemy.h * 0.56, cx + enemy.w * 0.3, y + enemy.h * 0.34);
  ctx.quadraticCurveTo(cx, y + enemy.h * 0.45, cx - enemy.w * 0.3, y + enemy.h * 0.34);
  ctx.fill();

  ellipse(ctx, cx, y + enemy.h * 0.23 + breath, enemy.w * 0.22, enemy.h * 0.17, '#111421');
  strokeLine(ctx, cx - enemy.w * 0.11, y + enemy.h * 0.23 + breath, cx + enemy.w * 0.12, y + enemy.h * 0.23 + breath, accent, 2.2);
  strokeLine(ctx, cx - enemy.w * 0.22, y + enemy.h * 0.48, cx - dir * enemy.w * 0.55, y + enemy.h * 0.6, accent, 3.4);
  strokeLine(ctx, cx + enemy.w * 0.22, y + enemy.h * 0.48, cx + dir * enemy.w * 0.45, y + enemy.h * 0.55, accent, 3.4);
  diamond(ctx, cx, y + enemy.h * 0.5, Math.max(5, enemy.w * 0.13), core);
  strokeLine(ctx, x + 7, feetY - 1, x + enemy.w * 0.43, feetY - 1, '#080b12', 2.5);
  strokeLine(ctx, x + enemy.w * 0.57, feetY - 1, x + enemy.w - 7, feetY - 1, '#080b12', 2.5);
}

function drawOrbitNodes(ctx, cx, cy, count, radius, accent, core, phase = 0) {
  for (let i = 0; i < count; i += 1) {
    const a = phase + (Math.PI * 2 * i) / count;
    const x = cx + Math.cos(a) * radius;
    const y = cy + Math.sin(a) * radius * 0.42;
    withAlpha(ctx, 0.22, () => {
      strokeLine(ctx, cx, cy, x, y, accent, 1);
    });
    diamond(ctx, x, y, 3.4, i % 2 === 0 ? core : accent);
  }
}

function drawMinibossArchetypeDetails(ctx, enemy, x, y, accent, core) {
  const t = nowSeconds();
  const w = enemy.w;
  const h = enemy.h;
  const cx = x + w / 2;
  const cy = y + h * 0.52;
  const dir = enemy.direction >= 0 ? 1 : -1;
  const phase = t * 1.6 + enemy.id;

  ctx.save();
  if (enemy.hurtTimer > 0) ctx.globalAlpha *= 0.78;

  switch (enemy.archetype) {
    case 'skimmer':
      withAlpha(ctx, 0.52, () => {
        strokeArc(ctx, cx, y + h * 0.86, w * 0.46, h * 0.18, Math.PI, Math.PI * 2, accent, 2);
        ellipse(ctx, x + w * 0.18, y + h * 0.92, 5, 8 + Math.sin(phase * 3) * 2, core);
        ellipse(ctx, x + w * 0.82, y + h * 0.92, 5, 8 + Math.cos(phase * 3) * 2, core);
      });
      break;
    case 'sentinel':
      strokeLine(ctx, cx - w * 0.36, y + h * 0.15, cx - w * 0.52, y - h * 0.1, accent, 3);
      strokeLine(ctx, cx + w * 0.36, y + h * 0.15, cx + w * 0.52, y - h * 0.1, accent, 3);
      diamond(ctx, cx - w * 0.52, y - h * 0.1, 5, core);
      diamond(ctx, cx + w * 0.52, y - h * 0.1, 5, core);
      break;
    case 'orbiter':
      drawOrbitNodes(ctx, cx, cy, 4, w * 0.58, accent, core, phase);
      break;
    case 'architect':
      withAlpha(ctx, 0.5, () => {
        strokeRect(ctx, x - 8, y + h * 0.18, 14, 14, accent, 1.5);
        strokeRect(ctx, x + w - 6, y + h * 0.46, 16, 16, core, 1.5);
        strokeLine(ctx, x + 2, y + h * 0.25, cx, cy, accent, 1);
        strokeLine(ctx, x + w + 2, y + h * 0.54, cx, cy, core, 1);
      });
      break;
    case 'mirage':
    case 'phase':
      for (let i = 1; i <= 2; i += 1) {
        withAlpha(ctx, 0.16 / i, () => {
          ellipse(ctx, cx - dir * i * 13, y + h * 0.25, w * 0.2, h * 0.18, accent);
          roundRect(ctx, cx - dir * i * 13 - w * 0.16, y + h * 0.43, w * 0.32, h * 0.36, 5, accent);
        });
      }
      break;
    case 'magnetar':
      withAlpha(ctx, 0.55, () => {
        strokeArc(ctx, cx, cy, w * 0.62, h * 0.5, 0, Math.PI * 2, accent, 1.6, phase * 0.12);
        strokeArc(ctx, cx, cy, w * 0.42, h * 0.34, 0, Math.PI * 2, core, 1.1, -phase * 0.14);
      });
      break;
    case 'threader':
      for (let i = 0; i < 3; i += 1) {
        const yy = y + h * (0.2 + i * 0.22);
        strokeLine(ctx, x - 10, yy, x + w + 10, yy + Math.sin(phase + i) * 5, i === 1 ? core : accent, 1.4);
      }
      break;
    case 'bellows':
      for (let i = 0; i < 3; i += 1) {
        withAlpha(ctx, 0.22, () => {
          strokeArc(ctx, cx + dir * (w * 0.36 + i * 10), cy - i * 4, 9 + i * 8, 6 + i * 4, -0.5, 0.5, core, 1.3);
        });
      }
      break;
    case 'rainmaker':
      for (let i = -1; i <= 1; i += 1) {
        strokeLine(ctx, cx + i * 10, y - 6, cx + i * 10 - 4, y + h * 0.2, accent, 1.8);
        diamond(ctx, cx + i * 10, y - 8, 4, core);
      }
      break;
    case 'sawbloom':
      withAlpha(ctx, 0.58, () => {
        for (let i = 0; i < 6; i += 1) {
          const a = phase * 2 + i * Math.PI / 3;
          strokeLine(ctx, cx, cy, cx + Math.cos(a) * w * 0.5, cy + Math.sin(a) * h * 0.34, i % 2 ? core : accent, 1.4);
        }
      });
      break;
    case 'burrower':
      withAlpha(ctx, 0.46, () => {
        fillPoly(ctx, [[x + 5, y + h * 0.78], [cx, y + h * 0.62], [x + w - 5, y + h * 0.78], [x + w - 12, y + h], [x + 12, y + h]], '#203825');
        strokeLine(ctx, x + 8, y + h * 0.82, x + w - 8, y + h * 0.82, accent, 2);
      });
      break;
    case 'ricochet':
    case 'prism':
      for (let i = 0; i < 4; i += 1) {
        const side = i % 2 === 0 ? -1 : 1;
        drawLooseDiamond(ctx, cx + side * (w * 0.38 + i), y + h * (0.28 + i * 0.12), 5, 8, i % 2 ? core : accent);
      }
      break;
    case 'harpoon':
      strokeLine(ctx, cx - dir * w * 0.32, y + h * 0.18, cx + dir * w * 0.68, y + h * 0.06, accent, 2);
      fillPoly(ctx, [
        [cx + dir * w * 0.74, y + h * 0.04],
        [cx + dir * w * 0.58, y + h * 0.0],
        [cx + dir * w * 0.62, y + h * 0.14],
      ], core);
      break;
    case 'chronos':
      withAlpha(ctx, 0.52, () => {
        strokeArc(ctx, cx, y + h * 0.24, w * 0.3, h * 0.22, 0, Math.PI * 2, accent, 1.5);
        strokeLine(ctx, cx, y + h * 0.24, cx + Math.cos(phase) * w * 0.18, y + h * 0.24 + Math.sin(phase) * h * 0.12, core, 1.4);
      });
      break;
    case 'sonar':
      for (let i = 0; i < 3; i += 1) {
        withAlpha(ctx, 0.18, () => strokeArc(ctx, cx, cy, w * (0.34 + i * 0.14), h * (0.26 + i * 0.1), 0, Math.PI * 2, i === 1 ? core : accent, 1.1));
      }
      break;
    case 'lockjaw':
      fillPoly(ctx, [[x + 6, y + h * 0.28], [cx, y + h * 0.42], [x + 6, y + h * 0.56]], accent);
      fillPoly(ctx, [[x + w - 6, y + h * 0.28], [cx, y + h * 0.42], [x + w - 6, y + h * 0.56]], accent);
      strokeLine(ctx, x + 12, y + h * 0.42, x + w - 12, y + h * 0.42, core, 1.4);
      break;
    case 'charger':
      fillPoly(ctx, [[cx, y - 3], [cx + dir * w * 0.44, y + h * 0.16], [cx + dir * w * 0.1, y + h * 0.24]], core);
      break;
    case 'volley':
    case 'warden':
    case 'hopper':
    default:
      withAlpha(ctx, 0.45, () => {
        strokeLine(ctx, cx - w * 0.28, y + h * 0.08, cx, y - h * 0.08, accent, 2);
        strokeLine(ctx, cx + w * 0.28, y + h * 0.08, cx, y - h * 0.08, accent, 2);
        diamond(ctx, cx, y - h * 0.08, 5, core);
      });
      break;
  }

  ctx.restore();
}

export function drawEnemyCorpse(ctx, enemy, x, y, color = enemyAccent(enemy)) {
  actorShadow(ctx, x, y, enemy.w, enemy.h, 0.16);
  roundRect(ctx, x + 2, y + enemy.h - 8, enemy.w - 4, 7, 4, COLORS.ENEMY_CORPSE);
  withAlpha(ctx, 0.36, () => {
    strokeLine(ctx, x + 5, y + enemy.h - 11, x + enemy.w - 8, y + enemy.h - 12, color, 2);
    ellipse(ctx, x + enemy.w - 7, y + enemy.h - 13, 3.2, 2.5, '#111827');
  });
}

function drawEnemyCasteDetails(ctx, enemy, x, y, accent, core, variant, dir, stride) {
  const t = nowSeconds();
  const w = enemy.w;
  const h = enemy.h;
  const cx = x + w / 2;
  const feetY = y + h;
  const pulse = 0.72 + Math.sin(t * 5 + enemy.id) * 0.18;

  if (variant === 'flyer') {
    withAlpha(ctx, 0.42, () => {
      strokeArc(ctx, cx, y + h * 0.5, w * 0.65, h * 0.34, Math.PI * 0.08, Math.PI * 0.92, accent, 1.4);
      strokeArc(ctx, cx, y + h * 0.5, w * 0.65, h * 0.34, Math.PI * 1.08, Math.PI * 1.92, accent, 1.4);
      ellipse(ctx, x + 3, y + h * 0.72, 3, 6 + pulse * 2, core);
      ellipse(ctx, x + w - 3, y + h * 0.72, 3, 6 + pulse * 2, core);
    });
    drawLooseDiamond(ctx, cx, y + h * 0.54, w * 0.16, h * 0.13, core);
    return;
  }

  if (variant === 'shooter') {
    withAlpha(ctx, 0.5, () => {
      strokeArc(ctx, cx, y + h * 0.28, w * 0.31, h * 0.24, -0.2, Math.PI + 0.2, accent, 1.5);
      rect(ctx, cx - w * 0.2, y + h * 0.28, w * 0.4, 2, core);
      rect(ctx, cx + dir * w * 0.55, y + h * 0.33, dir * w * 0.24, 2, core);
    });
    for (let i = 0; i < 3; i += 1) {
      ellipse(ctx, cx - dir * w * (0.2 + i * 0.08), y + h * (0.58 + i * 0.07), 2, 2, i === 1 ? core : accent);
    }
    return;
  }

  if (variant === 'charger') {
    withAlpha(ctx, 0.48, () => {
      fillPoly(ctx, [
        [cx + dir * w * 0.05, y + h * 0.14],
        [cx + dir * w * 0.52, y + h * 0.05],
        [cx + dir * w * 0.42, y + h * 0.28],
      ], core);
      strokeLine(ctx, cx - dir * w * 0.42, y + h * 0.2, cx + dir * w * 0.46, y + h * 0.2, accent, 2);
      strokeLine(ctx, x + 4, feetY - 7, x + w - 4, feetY - 8, '#080b12', 3);
    });
    return;
  }

  if (variant === 'clone') {
    withAlpha(ctx, 0.44, () => {
      strokeArc(ctx, cx, y + h * 0.2, w * 0.32, h * 0.22, Math.PI * 1.04, Math.PI * 1.96, accent, 1.4);
      strokeLine(ctx, cx - w * 0.24, y + h * 0.13, cx + w * 0.2, y + h * 0.33, core, 1.2);
      strokeLine(ctx, cx + w * 0.2, y + h * 0.11, cx - w * 0.16, y + h * 0.34, accent, 1.1);
    });
    return;
  }

  withAlpha(ctx, 0.42, () => {
    strokeLine(ctx, cx - dir * w * 0.32, y + h * 0.28, cx - dir * w * 0.48, y + h * 0.08, accent, 1.6);
    ellipse(ctx, cx - dir * w * 0.5, y + h * 0.06, 2.2, 2.2, core);
    rect(ctx, cx - w * 0.18, y + h * 0.76 + Math.max(0, stride), w * 0.36, 2, accent);
  });
}

function drawCriminalBody(ctx, enemy, x, y, accent, core, variant = 'thug') {
  const t = nowSeconds();
  const dir = enemy.direction >= 0 ? 1 : -1;
  const w = enemy.w;
  const h = enemy.h;
  const cx = x + w / 2;
  const feetY = y + h;
  const moving = Math.abs(enemy.vx ?? 0) > 8;
  const stride = moving ? Math.sin(t * 11 + enemy.id) : 0;
  const coat = variant === 'clone' ? '#203225' : variant === 'charger' ? '#2e2028' : '#202638';
  const mask = variant === 'clone' ? '#112015' : '#111421';
  const shoulder = variant === 'charger' ? 5 : 3;

  ctx.save();
  ctx.translate(0, variant === 'flyer' ? Math.sin(t * 4.2 + enemy.id) * 2.2 : Math.sin(t * 3.1 + enemy.id) * 0.65);

  glowEllipse(ctx, cx, y + h * 0.5, w * 0.5, h * 0.45, accent, variant === 'flyer' ? 0.2 : 0.11);

  if (variant === 'flyer') {
    withAlpha(ctx, 0.55, () => {
      strokeLine(ctx, x + 2, y + h * 0.55, x - 4, y + h * 0.72, accent, 2.6);
      strokeLine(ctx, x + w - 2, y + h * 0.55, x + w + 4, y + h * 0.72, accent, 2.6);
      ellipse(ctx, x + 4, feetY - 1, 3, 6, '#7af0ff');
      ellipse(ctx, x + w - 4, feetY - 1, 3, 6, '#7af0ff');
    });
  }

  ctx.fillStyle = coat;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.26 - shoulder, y + h * 0.34);
  ctx.quadraticCurveTo(x + 2, y + h * 0.58, x + 5, feetY - 5);
  ctx.quadraticCurveTo(cx, feetY - 2, x + w - 5, feetY - 5);
  ctx.quadraticCurveTo(x + w - 2, y + h * 0.58, cx + w * 0.26 + shoulder, y + h * 0.34);
  ctx.quadraticCurveTo(cx, y + h * 0.45, cx - w * 0.26 - shoulder, y + h * 0.34);
  ctx.fill();

  roundRect(ctx, cx - w * 0.2, y + h * 0.35, w * 0.4, h * 0.4, 5, accent);
  ellipse(ctx, cx, y + h * 0.2, w * 0.2, h * 0.18, mask);
  strokeLine(ctx, cx - w * 0.1, y + h * 0.19, cx + w * 0.12, y + h * 0.19, core, 1.6);
  drawEnemyCasteDetails(ctx, enemy, x, y, accent, core, variant, dir, stride);

  if (variant === 'shooter') {
    strokeLine(ctx, cx + dir * w * 0.18, y + h * 0.48, cx + dir * w * 0.53, y + h * 0.42, '#111421', 4);
    strokeLine(ctx, cx + dir * w * 0.34, y + h * 0.42, cx + dir * w * 0.62, y + h * 0.4, accent, 2.2);
    ellipse(ctx, cx + dir * w * 0.66, y + h * 0.4, 3, 3, core);
  } else if (variant === 'charger') {
    strokeLine(ctx, cx - dir * w * 0.18, y + h * 0.46, cx - dir * w * 0.45, y + h * 0.42, accent, 4);
    strokeLine(ctx, cx + dir * w * 0.18, y + h * 0.46, cx + dir * w * 0.5, y + h * 0.42, accent, 4);
    strokeLine(ctx, cx + dir * w * 0.28, y + h * 0.28, cx + dir * w * 0.48, y + h * 0.16, core, 2.4);
  } else {
    strokeLine(ctx, cx - dir * w * 0.16, y + h * 0.47, cx - dir * w * 0.34, y + h * 0.58, '#d8deef', 2.7);
    strokeLine(ctx, cx + dir * w * 0.15, y + h * 0.47, cx + dir * w * 0.45, y + h * 0.43, accent, 2.7);
    if (variant === 'thug') {
      strokeLine(ctx, cx + dir * w * 0.43, y + h * 0.43, cx + dir * w * 0.62, y + h * 0.34, core, 2);
    }
  }

  strokeLine(ctx, cx - w * 0.11, feetY - 8, cx - w * 0.22, feetY - 1 + Math.max(0, stride), '#d8deef', 2.8);
  strokeLine(ctx, cx + w * 0.11, feetY - 8, cx + w * 0.22, feetY - 1 + Math.max(0, -stride), '#d8deef', 2.8);
  strokeLine(ctx, cx - w * 0.27, feetY - 1, cx - w * 0.08, feetY - 1, '#080b12', 2);
  strokeLine(ctx, cx + w * 0.08, feetY - 1, cx + w * 0.27, feetY - 1, '#080b12', 2);
  ctx.restore();
}

function drawSignalLegs(ctx, x, y, w, h, stride, color = '#bac7df') {
  const cx = x + w / 2;
  const feetY = y + h;
  strokeLine(ctx, cx - w * 0.18, feetY - h * 0.22, cx - w * 0.3 + stride * 2, feetY - 1 + Math.max(0, stride), color, 2.4);
  strokeLine(ctx, cx + w * 0.18, feetY - h * 0.22, cx + w * 0.3 - stride * 2, feetY - 1 + Math.max(0, -stride), color, 2.4);
  roundRect(ctx, cx - w * 0.38 + stride * 2, feetY - 2, w * 0.26, 4, 2, SIGNAL_ART.void);
  roundRect(ctx, cx + w * 0.12 - stride * 2, feetY - 2, w * 0.26, 4, 2, SIGNAL_ART.void);
}

function drawWalkerGlyph(ctx, enemy, x, y, accent, core) {
  const t = nowSeconds();
  const w = enemy.w;
  const h = enemy.h;
  const cx = x + w / 2;
  const cy = y + h * 0.47 + Math.sin(t * 3 + enemy.id) * 0.8;
  const stride = Math.sin(t * 10 + enemy.id);
  const dir = enemy.direction >= 0 ? 1 : -1;

  glowEllipse(ctx, cx, cy, w * 0.46, h * 0.42, accent, 0.11);
  withAlpha(ctx, 0.96, () => {
    ellipse(ctx, cx, cy, w * 0.34, h * 0.34, SIGNAL_ART.void2);
    fillPoly(ctx, [
      [cx - w * 0.34, cy + h * 0.02],
      [cx, cy - h * 0.35],
      [cx + w * 0.34, cy + h * 0.02],
      [cx + w * 0.22, cy + h * 0.32],
      [cx - w * 0.22, cy + h * 0.32],
    ], SIGNAL_ART.shell);
    drawLooseDiamond(ctx, cx, cy + h * 0.08, w * 0.16, h * 0.18, accent);
    roundRect(ctx, cx - w * 0.2, cy - h * 0.08, w * 0.4, 3, 2, core);
  });
  strokeLine(ctx, cx + dir * w * 0.26, cy + h * 0.02, cx + dir * w * 0.5, cy - h * 0.14, accent, 1.7);
  drawSignalShard(ctx, cx + dir * w * 0.54, cy - h * 0.18, 3.6, core, dir * 0.45);
  drawSignalLegs(ctx, x, y, w, h, stride);
}

function drawFlyerGlyph(ctx, enemy, x, y, accent, core) {
  const t = nowSeconds();
  const w = enemy.w;
  const h = enemy.h;
  const cx = x + w / 2;
  const cy = y + h * 0.48 + Math.sin(t * 5 + enemy.id) * 2.2;
  const wing = Math.sin(t * 7 + enemy.id) * 3;

  glowEllipse(ctx, cx, cy, w * 0.64, h * 0.52, accent, 0.16);
  withAlpha(ctx, 0.9, () => {
    fillPoly(ctx, [
      [cx - w * 0.54, cy - h * 0.06],
      [cx - w * 0.16, cy - h * 0.34 - wing],
      [cx, cy - h * 0.1],
      [cx + w * 0.16, cy - h * 0.34 + wing],
      [cx + w * 0.54, cy - h * 0.06],
      [cx + w * 0.2, cy + h * 0.24],
      [cx, cy + h * 0.12],
      [cx - w * 0.2, cy + h * 0.24],
    ], SIGNAL_ART.shell);
    ellipse(ctx, cx, cy - h * 0.02, w * 0.22, h * 0.2, SIGNAL_ART.void);
    roundRect(ctx, cx - w * 0.18, cy - h * 0.04, w * 0.36, 3, 2, accent);
  });
  strokeArc(ctx, cx, cy + h * 0.12, w * 0.48, h * 0.28, Math.PI * 1.1, Math.PI * 1.9, core, 1.3);
  ellipse(ctx, cx - w * 0.28, cy + h * 0.28, 2.5, 5, core);
  ellipse(ctx, cx + w * 0.28, cy + h * 0.28, 2.5, 5, core);
}

function drawShooterGlyph(ctx, enemy, x, y, accent, core) {
  const t = nowSeconds();
  const w = enemy.w;
  const h = enemy.h;
  const cx = x + w / 2;
  const aim = enemy.shooterAimDir ?? { x: enemy.direction >= 0 ? 1 : -1, y: 0 };
  const aimLen = Math.hypot(aim.x, aim.y) || 1;
  const ax = aim.x / aimLen;
  const ay = aim.y / aimLen;
  const feetY = y + h;
  const pulse = 0.7 + Math.sin(t * 4.8 + enemy.id) * 0.2;
  const baseX = cx + ax * w * 0.18;
  const baseY = y + h * 0.45;
  const muzzleX = cx + ax * w * 0.72;
  const muzzleY = y + h * 0.45 + ay * h * 0.5;

  glowEllipse(ctx, cx, y + h * 0.45, w * 0.42, h * 0.5, accent, 0.13);
  roundRect(ctx, x + w * 0.18, y + h * 0.14, w * 0.64, h * 0.74, 7, SIGNAL_ART.void2);
  roundRect(ctx, x + w * 0.27, y + h * 0.22, w * 0.46, h * 0.48, 4, SIGNAL_ART.shell2);
  strokeRoundRect(ctx, x + w * 0.2, y + h * 0.14, w * 0.6, h * 0.74, 7, accent, 1.2);
  roundRect(ctx, cx - w * 0.16, y + h * 0.28, w * 0.32, 4, 2, core);
  strokeLine(ctx, baseX, baseY, muzzleX, muzzleY, SIGNAL_ART.void, 5);
  strokeLine(ctx, baseX + ax * 2, baseY + ay * 2, muzzleX, muzzleY, accent, 2.2 + pulse);
  diamond(ctx, muzzleX, muzzleY, 3.8, core);
  strokeLine(ctx, x + w * 0.26, feetY - 2, x + w * 0.74, feetY - 2, '#080b12', 3);
}

function drawChargerGlyph(ctx, enemy, x, y, accent, core) {
  const t = nowSeconds();
  const w = enemy.w;
  const h = enemy.h;
  const cx = x + w / 2;
  const cy = y + h * 0.52;
  const dir = enemy.direction >= 0 ? 1 : -1;
  const charge = Math.abs(enemy.vx ?? 0) > 80 ? 1 : 0;
  const bob = Math.sin(t * 5 + enemy.id) * 1.2;

  glowEllipse(ctx, cx, cy, w * 0.5, h * 0.45, accent, charge ? 0.2 : 0.12);
  fillPoly(ctx, [
    [x + w * 0.1, cy - h * 0.2 + bob],
    [x + w * 0.6, y + h * 0.16 + bob],
    [x + w * 0.9, cy - h * 0.03 + bob],
    [x + w * 0.74, y + h * 0.84],
    [x + w * 0.2, y + h * 0.86],
  ], SIGNAL_ART.void2);
  fillPoly(ctx, [
    [cx - dir * w * 0.12, y + h * 0.18 + bob],
    [cx + dir * w * 0.55, y + h * 0.12 + bob],
    [cx + dir * w * 0.42, y + h * 0.34 + bob],
  ], core);
  roundRect(ctx, cx - w * 0.19, cy - h * 0.04, w * 0.38, 5, 2, accent);
  strokeLine(ctx, x + w * 0.16, y + h * 0.86, x + w * 0.48, y + h - 1, '#bac7df', 2.8);
  strokeLine(ctx, x + w * 0.54, y + h * 0.86, x + w * 0.86, y + h - 1, '#bac7df', 2.8);
  if (charge) {
    withAlpha(ctx, 0.35, () => {
      strokeLine(ctx, x - dir * 4, cy, x - dir * 26, cy + 4, accent, 1.4);
      strokeLine(ctx, x - dir * 2, cy + 8, x - dir * 22, cy + 13, core, 1.1);
    });
  }
}

function drawCloneGlyph(ctx, enemy, x, y, accent, core) {
  const t = nowSeconds();
  const cx = x + enemy.w / 2;
  const feetY = y + enemy.h;
  const moving = Math.abs(enemy.vx ?? 0) > 8;
  const stride = moving ? Math.sin(t * 13 + enemy.id) : Math.sin(t * 4 + enemy.id) * 0.18;
  const facing = enemy.direction >= 0 ? 1 : -1;
  const pose = {
    crouch: false,
    dash: Math.abs(enemy.vx ?? 0) > 170,
    run: Math.abs(enemy.vx ?? 0) > 70,
    rising: false,
    falling: false,
    airborne: false,
    attacking: enemy.cloneMeleeTimer > 0,
    hurt: enemy.hurtTimer > 0,
    slam: enemy.cloneGroundSlamActive || enemy.cloneGroundSlamImpactTimer > 0,
    hover: Math.sin(t * 3.6 + enemy.id) * 0.7,
    lean: 0.04 * facing,
    walkPhase: stride,
    trim: accent,
  };

  ctx.save();
  ctx.translate(cx, feetY);
  ctx.scale(facing * 0.9, 0.9);
  drawSignalPlayerLocal(ctx, pose, false, {
    accent,
    core,
    secondary: '#d4ff9b',
    trim: accent,
    shell: '#142018',
    shell2: '#21301f',
    void: '#020703',
    void2: '#071008',
    limb: '#d8ffd0',
    corrupted: true,
  });
  ctx.restore();

  withAlpha(ctx, 0.24, () => {
    strokeLine(ctx, cx - facing * 14, y + enemy.h * 0.38, cx - facing * 28, y + enemy.h * 0.32 + Math.sin(t * 5) * 3, accent, 1.1);
    strokeLine(ctx, cx - facing * 10, y + enemy.h * 0.62, cx - facing * 26, y + enemy.h * 0.68 + Math.cos(t * 4) * 3, core, 0.9);
  });
}

function drawMinibossGlyph(ctx, enemy, x, y, accent, core) {
  const t = nowSeconds();
  const w = enemy.w;
  const h = enemy.h;
  const cx = x + w / 2;
  const cy = y + h * 0.5;
  const dir = enemy.direction >= 0 ? 1 : -1;
  const breath = Math.sin(t * 2.2 + enemy.id) * 1.4;

  glowEllipse(ctx, cx, cy, w * 0.62, h * 0.54, accent, 0.18);
  withAlpha(ctx, 0.94, () => {
    ctx.fillStyle = SIGNAL_ART.void2;
    ctx.beginPath();
    ctx.moveTo(cx, y + 2 + breath);
    ctx.bezierCurveTo(x - 4, y + h * 0.18, x + w * 0.04, y + h * 0.76, cx, y + h - 2);
    ctx.bezierCurveTo(x + w * 0.96, y + h * 0.76, x + w + 4, y + h * 0.18, cx, y + 2 + breath);
    ctx.fill();
    roundRect(ctx, x + w * 0.19, y + h * 0.32, w * 0.62, h * 0.34, 8, SIGNAL_ART.shell);
  });

  drawSignalMask(ctx, cx, y + h * 0.24 + breath, w * 0.42, h * 0.22, accent, core);
  drawLooseDiamond(ctx, cx, cy + h * 0.08, w * 0.13, h * 0.13, core);
  strokeLine(ctx, cx - w * 0.24, cy + h * 0.02, cx - dir * w * 0.55, cy + h * 0.18, accent, 3);
  strokeLine(ctx, cx + w * 0.24, cy + h * 0.02, cx + dir * w * 0.48, cy - h * 0.04, accent, 3);
  drawMinibossArchetypeDetails(ctx, enemy, x, y, accent, core);
  strokeLine(ctx, x + w * 0.16, y + h - 1, x + w * 0.43, y + h - 1, '#080b12', 2.8);
  strokeLine(ctx, x + w * 0.57, y + h - 1, x + w * 0.84, y + h - 1, '#080b12', 2.8);
}

export function drawEnemySprite(ctx, enemy, x, y, options = {}) {
  const baseAccent = options.color ?? enemyAccent(enemy);
  const accent = enemy.hurtTimer > 0 ? '#ffffff' : baseAccent;
  const core = enemy.hurtTimer > 0 ? baseAccent : '#f8fbff';

  ctx.save();
  if (enemy.globalCloneId && enemy.cloneCamouflageTimer > 0) ctx.globalAlpha *= 0.48;
  actorShadow(ctx, x, y, enemy.w, enemy.h, enemy.type === 'flyer' || enemy.type === 'miniboss' ? 0.18 : 0.25);

  if (enemy.type === 'miniboss') {
    drawMinibossGlyph(ctx, enemy, x, y, accent, core);
  } else if (enemy.type === 'flyer') {
    drawFlyerGlyph(ctx, enemy, x, y, accent, core);
  } else if (enemy.type === 'shooter') {
    drawShooterGlyph(ctx, enemy, x, y, accent, core);
  } else if (enemy.type === 'charger') {
    drawChargerGlyph(ctx, enemy, x, y, accent, core);
  } else if (enemy.type === 'clone') {
    drawCloneGlyph(ctx, enemy, x, y, accent, core);
  } else {
    drawWalkerGlyph(ctx, enemy, x, y, accent, core);
  }

  if (enemy.poisonTimer > 0) {
    withAlpha(ctx, 0.62, () => {
      strokeRect(ctx, x + 2, y + 2, enemy.w - 4, enemy.h - 4, COLORS.POISON, 2);
      rect(ctx, x + enemy.w / 2 - 2, y - 3, 4, 4, COLORS.POISON);
    });
  }
  ctx.restore();
}

export function drawCloneHitboxEffect(ctx, hitbox) {
  if (!hitbox) return;
  const color = COLORS.ENEMY_CLONE;
  const core = COLORS.CLONE_SUPER_CORE;
  const trim = COLORS.CLONE_SUPER;
  const cx = hitbox.x + hitbox.w / 2;
  const cy = hitbox.y + hitbox.h / 2;
  const dir = hitbox.direction ?? { x: hitbox.w >= hitbox.h ? 1 : 0, y: hitbox.h > hitbox.w ? 1 : 0 };

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (hitbox.kind === 'cloneGroundSlam') {
    const groundY = hitbox.y + hitbox.h * 0.64;
    withAlpha(ctx, 0.24, () => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(cx, groundY, hitbox.w * 0.5, hitbox.h * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    withAlpha(ctx, 0.86, () => {
      ctx.strokeStyle = trim;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(cx, groundY, hitbox.w * 0.46, hitbox.h * 0.28, 0, Math.PI * 0.04, Math.PI * 0.96);
      ctx.stroke();
      ctx.strokeStyle = core;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(cx, groundY, hitbox.w * 0.28, hitbox.h * 0.16, 0, Math.PI * 0.06, Math.PI * 0.94);
      ctx.stroke();
    });
    withAlpha(ctx, 0.74, () => {
      for (let i = -2; i <= 2; i += 1) {
        const x = cx + i * hitbox.w * 0.15;
        const crack = Math.abs(i) * 3;
        strokeLine(ctx, x, groundY - 1, x + i * 6, groundY + 13 - crack, i === 0 ? core : trim, i === 0 ? 1.6 : 1);
      }
      drawSignalShard(ctx, cx - hitbox.w * 0.28, groundY - 7, 5, trim, -0.6, 0.9);
      drawSignalShard(ctx, cx + hitbox.w * 0.26, groundY - 5, 4, core, 0.5, 0.82);
    });
    ctx.restore();
    return;
  }

  if (Math.abs(dir.y ?? 0) > 0) {
    const down = dir.y > 0;
    const baseY = down ? hitbox.y : hitbox.y + hitbox.h;
    const length = Math.max(31, hitbox.h * 0.82);
    drawSignalSword(ctx, cx, baseY - dir.y * 4, length, trim, core, down ? Math.PI : 0, 0.98);
  } else {
    const facing = (dir.x ?? 1) >= 0 ? 1 : -1;
    const baseX = facing > 0 ? hitbox.x : hitbox.x + hitbox.w;
    const length = Math.max(32, hitbox.w * 0.82);
    ctx.save();
    ctx.translate(baseX + facing * 6, cy);
    ctx.scale(facing, 1);
    drawSignalSword(ctx, 0, 0, length, trim, core, Math.PI / 2, 0.98);
    ctx.restore();
  }
  ctx.restore();
}

export function drawEnemyProjectile(ctx, projectile) {
  const kind = projectile.kind ?? 'enemy';
  ctx.save();
  if (kind === 'cloneSuper') {
    glowRect(ctx, projectile.x, projectile.y, projectile.w, projectile.h, COLORS.CLONE_SUPER, 0.28);
    rect(ctx, projectile.x, projectile.y, projectile.w, projectile.h, COLORS.CLONE_SUPER);
    rect(ctx, projectile.x + 5, projectile.y + projectile.h / 2 - 2, Math.max(4, projectile.w - 10), 4, COLORS.CLONE_SUPER_CORE);
  } else if (kind === 'cloneRanged') {
    const dir = projectile.vx >= 0 ? 1 : -1;
    glowRect(ctx, projectile.x, projectile.y, projectile.w, projectile.h, COLORS.ENEMY_CLONE, 0.22);
    diamond(ctx, projectile.x + projectile.w / 2, projectile.y + projectile.h / 2, Math.max(4, projectile.w / 2), COLORS.ENEMY_CLONE);
    rect(ctx, projectile.x + (dir > 0 ? -5 : projectile.w), projectile.y + projectile.h / 2 - 1, 5, 2, COLORS.CLONE_SUPER_CORE);
  } else {
    glowRect(ctx, projectile.x, projectile.y, projectile.w, projectile.h, COLORS.ENEMY_SHOOTER, 0.22);
    diamond(ctx, projectile.x + projectile.w / 2, projectile.y + projectile.h / 2, Math.max(4, projectile.w / 2), COLORS.ENEMY_SHOOTER);
    rect(ctx, projectile.x + projectile.w / 2 - 1, projectile.y + projectile.h / 2 - 1, 2, 2, '#ffffff');
  }
  ctx.restore();
}

export function drawPlayerProjectile(ctx, projectile) {
  const kind = projectile.kind ?? 'ranged';
  const dir = projectile.vx >= 0 ? 1 : -1;
  ctx.save();
  if (kind === 'super') {
    const vertical = Math.abs(projectile.vy ?? 0) > Math.abs(projectile.vx ?? 0);
    if (vertical) {
      const dirY = projectile.vy >= 0 ? 1 : -1;
      glowRect(ctx, projectile.x, projectile.y, projectile.w, projectile.h, COLORS.SUPER_ATTACK, 0.34);
      rect(ctx, projectile.x, projectile.y, projectile.w, projectile.h, COLORS.SUPER_ATTACK);
      rect(ctx, projectile.x + projectile.w / 2 - 4, projectile.y + 6, 8, Math.max(4, projectile.h - 12), COLORS.SUPER_ATTACK_CORE);
      diamond(ctx, projectile.x + projectile.w / 2, dirY > 0 ? projectile.y + projectile.h : projectile.y, projectile.w * 0.32, COLORS.SUPER_ATTACK_CORE);
      for (let i = 1; i <= 3; i += 1) {
        withAlpha(ctx, 0.16 / i, () => {
          rect(ctx, projectile.x + 6, projectile.y - dirY * i * 8, projectile.w - 12, projectile.h * 0.35, COLORS.SUPER_ATTACK);
        });
      }
      ctx.restore();
      return;
    }
    glowRect(ctx, projectile.x, projectile.y, projectile.w, projectile.h, COLORS.SUPER_ATTACK, 0.34);
    rect(ctx, projectile.x, projectile.y, projectile.w, projectile.h, COLORS.SUPER_ATTACK);
    rect(ctx, projectile.x + 6, projectile.y + projectile.h / 2 - 4, Math.max(4, projectile.w - 12), 8, COLORS.SUPER_ATTACK_CORE);
    diamond(ctx, dir > 0 ? projectile.x + projectile.w : projectile.x, projectile.y + projectile.h / 2, projectile.h * 0.32, COLORS.SUPER_ATTACK_CORE);
    for (let i = 1; i <= 3; i += 1) {
      withAlpha(ctx, 0.16 / i, () => {
        rect(ctx, projectile.x - dir * i * 8, projectile.y + 6, projectile.w * 0.35, projectile.h - 12, COLORS.SUPER_ATTACK);
      });
    }
  } else {
    glowRect(ctx, projectile.x, projectile.y, projectile.w, projectile.h, COLORS.RANGED_ATTACK, 0.2);
    rect(ctx, projectile.x, projectile.y + 2, projectile.w, projectile.h - 4, COLORS.RANGED_ATTACK);
    rect(ctx, projectile.x + (dir > 0 ? 0 : projectile.w - 2), projectile.y, 2, projectile.h, '#e9fbff');
  }
  ctx.restore();
}

function pickupLabel(pickup) {
  if (pickup.type === 'life') return '+';
  if (pickup.type === 'food') return 'F';
  if (pickup.type === 'ability') return '*';
  if (pickup.type === 'consumable') return pickup.amount > 1 ? String(pickup.amount) : 'C';
  return '';
}

export function drawPickupSprite(ctx, pickup, x, y, options = {}) {
  const color = options.color ?? COLORS.COIN;
  const cx = x + pickup.w / 2;
  const cy = y + pickup.h / 2;
  ctx.save();
  glowRect(ctx, x, y, pickup.w, pickup.h, color, pickup.type === 'coin' ? 0.18 : 0.24);
  if (pickup.type === 'coin') {
    const r = Math.max(5, Math.min(pickup.w, pickup.h) / 2);
    diamond(ctx, cx, cy, r, color);
    diamond(ctx, cx, cy, Math.max(2, r - 4), '#fff0a8');
    rect(ctx, cx + r * 0.15, cy - r * 0.55, 2, 2, '#ffffff');
  } else {
    const body = {
      life: COLORS.PICKUP_LIFE,
      food: '#8cffb8',
      ability: COLORS.PICKUP_ABILITY,
      consumable: COLORS.PICKUP_CONSUMABLE,
    }[pickup.type] ?? color;
    rect(ctx, x, y, pickup.w, pickup.h, '#171c2a');
    strokeRect(ctx, x, y, pickup.w, pickup.h, body, 2);
    if (pickup.type === 'life') {
      rect(ctx, cx - 5, cy - 2, 10, 4, body);
      rect(ctx, cx - 2, cy - 5, 4, 10, body);
    } else if (pickup.type === 'food') {
      diamond(ctx, cx, cy, Math.min(pickup.w, pickup.h) * 0.34, body);
      rect(ctx, cx - 4, cy - 2, 8, 4, '#f8fbff');
    } else if (pickup.type === 'ability') {
      diamond(ctx, cx, cy, Math.min(pickup.w, pickup.h) * 0.34, body);
      rect(ctx, cx - 1, cy - 6, 2, 12, '#ffffff');
      rect(ctx, cx - 6, cy - 1, 12, 2, '#ffffff');
    } else {
      rect(ctx, x + 3, y + 3, pickup.w - 6, pickup.h - 6, body);
      rect(ctx, x + 5, y + 5, pickup.w - 10, 3, '#f8fbff');
    }
    ctx.fillStyle = '#f8fbff';
    ctx.font = '9px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pickupLabel(pickup), cx, cy + 0.5);
  }
  ctx.restore();
}

function npcColor(type) {
  return {
    healer: COLORS.NPC_HEALER,
    mystic: COLORS.NPC_MYSTIC,
    armorer: COLORS.NPC_ARMORER,
    blacksmith: COLORS.NPC_BLACKSMITH,
    benefactor: COLORS.NPC_BENEFACTOR,
  }[type] ?? COLORS.NPC;
}

export function drawNpcSprite(ctx, type, x, y, w = 20, h = 30, options = {}) {
  const color = options.color ?? npcColor(type);
  const cx = x + w / 2;
  const feetY = y + h;
  const t = nowSeconds();
  const bob = Math.sin(t * 2.1 + hashString(type) * 0.01) * 0.55;
  const core = type === 'benefactor' ? '#0c1018' : '#f8fbff';
  const shrine = {
    healer: '#10231b',
    mystic: '#21142b',
    armorer: '#101d2a',
    blacksmith: '#2a1e12',
    benefactor: '#242830',
  }[type] ?? '#171b28';

  ctx.save();
  actorShadow(ctx, x - 2, y, w + 4, h, 0.2);
  ctx.translate(0, bob);

  glowEllipse(ctx, cx, y + h * 0.54, w * 0.72, h * 0.48, color, type === 'benefactor' ? 0.24 : 0.16);
  roundRect(ctx, x + w * 0.12, y + h * 0.34, w * 0.76, h * 0.6, 6, shrine);
  strokeRoundRect(ctx, x + w * 0.12, y + h * 0.34, w * 0.76, h * 0.6, 6, color, 1.2);
  fillPoly(ctx, [
    [cx, y + h * 0.04],
    [x + w * 0.82, y + h * 0.36],
    [cx, y + h * 0.52],
    [x + w * 0.18, y + h * 0.36],
  ], SIGNAL_ART.void2);
  strokeLine(ctx, x + w * 0.28, y + h * 0.36, x + w * 0.72, y + h * 0.36, color, 1.6);
  drawLooseDiamond(ctx, cx, y + h * 0.3, w * 0.16, h * 0.13, color);
  roundRect(ctx, cx - w * 0.22, y + h * 0.53, w * 0.44, 4, 2, core);

  if (type === 'healer') {
    withAlpha(ctx, 0.82, () => {
      roundRect(ctx, x - w * 0.12, y + h * 0.47, w * 0.24, h * 0.32, 4, '#e8fff4');
      strokeLine(ctx, x, y + h * 0.53, x, y + h * 0.73, color, 1.8);
      strokeLine(ctx, x - w * 0.1, y + h * 0.63, x + w * 0.1, y + h * 0.63, color, 1.8);
    });
  } else if (type === 'mystic') {
    withAlpha(ctx, 0.52, () => {
      strokeArc(ctx, cx, y + h * 0.42, w * 0.72, h * 0.22, 0, Math.PI * 2, color, 1.2);
      drawSignalShard(ctx, x + w * 1.02, y + h * 0.32, 5, '#f4dfff', t * 0.7);
    });
  } else if (type === 'armorer') {
    strokeRoundRect(ctx, x + w * 0.2, y + h * 0.5, w * 0.6, h * 0.28, 5, '#e9fbff', 1.4);
    strokeLine(ctx, x + w * 0.84, y + h * 0.5, x + w * 1.07, y + h * 0.76, color, 3);
  } else if (type === 'blacksmith') {
    ellipse(ctx, x - w * 0.08, y + h * 0.82, w * 0.2, h * 0.1, '#3a2a18');
    strokeLine(ctx, x + w * 0.75, y + h * 0.45, x + w * 1.08, y + h * 0.34, '#e9fbff', 2.6);
    strokeLine(ctx, x + w * 1.0, y + h * 0.33, x + w * 1.12, y + h * 0.43, color, 2.4);
  } else if (type === 'benefactor') {
    roundRect(ctx, x - w * 0.2, y + h * 0.48, w * 0.24, h * 0.28, 3, '#fff0a8');
    strokeLine(ctx, x + w * 0.17, y + h * 0.56, x + w * 0.83, y + h * 0.56, COLORS.RANGED_ATTACK, 2.4);
    withAlpha(ctx, 0.65, () => {
      ctx.strokeStyle = '#fff0a8';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, y + h * 0.03, w * 0.32, 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  withAlpha(ctx, type === 'benefactor' ? 0.28 : 0.18, () => {
    const radius = w * (type === 'mystic' ? 0.78 : 0.58) + Math.sin(t * 3.3) * 1.2;
    strokeArc(ctx, cx, y + h * 0.54, radius, h * 0.18, 0, Math.PI * 2, color, 1);
  });

  strokeLine(ctx, x + 4, feetY - 1, cx - 1, feetY - 1, '#080b12', 2);
  strokeLine(ctx, cx + 1, feetY - 1, x + w - 4, feetY - 1, '#080b12', 2);
  ctx.restore();
}

export function drawCheckpointSprite(ctx, checkpoint, activated = false, pulse = 0) {
  const cx = checkpoint.x + checkpoint.w / 2;
  const baseY = checkpoint.y + checkpoint.h + 5;
  const t = nowSeconds();
  const flame = activated ? 1 : 0.35;
  ctx.save();
  actorShadow(ctx, checkpoint.x, checkpoint.y + 12, checkpoint.w, checkpoint.h, 0.24);
  withAlpha(ctx, activated ? 0.32 : 0.12, () => {
    ellipse(ctx, cx, baseY - 2, 24, 7, COLORS.CHECKPOINT);
  });

  roundRect(ctx, checkpoint.x - 8, checkpoint.y + 22, checkpoint.w + 16, 17, 4, '#101724');
  strokeRoundRect(ctx, checkpoint.x - 8, checkpoint.y + 22, checkpoint.w + 16, 17, 4, activated ? COLORS.CHECKPOINT : '#36506a', 1.4);
  rect(ctx, checkpoint.x - 4, checkpoint.y + 26, checkpoint.w + 8, 3, activated ? '#e9fbff' : '#586a84');
  strokeLine(ctx, cx - 8, checkpoint.y + 22, cx - 15, checkpoint.y + 8, '#70809a', 1.6);
  strokeLine(ctx, cx + 8, checkpoint.y + 22, cx + 15, checkpoint.y + 8, '#70809a', 1.6);

  withAlpha(ctx, 0.42 * flame, () => {
    glowEllipse(ctx, cx, checkpoint.y + 11, 17 + Math.sin(t * 4) * 2, 18, COLORS.CHECKPOINT, 0.55);
  });
  ctx.fillStyle = activated ? COLORS.CHECKPOINT : '#263a50';
  ctx.beginPath();
  ctx.moveTo(cx, checkpoint.y + 1 + Math.sin(t * 3) * flame);
  ctx.bezierCurveTo(cx - 13, checkpoint.y + 9, cx - 7, checkpoint.y + 22, cx, checkpoint.y + 25);
  ctx.bezierCurveTo(cx + 8, checkpoint.y + 19, cx + 14, checkpoint.y + 9, cx, checkpoint.y + 1 + Math.cos(t * 2.2) * flame);
  ctx.fill();
  diamond(ctx, cx, checkpoint.y + 14, activated ? 6 : 4, activated ? '#e9fbff' : COLORS.CHECKPOINT);

  if (pulse > 0) {
    const t = 1 - clamp(pulse / 0.75, 0, 1);
    withAlpha(ctx, clamp(pulse / 0.75, 0, 1) * 0.65, () => {
      ctx.strokeStyle = COLORS.CHECKPOINT;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, baseY, 18 + t * 34, 0, Math.PI * 2);
      ctx.stroke();
    });
  }
  ctx.restore();
}

export function drawShieldAura(ctx, entity, alpha = 1) {
  const t = nowSeconds();
  const cx = entity.x + entity.w / 2;
  const cy = entity.y + entity.h / 2;
  const radiusX = entity.w * 0.82 + Math.sin(t * 8) * 1.5;
  const radiusY = entity.h * 0.68 + Math.cos(t * 7) * 1.5;
  const color = COLORS.SHIELD;
  const core = '#e9fbff';
  ctx.save();
  ctx.globalAlpha *= alpha;

  withAlpha(ctx, 0.18, () => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(cx, cy, radiusX, radiusY, Math.sin(t * 1.4) * 0.08, 0, Math.PI * 2);
    ctx.fill();
  });
  withAlpha(ctx, 0.72, () => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(cx, cy, radiusX, radiusY, 0, Math.PI * 0.08, Math.PI * 0.92);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy, radiusX, radiusY, 0, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
  });
  withAlpha(ctx, 0.56, () => {
    ctx.strokeStyle = core;
    ctx.lineWidth = 1.1;
    ctx.setLineDash([7, 6]);
    ctx.lineDashOffset = -t * 18;
    ctx.beginPath();
    ctx.ellipse(cx, cy, radiusX - 4, radiusY - 4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  });
  withAlpha(ctx, 0.62, () => {
    for (let i = 0; i < 4; i += 1) {
      const a = t * 1.8 + i * Math.PI * 0.5;
      const px = cx + Math.cos(a) * radiusX;
      const py = cy + Math.sin(a) * radiusY;
      diamond(ctx, px, py, 3.2, i % 2 === 0 ? core : color);
    }
    strokeLine(ctx, cx - radiusX * 0.46, cy - radiusY * 0.48, cx + radiusX * 0.38, cy - radiusY * 0.58, core, 0.8);
    strokeLine(ctx, cx - radiusX * 0.34, cy + radiusY * 0.54, cx + radiusX * 0.48, cy + radiusY * 0.42, color, 0.9);
  });
  ctx.restore();
}

export function drawTeleportAnchor(ctx, anchor, w, h) {
  const t = nowSeconds();
  const cx = anchor.x + w / 2;
  const cy = anchor.y + h / 2;
  ctx.save();
  glowRect(ctx, anchor.x - 4, anchor.y - 4, w + 8, h + 8, COLORS.TELEPORT_ANCHOR, 0.22);
  ctx.strokeStyle = COLORS.TELEPORT_ANCHOR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 16 + Math.sin(t * 4) * 2, 0, Math.PI * 2);
  ctx.stroke();
  diamond(ctx, cx, cy, 5, '#ffe1f5');
  ctx.restore();
}

export function drawTemporaryPlatform(ctx, platform) {
  glowRect(ctx, platform.x, platform.y, platform.w, platform.h, COLORS.MINI_PLATFORM, 0.16);
  rect(ctx, platform.x, platform.y, platform.w, platform.h, COLORS.MINI_PLATFORM);
  rect(ctx, platform.x, platform.y, platform.w, 3, COLORS.PLATFORM_TOP);
  for (let x = platform.x + 7; x < platform.x + platform.w - 5; x += 16) {
    rect(ctx, x, platform.y + 5, 5, 2, '#d9e4ff');
  }
}
