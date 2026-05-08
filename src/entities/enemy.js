import { COLORS, ENEMY, GRAVITY, ROOM_W, ROOM_H, SUPER_WEAPON, WALL_THICKNESS } from '../config.js';
import { drawCloneHitboxEffect, drawEnemyCorpse, drawEnemyProjectile, drawEnemySprite, drawShieldAura } from '../graphics/sprites.js';
import { moveAndCollide, rectsOverlap } from '../systems/physics.js';

let nextEnemyId = 1;

const TYPE_CONFIG = {
  walker: ENEMY.WALKER,
  flyer: ENEMY.FLYER,
  shooter: ENEMY.SHOOTER,
  charger: ENEMY.CHARGER,
  clone: ENEMY.CLONE,
  miniboss: ENEMY.MINIBOSS,
};

const TYPE_COLORS = {
  walker: COLORS.ENEMY_WALKER,
  flyer: COLORS.ENEMY_FLYER,
  shooter: COLORS.ENEMY_SHOOTER,
  charger: COLORS.ENEMY_CHARGER,
  clone: COLORS.ENEMY_CLONE,
  miniboss: COLORS.MINIBOSS,
};

function center(entity) {
  return {
    x: entity.x + entity.w / 2,
    y: entity.y + entity.h / 2,
  };
}

