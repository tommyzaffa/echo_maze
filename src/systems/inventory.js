import { CONSUMABLE } from '../config.js';

export const STACK_MAX = CONSUMABLE.STACK_MAX ?? 10;

function clampStack(value) {
  const amount = Number.isFinite(value) ? Math.floor(value) : 0;
  return Math.max(0, Math.min(STACK_MAX, amount));
}

export function normalizeStackableInventory(player, consumables = []) {
  player.food = clampStack(player.food ?? 0);
  player.consumables ??= {};
  for (const consumable of consumables) {
    player.consumables[consumable.id] = clampStack(player.consumables[consumable.id] ?? 0);
  }
}

export function stackAmount(player, type, id = null) {
  if (type === 'food') return clampStack(player.food ?? 0);
  if (type === 'consumable' && id) return clampStack(player.consumables?.[id] ?? 0);
  return 0;
}

export function stackSpace(player, type, id = null) {
  return Math.max(0, STACK_MAX - stackAmount(player, type, id));
}

export function canAddStack(player, type, id = null, amount = 1) {
  return stackSpace(player, type, id) >= Math.max(1, Math.floor(amount));
}

export function addStack(player, type, id = null, amount = 1, options = {}) {
  const requested = Math.max(1, Math.floor(amount));
  const available = stackSpace(player, type, id);
  if (options.requireFullAmount && available < requested) return 0;
  const accepted = Math.min(requested, available);
  if (accepted <= 0) return 0;

  if (type === 'food') {
    player.food = stackAmount(player, 'food') + accepted;
  } else if (type === 'consumable' && id) {
    player.consumables ??= {};
    player.consumables[id] = stackAmount(player, 'consumable', id) + accepted;
  }
  return accepted;
}
