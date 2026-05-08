import { MAZE_SIZE } from './mazeGenerator.js';

const DEFAULT_COLORS = {
  panel: 'rgba(5, 6, 14, 0.78)',
  panelStroke: '#252a3a',
  hidden: 'rgba(12, 14, 24, 0.74)',
  shadow: '#202536',
  visited: '#45506a',
  path: '#72e4ff',
  start: '#e8e8f0',
  player: '#ffffff',
  checkpoint: '#58d4ff',
  checkpointLast: '#ffffff',
  npc: '#d985ff',
  miniboss: '#ff5c7a',
  cloneSnapshot: '#b7ff72',
  cloneSnapshotPrime: '#ffb347',
  teleportAnchor: '#ff8ad8',
};

function cellKey(id) {
  return String(id);
}

function isAdjacentToVisited(cell, visited) {
  for (const dir of cell.links) {
    const [x, y] = cell.id.split(',').map(Number);
    const target = {
      N: `${x},${y - 1}`,
      S: `${x},${y + 1}`,
      E: `${x + 1},${y}`,
      O: `${x - 1},${y}`,
    }[dir];
    if (visited.has(target)) return true;
  }
  return false;
}

export function createMinimapState(maze) {
  const state = {
    visited: new Set(),
    discoveredPoi: new Set(),
    pathEdges: [],
    currentId: maze.startId,
    lastCheckpointId: null,
    activatedCheckpoints: new Set(),
    legendUnlocked: new Set(),
    cloneSnapshots: [],
    teleportAnchorId: null,
  };
  visitRoomOnMinimap(state, maze, maze.startId);
  return state;
}

export function setCloneSnapshotsOnMinimap(state, snapshots) {
  state.cloneSnapshots = snapshots.map((snapshot) => ({
    id: snapshot.id,
    roomId: cellKey(snapshot.roomId),
    count: snapshot.count ?? 1,
    prime: snapshot.prime === true,
  }));
}

export function visitRoomOnMinimap(state, maze, roomId, options = {}) {
  const id = cellKey(roomId);
  const previousId = state.currentId;

  if (options.link !== false && previousId && previousId !== id) {
    const edgeKey = [previousId, id].sort().join('|');
    if (!state.pathEdges.some((edge) => edge.key === edgeKey)) {
      state.pathEdges.push({ key: edgeKey, from: previousId, to: id });
    }
  }

  state.currentId = id;
  state.visited.add(id);

  const cell = maze.cells.get(id);
  if (!cell) return;
  if (cell.meta.npc || cell.meta.miniboss || cell.meta.checkpoint) {
    state.discoveredPoi.add(id);
  }
}

export function activateCheckpointOnMinimap(state, roomId) {
  const id = cellKey(roomId);
  state.lastCheckpointId = id;
  state.activatedCheckpoints.add(id);
  state.discoveredPoi.add(id);
}

function drawDiamond(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fill();
}

function drawNpcMarker(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawCheckpointMarker(ctx, x, y, r, activated, active) {
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  if (activated) {
    ctx.strokeStyle = DEFAULT_COLORS.checkpoint;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x - r - 1.5, y - r - 1.5, r * 2 + 3, r * 2 + 3);
  }
  if (active) {
    ctx.strokeStyle = DEFAULT_COLORS.checkpointLast;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - r - 2, y - r - 2, r * 2 + 4, r * 2 + 4);
  }
}

function drawMarker(ctx, cell, x, y, size, state) {
  const markerSize = Math.max(2.3, size * 0.26);
  if (cell.meta.miniboss) {
    ctx.fillStyle = DEFAULT_COLORS.miniboss;
    drawDiamond(ctx, x, y, markerSize + 1);
  }
  if (cell.meta.npc) {
    ctx.fillStyle = DEFAULT_COLORS.npc;
    drawNpcMarker(ctx, x, y, markerSize);
  }
  if (cell.meta.checkpoint) {
    ctx.fillStyle = DEFAULT_COLORS.checkpoint;
    drawCheckpointMarker(
      ctx,
      x,
      y,
      markerSize,
      state.activatedCheckpoints?.has(cell.id),
      state.lastCheckpointId === cell.id,
    );
  }
}

