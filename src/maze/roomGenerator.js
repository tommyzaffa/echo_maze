import {
  ROOM_W, ROOM_H, WALL_THICKNESS,
  DOOR_NS_WIDTH, DOOR_EW_HEIGHT,
  PLAYER, ENEMY, PICKUP,
} from '../config.js';
import { Room } from './room.js';

const PLATFORM_H = 12;
const GROUND_Y = ROOM_H - WALL_THICKNESS;
const MAX_STEP_UP = 56;
const MAX_JUMP_GAP = 132;
const LOOSE_PLATFORM_MAX_COUNT = 2;
const SIDE_EXIT_PLATFORM_INSET = 46;
const SHARED_EXIT_CENTER_MAX_GAP = 116;
const MERGED_EXIT_Y_GAP = 28;
const PLATFORM_WIDTH = {
  SHORT: 64,
  SHORT_MEDIUM: 86,
  MEDIUM: 108,
  MEDIUM_LONG: 130,
  LONG: 156,
};
const SCALE_WIDTHS = [
  PLATFORM_WIDTH.SHORT,
  PLATFORM_WIDTH.SHORT_MEDIUM,
  PLATFORM_WIDTH.MEDIUM,
  PLATFORM_WIDTH.MEDIUM_LONG,
  PLATFORM_WIDTH.LONG,
];
const SCALE_WIDTH_WEIGHTS = [1, 2, 3, 3, 2];
const LOOSE_WIDTHS = [
  PLATFORM_WIDTH.SHORT,
  PLATFORM_WIDTH.SHORT_MEDIUM,
  PLATFORM_WIDTH.MEDIUM,
  PLATFORM_WIDTH.MEDIUM_LONG,
  PLATFORM_WIDTH.LONG,
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function oneWayPlatform(x, y, w, h = PLATFORM_H, extra = {}) {
  return { x, y, w, h, kind: 'platform', ...extra };
}

function solidPlatform(x, y, w, h, extra = {}) {
  return { x, y, w, h, oneWay: false, kind: 'solidPlatform', ...extra };
}

function hill(x, stepW, heights) {
  return heights.map((height, i) => ({
    x: x + i * stepW,
    y: GROUND_Y - height,
    w: stepW,
    h: height,
    oneWay: false,
    kind: 'hill',
    terrain: true,
  }));
}

function rectsTooClose(a, b, padding) {
  return (
    a.x - padding < b.x + b.w &&
    a.x + a.w + padding > b.x &&
    a.y - padding < b.y + b.h &&
    a.y + a.h + padding > b.y
  );
}

function addPlatform(platforms, candidate, padding = 10, exits = null) {
  if (exits && solidBlocksExit(candidate, exits)) return false;
  if (platforms.some((p) => rectsTooClose(candidate, p, padding))) return false;
  platforms.push(candidate);
  return true;
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function exitClearanceRects(exits) {
  const out = [];
  if (exits.N) {
    out.push({
      x: exits.N.pos - PLAYER.W,
      y: 0,
      w: DOOR_NS_WIDTH + PLAYER.W * 2,
      h: ROOM_H,
    });
  }
  if (exits.S) {
    out.push({
      x: exits.S.pos - PLAYER.W,
      y: 0,
      w: DOOR_NS_WIDTH + PLAYER.W * 2,
      h: ROOM_H,
    });
  }
  if (exits.O) {
    out.push({
      x: 0,
      y: exits.O.pos - PLAYER.H,
      w: WALL_THICKNESS + 92,
      h: DOOR_EW_HEIGHT + PLAYER.H * 2,
    });
  }
  if (exits.E) {
    out.push({
      x: ROOM_W - WALL_THICKNESS - 92,
      y: exits.E.pos - PLAYER.H,
      w: WALL_THICKNESS + 92,
      h: DOOR_EW_HEIGHT + PLAYER.H * 2,
    });
  }
  return out;
}

function solidBlocksExit(platform, exits) {
  if (platform.oneWay !== false) return false;
  return exitClearanceRects(exits).some((clearance) => rectsOverlap(platform, clearance));
}

function hasBlockedExit(exits, platforms) {
  return platforms.some((platform) => solidBlocksExit(platform, exits));
}

function pickWidth(rng, widths) {
  return rng.choice(widths);
}

function pickWeightedWidth(rng, widths, weights) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = rng.next() * total;
  for (let i = 0; i < widths.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return widths[i];
  }
  return widths[widths.length - 1];
}

function makeExitTarget(dir, exit, rng) {
  if (dir === 'N') {
    const w = pickWidth(rng, [PLATFORM_WIDTH.SHORT_MEDIUM, PLATFORM_WIDTH.MEDIUM]);
    return oneWayPlatform(
      clamp(exit.pos + DOOR_NS_WIDTH / 2 - w / 2, WALL_THICKNESS, ROOM_W - WALL_THICKNESS - w),
      70,
      w,
      PLATFORM_H,
      { required: true, requiredExit: dir },
    );
  }

  const w = pickWidth(rng, [PLATFORM_WIDTH.MEDIUM, PLATFORM_WIDTH.MEDIUM_LONG]);
  const y = clamp(
    exit.pos + DOOR_EW_HEIGHT - 4,
    76,
    GROUND_Y - 12,
  );
  const x = dir === 'O'
    ? WALL_THICKNESS + SIDE_EXIT_PLATFORM_INSET
    : ROOM_W - WALL_THICKNESS - SIDE_EXIT_PLATFORM_INSET - w;
  return oneWayPlatform(x, y, w, PLATFORM_H, { required: true, requiredExit: dir });
}

function platformCenter(platform) {
  return platform.x + platform.w / 2;
}

function requiredExitsOf(platform) {
  if (platform.requiredExits) return platform.requiredExits;
  if (platform.requiredExit) return [platform.requiredExit];
  return [];
}

function mergeTargets(a, b) {
  const span = Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x);
  const neededWidth = Math.min(PLATFORM_WIDTH.LONG, Math.max(a.w, b.w, span));
  const width = LOOSE_WIDTHS.find((candidate) => candidate >= neededWidth) ?? PLATFORM_WIDTH.LONG;
  const center = (platformCenter(a) + platformCenter(b)) / 2;
  return oneWayPlatform(
    clamp(center - width / 2, WALL_THICKNESS, ROOM_W - WALL_THICKNESS - width),
    Math.min(a.y, b.y),
    width,
    PLATFORM_H,
    {
      required: true,
      requiredExits: [...new Set([...requiredExitsOf(a), ...requiredExitsOf(b)])],
    },
  );
}