function normalize(x, y) {
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

function isOutsideRoom(entity) {
  return (
    entity.x < 0 ||
    entity.y < 0 ||
    entity.x + entity.w > ROOM_W ||
    entity.y + entity.h > ROOM_H
  );
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function seededRange(id, salt, min, max) {
  const unit = ((id * 37 + salt * 19) % 100) / 100;
  return min + (max - min) * unit;
}

function hasSupportAhead(entity, solids, direction) {
  const probeX = direction > 0
    ? entity.x + entity.w + ENEMY.EDGE_LOOKAHEAD
    : entity.x - ENEMY.EDGE_LOOKAHEAD;
  const probe = {
    x: probeX - 2,
    y: entity.y + entity.h,
    w: 4,
    h: ENEMY.EDGE_PROBE_H,
  };
  return solids.some((solid) => rectsOverlap(probe, solid));
}

function nearRoomSide(entity, direction) {
  if (direction < 0) return entity.x <= WALL_THICKNESS + 2;
  return entity.x + entity.w >= ROOM_W - WALL_THICKNESS - 2;
}

function hasOverheadClearance(entity, solids, height) {
  const probe = {
    x: entity.x + 4,
    y: entity.y - height,
    w: Math.max(4, entity.w - 8),
    h: height,
  };
  return !solids.some((solid) => !solid.oneWay && rectsOverlap(probe, solid));
}

export class EnemyProjectile {
  constructor(x, y, vx, vy, options = {}) {
    this.x = x;
    this.y = y;
    this.w = options.w ?? 8;
    this.h = options.h ?? 8;
    this.vx = vx;
    this.vy = vy;
    this.life = options.life ?? 3;
    this.dead = false;
    this.damage = options.damage ?? ENEMY.PROJECTILE_DAMAGE;
    this.kind = options.kind ?? 'enemy';
    this.owner = options.owner ?? null;
  }

  update(dt, solids) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
    if (isOutsideRoom(this)) {
      this.dead = true;
      return;
    }

    for (const solid of solids) {
      if (solid.oneWay) continue;
      if (rectsOverlap(this, solid)) {
        this.dead = true;
        return;
      }
    }
  }

  render(ctx) {
    drawEnemyProjectile(ctx, this);
  }
}

function pushProjectile(projectiles, x, y, vx, vy) {
  projectiles.push(new EnemyProjectile(x, y, vx, vy));
}

export class Enemy {
  constructor(data) {
    const cfg = TYPE_CONFIG[data.type] ?? TYPE_CONFIG.walker;
    this.id = nextEnemyId;
    nextEnemyId += 1;
    this.spawn = { ...data };
    this.type = data.type ?? 'walker';
    this.miniboss = data.miniboss ?? this.type === 'miniboss';
    this.archetype = data.archetype ?? 'warden';
    this.x = data.x;
    this.y = data.y;
    this.prevX = this.x;
    this.prevY = this.y;
    this.w = data.w ?? cfg.W;
    this.h = data.h ?? cfg.H;
    this.hp = data.hp ?? cfg.HP;
    this.maxHp = data.maxHp ?? this.hp;
    this.vx = data.vx ?? 0;
    this.vy = data.vy ?? 0;
    this.onGround = false;
    this.direction = data.direction ?? 1;
    this.shootTimer = data.shootTimer ?? 0.8;
    this.shooterAimDir = { x: this.direction, y: 0 };
    this.chargeTimer = 0;
    this.chargeRestTimer = 0;
    this.chargeFatigueTimer = 0;
    this.actionTimer = data.actionTimer ?? 0.9;
    this.wardenBurstShotsLeft = ENEMY.MINIBOSS.WARDEN_BURST_COUNT;
    this.wardenBurstPauseTimer = 0;
    this.sentinelPatternIndex = 0;
    this.sentinelWindupTimer = 0;
    this.sentinelExtendTimer = 0;
    this.sentinelExtendDir = { x: 1, y: 0 };
    this.sentinelExtendReach = ENEMY.MINIBOSS.SENTINEL_REACH;
    this.orbitAngle = seededRange(this.id, 5, 0, Math.PI * 2);
    this.orbiterVerticalDir = this.id % 2 === 0 ? 1 : -1;
    this.orbiterPulseTimer = 0;
    this.architectBlocks = [];
    this.architectTrapRect = null;
    this.architectShockTimer = 0;
    this.architectTrapShocked = false;
    this.mirageBombs = [];
    this.magnetarPulseTimer = 0;
    this.threaderNodes = [];
    this.threaderActiveTimer = 0;
    this.threaderPatternIndex = 0;
    this.threaderVerticalDir = this.id % 2 === 0 ? 1 : -1;
    this.bellowsBubbles = [];
    this.bellowsPatternIndex = 0;
    this.rainSpears = [];
    this.phaseMarkers = [];
    this.phaseWindupTimer = 0;
    this.phaseShockTimer = 0;
    this.phaseShockRects = [];
    this.phasePatternIndex = 0;
    this.phaseTarget = null;
    this.pendulumWarnTimer = 0;
    this.pendulumActiveTimer = 0;
    this.pendulumAnchor = null;
    this.pendulumPhase = 0;
    this.burrowWarnTimer = 0;
    this.burrowEruptTimer = 0;
    this.burrowTargetX = this.x + this.w / 2;
    this.burrowEscapeTimer = 0;
    this.burrowEscapeDir = this.direction;
    this.ricochetWarnTimer = 0;
    this.ricochetTimer = 0;
    this.ricochetDir = { x: this.direction, y: -0.55 };
    this.harpoonWarnTimer = 0;
    this.harpoonPullTimer = 0;
    this.harpoonAnchor = null;
    this.harpoonStart = null;
    this.harpoonTarget = null;
    this.harpoonPatternIndex = 0;
    this.chronosRifts = [];
    this.chronosPatternIndex = 0;
    this.prismNodes = [];
    this.prismActiveTimer = 0;
    this.prismPatternIndex = 0;
    this.sonarWarnTimer = 0;
    this.sonarPulseTimer = 0;
    this.sonarOrigin = null;
    this.lockjawWarnTimer = 0;
    this.lockjawWaves = [];
    this.roamTimer = seededRange(this.id, 1, ENEMY.MINIBOSS.ROAM_TURN_MIN, ENEMY.MINIBOSS.ROAM_TURN_MAX);
    this.roamJumpTimer = seededRange(this.id, 2, ENEMY.MINIBOSS.ROAM_JUMP_MIN, ENEMY.MINIBOSS.ROAM_JUMP_MAX);
    this.skimmerVerticalDir = this.id % 2 === 0 ? 1 : -1;
    this.hopperDropTimer = 0;
    this.hopperDropDir = this.direction;
    this.camouflageAlertTimer = 0;
    this.hurtTimer = 0;
    this.shieldKnockTimer = 0;
    this.poisonTimer = 0;
    this.poisonDps = 0;
    this.noDrop = data.noDrop ?? false;
    this.noSuperCharge = data.noSuperCharge ?? false;
    this.contactDamage = data.contactDamage ?? ENEMY.CONTACT_DAMAGE;
    this.globalCloneId = data.globalCloneId ?? null;
    this.clonePrime = data.clonePrime === true;
    this.cloneStats = data.cloneStats ? { ...data.cloneStats } : null;
    this.cloneSuperCharge = data.cloneSuperCharge ?? this.cloneStats?.superCharge ?? 0;
    this.cloneSuperCooldown = data.cloneSuperCooldown ?? 0;
    this.cloneSuperFireTimer = 0;
    this.cloneAiRoll = 0;
    this.cloneJumpTimer = seededRange(this.id, 17, 0.25, 0.55);
    this.cloneMeleeCooldown = seededRange(this.id, 18, 0.2, 0.5);
    this.cloneMeleeTimer = 0;
    this.cloneMeleeDir = { x: this.direction, y: 0 };
    this.cloneRetreatTimer = 0;
    this.cloneRetreatCooldown = seededRange(this.id, 19, 1.2, 2.8);
    this.cloneDashTimer = 0;
    this.cloneDashCooldown = seededRange(this.id, 20, 0.8, 1.8);
    this.cloneDashDir = this.direction;
    this.cloneRangedCooldown = seededRange(this.id, 21, 0.7, 1.8);
    this.cloneShieldTimer = 0;
    this.cloneShieldCooldown = seededRange(this.id, 22, 1.4, 2.8);
    this.cloneTeleportCooldown = seededRange(this.id, 23, 3.2, 5.4);
    this.cloneCamouflageTimer = 0;
    this.cloneCamouflageCooldown = seededRange(this.id, 24, 4.5, 8);
    this.cloneStopPulseTimer = 0;
    this.cloneStopPulseCooldown = seededRange(this.id, 25, 4.5, 8.5);
    this.cloneSlowPulseTimer = 0;
    this.cloneSlowPulseCooldown = seededRange(this.id, 26, 3.5, 7);
    this.cloneStuckTimer = 0;
    this.cloneGroundSlamActive = false;
    this.cloneGroundSlamImpactTimer = 0;
    this.cloneGroundSlamRecoveryTimer = 0;
    this.summonLife = data.summonLife ?? 0;
    this.canRevive = data.canRevive ?? this.type === 'clone';
    this.reviveTimer = 0;
    this.dead = false;
  }

  update(dt, player, solids, projectiles, options = {}) {
    if (this.dead) {
      this.updateCorpse(dt, solids);
      return;
    }

    this.prevX = this.x;
    this.prevY = this.y;
    if (this.updatePoison(dt)) return;
    if (this.summonLife > 0) {
      this.summonLife -= dt;
      if (this.summonLife <= 0) {
        this.dead = true;
        return;
      }
    }
    if (this.camouflageAlertTimer > 0) this.camouflageAlertTimer -= dt;
    if (this.hopperDropTimer > 0) this.hopperDropTimer -= dt;
    if (this.chargeRestTimer > 0) this.chargeRestTimer -= dt;
    if (this.wardenBurstPauseTimer > 0) this.wardenBurstPauseTimer -= dt;
    if (this.hurtTimer > 0) this.hurtTimer -= dt;
    if (this.shieldKnockTimer > 0) {
      this.updateShieldKnockback(dt, solids);
      return;
    }

    if (this.miniboss) {
      this.updateMiniboss(dt, player, solids, projectiles, options);
      return;
    }

    if (this.globalCloneId) {
      this.updateGlobalClone(dt, player, solids, projectiles, options);
      return;
    }

    if (this.type === 'flyer') {
      if (options.blind || options.stopped) return;
      this.updateFlyer(dt, player);
      this.keepInsideRoom();
      return;
    }

    if (this.type === 'shooter') {
      if (!options.blind && !options.stopped) this.updateShooter(dt, player, projectiles);
      this.vy += GRAVITY * dt;
      moveAndCollide(this, 0, this.vy * dt, solids);
      return;
    }

    if (options.stopped) {
      this.vx = 0;
    } else if (this.type === 'charger' && !options.blind) {
      this.updateCharger(dt, player, solids);
    } else {
      this.updateWalker();
    }

    this.turnAroundBeforeUnsafeEdge(solids);

    this.vy += GRAVITY * dt;
    const prevVx = this.vx;
    moveAndCollide(this, this.vx * dt, 0, solids);
    if (prevVx !== 0 && this.vx === 0) this.direction *= -1;
    moveAndCollide(this, 0, this.vy * dt, solids);
  }

  updateWalker() {
    const speed = this.type === 'clone' ? ENEMY.CLONE.SPEED : ENEMY.WALKER.SPEED;
    this.vx = this.direction * speed;
  }

  updateFlyer(dt, player) {
    const a = center(this);
    const b = center(player);
    const n = normalize(b.x - a.x, b.y - a.y);
    this.x += n.x * ENEMY.FLYER.SPEED * dt;
    this.y += n.y * ENEMY.FLYER.SPEED * dt;
  }

  updateShooter(dt, player, projectiles) {
    this.vx = 0;
    const a = center(this);
    const b = center(player);
    const n = normalize(b.x - a.x, b.y - a.y);
    this.shooterAimDir = n;
    if (Math.abs(n.x) > 0.08) this.direction = n.x >= 0 ? 1 : -1;
    this.shootTimer -= dt;
    if (this.shootTimer > 0) return;

    this.shootTimer = ENEMY.SHOOTER.SHOOT_INTERVAL;
    projectiles.push(new EnemyProjectile(
      a.x - 4,
      a.y - 4,
      n.x * ENEMY.PROJECTILE_SPEED,
      n.y * ENEMY.PROJECTILE_SPEED,
    ));
  }

  updateCharger(dt, player, solids) {
    const a = center(this);
    const b = center(player);
    const edgeBlocked = (dir) => this.onGround && (nearRoomSide(this, dir) || !hasSupportAhead(this, solids, dir));

    if (this.chargeRestTimer > 0) {
      if (edgeBlocked(this.direction)) {
        this.vx = 0;
      } else {
        this.vx = this.direction * ENEMY.CHARGER.SPEED;
      }
      return;
    }

    if (this.chargeTimer > 0) {
      this.chargeTimer -= dt;
      if (edgeBlocked(this.direction)) {
        this.chargeTimer = 0;
        this.chargeRestTimer = 0.5;
        this.direction *= -1;
        this.vx = this.direction * ENEMY.CHARGER.SPEED;
        return;
      }
      this.vx = this.direction * ENEMY.CHARGER.CHARGE_SPEED;
      return;
    }

    if (Math.abs(a.y - b.y) < 52 && Math.abs(a.x - b.x) < 210) {
      const targetDir = b.x >= a.x ? 1 : -1;
      if (edgeBlocked(targetDir)) {
        this.direction = -targetDir;
        this.chargeRestTimer = 0.45;
        this.vx = edgeBlocked(this.direction) ? 0 : this.direction * ENEMY.CHARGER.SPEED;
        return;
      }
      this.direction = targetDir;
      this.chargeTimer = 0.55;
      this.vx = this.direction * ENEMY.CHARGER.CHARGE_SPEED;
      return;
    }

    this.vx = this.direction * ENEMY.CHARGER.SPEED;
  }

  cloneWeaponLevel() {
    return this.cloneStats?.weaponLevel ?? 1;
  }

  cloneHasAbility(id) {
    return this.cloneStats?.abilities?.includes(id);
  }

  cloneHasConsumable(id) {
    const amount = this.cloneStats?.consumables?.[id];
    return amount > 0 || amount === Number.POSITIVE_INFINITY;
  }

  cloneRoll(min, max, salt = 0) {
    this.cloneAiRoll += 1;
    return seededRange(
      this.id + this.cloneAiRoll + Math.floor(this.x) * 3 + Math.floor(this.y) * 5,
      30 + salt,
      min,
      max,
    );
  }

  cloneMeleeCooldownForLevel() {
    return this.cloneWeaponLevel() >= 3
      ? ENEMY.CLONE.MELEE_COOLDOWN_L3
      : ENEMY.CLONE.MELEE_COOLDOWN_L1;
  }

  cloneMeleeDamage() {
    return this.cloneWeaponLevel() >= 4 ? ENEMY.CLONE.MELEE_DAMAGE_L4 : 1;
  }

  cloneSuperStats() {
    const level = this.cloneStats?.superWeaponLevel ?? SUPER_WEAPON.START_LEVEL;
    return SUPER_WEAPON.LEVELS[level] ?? SUPER_WEAPON.LEVELS[SUPER_WEAPON.START_LEVEL];
  }

  chargeCloneSuper(amount = 1) {
    if (!this.globalCloneId) return;
    const stats = this.cloneSuperStats();
    this.cloneSuperCharge = Math.min(
      stats.CHARGE_REQUIRED,
      this.cloneSuperCharge + amount * ENEMY.CLONE.SUPER_HIT_CHARGE,
    );
  }

  activateCloneShield() {
    if (!this.cloneHasAbility('shield') || this.cloneShieldCooldown > 0) return false;
    this.cloneShieldTimer = ENEMY.CLONE.SHIELD_TIME;
    this.cloneShieldCooldown = this.cloneRoll(
      ENEMY.CLONE.SHIELD_COOLDOWN_MIN,
      ENEMY.CLONE.SHIELD_COOLDOWN_MAX,
      1,
    );
    return true;
  }

  startCloneMelee(player) {
    if (this.cloneMeleeCooldown > 0) return false;
    const a = center(this);
    const b = center(player);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.abs(dy) > 30 && Math.abs(dy) > Math.abs(dx) * 0.7) {
      this.cloneMeleeDir = { x: 0, y: dy >= 0 ? 1 : -1 };
    } else {
      this.cloneMeleeDir = { x: dx >= 0 ? 1 : -1, y: 0 };
      this.direction = this.cloneMeleeDir.x;
    }
    this.cloneMeleeTimer = ENEMY.CLONE.MELEE_ACTIVE_TIME;
    this.cloneMeleeCooldown = this.cloneMeleeCooldownForLevel();
    return true;
  }

  fireCloneRanged(projectiles, player) {
    if (!this.cloneHasAbility('ranged_weapon') || this.cloneRangedCooldown > 0) return false;
    const a = center(this);
    const b = center(player);
    const n = normalize(b.x - a.x, b.y - a.y);
    projectiles.push(new EnemyProjectile(
      a.x - 4,
      a.y - 4,
      n.x * ENEMY.CLONE.RANGED_SPEED,
      n.y * ENEMY.CLONE.RANGED_SPEED,
      {
        kind: 'cloneRanged',
        owner: this,
        w: 8,
        h: 8,
        damage: ENEMY.CLONE.RANGED_DAMAGE,
        life: ENEMY.CLONE.RANGED_LIFE,
      },
    ));
    this.cloneRangedCooldown = this.cloneRoll(
      ENEMY.CLONE.RANGED_COOLDOWN_MIN,
      ENEMY.CLONE.RANGED_COOLDOWN_MAX,
      2,
    );
    return true;
  }

  fireCloneSuper(projectiles, player) {
    const stats = this.cloneSuperStats();
    const a = center(this);
    const b = center(player);
    const n = normalize(b.x - a.x, b.y - a.y);
    projectiles.push(new EnemyProjectile(
      a.x - stats.W / 2,
      a.y - stats.H / 2,
      n.x * stats.SPEED,
      n.y * stats.SPEED,
      {
        kind: 'cloneSuper',
        owner: this,
        w: stats.W,
        h: stats.H,
        life: SUPER_WEAPON.LIFE,
        damage: stats.DAMAGE,
      },
    ));
    this.cloneSuperCharge = 0;
    this.cloneSuperCooldown = ENEMY.CLONE.SUPER_COOLDOWN * ((this.cloneStats?.superWeaponLevel ?? 1) >= 2 ? 0.72 : 1);
    this.cloneSuperFireTimer = 0;
  }

  updateCloneSuper(dt, projectiles, player) {
    const stats = this.cloneSuperStats();
    if (this.cloneSuperCooldown > 0) this.cloneSuperCooldown -= dt;
    if (this.cloneSuperCharge < stats.CHARGE_REQUIRED) {
      this.cloneSuperFireTimer = 0;
      return;
    }

    if (this.cloneSuperFireTimer <= 0) {
      this.cloneSuperFireTimer = this.cloneRoll(
        ENEMY.CLONE.SUPER_FIRE_DELAY_MIN,
        ENEMY.CLONE.SUPER_FIRE_DELAY_MAX,
        3,
      );
      return;
    }

    this.cloneSuperFireTimer -= dt;
    if (this.cloneSuperFireTimer <= 0 && this.cloneSuperCooldown <= 0) {
      this.fireCloneSuper(projectiles, player);
    }
  }

  updateCloneAbilityTimers(dt) {
    if (this.cloneJumpTimer > 0) this.cloneJumpTimer -= dt;
    if (this.cloneMeleeCooldown > 0) this.cloneMeleeCooldown -= dt;
    if (this.cloneMeleeTimer > 0) this.cloneMeleeTimer -= dt;
    if (this.cloneRetreatTimer > 0) this.cloneRetreatTimer -= dt;
    if (this.cloneRetreatCooldown > 0) this.cloneRetreatCooldown -= dt;
    if (this.cloneDashTimer > 0) this.cloneDashTimer -= dt;
    if (this.cloneDashCooldown > 0) this.cloneDashCooldown -= dt;
    if (this.cloneRangedCooldown > 0) this.cloneRangedCooldown -= dt;
    if (this.cloneShieldTimer > 0) this.cloneShieldTimer -= dt;
    if (this.cloneShieldCooldown > 0) this.cloneShieldCooldown -= dt;
    if (this.cloneTeleportCooldown > 0) this.cloneTeleportCooldown -= dt;
    if (this.cloneCamouflageTimer > 0) this.cloneCamouflageTimer -= dt;
    if (this.cloneCamouflageCooldown > 0) this.cloneCamouflageCooldown -= dt;
    if (this.cloneStopPulseTimer > 0) this.cloneStopPulseTimer -= dt;
    if (this.cloneStopPulseCooldown > 0) this.cloneStopPulseCooldown -= dt;
    if (this.cloneSlowPulseTimer > 0) this.cloneSlowPulseTimer -= dt;
    if (this.cloneSlowPulseCooldown > 0) this.cloneSlowPulseCooldown -= dt;
    if (this.cloneGroundSlamImpactTimer > 0) this.cloneGroundSlamImpactTimer -= dt;
    if (this.cloneGroundSlamRecoveryTimer > 0) this.cloneGroundSlamRecoveryTimer -= dt;
  }

  tryCloneTeleportNearPlayer(player, solids) {
    if (!this.cloneHasConsumable('teleport') || this.cloneTeleportCooldown > 0) return false;
    const dirs = [player.x + player.w / 2 < ROOM_W / 2 ? 1 : -1, player.x + player.w / 2 < ROOM_W / 2 ? -1 : 1];
    const yCandidates = [
      player.y + player.h - this.h,
      player.y - this.h - 8,
      ROOM_H - WALL_THICKNESS - this.h,
    ];

    for (const dir of dirs) {
      for (const rawY of yCandidates) {
        const x = clamp(player.x + player.w / 2 + dir * 92 - this.w / 2, WALL_THICKNESS, ROOM_W - WALL_THICKNESS - this.w);
        const y = clamp(rawY, WALL_THICKNESS + 8, ROOM_H - WALL_THICKNESS - this.h);
        const rect = { x, y, w: this.w, h: this.h };
        if (solids.some((solid) => !solid.oneWay && rectsOverlap(rect, solid))) continue;
        this.x = x;
        this.y = y;
        this.prevX = x;
        this.prevY = y;
        this.vx = 0;
        this.vy = 0;
        this.onGround = false;
        this.cloneTeleportCooldown = this.cloneRoll(
          ENEMY.CLONE.TELEPORT_COOLDOWN_MIN,
          ENEMY.CLONE.TELEPORT_COOLDOWN_MAX,
          4,
        );
        return true;
      }
    }

    return false;
  }

  tryCloneStopPulse(distanceX, distanceY) {
    if (!this.cloneHasAbility('stop') || this.cloneStopPulseCooldown > 0) return false;
    if (Math.hypot(distanceX, distanceY) > ENEMY.CLONE.STOP_PULSE_RADIUS + 18) return false;
    this.cloneStopPulseTimer = ENEMY.CLONE.STOP_PULSE_TIME;
    this.cloneStopPulseCooldown = this.cloneRoll(
      ENEMY.CLONE.STOP_PULSE_COOLDOWN_MIN,
      ENEMY.CLONE.STOP_PULSE_COOLDOWN_MAX,
      5,
    );
    return true;
  }

  tryCloneSlowPulse(distanceX, distanceY) {
    if (!this.cloneHasConsumable('slow_time') || this.cloneSlowPulseCooldown > 0) return false;
    if (Math.hypot(distanceX, distanceY) > ENEMY.CLONE.SLOW_PULSE_RADIUS + 20) return false;
    this.cloneSlowPulseTimer = ENEMY.CLONE.SLOW_PULSE_TIME;
    this.cloneSlowPulseCooldown = this.cloneRoll(
      ENEMY.CLONE.SLOW_PULSE_COOLDOWN_MIN,
      ENEMY.CLONE.SLOW_PULSE_COOLDOWN_MAX,
      11,
    );
    return true;
  }

  updateGlobalClone(dt, player, solids, projectiles, options = {}) {
    if (options.stopped) {
      this.vx = 0;
      return;
    }

    this.updateCloneAbilityTimers(dt);
    if (this.cloneGroundSlamRecoveryTimer > 0) {
      this.vx = 0;
      this.vy += GRAVITY * dt;
      moveAndCollide(this, 0, this.vy * dt, solids);
      return;
    }

    if (options.blind) {
      this.vx = this.direction * ENEMY.WALKER.SPEED;
      this.vy += GRAVITY * dt;
      const prevVx = this.vx;
      moveAndCollide(this, this.vx * dt, 0, solids);
      if (prevVx !== 0 && this.vx === 0) this.direction *= -1;
      moveAndCollide(this, 0, this.vy * dt, solids);
      return;
    }

    const a = center(this);
    const b = center(player);
    const dirToPlayer = b.x >= a.x ? 1 : -1;
    const distanceX = Math.abs(b.x - a.x);
    const distanceY = b.y - a.y;
    const weaponLevel = this.cloneWeaponLevel();
    const speed = ENEMY.CLONE.SPEED + Math.max(0, weaponLevel - 1) * 9;
    const blockedAhead = nearRoomSide(this, dirToPlayer);
    const wantsDropThroughPlatform = distanceY > 34 && this.onGround;
    const movementSolids = wantsDropThroughPlatform
      ? solids.filter((solid) => !solid.oneWay)
      : solids;

    this.direction = dirToPlayer;

    if (
      this.cloneRetreatCooldown <= 0 &&
      distanceX < 62 &&
      Math.abs(distanceY) < 54 &&
      this.cloneRoll(0, 1, 6) > 0.54
    ) {
      this.cloneRetreatTimer = this.cloneRoll(
        ENEMY.CLONE.RETREAT_TIME_MIN,
        ENEMY.CLONE.RETREAT_TIME_MAX,
        7,
      );
      this.cloneRetreatCooldown = this.cloneRoll(
        ENEMY.CLONE.RETREAT_COOLDOWN_MIN,
        ENEMY.CLONE.RETREAT_COOLDOWN_MAX,
        8,
      );
      if (this.cloneHasConsumable('camouflage') && this.cloneCamouflageCooldown <= 0) {
        this.cloneCamouflageTimer = ENEMY.CLONE.CAMOUFLAGE_TIME;
        this.cloneCamouflageCooldown = this.cloneRoll(
          ENEMY.CLONE.CAMOUFLAGE_COOLDOWN_MIN,
          ENEMY.CLONE.CAMOUFLAGE_COOLDOWN_MAX,
          9,
        );
      }
    }

    if (
      this.cloneHasAbility('dash') &&
      this.cloneDashCooldown <= 0 &&
      this.cloneDashTimer <= 0 &&
      (distanceX > 92 || this.cloneRetreatTimer > 0 || blockedAhead)
    ) {
      this.cloneDashDir = this.cloneRetreatTimer > 0 ? -dirToPlayer : dirToPlayer;
      this.cloneDashTimer = ENEMY.CLONE.DASH_TIME;
      this.cloneDashCooldown = this.cloneRoll(
        ENEMY.CLONE.DASH_COOLDOWN_MIN,
        ENEMY.CLONE.DASH_COOLDOWN_MAX,
        10,
      );
    }

    if (this.cloneRetreatTimer > 0) {
      this.vx = -dirToPlayer * speed * 0.92;
    } else {
      this.vx = dirToPlayer * speed;
    }

    if (this.cloneDashTimer > 0) {
      this.vx = this.cloneDashDir * ENEMY.CLONE.DASH_SPEED;
      this.vy = Math.min(this.vy, 40);
    }

    if (
      distanceX < ENEMY.CLONE.MELEE_RANGE + 18 &&
      Math.abs(distanceY) < ENEMY.CLONE.MELEE_RANGE + 12
    ) {
      this.startCloneMelee(player);
    }

    if (distanceX > 84 && distanceX < 285 && Math.abs(distanceY) < 118) {
      this.fireCloneRanged(projectiles, player);
    }

    this.tryCloneStopPulse(distanceX, distanceY);
    this.tryCloneSlowPulse(distanceX, distanceY);
    this.updateCloneSuper(dt, projectiles, player);

    const wantsJump = (
      this.onGround &&
      this.cloneJumpTimer <= 0 &&
      hasOverheadClearance(this, solids, 44) &&
      (
        distanceY < -18 ||
        (blockedAhead && distanceX > 34) ||
        (distanceX > 106 && Math.abs(distanceY) < 50) ||
        (this.cloneStuckTimer > 0.25 && distanceX > 38)
      )
    );
    if (wantsJump) {
      this.vy = -ENEMY.CLONE.JUMP_VELOCITY * (this.cloneHasAbility('double_jump') ? 1.08 : 1);
      this.onGround = false;
      this.cloneJumpTimer = seededRange(this.id + Math.floor(this.x + this.y), 18, 0.35, 0.72);
    }

    if (
      this.cloneHasAbility('ground_slam') &&
      !this.cloneGroundSlamActive &&
      !this.onGround &&
      distanceY > 30 &&
      distanceX < 64 &&
      this.vy < ENEMY.CLONE.JUMP_VELOCITY
    ) {
      this.cloneGroundSlamActive = true;
      this.vy = Math.max(this.vy, ENEMY.CLONE.JUMP_VELOCITY * 1.8);
    }

    if (wantsDropThroughPlatform) this.y += 4;

    this.vy += GRAVITY * dt;
    const startX = this.x;
    const wasOnGround = this.onGround;
    const prevVx = this.vx;
    moveAndCollide(this, this.vx * dt, 0, movementSolids);
    if (prevVx !== 0 && this.vx === 0 && this.onGround && hasOverheadClearance(this, solids, 38)) {
      this.vy = -ENEMY.CLONE.JUMP_VELOCITY * 0.72;
      this.onGround = false;
    }
    moveAndCollide(this, 0, this.vy * dt, movementSolids);
    if (!wasOnGround && this.onGround && this.cloneGroundSlamActive) {
      this.cloneGroundSlamImpactTimer = ENEMY.CLONE.STOP_PULSE_TIME;
      this.cloneGroundSlamRecoveryTimer = ENEMY.CLONE.GROUND_SLAM_RECOVERY_TIME;
      this.cloneGroundSlamActive = false;
    }

    if (Math.abs(this.x - startX) < 0.5 && distanceX > 42) this.cloneStuckTimer += dt;
    else this.cloneStuckTimer = Math.max(0, this.cloneStuckTimer - dt * 2);

    if (this.cloneStuckTimer > 0.85) {
      if (this.tryCloneTeleportNearPlayer(player, solids)) this.cloneStuckTimer = 0;
    }
  }

  updateMiniboss(dt, player, solids, projectiles, options) {
    if (options.stopped) {
      this.vx = 0;
      if (!['skimmer', 'orbiter', 'threader', 'sawbloom', 'prism'].includes(this.archetype)) {
        this.vy += GRAVITY * dt;
        moveAndCollide(this, 0, this.vy * dt, solids);
      }
      return;
    }

    const a = center(this);
    const b = center(player);
    const dirToPlayer = b.x >= a.x ? 1 : -1;
    const wasOnGround = this.onGround;
    const playerBelowHopper = (
      this.archetype === 'hopper' &&
      b.y > a.y + ENEMY.MINIBOSS.HOPPER_PLAYER_BELOW_GAP
    );

    if (
      playerBelowHopper &&
      this.onGround &&
      this.hopperDropTimer <= 0
    ) {
      this.hopperDropTimer = ENEMY.MINIBOSS.HOPPER_DROP_CHASE_TIME;
      this.hopperDropDir = Math.abs(b.x - a.x) > 36
        ? dirToPlayer
        : this.direction;
    }

    if (this.archetype === 'hopper' && this.hopperDropTimer > 0) {
      this.direction = this.hopperDropDir;
    } else if (this.archetype === 'hopper' && !options.blind) {
      this.direction = dirToPlayer;
    }

    if (this.archetype === 'skimmer') {
      this.updateMinibossRoam(dt, solids, 0.78, false, false);
      this.x += this.vx * dt;
      this.y += this.skimmerVerticalDir * ENEMY.MINIBOSS.SPEED * 0.46 * dt;
      if (
        this.y <= WALL_THICKNESS + 30 ||
        this.y + this.h >= ROOM_H - WALL_THICKNESS - 38
      ) {
        this.skimmerVerticalDir *= -1;
      }
      this.actionTimer -= dt;
      if (!options.blind && this.actionTimer <= 0) {
        this.actionTimer = ENEMY.MINIBOSS.SHOOT_INTERVAL * 1.25;
        this.fireSkimmerPattern(projectiles, player);
      }
      this.keepInsideRoom();
      if (
        this.x <= WALL_THICKNESS + 1 ||
        this.x + this.w >= ROOM_W - WALL_THICKNESS - 1
      ) {
        this.direction *= -1;
      }
      return;
    }

    if (this.archetype === 'volley') {
      this.updateMinibossRoam(dt, solids, 0.44, true, true);
      this.actionTimer -= dt;
      if (!options.blind && this.actionTimer <= 0) {
        this.actionTimer = ENEMY.MINIBOSS.SHOOT_INTERVAL;
        const n = normalize(b.x - a.x, b.y - a.y);
        for (const spread of [-0.32, 0, 0.32]) {
          pushProjectile(
            projectiles,
            a.x - 4,
            a.y - 4,
            (n.x + spread) * ENEMY.MINIBOSS.PROJECTILE_SPEED,
            n.y * ENEMY.MINIBOSS.PROJECTILE_SPEED,
          );
        }
      }
    } else if (this.archetype === 'sentinel') {
      this.updateMinibossRoam(dt, solids, 0.68, true, true);
      if (this.sentinelWindupTimer > 0) {
        this.sentinelWindupTimer -= dt;
        this.vx *= 0.2;
        if (this.sentinelWindupTimer <= 0) {
          this.sentinelExtendTimer = ENEMY.MINIBOSS.SENTINEL_EXTEND_TIME;
        }
      } else if (this.sentinelExtendTimer > 0) {
        this.sentinelExtendTimer -= dt;
        this.vx *= 0.16;
      } else {
        this.actionTimer -= dt;
        if (!options.blind && this.actionTimer <= 0) {
          this.startSentinelStretch(player, solids);
        }
      }
    } else if (this.archetype === 'orbiter') {
      this.updateMinibossRoam(dt, solids, 0.72, false, true);
      this.x += this.vx * dt;
      this.y += this.orbiterVerticalDir * ENEMY.MINIBOSS.SPEED * 0.42 * dt;
      if (
        this.y <= WALL_THICKNESS + 28 ||
        this.y + this.h >= ROOM_H - WALL_THICKNESS - 44
      ) {
        this.orbiterVerticalDir *= -1;
      }
      this.orbitAngle += ENEMY.MINIBOSS.ORBITER_ROTATE_SPEED * dt;
      if (this.orbiterPulseTimer > 0) this.orbiterPulseTimer -= dt;
      this.actionTimer -= dt;
      if (!options.blind && this.actionTimer <= 0) {
        this.orbiterPulseTimer = ENEMY.MINIBOSS.ORBITER_PULSE_TIME;
        this.actionTimer = ENEMY.MINIBOSS.ORBITER_COOLDOWN;
      }
      this.keepInsideRoom();
      if (
        this.x <= WALL_THICKNESS + 1 ||
        this.x + this.w >= ROOM_W - WALL_THICKNESS - 1
      ) {
        this.direction *= -1;
      }
      return;
    } else if (this.archetype === 'architect') {
      this.updateArchitectTrap(dt);
      this.updateMinibossRoam(dt, solids, 0.5, true, true);
      if (this.architectBlocks.length === 0) {
        this.actionTimer -= dt;
        if (!options.blind && this.actionTimer <= 0) {
          this.startArchitectTrap(player);
        }
      }
    } else if (this.archetype === 'mirage') {
      this.updateMirageBombs(dt);
      this.updateMinibossRoam(dt, solids, 0.74, true, true);
      this.actionTimer -= dt;
      if (!options.blind && this.actionTimer <= 0) {
        this.startMirageBombs(player);
      }
    } else if (this.archetype === 'magnetar') {
      this.updateMinibossRoam(dt, solids, 0.46, true, true);
      if (this.magnetarPulseTimer > 0) {
        this.magnetarPulseTimer -= dt;
        if (!options.blind) this.pullPlayerIntoMagnetar(player, dt);
      }
      this.actionTimer -= dt;
      if (!options.blind && this.actionTimer <= 0) {
        this.magnetarPulseTimer = ENEMY.MINIBOSS.MAGNETAR_PULSE_TIME;
        this.actionTimer = ENEMY.MINIBOSS.MAGNETAR_COOLDOWN;
      }
    } else if (this.archetype === 'threader') {
      this.updateThreaderWeave(dt);
      this.updateMinibossRoam(dt, solids, 0.58, false, true);
      this.x += this.vx * dt;
      this.y += this.threaderVerticalDir * ENEMY.MINIBOSS.SPEED * 0.38 * dt;
      if (
        this.y <= WALL_THICKNESS + 30 ||
        this.y + this.h >= ROOM_H - WALL_THICKNESS - 42
      ) {
        this.threaderVerticalDir *= -1;
      }
      if (this.threaderNodes.length === 0) {
        this.actionTimer -= dt;
        if (!options.blind && this.actionTimer <= 0) {
          this.startThreaderWeave(player);
        }
      }
      this.keepInsideRoom();
      if (
        this.x <= WALL_THICKNESS + 1 ||
        this.x + this.w >= ROOM_W - WALL_THICKNESS - 1
      ) {
        this.direction *= -1;
      }
      return;
    } else if (this.archetype === 'bellows') {
      this.updateBellowsBubbles(dt, player, options);
      this.updateMinibossRoam(dt, solids, 0.44, true, true);
      if (this.bellowsBubbles.length === 0) {
        this.actionTimer -= dt;
        if (!options.blind && this.actionTimer <= 0) {
          this.startBellowsBubbles(player);
        }
      }
    } else if (this.archetype === 'rainmaker') {
      this.updateRainSpears(dt);
      this.updateMinibossRoam(dt, solids, 0.58, true, true);
      this.actionTimer -= dt;
      if (!options.blind && this.actionTimer <= 0) {
        this.startRainSpears(player);
      }
    } else if (this.archetype === 'phase') {
      this.updatePhaseTrick(dt);
      if (this.phaseWindupTimer > 0) {
        this.vx = 0;
      } else {
        if (options.blind) this.updateMinibossRoam(dt, solids, 0.76, true, true);
        else this.updatePhaseChase(dt, player, solids);
        this.actionTimer -= dt;
        if (!options.blind && this.actionTimer <= 0) {
          this.startPhaseTrick(player);
        }
      }
    } else if (this.archetype === 'sawbloom') {
      this.updatePendulum(dt);
      this.updateMinibossRoam(dt, solids, 0.62, false, true);
      this.x += this.vx * dt;
      this.y += this.orbiterVerticalDir * ENEMY.MINIBOSS.SPEED * 0.42 * dt;
      if (
        this.y <= WALL_THICKNESS + 34 ||
        this.y + this.h >= ROOM_H - WALL_THICKNESS - 48
      ) {
        this.orbiterVerticalDir *= -1;
      }
      if (this.pendulumWarnTimer <= 0 && this.pendulumActiveTimer <= 0) {
        this.actionTimer -= dt;
        if (!options.blind && this.actionTimer <= 0) {
          this.startPendulum(player);
        }
      }
      this.keepInsideRoom();
      if (
        this.x <= WALL_THICKNESS + 1 ||
        this.x + this.w >= ROOM_W - WALL_THICKNESS - 1
      ) {
        this.direction *= -1;
      }
      return;
    } else if (this.archetype === 'burrower') {
      this.updateBurrower(dt);
      if (this.burrowWarnTimer <= 0 && this.burrowEruptTimer <= 0) {
        this.updateBurrowerFlee(dt, player, solids);
        this.actionTimer -= dt;
        if (!options.blind && this.actionTimer <= 0) {
          this.startBurrow(player);
        }
      } else {
        this.vx = 0;
      }
    } else if (this.archetype === 'ricochet') {
      this.updateRicochetAttack(dt, solids, player);
      if (this.ricochetTimer > 0) return;
      if (this.ricochetWarnTimer > 0) {
        this.vx = 0;
      } else {
        this.updateMinibossRoam(dt, solids, 0.52, true, true);
        this.actionTimer -= dt;
        if (!options.blind && this.actionTimer <= 0) {
          this.startRicochet(player);
        }
      }
    } else if (this.archetype === 'harpoon') {
      this.updateHarpoon(dt);
      if (this.harpoonPullTimer > 0) return;
      if (this.harpoonWarnTimer > 0) {
        this.vx = 0;
      } else {
        this.updateMinibossRoam(dt, solids, 0.62, true, true);
        this.actionTimer -= dt;
        if (!options.blind && this.actionTimer <= 0) {
          this.startHarpoon(player);
        }
      }
    } else if (this.archetype === 'chronos') {
      this.updateChronos(dt);
      if (this.chronosRifts.some((rift) => rift.warn > 0)) {
        this.vx = 0;
      } else {
        this.updateMinibossRoam(dt, solids, 0.64, true, true);
      }
      if (this.chronosRifts.length === 0) {
        this.actionTimer -= dt;
        if (!options.blind && this.actionTimer <= 0) {
          this.startChronosRifts(player);
        }
      }
    } else if (this.archetype === 'prism') {
      this.updatePrism(dt);
      this.updateMinibossRoam(dt, solids, 0.58, false, true);
      this.x += this.vx * dt;
      this.y += this.threaderVerticalDir * ENEMY.MINIBOSS.SPEED * 0.34 * dt;
      if (
        this.y <= WALL_THICKNESS + 34 ||
        this.y + this.h >= ROOM_H - WALL_THICKNESS - 44
      ) {
        this.threaderVerticalDir *= -1;
      }
      if (this.prismNodes.length === 0) {
        this.actionTimer -= dt;
        if (!options.blind && this.actionTimer <= 0) {
          this.startPrismTrap(player);
        }
      }
      this.keepInsideRoom();
      if (
        this.x <= WALL_THICKNESS + 1 ||
        this.x + this.w >= ROOM_W - WALL_THICKNESS - 1
      ) {
        this.direction *= -1;
      }
      return;
    } else if (this.archetype === 'sonar') {
      this.updateSonar(dt);
      this.updateMinibossRoam(dt, solids, 0.52, true, true);
      if (this.sonarWarnTimer <= 0 && this.sonarPulseTimer <= 0) {
        this.actionTimer -= dt;
        if (!options.blind && this.actionTimer <= 0) {
          this.startSonarPulse();
        }
      }
    } else if (this.archetype === 'lockjaw') {
      this.updateLockjaw(dt);
      this.updateLockjawMove(dt, solids);
      if (this.lockjawWarnTimer <= 0 && this.lockjawWaves.length === 0) {
        this.actionTimer -= dt;
        if (!options.blind && this.actionTimer <= 0) {
          this.startLockjaw();
        }
      }
    } else if (this.archetype === 'hopper') {
      const droppingToLowerLevel = this.hopperDropTimer > 0;
      this.vx = this.direction * ENEMY.MINIBOSS.SPEED * (droppingToLowerLevel ? 1.12 : 0.72);
      this.actionTimer -= dt;
      const hasHeadroom = hasOverheadClearance(this, solids, ENEMY.MINIBOSS.HOPPER_HEADROOM);
      if (!options.blind && !droppingToLowerLevel && this.onGround && this.actionTimer <= 0 && hasHeadroom) {
        this.actionTimer = 1.05;
        this.vx = dirToPlayer * ENEMY.MINIBOSS.CHARGE_SPEED * 0.72;
        this.vy = -ENEMY.MINIBOSS.JUMP_VELOCITY;
        this.onGround = false;
      } else if (!hasHeadroom) {
        this.actionTimer = Math.max(this.actionTimer, ENEMY.MINIBOSS.HOPPER_LANDING_RUN_TIME);
      }
    } else if (this.archetype === 'charger') {
      if (this.chargeRestTimer > 0) {
        this.vx = 0;
      } else if (this.chargeTimer > 0) {
        this.chargeTimer -= dt;
        this.chargeFatigueTimer += dt;
        this.vx = this.direction * ENEMY.MINIBOSS.CHARGE_SPEED;
        if (this.chargeTimer <= 0) {
          this.vx = 0;
        }
        if (this.chargeFatigueTimer >= ENEMY.MINIBOSS.CHARGER_FATIGUE_TIME) {
          this.chargeTimer = 0;
          this.chargeFatigueTimer = 0;
          this.vx = 0;
          this.chargeRestTimer = ENEMY.MINIBOSS.CHARGER_REST_TIME;
        }
      } else {
        this.updateMinibossRoam(dt, solids, 0.65, true, true);
        if (!options.blind && Math.abs(a.y - b.y) < 64 && Math.abs(a.x - b.x) < 260) {
          this.direction = dirToPlayer;
          this.chargeTimer = 0.64;
          this.vx = this.direction * ENEMY.MINIBOSS.CHARGE_SPEED;
        }
      }
    } else {
      this.updateMinibossRoam(dt, solids, 0.82, true, true);
      if (!options.blind) this.updateWardenBurst(dt, player, projectiles);
    }

    this.vy += GRAVITY * dt;
    const prevVx = this.vx;
    moveAndCollide(this, this.vx * dt, 0, solids);
    if (prevVx !== 0 && this.vx === 0) {
      this.direction *= -1;
      if (this.archetype === 'hopper') this.hopperDropDir = this.direction;
    }
    moveAndCollide(this, 0, this.vy * dt, solids);
    if (this.archetype === 'hopper' && !wasOnGround && this.onGround) {
      this.hopperDropTimer = 0;
      this.actionTimer = Math.max(this.actionTimer, ENEMY.MINIBOSS.HOPPER_LANDING_RUN_TIME);
    }
  }

  updateMinibossRoam(dt, solids, speedScale = 1, canJump = true, canTurn = true) {
    if (canTurn) {
      this.roamTimer -= dt;
      if (this.roamTimer <= 0) {
        this.direction *= -1;
        this.roamTimer = seededRange(
          this.id + Math.floor(this.x + this.y),
          3,
          ENEMY.MINIBOSS.ROAM_TURN_MIN,
          ENEMY.MINIBOSS.ROAM_TURN_MAX,
        );
      }
    }

    this.vx = this.direction * ENEMY.MINIBOSS.SPEED * speedScale;
    if (!canJump) return;

    this.roamJumpTimer -= dt;
    const hasHeadroom = hasOverheadClearance(this, solids, ENEMY.MINIBOSS.HOPPER_HEADROOM);
    if (this.onGround && this.roamJumpTimer <= 0 && hasHeadroom) {
      this.vy = -ENEMY.MINIBOSS.JUMP_VELOCITY * 0.52;
      this.onGround = false;
      this.roamJumpTimer = seededRange(
        this.id + Math.floor(this.x),
        4,
        ENEMY.MINIBOSS.ROAM_JUMP_MIN,
        ENEMY.MINIBOSS.ROAM_JUMP_MAX,
      );
    }
  }

  updateWardenBurst(dt, player, projectiles) {
    if (this.wardenBurstPauseTimer > 0) return;
    this.actionTimer -= dt;
    if (this.actionTimer > 0) return;

    const a = center(this);
    const b = center(player);
    const n = normalize(b.x - a.x, b.y - a.y);
    pushProjectile(
      projectiles,
      a.x - 4,
      a.y - 4,
      n.x * ENEMY.MINIBOSS.PROJECTILE_SPEED * 0.88,
      n.y * ENEMY.MINIBOSS.PROJECTILE_SPEED * 0.88,
    );

    this.wardenBurstShotsLeft -= 1;
    if (this.wardenBurstShotsLeft <= 0) {
      this.wardenBurstShotsLeft = ENEMY.MINIBOSS.WARDEN_BURST_COUNT;
      this.wardenBurstPauseTimer = ENEMY.MINIBOSS.WARDEN_BURST_PAUSE;
      this.actionTimer = 0;
    } else {
      this.actionTimer = ENEMY.MINIBOSS.WARDEN_BURST_INTERVAL;
    }
  }

  fireSkimmerPattern(projectiles, player) {
    const centerPoint = center(this);
    const patterns = [
      [[1, 0], [-1, 0], [0, 1], [0, -1]],
      [[1, 1], [1, -1], [-1, 1], [-1, -1]],
    ];
    const pattern = patterns[this.skimmerPatternIndex ?? 0];
    this.skimmerPatternIndex = ((this.skimmerPatternIndex ?? 0) + 1) % patterns.length;

    for (const [dx, dy] of pattern) {
      const n = normalize(dx, dy);
      pushProjectile(
        projectiles,
        centerPoint.x - 4,
        centerPoint.y - 4,
        n.x * ENEMY.MINIBOSS.PROJECTILE_SPEED,
        n.y * ENEMY.MINIBOSS.PROJECTILE_SPEED,
      );
    }

    const target = center(player);
    const aimed = normalize(target.x - centerPoint.x, target.y - centerPoint.y);
    pushProjectile(
      projectiles,
      centerPoint.x - 4,
      centerPoint.y - 4,
      aimed.x * ENEMY.MINIBOSS.PROJECTILE_SPEED,
      aimed.y * ENEMY.MINIBOSS.PROJECTILE_SPEED,
    );
  }

  startSentinelStretch(player, solids) {
    const a = center(this);
    const b = center(player);
    const horizontalGap = b.x - a.x;
    const verticalGap = b.y - a.y;
    const diagonalIntent = (
      Math.abs(horizontalGap) > 36 &&
      Math.abs(verticalGap) > 34 &&
      this.sentinelPatternIndex % 3 !== 0
    );
    const shouldStrikeVertical = (
      !diagonalIntent &&
      Math.abs(verticalGap) > 46 &&
      this.sentinelPatternIndex % 2 === 1
    );

    if (diagonalIntent) {
      this.sentinelExtendDir = {
        x: horizontalGap >= 0 ? 1 : -1,
        y: verticalGap >= 0 ? 1 : -1,
      };
    } else {
      this.sentinelExtendDir = shouldStrikeVertical
        ? { x: 0, y: verticalGap >= 0 ? 1 : -1 }
        : { x: horizontalGap >= 0 ? 1 : -1, y: 0 };
    }

    this.sentinelExtendReach = this.computeSentinelReach(solids, this.sentinelExtendDir);
    this.sentinelWindupTimer = ENEMY.MINIBOSS.SENTINEL_WINDUP_TIME;
    this.sentinelExtendTimer = 0;
    this.sentinelPatternIndex += 1;
    this.actionTimer = ENEMY.MINIBOSS.SENTINEL_EXTEND_COOLDOWN;
  }

  computeSentinelReach(solids, dir) {
    const thickness = ENEMY.MINIBOSS.SENTINEL_THICKNESS;
    const maxReach = ENEMY.MINIBOSS.SENTINEL_REACH;
    const origin = this.getSentinelArmOrigin(this.x, this.y, dir);
    const unit = normalize(dir.x, dir.y);
    const step = 6;

    for (let distance = step; distance <= maxReach; distance += step) {
      const probe = {
        x: origin.x + unit.x * distance - thickness / 2,
        y: origin.y + unit.y * distance - thickness / 2,
        w: thickness,
        h: thickness,
      };
      const outsideInnerRoom = (
        probe.x < WALL_THICKNESS ||
        probe.y < WALL_THICKNESS ||
        probe.x + probe.w > ROOM_W - WALL_THICKNESS ||
        probe.y + probe.h > ROOM_H - WALL_THICKNESS
      );
      const blocked = solids.some((solid) => !solid.oneWay && rectsOverlap(probe, solid));
      if (outsideInnerRoom || blocked) return Math.max(0, distance - step);
    }

    return maxReach;
  }

  getSentinelStretchProgress() {
    if (this.sentinelExtendTimer <= 0) return 0;
    const t = 1 - this.sentinelExtendTimer / ENEMY.MINIBOSS.SENTINEL_EXTEND_TIME;
    if (t < 0.36) return t / 0.36;
    if (t < 0.74) return 1;
    return Math.max(0, 1 - (t - 0.74) / 0.26);
  }

  getSentinelArmOrigin(x = this.x, y = this.y, dir = this.sentinelExtendDir) {
    return {
      x: x + this.w / 2 + (dir.x !== 0 ? dir.x * this.w / 2 : 0),
      y: y + this.h / 2 + (dir.y !== 0 ? dir.y * this.h / 2 : 0),
    };
  }

  getSentinelArmLine(x = this.x, y = this.y) {
    const progress = this.getSentinelStretchProgress();
    const reach = this.sentinelExtendReach * progress;
    if (reach < 8) return null;

    const origin = this.getSentinelArmOrigin(x, y);
    const unit = normalize(this.sentinelExtendDir.x, this.sentinelExtendDir.y);
    return {
      x1: origin.x,
      y1: origin.y,
      x2: origin.x + unit.x * reach,
      y2: origin.y + unit.y * reach,
    };
  }

  getSentinelHitboxes(x = this.x, y = this.y) {
    const line = this.getSentinelArmLine(x, y);
    if (!line) return [];

    const thickness = ENEMY.MINIBOSS.SENTINEL_THICKNESS;
    const unit = normalize(this.sentinelExtendDir.x, this.sentinelExtendDir.y);
    const length = Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
    const step = Math.max(8, thickness * 0.72);
    const boxes = [];
    for (let distance = step / 2; distance <= length; distance += step) {
      boxes.push({
        x: line.x1 + unit.x * distance - thickness / 2,
        y: line.y1 + unit.y * distance - thickness / 2,
        w: thickness,
        h: thickness,
        owner: this,
      });
    }
    return boxes;
  }

  getSentinelHitbox(x = this.x, y = this.y) {
    const boxes = this.getSentinelHitboxes(x, y);
    if (boxes.length === 0) return null;
    const x0 = Math.min(...boxes.map((box) => box.x));
    const y0 = Math.min(...boxes.map((box) => box.y));
    const x1 = Math.max(...boxes.map((box) => box.x + box.w));
    const y1 = Math.max(...boxes.map((box) => box.y + box.h));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, owner: this };
  }

  updateArchitectTrap(dt) {
    if (this.architectBlocks.length === 0) return;

    const speed = ENEMY.MINIBOSS.ARCHITECT_BLOCK_SPEED;
    for (const block of this.architectBlocks) {
      if (block.phase !== 'approach') continue;
      const dx = block.targetX - block.x;
      const dy = block.targetY - block.y;
      const distance = Math.hypot(dx, dy);
      const move = speed * dt;
      if (distance <= move) {
        block.x = block.targetX;
        block.y = block.targetY;
        block.phase = 'closed';
      } else {
        block.x += dx / distance * move;
        block.y += dy / distance * move;
      }
    }

    if (
      !this.architectTrapShocked &&
      this.architectBlocks.every((block) => block.phase === 'closed')
    ) {
      this.architectTrapShocked = true;
      this.architectShockTimer = ENEMY.MINIBOSS.ARCHITECT_SHOCK_TIME;
    }

    if (!this.architectTrapShocked) return;
    this.architectShockTimer -= dt;
    if (this.architectShockTimer <= 0) {
      this.architectBlocks = [];
      this.architectTrapRect = null;
      this.architectTrapShocked = false;
      this.architectShockTimer = 0;
    }
  }

  startArchitectTrap(player) {
    const gapW = ENEMY.MINIBOSS.ARCHITECT_TRAP_W;
    const gapH = ENEMY.MINIBOSS.ARCHITECT_TRAP_H;
    const t = ENEMY.MINIBOSS.ARCHITECT_BLOCK_THICKNESS;
    const centerX = clamp(
      player.x + player.w / 2,
      WALL_THICKNESS + gapW / 2 + t + 8,
      ROOM_W - WALL_THICKNESS - gapW / 2 - t - 8,
    );
    const centerY = clamp(
      player.y + player.h / 2,
      WALL_THICKNESS + gapH / 2 + t + 8,
      ROOM_H - WALL_THICKNESS - gapH / 2 - t - 8,
    );
    const trap = {
      x: centerX - gapW / 2,
      y: centerY - gapH / 2,
      w: gapW,
      h: gapH,
    };
    const minTravel = ENEMY.MINIBOSS.ARCHITECT_MIN_TRAVEL;
    const topSpawnY = WALL_THICKNESS + 4;
    const bottomSpawnY = ROOM_H - WALL_THICKNESS - t - 4;
    const leftSpawnX = WALL_THICKNESS + 4;
    const rightSpawnX = ROOM_W - WALL_THICKNESS - t - 4;
    const farEnough = (start, target) => Math.abs(start - target) >= minTravel;
    const startY = (preferred, target) => (
      farEnough(preferred, target)
        ? preferred
        : preferred < ROOM_H / 2 ? bottomSpawnY : topSpawnY
    );
    const startX = (preferred, target) => (
      farEnough(preferred, target)
        ? preferred
        : preferred < ROOM_W / 2 ? rightSpawnX : leftSpawnX
    );
    const topTargetY = trap.y - t;
    const bottomTargetY = trap.y + trap.h;
    const leftTargetX = trap.x - t;
    const rightTargetX = trap.x + trap.w;
    this.architectTrapRect = trap;
    this.architectTrapShocked = false;
    this.architectShockTimer = 0;
    this.architectBlocks = [
      {
        x: trap.x,
        y: startY(topSpawnY, topTargetY),
        targetX: trap.x,
        targetY: topTargetY,
        w: trap.w,
        h: t,
        phase: 'approach',
      },
      {
        x: trap.x,
        y: startY(bottomSpawnY, bottomTargetY),
        targetX: trap.x,
        targetY: bottomTargetY,
        w: trap.w,
        h: t,
        phase: 'approach',
      },
      {
        x: startX(leftSpawnX, leftTargetX),
        y: trap.y,
        targetX: leftTargetX,
        targetY: trap.y,
        w: t,
        h: trap.h,
        phase: 'approach',
      },
      {
        x: startX(rightSpawnX, rightTargetX),
        y: trap.y,
        targetX: rightTargetX,
        targetY: trap.y,
        w: t,
        h: trap.h,
        phase: 'approach',
      },
    ];
    this.actionTimer = ENEMY.MINIBOSS.ARCHITECT_COOLDOWN;
  }

  updateMirageBombs(dt) {
    for (const bomb of this.mirageBombs) {
      if (bomb.warn > 0) {
        bomb.warn -= dt;
        if (bomb.warn <= 0) bomb.active = ENEMY.MINIBOSS.MIRAGE_ACTIVE_TIME;
      } else if (bomb.active > 0) {
        bomb.active -= dt;
      }
    }
    this.mirageBombs = this.mirageBombs.filter((bomb) => bomb.warn > 0 || bomb.active > 0);
  }

  startMirageBombs(player) {
    const playerCenter = center(player);
    const selfCenter = center(this);
    const size = ENEMY.MINIBOSS.MIRAGE_SIZE;
    const spots = [
      { x: playerCenter.x, y: playerCenter.y },
      { x: (playerCenter.x + selfCenter.x) / 2 - 42, y: playerCenter.y - 20 },
      { x: (playerCenter.x + selfCenter.x) / 2 + 42, y: playerCenter.y - 20 },
    ];

    this.mirageBombs = spots.map((spot) => ({
      x: clamp(spot.x - size / 2, WALL_THICKNESS + 4, ROOM_W - WALL_THICKNESS - size - 4),
      y: clamp(spot.y - size / 2, WALL_THICKNESS + 4, ROOM_H - WALL_THICKNESS - size - 4),
      w: size,
      h: size,
      warn: ENEMY.MINIBOSS.MIRAGE_WARN_TIME,
      active: 0,
      owner: this,
    }));
    this.actionTimer = ENEMY.MINIBOSS.MIRAGE_COOLDOWN;
  }

  pullPlayerIntoMagnetar(player, dt) {
    const a = center(this);
    const b = center(player);
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 1 || distance > ENEMY.MINIBOSS.MAGNETAR_RADIUS) return;

    const n = normalize(dx, dy);
    const pull = (1 - distance / ENEMY.MINIBOSS.MAGNETAR_RADIUS) * ENEMY.MINIBOSS.MAGNETAR_PULL;
    player.vx += n.x * pull * dt;
    player.vy += n.y * pull * dt;
    player.x = clamp(
      player.x + n.x * pull * dt * 0.18,
      WALL_THICKNESS,
      ROOM_W - WALL_THICKNESS - player.w,
    );
    player.y = clamp(
      player.y + n.y * pull * dt * 0.12,
      WALL_THICKNESS,
      ROOM_H - WALL_THICKNESS - player.h,
    );
  }

  lineHitboxes(x1, y1, x2, y2, thickness) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    if (length <= 1) return [];

    const unit = normalize(dx, dy);
    const step = Math.max(8, thickness * 0.72);
    const boxes = [];
    for (let distance = step / 2; distance <= length; distance += step) {
      boxes.push({
        x: x1 + unit.x * distance - thickness / 2,
        y: y1 + unit.y * distance - thickness / 2,
        w: thickness,
        h: thickness,
        owner: this,
      });
    }
    return boxes;
  }

  updateThreaderWeave(dt) {
    if (this.threaderNodes.length === 0) return;

    const speed = ENEMY.MINIBOSS.THREADER_NODE_SPEED;
    for (const node of this.threaderNodes) {
      if (node.phase !== 'approach') continue;
      const dx = node.targetX - node.x;
      const dy = node.targetY - node.y;
      const distance = Math.hypot(dx, dy);
      const move = speed * dt;
      if (distance <= move) {
        node.x = node.targetX;
        node.y = node.targetY;
        node.phase = 'ready';
      } else {
        node.x += dx / distance * move;
        node.y += dy / distance * move;
      }
    }

    if (
      this.threaderActiveTimer <= 0 &&
      this.threaderNodes.every((node) => node.phase === 'ready')
    ) {
      this.threaderActiveTimer = ENEMY.MINIBOSS.THREADER_ACTIVE_TIME;
    }

    if (this.threaderActiveTimer <= 0) return;
    this.threaderActiveTimer -= dt;
    if (this.threaderActiveTimer <= 0) {
      this.threaderNodes = [];
      this.threaderActiveTimer = 0;
    }
  }

  startThreaderWeave(player) {
    const targetY = clamp(
      player.y + player.h / 2,
      WALL_THICKNESS + 54,
      ROOM_H - WALL_THICKNESS - 54,
    );
    const targetX = clamp(
      player.x + player.w / 2,
      WALL_THICKNESS + 72,
      ROOM_W - WALL_THICKNESS - 72,
    );
    const skew = this.threaderPatternIndex % 2 === 0 ? 34 : -34;
    const leftTarget = {
      x: WALL_THICKNESS + 34,
      y: clamp(targetY - skew, WALL_THICKNESS + 36, ROOM_H - WALL_THICKNESS - 36),
    };
    const rightTarget = {
      x: ROOM_W - WALL_THICKNESS - 34,
      y: clamp(targetY + skew, WALL_THICKNESS + 36, ROOM_H - WALL_THICKNESS - 36),
    };
    const topTarget = {
      x: clamp(targetX + skew, WALL_THICKNESS + 40, ROOM_W - WALL_THICKNESS - 40),
      y: WALL_THICKNESS + 34,
    };
    const bottomTarget = {
      x: clamp(targetX - skew, WALL_THICKNESS + 40, ROOM_W - WALL_THICKNESS - 40),
      y: ROOM_H - WALL_THICKNESS - 34,
    };
    const startY = (target) => (
      target.y < ROOM_H / 2
        ? ROOM_H - WALL_THICKNESS - 18
        : WALL_THICKNESS + 18
    );
    const startX = (target) => (
      target.x < ROOM_W / 2
        ? ROOM_W - WALL_THICKNESS - 18
        : WALL_THICKNESS + 18
    );

    this.threaderNodes = [
      { kind: 'h', x: leftTarget.x, y: startY(leftTarget), targetX: leftTarget.x, targetY: leftTarget.y, phase: 'approach' },
      { kind: 'h', x: rightTarget.x, y: startY(rightTarget), targetX: rightTarget.x, targetY: rightTarget.y, phase: 'approach' },
      { kind: 'v', x: startX(topTarget), y: topTarget.y, targetX: topTarget.x, targetY: topTarget.y, phase: 'approach' },
      { kind: 'v', x: startX(bottomTarget), y: bottomTarget.y, targetX: bottomTarget.x, targetY: bottomTarget.y, phase: 'approach' },
    ];
    this.threaderActiveTimer = 0;
    this.threaderPatternIndex += 1;
    this.actionTimer = ENEMY.MINIBOSS.THREADER_COOLDOWN;
  }

  startBellowsBubbles(player) {
    const size = ENEMY.MINIBOSS.BELLOWS_BUBBLE_SIZE;
    const playerCenter = center(player);
    const selfCenter = center(this);
    const flip = this.bellowsPatternIndex % 2 === 0 ? 1 : -1;
    const spots = [
      { x: playerCenter.x - 72 * flip, y: playerCenter.y - 18 },
      { x: playerCenter.x + 72 * flip, y: playerCenter.y - 18 },
      { x: (playerCenter.x + selfCenter.x) / 2, y: playerCenter.y - 82 },
    ];

    this.bellowsBubbles = spots.map((spot, index) => ({
      x: clamp(spot.x - size / 2, WALL_THICKNESS + 6, ROOM_W - WALL_THICKNESS - size - 6),
      y: clamp(spot.y - size / 2, WALL_THICKNESS + 6, ROOM_H - WALL_THICKNESS - size - 6),
      w: size,
      h: size,
      warn: ENEMY.MINIBOSS.BELLOWS_BUBBLE_WARN_TIME + index * 0.08,
      pop: 0,
      drift: (index % 2 === 0 ? -1 : 1) * ENEMY.MINIBOSS.BELLOWS_BUBBLE_DRIFT,
      owner: this,
    }));
    this.bellowsPatternIndex += 1;
    this.actionTimer = ENEMY.MINIBOSS.BELLOWS_COOLDOWN;
  }

  updateBellowsBubbles(dt, player, options) {
    for (const bubble of this.bellowsBubbles) {
      if (bubble.warn > 0) {
        bubble.warn -= dt;
        bubble.y = clamp(
          bubble.y - ENEMY.MINIBOSS.BELLOWS_BUBBLE_DRIFT * 0.25 * dt,
          WALL_THICKNESS + 6,
          ROOM_H - WALL_THICKNESS - bubble.h - 6,
        );
        bubble.x = clamp(
          bubble.x + bubble.drift * dt,
          WALL_THICKNESS + 6,
          ROOM_W - WALL_THICKNESS - bubble.w - 6,
        );
        if (bubble.warn <= 0) bubble.pop = ENEMY.MINIBOSS.BELLOWS_BUBBLE_POP_TIME;
        continue;
      }

      bubble.pop -= dt;
      if (bubble.pop <= 0) continue;
      if (options.blind || !rectsOverlap(bubble, player)) continue;

      const bubbleCenter = center(bubble);
      const playerCenter = center(player);
      const n = normalize(playerCenter.x - bubbleCenter.x, playerCenter.y - bubbleCenter.y);
      const push = ENEMY.MINIBOSS.BELLOWS_PUSH;
      player.vx += n.x * push * dt;
      player.vy += n.y * push * dt * 0.45;
    }

    this.bellowsBubbles = this.bellowsBubbles.filter((bubble) => bubble.warn > 0 || bubble.pop > 0);
  }

  updateRainSpears(dt) {
    for (const spear of this.rainSpears) {
      if (spear.warn > 0) {
        spear.warn -= dt;
        continue;
      }
      spear.y += ENEMY.MINIBOSS.RAINMAKER_SPEED * dt;
      if (spear.y > ROOM_H - WALL_THICKNESS) spear.dead = true;
    }
    this.rainSpears = this.rainSpears.filter((spear) => !spear.dead);
  }

  startRainSpears(player) {
    const w = ENEMY.MINIBOSS.RAINMAKER_SPEAR_W;
    const h = ENEMY.MINIBOSS.RAINMAKER_SPEAR_H;
    const centerX = player.x + player.w / 2;
    const offsets = [-84, -28, 28, 84];
    this.rainSpears = offsets.map((offset) => ({
      x: clamp(centerX + offset - w / 2, WALL_THICKNESS + 6, ROOM_W - WALL_THICKNESS - w - 6),
      y: WALL_THICKNESS - h,
      w,
      h,
      warn: ENEMY.MINIBOSS.RAINMAKER_WARN_TIME,
      dead: false,
      owner: this,
    }));
    this.actionTimer = ENEMY.MINIBOSS.RAINMAKER_COOLDOWN;
  }

  startPhaseTrick(player) {
    const cx = player.x + player.w / 2;
    const cy = player.y + player.h / 2;
    const spots = [
      { x: cx - 92, y: cy - 16 },
      { x: cx + 92, y: cy - 16 },
      { x: cx, y: cy - 82 },
    ].map((spot) => ({
      x: clamp(spot.x - this.w / 2, WALL_THICKNESS + 8, ROOM_W - WALL_THICKNESS - this.w - 8),
      y: clamp(spot.y - this.h / 2, WALL_THICKNESS + 12, ROOM_H - WALL_THICKNESS - this.h - 8),
      w: this.w,
      h: this.h,
    }));
    const chosenIndex = this.phasePatternIndex % spots.length;
    this.phasePatternIndex += 1;
    this.phaseMarkers = spots.map((spot, index) => ({ ...spot, chosen: index === chosenIndex }));
    this.phaseTarget = spots[chosenIndex];
    this.phaseWindupTimer = ENEMY.MINIBOSS.PHASE_WARN_TIME;
    this.phaseShockTimer = 0;
    this.phaseShockRects = [];
    this.actionTimer = ENEMY.MINIBOSS.PHASE_COOLDOWN;
  }

  updatePhaseTrick(dt) {
    if (this.phaseWindupTimer > 0) {
      this.phaseWindupTimer -= dt;
      if (this.phaseWindupTimer <= 0 && this.phaseTarget) {
        const oldX = this.x;
        const oldY = this.y;
        this.x = this.phaseTarget.x;
        this.y = this.phaseTarget.y;
        this.prevX = this.x;
        this.prevY = this.y;
        this.vx = 0;
        this.vy = 0;
        this.phaseShockRects = [
          this.makePhaseShockRect(oldX, oldY),
          this.makePhaseShockRect(this.x, this.y),
        ];
        this.phaseShockTimer = ENEMY.MINIBOSS.PHASE_SHOCK_TIME;
        this.phaseMarkers = [];
        this.phaseTarget = null;
      }
    }

    if (this.phaseShockTimer <= 0) return;
    this.phaseShockTimer -= dt;
    if (this.phaseShockTimer <= 0) {
      this.phaseShockTimer = 0;
      this.phaseShockRects = [];
    }
  }

  updatePhaseChase(dt, player, solids) {
    const a = center(this);
    const b = center(player);
    const dx = b.x - a.x;
    this.direction = dx >= 0 ? 1 : -1;
    this.vx = Math.abs(dx) < 16
      ? 0
      : this.direction * ENEMY.MINIBOSS.SPEED * ENEMY.MINIBOSS.PHASE_CHASE_SPEED_SCALE;

    this.roamJumpTimer -= dt;
    const wantsJump = (
      this.onGround &&
      this.roamJumpTimer <= 0 &&
      (b.y < a.y - 26 || Math.abs(dx) > 118)
    );
    if (!wantsJump) return;

    const hasHeadroom = hasOverheadClearance(this, solids, ENEMY.MINIBOSS.HOPPER_HEADROOM);
    if (!hasHeadroom) return;
    this.vy = -ENEMY.MINIBOSS.JUMP_VELOCITY * 0.64;
    this.onGround = false;
    this.roamJumpTimer = ENEMY.MINIBOSS.PHASE_CHASE_JUMP_TIME;
  }

  makePhaseShockRect(x, y) {
    const size = ENEMY.MINIBOSS.PHASE_SHOCK_SIZE;
    return {
      x: x + this.w / 2 - size / 2,
      y: y + this.h / 2 - size / 2,
      w: size,
      h: size,
      owner: this,
    };
  }

  startPendulum(player) {
    const playerCenter = center(player);
    this.pendulumAnchor = {
      x: clamp(playerCenter.x, WALL_THICKNESS + 58, ROOM_W - WALL_THICKNESS - 58),
      y: clamp(playerCenter.y, WALL_THICKNESS + 70, ROOM_H - WALL_THICKNESS - 70),
    };
    this.pendulumPhase = this.id % 2 === 0 ? 0 : Math.PI;
    this.pendulumWarnTimer = ENEMY.MINIBOSS.SAWBLOOM_WARN_TIME;
    this.pendulumActiveTimer = 0;
    this.actionTimer = ENEMY.MINIBOSS.SAWBLOOM_COOLDOWN;
  }

  updatePendulum(dt) {
    if (this.pendulumWarnTimer > 0) {
      this.pendulumWarnTimer -= dt;
      if (this.pendulumWarnTimer <= 0) {
        this.pendulumActiveTimer = ENEMY.MINIBOSS.SAWBLOOM_ACTIVE_TIME;
      }
      return;
    }

    if (this.pendulumActiveTimer <= 0) return;
    this.pendulumActiveTimer -= dt;
    this.pendulumPhase += ENEMY.MINIBOSS.SAWBLOOM_SWING_SPEED * dt;
    if (this.pendulumActiveTimer <= 0) {
      this.pendulumAnchor = null;
      this.pendulumActiveTimer = 0;
    }
  }

  pendulumBlades() {
    if (!this.pendulumAnchor) return null;
    const progress = this.pendulumActiveTimer > 0
      ? 1 - this.pendulumActiveTimer / ENEMY.MINIBOSS.SAWBLOOM_ACTIVE_TIME
      : 0;
    const radius = ENEMY.MINIBOSS.SAWBLOOM_RADIUS * (0.52 + Math.sin(progress * Math.PI) * 0.48);
    return [0, Math.PI].map((offset) => ({
      x: this.pendulumAnchor.x + Math.cos(this.pendulumPhase + offset) * radius,
      y: this.pendulumAnchor.y + Math.sin(this.pendulumPhase + offset) * radius * 0.72,
    }));
  }

  startBurrow(player) {
    this.burrowTargetX = clamp(
      player.x + player.w / 2,
      WALL_THICKNESS + ENEMY.MINIBOSS.BURROW_ERUPT_W / 2,
      ROOM_W - WALL_THICKNESS - ENEMY.MINIBOSS.BURROW_ERUPT_W / 2,
    );
    this.burrowWarnTimer = ENEMY.MINIBOSS.BURROW_WARN_TIME;
    this.burrowEruptTimer = 0;
    this.actionTimer = ENEMY.MINIBOSS.BURROW_COOLDOWN;
  }

  updateBurrower(dt) {
    if (this.burrowWarnTimer > 0) {
      this.burrowWarnTimer -= dt;
      if (this.burrowWarnTimer <= 0) {
        this.x = clamp(
          this.burrowTargetX - this.w / 2,
          WALL_THICKNESS,
          ROOM_W - WALL_THICKNESS - this.w,
        );
        this.y = ROOM_H - WALL_THICKNESS - this.h;
        this.prevX = this.x;
        this.prevY = this.y;
        this.vx = 0;
        this.vy = 0;
        this.onGround = true;
        this.burrowEruptTimer = ENEMY.MINIBOSS.BURROW_ERUPT_TIME;
      }
    }

    if (this.burrowEruptTimer <= 0) return;
    this.burrowEruptTimer -= dt;
    if (this.burrowEruptTimer <= 0) this.burrowEruptTimer = 0;
  }

  updateBurrowerFlee(dt, player, solids) {
    const a = center(this);
    const b = center(player);
    const dx = b.x - a.x;
    const distance = Math.abs(dx);
    const preferredDir = dx >= 0 ? -1 : 1;
    let fleeDir = this.burrowEscapeTimer > 0 ? this.burrowEscapeDir : preferredDir;
    const blockedAway = nearRoomSide(this, fleeDir) || !hasSupportAhead(this, solids, fleeDir);

    if (blockedAway) {
      const fallbackDir = this.x + this.w / 2 < ROOM_W / 2 ? 1 : -1;
      fleeDir = fallbackDir;
      this.burrowEscapeDir = fallbackDir;
      this.burrowEscapeTimer = ENEMY.MINIBOSS.BURROW_ESCAPE_TIME;
      this.actionTimer = Math.min(this.actionTimer, 0.35);
    } else if (this.burrowEscapeTimer > 0) {
      this.burrowEscapeTimer -= dt;
    }

    const panic = distance < ENEMY.MINIBOSS.BURROW_PANIC_DISTANCE ? 1 : 0.78;
    this.direction = fleeDir;
    this.vx = fleeDir * ENEMY.MINIBOSS.BURROW_FLEE_SPEED * panic * (this.burrowEscapeTimer > 0 ? 1.16 : 1);
    this.roamJumpTimer -= dt;

    const wantsHop = (
      this.onGround &&
      (
        blockedAway ||
        (
          this.roamJumpTimer <= 0 &&
          (
            distance < ENEMY.MINIBOSS.BURROW_JUMP_DISTANCE ||
            b.y < a.y - 24 ||
            !hasSupportAhead(this, solids, fleeDir)
          )
        )
      )
    );
    if (!wantsHop || !hasOverheadClearance(this, solids, ENEMY.MINIBOSS.HOPPER_HEADROOM)) return;

    this.vy = -ENEMY.MINIBOSS.JUMP_VELOCITY * (
      blockedAway ? ENEMY.MINIBOSS.BURROW_ESCAPE_JUMP : 0.64
    );
    this.onGround = false;
    this.roamJumpTimer = seededRange(this.id + Math.floor(this.x), 7, 0.42, 0.72);
  }

  startRicochet(player) {
    const a = center(this);
    const b = center(player);
    this.ricochetDir = this.aimRicochetAt(b, a);
    this.ricochetWarnTimer = ENEMY.MINIBOSS.RICOCHET_WARN_TIME;
    this.ricochetTimer = 0;
    this.actionTimer = ENEMY.MINIBOSS.RICOCHET_COOLDOWN;
  }

  aimRicochetAt(target, origin = center(this)) {
    const dir = normalize(target.x - origin.x, target.y - origin.y - 18);
    return {
      x: Math.abs(dir.x) < 0.24 ? (target.x >= origin.x ? 0.7 : -0.7) : dir.x,
      y: Math.abs(dir.y) < 0.24 ? -0.62 : dir.y,
    };
  }

  updateRicochetAttack(dt, solids = [], player = null) {
    if (this.ricochetWarnTimer > 0) {
      if (player) this.ricochetDir = this.aimRicochetAt(center(player));
      this.ricochetWarnTimer -= dt;
      if (this.ricochetWarnTimer <= 0) {
        const dir = normalize(this.ricochetDir.x, this.ricochetDir.y);
        this.ricochetDir = dir;
        this.vx = dir.x * ENEMY.MINIBOSS.RICOCHET_SPEED;
        this.vy = dir.y * ENEMY.MINIBOSS.RICOCHET_SPEED;
        this.ricochetTimer = ENEMY.MINIBOSS.RICOCHET_TIME;
      }
      return;
    }

    if (this.ricochetTimer <= 0) return;
    this.ricochetTimer -= dt;
    const solidHit = () => solids.some((solid) => !solid.oneWay && rectsOverlap(this, solid));
    const dx = this.vx * dt;
    const dy = this.vy * dt;

    this.x += dx;
    if (
      this.x <= WALL_THICKNESS ||
      this.x + this.w >= ROOM_W - WALL_THICKNESS ||
      solidHit()
    ) {
      this.x -= dx;
      this.vx *= -1;
    }

    this.y += dy;
    if (
      this.y <= WALL_THICKNESS ||
      this.y + this.h >= ROOM_H - WALL_THICKNESS ||
      solidHit()
    ) {
      this.y -= dy;
      this.vy *= -1;
    }

    this.x = clamp(this.x, WALL_THICKNESS, ROOM_W - WALL_THICKNESS - this.w);
    this.y = clamp(this.y, WALL_THICKNESS, ROOM_H - WALL_THICKNESS - this.h);
    this.direction = this.vx >= 0 ? 1 : -1;
    if (this.ricochetTimer <= 0) {
      this.ricochetTimer = 0;
      this.vx = 0;
      this.vy = 0;
    }
  }

  startHarpoon(player) {
    const bossCenter = center(this);
    const playerCenter = center(player);
    this.harpoonPatternIndex += 1;
    let dir = normalize(playerCenter.x - bossCenter.x, playerCenter.y - bossCenter.y);
    if (Math.abs(dir.x) < 0.01 && Math.abs(dir.y) < 0.01) {
      dir = { x: this.direction || 1, y: 0 };
    }
    const candidates = [];
    if (Math.abs(dir.x) > 0.01) {
      candidates.push(((dir.x > 0 ? ROOM_W - WALL_THICKNESS - 2 : WALL_THICKNESS + 2) - bossCenter.x) / dir.x);
    }
    if (Math.abs(dir.y) > 0.01) {
      candidates.push(((dir.y > 0 ? ROOM_H - WALL_THICKNESS - 2 : WALL_THICKNESS + 2) - bossCenter.y) / dir.y);
    }
    const validCandidates = candidates.filter((value) => value > 0 && Number.isFinite(value));
    const travel = Math.max(40, validCandidates.length > 0 ? Math.min(...validCandidates) : 160);
    const anchor = {
      x: clamp(bossCenter.x + dir.x * travel, WALL_THICKNESS + 2, ROOM_W - WALL_THICKNESS - 2),
      y: clamp(bossCenter.y + dir.y * travel, WALL_THICKNESS + 2, ROOM_H - WALL_THICKNESS - 2),
    };
    const target = {
      x: anchor.x - dir.x * 38,
      y: anchor.y - dir.y * 38,
    };

    this.harpoonAnchor = anchor;
    this.harpoonTarget = {
      x: clamp(target.x - this.w / 2, WALL_THICKNESS, ROOM_W - WALL_THICKNESS - this.w),
      y: clamp(target.y - this.h / 2, WALL_THICKNESS, ROOM_H - WALL_THICKNESS - this.h),
    };
    this.harpoonStart = { x: this.x, y: this.y };
    this.harpoonWarnTimer = ENEMY.MINIBOSS.HARPOON_WARN_TIME;
    this.harpoonPullTimer = 0;
    this.actionTimer = ENEMY.MINIBOSS.HARPOON_COOLDOWN;
  }

  updateHarpoon(dt) {
    if (this.harpoonWarnTimer > 0) {
      this.harpoonWarnTimer -= dt;
      this.vx = 0;
      if (this.harpoonWarnTimer <= 0) {
        this.harpoonPullTimer = ENEMY.MINIBOSS.HARPOON_PULL_TIME;
        this.harpoonStart = { x: this.x, y: this.y };
      }
      return;
    }

    if (this.harpoonPullTimer <= 0 || !this.harpoonStart || !this.harpoonTarget) return;
    this.harpoonPullTimer -= dt;
    const t = 1 - Math.max(0, this.harpoonPullTimer) / ENEMY.MINIBOSS.HARPOON_PULL_TIME;
    this.x = this.harpoonStart.x + (this.harpoonTarget.x - this.harpoonStart.x) * t;
    this.y = this.harpoonStart.y + (this.harpoonTarget.y - this.harpoonStart.y) * t;
    this.prevX = this.x;
    this.prevY = this.y;
    this.vx = 0;
    this.vy = 0;
    if (this.harpoonPullTimer <= 0) {
      this.harpoonPullTimer = 0;
      this.harpoonAnchor = null;
      this.harpoonStart = null;
      this.harpoonTarget = null;
    }
  }

  updateChronos(dt) {
    for (const rift of this.chronosRifts) {
      if (rift.warn > 0) {
        rift.warn -= dt;
        continue;
      }
      rift.x += rift.vx * dt;
      rift.y += rift.vy * dt;
      if (
        rift.x + rift.w < WALL_THICKNESS ||
        rift.x > ROOM_W - WALL_THICKNESS ||
        rift.y + rift.h < WALL_THICKNESS ||
        rift.y > ROOM_H - WALL_THICKNESS
      ) {
        rift.dead = true;
      }
    }
    this.chronosRifts = this.chronosRifts.filter((rift) => !rift.dead);
  }

  startChronosRifts(player) {
    const playerCenter = center(player);
    const speed = ENEMY.MINIBOSS.CHRONOS_RIFT_SPEED;
    const thickness = ENEMY.MINIBOSS.CHRONOS_RIFT_THICKNESS;
    const length = ENEMY.MINIBOSS.CHRONOS_RIFT_LENGTH;
    const horizontal = this.chronosPatternIndex % 2 === 0;
    const side = this.chronosPatternIndex % 4 < 2 ? 1 : -1;
    const offsets = [-58, 0, 58];

    this.chronosRifts = offsets.map((offset, index) => {
      const warn = ENEMY.MINIBOSS.CHRONOS_RIFT_WARN_TIME + index * 0.08;
      if (horizontal) {
        const y = clamp(
          playerCenter.y + offset - length / 2,
          WALL_THICKNESS + 8,
          ROOM_H - WALL_THICKNESS - length - 8,
        );
        return {
          x: side > 0 ? WALL_THICKNESS - thickness : ROOM_W - WALL_THICKNESS,
          y,
          w: thickness,
          h: length,
          vx: side * speed,
          vy: 0,
          warn,
          owner: this,
        };
      }

      const x = clamp(
        playerCenter.x + offset - length / 2,
        WALL_THICKNESS + 8,
        ROOM_W - WALL_THICKNESS - length - 8,
      );
      return {
        x,
        y: side > 0 ? WALL_THICKNESS - thickness : ROOM_H - WALL_THICKNESS,
        w: length,
        h: thickness,
        vx: 0,
        vy: side * speed,
        warn,
        owner: this,
      };
    });
    this.chronosPatternIndex += 1;
    this.actionTimer = ENEMY.MINIBOSS.CHRONOS_RIFT_COOLDOWN;
  }

  updatePrism(dt) {
    if (this.prismNodes.length === 0) return;

    const speed = ENEMY.MINIBOSS.PRISM_NODE_SPEED;
    for (const node of this.prismNodes) {
      if (node.phase !== 'approach') continue;
      const dx = node.targetX - node.x;
      const dy = node.targetY - node.y;
      const distance = Math.hypot(dx, dy);
      const move = speed * dt;
      if (distance <= move) {
        node.x = node.targetX;
        node.y = node.targetY;
        node.phase = 'ready';
      } else {
        node.x += dx / distance * move;
        node.y += dy / distance * move;
      }
    }

    if (
      this.prismActiveTimer <= 0 &&
      this.prismNodes.every((node) => node.phase === 'ready')
    ) {
      this.prismActiveTimer = ENEMY.MINIBOSS.PRISM_ACTIVE_TIME;
    }

    if (this.prismActiveTimer <= 0) return;
    this.prismActiveTimer -= dt;
    if (this.prismActiveTimer <= 0) {
      this.prismNodes = [];
      this.prismActiveTimer = 0;
    }
  }

  startPrismTrap(player) {
    const playerCenter = center(player);
    const radius = 82;
    const phase = this.prismPatternIndex % 2 === 0 ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / 3;
    const targets = [0, 1, 2].map((index) => {
      const angle = phase + index * Math.PI * 2 / 3;
      return {
        x: clamp(playerCenter.x + Math.cos(angle) * radius, WALL_THICKNESS + 38, ROOM_W - WALL_THICKNESS - 38),
        y: clamp(playerCenter.y + Math.sin(angle) * radius, WALL_THICKNESS + 38, ROOM_H - WALL_THICKNESS - 38),
      };
    });

    this.prismNodes = targets.map((target, index) => {
      const fromHorizontalEdge = index === 1 || index === 2;
      return {
        x: fromHorizontalEdge
          ? (index === 1 ? WALL_THICKNESS + 12 : ROOM_W - WALL_THICKNESS - 12)
          : target.x,
        y: fromHorizontalEdge
          ? target.y
          : (target.y < ROOM_H / 2 ? ROOM_H - WALL_THICKNESS - 12 : WALL_THICKNESS + 12),
        targetX: target.x,
        targetY: target.y,
        phase: 'approach',
      };
    });
    this.prismActiveTimer = 0;
    this.prismPatternIndex += 1;
    this.actionTimer = ENEMY.MINIBOSS.PRISM_COOLDOWN;
  }

  startSonarPulse() {
    this.sonarOrigin = center(this);
    this.sonarWarnTimer = ENEMY.MINIBOSS.SONAR_WARN_TIME;
    this.sonarPulseTimer = 0;
    this.actionTimer = ENEMY.MINIBOSS.SONAR_COOLDOWN;
  }

  updateSonar(dt) {
    if (this.sonarWarnTimer > 0) {
      this.sonarWarnTimer -= dt;
      if (this.sonarWarnTimer <= 0) {
        this.sonarPulseTimer = ENEMY.MINIBOSS.SONAR_ACTIVE_TIME;
      }
      return;
    }

    if (this.sonarPulseTimer <= 0) return;
    this.sonarPulseTimer -= dt;
    if (this.sonarPulseTimer <= 0) {
      this.sonarPulseTimer = 0;
      this.sonarOrigin = null;
    }
  }

  sonarDiamond() {
    if (!this.sonarOrigin || this.sonarPulseTimer <= 0) return null;
    const progress = 1 - this.sonarPulseTimer / ENEMY.MINIBOSS.SONAR_ACTIVE_TIME;
    const radius = 24 + ENEMY.MINIBOSS.SONAR_RADIUS * progress;
    const { x, y } = this.sonarOrigin;
    return [
      { x, y: y - radius },
      { x: x + radius, y },
      { x, y: y + radius },
      { x: x - radius, y },
    ];
  }

  startLockjaw() {
    this.lockjawWarnTimer = ENEMY.MINIBOSS.LOCKJAW_WARN_TIME;
    this.actionTimer = ENEMY.MINIBOSS.LOCKJAW_COOLDOWN;
  }

  updateLockjaw(dt) {
    if (this.lockjawWarnTimer > 0) {
      this.lockjawWarnTimer -= dt;
      if (this.lockjawWarnTimer <= 0) {
        this.spawnLockjawWaves();
      }
    }

    for (const wave of this.lockjawWaves) {
      wave.x += wave.vx * dt;
      wave.life -= dt;
      if (
        wave.life <= 0 ||
        wave.x + wave.w < WALL_THICKNESS ||
        wave.x > ROOM_W - WALL_THICKNESS
      ) {
        wave.dead = true;
      }
    }
    this.lockjawWaves = this.lockjawWaves.filter((wave) => !wave.dead);
  }

  updateLockjawMove(dt, solids) {
    this.roamTimer -= dt;
    if (
      this.roamTimer <= 0 ||
      nearRoomSide(this, this.direction) ||
      (this.onGround && !hasSupportAhead(this, solids, this.direction))
    ) {
      this.direction *= -1;
      this.roamTimer = seededRange(
        this.id + Math.floor(this.x + this.y),
        13,
        0.55,
        1.05,
      );
    }

    this.vx = this.direction * ENEMY.MINIBOSS.SPEED * ENEMY.MINIBOSS.LOCKJAW_MOVE_SCALE;
    this.roamJumpTimer -= dt;
    if (
      this.onGround &&
      this.roamJumpTimer <= 0 &&
      hasOverheadClearance(this, solids, ENEMY.MINIBOSS.HOPPER_HEADROOM)
    ) {
      this.vy = -ENEMY.MINIBOSS.JUMP_VELOCITY * ENEMY.MINIBOSS.LOCKJAW_JUMP_SCALE;
      this.onGround = false;
      this.roamJumpTimer = ENEMY.MINIBOSS.LOCKJAW_JUMP_INTERVAL;
    }
  }

  spawnLockjawWaves() {
    const w = ENEMY.MINIBOSS.LOCKJAW_WAVE_W;
    const h = ENEMY.MINIBOSS.LOCKJAW_WAVE_H;
    const y = ROOM_H - WALL_THICKNESS - h;
    const origin = this.x + this.w / 2;
    this.lockjawWaves = [-1, 1].map((dir) => ({
      x: origin + dir * 12 - w / 2,
      y,
      w,
      h,
      vx: dir * ENEMY.MINIBOSS.LOCKJAW_WAVE_SPEED,
      life: ENEMY.MINIBOSS.LOCKJAW_WAVE_LIFE,
      owner: this,
    }));
  }

  getOrbiterHitboxes(x = this.x, y = this.y) {
    if (this.archetype !== 'orbiter' || this.dead) return [];
    const pulseT = this.orbiterPulseTimer > 0
      ? 1 - this.orbiterPulseTimer / ENEMY.MINIBOSS.ORBITER_PULSE_TIME
      : 0;
    let pulse = 0;
    if (this.orbiterPulseTimer > 0) {
      if (pulseT < 0.22) pulse = pulseT / 0.22;
      else if (pulseT < 0.72) pulse = 1;
      else pulse = Math.max(0, 1 - (pulseT - 0.72) / 0.28);
    }
    const radius = ENEMY.MINIBOSS.ORBITER_RADIUS + ENEMY.MINIBOSS.ORBITER_PULSE_RADIUS * pulse;
    const size = 15;
    const c = { x: x + this.w / 2, y: y + this.h / 2 };
    return [0, 1, 2].map((index) => {
      const angle = this.orbitAngle + index * Math.PI * 2 / 3;
      return {
        x: c.x + Math.cos(angle) * radius - size / 2,
        y: c.y + Math.sin(angle) * radius - size / 2,
        w: size,
        h: size,
        owner: this,
      };
    });
  }

  getArchitectHitboxes() {
    if (
      this.archetype !== 'architect' ||
      this.dead ||
      this.architectShockTimer <= 0 ||
      !this.architectTrapRect
    ) return [];

    return [
      { ...this.architectTrapRect, owner: this },
      ...this.architectBlocks.map((block) => ({ ...block, owner: this })),
    ];
  }

  getMirageHitboxes() {
    if (this.archetype !== 'mirage' || this.dead) return [];
    return this.mirageBombs
      .filter((bomb) => bomb.active > 0)
      .map((bomb) => ({ ...bomb, owner: this }));
  }

  getMagnetarHitboxes(x = this.x, y = this.y) {
    if (this.archetype !== 'magnetar' || this.dead || this.magnetarPulseTimer <= 0) return [];
    const size = ENEMY.MINIBOSS.MAGNETAR_CORE_SIZE;
    return [{
      x: x + this.w / 2 - size / 2,
      y: y + this.h / 2 - size / 2,
      w: size,
      h: size,
      owner: this,
    }];
  }

  getThreaderHitboxes() {
    if (
      this.archetype !== 'threader' ||
      this.dead ||
      this.threaderActiveTimer <= 0 ||
      this.threaderNodes.length < 4
    ) return [];

    const horizontal = this.threaderNodes.filter((node) => node.kind === 'h');
    const vertical = this.threaderNodes.filter((node) => node.kind === 'v');
    return [
      ...this.lineHitboxes(
        horizontal[0].x,
        horizontal[0].y,
        horizontal[1].x,
        horizontal[1].y,
        ENEMY.MINIBOSS.THREADER_THICKNESS,
      ),
      ...this.lineHitboxes(
        vertical[0].x,
        vertical[0].y,
        vertical[1].x,
        vertical[1].y,
        ENEMY.MINIBOSS.THREADER_THICKNESS,
      ),
    ];
  }

  getBellowsHitboxes() {
    if (this.archetype !== 'bellows' || this.dead) return [];
    return this.bellowsBubbles
      .filter((bubble) => bubble.pop > 0)
      .map((bubble) => ({ ...bubble, owner: this }));
  }

  getRainHitboxes() {
    if (this.archetype !== 'rainmaker' || this.dead) return [];
    return this.rainSpears
      .filter((spear) => spear.warn <= 0)
      .map((spear) => ({ ...spear, owner: this }));
  }

  getPhaseHitboxes() {
    if (this.archetype !== 'phase' || this.dead || this.phaseShockTimer <= 0) return [];
    return this.phaseShockRects.map((rect) => ({ ...rect, owner: this }));
  }

  getPendulumHitboxes() {
    if (
      this.archetype !== 'sawbloom' ||
      this.dead ||
      this.pendulumActiveTimer <= 0 ||
      !this.pendulumAnchor
    ) return [];

    const blades = this.pendulumBlades();
    if (!blades) return [];
    const size = ENEMY.MINIBOSS.SAWBLOOM_BLADE_SIZE;
    return blades.map((blade) => ({
      x: blade.x - size / 2,
      y: blade.y - size / 2,
      w: size,
      h: size,
      owner: this,
    }));
  }

  getBurrowHitboxes() {
    if (this.archetype !== 'burrower' || this.dead || this.burrowEruptTimer <= 0) return [];
    const w = ENEMY.MINIBOSS.BURROW_ERUPT_W;
    const h = ENEMY.MINIBOSS.BURROW_ERUPT_H;
    return [{
      x: this.burrowTargetX - w / 2,
      y: ROOM_H - WALL_THICKNESS - h,
      w,
      h,
      owner: this,
    }];
  }

  getHarpoonHitboxes(x = this.x, y = this.y) {
    if (
      this.archetype !== 'harpoon' ||
      this.dead ||
      this.harpoonPullTimer <= 0 ||
      !this.harpoonAnchor
    ) return [];

    return this.lineHitboxes(
      x + this.w / 2,
      y + this.h / 2,
      this.harpoonAnchor.x,
      this.harpoonAnchor.y,
      ENEMY.MINIBOSS.HARPOON_THICKNESS,
    );
  }

  getChronosHitboxes() {
    if (this.archetype !== 'chronos' || this.dead) return [];
    return this.chronosRifts
      .filter((rift) => rift.warn <= 0)
      .map((rift) => ({ ...rift, owner: this }));
  }

  getPrismHitboxes() {
    if (
      this.archetype !== 'prism' ||
      this.dead ||
      this.prismActiveTimer <= 0 ||
      this.prismNodes.length < 3
    ) return [];

    return [
      ...this.lineHitboxes(
        this.prismNodes[0].x,
        this.prismNodes[0].y,
        this.prismNodes[1].x,
        this.prismNodes[1].y,
        ENEMY.MINIBOSS.PRISM_THICKNESS,
      ),
      ...this.lineHitboxes(
        this.prismNodes[1].x,
        this.prismNodes[1].y,
        this.prismNodes[2].x,
        this.prismNodes[2].y,
        ENEMY.MINIBOSS.PRISM_THICKNESS,
      ),
      ...this.lineHitboxes(
        this.prismNodes[2].x,
        this.prismNodes[2].y,
        this.prismNodes[0].x,
        this.prismNodes[0].y,
        ENEMY.MINIBOSS.PRISM_THICKNESS,
      ),
    ];
  }

  getSonarHitboxes() {
    if (this.archetype !== 'sonar' || this.dead || this.sonarPulseTimer <= 0) return [];
    const diamond = this.sonarDiamond();
    if (!diamond) return [];
    return [
      ...this.lineHitboxes(diamond[0].x, diamond[0].y, diamond[1].x, diamond[1].y, ENEMY.MINIBOSS.SONAR_THICKNESS),
      ...this.lineHitboxes(diamond[1].x, diamond[1].y, diamond[2].x, diamond[2].y, ENEMY.MINIBOSS.SONAR_THICKNESS),
      ...this.lineHitboxes(diamond[2].x, diamond[2].y, diamond[3].x, diamond[3].y, ENEMY.MINIBOSS.SONAR_THICKNESS),
      ...this.lineHitboxes(diamond[3].x, diamond[3].y, diamond[0].x, diamond[0].y, ENEMY.MINIBOSS.SONAR_THICKNESS),
    ];
  }

  getLockjawHitboxes() {
    if (this.archetype !== 'lockjaw' || this.dead) return [];
    return this.lockjawWaves.map((wave) => ({ ...wave, owner: this }));
  }

  getCloneHitboxes(x = this.x, y = this.y) {
    if (!this.globalCloneId || this.dead) return [];
    const out = [];

    if (this.cloneMeleeTimer > 0) {
      const range = ENEMY.CLONE.MELEE_RANGE;
      const thick = ENEMY.CLONE.MELEE_THICKNESS;
      const centerX = x + this.w / 2;
      const centerY = y + this.h / 2;
      if (this.cloneMeleeDir.y !== 0) {
        out.push({
          kind: 'cloneMelee',
          x: centerX - thick / 2,
          y: this.cloneMeleeDir.y > 0 ? y + this.h : y - range,
          w: thick,
          h: range,
          owner: this,
          damage: this.cloneMeleeDamage(),
          direction: { ...this.cloneMeleeDir },
        });
      } else {
        out.push({
          kind: 'cloneMelee',
          x: this.cloneMeleeDir.x > 0 ? x + this.w : x - range,
          y: centerY - thick / 2,
          w: range,
          h: thick,
          owner: this,
          damage: this.cloneMeleeDamage(),
          direction: { ...this.cloneMeleeDir },
        });
      }
    }

    if (this.cloneStopPulseTimer > 0) {
      const radius = ENEMY.CLONE.STOP_PULSE_RADIUS;
      out.push({
        x: x + this.w / 2 - radius,
        y: y + this.h / 2 - radius,
        w: radius * 2,
        h: radius * 2,
        owner: this,
        damage: 0,
        stopPlayer: true,
      });
    }

    if (this.cloneSlowPulseTimer > 0) {
      const radius = ENEMY.CLONE.SLOW_PULSE_RADIUS;
      out.push({
        x: x + this.w / 2 - radius,
        y: y + this.h / 2 - radius,
        w: radius * 2,
        h: radius * 2,
        owner: this,
        damage: 0,
        slowPlayer: true,
      });
    }

    if (this.cloneGroundSlamImpactTimer > 0) {
      const radius = ENEMY.CLONE.GROUND_SLAM_RADIUS;
      out.push({
        kind: 'cloneGroundSlam',
        x: x + this.w / 2 - radius,
        y: y + this.h - radius / 2,
        w: radius * 2,
        h: radius,
        owner: this,
        damage: ENEMY.CLONE.GROUND_SLAM_DAMAGE,
      });
    }

    return out;
  }

  getHazardHitboxes(x = this.x, y = this.y) {
    return [
      ...this.getCloneHitboxes(x, y),
      ...this.getSentinelHitboxes(x, y),
      ...this.getOrbiterHitboxes(x, y),
      ...this.getArchitectHitboxes(),
      ...this.getMirageHitboxes(),
      ...this.getMagnetarHitboxes(x, y),
      ...this.getThreaderHitboxes(),
      ...this.getBellowsHitboxes(),
      ...this.getRainHitboxes(),
      ...this.getPhaseHitboxes(),
      ...this.getPendulumHitboxes(),
      ...this.getBurrowHitboxes(),
      ...this.getHarpoonHitboxes(x, y),
      ...this.getChronosHitboxes(),
      ...this.getPrismHitboxes(),
      ...this.getSonarHitboxes(),
      ...this.getLockjawHitboxes(),
    ];
  }

  updateShieldKnockback(dt, solids) {
    this.shieldKnockTimer -= dt;
    if (this.type === 'flyer') {
      this.x += this.vx * dt;
      this.keepInsideRoom();
      return;
    }

    this.vy += GRAVITY * dt;
    moveAndCollide(this, this.vx * dt, 0, solids);
    moveAndCollide(this, 0, this.vy * dt, solids);
  }

  turnAroundBeforeUnsafeEdge(solids) {
    if (!['walker', 'charger', 'clone', 'miniboss'].includes(this.type)) return;
    const dir = Math.sign(this.vx);
    if (dir === 0 || !this.onGround) return;
    if (!nearRoomSide(this, dir) && hasSupportAhead(this, solids, dir)) return;

    this.direction *= -1;
    this.chargeTimer = 0;
    if (this.type === 'charger') {
      this.chargeRestTimer = Math.max(this.chargeRestTimer, 0.4);
      this.vx = this.direction * ENEMY.CHARGER.SPEED;
    } else if (this.miniboss) {
      this.vx = this.direction * ENEMY.MINIBOSS.SPEED;
    } else {
      this.updateWalker();
    }
  }

  keepInsideRoom() {
    this.x = clamp(this.x, WALL_THICKNESS, ROOM_W - WALL_THICKNESS - this.w);
    this.y = clamp(this.y, WALL_THICKNESS, ROOM_H - WALL_THICKNESS - this.h);
  }

  updateCorpse(dt, solids) {
    if (!this.canRevive) return;
    this.prevX = this.x;
    this.prevY = this.y;
    this.reviveTimer -= dt;

    if (!this.onGround) {
      this.vy += GRAVITY * dt;
      moveAndCollide(this, 0, this.vy * dt, solids);
    }

    if (this.reviveTimer <= 0) this.revive();
  }

  updatePoison(dt) {
    if (this.poisonTimer <= 0) return false;

    this.poisonTimer -= dt;
    this.hp -= this.poisonDps * dt;
    if (this.poisonTimer <= 0) {
      this.poisonTimer = 0;
      this.poisonDps = 0;
    }
    if (this.hp <= 0) {
      this.kill();
      return true;
    }
    return false;
  }

  applyPoison(duration, dps) {
    if (this.dead || this.poisonTimer > 0 || duration <= 0 || dps <= 0) return;
    this.poisonTimer = duration;
    this.poisonDps = dps;
  }

  takeDamage(amount, options = {}) {
    if (this.dead || (this.hurtTimer > 0 && !options.ignoreHurtTimer)) return false;
    if (this.globalCloneId && this.cloneShieldTimer > 0 && !options.ignoreShield) {
      this.hurtTimer = 0.05;
      return false;
    }
    this.hp -= amount;
    this.hurtTimer = 0.12;
    if (this.hp <= 0) {
      this.kill();
      return true;
    }
    if (this.globalCloneId && this.hp > 0) this.activateCloneShield();
    return false;
  }

  kill() {
    this.dead = true;
    this.hp = 0;
    this.vx = 0;
    this.vy = 0;
    this.chargeTimer = 0;
    this.sentinelWindupTimer = 0;
    this.sentinelExtendTimer = 0;
    this.orbiterPulseTimer = 0;
    this.architectBlocks = [];
    this.architectTrapRect = null;
    this.architectShockTimer = 0;
    this.architectTrapShocked = false;
    this.mirageBombs = [];
    this.magnetarPulseTimer = 0;
    this.threaderNodes = [];
    this.threaderActiveTimer = 0;
    this.bellowsBubbles = [];
    this.rainSpears = [];
    this.phaseMarkers = [];
    this.phaseWindupTimer = 0;
    this.phaseShockTimer = 0;
    this.phaseShockRects = [];
    this.phaseTarget = null;
    this.pendulumWarnTimer = 0;
    this.pendulumActiveTimer = 0;
    this.pendulumAnchor = null;
    this.burrowWarnTimer = 0;
    this.burrowEruptTimer = 0;
    this.burrowEscapeTimer = 0;
    this.ricochetWarnTimer = 0;
    this.ricochetTimer = 0;
    this.harpoonWarnTimer = 0;
    this.harpoonPullTimer = 0;
    this.harpoonAnchor = null;
    this.harpoonStart = null;
    this.harpoonTarget = null;
    this.chronosRifts = [];
    this.prismNodes = [];
    this.prismActiveTimer = 0;
    this.sonarWarnTimer = 0;
    this.sonarPulseTimer = 0;
    this.sonarOrigin = null;
    this.lockjawWarnTimer = 0;
    this.lockjawWaves = [];
    this.poisonTimer = 0;
    this.poisonDps = 0;
    if (this.canRevive) {
      this.reviveTimer = ENEMY.REVIVE_TIME;
    }
  }

  revive() {
    this.dead = false;
    this.hp = this.maxHp;
    this.hurtTimer = 0.35;
    this.reviveTimer = 0;
    this.vx = 0;
    this.vy = 0;
    this.poisonTimer = 0;
    this.poisonDps = 0;
    this.phaseMarkers = [];
    this.phaseShockRects = [];
    this.phaseTarget = null;
    this.pendulumAnchor = null;
    this.burrowEscapeTimer = 0;
    this.harpoonAnchor = null;
    this.harpoonStart = null;
    this.harpoonTarget = null;
    this.chronosRifts = [];
    this.prismNodes = [];
    this.prismActiveTimer = 0;
    this.sonarOrigin = null;
    this.sonarWarnTimer = 0;
    this.sonarPulseTimer = 0;
    this.lockjawWarnTimer = 0;
    this.lockjawWaves = [];
    this.prevX = this.x;
    this.prevY = this.y;
  }

  render(ctx, alpha) {
    const x = this.prevX + (this.x - this.prevX) * alpha;
    const y = this.prevY + (this.y - this.prevY) * alpha;

    const baseColor = this.clonePrime ? '#ffb347' : TYPE_COLORS[this.type];

    if (this.dead) {
      if (!this.canRevive) return;
      drawEnemyCorpse(ctx, this, x, y, baseColor);
      return;
    }

    ctx.save();
    drawEnemySprite(ctx, this, x, y, { color: this.type === 'miniboss' ? undefined : baseColor });
    ctx.restore();
    if (this.globalCloneId) {
      const superStats = this.cloneSuperStats();
      const ready = this.cloneSuperCharge >= superStats.CHARGE_REQUIRED;
      const fill = clamp(this.cloneSuperCharge / superStats.CHARGE_REQUIRED, 0, 1);
      ctx.fillStyle = '#111422';
      ctx.fillRect(x, y - 6, this.w, 3);
      ctx.fillStyle = ready ? COLORS.CLONE_SUPER_CORE : COLORS.CLONE_SUPER;
      ctx.fillRect(x, y - 6, this.w * fill, 3);
      if (this.cloneShieldTimer > 0) {
        drawShieldAura(ctx, { x, y, w: this.w, h: this.h }, 0.9);
      }
      if (this.cloneStopPulseTimer > 0) {
        ctx.strokeStyle = COLORS.STOP_FIELD;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + this.w / 2, y + this.h / 2, ENEMY.CLONE.STOP_PULSE_RADIUS, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (this.cloneSlowPulseTimer > 0) {
        ctx.strokeStyle = 'rgba(114, 228, 255, 0.24)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + this.w / 2, y + this.h / 2, ENEMY.CLONE.SLOW_PULSE_RADIUS, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const hitbox of this.getCloneHitboxes(x, y).filter((hitbox) => hitbox.damage > 0)) {
        drawCloneHitboxEffect(ctx, hitbox);
      }
    }

    if (this.archetype === 'sentinel') {
      const arm = this.getSentinelArmLine(x, y);
      if (arm) {
        ctx.save();
        ctx.strokeStyle = COLORS.SENTINEL_ARM;
        ctx.lineWidth = ENEMY.MINIBOSS.SENTINEL_THICKNESS;
        ctx.lineCap = 'square';
        ctx.beginPath();
        ctx.moveTo(arm.x1, arm.y1);
        ctx.lineTo(arm.x2, arm.y2);
        ctx.stroke();
        ctx.fillStyle = COLORS.SENTINEL_ARM_TIP;
        ctx.fillRect(arm.x2 - 4, arm.y2 - 4, 8, 8);
        ctx.restore();
      } else if (this.sentinelWindupTimer > 0) {
        const charge = 1 - this.sentinelWindupTimer / ENEMY.MINIBOSS.SENTINEL_WINDUP_TIME;
        const origin = this.getSentinelArmOrigin(x, y);
        const dir = normalize(this.sentinelExtendDir.x, this.sentinelExtendDir.y);
        ctx.save();
        ctx.strokeStyle = COLORS.SENTINEL_ARM_TIP;
        ctx.lineWidth = 4 + charge * 4;
        ctx.lineCap = 'square';
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        ctx.lineTo(origin.x + dir.x * 18, origin.y + dir.y * 18);
        ctx.stroke();
        ctx.restore();
      }
    }

    if (this.archetype === 'orbiter') {
      ctx.fillStyle = COLORS.ORBITER_BLADE;
      for (const blade of this.getOrbiterHitboxes(x, y)) {
        ctx.fillRect(blade.x, blade.y, blade.w, blade.h);
      }
    }

    if (this.archetype === 'architect') {
      if (this.architectTrapRect && this.architectBlocks.length > 0) {
        ctx.strokeStyle = COLORS.ARCHITECT_WARN;
        ctx.lineWidth = 2;
        ctx.strokeRect(
          this.architectTrapRect.x,
          this.architectTrapRect.y,
          this.architectTrapRect.w,
          this.architectTrapRect.h,
        );
      }
      if (this.architectShockTimer > 0 && this.architectTrapRect) {
        ctx.fillStyle = COLORS.ARCHITECT_SHOCK;
        ctx.fillRect(
          this.architectTrapRect.x,
          this.architectTrapRect.y,
          this.architectTrapRect.w,
          this.architectTrapRect.h,
        );
      }
      ctx.fillStyle = COLORS.ARCHITECT_BLOCK;
      for (const block of this.architectBlocks) {
        ctx.fillRect(block.x, block.y, block.w, block.h);
      }
    }

    if (this.archetype === 'mirage') {
      for (const bomb of this.mirageBombs) {
        ctx.fillStyle = bomb.active > 0 ? COLORS.MIRAGE_BLAST : COLORS.MIRAGE_WARN;
        ctx.fillRect(bomb.x, bomb.y, bomb.w, bomb.h);
      }
    }

    if (this.archetype === 'magnetar' && this.magnetarPulseTimer > 0) {
      const c = center({ x, y, w: this.w, h: this.h });
      ctx.save();
      ctx.strokeStyle = COLORS.MAGNETAR_FIELD;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(c.x, c.y, ENEMY.MINIBOSS.MAGNETAR_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = COLORS.MAGNETAR_CORE;
      for (const core of this.getMagnetarHitboxes(x, y)) {
        ctx.fillRect(core.x, core.y, core.w, core.h);
      }
      ctx.restore();
    }

    if (this.archetype === 'threader' && this.threaderNodes.length > 0) {
      const horizontal = this.threaderNodes.filter((node) => node.kind === 'h');
      const vertical = this.threaderNodes.filter((node) => node.kind === 'v');
      for (const pair of [horizontal, vertical]) {
        if (pair.length < 2) continue;
        ctx.save();
        ctx.strokeStyle = COLORS.THREADER_LINE;
        ctx.globalAlpha = this.threaderActiveTimer > 0 ? 1 : 0.34;
        ctx.lineWidth = ENEMY.MINIBOSS.THREADER_THICKNESS;
        ctx.beginPath();
        ctx.moveTo(pair[0].x, pair[0].y);
        ctx.lineTo(pair[1].x, pair[1].y);
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = COLORS.THREADER_NODE;
      for (const node of this.threaderNodes) {
        ctx.fillRect(node.x - 7, node.y - 7, 14, 14);
      }
    }

    if (this.archetype === 'bellows') {
      for (const bubble of this.bellowsBubbles) {
        ctx.fillStyle = bubble.pop > 0 ? COLORS.BELLOWS_GUST : COLORS.BELLOWS_CORE;
        ctx.fillRect(bubble.x, bubble.y, bubble.w, bubble.h);
        if (bubble.warn > 0) {
          const inset = Math.max(3, bubble.warn * 9);
          ctx.fillStyle = COLORS.BELLOWS_GUST;
          ctx.fillRect(
            bubble.x + inset,
            bubble.y + inset,
            Math.max(4, bubble.w - inset * 2),
            Math.max(4, bubble.h - inset * 2),
          );
        }
      }
    }

    if (this.archetype === 'rainmaker') {
      for (const spear of this.rainSpears) {
        if (spear.warn > 0) {
          ctx.fillStyle = COLORS.RAIN_WARN;
          ctx.fillRect(spear.x, WALL_THICKNESS, spear.w, ROOM_H - WALL_THICKNESS * 2);
        } else {
          ctx.fillStyle = COLORS.RAIN_SPEAR;
          ctx.fillRect(spear.x, spear.y, spear.w, spear.h);
          ctx.fillStyle = '#fff7c2';
          ctx.fillRect(spear.x - 2, spear.y + spear.h - 6, spear.w + 4, 6);
        }
      }
    }

    if (this.archetype === 'phase') {
      for (const marker of this.phaseMarkers) {
        ctx.fillStyle = marker.chosen ? COLORS.PHASE_SHOCK : COLORS.PHASE_MARKER;
        ctx.fillRect(marker.x, marker.y, marker.w, marker.h);
      }
      if (this.phaseShockTimer > 0) {
        ctx.fillStyle = COLORS.PHASE_SHOCK;
        for (const shock of this.phaseShockRects) {
          ctx.fillRect(shock.x, shock.y, shock.w, shock.h);
        }
      }
    }

    if (this.archetype === 'sawbloom' && this.pendulumAnchor) {
      const markerSize = ENEMY.MINIBOSS.SAWBLOOM_MARKER_SIZE;
      ctx.fillStyle = COLORS.SAWBLOOM_MARKER;
      ctx.fillRect(
        this.pendulumAnchor.x - markerSize / 2,
        this.pendulumAnchor.y - markerSize / 2,
        markerSize,
        markerSize,
      );
      if (this.pendulumActiveTimer > 0) {
        const blades = this.pendulumBlades() ?? [];
        const size = ENEMY.MINIBOSS.SAWBLOOM_BLADE_SIZE;
        ctx.fillStyle = COLORS.SAWBLOOM_BLADE;
        for (const blade of blades) {
          ctx.fillRect(blade.x - size / 2, blade.y - size / 2, size, size);
        }
      }
    }

    if (this.archetype === 'burrower') {
      const w = ENEMY.MINIBOSS.BURROW_ERUPT_W;
      if (this.burrowWarnTimer > 0) {
        ctx.fillStyle = COLORS.BURROW_WARN;
        ctx.fillRect(
          this.burrowTargetX - w / 2,
          ROOM_H - WALL_THICKNESS - 8,
          w,
          8,
        );
      }
      if (this.burrowEruptTimer > 0) {
        const h = ENEMY.MINIBOSS.BURROW_ERUPT_H;
        ctx.fillStyle = COLORS.BURROW_ERUPT;
        ctx.fillRect(
          this.burrowTargetX - w / 2,
          ROOM_H - WALL_THICKNESS - h,
          w,
          h,
        );
      }
    }

    if (this.archetype === 'ricochet' && this.ricochetWarnTimer > 0) {
      ctx.save();
      ctx.strokeStyle = COLORS.RICOCHET_WARN;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + this.w / 2, y + this.h / 2);
      ctx.lineTo(
        x + this.w / 2 + this.ricochetDir.x * 54,
        y + this.h / 2 + this.ricochetDir.y * 54,
      );
      ctx.stroke();
      ctx.restore();
    }

    if (this.archetype === 'harpoon' && this.harpoonAnchor) {
      ctx.save();
      ctx.strokeStyle = this.harpoonPullTimer > 0 ? COLORS.HARPOON_LINE : COLORS.HARPOON_WARN;
      ctx.lineWidth = ENEMY.MINIBOSS.HARPOON_THICKNESS;
      ctx.beginPath();
      ctx.moveTo(x + this.w / 2, y + this.h / 2);
      ctx.lineTo(this.harpoonAnchor.x, this.harpoonAnchor.y);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = COLORS.HARPOON_LINE;
      ctx.fillRect(this.harpoonAnchor.x - 5, this.harpoonAnchor.y - 5, 10, 10);
    }

    if (this.archetype === 'chronos') {
      for (const rift of this.chronosRifts) {
        ctx.fillStyle = rift.warn > 0 ? COLORS.CHRONOS_WARN : COLORS.CHRONOS_ECHO;
        ctx.fillRect(rift.x, rift.y, rift.w, rift.h);
      }
    }

    if (this.archetype === 'prism' && this.prismNodes.length > 0) {
      if (this.prismNodes.length >= 3) {
        ctx.save();
        ctx.strokeStyle = COLORS.PRISM_BEAM;
        ctx.globalAlpha = this.prismActiveTimer > 0 ? 1 : 0.28;
        ctx.lineWidth = ENEMY.MINIBOSS.PRISM_THICKNESS;
        ctx.beginPath();
        ctx.moveTo(this.prismNodes[0].x, this.prismNodes[0].y);
        ctx.lineTo(this.prismNodes[1].x, this.prismNodes[1].y);
        ctx.lineTo(this.prismNodes[2].x, this.prismNodes[2].y);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = COLORS.PRISM_NODE;
      for (const node of this.prismNodes) {
        ctx.fillRect(node.x - 7, node.y - 7, 14, 14);
      }
    }

    if (this.archetype === 'sonar') {
      if (this.sonarWarnTimer > 0 && this.sonarOrigin) {
        const size = 42 + (1 - this.sonarWarnTimer / ENEMY.MINIBOSS.SONAR_WARN_TIME) * 26;
        ctx.fillStyle = COLORS.SONAR_WARN;
        ctx.fillRect(this.sonarOrigin.x - size / 2, this.sonarOrigin.y - size / 2, size, size);
      }
      const diamond = this.sonarDiamond();
      if (diamond) {
        ctx.save();
        ctx.strokeStyle = COLORS.SONAR_WAVE;
        ctx.lineWidth = ENEMY.MINIBOSS.SONAR_THICKNESS;
        ctx.beginPath();
        ctx.moveTo(diamond[0].x, diamond[0].y);
        ctx.lineTo(diamond[1].x, diamond[1].y);
        ctx.lineTo(diamond[2].x, diamond[2].y);
        ctx.lineTo(diamond[3].x, diamond[3].y);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    }

    if (this.archetype === 'lockjaw') {
      if (this.lockjawWarnTimer > 0) {
        ctx.fillStyle = COLORS.LOCKJAW_WARN;
        ctx.fillRect(
          WALL_THICKNESS,
          ROOM_H - WALL_THICKNESS - ENEMY.MINIBOSS.LOCKJAW_WAVE_H,
          ROOM_W - WALL_THICKNESS * 2,
          ENEMY.MINIBOSS.LOCKJAW_WAVE_H,
        );
      }
      ctx.fillStyle = COLORS.LOCKJAW_PLATE;
      for (const wave of this.lockjawWaves) {
        ctx.fillRect(wave.x, wave.y, wave.w, wave.h);
      }
    }

    if (this.hp < this.maxHp) {
      ctx.fillStyle = '#151824';
      ctx.fillRect(x, y - 5, this.w, 3);
      ctx.fillStyle = COLORS.MINIBOSS;
      ctx.fillRect(x, y - 5, this.w * (this.hp / this.maxHp), 3);
    }
  }
}