function drawCloneSnapshot(ctx, x, y, size, count) {
  const r = Math.max(2.4, size * 0.2);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#111422';
  ctx.lineWidth = 1;
  ctx.stroke();
  if (count <= 1) return;
  ctx.fillStyle = '#111422';
  ctx.font = `${Math.max(5, Math.floor(size * 0.32))}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(Math.min(9, count)), x, y + 0.2);
}

function visibleCellsForMode(maze, state, options) {
  if (!options.local) return [...maze.cells.values()];

  const radius = options.radius ?? 2;
  const current = maze.cells.get(state.currentId);
  if (!current) return [];

  const cells = [];
  for (let y = current.y - radius; y <= current.y + radius; y += 1) {
    for (let x = current.x - radius; x <= current.x + radius; x += 1) {
      const cell = maze.cells.get(`${x},${y}`);
      if (cell) cells.push(cell);
    }
  }
  return cells;
}

function getMapGeometry(bounds, options, state, maze) {
  const padding = options.padding ?? 8;
  const availableW = bounds.w - padding * 2;
  const availableH = bounds.h - padding * 2;
  const visibleSize = options.local ? (options.radius ?? 2) * 2 + 1 : MAZE_SIZE;
  const gap = options.gap ?? Math.max(1, Math.floor(Math.min(availableW, availableH) * 0.018));
  const cell = Math.floor(Math.min(
    (availableW - gap * (visibleSize - 1)) / visibleSize,
    (availableH - gap * (visibleSize - 1)) / visibleSize,
  ));
  const mapW = cell * visibleSize + gap * (visibleSize - 1);
  const mapH = mapW;
  const current = maze.cells.get(state.currentId);
  const originX = options.local && current ? current.x - Math.floor(visibleSize / 2) : 0;
  const originY = options.local && current ? current.y - Math.floor(visibleSize / 2) : 0;
  return {
    x: bounds.x + (bounds.w - mapW) / 2,
    y: bounds.y + (bounds.h - mapH) / 2,
    cell,
    gap,
    step: cell + gap,
    originX,
    originY,
  };
}

function centerOfCell(geometry, cell) {
  return {
    x: geometry.x + (cell.x - geometry.originX) * geometry.step + geometry.cell / 2,
    y: geometry.y + (cell.y - geometry.originY) * geometry.step + geometry.cell / 2,
  };
}

export function renderMinimap(ctx, maze, state, bounds, options = {}) {
  const colors = { ...DEFAULT_COLORS, ...(options.colors ?? {}) };
  const geometry = getMapGeometry(bounds, options, state, maze);
  const visibleCells = visibleCellsForMode(maze, state, options);
  const visibleIds = new Set(visibleCells.map((cell) => cell.id));

  ctx.save();
  ctx.fillStyle = options.panelFill ?? colors.panel;
  ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
  ctx.strokeStyle = colors.panelStroke;
  ctx.lineWidth = 1;
  ctx.strokeRect(bounds.x + 0.5, bounds.y + 0.5, bounds.w - 1, bounds.h - 1);

  ctx.strokeStyle = colors.path;
  ctx.lineWidth = options.pathWidth ?? 2;
  ctx.globalAlpha = options.pathAlpha ?? 0.9;
  for (const edge of state.pathEdges) {
    const from = maze.cells.get(edge.from);
    const to = maze.cells.get(edge.to);
    if (!from || !to) continue;
    if (!visibleIds.has(from.id) || !visibleIds.has(to.id)) continue;
    const a = centerOfCell(geometry, from);
    const b = centerOfCell(geometry, to);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  for (const cell of visibleCells) {
    const visited = state.visited.has(cell.id);
    const shadow = !visited && isAdjacentToVisited(cell, state.visited);
    const x = geometry.x + (cell.x - geometry.originX) * geometry.step;
    const y = geometry.y + (cell.y - geometry.originY) * geometry.step;

    ctx.fillStyle = colors.hidden;
    if (shadow) ctx.fillStyle = colors.shadow;
    if (visited) ctx.fillStyle = cell.id === maze.startId ? colors.start : colors.visited;
    ctx.fillRect(x, y, geometry.cell, geometry.cell);

    if (visited) {
      const center = centerOfCell(geometry, cell);
      if (state.discoveredPoi.has(cell.id)) {
        drawMarker(ctx, cell, center.x, center.y, geometry.cell, state);
      }
    }
  }

  const current = maze.cells.get(state.currentId);
  const cloneSnapshots = new Map();
  for (const snapshot of state.cloneSnapshots ?? []) {
    const existing = cloneSnapshots.get(snapshot.roomId);
    if (existing) {
      existing.count += snapshot.count ?? 1;
      if (snapshot.prime) existing.prime = true;
    } else {
      cloneSnapshots.set(snapshot.roomId, { ...snapshot });
    }
  }

  for (const snapshot of cloneSnapshots.values()) {
    const cell = maze.cells.get(snapshot.roomId);
    if (!cell || !visibleIds.has(cell.id)) continue;
    const center = centerOfCell(geometry, cell);
    ctx.fillStyle = snapshot.prime ? colors.cloneSnapshotPrime : colors.cloneSnapshot;
    drawCloneSnapshot(ctx, center.x, center.y, geometry.cell, snapshot.count);
  }

  const teleportCell = state.teleportAnchorId ? maze.cells.get(state.teleportAnchorId) : null;
  if (teleportCell && visibleIds.has(teleportCell.id)) {
    const center = centerOfCell(geometry, teleportCell);
    const size = Math.max(3, geometry.cell * 0.28);
    ctx.strokeStyle = colors.teleportAnchor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(center.x, center.y - size);
    ctx.lineTo(center.x + size, center.y);
    ctx.lineTo(center.x, center.y + size);
    ctx.lineTo(center.x - size, center.y);
    ctx.closePath();
    ctx.stroke();
  }

  if (current && visibleIds.has(current.id)) {
    const center = centerOfCell(geometry, current);
    ctx.fillStyle = colors.player;
    ctx.beginPath();
    ctx.arc(center.x, center.y, Math.max(2.5, geometry.cell * 0.22), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