function addChainToTarget(platforms, target, rng) {
  const targetCenter = target.x + target.w / 2;
  const verticalSpan = GROUND_Y - target.y;
  const steps = Math.max(1, Math.ceil(verticalSpan / MAX_STEP_UP));
  const baseCenter = clamp(
    targetCenter + rng.int(-96, 96),
    WALL_THICKNESS + 72,
    ROOM_W - WALL_THICKNESS - 72,
  );

  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const y = Math.round(GROUND_Y - verticalSpan * t);
    const isTarget = i === steps;
    const w = isTarget ? target.w : pickWeightedWidth(rng, SCALE_WIDTHS, SCALE_WIDTH_WEIGHTS);
    const centerJitter = isTarget ? 0 : rng.int(-28, 28);
    const center = baseCenter + (targetCenter - baseCenter) * t + centerJitter;
    const x = isTarget
      ? target.x
      : clamp(Math.round(center - w / 2), WALL_THICKNESS, ROOM_W - WALL_THICKNESS - w);
    const platform = isTarget
      ? target
      : oneWayPlatform(x, y, w, PLATFORM_H, { required: true });
    if (isTarget) {
      platforms.push(platform);
    } else {
      addPlatform(platforms, platform, 16);
    }
  }
}

function addChainThroughTargets(platforms, rawTargets, rng) {
  const sortedTargets = [...rawTargets].sort((a, b) => b.y - a.y);
  const targets = [];

  for (const target of sortedTargets) {
    const previous = targets[targets.length - 1];
    if (
      previous &&
      Math.abs(previous.y - target.y) <= MERGED_EXIT_Y_GAP &&
      Math.abs(platformCenter(previous) - platformCenter(target)) <= SHARED_EXIT_CENTER_MAX_GAP
    ) {
      targets[targets.length - 1] = mergeTargets(previous, target);
    } else {
      targets.push(target);
    }
  }

  let currentY = GROUND_Y;
  let currentCenter = clamp(
    platformCenter(targets[0]) + rng.int(-88, 88),
    WALL_THICKNESS + 72,
    ROOM_W - WALL_THICKNESS - 72,
  );

  for (const target of targets) {
    const targetCenter = platformCenter(target);
    const verticalSpan = currentY - target.y;
    const steps = Math.max(1, Math.ceil(verticalSpan / MAX_STEP_UP));

    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const isTarget = i === steps;
      const y = Math.round(currentY - verticalSpan * t);
      const w = isTarget ? target.w : pickWeightedWidth(rng, SCALE_WIDTHS, SCALE_WIDTH_WEIGHTS);
      const centerJitter = isTarget ? 0 : rng.int(-28, 28);
      const center = currentCenter + (targetCenter - currentCenter) * t + centerJitter;
      const x = isTarget
        ? target.x
        : clamp(Math.round(center - w / 2), WALL_THICKNESS, ROOM_W - WALL_THICKNESS - w);
      const platform = isTarget
        ? target
        : oneWayPlatform(x, y, w, PLATFORM_H, { required: true });

      if (isTarget) platforms.push(platform);
      else addPlatform(platforms, platform, 16);
    }

    currentY = target.y;
    currentCenter = targetCenter;
  }
}

