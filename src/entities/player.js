import { ROOM_W, ROOM_H, PLAYER, GRAVITY, WEAPON } from '../config.js';
import { drawGroundSlamWave, drawPlayerAttack, drawPlayerSprite } from '../graphics/sprites.js';
import { isDown, isPressed } from '../input.js';
import { clipDirectionalRect, moveAndCollide, rectsOverlap } from '../systems/physics.js';

const ROOM_BOUNDS = { x: 0, y: 0, w: ROOM_W, h: ROOM_H };

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    // Stato precedente per interpolazione del rendering.
    this.prevX = x;
    this.prevY = y;
    this.w = PLAYER.W;
    this.h = PLAYER.H;
    this.standH = PLAYER.H;
    this.crouchH = PLAYER.CROUCH_H;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.isCrouching = false;
    this.facing = 1;
    this.maxLifeSlots = PLAYER.START_LIFE_SLOTS ?? 3;
    this.currentLife = this.maxLifeSlots;
    this.coins = 0;
    this.weaponLevel = WEAPON.LEVEL ?? 1;
    this.attackTimer = 0;
    this.attackCooldown = 0;
    this.attackDir = { x: 1, y: 0 };
    this.attackHitIds = new Set();
    this.airJumpsUsed = 0;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.isRunning = false;
    this.runDir = 1;
    this.runTapDir = 0;
    this.runTapTimer = 0;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.dashDirX = 1;
    this.dashDirY = 0;
    this.groundSlamActive = false;
    this.groundSlamImpactTimer = 0;
    this.groundSlamRecoveryTimer = 0;
    this.groundSlamTapTimer = 0;
    this.groundSlamHitIds = new Set();
    this.invulnTimer = 0;
    this.jumpSoundQueued = false;
    this.attackSoundQueued = false;
    this.groundSlamImpactQueued = false;
  }

  update(dt, solids, options = {}) {
    // Snapshot per interpolazione.
    this.prevX = this.x;
    this.prevY = this.y;
    this.jumpSoundQueued = false;
    this.attackSoundQueued = false;
    this.groundSlamImpactQueued = false;

    const weaponsLocked = options.weaponsLocked === true;
    const speedScale = options.speedScale ?? 1;
    const wasOnGround = this.onGround;
    if (wasOnGround) this.coyoteTimer = PLAYER.COYOTE_TIME;
    else this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    if (isPressed('jump')) this.jumpBufferTimer = PLAYER.JUMP_BUFFER_TIME;
    else this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    if (this.dashCooldown > 0) this.dashCooldown -= dt;
    if (this.dashTimer > 0) this.dashTimer -= dt;
    if (this.runTapTimer > 0) this.runTapTimer -= dt;
    if (this.groundSlamImpactTimer > 0) this.groundSlamImpactTimer -= dt;
    if (this.groundSlamTapTimer > 0) this.groundSlamTapTimer -= dt;
    if (weaponsLocked && this.attackTimer > 0) {
      this.attackTimer = 0;
      this.attackHitIds.clear();
    }
    if (this.groundSlamRecoveryTimer > 0) {
      this.groundSlamRecoveryTimer -= dt;
      this.vx = 0;
      this.vy = 0;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
      if (this.attackCooldown > 0) this.attackCooldown -= dt;
      if (this.attackTimer > 0) this.attackTimer -= dt;
      if (this.invulnTimer > 0) this.invulnTimer -= dt;
      return;
    }

    this._updateCrouch(solids);

    // Input orizzontale.
    const dir = (isDown('right') ? 1 : 0) - (isDown('left') ? 1 : 0);
    this._updateRunInput(dir);
    if (dir !== 0) this.facing = Math.sign(dir);
    const moveSpeed = (this.isCrouching
      ? PLAYER.CROUCH_MOVE_SPEED
      : this.isRunning ? PLAYER.RUN_SPEED : PLAYER.MOVE_SPEED) * speedScale;
    if (isPressed('dash') && this.hasAbility('dash') && this.dashCooldown <= 0) {
      this.startDash(this._readDashDirection());
    }
    if (this.dashTimer > 0) {
      this.vx = this.dashDirX * PLAYER.DASH_SPEED * speedScale;
      this.vy = this.dashDirY * PLAYER.DASH_SPEED * speedScale;
    } else {
      this.vx = dir * moveSpeed;
    }

    const bufferedJump = this.jumpBufferTimer > 0;
    const heldGroundJump = this.onGround && isDown('jump');
    if ((bufferedJump || heldGroundJump) && (this.onGround || this.coyoteTimer > 0)) {
      this._performJump(PLAYER.JUMP_VELOCITY);
    } else if (isPressed('jump') && !this.onGround) {
      const wallDir = this.hasAbility('wall_jump') ? this._wallDir(solids) : 0;
      if (wallDir !== 0) {
        this.vx = -wallDir * PLAYER.WALL_JUMP_VELOCITY_X;
        this._performJump(PLAYER.JUMP_VELOCITY * 0.92);
        this.facing = -wallDir;
        this.airJumpsUsed = 0;
      } else if (this.hasAbility('double_jump') && this.airJumpsUsed < 1) {
        this._performJump(PLAYER.JUMP_VELOCITY);
        this.airJumpsUsed += 1;
      }
    }

    // Salto variabile: se rilascio il tasto mentre sto ancora salendo,
    // taglio la velocità verticale. Tenere premuto = altezza piena.
    if (!isDown('jump') && this.vy < -PLAYER.JUMP_CUT_VELOCITY) {
      this.vy = -PLAYER.JUMP_CUT_VELOCITY;
    }

    if (this.hasAbility('ground_slam') && !this.onGround && isPressed('down')) {
      if (this.groundSlamTapTimer > 0) this.startGroundSlam();
      else this.groundSlamTapTimer = PLAYER.GROUND_SLAM_DOUBLE_TAP_WINDOW;
    }

    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.attackTimer > 0) this.attackTimer -= dt;
    if (this.invulnTimer > 0) this.invulnTimer -= dt;
    if (!weaponsLocked && isPressed('attack')) this.startAttack(this._readAttackDirection());

    // Gravità.
    if (this.dashTimer <= 0) {
      const gravityScale = this.vy > 0 ? PLAYER.FALL_GRAVITY_SCALE : 1;
      this.vy += GRAVITY * gravityScale * dt;
    }

    // Movimento + collisioni asse-per-asse.
    moveAndCollide(this, this.vx * dt, 0, solids);
    moveAndCollide(this, 0, this.vy * dt, solids);

    if (this.onGround) {
      this.airJumpsUsed = 0;
      if (!wasOnGround && this.groundSlamActive) {
        this.groundSlamImpactTimer = 0.12;
        this.groundSlamRecoveryTimer = PLAYER.GROUND_SLAM_RECOVERY_TIME;
        this.groundSlamHitIds.clear();
        this.groundSlamImpactQueued = true;
      }
      this.groundSlamActive = false;
    }
  }

  _performJump(velocity) {
    this.vy = -velocity;
    this.onGround = false;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.airJumpsUsed = 0;
    this.jumpSoundQueued = true;
  }

  startAttack(direction = { x: this.facing, y: 0 }) {
    if (this.attackCooldown > 0) return;
    const stats = this.getWeaponStats();
    this.attackDir = direction;
    this.attackTimer = WEAPON.ACTIVE_TIME;
    this.attackCooldown = stats.COOLDOWN ?? WEAPON.COOLDOWN;
    this.attackHitIds.clear();
    this.attackSoundQueued = true;
  }

  startDash(direction) {
    this.stopRun();
    const dx = typeof direction === 'number' ? direction : (direction?.x ?? 0);
    const dy = typeof direction === 'number' ? 0 : (direction?.y ?? 0);
    let nx = dx;
    let ny = dy;
    const len = Math.hypot(nx, ny);
    if (len > 0) { nx /= len; ny /= len; }
    else { nx = this.facing; ny = 0; }
    this.dashDirX = nx;
    this.dashDirY = ny;
    if (nx !== 0) this.facing = Math.sign(nx);
    this.dashTimer = PLAYER.DASH_TIME;
    this.dashCooldown = PLAYER.DASH_COOLDOWN;
    this.vx = nx * PLAYER.DASH_SPEED;
    this.vy = ny * PLAYER.DASH_SPEED;
  }

  startGroundSlam() {
    if (this.groundSlamActive) return;
    this.stopRun();
    this.groundSlamActive = true;
    this.groundSlamTapTimer = 0;
    this.dashTimer = 0;
    this.vx = 0;
    this.vy = Math.max(this.vy, PLAYER.GROUND_SLAM_SPEED);
  }

  getWeaponStats() {
    return WEAPON.LEVELS[this.weaponLevel] ?? WEAPON.LEVELS[1];
  }

  hasAbility(id) {
    return this.abilities?.includes(id);
  }

  getAttackHitbox(solids = [], x = this.x, y = this.y) {
    if (this.attackTimer <= 0) return null;
    const stats = this.getWeaponStats();
    const dir = this.attackDir;
    const bladeThickness = Math.min(stats.H, this.h);
    const centerX = x + this.w / 2;
    const centerY = y + this.h / 2;
    let hitbox;

    if (dir.y < 0) {
      hitbox = {
        x: centerX - bladeThickness / 2,
        y: y - stats.RANGE,
        w: bladeThickness,
        h: stats.RANGE,
      };
    } else if (dir.y > 0) {
      hitbox = {
        x: centerX - bladeThickness / 2,
        y: y + this.h,
        w: bladeThickness,
        h: stats.RANGE,
      };
    } else {
      hitbox = {
        x: dir.x > 0 ? x + this.w : x - stats.RANGE,
        y: centerY - bladeThickness / 2,
        w: stats.RANGE,
        h: bladeThickness,
      };
    }

    return clipDirectionalRect(
      {
        ...hitbox,
        damage: stats.DAMAGE,
        poisonDuration: stats.POISON_DURATION ?? 0,
        poisonDps: stats.POISON_DPS ?? 0,
        direction: { ...dir },
      },
      solids,
      dir,
      ROOM_BOUNDS,
    );
  }

  takeDamage(amount, knockbackDir = 0) {
    if (this.dashTimer > 0) return false;
    if (this.invulnTimer > 0 || this.currentLife <= 0) return false;
    this.currentLife = Math.max(0, this.currentLife - amount);
    this.invulnTimer = PLAYER.INVULN_TIME;
    if (knockbackDir !== 0) {
      this.vx = knockbackDir * 120;
      this.vy = Math.min(this.vy, -180);
    }
    return this.currentLife <= 0;
  }

  getGroundSlamHitbox() {
    if (this.groundSlamImpactTimer <= 0) return null;
    return {
      x: this.x + this.w / 2 - PLAYER.GROUND_SLAM_RADIUS,
      y: this.y + this.h - PLAYER.GROUND_SLAM_RADIUS / 2,
      w: PLAYER.GROUND_SLAM_RADIUS * 2,
      h: PLAYER.GROUND_SLAM_RADIUS,
      damage: PLAYER.GROUND_SLAM_DAMAGE,
    };
  }

  addCoins(amount) {
    const multiplier = this.hasAbility('coin_multiplier') ? 1.5 : 1;
    this.coins += Math.ceil(amount * multiplier);
  }

  isDownAttackActive() {
    return this.attackTimer > 0 && this.attackDir.y > 0;
  }

  bounceFromDownAttack() {
    if (this.onGround) return;
    this.vy = Math.min(this.vy, -PLAYER.DOWN_ATTACK_BOUNCE_VELOCITY);
    this.onGround = false;
  }

  respawnAt(x, y) {
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.vx = 0;
    this.vy = 0;
    this.stopRun();
    this.runTapTimer = 0;
    this.runTapDir = 0;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.currentLife = this.maxLifeSlots;
    this.invulnTimer = PLAYER.INVULN_TIME;
    this.onGround = false;
  }

  _updateCrouch(solids) {
    if (isDown('crouch')) {
      this._setCrouched(true);
      return;
    }

    if (this.isCrouching && this._canStand(solids)) {
      this._setCrouched(false);
    }
  }

  _updateRunInput(dir) {
    if (!this.hasAbility('run')) {
      this.stopRun();
      return;
    }

    const pressedDir = (isPressed('right') ? 1 : 0) - (isPressed('left') ? 1 : 0);
    if (pressedDir !== 0 && !this.isCrouching) {
      if (this.runTapDir === pressedDir && this.runTapTimer > 0) {
        this.startRun(pressedDir);
      } else {
        this.runTapDir = pressedDir;
        this.runTapTimer = PLAYER.RUN_DOUBLE_TAP_WINDOW;
      }
    }

    if (this.isRunning && (dir !== this.runDir || this.isCrouching || this.dashTimer > 0)) {
      this.stopRun();
    }
  }

  startRun(direction) {
    this.isRunning = true;
    this.runDir = direction;
    this.facing = direction;
    this.runTapTimer = 0;
  }

  stopRun() {
    this.isRunning = false;
  }

  _setCrouched(crouched) {
    const newH = crouched ? this.crouchH : this.standH;
    if (this.h === newH) return;

    const oldY = this.y;
    const feetY = this.y + this.h;
    this.h = newH;
    this.y = feetY - this.h;
    this.prevY += this.y - oldY;
    this.isCrouching = crouched;
  }

  _canStand(solids) {
    const standRect = {
      x: this.x,
      y: this.y + this.h - this.standH,
      w: this.w,
      h: this.standH,
    };

    for (const s of solids) {
      if (s.oneWay) continue;
      if (rectsOverlap(standRect, s)) return false;
    }
    return true;
  }

  _readAttackDirection() {
    if (!this.onGround && isDown('down')) return { x: 0, y: 1 };
    if (isDown('up')) return { x: 0, y: -1 };
    return { x: this.facing, y: 0 };
  }

  _readDashDirection() {
    const dx = (isDown('right') ? 1 : 0) - (isDown('left') ? 1 : 0);
    const dy = (isDown('down') ? 1 : 0) - (isDown('up') ? 1 : 0);
    if (dx === 0 && dy === 0) return { x: this.facing, y: 0 };
    return { x: dx, y: dy };
  }

  _wallDir(solids) {
    const left = { x: this.x - 2, y: this.y + 4, w: 2, h: this.h - 8 };
    const right = { x: this.x + this.w, y: this.y + 4, w: 2, h: this.h - 8 };
    for (const solid of solids) {
      if (solid.oneWay) continue;
      if (rectsOverlap(left, solid)) return -1;
      if (rectsOverlap(right, solid)) return 1;
    }
    return 0;
  }

  render(ctx, alpha, solids = []) {
    // Interpolazione tra stato precedente e attuale per fluidità a frame rate
    // diverso dal tickrate logico.
    const x = this.prevX + (this.x - this.prevX) * alpha;
    const y = this.prevY + (this.y - this.prevY) * alpha;
    const flickerOff = this.invulnTimer > 0 && Math.floor(this.invulnTimer * 18) % 2 === 0;
    if (!flickerOff) drawPlayerSprite(ctx, this, x, y);

    const attack = this.getAttackHitbox(solids, x, y);
    drawPlayerAttack(ctx, attack, this);

    const slam = this.getGroundSlamHitbox();
    drawGroundSlamWave(ctx, slam);
  }
}
