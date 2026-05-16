import { COLORS, PICKUP } from '../config.js';
import { drawPickupSprite } from '../graphics/sprites.js';
import { addStack } from '../systems/inventory.js';
import { rectsOverlap } from '../systems/physics.js';

let nextPickupId = 1;

const PICKUP_GRAVITY = 1400;
const PICKUP_MAX_FALL = 900;

function coinSize(value) {
  return PICKUP.COIN_SIZES[value] ?? PICKUP.COIN_W;
}

function coinColor(value) {
  return PICKUP.COIN_COLORS[value] ?? PICKUP.COIN_COLORS[1] ?? COLORS.COIN;
}

function shouldFall(type) {
  return type === 'ability' || type === 'consumable' || type === 'food' || type === 'life';
}

export class Pickup {
  constructor(data) {
    this.id = nextPickupId;
    nextPickupId += 1;
    this.type = data.type ?? 'coin';
    this.amount = data.amount ?? 1;
    this.abilityId = data.abilityId ?? null;
    this.consumableId = data.consumableId ?? null;
    this.x = data.x;
    this.y = data.y;
    this.w = data.w ?? (this.type === 'coin' ? coinSize(this.amount) : 15);
    this.h = data.h ?? (this.type === 'coin' ? coinSize(this.amount) : 15);
    this.collected = false;
    this.bob = (this.id % 17) * 0.37;
    this.vy = 0;
    this.grounded = !shouldFall(this.type);
  }

  applyGravity(dt, solids) {
    if (this.grounded) return;
    this.vy = Math.min(PICKUP_MAX_FALL, this.vy + PICKUP_GRAVITY * dt);
    let dy = this.vy * dt;
    if (dy <= 0) return;
    if (!solids || solids.length === 0) {
      this.y += dy;
      return;
    }
    let landed = null;
    for (const s of solids) {
      if (this.x + this.w <= s.x || this.x >= s.x + s.w) continue;
      const top = s.y;
      if (this.y + this.h <= top && this.y + this.h + dy >= top) {
        const candidateDy = top - (this.y + this.h);
        if (landed === null || candidateDy < landed) landed = candidateDy;
      }
    }
    if (landed !== null) {
      this.y += landed;
      this.vy = 0;
      this.grounded = true;
    } else {
      this.y += dy;
    }
  }

  update(dt, player, solids) {
    this.bob += dt * 5;
    if (this.collected) return;
    this.applyGravity(dt, solids);
    if (!rectsOverlap(this, player)) return;

    if (this.type === 'coin') {
      player.addCoins(this.amount);
    } else if (this.type === 'life') {
      player.currentLife = Math.min(player.maxLifeSlots, player.currentLife + 1);
    } else if (this.type === 'food') {
      if (addStack(player, 'food', null, this.amount, { requireFullAmount: true }) <= 0) return;
    } else if (this.type === 'ability') {
      player.abilities ??= [];
      if (this.abilityId && !player.abilities.includes(this.abilityId)) {
        player.abilities.push(this.abilityId);
      }
    } else if (this.type === 'consumable') {
      if (this.consumableId) {
        if (addStack(player, 'consumable', this.consumableId, this.amount, { requireFullAmount: true }) <= 0) return;
      }
    }
    this.collected = true;
  }

  render(ctx) {
    if (this.collected) return;
    const bobOffset = this.grounded ? Math.sin(this.bob) * 1.5 : 0;
    const y = this.y + bobOffset;
    const color = this.type === 'coin' ? coinColor(this.amount) : undefined;
    drawPickupSprite(ctx, this, this.x, y, { color });
  }
}