function addExitChains(platforms, exits, rng) {
  const targets = {};
  for (const dir of ['N', 'E', 'O']) {
    if (exits[dir]) targets[dir] = makeExitTarget(dir, exits[dir], rng);
  }

  const used = new Set();
  if (targets.N) {
    const side = ['E', 'O']
      .filter((dir) => targets[dir])
      .map((dir) => ({
        dir,
        gap: Math.abs(platformCenter(targets.N) - platformCenter(targets[dir])),
      }))
      .sort((a, b) => a.gap - b.gap)[0];

    if (side && side.gap <= SHARED_EXIT_CENTER_MAX_GAP) {
      addChainThroughTargets(platforms, [targets[side.dir], targets.N], rng);
      used.add('N');
      used.add(side.dir);
    }
  }

  for (const dir of ['N', 'E', 'O']) {
    if (!targets[dir] || used.has(dir)) continue;
    addChainToTarget(platforms, targets[dir], rng);
  }
}

function addLoosePlatforms(platforms, rng, exits) {
  const count = rng.int(0, LOOSE_PLATFORM_MAX_COUNT);
  for (let attempt = 0, made = 0; attempt < 28 && made < count; attempt += 1) {
    const w = pickWidth(rng, LOOSE_WIDTHS);
    const h = rng.chance(0.35) ? 8 : PLATFORM_H;
    const candidate = oneWayPlatform(
      rng.int(WALL_THICKNESS + 18, ROOM_W - WALL_THICKNESS - 18 - w),
      rng.int(82, GROUND_Y - 84),
      w,
      h,
      { loose: true },
    );
    if (addPlatform(platforms, candidate, 24, exits)) made += 1;
  }
}

function addTerrainExtras(platforms, rng, exits) {
  if (rng.chance(0.35)) {
    const stepW = rng.int(22, 28);
    const shape = rng.choice([
      [20, 38, 56, 38, 20],
      [18, 34, 50, 34],
      [24, 42, 24],
    ]);
    const x = rng.int(WALL_THICKNESS + 18, ROOM_W - WALL_THICKNESS - 18 - stepW * shape.length);
    const parts = hill(x, stepW, shape);
    if (!parts.some((part) => solidBlocksExit(part, exits))) {
      for (const part of parts) addPlatform(platforms, part, 4, exits);
    }
  }

  if (rng.chance(0.22)) {
    const w = rng.int(54, 82);
    const h = rng.int(16, 28);
    addPlatform(
      platforms,
      solidPlatform(
        rng.int(WALL_THICKNESS + 28, ROOM_W - WALL_THICKNESS - 28 - w),
        rng.int(182, GROUND_Y - 50),
        w,
        h,
        { loose: true },
      ),
      28,
      exits,
    );
  }
}

