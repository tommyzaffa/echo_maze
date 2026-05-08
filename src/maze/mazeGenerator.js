import {
  ROOM_W, ROOM_H,
  DOOR_NS_WIDTH, DOOR_EW_HEIGHT, DOOR_EDGE_MARGIN,
  DEBUG, ENEMY,
} from '../config.js';
import { Rng } from '../utils/rng.js';
import { DIR_OPPOSITE } from './room.js';
import { generateRoomForCell } from './roomGenerator.js';

export const MAZE_SIZE = 9;
export const START_COORD = { x: 4, y: 4 };

const DIRS = [
  { dir: 'N', dx: 0, dy: -1 },
  { dir: 'S', dx: 0, dy: 1 },
  { dir: 'E', dx: 1, dy: 0 },
  { dir: 'O', dx: -1, dy: 0 },
];

const NPC_TYPES = ['healer', 'healer', 'healer', 'mystic', 'armorer', 'blacksmith'];

function idOf(x, y) {
  return `${x},${y}`;
}

function inBounds(x, y) {
  return x >= 0 && x < MAZE_SIZE && y >= 0 && y < MAZE_SIZE;
}

function makeCells() {
  const cells = new Map();
  for (let y = 0; y < MAZE_SIZE; y += 1) {
    for (let x = 0; x < MAZE_SIZE; x += 1) {
      cells.set(idOf(x, y), {
        id: idOf(x, y),
        x,
        y,
        links: new Set(),
        exits: { N: null, S: null, E: null, O: null },
        meta: { x, y },
      });
    }
  }
  return cells;
}

function neighborOf(cell, dir) {
  const info = DIRS.find((d) => d.dir === dir);
  return { x: cell.x + info.dx, y: cell.y + info.dy };
}

function edgeKey(a, b) {
  return [a.id, b.id].sort().join('|');
}

function connect(cells, a, b, dir) {
  a.links.add(dir);
  b.links.add(DIR_OPPOSITE[dir]);
}

function frontierEdges(cells, cell, visited) {
  const out = [];
  for (const { dir, dx, dy } of DIRS) {
    const nx = cell.x + dx;
    const ny = cell.y + dy;
    if (!inBounds(nx, ny)) continue;
    const target = cells.get(idOf(nx, ny));
    if (!visited.has(target.id)) out.push({ from: cell, to: target, dir });
  }
  return out;
}

function generateSpanningTree(rng) {
  const cells = makeCells();
  const start = cells.get(idOf(START_COORD.x, START_COORD.y));
  const visited = new Set([start.id]);
  const frontier = frontierEdges(cells, start, visited);

  while (visited.size < MAZE_SIZE * MAZE_SIZE) {
    const edgeIndex = rng.int(0, frontier.length - 1);
    const edge = frontier.splice(edgeIndex, 1)[0];
    if (visited.has(edge.to.id)) continue;

    connect(cells, edge.from, edge.to, edge.dir);
    visited.add(edge.to.id);
    frontier.push(...frontierEdges(cells, edge.to, visited));
  }

  return cells;
}

function allMissingEdges(cells) {
  const out = [];
  const seen = new Set();
  for (const cell of cells.values()) {
    for (const { dir, dx, dy } of DIRS) {
      const nx = cell.x + dx;
      const ny = cell.y + dy;
      if (!inBounds(nx, ny)) continue;
      const target = cells.get(idOf(nx, ny));
      const key = edgeKey(cell, target);
      if (seen.has(key) || cell.links.has(dir)) continue;
      seen.add(key);
      out.push({ from: cell, to: target, dir });
    }
  }
  return out;
}

function degree(cell) {
  return cell.links.size;
}

function degreeStats(cells) {
  const stats = { deadEnds: 0, mid: 0, full: 0 };
  for (const cell of cells.values()) {
    const d = degree(cell);
    if (d === 1) stats.deadEnds += 1;
    if (d === 2 || d === 3) stats.mid += 1;
    if (d === 4) stats.full += 1;
  }
  return stats;
}