function enemyConfig(type) {
  return {
    walker: ENEMY.WALKER,
    flyer: ENEMY.FLYER,
    shooter: ENEMY.SHOOTER,
    charger: ENEMY.CHARGER,
    clone: ENEMY.CLONE,
    miniboss: ENEMY.MINIBOSS,
  }[type] ?? ENEMY.WALKER;
}

function canStandAt(x, y, w, h, platforms) {
  const rect = { x, y, w, h };
  return !platforms.some((platform) => (
    platform.oneWay === false && rectsOverlap(rect, platform)
  ));
}

function overSouthGap(exits, x, w) {
  if (!exits.S) return false;
  return x < exits.S.pos + DOOR_NS_WIDTH && x + w > exits.S.pos;
}

function walkableSurfaces(exits, platforms) {
  return [
    ...floorSurfaces(exits),
    ...platforms.map((platform) => ({
      x: platform.x,
      y: platform.y,
      w: platform.w,
      type: platform.kind ?? 'platform',
      exitTarget: requiredExitsOf(platform).length > 0,
    })),
  ].filter((surface) => surface.w > 18);
}

function overlapsSideExitLedge(surface, exits) {
  if (surface.type === 'floor') return false;
  const rect = { x: surface.x, y: surface.y - PLATFORM_H, w: surface.w, h: PLATFORM_H * 3 };
  const ledges = [];
  if (exits.O) {
    ledges.push({
      x: 0,
      y: exits.O.pos - 18,
      w: WALL_THICKNESS + SIDE_EXIT_PLATFORM_INSET + PLATFORM_WIDTH.LONG,
      h: DOOR_EW_HEIGHT + 54,
    });
  }
  if (exits.E) {
    ledges.push({
      x: ROOM_W - WALL_THICKNESS - SIDE_EXIT_PLATFORM_INSET - PLATFORM_WIDTH.LONG,
      y: exits.E.pos - 18,
      w: WALL_THICKNESS + SIDE_EXIT_PLATFORM_INSET + PLATFORM_WIDTH.LONG,
      h: DOOR_EW_HEIGHT + 54,
    });
  }
  return ledges.some((ledge) => rectsOverlap(rect, ledge));
}

function spawnOverlapsAny(spawn, out, padding = 10) {
  return out.some((other) => rectsOverlap(
    {
      x: spawn.x - padding,
      y: spawn.y - padding,
      w: spawn.w + padding * 2,
      h: spawn.h + padding * 2,
    },
    {
      x: other.x,
      y: other.y,
      w: other.w ?? enemyConfig(other.type).W,
      h: other.h ?? enemyConfig(other.type).H,
    },
  ));
}

function pickGroundSpawn(exits, platforms, rng, w, h, options = {}) {
  const surfaces = walkableSurfaces(exits, platforms).filter((surface) => (
    surface.w >= w + 18 &&
    (!options.excludeExitTargets || !surface.exitTarget) &&
    (!options.excludeSideExitLedges || !overlapsSideExitLedge(surface, exits))
  ));
  if (surfaces.length === 0) return null;

  for (let attempt = 0; attempt < 42; attempt += 1) {
    const surface = rng.choice(surfaces);
    const x = rng.int(
      Math.ceil(surface.x + 9),
      Math.floor(surface.x + surface.w - w - 9),
    );
    const y = surface.y - h;
    if (surface.type === 'floor' && overSouthGap(exits, x, w)) continue;
    if (options.excludeSideExitLedges && overlapsSideExitLedge(surface, exits)) continue;
    if (!canStandAt(x, y, w, h, platforms)) continue;
    return { x, y };
  }
  return null;
}

function pickAirSpawn(platforms, rng, w, h) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const x = rng.int(WALL_THICKNESS + 28, ROOM_W - WALL_THICKNESS - 28 - w);
    const y = rng.int(92, 220);
    if (!canStandAt(x, y, w, h, platforms)) continue;
    return { x, y };
  }
  return null;
}

function isCombatRoom(cell) {
  return (
    cell.id !== '4,4' &&
    !cell.meta.miniboss &&
    !cell.meta.checkpoint
  );
}

function pickEnemyType(cell, rng, index) {
  const roll = rng.next();
  if (roll < 0.28) return 'walker';
  if (roll < 0.52) return 'charger';
  if (roll < 0.76) return 'shooter';
  return ENEMY.TYPES[(cell.x * 5 + cell.y + index) % 4];
}

function generateEnemySpawns(cell, platforms, rng) {
  if (cell.meta.miniboss) {
    const cfg = ENEMY.MINIBOSS;
    const archetype = cell.meta.minibossArchetype ?? rng.choice(ENEMY.MINIBOSS_ARCHETYPES);
    const airMiniboss = ['skimmer', 'orbiter', 'threader', 'sawbloom', 'prism'].includes(archetype);
    const spawn = airMiniboss
      ? pickAirSpawn(platforms, rng, cfg.W, cfg.H)
      : pickGroundSpawn(cell.exits, platforms, rng, cfg.W, cfg.H, {
        excludeExitTargets: true,
        excludeSideExitLedges: true,
      });
    const fallbackSpawn = airMiniboss
      ? { x: ROOM_W / 2 - cfg.W / 2, y: 104 }
      : { x: ROOM_W / 2 - cfg.W / 2, y: GROUND_Y - cfg.H };
    const chosenSpawn = spawn ?? fallbackSpawn;

    return [{
      type: 'miniboss',
      miniboss: true,
      archetype,
      x: chosenSpawn.x,
      y: chosenSpawn.y,
      direction: rng.chance(0.5) ? 1 : -1,
    }];
  }

  if (!isCombatRoom(cell)) return [];

  const count = rng.int(1, 4);
  const out = [];
  for (let i = 0, attempt = 0; attempt < count * 4 && out.length < count; attempt += 1) {
    const type = pickEnemyType(cell, rng, i + attempt);
    const cfg = enemyConfig(type);
    const spawn = type === 'flyer'
      ? pickAirSpawn(platforms, rng, cfg.W, cfg.H)
      : pickGroundSpawn(cell.exits, platforms, rng, cfg.W, cfg.H, {
        excludeExitTargets: true,
        excludeSideExitLedges: true,
      });
    if (!spawn) continue;
    if (spawnOverlapsAny({ ...spawn, w: cfg.W, h: cfg.H }, out, 22)) continue;
    out.push({
      type,
      x: spawn.x,
      y: spawn.y,
      direction: rng.chance(0.5) ? 1 : -1,
    });
    i += 1;
  }
  return out;
}

function pickMapCoinValue(rng) {
  const roll = rng.next();
  if (roll < 0.62) return 1;
  if (roll < 0.92) return 5;
  if (roll < 0.985) return 10;
  return 20;
}

function coinSize(value) {
  return PICKUP.COIN_SIZES[value] ?? PICKUP.COIN_W;
}

function pickPickupSpawn(exits, platforms, rng, value) {
  const size = coinSize(value);
  const surfaces = walkableSurfaces(exits, platforms).filter((surface) => surface.w >= size + 14);
  if (surfaces.length === 0) return null;

  for (let attempt = 0; attempt < 42; attempt += 1) {
    const surface = rng.choice(surfaces);
    const x = rng.int(
      Math.ceil(surface.x + 7),
      Math.floor(surface.x + surface.w - size - 7),
    );
    const y = surface.y - size - 2;
    if (surface.type === 'floor' && overSouthGap(exits, x, size)) continue;
    if (!canStandAt(x, y, size, size, platforms)) continue;
    return { x, y, size };
  }
  return null;
}