function graphConnected(cells) {
  const start = cells.get(idOf(START_COORD.x, START_COORD.y));
  const seen = new Set([start.id]);
  const queue = [start];

  while (queue.length > 0) {
    const cell = queue.shift();
    for (const dir of cell.links) {
      const n = neighborOf(cell, dir);
      const target = cells.get(idOf(n.x, n.y));
      if (seen.has(target.id)) continue;
      seen.add(target.id);
      queue.push(target);
    }
  }

  return seen.size === cells.size;
}

function addExtraEdges(cells, rng) {
  const targetDeadEnds = rng.int(8, 12);
  let edges = rng.shuffle(allMissingEdges(cells));

  while (degreeStats(cells).deadEnds > targetDeadEnds) {
    const edgeIndex = edges.findIndex((edge) => (
      degree(edge.from) === 1 || degree(edge.to) === 1
    ));
    if (edgeIndex < 0) break;
    const edge = edges.splice(edgeIndex, 1)[0];
    connect(cells, edge.from, edge.to, edge.dir);
  }

  edges = rng.shuffle(edges);
  for (const edge of edges) {
    const before = degreeStats(cells);
    if (before.mid >= 57 && before.mid <= 65 && !rng.chance(0.08)) continue;
    if (before.full > 16) break;
    connect(cells, edge.from, edge.to, edge.dir);
    const after = degreeStats(cells);
    if (after.mid > 68 || after.deadEnds < 7) {
      edge.from.links.delete(edge.dir);
      edge.to.links.delete(DIR_OPPOSITE[edge.dir]);
    }
  }
}

function graphAcceptable(cells) {
  const stats = degreeStats(cells);
  return (
    graphConnected(cells) &&
    stats.deadEnds >= 7 &&
    stats.deadEnds <= 13 &&
    stats.mid >= 54 &&
    stats.mid <= 68
  );
}

function generateGraph(rng) {
  let best = null;
  let bestScore = Infinity;

  for (let attempt = 0; attempt < 300; attempt += 1) {
    const attemptRng = rng.fork(`graph:${attempt}`);
    const cells = generateSpanningTree(attemptRng);
    addExtraEdges(cells, attemptRng);
    const stats = degreeStats(cells);
    const score = Math.abs(stats.deadEnds - 10) * 8 + Math.abs(stats.mid - 61);

    if (score < bestScore) {
      best = cells;
      bestScore = score;
    }
    if (graphAcceptable(cells)) return cells;
  }

  return best;
}

function exitPosForEdge(edge, rng) {
  if (edge.dir === 'N' || edge.dir === 'S') {
    return rng.int(DOOR_EDGE_MARGIN, ROOM_W - DOOR_EDGE_MARGIN - DOOR_NS_WIDTH);
  }
  return rng.int(DOOR_EDGE_MARGIN, ROOM_H - DOOR_EDGE_MARGIN - DOOR_EW_HEIGHT);
}

function assignExits(cells, rng) {
  const seen = new Set();
  for (const cell of cells.values()) {
    for (const dir of cell.links) {
      const n = neighborOf(cell, dir);
      const target = cells.get(idOf(n.x, n.y));
      const key = edgeKey(cell, target);
      if (seen.has(key)) continue;
      seen.add(key);

      const pos = exitPosForEdge({ dir }, rng);
      cell.exits[dir] = { pos, target: target.id, targetExit: DIR_OPPOSITE[dir] };
      target.exits[DIR_OPPOSITE[dir]] = { pos, target: cell.id, targetExit: dir };
    }
  }
}

function addDebugExitPair(cells, fromId, toId, dir) {
  const from = cells.get(fromId);
  const to = cells.get(toId);
  if (!from || !to || from.exits[dir]) return;

  const opposite = DIR_OPPOSITE[dir];
  const pos = dir === 'N' || dir === 'S'
    ? Math.floor((ROOM_W - DOOR_NS_WIDTH) / 2)
    : Math.floor((ROOM_H - DOOR_EW_HEIGHT) / 2);
  from.links.add(dir);
  to.links.add(opposite);
  from.exits[dir] = { pos, target: to.id, targetExit: opposite };
  to.exits[opposite] = { pos, target: from.id, targetExit: dir };
}

function assignDebugMinibossRing(cells) {
  if (!DEBUG.MINIBOSS_TEST_RING) return [];

  const center = idOf(START_COORD.x, START_COORD.y);
  const testRooms = [
    { id: idOf(4, 3), connectFrom: center, dir: 'N', archetype: 'chronos' },
    { id: idOf(5, 4), connectFrom: center, dir: 'E', archetype: 'prism' },
    { id: idOf(4, 5), connectFrom: center, dir: 'S', archetype: 'sonar' },
    { id: idOf(3, 4), connectFrom: center, dir: 'O', archetype: 'lockjaw' },
  ];

  const out = [];
  for (const item of testRooms) {
    addDebugExitPair(cells, item.connectFrom, item.id, item.dir);
    const cell = cells.get(item.id);
    if (!cell) continue;
    cell.meta.deadEnd = false;
    cell.meta.miniboss = true;
    cell.meta.minibossArchetype = item.archetype;
    cell.meta.testMiniboss = true;
    out.push(cell);
  }

  return out;
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function assignSpecialRooms(cells, rng) {
  const startId = idOf(START_COORD.x, START_COORD.y);
  const startCell = cells.get(startId);
  if (startCell) startCell.meta.isStartRoom = true;
  const deadEnds = [...cells.values()].filter((cell) => degree(cell) === 1);
  for (const cell of deadEnds) {
    cell.meta.deadEnd = true;
  }
  const debugMinibossRooms = assignDebugMinibossRing(cells);
  const archetypes = rng.shuffle([...ENEMY.MINIBOSS_ARCHETYPES]);
  const randomMinibossRooms = DEBUG.MINIBOSS_TEST_RING
    ? []
    : rng.shuffle([...deadEnds]).slice(0, Math.min(deadEnds.length, archetypes.length));

  randomMinibossRooms.forEach((cell, index) => {
    cell.meta.miniboss = true;
    cell.meta.minibossArchetype = archetypes[index];
  });

  const eligible = [...cells.values()].filter((cell) => (
    cell.id !== startId && !cell.meta.deadEnd && !cell.meta.miniboss
  ));
  rng.shuffle(eligible);

  const checkpoints = [];
  for (const cell of eligible) {
    if (checkpoints.length >= 5) break;
    if (checkpoints.some((other) => manhattan(cell, other) < 2)) continue;
    cell.meta.checkpoint = true;
    checkpoints.push(cell);
  }

  const occupied = new Set([startId, ...checkpoints.map((cell) => cell.id)]);
  const npcCandidates = eligible.filter((cell) => !occupied.has(cell.id));
  rng.shuffle(npcCandidates);
  let healerIndex = 0;
  NPC_TYPES.forEach((type, index) => {
    const cell = npcCandidates[index];
    if (!cell) return;
    cell.meta.npc = type;
    if (type === 'healer') {
      cell.meta.npcId = healerIndex === 0 ? 'healer' : `healer:${healerIndex}`;
      healerIndex += 1;
    } else {
      cell.meta.npcId = type;
    }
    occupied.add(cell.id);
  });

  const corners = [
    cells.get(idOf(0, 0)),
    cells.get(idOf(0, MAZE_SIZE - 1)),
    cells.get(idOf(MAZE_SIZE - 1, 0)),
    cells.get(idOf(MAZE_SIZE - 1, MAZE_SIZE - 1)),
  ];
  const cloneStart = rng.choice(corners);
  cloneStart.meta.cloneStart = true;

  return {
    deadEnds,
    minibossRooms: [...new Set([...randomMinibossRooms, ...debugMinibossRooms])],
    checkpoints,
    npcs: [...cells.values()].filter((cell) => cell.meta.npc),
    cloneStart,
  };
}

export function generateMaze(seed) {
  const rng = new Rng(seed);
  const graphRng = rng.fork('maze');
  const cells = generateGraph(graphRng);
  assignExits(cells, rng.fork('exits'));
  const special = assignSpecialRooms(cells, rng.fork('special'));

  const rooms = new Map();
  for (const cell of cells.values()) {
    rooms.set(cell.id, generateRoomForCell(cell, rng.fork(`room:${cell.id}`)));
  }

  return {
    seed: String(seed),
    cells,
    rooms,
    startId: idOf(START_COORD.x, START_COORD.y),
    startRoom: rooms.get(idOf(START_COORD.x, START_COORD.y)),
    stats: degreeStats(cells),
    special,
  };
}