function generatePickupSpawns(cell, platforms, rng) {
  if (cell.id === '4,4') return [];

  const count = cell.meta.checkpoint
    ? rng.int(1, 3)
    : rng.int(3, 7);
  const out = [];

  for (let i = 0, attempt = 0; attempt < count * 4 && out.length < count; attempt += 1) {
    const amount = pickMapCoinValue(rng);
    const spawn = pickPickupSpawn(cell.exits, platforms, rng, amount);
    if (!spawn) continue;
    if (spawnOverlapsAny({ x: spawn.x, y: spawn.y, w: spawn.size, h: spawn.size }, out, 8)) continue;
    out.push({
      type: 'coin',
      amount,
      x: spawn.x,
      y: spawn.y,
      w: spawn.size,
      h: spawn.size,
    });
    i += 1;
  }

  return out;
}

function floorSurfaces(exits) {
  if (!exits.S) return [{ x: 0, y: GROUND_Y, w: ROOM_W, type: 'floor' }];

  const out = [];
  const gapStart = exits.S.pos;
  const gapEnd = exits.S.pos + DOOR_NS_WIDTH;
  if (gapStart > PLAYER.W) out.push({ x: 0, y: GROUND_Y, w: gapStart, type: 'floor' });
  if (ROOM_W - gapEnd > PLAYER.W) out.push({ x: gapEnd, y: GROUND_Y, w: ROOM_W - gapEnd, type: 'floor' });
  return out;
}

function surfaceGap(a, b) {
  if (a.x + a.w < b.x) return b.x - (a.x + a.w);
  if (b.x + b.w < a.x) return a.x - (b.x + b.w);
  return 0;
}

function canReachSurface(from, to) {
  const rise = from.y - to.y;
  if (rise > MAX_STEP_UP) return false;

  const gap = surfaceGap(from, to);
  if (gap > MAX_JUMP_GAP) return false;

  return true;
}

export function validateRoomLayout(exits, platforms) {
  if (hasBlockedExit(exits, platforms)) return false;

  const surfaces = [
    ...floorSurfaces(exits),
    ...platforms.map((p) => ({
      x: p.x,
      y: p.y,
      w: p.w,
      type: 'platform',
      requiredExits: requiredExitsOf(p),
    })),
  ];

  const queue = [];
  const reached = new Set();
  for (let i = 0; i < surfaces.length; i += 1) {
    if (surfaces[i].type === 'floor') {
      reached.add(i);
      queue.push(i);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift();
    for (let i = 0; i < surfaces.length; i += 1) {
      if (reached.has(i)) continue;
      if (!canReachSurface(surfaces[current], surfaces[i])) continue;
      reached.add(i);
      queue.push(i);
    }
  }

  for (const dir of ['N', 'E', 'O']) {
    if (!exits[dir]) continue;
    const ok = surfaces.some((surface, i) => (
      surface.requiredExits?.includes(dir) && reached.has(i)
    ));
    if (!ok) return false;
  }

  return true;
}

export function generateRoomForCell(cell, rng) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const attemptRng = rng.fork(`layout:${attempt}`);
    const platforms = [];

    addExitChains(platforms, cell.exits, attemptRng);

    addTerrainExtras(platforms, attemptRng, cell.exits);
    addLoosePlatforms(platforms, attemptRng, cell.exits);

    if (validateRoomLayout(cell.exits, platforms)) {
      const spawnRng = rng.fork(`spawns:${attempt}`);
      return new Room({
        id: cell.id,
        exits: cell.exits,
        platforms,
        enemySpawns: generateEnemySpawns(cell, platforms, spawnRng.fork('enemy')),
        pickupSpawns: generatePickupSpawns(cell, platforms, spawnRng.fork('pickup')),
        meta: cell.meta,
      });
    }
  }

  return new Room({
    id: cell.id,
    exits: cell.exits,
    platforms: [],
    enemySpawns: [],
    pickupSpawns: [],
    meta: cell.meta,
  });
}
