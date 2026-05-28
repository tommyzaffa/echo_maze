import {
  ROOM_W, ROOM_H, WALL_THICKNESS,
  DOOR_NS_WIDTH, DOOR_EW_HEIGHT,
  FIXED_DT, MAX_FRAME_DT,
  COLORS, PLAYER, ROOM_TRANSITION, ENEMY, PICKUP, ABILITY, CONSUMABLE, SHOP, DEBUG, SUPER_WEAPON, FEEDBACK,
} from './config.js';
import { Player } from './entities/player.js';
import { Enemy } from './entities/enemy.js';
import { Pickup } from './entities/pickup.js';
import {
  ACTION_ORDER,
  actionMatchesCode,
  codeLabel,
  endTick,
  getActionCodes,
  getActionBindings,
  isDown,
  isPressed,
  resetActionBindings,
  setActionBinding,
} from './input.js';
import {
  LANGUAGES,
  abilityName,
  actionName,
  bossName,
  consumableName,
  getLanguage,
  itemDescription,
  itemName,
  languageName,
  merchantDialogue,
  npcName,
  npcRole,
  setLanguage,
  t,
} from './i18n.js';
import { generateMaze, MAZE_SIZE } from './maze/mazeGenerator.js';
import {
  activateCheckpointOnMinimap,
  createMinimapState,
  renderMinimap,
  setCloneSnapshotsOnMinimap,
  visitRoomOnMinimap,
} from './maze/minimap.js';
import {
  NPCS,
  ABILITIES,
  CONSUMABLES,
  buyShopItem,
  createShopInventories,
  ensureShopInventory,
  itemStatus,
  updateShopRestock,
} from './shop/shop.js';
import {
  drawCheckpointSprite,
  drawNpcSprite,
  drawPlayerProjectile,
  drawShieldAura,
  drawTeleportAnchor,
  drawTemporaryPlatform,
} from './graphics/sprites.js';
import { addStack, canAddStack, stackSpace } from './systems/inventory.js';
import { Rng } from './utils/rng.js';

// --- Setup canvas ---
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = true;
const hudTop = document.getElementById('hud-top');
const hudBottom = document.getElementById('hud-bottom');
const abilityPanel = document.getElementById('ability-panel');
const shopOverlay = document.getElementById('shop-overlay');
const shopTitle = document.getElementById('shop-title');
const shopSubtitle = document.getElementById('shop-subtitle');
const shopList = document.getElementById('shop-list');
const shopFeedback = document.getElementById('shop-feedback');
const shopClose = document.getElementById('shop-close');
const mainMenu = document.getElementById('main-menu');
const menuTitle = document.getElementById('menu-title');
const menuSubtitle = document.getElementById('menu-subtitle');
const menuStart = document.getElementById('menu-start');
const menuControls = document.getElementById('menu-controls');
const menuLanguage = document.getElementById('menu-language');
const languagePicker = document.getElementById('language-picker');
const menuMainActions = document.getElementById('menu-main-actions');
const controlsPanel = document.getElementById('controls-panel');
const controlsTitle = document.getElementById('controls-title');
const controlsHint = document.getElementById('controls-hint');
const controlsBack = document.getElementById('controls-back');
const controlsList = document.getElementById('controls-list');
const controlsReset = document.getElementById('controls-reset');
const deviceBlock = document.getElementById('device-block');
const deviceBlockTitle = document.getElementById('device-block-title');
const deviceBlockMessage = document.getElementById('device-block-message');
const viewportWarning = document.getElementById('viewport-warning');
const cinematicOverlay = document.getElementById('cinematic-overlay');
const storyVideo = document.getElementById('story-video');
const cinematicCaption = document.getElementById('cinematic-caption');
const rulesOverlay = document.getElementById('rules-overlay');
const rulesTitle = document.getElementById('rules-title');
const rulesBody = document.getElementById('rules-body');
const rulesContinue = document.getElementById('rules-continue');

const CINEMATIC_SOURCES = {
  intro: 'assets/video/intro.mp4',
  victory: 'assets/video/victory.mp4',
  gameover: 'assets/video/gameover.mp4',
};

const HUD_REFRESH_INTERVAL = 0.1;
const CLONE_SYNC_INTERVAL = 0.25;
const DORMANT_REVIVER_INTERVAL = 0.5;
const MAX_ACTIVE_HTML_SOUNDS = 24;
const MAX_ACTIVE_WEB_AUDIO_VOICES = 48;

const DISCOVERY_COLORS = {
  checkpoint: COLORS.CHECKPOINT,
  merchant: COLORS.NPC,
  boss: COLORS.MINIBOSS,
  clone: COLORS.CLONE_SUPER,
  prime: '#ffb347',
  benefactor: COLORS.NPC_BENEFACTOR,
  warning: COLORS.MINIBOSS_LOCK,
};

const autoStartRequested = sessionStorage.getItem('echoMaze.autostart') === '1';
const introRequested = sessionStorage.getItem('echoMaze.pendingIntro') === '1';
const rulesRequested = sessionStorage.getItem('echoMaze.pendingRules') === '1';

const appState = {
  menuOpen: !autoStartRequested,
  controlsOpen: false,
  listeningAction: null,
  menuRequiresNewRun: false,
  menuFocusIndex: 0,
  controlsFocusIndex: 0,
  languageOpen: false,
  languageFocusIndex: 0,
  returnToPauseAfterControls: false,
  deviceBlocked: false,
  cinematicOpen: false,
  rulesOpen: false,
  viewportTooSmall: false,
  pendingIntro: introRequested,
  pendingRules: rulesRequested,
};
sessionStorage.removeItem('echoMaze.autostart');
sessionStorage.removeItem('echoMaze.pendingIntro');
sessionStorage.removeItem('echoMaze.pendingRules');

function resizeCanvas() {
  // Il canvas riempie il proprio contenitore (1fr del grid in style.css).
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width  = Math.max(1, Math.floor(rect.width  * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.imageSmoothingEnabled = true;

  const roomCssScale = Math.min(rect.width / ROOM_W, rect.height / ROOM_H);
  const roomCssWidth = Math.floor(ROOM_W * roomCssScale);
  const sidePanelWidth = Math.max(0, Math.floor((rect.width - roomCssWidth) / 2));
  document.documentElement.style.setProperty('--playfield-width', `${roomCssWidth}px`);
  document.documentElement.style.setProperty('--side-panel-width', `${sidePanelWidth}px`);
  abilityPanel?.classList.toggle('is-hidden', sidePanelWidth < 84);
}
window.addEventListener('resize', resizeCanvas);
requestAnimationFrame(resizeCanvas);

// --- Mondo procedurale (M3) ---
function ensureSeedInUrl() {
  const url = new URL(window.location.href);
  const existing = url.searchParams.get('seed');
  if (existing) return existing;

  const seed = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  url.searchParams.set('seed', seed);
  window.history.replaceState(null, '', url);
  return seed;
}

const maze = generateMaze(ensureSeedInUrl());
console.log(`[Echo Maze] seed=${maze.seed}`, maze.stats);
const rooms = maze.rooms;
let currentRoom = maze.startRoom;
let debugGraphOpen = false;
let fullMapOpen = false;
const minimapState = createMinimapState(maze);
const runtimeRng = new Rng(`${maze.seed}:runtime`);
const roomStates = new Map();
const minibossRewardPlan = createMinibossRewardPlan(maze, maze.seed);
applyMinibossRewardsToRooms(minibossRewardPlan);
const shopInventories = createShopInventories(maze.seed, {
  mysticAbilityIds: minibossRewardPlan.mysticAbilityIds,
});
console.log('[Echo Maze] M8 reward plan', {
  mysticAbilities: minibossRewardPlan.mysticAbilityIds,
  minibossRewards: [...minibossRewardPlan.rewards.entries()],
});
const gameState = {
  paused: appState.menuOpen,
  shop: null,
  gift: null,
  shopSelectedIndex: 0,
  lifeSlotCap: PLAYER.MAX_LIFE_SLOTS,
  slowTimeTimer: 0,
  camouflageTimer: 0,
  stopTimer: 0,
  stopCooldown: 0,
  playerSlowTimer: 0,
  playerStopTimer: 0,
  shieldTimer: 0,
  shieldCooldown: 0,
  superReadyPulseTimer: 0,
  teleportAnchor: null,
  checkpointPulseTimer: 0,
  pauseMenuOpen: false,
  controlsBoardOpen: false,
  overlayFocusIndex: 0,
  shakeTimer: 0,
  shakeDuration: 0,
  shakeMagnitude: 0,
  notifications: [],
  discoveryNotified: new Set(),
  benefactorFoundRooms: new Set(),
  hudTopHtml: '',
  hudBottomHtml: '',
  abilityPanelHtml: '',
  hudRefreshTimer: 0,
  cloneSyncTimer: 0,
  dormantReviverTimer: 0,
  dormantReviverDt: 0,
  endRevealAt: 0,
  endVideoStarted: false,
  cinematicFinish: null,
  cinematicNeedsStart: false,
};
const cloneState = {
  clones: [],
  nextId: 1,
  firstCloneDefeated: false,
  endKind: null,
  endMessageKey: '',
  endMessageParams: {},
};
const benefactorState = {
  initialAvailable: true,
  currentRoomId: maze.startId,
  respawnTimer: 0,
  pendingRelocation: false,
  hasIntroduced: false,
};

function isMobileOrTabletDevice() {
  const ua = navigator.userAgent ?? '';
  const platform = navigator.platform ?? '';
  const userAgentDataMobile = navigator.userAgentData?.mobile === true;
  const iPadDesktopMode = platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;
  const mobileOrTabletUa = /Android|iPhone|iPad|iPod|Mobile|Tablet|Kindle|Silk|Windows Phone/i.test(ua);
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const finePointer = window.matchMedia?.('(pointer: fine)').matches ?? false;
  const hoverNone = window.matchMedia?.('(hover: none)').matches ?? false;
  return userAgentDataMobile || iPadDesktopMode || mobileOrTabletUa || (coarsePointer && hoverNone && !finePointer);
}

function isDesktopViewportSmall() {
  return window.innerWidth < 1000 || window.innerHeight < 620;
}

function refreshDeviceBlock() {
  appState.deviceBlocked = isMobileOrTabletDevice();
  appState.viewportTooSmall = !appState.deviceBlocked && isDesktopViewportSmall();
  if (deviceBlock) deviceBlock.classList.toggle('is-hidden', !appState.deviceBlocked);
  if (deviceBlock) deviceBlock.setAttribute('aria-hidden', appState.deviceBlocked ? 'false' : 'true');
  if (viewportWarning) {
    viewportWarning.classList.toggle('is-hidden', !appState.viewportTooSmall);
    viewportWarning.textContent = t('viewportWarning');
  }
  if (appState.deviceBlocked) {
    gameState.paused = true;
    return;
  }
  if (
    !appState.menuOpen &&
    !appState.cinematicOpen &&
    !appState.rulesOpen &&
    !gameState.pauseMenuOpen &&
    !gameState.controlsBoardOpen &&
    !gameState.shop &&
    !gameState.gift &&
    !cloneState.endKind
  ) {
    gameState.paused = false;
  }
  if (appState.pendingIntro && !appState.menuOpen && !appState.cinematicOpen && !appState.rulesOpen) {
    appState.pendingIntro = false;
    startIntroFlow();
    return;
  }
  if (appState.pendingRules && !appState.menuOpen && !appState.cinematicOpen && !appState.rulesOpen) {
    appState.pendingRules = false;
    showRulesOverlay();
  }
}

function setHtmlIfChanged(element, htmlKey, html) {
  if (!element || gameState[htmlKey] === html) return;
  gameState[htmlKey] = html;
  element.innerHTML = html;
}

function unlockLegend(type) {
  if (!minimapState.legendUnlocked) minimapState.legendUnlocked = new Set();
  minimapState.legendUnlocked.add(type);
}

function queueNotification({ type = 'clone', title, subtitle = '', color, duration = 3.4, sound = 'discover' }) {
  const now = performance.now() / 1000;
  gameState.notifications.push({
    type,
    title,
    subtitle,
    color: color ?? DISCOVERY_COLORS[type] ?? COLORS.CHECKPOINT,
    start: now,
    duration,
  });
  gameState.notifications = gameState.notifications.slice(-4);
  playGameSound(sound);
}

function notifyDiscovery(key, textKey, params, type) {
  if (gameState.discoveryNotified.has(key)) return;
  gameState.discoveryNotified.add(key);
  unlockLegend(type);
  queueNotification({
    type,
    title: t(textKey, params),
    color: DISCOVERY_COLORS[type],
  });
}

function notifyCurrentRoomDiscovery({ initial = false } = {}) {
  if (!currentRoom?.meta) return;
  if (currentRoom.meta.checkpoint) {
    notifyDiscovery(
      `${currentRoom.id}:checkpoint`,
      'toastCheckpoint',
      { name: t('legendCheckpoint') },
      'checkpoint',
    );
  }
  if (currentRoom.meta.npc) {
    notifyDiscovery(
      `${currentRoom.id}:npc:${currentRoom.meta.npc}`,
      'toastMerchant',
      { name: npcName(currentRoom.meta.npc) },
      'merchant',
    );
  }
  if (currentRoom.meta.miniboss) {
    notifyDiscovery(
      `${currentRoom.id}:boss:${currentRoom.meta.minibossArchetype ?? 'boss'}`,
      'toastBoss',
      { name: bossName(currentRoom.meta.minibossArchetype ?? 'boss') },
      'boss',
    );
  }
  if (
    !initial &&
    isBenefactorVisibleInCurrentRoom() &&
    !benefactorState.initialAvailable &&
    currentRoom.id !== maze.startId &&
    !benefactorState.pendingRelocation &&
    !gameState.benefactorFoundRooms.has(currentRoom.id)
  ) {
    gameState.benefactorFoundRooms.add(currentRoom.id);
    queueNotification({
      type: 'benefactor',
      title: t('toastBenefactorFound', { name: npcName('benefactor') }),
      color: DISCOVERY_COLORS.benefactor,
    });
  }
}

function notifyCloneStart() {
  queueNotification({
    type: 'clone',
    title: t('toastCloneStart'),
    color: DISCOVERY_COLORS.clone,
    duration: 3.8,
    sound: 'clone',
  });
}

function notifyPickupCollected(pickup) {
  if (!pickup) return;
  if (pickup.type === 'ability' && pickup.abilityId) {
    queueNotification({
      type: 'checkpoint',
      title: t('toastAbilityPickup', { name: abilityName(pickup.abilityId) }),
      color: DISCOVERY_COLORS.checkpoint,
      duration: 3.2,
      sound: 'discover',
    });
  } else if (pickup.type === 'consumable' && pickup.consumableId) {
    const amount = pickup.amount && pickup.amount > 1 ? ` x${pickup.amount}` : '';
    queueNotification({
      type: 'merchant',
      title: t('toastConsumablePickup', { name: `${consumableName(pickup.consumableId)}${amount}` }),
      color: DISCOVERY_COLORS.merchant,
      duration: 3.2,
      sound: 'discover',
    });
  }
}

const CLONE_ADJACENT_COOLDOWN_MS = 30000;
let cloneAdjacentLastNotifyAt = -Infinity;
let primeAdjacentLastNotifyAt = -Infinity;
let cloneAdjacentLastSeen = new Set();
let primeAdjacentLastSeen = new Set();

function notifyCloneAdjacent({ prime = false } = {}) {
  const now = performance.now();
  if (prime) {
    if (now - primeAdjacentLastNotifyAt < CLONE_ADJACENT_COOLDOWN_MS) return;
    primeAdjacentLastNotifyAt = now;
  } else {
    if (now - cloneAdjacentLastNotifyAt < CLONE_ADJACENT_COOLDOWN_MS) return;
    cloneAdjacentLastNotifyAt = now;
  }
  queueNotification({
    type: prime ? 'prime' : 'clone',
    title: t(prime ? 'toastPrimeAdjacent' : 'toastCloneAdjacent'),
    color: prime ? DISCOVERY_COLORS.prime : DISCOVERY_COLORS.clone,
    duration: prime ? 3.8 : 3.4,
    sound: 'clone',
  });
}

function notifyCloneCountAfterDeath() {
  const aliveCount = aliveGlobalClones().length;
  if (aliveCount > ENEMY.CLONE.MAX_ALIVE) return;
  queueNotification({
    type: aliveCount >= ENEMY.CLONE.MAX_ALIVE ? 'warning' : 'clone',
    title: t(aliveCount >= ENEMY.CLONE.MAX_ALIVE ? 'toastCloneWarning' : 'toastDeathClones', { count: aliveCount }),
    color: aliveCount >= ENEMY.CLONE.MAX_ALIVE ? DISCOVERY_COLORS.warning : DISCOVERY_COLORS.clone,
    duration: aliveCount >= ENEMY.CLONE.MAX_ALIVE ? 4.2 : 3.6,
    sound: aliveCount >= ENEMY.CLONE.MAX_ALIVE ? 'warning' : 'clone',
  });
}

function notifyCloneRemaining() {
  const aliveCount = aliveGlobalClones().length;
  queueNotification({
    type: aliveCount === 0 ? 'checkpoint' : 'clone',
    title: t('toastCloneRemaining', { count: aliveCount }),
    color: aliveCount === 0 ? COLORS.CHECKPOINT : DISCOVERY_COLORS.clone,
    sound: aliveCount === 0 ? 'victory' : 'clone',
  });
}

function showRulesOverlay() {
  appState.rulesOpen = true;
  gameState.paused = true;
  if (rulesTitle) rulesTitle.textContent = t('rulesTitle');
  if (rulesBody) rulesBody.textContent = t('rulesBody');
  if (rulesContinue) rulesContinue.textContent = t('rulesContinue');
  if (rulesOverlay) {
    rulesOverlay.classList.remove('is-hidden');
    rulesOverlay.setAttribute('aria-hidden', 'false');
  }
}

function hideRulesOverlay() {
  appState.rulesOpen = false;
  if (rulesOverlay) {
    rulesOverlay.classList.add('is-hidden');
    rulesOverlay.setAttribute('aria-hidden', 'true');
  }
  if (!appState.deviceBlocked) gameState.paused = false;
  startAmbientMusic();
  notifyCloneStart();
  endTick();
}

function stopCinematicVideo() {
  if (!storyVideo) return;
  storyVideo.pause();
  storyVideo.removeAttribute('src');
  storyVideo.load();
}

function hideCinematicOverlay() {
  appState.cinematicOpen = false;
  gameState.cinematicFinish = null;
  gameState.cinematicNeedsStart = false;
  if (cinematicOverlay) {
    cinematicOverlay.classList.add('is-hidden');
    cinematicOverlay.setAttribute('aria-hidden', 'true');
  }
  stopCinematicVideo();
}

function startPendingCinematicPlayback() {
  if (!storyVideo || !appState.cinematicOpen) return;
  gameState.cinematicNeedsStart = false;
  if (cinematicCaption) cinematicCaption.textContent = t('skipVideo');
  storyVideo.muted = false;
  storyVideo.volume = 1;
  storyVideo.play().then(() => {
    playGameSound('ui');
  }).catch(() => {
    gameState.cinematicNeedsStart = true;
    if (cinematicCaption) cinematicCaption.textContent = t('startVideo');
  });
}

function playCinematic(kind, onComplete) {
  const source = CINEMATIC_SOURCES[kind];
  appState.cinematicOpen = true;
  gameState.paused = true;
  if (cinematicCaption) {
    cinematicCaption.textContent = t('skipVideo');
  }
  if (cinematicOverlay) {
    cinematicOverlay.classList.remove('is-hidden');
    cinematicOverlay.setAttribute('aria-hidden', 'false');
  }
  if (!storyVideo || !source) {
    hideCinematicOverlay();
    onComplete?.();
    return;
  }

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    storyVideo.removeEventListener('ended', finish);
    storyVideo.removeEventListener('error', finish);
    hideCinematicOverlay();
    onComplete?.();
  };
  gameState.cinematicFinish = finish;
  storyVideo.addEventListener('ended', finish);
  storyVideo.addEventListener('error', finish);
  storyVideo.src = source;
  storyVideo.currentTime = 0;
  storyVideo.muted = false;
  storyVideo.volume = 1;
  storyVideo.load();
  startPendingCinematicPlayback();
}

function startIntroFlow() {
  appState.menuOpen = false;
  appState.controlsOpen = false;
  appState.languageOpen = false;
  gameState.pauseMenuOpen = false;
  gameState.paused = true;
  renderMainMenu();
  playCinematic('intro', showRulesOverlay);
}

function finishEndVideo(kind) {
  if (gameState.endVideoStarted) return;
  gameState.endVideoStarted = true;
  playCinematic(kind, () => {
    hideCinematicOverlay();
    returnToMainMenu();
  });
}

window.addEventListener('resize', refreshDeviceBlock);

// --- Player: spawn al centro della stanza iniziale, sul pavimento. ---
const initialSpawn = getInitialSpawn(currentRoom);
const player = new Player(initialSpawn.x, initialSpawn.y);
ensurePlayerCombatStats(player);
applyTemporaryTestInventory(player);
spawnInitialClone();
requestAnimationFrame(() => {
  refreshDeviceBlock();
  if (!appState.pendingIntro && autoStartRequested && !appState.menuOpen && !appState.deviceBlocked && !appState.cinematicOpen && !appState.rulesOpen) {
    notifyCloneStart();
  }
});

function ensurePlayerCombatStats(target) {
  target.maxLifeSlots ??= PLAYER.START_LIFE_SLOTS;
  target.currentLife ??= target.maxLifeSlots;
  target.coins ??= 0;
  target.weaponLevel ??= 1;
  target.superWeaponLevel ??= SUPER_WEAPON.START_LEVEL;
  target.superCharge ??= 0;
  target.rangedCooldown ??= 0;
  const rangedAmmo = Number.isFinite(target.rangedAmmo) ? target.rangedAmmo : ABILITY.RANGED_MAX_AMMO;
  target.rangedAmmo = Math.max(0, Math.min(ABILITY.RANGED_MAX_AMMO, Math.floor(rangedAmmo)));
  if (!Array.isArray(target.rangedReloadTimers)) target.rangedReloadTimers = [];
  target.rangedReloadTimers = target.rangedReloadTimers
    .filter((timer) => Number.isFinite(timer) && timer > 0)
    .slice(0, ABILITY.RANGED_MAX_AMMO - target.rangedAmmo);
  if (target.rangedAmmo >= ABILITY.RANGED_MAX_AMMO) target.rangedReloadTimers = [];
  const superStats = getSuperWeaponStats(target.superWeaponLevel);
  target.superCharge = Math.max(0, Math.min(superStats.CHARGE_REQUIRED, target.superCharge));
  ensureShopInventory(target);
}

function applyTemporaryTestInventory(target) {
  if (!DEBUG.FULL_TEST_INVENTORY) return;
  ensurePlayerCombatStats(target);
  target.abilities = ABILITIES.map((ability) => ability.id);
  target.rangedAmmo = ABILITY.RANGED_MAX_AMMO;
  target.rangedReloadTimers = [];
  target.food = 9;
  for (const consumable of CONSUMABLES) {
    target.consumables[consumable.id] = 9;
  }
}

function aliveGlobalClones() {
  return cloneState.clones.filter((clone) => clone.alive);
}

function cloneById(id) {
  return cloneState.clones.find((clone) => clone.id === id);
}

function cloneTravelTime() {
  const cfg = ENEMY.CLONE;
  return cfg.ROOM_TRAVEL_TIME_MIN + runtimeRng.next() * (cfg.ROOM_TRAVEL_TIME_MAX - cfg.ROOM_TRAVEL_TIME_MIN);
}

function cloneHpFromStats(stats) {
  const lifeBase = Math.max(3, Math.ceil((stats.maxLifeSlots ?? PLAYER.START_LIFE_SLOTS) * 0.85));
  const weaponBonus = Math.max(0, (stats.weaponLevel ?? 1) - 1);
  return Math.min(14, lifeBase + weaponBonus);
}

function createMaxCloneStats() {
  const superLevel = 3;
  return {
    maxLifeSlots: PLAYER.MAX_LIFE_SLOTS,
    weaponLevel: 5,
    superWeaponLevel: superLevel,
    abilities: ABILITIES.map((ability) => ability.id),
    consumables: Object.fromEntries(CONSUMABLES.map((item) => [item.id, Number.POSITIVE_INFINITY])),
    superCharge: getSuperWeaponStats(superLevel).CHARGE_REQUIRED,
  };
}

function createCloneStatsFromPlayer() {
  ensurePlayerCombatStats(player);
  return {
    maxLifeSlots: player.maxLifeSlots,
    weaponLevel: player.weaponLevel,
    superWeaponLevel: player.superWeaponLevel,
    abilities: [...player.abilities],
    consumables: { ...player.consumables },
    superCharge: player.superCharge,
  };
}

function spawnGlobalClone(roomId, stats, options = {}) {
  if (!roomId || !rooms.has(roomId)) return null;
  const maxHp = cloneHpFromStats(stats);
  const clone = {
    id: `clone-${cloneState.nextId}`,
    alive: true,
    prime: options.prime === true,
    roomId,
    previousRoomId: null,
    moveTimer: cloneTravelTime(),
    stats: {
      ...stats,
      maxHp,
      currentHp: Math.max(1, stats.currentHp ?? maxHp),
      superCharge: Math.max(0, stats.superCharge ?? 0),
    },
  };
  cloneState.nextId += 1;
  cloneState.clones.push(clone);
  recordCloneSnapshots();
  evaluateCloneRunEnd();
  return clone;
}

function spawnInitialClone() {
  const startId = maze.special?.cloneStart?.id ?? '0,0';
  spawnGlobalClone(startId, createMaxCloneStats(), { prime: true });
}

function pickDeathCloneRoom(excludedRoomIds) {
  const excluded = new Set(Array.isArray(excludedRoomIds) ? excludedRoomIds : [excludedRoomIds]);
  const candidates = [...rooms.keys()].filter((roomId) => !excluded.has(roomId));
  if (candidates.length === 0) return null;
  return runtimeRng.choice(candidates);
}

function spawnDeathClone(excludedRoomIds) {
  if (cloneState.endKind) return;
  const roomId = pickDeathCloneRoom(excludedRoomIds);
  if (!roomId) return;
  unlockLegend('clone');
  spawnGlobalClone(roomId, createCloneStatsFromPlayer(), { prime: false });
}

function roomNeighborIds(roomId) {
  const cell = maze.cells.get(roomId);
  if (!cell) return [];
  return [...cell.links]
    .map((dir) => cell.exits[dir]?.target)
    .filter(Boolean);
}

function transitionEntryDir(fromRoomId, toRoomId) {
  const cell = maze.cells.get(fromRoomId);
  if (!cell) return null;
  for (const dir of cell.links) {
    const exit = cell.exits[dir];
    if (exit?.target === toRoomId) return exit.targetExit;
  }
  return null;
}

function cloneDistanceMap(targetRoomId) {
  const distances = new Map([[targetRoomId, 0]]);
  const queue = [targetRoomId];

  while (queue.length > 0) {
    const roomId = queue.shift();
    const distance = distances.get(roomId);
    for (const neighborId of roomNeighborIds(roomId)) {
      if (distances.has(neighborId)) continue;
      distances.set(neighborId, distance + 1);
      queue.push(neighborId);
    }
  }

  return distances;
}

function cloneCanEnterRoom(roomId) {
  return !(roomId === currentRoom.id && isMinibossExitLocked(currentRoom));
}

function chooseCloneNextRoom(clone) {
  if (clone.roomId === currentRoom.id) return clone.roomId;
  const distances = cloneDistanceMap(currentRoom.id);
  const candidates = roomNeighborIds(clone.roomId)
    .filter((roomId) => cloneCanEnterRoom(roomId))
    .map((roomId) => ({ roomId, distance: distances.get(roomId) ?? Infinity }))
    .filter((candidate) => Number.isFinite(candidate.distance))
    .sort((a, b) => a.distance - b.distance);

  if (candidates.length === 0) return clone.roomId;
  const bestDistance = candidates[0].distance;
  const noisyCandidates = candidates.filter((candidate) => candidate.distance <= bestDistance + 1);
  const pool = runtimeRng.chance(ENEMY.CLONE.ROOM_PATH_NOISE) ? noisyCandidates : candidates;
  return runtimeRng.choice(pool).roomId;
}

function updateCloneMacroMovement(dt) {
  let changed = false;
  for (const clone of aliveGlobalClones()) {
    if (clone.roomId === currentRoom.id) continue;
    clone.moveTimer -= dt;
    if (clone.moveTimer > 0) continue;

    const nextRoomId = chooseCloneNextRoom(clone);
    if (nextRoomId !== clone.roomId) {
      const previousRoomId = clone.roomId;
      clone.previousRoomId = previousRoomId;
      clone.roomId = nextRoomId;
      clone.entryDir = transitionEntryDir(previousRoomId, nextRoomId);
      clone.roomPosition = null;
      changed = true;
    }
    clone.moveTimer = cloneTravelTime();
  }
  checkAdjacentCloneAlert();
  return changed;
}

function getAdjacentRoomIds(room) {
  if (!room?.exits) return [];
  const ids = [];
  for (const dir of ['N', 'S', 'E', 'O']) {
    const exit = room.exits[dir];
    if (exit?.target) ids.push(exit.target);
  }
  return ids;
}

function checkAdjacentCloneAlert() {
  if (!currentRoom || cloneState.endKind) return;
  const adjacent = new Set(getAdjacentRoomIds(currentRoom));
  if (adjacent.size === 0) return;
  const presentClones = new Set();
  const presentPrime = new Set();
  for (const clone of aliveGlobalClones()) {
    if (!adjacent.has(clone.roomId)) continue;
    if (clone.prime) {
      presentPrime.add(clone.roomId);
    } else {
      presentClones.add(clone.roomId);
    }
  }
  let primeNewEntry = false;
  for (const id of presentPrime) {
    if (!primeAdjacentLastSeen.has(id)) {
      primeNewEntry = true;
      break;
    }
  }
  let cloneNewEntry = false;
  for (const id of presentClones) {
    if (!cloneAdjacentLastSeen.has(id)) {
      cloneNewEntry = true;
      break;
    }
  }
  primeAdjacentLastSeen = presentPrime;
  cloneAdjacentLastSeen = presentClones;
  if (primeNewEntry) notifyCloneAdjacent({ prime: true });
  if (cloneNewEntry) notifyCloneAdjacent();
}

function recordCloneSnapshots() {
  setCloneSnapshotsOnMinimap(
    minimapState,
    aliveGlobalClones().map((clone) => ({
      id: clone.id,
      roomId: clone.roomId,
      prime: clone.prime,
    })),
  );
}

function cloneOverSouthGap(room, x, w) {
  if (!room.exits.S) return false;
  const gapStart = room.exits.S.pos;
  const gapEnd = room.exits.S.pos + DOOR_NS_WIDTH;
  return x < gapEnd && x + w > gapStart;
}

function getCloneDoorSpawn(room, entryDir, index = 0) {
  const cfg = ENEMY.CLONE;
  const spread = (index % 3 - 1) * 26;
  if (entryDir === 'N' && room.exits.N) {
    return {
      x: Math.max(WALL_THICKNESS, Math.min(room.exits.N.pos + DOOR_NS_WIDTH / 2 - cfg.W / 2 + spread, ROOM_W - WALL_THICKNESS - cfg.W)),
      y: WALL_THICKNESS + 2,
    };
  }
  if (entryDir === 'S' && room.exits.S) {
    return {
      x: Math.max(WALL_THICKNESS, Math.min(room.exits.S.pos + DOOR_NS_WIDTH / 2 - cfg.W / 2 + spread, ROOM_W - WALL_THICKNESS - cfg.W)),
      y: ROOM_H - WALL_THICKNESS - cfg.H - 2,
    };
  }
  if (entryDir === 'O' && room.exits.O) {
    return {
      x: WALL_THICKNESS + 2,
      y: Math.max(WALL_THICKNESS, Math.min(room.exits.O.pos + DOOR_EW_HEIGHT / 2 - cfg.H / 2 + spread, ROOM_H - WALL_THICKNESS - cfg.H)),
    };
  }
  if (entryDir === 'E' && room.exits.E) {
    return {
      x: ROOM_W - WALL_THICKNESS - cfg.W - 2,
      y: Math.max(WALL_THICKNESS, Math.min(room.exits.E.pos + DOOR_EW_HEIGHT / 2 - cfg.H / 2 + spread, ROOM_H - WALL_THICKNESS - cfg.H)),
    };
  }
  return null;
}

function getCloneSpawnInRoom(room, index = 0, clone = null) {
  const cfg = ENEMY.CLONE;
  if (clone?.roomPosition?.roomId === room.id) {
    return {
      x: Math.max(WALL_THICKNESS, Math.min(clone.roomPosition.x, ROOM_W - WALL_THICKNESS - cfg.W)),
      y: Math.max(WALL_THICKNESS, Math.min(clone.roomPosition.y, ROOM_H - WALL_THICKNESS - cfg.H)),
    };
  }

  const doorSpawn = getCloneDoorSpawn(room, clone?.entryDir, index);
  if (doorSpawn) return doorSpawn;

  const y = ROOM_H - WALL_THICKNESS - cfg.H;
  const playerCenter = player.x + player.w / 2;
  const farSide = playerCenter < ROOM_W / 2
    ? ROOM_W - WALL_THICKNESS - cfg.W - 24
    : WALL_THICKNESS + 24;
  const spreadStep = 36;
  const spreadIndex = Math.floor(index / 2) + 1;
  const spreadDir = index % 2 === 0 ? -1 : 1;
  const spreadX = farSide + spreadDir * spreadIndex * spreadStep;
  const candidates = [
    spreadX,
    farSide,
    ROOM_W / 2 - cfg.W / 2 + index * 36,
    WALL_THICKNESS + 32,
    ROOM_W - WALL_THICKNESS - cfg.W - 32,
  ];

  for (const rawX of candidates) {
    const x = Math.max(WALL_THICKNESS, Math.min(rawX, ROOM_W - WALL_THICKNESS - cfg.W));
    const rect = { x, y, w: cfg.W, h: cfg.H };
    const blocked = room.solids.some((solid) => !solid.oneWay && rectsOverlap(rect, solid));
    if (!blocked && !cloneOverSouthGap(room, x, cfg.W)) return { x, y };
  }

  return {
    x: Math.max(WALL_THICKNESS, Math.min(farSide, ROOM_W - WALL_THICKNESS - cfg.W)),
    y,
  };
}

function cloneContactDamage(clone) {
  return (clone.stats.weaponLevel ?? 1) >= 4 ? 2 : 1;
}

function persistGlobalCloneEntity(enemy) {
  const clone = cloneById(enemy.globalCloneId);
  if (!clone || !clone.alive) return;
  clone.stats.currentHp = Math.max(1, enemy.hp);
  clone.stats.superCharge = Math.max(0, enemy.cloneSuperCharge ?? clone.stats.superCharge ?? 0);
  clone.roomPosition = {
    roomId: clone.roomId,
    x: enemy.x,
    y: enemy.y,
  };
}

function persistAllGlobalCloneEntities() {
  for (const state of roomStates.values()) {
    for (const enemy of state.enemies) {
      if (enemy.globalCloneId) persistGlobalCloneEntity(enemy);
    }
  }
}

function transitionGlobalCloneIfOutOfRoom(enemy, roomState) {
  const clone = cloneById(enemy.globalCloneId);
  if (!clone || !clone.alive) return false;
  const room = currentRoom;
  if (!room?.exits) return false;

  let dir = null;
  let entryDir = null;
  if (enemy.y > ROOM_H && room.exits.S) {
    const gap = room.exits.S;
    if (enemy.x + enemy.w > gap.pos && enemy.x < gap.pos + DOOR_NS_WIDTH) {
      dir = 'S';
      entryDir = 'N';
    }
  } else if (enemy.y + enemy.h < 0 && room.exits.N) {
    const gap = room.exits.N;
    if (enemy.x + enemy.w > gap.pos && enemy.x < gap.pos + DOOR_NS_WIDTH) {
      dir = 'N';
      entryDir = 'S';
    }
  } else if (enemy.x > ROOM_W && room.exits.E) {
    const gap = room.exits.E;
    if (enemy.y + enemy.h > gap.pos && enemy.y < gap.pos + DOOR_EW_HEIGHT) {
      dir = 'E';
      entryDir = 'O';
    }
  } else if (enemy.x + enemy.w < 0 && room.exits.O) {
    const gap = room.exits.O;
    if (enemy.y + enemy.h > gap.pos && enemy.y < gap.pos + DOOR_EW_HEIGHT) {
      dir = 'O';
      entryDir = 'E';
    }
  }

  if (!dir) return false;

  const targetId = room.exits[dir]?.target;
  if (!targetId) return false;

  clone.previousRoomId = clone.roomId;
  clone.roomId = targetId;
  clone.entryDir = entryDir;
  clone.roomPosition = null;
  clone.moveTimer = cloneTravelTime();
  clone.stats.currentHp = Math.max(1, enemy.hp);
  clone.stats.superCharge = Math.max(0, enemy.cloneSuperCharge ?? clone.stats.superCharge ?? 0);

  const idx = roomState.enemies.indexOf(enemy);
  if (idx !== -1) roomState.enemies.splice(idx, 1);
  recordCloneSnapshots();
  return true;
}

function cloneEntityData(clone, index) {
  const spawn = getCloneSpawnInRoom(currentRoom, index, clone);
  const entryDir = clone.entryDir;
  clone.entryDir = null;
  const direction = entryDir === 'E' ? -1 : entryDir === 'O' ? 1 : player.x + player.w / 2 >= spawn.x ? 1 : -1;
  const bottomEntry = entryDir === 'S';
  return {
    type: 'clone',
    x: spawn.x,
    y: spawn.y,
    hp: Math.max(1, clone.stats.currentHp ?? clone.stats.maxHp),
    maxHp: clone.stats.maxHp,
    direction,
    vx: bottomEntry ? direction * ENEMY.CLONE.SPEED * 1.25 : 0,
    vy: bottomEntry ? -ENEMY.CLONE.JUMP_VELOCITY * 1.32 : 0,
    globalCloneId: clone.id,
    clonePrime: clone.prime === true,
    cloneStats: clone.stats,
    cloneSuperCharge: clone.stats.superCharge,
    noDrop: true,
    noSuperCharge: false,
    canRevive: false,
    contactDamage: cloneContactDamage(clone),
  };
}

function syncGlobalClonesForCurrentRoom() {
  const clonesInRoom = aliveGlobalClones()
    .filter((clone) => clone.roomId === currentRoom.id)
    .slice(0, ENEMY.CLONE.ROOM_COMBAT_LIMIT);
  if (clonesInRoom.some((clone) => !clone.prime)) unlockLegend('clone');
  const desiredIds = new Set(clonesInRoom.map((clone) => clone.id));

  for (const [roomId, state] of roomStates) {
    state.enemies = state.enemies.filter((enemy) => {
      if (!enemy.globalCloneId) return true;
      if (
        roomId === currentRoom.id &&
        desiredIds.has(enemy.globalCloneId) &&
        !enemy.dead
      ) {
        persistGlobalCloneEntity(enemy);
        return true;
      }

      persistGlobalCloneEntity(enemy);
      return false;
    });
  }

  const state = getRoomState(currentRoom);
  for (let i = 0; i < clonesInRoom.length; i += 1) {
    const clone = clonesInRoom[i];
    if (state.enemies.some((enemy) => enemy.globalCloneId === clone.id)) continue;
    state.enemies.push(new Enemy(cloneEntityData(clone, i)));
  }
}

function markGlobalCloneDefeated(enemy) {
  const clone = cloneById(enemy.globalCloneId);
  if (!clone || !clone.alive) return;
  clone.alive = false;
  clone.stats.currentHp = 0;
  if (clone.prime) cloneState.firstCloneDefeated = true;
  recordCloneSnapshots();
  evaluateCloneRunEnd();
}

function evaluateCloneRunEnd() {
  const aliveCount = aliveGlobalClones().length;
  if (aliveCount > ENEMY.CLONE.MAX_ALIVE) {
    finishCloneRun('gameover', 'gameOverMessage', { count: aliveCount, max: ENEMY.CLONE.MAX_ALIVE });
    return;
  }
  if (cloneState.firstCloneDefeated && aliveCount === 0) {
    finishCloneRun('victory', 'victoryMessage');
  }
}

function finishCloneRun(kind, messageKey, messageParams = {}) {
  if (cloneState.endKind) return;
  cloneState.endKind = kind;
  cloneState.endMessageKey = messageKey;
  cloneState.endMessageParams = messageParams;
  gameState.overlayFocusIndex = 0;
  gameState.pauseMenuOpen = false;
  gameState.paused = false;
  gameState.endRevealAt = performance.now() + (kind === 'victory' ? 1250 : 700);
  gameState.endVideoStarted = false;
  playGameSound(kind === 'victory' ? 'victory' : 'death');
}

function updateCloneSystem(dt) {
  if (cloneState.endKind) return;
  const changed = updateCloneMacroMovement(dt);
  gameState.cloneSyncTimer -= dt;
  if (!changed && gameState.cloneSyncTimer > 0) return;

  syncGlobalClonesForCurrentRoom();
  recordCloneSnapshots();
  gameState.cloneSyncTimer = CLONE_SYNC_INTERVAL;
}

function getRoomState(room) {
  let state = roomStates.get(room.id);
  if (!state) {
    state = {
      enemies: room.enemySpawns.map((spawn) => new Enemy(spawn)),
      pickups: room.pickupSpawns.map((spawn) => new Pickup(spawn)),
      projectiles: [],
      playerProjectiles: [],
      tempPlatforms: [],
      minibossLocked: false,
      minibossDefeated: false,
      minibossRewardDropped: false,
    };
    roomStates.set(room.id, state);
  }
  return state;
}

function createNonCloneEnemies(room) {
  return room.enemySpawns
    .filter((spawn) => spawn.type !== 'clone' && !spawn.canRevive)
    .map((spawn) => new Enemy(spawn));
}

function getSolidsForRoom(room) {
  const state = getRoomState(room);
  const locks = isMinibossExitLocked(room) ? minibossLockSolids(room) : [];
  return [...room.solids, ...state.tempPlatforms, ...locks];
}

function getCurrentSolids() {
  return getSolidsForRoom(currentRoom);
}

function minibossLockSolid(room, dir) {
  const exit = room.exits[dir];
  if (!exit) return null;
  const base = { oneWay: false, kind: 'minibossLock' };
  if (dir === 'N') return { ...base, x: exit.pos, y: 0, w: DOOR_NS_WIDTH, h: WALL_THICKNESS };
  if (dir === 'S') return { ...base, x: exit.pos, y: ROOM_H - WALL_THICKNESS, w: DOOR_NS_WIDTH, h: WALL_THICKNESS };
  if (dir === 'O') return { ...base, x: 0, y: exit.pos, w: WALL_THICKNESS, h: DOOR_EW_HEIGHT };
  return { ...base, x: ROOM_W - WALL_THICKNESS, y: exit.pos, w: WALL_THICKNESS, h: DOOR_EW_HEIGHT };
}

function minibossLockSolids(room) {
  return ['N', 'S', 'E', 'O']
    .filter((dir) => room.exits[dir])
    .map((dir) => minibossLockSolid(room, dir))
    .filter(Boolean);
}

function isMinibossExitLocked(room) {
  if (!room?.meta?.miniboss) return false;
  const state = getRoomState(room);
  return state.minibossLocked && !state.minibossDefeated;
}

function hasAliveMiniboss(state) {
  return state.enemies.some((enemy) => enemy.miniboss && !enemy.dead);
}

function activateMinibossLockIfNeeded(room) {
  if (!room?.meta?.miniboss) return;
  const state = getRoomState(room);
  if (state.minibossDefeated || state.minibossLocked || !hasAliveMiniboss(state)) return;
  const locks = minibossLockSolids(room);
  if (
    locks.length === 0 ||
    locks.some((lock) => rectsOverlap(player, { x: lock.x - 3, y: lock.y - 3, w: lock.w + 6, h: lock.h + 6 }))
  ) return;
  state.minibossLocked = true;
}

function isExitLocked(room, dir) {
  return isMinibossExitLocked(room) && Boolean(room.exits[dir]);
}

function hasAbility(id) {
  return player.hasAbility(id);
}

function getSuperWeaponStats(level = player.superWeaponLevel) {
  return SUPER_WEAPON.LEVELS[level] ?? SUPER_WEAPON.LEVELS[SUPER_WEAPON.START_LEVEL];
}

function triggerSuperReadyFeedback() {
  gameState.superReadyPulseTimer = 1.35;
  playGameSound('superReady');
}

function chargeSuperWeapon(amount) {
  ensurePlayerCombatStats(player);
  const stats = getSuperWeaponStats();
  const wasReady = player.superCharge >= stats.CHARGE_REQUIRED;
  player.superCharge = Math.min(stats.CHARGE_REQUIRED, player.superCharge + amount);
  if (!wasReady && player.superCharge >= stats.CHARGE_REQUIRED) {
    triggerSuperReadyFeedback();
  }
}

function createMinibossRewardPlan(mazeData, seed) {
  const rng = new Rng(`${seed}:m8-rewards`);
  const deadEndIds = (mazeData.special?.minibossRooms ?? mazeData.special?.deadEnds ?? [])
    .map((cell) => cell.id)
    .filter((id) => mazeData.rooms.has(id));
  const shuffledAbilities = rng.shuffle(ABILITIES.map((ability) => ability.id));
  const mysticAbilityIds = new Set();
  const minibossAbilityIds = [];
  const minMysticCount = Math.min(SHOP.MIN_ABILITIES_REACHABLE, shuffledAbilities.length);
  const maxMinibossAbilities = Math.max(0, deadEndIds.length);

  for (const abilityId of shuffledAbilities) {
    const mustKeepReachable = mysticAbilityIds.size < minMysticCount;
    const canPlaceOnMiniboss = minibossAbilityIds.length < maxMinibossAbilities;
    if (mustKeepReachable || !canPlaceOnMiniboss || rng.chance(0.56)) {
      mysticAbilityIds.add(abilityId);
    } else {
      minibossAbilityIds.push(abilityId);
    }
  }

  const rewards = new Map();
  const shuffledDeadEnds = rng.shuffle([...deadEndIds]);
  const pendingAbilities = [...minibossAbilityIds];
  for (const roomId of shuffledDeadEnds) {
    if (pendingAbilities.length > 0) {
      rewards.set(roomId, { type: 'ability', abilityId: pendingAbilities.shift() });
      continue;
    }

    rewards.set(roomId, {
      type: 'consumable_bundle',
      consumableId: rng.choice(CONSUMABLES).id,
      amount: rng.int(5, 9),
    });
  }

  return {
    rewards,
    mysticAbilityIds: [...mysticAbilityIds],
  };
}

function applyMinibossRewardsToRooms(plan) {
  for (const [roomId, reward] of plan.rewards) {
    const room = rooms.get(roomId);
    if (room) room.meta.minibossReward = reward;
  }
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function isOverSouthGap(room, x) {
  return overlapsSouthGap(room, x, PLAYER.W);
}

function overlapsSouthGap(room, x, w, padding = 0) {
  if (!room.exits.S) return false;
  const gapStart = room.exits.S.pos - padding;
  const gapEnd = room.exits.S.pos + DOOR_NS_WIDTH + padding;
  return x < gapEnd && x + w > gapStart;
}

function chooseFloorActorX(room, preferredX, w, avoidRects = []) {
  const minX = WALL_THICKNESS + 8;
  const maxX = ROOM_W - WALL_THICKNESS - 8 - w;
  const clampedPreferred = Math.max(minX, Math.min(preferredX, maxX));
  const candidates = [clampedPreferred];

  for (let step = 1; step <= 10; step += 1) {
    const offset = step * 34;
    candidates.push(clampedPreferred - offset, clampedPreferred + offset);
  }

  for (const rawX of candidates) {
    const x = Math.max(minX, Math.min(rawX, maxX));
    const rect = { x, y: ROOM_H - WALL_THICKNESS - 62, w, h: 62 };
    if (overlapsSouthGap(room, x, w, 10)) continue;
    if (avoidRects.some((avoid) => rectsOverlap(rect, avoid))) continue;
    return x;
  }

  return clampedPreferred;
}

function getInitialSpawn(room) {
  const y = ROOM_H - WALL_THICKNESS - PLAYER.H;
  const centerX = (ROOM_W - PLAYER.W) / 2;
  const candidates = [centerX];

  for (let i = 1; i <= 7; i += 1) {
    candidates.push(centerX - i * 42, centerX + i * 42);
  }

  for (const rawX of candidates) {
    const x = Math.max(
      WALL_THICKNESS,
      Math.min(rawX, ROOM_W - WALL_THICKNESS - PLAYER.W),
    );
    const playerRect = { x, y, w: PLAYER.W, h: PLAYER.H };
    const blocked = room.solids.some((solid) => (
      !solid.oneWay && rectsOverlap(playerRect, solid)
    ));
    if (!blocked && !isOverSouthGap(room, x)) return { x, y };
  }

  return { x: centerX, y };
}

function npcPoint(room = currentRoom) {
  const w = 28;
  const h = 42;
  const x = chooseFloorActorX(room, ROOM_W / 2 + 28 - w / 2, w);
  return {
    x: x + w / 2,
    y: ROOM_H - WALL_THICKNESS - h / 2,
    w,
    h,
  };
}

function npcAvoidRect(room = currentRoom) {
  const npc = npcPoint(room);
  return {
    x: npc.x - npc.w,
    y: npc.y - npc.h * 0.8,
    w: npc.w * 2,
    h: npc.h * 1.55,
  };
}

function benefactorAvoidRects(room = currentRoom) {
  const avoid = [];
  if (room.meta.npc) avoid.push(npcAvoidRect(room));
  if (room.meta.checkpoint) {
    const checkpoint = checkpointPoint(room);
    avoid.push({ x: checkpoint.x - 12, y: checkpoint.y - 12, w: checkpoint.w + 24, h: checkpoint.h + 24 });
  }

  const state = roomStates.get(room.id);
  const pickups = state?.pickups ?? room.pickupSpawns ?? [];
  for (const pickup of pickups) {
    if (pickup.collected) continue;
    avoid.push({
      x: pickup.x - 14,
      y: pickup.y - 14,
      w: (pickup.w ?? 14) + 28,
      h: (pickup.h ?? 14) + 28,
    });
  }
  return avoid;
}

function benefactorPoint(room = currentRoom) {
  const w = 27;
  const h = 42;
  const x = chooseFloorActorX(room, ROOM_W / 2 - 52, w, benefactorAvoidRects(room));
  return {
    x,
    y: ROOM_H - WALL_THICKNESS - h,
    w,
    h,
  };
}

function signPoint(room = currentRoom) {
  return room.getControlsSignRect();
}

function getInteractableSign() {
  if (!currentRoom.meta.isStartRoom) return null;
  if (gameState.controlsBoardOpen) return null;
  const sign = signPoint();
  const playerCenter = {
    x: player.x + player.w / 2,
    y: player.y + player.h / 2,
  };
  const signCenter = {
    x: sign.x + sign.w / 2,
    y: sign.y + sign.h / 2,
  };
  const distance = Math.hypot(playerCenter.x - signCenter.x, playerCenter.y - signCenter.y);
  return distance <= 60 ? sign : null;
}

function checkpointPoint(room = currentRoom) {
  const w = 20;
  const x = chooseFloorActorX(room, ROOM_W / 2 - w / 2, w);
  return {
    x,
    y: ROOM_H - WALL_THICKNESS - 62,
    w,
    h: 28,
  };
}

function getVisibleShopInventory(npc) {
  const type = typeof npc === 'string' ? npc : npc.type;
  const inventoryKey = typeof npc === 'string' ? npc : npc.inventoryKey;
  const inventory = shopInventories[inventoryKey] ?? shopInventories[type] ?? [];
  if (type !== 'blacksmith') return inventory;

  return inventory.filter((item) => (
    (item.type === 'weapon_upgrade' && item.targetLevel === player.weaponLevel + 1) ||
    (item.type === 'super_upgrade' && item.targetLevel === player.superWeaponLevel + 1)
  ));
}

function getInteractableNpc() {
  const npcType = currentRoom.meta.npc;
  if (!npcType) return null;

  const npc = npcPoint();
  const playerCenter = {
    x: player.x + player.w / 2,
    y: player.y + player.h / 2,
  };
  const npcCenter = {
    x: npc.x,
    y: npc.y,
  };
  const distance = Math.hypot(playerCenter.x - npcCenter.x, playerCenter.y - npcCenter.y);
  if (distance > 58) return null;

  return {
    type: npcType,
    inventoryKey: currentRoom.meta.npcId ?? npcType,
    definition: NPCS[npcType],
    inventory: getVisibleShopInventory({
      type: npcType,
      inventoryKey: currentRoom.meta.npcId ?? npcType,
    }),
  };
}

function isBenefactorVisibleInCurrentRoom() {
  return benefactorState.currentRoomId === currentRoom.id;
}

function getInteractableBenefactor() {
  if (!isBenefactorVisibleInCurrentRoom()) return null;
  const npc = benefactorPoint();
  const playerCenter = {
    x: player.x + player.w / 2,
    y: player.y + player.h / 2,
  };
  const npcCenter = {
    x: npc.x + npc.w / 2,
    y: npc.y + npc.h / 2,
  };
  const distance = Math.hypot(playerCenter.x - npcCenter.x, playerCenter.y - npcCenter.y);
  return distance <= 62 ? npc : null;
}

function pickBenefactorRoom() {
  const candidates = [...rooms.keys()].filter((roomId) => (
    roomId !== currentRoom.id &&
    roomId !== maze.startId &&
    !rooms.get(roomId)?.meta?.miniboss
  ));
  if (candidates.length === 0) return null;
  return runtimeRng.choice(candidates);
}

function relocateBenefactor() {
  const roomId = pickBenefactorRoom();
  if (!roomId) return;
  benefactorState.currentRoomId = roomId;
  benefactorState.respawnTimer = 120;
  benefactorState.pendingRelocation = false;
}

function updateBenefactor(dt) {
  if (benefactorState.initialAvailable) return;
  if (benefactorState.pendingRelocation) {
    if (currentRoom.id !== benefactorState.currentRoomId) relocateBenefactor();
    return;
  }

  benefactorState.respawnTimer -= dt;
  if (benefactorState.respawnTimer > 0) return;

  if (benefactorState.currentRoomId && currentRoom.id === benefactorState.currentRoomId) {
    benefactorState.pendingRelocation = true;
    return;
  }
  relocateBenefactor();
}

function hideInitialBenefactorIfLeaving(fromRoomId) {
  if (!benefactorState.initialAvailable || fromRoomId !== maze.startId) return;
  benefactorState.initialAvailable = false;
  benefactorState.currentRoomId = null;
  benefactorState.respawnTimer = 120;
}

function getInteractableCheckpoint() {
  if (!currentRoom.meta.checkpoint) return null;
  const checkpoint = checkpointPoint();
  const playerCenter = {
    x: player.x + player.w / 2,
    y: player.y + player.h / 2,
  };
  const checkpointCenter = {
    x: checkpoint.x + checkpoint.w / 2,
    y: checkpoint.y + checkpoint.h / 2,
  };
  const distance = Math.hypot(
    playerCenter.x - checkpointCenter.x,
    playerCenter.y - checkpointCenter.y,
  );
  return distance <= 58 ? checkpoint : null;
}

function activateCheckpoint() {
  if (!getInteractableCheckpoint()) return false;
  const firstActivation = !minimapState.activatedCheckpoints.has(currentRoom.id);
  activateCheckpointOnMinimap(minimapState, currentRoom.id);
  currentRoom.meta.checkpointActive = true;
  player.currentLife = player.maxLifeSlots;
  gameState.checkpointPulseTimer = 0.75;
  if (firstActivation) {
    unlockLegend('checkpoint');
    notifyDiscovery(
      `${currentRoom.id}:checkpoint`,
      'toastCheckpoint',
      { name: t('legendCheckpoint') },
      'checkpoint',
    );
    playCheckpointSound();
  }
  renderHud();
  return true;
}

function updateCheckpointActivation() {
  if (!currentRoom.meta.checkpoint) return;
  if (minimapState.activatedCheckpoints.has(currentRoom.id)) return;
  activateCheckpoint();
}

const SOUND_PROFILES = {
  jump: [
    { type: 'triangle', frequency: 360, endFrequency: 520, duration: 0.08, gain: 0.045 },
  ],
  attack: [
    { type: 'square', frequency: 520, endFrequency: 310, duration: 0.055, gain: 0.035 },
  ],
  hit: [
    { type: 'sawtooth', frequency: 190, endFrequency: 92, duration: 0.08, gain: 0.05 },
  ],
  pickup: [
    { type: 'sine', frequency: 780, endFrequency: 1180, duration: 0.09, gain: 0.04 },
  ],
  death: [
    { type: 'sawtooth', frequency: 180, endFrequency: 54, duration: 0.28, gain: 0.055 },
  ],
  victory: [
    { type: 'triangle', frequency: 523, duration: 0.09, gain: 0.04, delay: 0 },
    { type: 'triangle', frequency: 659, duration: 0.09, gain: 0.04, delay: 0.1 },
    { type: 'triangle', frequency: 784, duration: 0.16, gain: 0.045, delay: 0.2 },
  ],
  checkpoint: [
    { type: 'sine', frequency: 660, endFrequency: 990, duration: 0.18, gain: 0.055 },
  ],
  superReady: [
    { type: 'triangle', frequency: 620, endFrequency: 930, duration: 0.08, gain: 0.032 },
    { type: 'sine', frequency: 1240, duration: 0.12, gain: 0.026, delay: 0.08 },
    { type: 'triangle', frequency: 930, endFrequency: 720, duration: 0.1, gain: 0.02, delay: 0.18 },
  ],
  discover: [
    { type: 'sine', frequency: 420, endFrequency: 780, duration: 0.12, gain: 0.035 },
    { type: 'triangle', frequency: 980, duration: 0.08, gain: 0.025, delay: 0.1 },
  ],
  clone: [
    { type: 'sawtooth', frequency: 130, endFrequency: 260, duration: 0.18, gain: 0.04 },
    { type: 'triangle', frequency: 520, endFrequency: 390, duration: 0.1, gain: 0.025, delay: 0.08 },
  ],
  warning: [
    { type: 'square', frequency: 110, endFrequency: 86, duration: 0.12, gain: 0.045 },
    { type: 'square', frequency: 110, endFrequency: 86, duration: 0.12, gain: 0.045, delay: 0.18 },
  ],
  shop: [
    { type: 'triangle', frequency: 330, endFrequency: 440, duration: 0.08, gain: 0.032 },
    { type: 'sine', frequency: 660, duration: 0.06, gain: 0.025, delay: 0.08 },
  ],
  ui: [
    { type: 'sine', frequency: 520, endFrequency: 620, duration: 0.045, gain: 0.022 },
  ],
};

let audioContext = null;
let audioUnlocked = false;
let htmlAudioUrls = null;
let htmlAudioUnlocked = false;
let ambientMusic = null;
let ambientAudio = null;
let ambientLoopUrl = null;
const activeHtmlSounds = new Set();
const activeWebAudioVoices = new Set();

function waveform(type, phase) {
  if (type === 'square') return phase < 0.5 ? 1 : -1;
  if (type === 'sawtooth') return phase * 2 - 1;
  if (type === 'triangle') return 1 - Math.abs(phase * 4 - 2);
  return Math.sin(phase * Math.PI * 2);
}

function writeWavString(view, offset, text) {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

function buildToneUrl(notes) {
  const sampleRate = 22050;
  const tail = 0.04;
  const totalDuration = notes.reduce(
    (max, note) => Math.max(max, (note.delay ?? 0) + (note.duration ?? 0.1) + tail),
    0.08,
  );
  const sampleCount = Math.ceil(totalDuration * sampleRate);
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);
  const dataSize = sampleCount * 2;

  writeWavString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeWavString(view, 8, 'WAVE');
  writeWavString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeWavString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < sampleCount; i += 1) {
    const time = i / sampleRate;
    let value = 0;

    for (const note of notes) {
      const delay = note.delay ?? 0;
      const duration = note.duration ?? 0.1;
      if (time < delay || time > delay + duration) continue;

      const local = time - delay;
      const progress = Math.max(0, Math.min(1, local / duration));
      const endFrequency = note.endFrequency ?? note.frequency;
      const frequency = note.frequency + (endFrequency - note.frequency) * progress;
      const phase = (frequency * local) % 1;
      const attack = Math.min(0.012, duration * 0.4);
      const release = Math.min(0.026, duration * 0.45);
      const fadeIn = attack > 0 ? Math.min(1, local / attack) : 1;
      const fadeOut = release > 0 ? Math.min(1, (duration - local) / release) : 1;
      const envelope = Math.max(0, Math.min(fadeIn, fadeOut));
      const gain = Math.min(0.72, (note.gain ?? 0.04) * 7.2);
      value += waveform(note.type, phase) * gain * envelope;
    }

    const sample = Math.max(-1, Math.min(1, value));
    view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
  }

  return URL.createObjectURL(new Blob([view], { type: 'audio/wav' }));
}

function buildAmbientLoopUrl() {
  // 48s loop in re minore. Render una sola volta all'avvio (sintesi PCM
  // diretta, niente OfflineAudioContext) e poi viene messo in loop dal tag
  // <audio>. Nessun lavoro WebAudio per frame -> non puo bloccare il game loop.
  const sampleRate = 22050;
  const seconds = 48;
  const sampleCount = sampleRate * seconds;
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);
  const dataSize = sampleCount * 2;

  writeWavString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeWavString(view, 8, 'WAVE');
  writeWavString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeWavString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Frequenze "loop-safe": numero intero di cicli in `seconds` -> niente click
  // alla cucitura del loop sulle voci continue (drone).
  const loopFreq = (target) => Math.max(1, Math.round(target * seconds)) / seconds;
  const fD2 = loopFreq(73.416);
  const fA2 = loopFreq(110.000);
  const fD3 = loopFreq(146.832);
  const fA3 = loopFreq(220.000);

  // Progressione accordi (D minor: i, III, VI, iv = Dm, F, Bb, Gm).
  const chordDur = seconds / 4; // 12s
  const chords = [
    [146.83, 174.61, 220.00],   // Dm
    [174.61, 220.00, 261.63],   // F
    [233.08, 293.66, 349.23],   // Bb
    [196.00, 233.08, 293.66],   // Gm
  ];

  // Note pentatonica re minore (+ b6/Bb di colore).
  const N = {
    D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00,
    Bb4: 466.16, C5: 523.25, D5: 587.33, F5: 698.46, A5: 880.00,
  };
  // Una frase di melodia per accordo. Ogni nota: [freq, t-rel-frase, durata, gain].
  // L'ultima nota di ogni frase finisce ben prima dei 12s, lasciando un
  // respiro di silenzio sulla melodia ai confini di accordo.
  const phrases = [
    [
      [N.A4, 0.8, 1.6, 0.085],
      [N.G4, 2.7, 1.0, 0.072],
      [N.F4, 3.9, 2.4, 0.082],
      [N.D4, 6.6, 3.4, 0.090],
    ],
    [
      [N.C5, 0.6, 1.4, 0.085],
      [N.A4, 2.2, 1.0, 0.072],
      [N.F4, 3.4, 0.8, 0.062],
      [N.A4, 4.4, 1.8, 0.082],
      [N.G4, 6.4, 3.2, 0.082],
    ],
    [
      [N.D5, 0.6, 2.4, 0.090],
      [N.C5, 3.2, 1.2, 0.075],
      [N.Bb4, 4.6, 1.8, 0.082],
      [N.A4, 6.6, 1.0, 0.072],
      [N.F4, 7.8, 2.4, 0.082],
    ],
    [
      [N.G4, 0.8, 1.0, 0.072],
      [N.A4, 2.0, 1.0, 0.072],
      [N.Bb4, 3.0, 1.6, 0.082],
      [N.A4, 4.8, 1.2, 0.072],
      [N.G4, 6.2, 1.0, 0.066],
      [N.F4, 7.4, 1.0, 0.066],
      [N.D4, 8.6, 2.0, 0.082],
    ],
  ];

  // Mix in float32 per poter sommare strati additivamente, poi quantizziamo
  // a int16 nell'ultima passata.
  const samples = new Float32Array(sampleCount);
  const TWO_PI = Math.PI * 2;

  // --- Strato 1: drone continuo (loop-safe) + respiro lento ---
  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / sampleRate;
    const breath = 0.86 + Math.sin(TWO_PI * t / seconds) * 0.08
      + Math.sin(TWO_PI * 2 * t / seconds + 0.6) * 0.03;
    const drone =
        Math.sin(TWO_PI * fD2 * t) * 0.34
      + Math.sin(TWO_PI * fA2 * t + 0.7) * 0.12
      + Math.sin(TWO_PI * fD3 * t + 1.4) * 0.07
      + Math.sin(TWO_PI * fA3 * t + 2.1) * 0.035;
    samples[i] = drone * breath;
  }

  // --- Strato 2: pad accordi (triangle, attack/release per evitare click) ---
  const padAttack = 1.6;
  const padRelease = 1.6;
  for (let c = 0; c < chords.length; c += 1) {
    const startT = c * chordDur;
    const startI = Math.floor(startT * sampleRate);
    const endI = Math.floor((startT + chordDur) * sampleRate);
    const chord = chords[c];
    for (let i = startI; i < endI; i += 1) {
      const t = i / sampleRate;
      const local = t - startT;
      let env = 1;
      if (local < padAttack) env = local / padAttack;
      else if (local > chordDur - padRelease) env = Math.max(0, (chordDur - local) / padRelease);
      let pad = 0;
      for (let v = 0; v < chord.length; v += 1) {
        const cf = chord[v];
        pad += waveform('triangle', (cf * t + v * 0.17) % 1) * 0.030;
      }
      samples[i] += pad * env;
    }
  }

  // --- Strato 3: melodia (sine + leggera 3a armonica per calore) ---
  for (let p = 0; p < phrases.length; p += 1) {
    const phraseStart = p * chordDur;
    for (const [freq, t0, dur, gain] of phrases[p]) {
      const start = phraseStart + t0;
      const startI = Math.floor(start * sampleRate);
      const endI = Math.min(sampleCount, Math.floor((start + dur) * sampleRate));
      const attack = 0.10;
      const release = Math.min(0.5, dur * 0.5);
      for (let i = startI; i < endI; i += 1) {
        const local = i / sampleRate - start;
        const fadeIn = local < attack ? local / attack : 1;
        const fadeOut = local > dur - release ? Math.max(0, (dur - local) / release) : 1;
        const env = Math.min(fadeIn, fadeOut);
        const phase = (freq * local) % 1;
        samples[i] += (Math.sin(phase * TWO_PI) * 0.9
                     + Math.sin(phase * TWO_PI * 3) * 0.07) * gain * env;
      }
    }
  }

  // --- Quantizzazione finale con leggera saturazione tanh ---
  for (let i = 0; i < sampleCount; i += 1) {
    const v = Math.tanh(samples[i] * 1.2) * 0.78;
    const s = v < -1 ? -1 : v > 1 ? 1 : v;
    view.setInt16(44 + i * 2, Math.round(s * 32767), true);
  }

  return URL.createObjectURL(new Blob([view], { type: 'audio/wav' }));
}

function ensureHtmlAudioUrls() {
  if (htmlAudioUrls) return htmlAudioUrls;
  htmlAudioUrls = {};
  for (const [kind, notes] of Object.entries(SOUND_PROFILES)) {
    htmlAudioUrls[kind] = buildToneUrl(notes);
  }
  htmlAudioUrls.unlock = buildToneUrl([
    { type: 'sine', frequency: 880, duration: 0.025, gain: 0.005 },
  ]);
  return htmlAudioUrls;
}

function playHtmlSound(kind) {
  try {
    const urls = ensureHtmlAudioUrls();
    const url = urls[kind] ?? urls.hit;
    if (!url || typeof Audio === 'undefined') return false;

    pruneHtmlSounds();
    if (activeHtmlSounds.size >= MAX_ACTIVE_HTML_SOUNDS) return true;

    const audio = new Audio(url);
    audio.volume = 1;
    activeHtmlSounds.add(audio);
    const cleanup = () => releaseHtmlSound(audio, cleanup);
    audio.addEventListener('ended', cleanup, { once: true });
    audio.addEventListener('error', cleanup, { once: true });
    const result = audio.play();
    if (result?.catch) void result.catch(cleanup);
    return true;
  } catch {
    return false;
  }
}

function pruneHtmlSounds() {
  for (const audio of activeHtmlSounds) {
    if (audio.ended) releaseHtmlSound(audio);
  }
}

function releaseHtmlSound(audio, cleanup = null) {
  activeHtmlSounds.delete(audio);
  if (cleanup) {
    audio.removeEventListener('ended', cleanup);
    audio.removeEventListener('error', cleanup);
  }
  try {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  } catch {
    // Best effort: these are short optional effects.
  }
}

function ensureAmbientAudio() {
  if (ambientAudio) return ambientAudio;
  if (typeof Audio === 'undefined') return null;
  ambientLoopUrl ??= buildAmbientLoopUrl();
  ambientAudio = new Audio(ambientLoopUrl);
  ambientAudio.loop = true;
  ambientAudio.preload = 'auto';
  ambientAudio.volume = 0;
  return ambientAudio;
}

function ensureAudioContext() {
  if (!audioContext) {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

function createAmbientNoiseBuffer(ctx) {
  const seconds = 6;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i += 1) {
    last = last * 0.92 + (Math.random() * 2 - 1) * 0.08;
    data[i] = last;
  }
  return buffer;
}

// NOTE: ensureAmbientMusic / scheduleAmbientPhrase / tickAmbientMelody (sotto)
// erano lo scheduler WebAudio per-frame del vecchio approccio. Restano qui ma
// non sono piu chiamati da nessuna parte: la musica ora e un loop WAV pre-
// renderizzato (vedi buildAmbientLoopUrl + startAmbientMusic). Lasciati come
// dead code per ora; eliminabili in un futuro cleanup.
function ensureAmbientMusic() {
  if (ambientMusic) return ambientMusic;
  const ctx = ensureAudioContext();
  const master = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const modGain = ctx.createGain();
  const lfo = ctx.createOscillator();
  const lfoDepth = ctx.createGain();
  const filterLfo = ctx.createOscillator();
  const filterDepth = ctx.createGain();
  const nodes = [master, filter, modGain, lfo, lfoDepth, filterLfo, filterDepth];

  master.gain.setValueAtTime(0, ctx.currentTime);
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(560, ctx.currentTime);
  filter.Q.setValueAtTime(0.65, ctx.currentTime);
  modGain.gain.setValueAtTime(0.76, ctx.currentTime);

  const voices = [
    { type: 'sine', frequency: 55, gain: 0.52, detune: -4 },
    { type: 'sine', frequency: 82.5, gain: 0.24, detune: 7 },
    { type: 'triangle', frequency: 110, gain: 0.18, detune: -9 },
    { type: 'sine', frequency: 146.83, gain: 0.1, detune: 5 },
    { type: 'sine', frequency: 220, gain: 0.065, detune: -6 },
    { type: 'triangle', frequency: 277.18, gain: 0.038, detune: 8 },
  ];

  for (const voice of voices) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = voice.type;
    oscillator.frequency.setValueAtTime(voice.frequency, ctx.currentTime);
    oscillator.detune.setValueAtTime(voice.detune, ctx.currentTime);
    gain.gain.setValueAtTime(voice.gain, ctx.currentTime);
    oscillator.connect(gain);
    gain.connect(filter);
    oscillator.start();
    nodes.push(oscillator, gain);
  }

  const noise = ctx.createBufferSource();
  const noiseFilter = ctx.createBiquadFilter();
  const noiseGain = ctx.createGain();
  noise.buffer = createAmbientNoiseBuffer(ctx);
  noise.loop = true;
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.setValueAtTime(720, ctx.currentTime);
  noiseFilter.Q.setValueAtTime(0.38, ctx.currentTime);
  noiseGain.gain.setValueAtTime(0.048, ctx.currentTime);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(filter);
  noise.start();
  nodes.push(noise, noiseFilter, noiseGain);

  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(0.055, ctx.currentTime);
  lfoDepth.gain.setValueAtTime(0.11, ctx.currentTime);
  lfo.connect(lfoDepth);
  lfoDepth.connect(modGain.gain);
  lfo.start();

  filterLfo.type = 'sine';
  filterLfo.frequency.setValueAtTime(0.022, ctx.currentTime);
  filterDepth.gain.setValueAtTime(95, ctx.currentTime);
  filterLfo.connect(filterDepth);
  filterDepth.connect(filter.frequency);
  filterLfo.start();

  filter.connect(modGain);
  modGain.connect(master);
  master.connect(ctx.destination);

  // Melody chain: routed AROUND the main lowpass so the bell voice stays
  // audible above the drone without getting muffled into nothing.
  const melodyFilter = ctx.createBiquadFilter();
  melodyFilter.type = 'lowpass';
  melodyFilter.frequency.setValueAtTime(2200, ctx.currentTime);
  melodyFilter.Q.setValueAtTime(0.4, ctx.currentTime);
  const melodyOsc = ctx.createOscillator();
  const melodyGain = ctx.createGain();
  melodyOsc.type = 'sine';
  melodyOsc.frequency.setValueAtTime(220, ctx.currentTime);
  melodyGain.gain.setValueAtTime(0, ctx.currentTime);
  melodyOsc.connect(melodyGain);
  melodyGain.connect(melodyFilter);
  melodyFilter.connect(master);
  melodyOsc.start();
  nodes.push(melodyOsc, melodyGain, melodyFilter);

  // Higher pad voice for a sustained chord backdrop on top of the drone.
  const padOsc = ctx.createOscillator();
  const padGain = ctx.createGain();
  padOsc.type = 'triangle';
  padOsc.frequency.setValueAtTime(174.61, ctx.currentTime); // F3
  padOsc.detune.setValueAtTime(4, ctx.currentTime);
  padGain.gain.setValueAtTime(0.022, ctx.currentTime);
  padOsc.connect(padGain);
  padGain.connect(filter);
  padOsc.start();
  nodes.push(padOsc, padGain);

  const phrases = [
    [
      { freq: 293.66, dur: 2.6, gain: 0.16 },
      { freq: 349.23, dur: 2.2, gain: 0.14 },
      { freq: 440.00, dur: 2.4, gain: 0.13 },
      { freq: 392.00, dur: 3.0, gain: 0.14 },
      { freq: 261.63, dur: 3.6, gain: 0.16 },
      { freq: 220.00, dur: 4.2, gain: 0.14 },
    ],
    [
      { freq: 220.00, dur: 3.0, gain: 0.14 },
      { freq: 329.63, dur: 2.4, gain: 0.13 },
      { freq: 392.00, dur: 2.6, gain: 0.14 },
      { freq: 349.23, dur: 3.2, gain: 0.13 },
      { freq: 293.66, dur: 4.0, gain: 0.16 },
    ],
    [
      { freq: 261.63, dur: 2.4, gain: 0.14 },
      { freq: 311.13, dur: 2.6, gain: 0.13 },
      { freq: 349.23, dur: 2.4, gain: 0.14 },
      { freq: 466.16, dur: 3.0, gain: 0.13 },
      { freq: 392.00, dur: 3.4, gain: 0.14 },
      { freq: 220.00, dur: 4.2, gain: 0.14 },
    ],
  ];
  const padNotes = [174.61, 196.00, 220.00, 233.08, 196.00]; // F3, G3, A3, A#3, G3

  ambientMusic = {
    ctx,
    master,
    nodes,
    melodyOsc,
    melodyGain,
    padOsc,
    phrases,
    padNotes,
    phraseIndex: 0,
    padIndex: 0,
    nextPhraseAt: ctx.currentTime + 1.5,
  };
  return ambientMusic;
}

function scheduleAmbientPhrase(music) {
  const { ctx, melodyOsc, melodyGain, padOsc, phrases, padNotes } = music;
  const now = ctx.currentTime;
  if (music.nextPhraseAt < now + 0.4) music.nextPhraseAt = now + 0.4;
  const phrase = phrases[music.phraseIndex % phrases.length];
  music.phraseIndex += 1;
  let t = music.nextPhraseAt;
  for (const note of phrase) {
    melodyOsc.frequency.setValueAtTime(note.freq, Math.max(now, t - 0.04));
    melodyGain.gain.setTargetAtTime(note.gain, t, 0.18);
    melodyGain.gain.setTargetAtTime(0, t + note.dur * 0.62, 0.28);
    t += note.dur;
  }
  const padFreq = padNotes[music.padIndex % padNotes.length];
  music.padIndex += 1;
  padOsc.frequency.setTargetAtTime(padFreq, music.nextPhraseAt, 1.8);
  music.nextPhraseAt = t + 2.5; // short rest before next phrase
}

function tickAmbientMelody() {
  if (!ambientMusic) return;
  if (ambientMusic.ctx.state !== 'running') return;
  if (ambientMusicTargetVolume() <= 0) {
    // While silenced (pause / menu) keep the queue close to "now" so the
    // melody resumes immediately once volume returns.
    ambientMusic.nextPhraseAt = ambientMusic.ctx.currentTime + 0.4;
    return;
  }
  const now = ambientMusic.ctx.currentTime;
  // Keep at most ~6s of melody pre-scheduled. The safety bound guards against
  // any pathological state where currentTime could jump (suspend/resume).
  let safety = 0;
  while (ambientMusic.nextPhraseAt - now < 6 && safety < 3) {
    scheduleAmbientPhrase(ambientMusic);
    safety += 1;
  }
}

function ambientMusicTargetVolume() {
  if (
    appState.menuOpen ||
    appState.cinematicOpen ||
    appState.rulesOpen ||
    appState.deviceBlocked ||
    cloneState.endKind ||
    gameState.pauseMenuOpen
  ) return 0;
  if (gameState.shop || gameState.gift) return 0.06;
  return 0.18;
}

function updateAmbientMusicMix() {
  // Path semplice: solo l'<audio> HTML pre-renderizzato. Niente WebAudio
  // per-frame (niente setTargetAtTime / cancelScheduledValues): solo un
  // semplice lerp del volume verso il target. Non puo bloccare il game loop.
  if (!ambientAudio) return;
  const target = ambientMusicTargetVolume();
  const speed = target > ambientAudio.volume ? 0.04 : 0.10;
  const next = ambientAudio.volume + (target - ambientAudio.volume) * speed;
  ambientAudio.volume = Math.max(0, Math.min(1, next));
  if (target > 0.001 && ambientAudio.paused) {
    const result = ambientAudio.play();
    if (result?.catch) void result.catch(() => {});
  } else if (target <= 0.001 && !ambientAudio.paused) {
    try { ambientAudio.pause(); } catch { /* ignore */ }
  }
}

function startAmbientMusic() {
  try {
    const audio = ensureAmbientAudio();
    if (!audio) return;
    audio.volume = Math.max(audio.volume, ambientMusicTargetVolume() * 0.4);
    const result = audio.play();
    if (result?.catch) void result.catch(() => {});
  } catch {
    // Musica facoltativa: il gioco gira anche senza.
  }
}

function unlockAudioFromGesture() {
  try {
    const urls = ensureHtmlAudioUrls();
    if (!htmlAudioUnlocked && typeof Audio !== 'undefined') {
      const audio = new Audio(urls.unlock);
      audio.volume = 0.01;
      htmlAudioUnlocked = true;
      const result = audio.play();
      if (result?.then) {
        void result.then(() => {
          htmlAudioUnlocked = true;
        }).catch(() => {
          htmlAudioUnlocked = false;
        });
      } else {
        htmlAudioUnlocked = true;
      }
    }
  } catch {
    // Fallback sotto.
  }

  try {
    const ctx = ensureAudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    if (!audioUnlocked) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.onended = () => {
        oscillator.onended = null;
        try { oscillator.disconnect(); } catch { /* already disconnected */ }
        try { gain.disconnect(); } catch { /* already disconnected */ }
      };
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.02);
      audioUnlocked = true;
    }
  } catch {
    // Audio placeholder: browsers can block WebAudio before a user gesture.
  }
  if (ambientMusicTargetVolume() > 0) startAmbientMusic();
}

function scheduleGameSound(kind) {
  const ctx = ensureAudioContext();
  const notes = SOUND_PROFILES[kind] ?? SOUND_PROFILES.hit;
  for (const note of notes) {
    if (activeWebAudioVoices.size >= MAX_ACTIVE_WEB_AUDIO_VOICES) break;
    const start = ctx.currentTime + (note.delay ?? 0);
    const duration = note.duration ?? 0.1;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const voice = { oscillator, gain };
    activeWebAudioVoices.add(voice);
    const cleanup = () => {
      activeWebAudioVoices.delete(voice);
      oscillator.onended = null;
      try { oscillator.disconnect(); } catch { /* already disconnected */ }
      try { gain.disconnect(); } catch { /* already disconnected */ }
    };
    oscillator.onended = cleanup;
    oscillator.type = note.type ?? 'sine';
    oscillator.frequency.setValueAtTime(note.frequency, start);
    if (note.endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(1, note.endFrequency),
        start + duration,
      );
    }
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(
      Math.min(0.14, (note.gain ?? 0.04) * 1.65),
      start + 0.01,
    );
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }
}

function playGameSound(kind) {
  if (htmlAudioUnlocked && playHtmlSound(kind)) return;

  try {
    const ctx = ensureAudioContext();
    if (ctx.state === 'suspended') {
      void ctx.resume().then(() => {
        if (ctx.state === 'running') scheduleGameSound(kind);
        else playHtmlSound(kind);
      });
      return;
    }
    scheduleGameSound(kind);
  } catch {
    playHtmlSound(kind);
  }
}

window.addEventListener('pointerdown', unlockAudioFromGesture, { capture: true, passive: true });
window.addEventListener('keydown', unlockAudioFromGesture, { capture: true });

function playCheckpointSound() {
  playGameSound('checkpoint');
}

function startScreenShake(magnitude, duration) {
  if (magnitude <= 0 || duration <= 0) return;
  if (gameState.shakeTimer > 0 && gameState.shakeMagnitude > magnitude) return;
  gameState.shakeMagnitude = magnitude;
  gameState.shakeDuration = duration;
  gameState.shakeTimer = duration;
}

function screenShakeOffset() {
  if (gameState.shakeTimer <= 0 || gameState.shakeDuration <= 0) return { x: 0, y: 0 };
  const t = gameState.shakeTimer / gameState.shakeDuration;
  const strength = gameState.shakeMagnitude * t * t;
  return {
    x: (Math.random() * 2 - 1) * strength,
    y: (Math.random() * 2 - 1) * strength,
  };
}

function startNewRun(options = {}) {
  const { sameSeed = false, intro = false, rules = false } = options;
  sessionStorage.setItem('echoMaze.autostart', '1');
  if (intro) sessionStorage.setItem('echoMaze.pendingIntro', '1');
  if (rules) sessionStorage.setItem('echoMaze.pendingRules', '1');
  const url = new URL(window.location.href);
  if (!sameSeed) url.searchParams.delete('seed');
  window.location.href = url.toString();
}

function restartSameSeedRun() {
  startNewRun({ sameSeed: true });
}

function returnToMainMenu() {
  hideCinematicOverlay();
  if (rulesOverlay) rulesOverlay.classList.add('is-hidden');
  appState.menuOpen = true;
  appState.controlsOpen = false;
  appState.listeningAction = null;
  appState.languageOpen = false;
  appState.rulesOpen = false;
  appState.cinematicOpen = false;
  appState.returnToPauseAfterControls = false;
  appState.menuRequiresNewRun = cloneState.endKind !== null;
  gameState.paused = true;
  gameState.pauseMenuOpen = false;
  renderMainMenu();
}

function startGameFromMenu() {
  unlockAudioFromGesture();
  appState.menuOpen = false;
  appState.controlsOpen = false;
  appState.languageOpen = false;
  appState.listeningAction = null;
  gameState.pauseMenuOpen = false;
  gameState.paused = true;
  renderMainMenu();
  playCinematic('intro', () => {
    startNewRun({ rules: true });
  });
}

function openMainControlsFromPause() {
  appState.menuOpen = true;
  appState.controlsOpen = true;
  appState.languageOpen = false;
  appState.listeningAction = null;
  appState.returnToPauseAfterControls = true;
  appState.controlsFocusIndex = 0;
  gameState.pauseMenuOpen = false;
  gameState.paused = true;
  renderMainMenu();
}

function closeControlsPanel() {
  appState.controlsOpen = false;
  appState.listeningAction = null;
  if (appState.returnToPauseAfterControls) {
    appState.menuOpen = false;
    appState.returnToPauseAfterControls = false;
    setPauseMenu(true);
    renderMainMenu();
    return;
  }
  appState.menuFocusIndex = 1;
  renderMainMenu();
}

function setPauseMenu(open) {
  gameState.pauseMenuOpen = open;
  gameState.paused = open;
  if (open) gameState.overlayFocusIndex = 0;
}

function setControlsBoard(open) {
  gameState.controlsBoardOpen = open;
  // Mette in pausa la fisica come fa il menu/pausa: niente movimento mentre
  // il giocatore legge il cartello.
  gameState.paused = open;
  if (open) playGameSound('ui');
}

function refreshLocalizedUi() {
  document.title = t('gameTitle');
  if (deviceBlockTitle) deviceBlockTitle.textContent = t('desktopBlockTitle');
  if (deviceBlockMessage) deviceBlockMessage.textContent = t('desktopBlockMessage');
  if (viewportWarning) viewportWarning.textContent = t('viewportWarning');
  if (shopClose) shopClose.setAttribute('aria-label', t('shopClose'));
  if (abilityPanel) abilityPanel.setAttribute('aria-label', t('abilityPanelLabel'));
  renderMainMenu();
  renderHud();
  renderHudBottom();
  if (gameState.shop) renderShop();
  if (gameState.gift) renderBenefactorGift();
  if (appState.rulesOpen) {
    if (rulesTitle) rulesTitle.textContent = t('rulesTitle');
    if (rulesBody) rulesBody.textContent = t('rulesBody');
    if (rulesContinue) rulesContinue.textContent = t('rulesContinue');
  }
  if (cinematicCaption) cinematicCaption.textContent = t(gameState.cinematicNeedsStart ? 'startVideo' : 'skipVideo');
}

function clampIndex(index, count) {
  if (count <= 0) return 0;
  return (index + count) % count;
}

function mainMenuActionCount() {
  return 3;
}

function controlMenuActionCount() {
  return ACTION_ORDER.length + 2;
}

function canRebindAction(action) {
  return action !== 'pause';
}

function currentLanguageIndex() {
  return Math.max(0, LANGUAGES.findIndex((language) => language.code === getLanguage()));
}

function focusActiveMenuElement() {
  const active = mainMenu?.querySelector('.is-focused');
  if (active instanceof HTMLElement) active.focus({ preventScroll: true });
  if (appState.controlsOpen && active instanceof HTMLElement) {
    active.scrollIntoView({ block: 'nearest' });
  }
}

function setLanguageMenuOpen(open) {
  appState.languageOpen = open;
  if (open) appState.languageFocusIndex = currentLanguageIndex();
  renderMainMenu();
}

function chooseLanguage(code) {
  setLanguage(code);
  appState.languageOpen = false;
  appState.menuFocusIndex = 2;
  refreshLocalizedUi();
}

function renderLanguagePicker() {
  if (!languagePicker) return;
  languagePicker.textContent = '';
  const visible = appState.menuOpen && !appState.controlsOpen && appState.languageOpen;
  languagePicker.classList.toggle('is-hidden', !visible);
  if (!visible) return;

  appState.languageFocusIndex = clampIndex(appState.languageFocusIndex, LANGUAGES.length);
  const current = getLanguage();
  for (let index = 0; index < LANGUAGES.length; index += 1) {
    const language = LANGUAGES[index];
    const button = document.createElement('button');
    button.className = 'language-option';
    button.type = 'button';
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', language.code === current ? 'true' : 'false');
    button.textContent = languageName(language.code);
    button.classList.toggle('is-selected', language.code === current);
    button.classList.toggle('is-focused', index === appState.languageFocusIndex);
    button.addEventListener('click', () => chooseLanguage(language.code));
    languagePicker.append(button);
  }
}

function renderMainMenu() {
  if (!mainMenu) return;
  mainMenu.classList.toggle('is-hidden', !appState.menuOpen);
  if (!appState.menuOpen) return;
  appState.menuFocusIndex = clampIndex(appState.menuFocusIndex, mainMenuActionCount());
  appState.controlsFocusIndex = clampIndex(appState.controlsFocusIndex, controlMenuActionCount());

  if (menuTitle) menuTitle.textContent = t('gameTitle');
  if (menuSubtitle) menuSubtitle.textContent = t('menuSubtitle');
  if (menuStart) {
    menuStart.textContent = t(appState.menuRequiresNewRun ? 'newRun' : 'menuStart');
    menuStart.classList.toggle('is-focused', !appState.controlsOpen && appState.menuFocusIndex === 0);
  }
  if (menuControls) {
    menuControls.textContent = t('menuControls');
    menuControls.classList.toggle('is-focused', !appState.controlsOpen && appState.menuFocusIndex === 1);
  }
  if (menuLanguage) {
    menuLanguage.textContent = t('menuLanguage', { language: languageName() });
    menuLanguage.classList.toggle('is-focused', !appState.controlsOpen && appState.menuFocusIndex === 2);
    menuLanguage.setAttribute('aria-expanded', appState.languageOpen ? 'true' : 'false');
  }
  if (controlsTitle) controlsTitle.textContent = t('menuControlsTitle');
  if (controlsHint) {
    controlsHint.textContent = appState.listeningAction
      ? t('menuListening')
      : t('menuControlsHint');
  }
  if (controlsBack) {
    controlsBack.textContent = t('menuBack');
    controlsBack.classList.toggle('is-focused', appState.controlsOpen && appState.controlsFocusIndex === 0);
  }
  if (controlsReset) {
    controlsReset.textContent = t('menuReset');
    controlsReset.classList.toggle('is-focused', appState.controlsOpen && appState.controlsFocusIndex === controlMenuActionCount() - 1);
  }
  if (controlsPanel) controlsPanel.classList.toggle('is-hidden', !appState.controlsOpen);
  if (menuMainActions) menuMainActions.classList.toggle('is-hidden', appState.controlsOpen);
  renderLanguagePicker();
  renderControlsList();
  focusActiveMenuElement();
}

function renderControlsList() {
  if (!controlsList) return;
  controlsList.textContent = '';
  if (!appState.controlsOpen) return;

  const bindings = getActionBindings();
  for (let index = 0; index < ACTION_ORDER.length; index += 1) {
    const action = ACTION_ORDER[index];
    const row = document.createElement('div');
    row.className = 'control-row';

    const name = document.createElement('div');
    name.className = 'control-name';
    name.textContent = actionName(action);

    const button = document.createElement('button');
    button.className = 'menu-button is-small control-key';
    const rebindable = canRebindAction(action);
    if (appState.listeningAction === action) button.classList.add('is-listening');
    if (appState.controlsFocusIndex === index + 1) button.classList.add('is-focused');
    if (!rebindable) {
      button.classList.add('is-locked');
      button.setAttribute('aria-disabled', 'true');
    }
    button.type = 'button';
    button.textContent = appState.listeningAction === action
      ? t('menuListening')
      : `${(bindings[action] ?? []).map(codeLabel).join(' / ')}${rebindable ? '' : ` (${t('menuFixed')})`}`;
    button.addEventListener('click', () => {
      appState.controlsFocusIndex = index + 1;
      if (!rebindable) {
        renderMainMenu();
        return;
      }
      appState.listeningAction = action;
      renderMainMenu();
    });

    row.append(name, button);
    controlsList.append(row);
  }
}

function setShopFeedback(message, ok = false) {
  if (!shopFeedback) return;
  shopFeedback.textContent = message;
  shopFeedback.classList.toggle('is-ok', ok);
  shopFeedback.classList.toggle('is-error', !ok && message.length > 0);
}

function setShopHeaderDialogue(dialogue, metaParts = []) {
  if (!shopSubtitle) return;
  shopSubtitle.textContent = '';
  if (dialogue) {
    const quote = document.createElement('div');
    quote.className = 'shop-quote';
    quote.textContent = dialogue;
    shopSubtitle.append(quote);
  }
  const parts = (metaParts ?? []).filter(Boolean);
  if (parts.length > 0) {
    const meta = document.createElement('div');
    meta.className = 'shop-meta';
    for (let i = 0; i < parts.length; i += 1) {
      const chip = document.createElement('span');
      chip.className = 'shop-meta-chip';
      chip.textContent = parts[i];
      meta.append(chip);
    }
    shopSubtitle.append(meta);
  }
}

function closeGift() {
  gameState.gift = null;
  gameState.shopSelectedIndex = 0;
  gameState.paused = false;
  if (shopOverlay) {
    shopOverlay.classList.add('is-hidden');
    shopOverlay.setAttribute('aria-hidden', 'true');
  }
  endTick();
}

function closeShop() {
  if (gameState.gift) {
    closeGift();
    return;
  }
  gameState.shop = null;
  gameState.shopSelectedIndex = 0;
  gameState.paused = false;
  if (shopOverlay) {
    shopOverlay.classList.add('is-hidden');
    shopOverlay.setAttribute('aria-hidden', 'true');
  }
  endTick();
}

function clampShopSelection() {
  const count = gameState.shop?.inventory?.length ?? 0;
  clampShopSelectionForCount(count);
}

function clampShopSelectionForCount(count) {
  if (count <= 0) {
    gameState.shopSelectedIndex = 0;
    return;
  }
  gameState.shopSelectedIndex = Math.max(
    0,
    Math.min(gameState.shopSelectedIndex, count - 1),
  );
}

function selectableAbilities() {
  return ABILITIES.filter((ability) => (
    !player.abilities.includes(ability.id) &&
    (SHOP.ABILITY_PRICES?.[ability.id] ?? SHOP.ABILITY_PRICE_MAX) <= 50
  ));
}

function unownedAbilities() {
  return ABILITIES.filter((ability) => !player.abilities.includes(ability.id));
}

function eligibleConsumableBundles(amountFor) {
  return CONSUMABLES
    .map((consumable) => ({
      ...consumable,
      amount: amountFor(consumable.id),
    }))
    .filter((consumable) => canAddStack(player, 'consumable', consumable.id, consumable.amount));
}

function grantConsumable(id, amount) {
  ensurePlayerCombatStats(player);
  if (!id) return 0;
  return addStack(player, 'consumable', id, amount, { requireFullAmount: true });
}

function grantFood(amount) {
  ensurePlayerCombatStats(player);
  return addStack(player, 'food', null, amount);
}

function grantAbility(id) {
  ensurePlayerCombatStats(player);
  if (!player.abilities.includes(id)) player.abilities.push(id);
}

function retireBenefactorAfterGift(options = {}) {
  if (options.initial) {
    benefactorState.initialAvailable = false;
    benefactorState.currentRoomId = maze.startId;
    benefactorState.respawnTimer = 0;
    benefactorState.pendingRelocation = true;
    return;
  }
  benefactorState.initialAvailable = false;
  benefactorState.currentRoomId = null;
  benefactorState.respawnTimer = 120;
  benefactorState.pendingRelocation = false;
}

function openBenefactorGift() {
  if (!getInteractableBenefactor()) return false;
  const initial = benefactorState.initialAvailable && currentRoom.id === maze.startId;
  const emptyInitial = (
    benefactorState.hasIntroduced &&
    !benefactorState.initialAvailable &&
    currentRoom.id === maze.startId &&
    benefactorState.pendingRelocation
  );
  gameState.gift = {
    initial,
    emptyInitial,
    step: initial && eligibleConsumableBundles(benefactorConsumableAmount).length > 0 ? 'consumable' : initial ? 'ability' : 'random',
    selectedConsumableId: null,
  };
  gameState.shopSelectedIndex = 0;
  gameState.paused = true;
  if (shopOverlay) {
    shopOverlay.classList.remove('is-hidden');
    shopOverlay.setAttribute('aria-hidden', 'false');
  }
  setShopFeedback(merchantDialogue('benefactor', initial ? 'initialGoodbye' : emptyInitial ? 'empty' : 'randomGoodbye'), true);
  renderBenefactorGift();
  endTick();
  return true;
}

function benefactorOptions() {
  if (!gameState.gift) return [];
  if (gameState.gift.emptyInitial) return [];
  if (!gameState.gift.initial) {
    return [{ id: 'random', name: t('giftAccept'), description: t('giftAcceptDesc') }];
  }
  if (gameState.gift.step === 'consumable') {
    return eligibleConsumableBundles(benefactorConsumableAmount).map((item) => ({
      id: item.id,
      name: `${consumableName(item.id)} x${item.amount}`,
      description: itemDescription({ type: 'consumable', consumableId: item.id }),
    }));
  }
  return selectableAbilities().map((ability) => ({
    id: ability.id,
    name: abilityName(ability.id),
    description: itemDescription({ type: 'ability', abilityId: ability.id }),
  }));
}

function benefactorConsumableAmount(id) {
  return {
    teleport: 3,
    slow_time: 2,
    camouflage: 2,
    mini_platform: 5,
  }[id] ?? 1;
}

function grantRandomBenefactorGift() {
  ensurePlayerCombatStats(player);
  const roll = runtimeRng.next();
  const attempts = roll < 0.34
    ? ['consumable', 'ability', 'food']
    : roll < 0.67
      ? ['ability', 'consumable', 'food']
      : ['food', 'consumable', 'ability'];

  for (const type of attempts) {
    if (type === 'consumable') {
      const consumables = eligibleConsumableBundles(benefactorConsumableAmount);
      if (consumables.length === 0) continue;
      const consumable = runtimeRng.choice(consumables);
      const amount = grantConsumable(consumable.id, consumable.amount);
      return t('giftConsumableReceived', { name: consumableName(consumable.id), amount });
    }
    if (type === 'ability') {
      const abilities = selectableAbilities();
      if (abilities.length === 0) continue;
      const ability = runtimeRng.choice(abilities);
      grantAbility(ability.id);
      return t('giftAbilityReceived', { name: abilityName(ability.id) });
    }
    if (type === 'food') {
      const amount = grantFood(Math.min(5, stackSpace(player, 'food')));
      if (amount <= 0) continue;
      return t('giftFoodReceived', { amount });
    }
  }

  return t('errorStackFull');
}

function chooseBenefactorGift() {
  if (!gameState.gift) return;
  if (gameState.gift.emptyInitial) {
    closeGift();
    return;
  }
  const options = benefactorOptions();
  const option = options[gameState.shopSelectedIndex] ?? options[0];

  if (!gameState.gift.initial) {
    const giftLabel = grantRandomBenefactorGift();
    retireBenefactorAfterGift();
    renderHud();
    renderHudBottom();
    queueNotification({
      type: 'benefactor',
      title: merchantDialogue('benefactor', 'randomGoodbye'),
      color: DISCOVERY_COLORS.benefactor,
      sound: 'shop',
    });
    queueNotification({
      type: 'benefactor',
      title: t('giftBannerTitle'),
      subtitle: giftLabel,
      color: DISCOVERY_COLORS.benefactor,
      sound: 'pickup',
    });
    closeGift();
    return;
  }

  if (gameState.gift.step === 'consumable') {
    if (!option) {
      gameState.gift.step = 'ability';
      gameState.shopSelectedIndex = 0;
      renderBenefactorGift();
      return;
    }
    gameState.gift.selectedConsumableId = option.id;
    gameState.gift.step = 'ability';
    gameState.shopSelectedIndex = 0;
    renderBenefactorGift();
    return;
  }

  if (option) grantAbility(option.id);
  grantConsumable(
    gameState.gift.selectedConsumableId,
    benefactorConsumableAmount(gameState.gift.selectedConsumableId),
  );
  grantFood(3);
  benefactorState.hasIntroduced = true;
  retireBenefactorAfterGift({ initial: true });
  renderHud();
  renderHudBottom();
  queueNotification({
    type: 'benefactor',
    title: merchantDialogue('benefactor', 'initialGoodbye'),
    color: DISCOVERY_COLORS.benefactor,
    sound: 'shop',
  });
  closeGift();
}

function renderBenefactorGift() {
  if (!gameState.gift || !shopOverlay || !shopList) return;
  ensurePlayerCombatStats(player);
  const options = benefactorOptions();
  clampShopSelectionForCount(options.length);
  if (shopTitle) shopTitle.textContent = npcName('benefactor');
  if (shopSubtitle) {
    const dialogue = gameState.gift.initial
      ? merchantDialogue('benefactor', 'initialWelcome')
      : gameState.gift.emptyInitial
        ? merchantDialogue('benefactor', 'empty')
        : merchantDialogue('benefactor', 'randomWelcome');
    const prompt = gameState.gift.initial
      ? gameState.gift.step === 'consumable'
        ? t('giftInitialConsumable')
        : t('giftInitialAbility')
      : gameState.gift.emptyInitial
        ? ''
        : t('giftRandomSubtitle');
    setShopHeaderDialogue(dialogue, prompt ? [prompt] : []);
  }

  shopList.textContent = '';
  for (let index = 0; index < options.length; index += 1) {
    const item = options[index];
    const row = document.createElement('div');
    row.className = 'shop-item';
    if (index === gameState.shopSelectedIndex) row.classList.add('is-selected');

    const main = document.createElement('div');
    main.className = 'shop-item-main';

    const title = document.createElement('div');
    title.className = 'shop-item-title';
    title.textContent = item.name;

    const desc = document.createElement('div');
    desc.className = 'shop-item-desc';
    desc.textContent = item.description;

    const meta = document.createElement('div');
    meta.className = 'shop-item-meta';
    meta.textContent = t('shopFree');

    const button = document.createElement('button');
    button.className = 'shop-buy';
    button.type = 'button';
    button.textContent = t('shopChoose');
    button.addEventListener('click', () => {
      gameState.shopSelectedIndex = index;
      chooseBenefactorGift();
    });

    main.append(title, desc, meta);
    row.append(main, button);
    shopList.append(row);
  }

  if (options.length === 0) {
    const row = document.createElement('div');
    row.className = 'shop-item';
    row.textContent = t('giftEmpty');
    shopList.append(row);
  }
  const selected = shopList.querySelector('.shop-item.is-selected');
  selected?.scrollIntoView({ block: 'nearest' });
}

function buySelectedShopItem() {
  if (!gameState.shop) return;
  clampShopSelection();
  const item = gameState.shop.inventory[gameState.shopSelectedIndex];
  const result = buyShopItem(player, gameState, item);
  setShopFeedback(result.message, result.ok);
  renderHud();
  renderHudBottom();
  renderShop();
}

function renderShop() {
  if (!gameState.shop || !shopOverlay || !shopList) return;
  ensurePlayerCombatStats(player);
  gameState.shop.inventory = getVisibleShopInventory(gameState.shop);
  clampShopSelection();

  const { type, definition, inventory } = gameState.shop;
  if (shopTitle) shopTitle.textContent = npcName(type) ?? definition?.name ?? type;
  if (shopSubtitle) {
    setShopHeaderDialogue(merchantDialogue(type, 'welcome'), [
      npcRole(type) ?? definition?.role ?? t('shopDefault'),
      t('shopCoins', { coins: player.coins }),
    ]);
  }

  shopList.textContent = '';
  for (let index = 0; index < inventory.length; index += 1) {
    const item = inventory[index];
    const blockedReason = itemStatus(player, gameState, item);
    const row = document.createElement('div');
    row.className = 'shop-item';
    if (index === gameState.shopSelectedIndex) row.classList.add('is-selected');

    const main = document.createElement('div');
    main.className = 'shop-item-main';

    const title = document.createElement('div');
    title.className = 'shop-item-title';
    title.textContent = itemName(item);

    const desc = document.createElement('div');
    desc.className = 'shop-item-desc';
    desc.textContent = itemDescription(item);

    const meta = document.createElement('div');
    meta.className = 'shop-item-meta';
    const stockText = item.maxStock
      ? `${Math.max(0, item.stock)}/${item.maxStock}`
      : `${Math.max(0, item.stock)}`;
    meta.textContent = `${t('shopPrice', { price: item.price })} | ${t('shopStock', { stock: stockText })}`;
    if (item.restockable && item.stock < item.maxStock && item.restockTimer > 0) {
      meta.textContent += ` | ${t('shopRestock', { timer: formatTimer(item.restockTimer) })}`;
    }
    if (blockedReason && blockedReason !== t('errorCoins')) {
      meta.textContent += ` | ${blockedReason}`;
    }

    const button = document.createElement('button');
    button.className = 'shop-buy';
    button.type = 'button';
    button.textContent = t('shopBuy');
    button.disabled = blockedReason && ![t('errorCoins'), t('errorStackFull')].includes(blockedReason);
    button.addEventListener('click', () => {
      gameState.shopSelectedIndex = index;
      buySelectedShopItem();
    });

    main.append(title, desc, meta);
    row.append(main, button);
    shopList.append(row);
  }

  const selected = shopList.querySelector('.shop-item.is-selected');
  selected?.scrollIntoView({ block: 'nearest' });
}

function openShop(npc) {
  if (!npc) return;
  gameState.shop = npc;
  gameState.shopSelectedIndex = 0;
  gameState.paused = true;
  if (shopOverlay) {
    shopOverlay.classList.remove('is-hidden');
    shopOverlay.setAttribute('aria-hidden', 'false');
  }
  setShopFeedback(merchantDialogue(npc.type, 'goodbye'), true);
  playGameSound('shop');
  renderShop();
  endTick();
}

if (shopClose) {
  shopClose.addEventListener('click', closeShop);
}

menuStart?.addEventListener('click', startGameFromMenu);
menuControls?.addEventListener('click', () => {
  appState.controlsOpen = true;
  appState.languageOpen = false;
  appState.listeningAction = null;
  appState.returnToPauseAfterControls = false;
  appState.menuFocusIndex = 1;
  appState.controlsFocusIndex = 0;
  renderMainMenu();
});
menuLanguage?.addEventListener('click', () => {
  appState.menuFocusIndex = 2;
  setLanguageMenuOpen(!appState.languageOpen);
});
controlsBack?.addEventListener('click', () => {
  closeControlsPanel();
});
controlsReset?.addEventListener('click', () => {
  resetActionBindings();
  appState.listeningAction = null;
  appState.controlsFocusIndex = controlMenuActionCount() - 1;
  renderMainMenu();
  renderHudBottom();
});

function useFood() {
  ensurePlayerCombatStats(player);
  if (player.food <= 0 || player.currentLife >= player.maxLifeSlots) return;
  player.food -= 1;
  player.currentLife = Math.min(player.maxLifeSlots, player.currentLife + 1);
  playGameSound('pickup');
  renderHud();
  renderHudBottom();
}

function useSlowTime() {
  ensurePlayerCombatStats(player);
  if (player.consumables.slow_time <= 0) return;
  player.consumables.slow_time -= 1;
  gameState.slowTimeTimer = CONSUMABLE.SLOW_DURATION;
  playGameSound('ui');
  renderHudBottom();
}

function useTeleportDevice() {
  ensurePlayerCombatStats(player);
  if (!gameState.teleportAnchor) {
    if (player.consumables.teleport <= 0) return;
    gameState.teleportAnchor = {
      roomId: currentRoom.id,
      x: player.x,
      y: player.y,
    };
    minimapState.teleportAnchorId = currentRoom.id;
    playGameSound('ui');
    return;
  }

  if (player.consumables.teleport <= 0) return;
  if (isMinibossExitLocked(currentRoom)) return;
  const targetRoom = rooms.get(gameState.teleportAnchor.roomId);
  if (!targetRoom) {
    gameState.teleportAnchor = null;
    minimapState.teleportAnchorId = null;
    return;
  }

  persistAllGlobalCloneEntities();
  player.consumables.teleport -= 1;
  hideInitialBenefactorIfLeaving(currentRoom.id);
  currentRoom = targetRoom;
  player.x = gameState.teleportAnchor.x;
  player.y = gameState.teleportAnchor.y;
  player.prevX = player.x;
  player.prevY = player.y;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  visitRoomOnMinimap(minimapState, maze, currentRoom.id, { link: false });
  gameState.teleportAnchor = null;
  minimapState.teleportAnchorId = null;
  syncGlobalClonesForCurrentRoom();
  notifyCurrentRoomDiscovery();
  playGameSound('ui');
  renderHudBottom();
}

function useMiniPlatform() {
  ensurePlayerCombatStats(player);
  if (player.consumables.mini_platform <= 0) return;
  player.consumables.mini_platform -= 1;

  const state = getRoomState(currentRoom);
  const w = CONSUMABLE.MINI_PLATFORM_W;
  const h = CONSUMABLE.MINI_PLATFORM_H;
  state.tempPlatforms.push({
    x: Math.max(WALL_THICKNESS, Math.min(player.x + player.w / 2 - w / 2, ROOM_W - WALL_THICKNESS - w)),
    y: Math.min(player.y + player.h + 10, ROOM_H - WALL_THICKNESS - h - 2),
    w,
    h,
    oneWay: true,
    kind: 'tempPlatform',
  });
  playGameSound('ui');
  renderHudBottom();
}

function useCamouflage() {
  ensurePlayerCombatStats(player);
  if (player.consumables.camouflage <= 0) return;
  player.consumables.camouflage -= 1;
  gameState.camouflageTimer = CONSUMABLE.CAMOUFLAGE_DURATION;
  playGameSound('ui');
  renderHudBottom();
}

function useSlot(slot) {
  if (slot === 1) useFood();
  else if (slot === 2) useSlowTime();
  else if (slot === 3) useTeleportDevice();
  else if (slot === 4) useMiniPlatform();
  else if (slot === 5) useCamouflage();
}

function activateMainMenuFocus() {
  if (appState.menuFocusIndex === 0) {
    startGameFromMenu();
    return;
  }
  if (appState.menuFocusIndex === 1) {
    appState.controlsOpen = true;
    appState.languageOpen = false;
    appState.controlsFocusIndex = 0;
    renderMainMenu();
    return;
  }
  setLanguageMenuOpen(!appState.languageOpen);
}

function activateControlsFocus() {
  const lastIndex = controlMenuActionCount() - 1;
  if (appState.controlsFocusIndex === 0) {
    closeControlsPanel();
    return;
  }
  if (appState.controlsFocusIndex === lastIndex) {
    resetActionBindings();
    renderMainMenu();
    renderHudBottom();
    return;
  }
  const action = ACTION_ORDER[appState.controlsFocusIndex - 1];
  if (!action) return;
  if (!canRebindAction(action)) {
    renderMainMenu();
    return;
  }
  appState.listeningAction = action;
  renderMainMenu();
}

function handleLanguageMenuKeydown(e) {
  if (!appState.languageOpen) return false;
  if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
    e.preventDefault();
    const delta = e.code === 'ArrowDown' ? 1 : -1;
    appState.languageFocusIndex = clampIndex(appState.languageFocusIndex + delta, LANGUAGES.length);
    renderMainMenu();
    return true;
  }
  if (e.code === 'Enter' || e.code === 'Space') {
    e.preventDefault();
    const language = LANGUAGES[appState.languageFocusIndex];
    if (language) chooseLanguage(language.code);
    return true;
  }
  if (e.code === 'Escape') {
    e.preventDefault();
    setLanguageMenuOpen(false);
    return true;
  }
  return false;
}

function handleControlsMenuKeydown(e) {
  if (!appState.controlsOpen) return false;
  if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
    e.preventDefault();
    const delta = e.code === 'ArrowDown' ? 1 : -1;
    appState.controlsFocusIndex = clampIndex(appState.controlsFocusIndex + delta, controlMenuActionCount());
    renderMainMenu();
    return true;
  }
  if (e.code === 'Enter' || e.code === 'Space') {
    e.preventDefault();
    activateControlsFocus();
    return true;
  }
  if (e.code === 'Escape') {
    e.preventDefault();
    closeControlsPanel();
    return true;
  }
  return false;
}

function handleMainMenuKeydown(e) {
  if (handleLanguageMenuKeydown(e)) return true;
  if (handleControlsMenuKeydown(e)) return true;

  if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
    e.preventDefault();
    const delta = e.code === 'ArrowDown' ? 1 : -1;
    appState.menuFocusIndex = clampIndex(appState.menuFocusIndex + delta, mainMenuActionCount());
    appState.languageOpen = false;
    renderMainMenu();
    return true;
  }

  if (e.code === 'Enter' || e.code === 'Space') {
    e.preventDefault();
    activateMainMenuFocus();
    return true;
  }

  if (e.code === 'Escape' && appState.languageOpen) {
    e.preventDefault();
    setLanguageMenuOpen(false);
    return true;
  }

  return false;
}

function currentOverlayActions() {
  if (gameState.pauseMenuOpen) {
    return [
      {
        label: `${codeLabel(getActionCodes('pause')[0] ?? 'Escape')} - ${t('resume')}`,
        run: () => setPauseMenu(false),
      },
      {
        label: t('pauseControls'),
        run: openMainControlsFromPause,
      },
      {
        label: t('restartRun'),
        run: restartSameSeedRun,
      },
      {
        label: t('returnMenu'),
        run: returnToMainMenu,
      },
    ];
  }

  if (cloneState.endKind) {
    return [
      {
        label: t('continuePrompt'),
        run: () => finishEndVideo(cloneState.endKind),
      },
    ];
  }

  return [];
}

function handleOverlayMenuKeydown(e) {
  const actions = currentOverlayActions();
  if (actions.length === 0) return false;
  if (cloneState.endKind && performance.now() < gameState.endRevealAt) {
    e.preventDefault();
    return true;
  }

  if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
    e.preventDefault();
    const delta = e.code === 'ArrowDown' ? 1 : -1;
    gameState.overlayFocusIndex = clampIndex(gameState.overlayFocusIndex + delta, actions.length);
    return true;
  }

  if (e.code === 'Enter' || e.code === 'Space') {
    e.preventDefault();
    actions[clampIndex(gameState.overlayFocusIndex, actions.length)]?.run();
    return true;
  }

  return false;
}

window.addEventListener('keydown', (e) => {
  if (appState.cinematicOpen) {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      if (gameState.cinematicNeedsStart) {
        startPendingCinematicPlayback();
      } else {
        gameState.cinematicFinish?.();
      }
    }
    return;
  }

  if (appState.rulesOpen) {
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
      e.preventDefault();
      hideRulesOverlay();
    }
    return;
  }

  if (appState.deviceBlocked) {
    e.preventDefault();
    return;
  }

  if (appState.listeningAction) {
    e.preventDefault();
    if (e.code === 'Escape' || e.code === 'Esc' || e.key === 'Escape') {
      appState.listeningAction = null;
      renderMainMenu();
      return;
    }
    setActionBinding(appState.listeningAction, e.code);
    appState.listeningAction = null;
    renderMainMenu();
    renderHudBottom();
    return;
  }

  if (appState.menuOpen) {
    handleMainMenuKeydown(e);
    return;
  }

  if (cloneState.endKind) {
    if (handleOverlayMenuKeydown(e)) return;
    return;
  }

  if (gameState.gift) {
    if (e.code === 'Escape' || (actionMatchesCode('interact', e.code) && !e.repeat)) {
      e.preventDefault();
      closeGift();
      return;
    }

    if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      e.preventDefault();
      const count = benefactorOptions().length;
      if (count > 0) {
        const delta = e.code === 'ArrowDown' ? 1 : -1;
        gameState.shopSelectedIndex = (gameState.shopSelectedIndex + delta + count) % count;
        renderBenefactorGift();
      }
      return;
    }

    if (e.code === 'Enter') {
      e.preventDefault();
      chooseBenefactorGift();
    }
    return;
  }

  if (gameState.shop) {
    if (e.code === 'Escape' || (actionMatchesCode('interact', e.code) && !e.repeat)) {
      e.preventDefault();
      closeShop();
      return;
    }

    if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      e.preventDefault();
      const count = gameState.shop.inventory.length;
      if (count > 0) {
        const delta = e.code === 'ArrowDown' ? 1 : -1;
        gameState.shopSelectedIndex = (gameState.shopSelectedIndex + delta + count) % count;
        renderShop();
      }
      return;
    }

    if (e.code === 'Enter') {
      e.preventDefault();
      buySelectedShopItem();
    }
    return;
  }

  if (actionMatchesCode('pause', e.code) && !e.repeat) {
    e.preventDefault();
    if (gameState.controlsBoardOpen) {
      setControlsBoard(false);
      return;
    }
    setPauseMenu(!gameState.pauseMenuOpen);
    playGameSound('ui');
    return;
  }

  if (gameState.pauseMenuOpen) {
    if (handleOverlayMenuKeydown(e)) return;
    if (actionMatchesCode('newRun', e.code) && !e.repeat) {
      e.preventDefault();
      startNewRun();
    }
    return;
  }

  if (e.code === 'F1') {
    e.preventDefault();
    debugGraphOpen = !debugGraphOpen;
    return;
  }

  if (actionMatchesCode('map', e.code) && !e.repeat) {
    e.preventDefault();
    fullMapOpen = !fullMapOpen;
    playGameSound('ui');
    return;
  }

  for (let slot = 1; slot <= 5; slot += 1) {
    if (!e.repeat && actionMatchesCode(`slot${slot}`, e.code)) {
      e.preventDefault();
      useSlot(slot);
      return;
    }
  }

  if (actionMatchesCode('interact', e.code) && !e.repeat) {
    if (gameState.controlsBoardOpen) {
      setControlsBoard(false);
      e.preventDefault();
      return;
    }
    if (activateCheckpoint()) {
      e.preventDefault();
      return;
    }
    if (openBenefactorGift()) {
      e.preventDefault();
      return;
    }
    const npc = getInteractableNpc();
    if (npc) {
      e.preventDefault();
      openShop(npc);
      return;
    }
    if (getInteractableSign()) {
      e.preventDefault();
      setControlsBoard(true);
      return;
    }
  }
});

function canvasToRoomPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.width / ROOM_W, rect.height / ROOM_H);
  const offX = (rect.width - ROOM_W * scale) / 2;
  const offY = (rect.height - ROOM_H * scale) / 2;
  return {
    x: (event.clientX - rect.left - offX) / scale,
    y: (event.clientY - rect.top - offY) / scale,
  };
}

function menuOverlayMetrics(count = 2) {
  const panelWidth = 460;
  const panelTop = Math.round((ROOM_H - menuOverlayHeight(count)) / 2);
  return { panelWidth, panelTop };
}

function menuOverlayHeight(count = 2) {
  return 196 + count * 32;
}

function menuButtonRect(index = 0, count = 2) {
  const { panelTop } = menuOverlayMetrics(count);
  const buttonsTop = panelTop + 142;
  return {
    x: ROOM_W / 2 - 130,
    y: buttonsTop + index * 32,
    w: 260,
    h: 28,
  };
}

canvas.addEventListener('click', (e) => {
  if (!cloneState.endKind && !gameState.pauseMenuOpen) return;
  if (cloneState.endKind && performance.now() < gameState.endRevealAt) return;
  const point = canvasToRoomPoint(e);
  const pointer = { x: point.x, y: point.y, w: 1, h: 1 };
  const actions = currentOverlayActions();
  for (let index = 0; index < actions.length; index += 1) {
    if (rectsOverlap(pointer, menuButtonRect(index, actions.length))) {
      gameState.overlayFocusIndex = index;
      actions[index].run();
      return;
    }
  }
});

// --- Transizione di stanza ---
// Il giocatore puo lasciare la stanza solo attraverso un'apertura (le pareti
// sono solide). Quando il suo centro esce dai bordi della stanza, identifica
// la direzione di uscita e carica la stanza collegata, ricollocando il player
// in posizione coerente.
function checkRoomTransition() {
  const cx = player.x + player.w / 2;
  const cy = player.y + player.h / 2;

  let exitDir = null;
  if (cy < 0)            exitDir = 'N';
  else if (cy > ROOM_H)  exitDir = 'S';
  else if (cx < 0)       exitDir = 'O';
  else if (cx > ROOM_W)  exitDir = 'E';
  if (!exitDir) return;

  const exitInfo = currentRoom.exits[exitDir];
  if (!exitInfo) {
    // Non dovrebbe accadere: i muri solidi impediscono di uscire dove non c'e
    // un'uscita. Per sicurezza riportiamo il player dentro.
    player.x = Math.max(WALL_THICKNESS, Math.min(player.x, ROOM_W - WALL_THICKNESS - player.w));
    player.y = Math.max(WALL_THICKNESS, Math.min(player.y, ROOM_H - WALL_THICKNESS - player.h));
    return;
  }

  if (isExitLocked(currentRoom, exitDir)) {
    player.x = Math.max(WALL_THICKNESS, Math.min(player.x, ROOM_W - WALL_THICKNESS - player.w));
    player.y = Math.max(WALL_THICKNESS, Math.min(player.y, ROOM_H - WALL_THICKNESS - player.h));
    return;
  }

  const newRoom = rooms.get(exitInfo.target);
  if (!newRoom) return;

  // Transizione "continua": preserviamo vx/vy e shiftiamo la posizione di
  // ROOM_W/ROOM_H lungo l'asse della transizione. Il player riemerge dalla
  // porta opposta della nuova stanza con lo stesso movimento. I bordi delle
  // porte adiacenti sono allineati per costruzione (§4.2 dello SPEC), quindi
  // il player si trova sempre dentro la porta corrispondente.
  switch (exitDir) {
    case 'N': player.y += ROOM_H; break;
    case 'S': player.y -= ROOM_H; break;
    case 'E': player.x -= ROOM_W; break;
    case 'O': player.x += ROOM_W; break;
  }

  if (exitDir === 'N' && exitInfo.targetExit === 'S') {
    player.vy = Math.min(
      player.vy,
      -ROOM_TRANSITION.NORTH_TO_SOUTH_ENTRY_JUMP_VELOCITY,
    );
  }

  // Reset prev per evitare che l'interpolazione disegni un guizzo lungo tutto
  // il canvas tra la posizione vecchia (nella stanza precedente) e quella nuova.
  player.prevX = player.x;
  player.prevY = player.y;
  // onGround verrà ricalcolato dal prossimo step di fisica.
  player.onGround = false;
  persistAllGlobalCloneEntities();
  hideInitialBenefactorIfLeaving(currentRoom.id);
  currentRoom = newRoom;
  visitRoomOnMinimap(minimapState, maze, currentRoom.id);
  syncGlobalClonesForCurrentRoom();
  notifyCurrentRoomDiscovery();
}

function coinSize(amount) {
  return PICKUP.COIN_SIZES[amount] ?? PICKUP.COIN_W;
}

function pickEnemyDropAmount(enemy) {
  const roll = runtimeRng.next();
  if (enemy.canRevive) {
    return roll < 0.78 ? 1 : 5;
  }
  if (enemy.miniboss) {
    return roll < 0.7 ? 10 : 20;
  }
  if (roll < 0.68) return 5;
  if (roll < 0.87) return 1;
  if (roll < 0.985) return 10;
  return 20;
}

function dropEnemyCoins(enemy, roomState) {
  const amount = pickEnemyDropAmount(enemy);
  const size = coinSize(amount);
  roomState.pickups.push(new Pickup({
    type: 'coin',
    amount,
    x: enemy.x + enemy.w / 2 - size / 2,
    y: enemy.y + enemy.h / 2 - size / 2,
  }));
}

function dropCloneFood(enemy, roomState) {
  for (let i = 0; i < 3; i += 1) {
    const size = 15;
    roomState.pickups.push(new Pickup({
      type: 'food',
      amount: 1,
      x: Math.max(WALL_THICKNESS, Math.min(enemy.x + enemy.w / 2 - size / 2 + (i - 1) * 18, ROOM_W - WALL_THICKNESS - size)),
      y: Math.max(WALL_THICKNESS + 16, enemy.y + enemy.h / 2 - size / 2 - Math.abs(i - 1) * 8),
      w: size,
      h: size,
    }));
  }
}

function resolveMinibossReward(preferredReward) {
  ensurePlayerCombatStats(player);
  const reward = preferredReward ?? {
    type: 'consumable_bundle',
    consumableId: 'slow_time',
    amount: 7,
  };

  if (reward.type === 'ability' && reward.abilityId && !player.abilities.includes(reward.abilityId)) {
    return reward;
  }
  if (
    reward.type === 'consumable_bundle' &&
    reward.consumableId &&
    canAddStack(player, 'consumable', reward.consumableId, reward.amount ?? 1)
  ) {
    return reward;
  }

  const abilities = unownedAbilities();
  if (abilities.length > 0) {
    const ability = runtimeRng.choice(abilities);
    return { type: 'ability', abilityId: ability.id };
  }

  const amount = reward.amount ?? 1;
  const fullBundle = eligibleConsumableBundles(() => amount);
  if (fullBundle.length > 0) {
    const consumable = runtimeRng.choice(fullBundle);
    return { type: 'consumable_bundle', consumableId: consumable.id, amount };
  }

  const partialBundle = CONSUMABLES
    .map((consumable) => ({
      ...consumable,
      amount: Math.min(amount, stackSpace(player, 'consumable', consumable.id)),
    }))
    .filter((consumable) => consumable.amount > 0);
  if (partialBundle.length > 0) {
    const consumable = runtimeRng.choice(partialBundle);
    return { type: 'consumable_bundle', consumableId: consumable.id, amount: consumable.amount };
  }

  return null;
}

function dropMinibossReward(enemy, roomState) {
  if (roomState.minibossRewardDropped) return;
  roomState.minibossRewardDropped = true;
  const reward = resolveMinibossReward(currentRoom.meta.minibossReward);
  if (!reward) return;
  const baseX = enemy.x + enemy.w / 2;
  const baseY = enemy.y + enemy.h / 2;
  const pickupType = reward.type === 'consumable_bundle' ? 'consumable' : reward.type;

  roomState.pickups.push(new Pickup({
    type: pickupType,
    amount: reward.amount ?? 1,
    abilityId: reward.abilityId,
    consumableId: reward.consumableId,
    x: Math.max(WALL_THICKNESS, Math.min(baseX - 8, ROOM_W - WALL_THICKNESS - 16)),
    y: Math.max(WALL_THICKNESS + 16, baseY - 8),
    w: 16,
    h: 16,
  }));
}

function handleEnemyDefeated(enemy, roomState) {
  if (enemy.globalCloneId) {
    dropCloneFood(enemy, roomState);
    markGlobalCloneDefeated(enemy);
    notifyCloneRemaining();
    return;
  }
  if (enemy.miniboss) {
    roomState.minibossDefeated = true;
    roomState.minibossLocked = false;
    dropMinibossReward(enemy, roomState);
    return;
  }
  if (enemy.noDrop) return;
  dropEnemyCoins(enemy, roomState);
}

function shouldChargeFromEnemy(enemy) {
  return enemy.noSuperCharge !== true;
}

function resetNonCloneEnemiesOnPlayerRespawn() {
  for (const [roomId, state] of roomStates) {
    const room = rooms.get(roomId);
    if (!room) continue;
    const recreated = createNonCloneEnemies(room)
      .filter((enemy) => !enemy.miniboss || !state.minibossDefeated);
    state.enemies = recreated;
    state.projectiles = [];
    state.minibossLocked = false;
  }
}

function getRespawnRoom() {
  const checkpointId = minimapState.lastCheckpointId;
  if (checkpointId && rooms.has(checkpointId)) return rooms.get(checkpointId);
  return maze.startRoom;
}

function respawnPlayerAfterDeath() {
  persistAllGlobalCloneEntities();
  const deathRoomId = currentRoom.id;
  const respawnRoom = getRespawnRoom();
  spawnDeathClone([deathRoomId, respawnRoom.id]);
  player.superCharge = Math.floor((player.superCharge ?? 0) * 0.5);
  resetNonCloneEnemiesOnPlayerRespawn();
  player.coins = hasAbility('coin_retention') ? Math.floor(player.coins * 0.5) : 0;
  currentRoom = respawnRoom;
  const spawn = getInitialSpawn(currentRoom);
  player.respawnAt(spawn.x, spawn.y);
  minimapState.currentId = currentRoom.id;
  minimapState.visited.add(currentRoom.id);
  syncGlobalClonesForCurrentRoom();
  notifyCloneCountAfterDeath();
}

function shieldDeflect(source) {
  if (!source || typeof source.x !== 'number' || typeof source.w !== 'number') return;

  const playerCenter = player.x + player.w / 2;
  const sourceCenter = source.x + source.w / 2;
  const dir = sourceCenter < playerCenter ? -1 : 1;
  const deflectTarget = source.owner ?? source;

  if (typeof deflectTarget.direction === 'number') deflectTarget.direction = dir;
  if (typeof deflectTarget.vx === 'number') deflectTarget.vx = dir * ABILITY.SHIELD_KNOCKBACK_SPEED;
  if (typeof deflectTarget.chargeTimer === 'number') deflectTarget.chargeTimer = 0;
  if (typeof deflectTarget.hurtTimer === 'number') deflectTarget.hurtTimer = Math.max(deflectTarget.hurtTimer, 0.12);
  if (typeof deflectTarget.shieldKnockTimer === 'number') {
    deflectTarget.shieldKnockTimer = ABILITY.SHIELD_KNOCKBACK_TIME;
  }

  if (typeof deflectTarget.h === 'number') {
    deflectTarget.x = dir < 0
      ? Math.min(deflectTarget.x, player.x - deflectTarget.w - 2)
      : Math.max(deflectTarget.x, player.x + player.w + 2);
    deflectTarget.prevX = deflectTarget.x;
  }
}

function damagePlayer(amount, source) {
  if (gameState.shieldTimer > 0) {
    shieldDeflect(source);
    gameState.shieldTimer = 0;
    gameState.shieldCooldown = ABILITY.SHIELD_COOLDOWN;
    player.invulnTimer = Math.max(player.invulnTimer, ABILITY.SHIELD_BLOCK_INVULN_TIME);
    return false;
  }

  const playerCenter = player.x + player.w / 2;
  const sourceCenter = source.x + source.w / 2;
  const knockbackDir = playerCenter >= sourceCenter ? 1 : -1;
  const lifeBefore = player.currentLife;
  const died = player.takeDamage(amount, knockbackDir);
  if (player.currentLife < lifeBefore) {
    playGameSound(died ? 'death' : 'hit');
    startScreenShake(
      died ? FEEDBACK.SHAKE_HEAVY_MAGNITUDE : FEEDBACK.SHAKE_LIGHT_MAGNITUDE,
      died ? FEEDBACK.SHAKE_HEAVY_TIME : FEEDBACK.SHAKE_LIGHT_TIME,
    );
    const cloneAttacker = source?.globalCloneId ? source : source?.owner;
    if (cloneAttacker?.globalCloneId && typeof cloneAttacker.chargeCloneSuper === 'function') {
      cloneAttacker.chargeCloneSuper(amount);
    }
  }
  if (died) {
    respawnPlayerAfterDeath();
    return true;
  }
  return false;
}

function alertEnemyFromCamouflage(enemy) {
  if (gameState.camouflageTimer <= 0 || enemy.dead) return;
  enemy.camouflageAlertTimer = Math.max(
    enemy.camouflageAlertTimer ?? 0,
    gameState.camouflageTimer,
  );
}

function updateWorldTimers(dt) {
  if (gameState.slowTimeTimer > 0) gameState.slowTimeTimer -= dt;
  if (gameState.camouflageTimer > 0) gameState.camouflageTimer -= dt;
  if (gameState.stopTimer > 0) gameState.stopTimer -= dt;
  if (gameState.stopCooldown > 0) gameState.stopCooldown -= dt;
  if (gameState.playerSlowTimer > 0) gameState.playerSlowTimer -= dt;
  if (gameState.playerStopTimer > 0) gameState.playerStopTimer -= dt;
  if (gameState.shieldTimer > 0) gameState.shieldTimer -= dt;
  if (gameState.shieldCooldown > 0) gameState.shieldCooldown -= dt;
  if (gameState.superReadyPulseTimer > 0) gameState.superReadyPulseTimer -= dt;
  if (gameState.checkpointPulseTimer > 0) gameState.checkpointPulseTimer -= dt;
  if (gameState.shakeTimer > 0) gameState.shakeTimer -= dt;
  if (player.rangedCooldown > 0) player.rangedCooldown -= dt;
  updateShopRestock(shopInventories, dt);
  updateBenefactor(dt);
  updateRangedAmmo(dt);
}

function updateRangedAmmo(dt) {
  if (!Array.isArray(player.rangedReloadTimers)) player.rangedReloadTimers = [];
  if (player.rangedAmmo >= ABILITY.RANGED_MAX_AMMO) {
    player.rangedAmmo = ABILITY.RANGED_MAX_AMMO;
    player.rangedReloadTimers = [];
    return;
  }

  for (let i = player.rangedReloadTimers.length - 1; i >= 0; i -= 1) {
    player.rangedReloadTimers[i] -= dt;
    if (player.rangedReloadTimers[i] <= 0) {
      player.rangedReloadTimers.splice(i, 1);
      player.rangedAmmo = Math.min(ABILITY.RANGED_MAX_AMMO, player.rangedAmmo + 1);
    }
  }

  if (player.rangedAmmo >= ABILITY.RANGED_MAX_AMMO) {
    player.rangedAmmo = ABILITY.RANGED_MAX_AMMO;
    player.rangedReloadTimers = [];
  }
}

function enemyTimeScale() {
  return gameState.slowTimeTimer > 0 ? CONSUMABLE.SLOW_FACTOR : 1;
}

function updateDormantRevivers(dt) {
  for (const [roomId, state] of roomStates) {
    if (roomId === currentRoom.id) continue;
    const room = rooms.get(roomId);
    if (!room) continue;
    for (const enemy of state.enemies) {
      if (enemy.dead && enemy.canRevive) enemy.updateCorpse(dt, room.solids);
    }
  }
}

function updateDormantReviversThrottled(dt) {
  gameState.dormantReviverTimer -= dt;
  gameState.dormantReviverDt += dt * enemyTimeScale();
  if (gameState.dormantReviverTimer > 0) return;

  const simDt = gameState.dormantReviverDt;
  gameState.dormantReviverTimer = DORMANT_REVIVER_INTERVAL;
  gameState.dormantReviverDt = 0;
  updateDormantRevivers(simDt);
}

function solidsForExistingRoomState(room, state) {
  const locks = room?.meta?.miniboss && state.minibossLocked && !state.minibossDefeated
    ? minibossLockSolids(room)
    : [];
  return [...room.solids, ...state.tempPlatforms, ...locks];
}

function advanceDormantPlayerProjectile(projectile, dt, solids) {
  projectile.x += projectile.vx * dt;
  projectile.y += projectile.vy * dt;
  projectile.life -= dt;
  if (
    projectile.life <= 0 ||
    projectile.x < 0 ||
    projectile.x + projectile.w > ROOM_W ||
    projectile.y < 0 ||
    projectile.y + projectile.h > ROOM_H
  ) {
    projectile.dead = true;
    return;
  }

  for (const solid of solids) {
    if (solid.oneWay) continue;
    if (rectsOverlap(projectile, solid)) {
      projectile.dead = true;
      return;
    }
  }
}

function updateAdjacentRoomSimulation(dt) {
  const adjacentIds = roomNeighborIds(currentRoom.id);
  const hostileDt = dt * enemyTimeScale();

  for (const roomId of adjacentIds) {
    const room = rooms.get(roomId);
    const state = roomStates.get(roomId);
    if (!room || !state) continue;

    const solids = solidsForExistingRoomState(room, state);
    for (const projectile of state.projectiles) {
      projectile.update(hostileDt, solids);
    }
    for (const projectile of state.playerProjectiles) {
      advanceDormantPlayerProjectile(projectile, dt, solids);
    }

    state.projectiles = state.projectiles.filter((projectile) => !projectile.dead);
    state.playerProjectiles = state.playerProjectiles.filter((projectile) => !projectile.dead);
  }
}

function tryUseStopAbility() {
  if (!hasAbility('stop') || gameState.stopCooldown > 0) return;
  gameState.stopTimer = ABILITY.STOP_DURATION;
  gameState.stopCooldown = ABILITY.STOP_COOLDOWN;
}

function tryUseShield() {
  if (!hasAbility('shield') || gameState.shieldCooldown > 0 || gameState.shieldTimer > 0) return;
  player.attackTimer = 0;
  player.attackHitIds.clear();
  gameState.shieldTimer = ABILITY.SHIELD_ACTIVE_TIME;
  gameState.shieldCooldown = ABILITY.SHIELD_COOLDOWN;
}

function spawnPlayerProjectile() {
  if (
    !hasAbility('ranged_weapon') ||
    gameState.shieldTimer > 0 ||
    player.rangedCooldown > 0 ||
    player.rangedAmmo <= 0
  ) return;
  player.rangedCooldown = ABILITY.RANGED_COOLDOWN;
  player.rangedAmmo -= 1;
  player.rangedReloadTimers.push(ABILITY.RANGED_RELOAD_TIME);
  playGameSound('attack');
  const state = getRoomState(currentRoom);
  const dir = player.facing >= 0 ? 1 : -1;
  state.playerProjectiles.push({
    x: dir > 0 ? player.x + player.w : player.x - 8,
    y: player.y + player.h / 2 - 4,
    w: 8,
    h: 8,
    vx: dir * ABILITY.RANGED_SPEED,
    vy: 0,
    damage: ABILITY.RANGED_DAMAGE,
    life: ABILITY.RANGED_LIFE,
    dead: false,
  });
}

function readSuperAimDirection() {
  if (!player.onGround && isDown('down')) return { x: 0, y: 1 };
  if (isDown('up')) return { x: 0, y: -1 };
  return { x: player.facing >= 0 ? 1 : -1, y: 0 };
}

function spawnSuperProjectile() {
  ensurePlayerCombatStats(player);
  if (gameState.shieldTimer > 0) return;

  const stats = getSuperWeaponStats();
  if (player.superCharge < stats.CHARGE_REQUIRED) return;

  player.superCharge = 0;
  gameState.superReadyPulseTimer = 0;
  playGameSound('attack');
  const state = getRoomState(currentRoom);
  const dir = readSuperAimDirection();
  const vertical = Math.abs(dir.y) > 0;
  const w = vertical ? stats.H : stats.W;
  const h = vertical ? stats.W : stats.H;
  state.playerProjectiles.push({
    kind: 'super',
    x: vertical ? player.x + player.w / 2 - w / 2 : (dir.x > 0 ? player.x + player.w : player.x - w),
    y: vertical ? (dir.y > 0 ? player.y + player.h : player.y - h) : player.y + player.h / 2 - h / 2,
    w,
    h,
    vx: dir.x * stats.SPEED,
    vy: dir.y * stats.SPEED,
    direction: dir,
    damage: stats.DAMAGE,
    knockback: stats.KNOCKBACK,
    life: SUPER_WEAPON.LIFE,
    dead: false,
    hitIds: new Set(),
  });
}

function handleAbilityInputs() {
  if (isPressed('stop')) tryUseStopAbility();
  if (isPressed('shield')) tryUseShield();
  if (isPressed('ranged')) spawnPlayerProjectile();
  if (isPressed('super')) spawnSuperProjectile();
}

function playQueuedPlayerFeedback() {
  if (player.jumpSoundQueued) playGameSound('jump');
  if (player.attackSoundQueued) playGameSound('attack');
  if (player.groundSlamImpactQueued) {
    playGameSound('hit');
    startScreenShake(FEEDBACK.SHAKE_HEAVY_MAGNITUDE, FEEDBACK.SHAKE_HEAVY_TIME);
  }
}

function knockEnemyFromSuper(enemy, projectile) {
  if (Math.abs(projectile.vy ?? 0) > Math.abs(projectile.vx ?? 0)) {
    const verticalDir = projectile.vy >= 0 ? 1 : -1;
    const sideDir = enemy.x + enemy.w / 2 >= player.x + player.w / 2 ? 1 : -1;
    enemy.direction = sideDir;
    enemy.vx = sideDir * (projectile.knockback ?? 240) * 0.28;
    enemy.vy = verticalDir > 0
      ? Math.max(enemy.vy, (projectile.knockback ?? 240) * 0.65)
      : Math.min(enemy.vy, -(projectile.knockback ?? 240) * 0.72);
    enemy.shieldKnockTimer = Math.max(enemy.shieldKnockTimer ?? 0, 0.18);
    return;
  }
  const dir = projectile.vx >= 0 ? 1 : -1;
  enemy.direction = dir;
  enemy.vx = dir * (projectile.knockback ?? 240);
  enemy.vy = Math.min(enemy.vy, -120);
  enemy.shieldKnockTimer = Math.max(enemy.shieldKnockTimer ?? 0, 0.18);
}

function groundSlamKnockDir(enemy) {
  const playerCenter = player.x + player.w / 2;
  const enemyCenter = enemy.x + enemy.w / 2;
  if (Math.abs(enemyCenter - playerCenter) < 3) return player.facing >= 0 ? 1 : -1;
  return enemyCenter >= playerCenter ? 1 : -1;
}

function knockEnemyFromGroundSlam(enemy) {
  const dir = groundSlamKnockDir(enemy);
  enemy.direction = dir;
  enemy.vx = dir * PLAYER.GROUND_SLAM_KNOCKBACK_X;
  enemy.vy = Math.min(enemy.vy, -PLAYER.GROUND_SLAM_KNOCKBACK_Y);
  enemy.shieldKnockTimer = Math.max(
    enemy.shieldKnockTimer ?? 0,
    PLAYER.GROUND_SLAM_KNOCKBACK_TIME,
  );
}

function knockEnemyFromAttack(enemy, attack) {
  const dirX = attack.direction?.x
    ? Math.sign(attack.direction.x)
    : enemy.x + enemy.w / 2 >= player.x + player.w / 2 ? 1 : -1;
  const scale = enemy.miniboss ? 0.42 : 1;
  enemy.direction = dirX || enemy.direction;
  enemy.vx = (dirX || 1) * PLAYER.HIT_KNOCKBACK_X * scale;
  enemy.vy = Math.min(enemy.vy, -PLAYER.HIT_KNOCKBACK_Y * scale);
  enemy.shieldKnockTimer = Math.max(
    enemy.shieldKnockTimer ?? 0,
    PLAYER.HIT_KNOCKBACK_TIME,
  );
}

function enemyHitFeedback(enemy, hpBefore, impact = 'light') {
  const damaged = enemy.hp < hpBefore || (hpBefore > 0 && enemy.dead);
  if (!damaged) return;
  playGameSound('hit');
  if (enemy.miniboss) {
    startScreenShake(FEEDBACK.SHAKE_MINIBOSS_MAGNITUDE, FEEDBACK.SHAKE_MINIBOSS_TIME);
  } else if (impact === 'heavy') {
    startScreenShake(FEEDBACK.SHAKE_LIGHT_MAGNITUDE, FEEDBACK.SHAKE_LIGHT_TIME);
  }
}

function applyGroundSlamHit(enemy, roomState, protectedEnemyIds) {
  player.groundSlamHitIds.add(enemy.id);
  protectedEnemyIds.add(enemy.id);
  alertEnemyFromCamouflage(enemy);
  const hpBefore = enemy.hp;
  const killed = enemy.takeDamage(PLAYER.GROUND_SLAM_DAMAGE, { ignoreHurtTimer: true });
  enemyHitFeedback(enemy, hpBefore, 'heavy');
  if (killed) {
    handleEnemyDefeated(enemy, roomState);
    if (shouldChargeFromEnemy(enemy)) chargeSuperWeapon(SUPER_WEAPON.KILL_CHARGE);
  } else {
    if (enemy.hp < hpBefore && shouldChargeFromEnemy(enemy)) chargeSuperWeapon(SUPER_WEAPON.HIT_CHARGE);
    knockEnemyFromGroundSlam(enemy);
  }
}

function updatePlayerProjectiles(dt, roomState, solids) {
  for (const projectile of roomState.playerProjectiles) {
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.life -= dt;
    if (
      projectile.life <= 0 ||
      projectile.x < 0 ||
      projectile.x + projectile.w > ROOM_W ||
      projectile.y < 0 ||
      projectile.y + projectile.h > ROOM_H
    ) {
      projectile.dead = true;
      continue;
    }

    for (const solid of solids) {
      if (solid.oneWay) continue;
      if (rectsOverlap(projectile, solid)) {
        projectile.dead = true;
        break;
      }
    }
    if (projectile.dead) continue;

    for (const enemy of roomState.enemies) {
      if (enemy.dead || !rectsOverlap(projectile, enemy)) continue;
      if (projectile.kind === 'super') {
        if (projectile.hitIds.has(enemy.id)) continue;
        projectile.hitIds.add(enemy.id);
        alertEnemyFromCamouflage(enemy);
        const hpBefore = enemy.hp;
        if (enemy.takeDamage(projectile.damage, { ignoreHurtTimer: true })) {
          enemyHitFeedback(enemy, hpBefore, 'heavy');
          handleEnemyDefeated(enemy, roomState);
        } else if (enemy.hp < hpBefore) {
          enemyHitFeedback(enemy, hpBefore, 'heavy');
          knockEnemyFromSuper(enemy, projectile);
        }
        continue;
      }

      projectile.dead = true;
      alertEnemyFromCamouflage(enemy);
      const hpBefore = enemy.hp;
      if (enemy.takeDamage(projectile.damage)) {
        enemyHitFeedback(enemy, hpBefore);
        handleEnemyDefeated(enemy, roomState);
        if (shouldChargeFromEnemy(enemy)) chargeSuperWeapon(SUPER_WEAPON.KILL_CHARGE);
      } else if (enemy.hp < hpBefore) {
        enemyHitFeedback(enemy, hpBefore);
        if (shouldChargeFromEnemy(enemy)) chargeSuperWeapon(SUPER_WEAPON.HIT_CHARGE);
      }
      break;
    }
  }

  roomState.playerProjectiles = roomState.playerProjectiles.filter((projectile) => !projectile.dead);
}

function updateRoomCombat(dt) {
  const roomState = getRoomState(currentRoom);
  const solids = getCurrentSolids();
  const attack = player.getAttackHitbox(solids);
  const slam = player.getGroundSlamHitbox();
  const blind = gameState.camouflageTimer > 0;
  const stopped = gameState.stopTimer > 0;
  const hostileDt = stopped ? 0 : dt * enemyTimeScale();
  const groundSlamProtectedEnemyIds = new Set();

  updatePlayerProjectiles(dt, roomState, solids);

  for (const enemy of roomState.enemies) {
    if (attack && !enemy.dead && !player.attackHitIds.has(enemy.id) && rectsOverlap(attack, enemy)) {
      player.attackHitIds.add(enemy.id);
      alertEnemyFromCamouflage(enemy);
      if (player.isDownAttackActive()) player.bounceFromDownAttack();
      const hpBefore = enemy.hp;
      if (enemy.takeDamage(attack.damage)) {
        enemyHitFeedback(enemy, hpBefore);
        handleEnemyDefeated(enemy, roomState);
        if (shouldChargeFromEnemy(enemy)) chargeSuperWeapon(SUPER_WEAPON.KILL_CHARGE);
      } else if (enemy.hp < hpBefore && attack.poisonDuration > 0 && attack.poisonDps > 0) {
        enemyHitFeedback(enemy, hpBefore);
        knockEnemyFromAttack(enemy, attack);
        enemy.applyPoison(attack.poisonDuration, attack.poisonDps);
        if (shouldChargeFromEnemy(enemy)) chargeSuperWeapon(SUPER_WEAPON.HIT_CHARGE);
      } else if (enemy.hp < hpBefore) {
        enemyHitFeedback(enemy, hpBefore);
        knockEnemyFromAttack(enemy, attack);
        if (shouldChargeFromEnemy(enemy)) chargeSuperWeapon(SUPER_WEAPON.HIT_CHARGE);
      }
    }

    const directGroundSlamHit = (
      player.groundSlamActive &&
      player.vy > 0 &&
      !enemy.dead &&
      rectsOverlap(player, enemy)
    );
    const groundSlamWaveHit = (
      slam &&
      !enemy.dead &&
      rectsOverlap(slam, enemy)
    );

    if (
      (directGroundSlamHit || groundSlamWaveHit) &&
      !player.groundSlamHitIds.has(enemy.id)
    ) {
      applyGroundSlamHit(enemy, roomState, groundSlamProtectedEnemyIds);
    } else if (
      directGroundSlamHit ||
      (player.groundSlamRecoveryTimer > 0 && player.groundSlamHitIds.has(enemy.id))
    ) {
      groundSlamProtectedEnemyIds.add(enemy.id);
    }

    const enemyBlind = blind && (enemy.camouflageAlertTimer ?? 0) <= 0;
    const wasDeadBeforeUpdate = enemy.dead;
    enemy.update(hostileDt, player, solids, roomState.projectiles, {
      blind: enemyBlind,
      stopped,
    });
    if (enemy.globalCloneId && !enemy.dead && transitionGlobalCloneIfOutOfRoom(enemy, roomState)) {
      continue;
    }
    if (enemy.y > ROOM_H + 80) enemy.kill();

    if (!wasDeadBeforeUpdate && enemy.dead && enemy.y <= ROOM_H + 80) {
      handleEnemyDefeated(enemy, roomState);
      if (shouldChargeFromEnemy(enemy)) chargeSuperWeapon(SUPER_WEAPON.KILL_CHARGE);
      continue;
    }

    const hazardHitboxes = enemy.getHazardHitboxes?.() ?? [];
    for (const hazard of hazardHitboxes) {
      if (!enemyBlind && !stopped && !enemy.dead && rectsOverlap(hazard, player)) {
        if (hazard.stopPlayer) {
          gameState.playerStopTimer = Math.max(gameState.playerStopTimer, ENEMY.CLONE.STOP_PULSE_TIME);
        }
        if (hazard.slowPlayer) {
          gameState.playerSlowTimer = Math.max(gameState.playerSlowTimer, CONSUMABLE.SLOW_DURATION * 0.45);
        }
        if ((hazard.damage ?? ENEMY.CONTACT_DAMAGE) > 0 && damagePlayer(hazard.damage ?? ENEMY.CONTACT_DAMAGE, hazard)) return;
      }
    }

    if (
      !enemyBlind &&
      !stopped &&
      !enemy.dead &&
      !groundSlamProtectedEnemyIds.has(enemy.id) &&
      rectsOverlap(enemy, player)
    ) {
      if (damagePlayer(enemy.contactDamage ?? ENEMY.CONTACT_DAMAGE, enemy)) return;
    }
  }

  for (const projectile of roomState.projectiles) {
    projectile.update(hostileDt, solids);
    if (!projectile.dead && rectsOverlap(projectile, player)) {
      projectile.dead = true;
      if (damagePlayer(projectile.damage, projectile)) return;
    }
  }

  for (const pickup of roomState.pickups) {
    const wasCollected = pickup.collected;
    pickup.update(dt, player, solids);
    if (!wasCollected && pickup.collected) {
      playGameSound('pickup');
      notifyPickupCollected(pickup);
    }
  }

  roomState.enemies = roomState.enemies.filter((enemy) => !enemy.dead || enemy.canRevive);
  roomState.projectiles = roomState.projectiles.filter((projectile) => !projectile.dead);
  roomState.pickups = roomState.pickups.filter((pickup) => !pickup.collected);
}

function renderHud() {
  if (!hudTop) return;
  ensurePlayerCombatStats(player);
  const full = '♥'.repeat(player.currentLife);
  const empty = '♡'.repeat(player.maxLifeSlots - player.currentLife);
  const superStats = getSuperWeaponStats();
  const superPercent = Math.max(0, Math.min(100, Math.floor((player.superCharge / superStats.CHARGE_REQUIRED) * 100)));
  const superReady = player.superCharge >= superStats.CHARGE_REQUIRED;
  const superText = player.superCharge >= superStats.CHARGE_REQUIRED
    ? `L${player.superWeaponLevel} ${t('hudReady')}`
    : `L${player.superWeaponLevel}`;
  const aliveClones = aliveGlobalClones().length;
  const cloneText = cloneState.endKind
    ? cloneState.endKind.toUpperCase()
    : `${aliveClones}/${ENEMY.CLONE.MAX_ALIVE}`;
  const html = `
    <div class="hud-row">
      <div class="hud-card">
        <span class="hud-label">${t('hudLife')}</span>
        <span class="hud-hearts">${full}<span class="hud-empty">${empty}</span></span>
      </div>
      <div class="hud-card">
        <span class="hud-label">${t('hudCoins')}</span>
        <span class="hud-value">${player.coins}</span>
      </div>
      <div class="hud-card">
        <span class="hud-label">${t('hudWeapon')}</span>
        <span class="hud-value">L${player.weaponLevel}</span>
      </div>
      <div class="hud-card is-wide ${superReady ? 'is-super-ready' : ''} ${gameState.superReadyPulseTimer > 0 ? 'is-super-pulse' : ''}">
        <span class="hud-label">${t('hudSuper')}</span>
        <span class="hud-value">${superText}</span>
        <span class="super-meter" aria-hidden="true"><span class="super-meter-fill" style="--super-fill:${superPercent}%"></span></span>
      </div>
      <div class="hud-card">
        <span class="hud-label">${t('hudClones')}</span>
        <span class="hud-value">${cloneText}</span>
      </div>
      <div class="hud-card">
        <span class="hud-label">${t('hudAbilities')}</span>
        <span class="hud-value">${player.abilities.length}</span>
      </div>
    </div>
  `;
  setHtmlIfChanged(hudTop, 'hudTopHtml', html);
}

function formatTimer(value) {
  return `${Math.max(0, value).toFixed(1)}s`;
}

function abilityStatus(abilityId) {
  if (abilityId === 'dash' && player.dashCooldown > 0) {
    return { text: `${t('statusCooldown')} ${formatTimer(player.dashCooldown)}`, kind: 'cooldown' };
  }
  if (abilityId === 'run' && player.isRunning) {
    return { text: t('statusOn'), kind: 'ready' };
  }
  if (abilityId === 'shield') {
    if (gameState.shieldTimer > 0) return { text: `${t('statusOn')} ${formatTimer(gameState.shieldTimer)}`, kind: 'ready' };
    if (gameState.shieldCooldown > 0) return { text: `${t('statusCooldown')} ${formatTimer(gameState.shieldCooldown)}`, kind: 'cooldown' };
  }
  if (abilityId === 'ranged_weapon') {
    const kind = player.rangedAmmo > 0 && player.rangedCooldown <= 0 ? 'ready' : 'cooldown';
    return { text: `${player.rangedAmmo}/${ABILITY.RANGED_MAX_AMMO}`, kind };
  }
  if (abilityId === 'ground_slam' && player.groundSlamRecoveryTimer > 0) {
    return { text: `${t('statusRecovery')} ${formatTimer(player.groundSlamRecoveryTimer)}`, kind: 'cooldown' };
  }
  if (abilityId === 'stop') {
    if (gameState.stopTimer > 0) return { text: `${t('statusOn')} ${formatTimer(gameState.stopTimer)}`, kind: 'ready' };
    if (gameState.stopCooldown > 0) return { text: `${t('statusCooldown')} ${formatTimer(gameState.stopCooldown)}`, kind: 'cooldown' };
  }
  if (abilityId === 'coin_multiplier') return { text: '1.5x', kind: 'ready' };
  if (abilityId === 'coin_retention') return { text: '50%', kind: 'ready' };
  return { text: t('statusOk'), kind: 'ready' };
}

function abilityCommand(abilityId) {
  const jumpKey = codeLabel(getActionCodes('jump')[0] ?? 'ArrowUp');
  const downKey = codeLabel(getActionCodes('down')[0] ?? 'ArrowDown');
  const leftKey = codeLabel(getActionCodes('left')[0] ?? 'ArrowLeft');
  const rightKey = codeLabel(getActionCodes('right')[0] ?? 'ArrowRight');
  if (abilityId === 'double_jump') return `${jumpKey} x2`;
  if (abilityId === 'wall_jump') return `${t('commandWallPrefix')}+${jumpKey}`;
  if (abilityId === 'run') return `${leftKey}/${rightKey} x2`;
  if (abilityId === 'ground_slam') return `${downKey} x2`;
  if (abilityId === 'coin_multiplier' || abilityId === 'coin_retention') return t('passive');
  const actionByAbility = {
    dash: 'dash',
    shield: 'shield',
    ranged_weapon: 'ranged',
    stop: 'stop',
  };
  const action = actionByAbility[abilityId];
  if (!action) return '-';
  const label = getActionCodes(action).map(codeLabel).join(' / ');
  if (abilityId === 'ranged_weapon') {
    const nextReload = Math.min(...(player.rangedReloadTimers ?? []));
    if (Number.isFinite(nextReload)) return `${label} +${formatTimer(nextReload)}`;
  }
  return label;
}

function renderAbilityPanel() {
  if (!abilityPanel) return;
  const acquired = ABILITIES.filter((ability) => player.abilities.includes(ability.id));
  if (acquired.length === 0) {
    setHtmlIfChanged(abilityPanel, 'abilityPanelHtml', '');
    return;
  }

  const html = `
    <div class="ability-side-list">
      ${acquired.map((ability) => {
    const status = abilityStatus(ability.id);
    return `
      <div class="ability-chip">
        <span class="ability-name">${abilityName(ability.id)}</span>
        <span class="ability-key">${abilityCommand(ability.id)}</span>
        <span class="ability-status is-${status.kind}">${status.text}</span>
      </div>
    `;
  }).join('')}
    </div>
  `;
  setHtmlIfChanged(abilityPanel, 'abilityPanelHtml', html);
}

function renderHudBottom() {
  renderAbilityPanel();
  if (!hudBottom) return;
  ensurePlayerCombatStats(player);
  const html = `
    <div class="hud-bottom-panel">
      <div class="hud-bottom-row">
        <div class="hud-slot"><span class="hud-slot-key">${codeLabel(getActionCodes('slot1')[0] ?? 'Digit1')}</span><span>${t('slotFood')}</span><span class="hud-slot-count">${player.food}</span></div>
        <div class="hud-slot"><span class="hud-slot-key">${codeLabel(getActionCodes('slot2')[0] ?? 'Digit2')}</span><span>${t('slotSlow')}</span><span class="hud-slot-count">${player.consumables.slow_time}</span></div>
        <div class="hud-slot"><span class="hud-slot-key">${codeLabel(getActionCodes('slot3')[0] ?? 'Digit3')}</span><span>${t('slotTeleport')}</span><span class="hud-slot-count">${player.consumables.teleport}</span></div>
        <div class="hud-slot"><span class="hud-slot-key">${codeLabel(getActionCodes('slot4')[0] ?? 'Digit4')}</span><span>${t('slotPlatform')}</span><span class="hud-slot-count">${player.consumables.mini_platform}</span></div>
        <div class="hud-slot"><span class="hud-slot-key">${codeLabel(getActionCodes('slot5')[0] ?? 'Digit5')}</span><span>${t('slotCamouflage')}</span><span class="hud-slot-count">${player.consumables.camouflage}</span></div>
      </div>
    </div>
  `;
  setHtmlIfChanged(hudBottom, 'hudBottomHtml', html);
}

function renderHudPair() {
  renderHud();
  renderHudBottom();
  gameState.hudRefreshTimer = HUD_REFRESH_INTERVAL;
}

function renderHudIfDue(dt) {
  gameState.hudRefreshTimer -= dt;
  if (gameState.hudRefreshTimer > 0) return;
  renderHudPair();
}

// --- Update logico (timestep fisso) ---
function update(/* dt */) {
  updateAmbientMusicMix();
  if (cloneState.endKind) {
    renderHudIfDue(FIXED_DT);
    endTick();
    return;
  }

  if (gameState.paused) {
    renderHudIfDue(FIXED_DT);
    endTick();
    return;
  }

  updateWorldTimers(FIXED_DT);
  activateMinibossLockIfNeeded(currentRoom);
  if (gameState.playerStopTimer > 0) {
    player.vx = 0;
    player.vy = 0;
    player.dashTimer = 0;
    player.stopRun();
  } else {
    const playerDt = gameState.playerSlowTimer > 0 ? FIXED_DT * CONSUMABLE.SLOW_FACTOR : FIXED_DT;
    player.update(playerDt, getCurrentSolids(), { weaponsLocked: gameState.shieldTimer > 0 });
    playQueuedPlayerFeedback();
    handleAbilityInputs();
  }
  checkRoomTransition();
  updateCheckpointActivation();
  updateCloneSystem(FIXED_DT);
  updateDormantReviversThrottled(FIXED_DT);
  updateRoomCombat(FIXED_DT);
  updateAdjacentRoomSimulation(FIXED_DT);
  renderHudIfDue(FIXED_DT);
  endTick();
}

function renderCanvasBackdrop() {
  ctx.fillStyle = COLORS.LETTERBOX;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const ratio = window.devicePixelRatio || 1;
  const grid = 40 * ratio;
  ctx.save();
  ctx.lineWidth = ratio;
  ctx.strokeStyle = 'rgba(122, 240, 255, 0.075)';
  ctx.beginPath();
  for (let x = 0.5 * ratio; x < canvas.width; x += grid) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
  }
  for (let y = 0.5 * ratio; y < canvas.height; y += grid) {
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 209, 102, 0.035)';
  ctx.beginPath();
  for (let x = grid / 2; x < canvas.width; x += grid) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
  }
  for (let y = grid / 2; y < canvas.height; y += grid) {
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
  }
  ctx.stroke();
  ctx.restore();
}

function interactionPromptText() {
  const key = codeLabel(getActionCodes('interact')[0] ?? 'KeyC');
  return t('interactionHint', { key });
}

function renderInteractionPrompt(ctx, cx, bottomY, color) {
  const text = interactionPromptText();
  ctx.save();
  ctx.font = '8px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const padX = 8;
  const width = Math.min(220, Math.max(92, Math.ceil(ctx.measureText(text).width + padX * 2)));
  const height = 18;
  const x = Math.max(WALL_THICKNESS + 4, Math.min(cx - width / 2, ROOM_W - WALL_THICKNESS - width - 4));
  const y = Math.max(WALL_THICKNESS + 6, bottomY - height);
  ctx.fillStyle = 'rgba(5, 8, 15, 0.82)';
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
  ctx.fillStyle = color;
  ctx.fillRect(x + 4, y + height - 3, width - 8, 1);
  ctx.fillStyle = '#f4f7ff';
  ctx.fillText(text, x + width / 2, y + height / 2 + 0.5);
  ctx.restore();
}

function renderInteractionPrompts(ctx) {
  const checkpoint = getInteractableCheckpoint();
  if (checkpoint) {
    renderInteractionPrompt(
      ctx,
      checkpoint.x + checkpoint.w / 2,
      checkpoint.y - 8,
      COLORS.CHECKPOINT,
    );
  }

  if (currentRoom.meta.npc && getInteractableNpc()) {
    const npc = npcPoint();
    renderInteractionPrompt(
      ctx,
      npc.x,
      npc.y - npc.h / 2 - 8,
      COLORS.NPC,
    );
  }

  const benefactor = getInteractableBenefactor();
  if (benefactor) {
    renderInteractionPrompt(
      ctx,
      benefactor.x + benefactor.w / 2,
      benefactor.y - 8,
      COLORS.NPC_BENEFACTOR,
    );
  }

  const sign = getInteractableSign();
  if (sign) {
    renderInteractionPrompt(
      ctx,
      sign.x + sign.w / 2,
      sign.y - 8,
      COLORS.CHECKPOINT,
    );
  }
}

// --- Render con interpolazione ---
function render(alpha) {
  // Letterbox: disegna un fondale coerente anche nelle fasce esterne.
  renderCanvasBackdrop();

  const scale = Math.min(canvas.width / ROOM_W, canvas.height / ROOM_H);
  const offX = (canvas.width  - ROOM_W * scale) / 2;
  const offY = (canvas.height - ROOM_H * scale) / 2;
  const shake = screenShakeOffset();

  ctx.save();
  ctx.translate(offX + shake.x, offY + shake.y);
  ctx.scale(scale, scale);

  // Stanza (sfondo + solidi + evidenziatori porte + label id).
  currentRoom.render(ctx, COLORS);
  renderCheckpointState(ctx);
  renderMinibossLock(ctx, currentRoom);

  const roomState = getRoomState(currentRoom);
  for (const platform of roomState.tempPlatforms) {
    drawTemporaryPlatform(ctx, platform);
  }

  if (gameState.teleportAnchor?.roomId === currentRoom.id) {
    drawTeleportAnchor(ctx, gameState.teleportAnchor, player.w, player.h);
  }

  if (gameState.stopTimer > 0) {
    ctx.fillStyle = COLORS.STOP_FIELD;
    ctx.fillRect(WALL_THICKNESS, WALL_THICKNESS, ROOM_W - WALL_THICKNESS * 2, ROOM_H - WALL_THICKNESS * 2);
  }

  renderBenefactor(ctx);
  for (const pickup of roomState.pickups) pickup.render(ctx);
  for (const enemy of roomState.enemies) enemy.render(ctx, alpha);
  for (const projectile of roomState.playerProjectiles) drawPlayerProjectile(ctx, projectile);
  for (const projectile of roomState.projectiles) projectile.render(ctx);

  // Player interpolato.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, ROOM_W, ROOM_H);
  ctx.clip();
  player.render(ctx, alpha, getCurrentSolids(), { camouflaged: gameState.camouflageTimer > 0 });
  if (gameState.shieldTimer > 0) {
    drawShieldAura(ctx, player);
  }
  ctx.restore();
  renderInteractionPrompts(ctx);

  renderMinimap(ctx, maze, minimapState, {
    x: ROOM_W - 72 - 20,
    y: 20,
    w: 72,
    h: 72,
  }, {
    colors: { path: COLORS.MINIMAP_PATH },
    local: true,
    radius: 2,
    gap: 1,
    padding: 6,
    pathWidth: 1.2,
  });

  if (fullMapOpen) {
    const bounds = {
      x: 12,
      y: 12,
      w: ROOM_W - 24,
      h: ROOM_H - 24,
    };
    renderMinimap(ctx, maze, minimapState, bounds, {
      colors: { path: COLORS.MINIMAP_PATH },
      gap: 6,
      padding: 26,
      pathWidth: 3,
      pathAlpha: 1,
      panelFill: 'rgba(5, 6, 14, 0.88)',
    });
    renderMinimapLegend(ctx, bounds);
  }

  if (debugGraphOpen) renderDebugGraph(ctx);
  renderNotifications(ctx);
  if (gameState.controlsBoardOpen) renderControlsBoardOverlay(ctx);
  if (gameState.pauseMenuOpen) renderPauseOverlay(ctx);
  if (cloneState.endKind) renderRunEndOverlay(ctx);

  ctx.restore();
}

function renderNotifications(ctx) {
  const now = performance.now() / 1000;
  gameState.notifications = gameState.notifications.filter((item) => now - item.start < item.duration);
  if (gameState.notifications.length === 0) return;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let stackY = 58;
  const maxPanelWidth = ROOM_W - 72;
  const minPanelWidth = 260;
  const padX = 20;
  const padY = 11;
  const titleFont = '12px ui-monospace, Menlo, monospace';
  const subtitleFont = '9px ui-monospace, Menlo, monospace';
  for (let i = 0; i < gameState.notifications.length; i += 1) {
    const item = gameState.notifications[i];
    ctx.font = titleFont;
    const titleLines = wrapCanvasText(ctx, item.title, maxPanelWidth - padX * 2);
    ctx.font = subtitleFont;
    const subtitleLines = item.subtitle
      ? wrapCanvasText(ctx, item.subtitle, maxPanelWidth - padX * 2)
      : [];
    ctx.font = titleFont;
    const titleWidth = measureCanvasLines(ctx, titleLines);
    ctx.font = subtitleFont;
    const subtitleWidth = measureCanvasLines(ctx, subtitleLines);
    const width = Math.min(
      maxPanelWidth,
      Math.max(minPanelWidth, Math.ceil(Math.max(titleWidth, subtitleWidth) + padX * 2)),
    );
    const titleLineH = 15;
    const subtitleLineH = 12;
    const contentH = titleLines.length * titleLineH + subtitleLines.length * subtitleLineH + (subtitleLines.length > 0 ? 4 : 0);
    const height = Math.max(38, contentH + padY * 2);
    const age = now - item.start;
    const enter = Math.min(1, age / 0.32);
    const exit = Math.min(1, (item.duration - age) / 0.42);
    const alpha = Math.max(0, Math.min(enter, exit));
    const slide = (1 - easeOutCubic(enter)) * -28 + (1 - exit) * 14;
    const y = stackY + height / 2 + slide;
    const x = ROOM_W / 2 - width / 2;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(5, 8, 15, 0.82)';
    ctx.fillRect(x, y - height / 2, width, height);
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x + 0.5, y - height / 2 + 0.5, width - 1, height - 1);
    ctx.fillStyle = item.color;
    ctx.fillRect(x, y - height / 2, 4, height);
    ctx.fillRect(x + width - 4, y - height / 2, 4, height);
    ctx.fillStyle = '#f4f7ff';
    ctx.font = titleFont;
    let textY = y - height / 2 + padY + titleLineH / 2;
    for (const line of titleLines) {
      ctx.fillText(line, ROOM_W / 2, textY);
      textY += titleLineH;
    }
    if (subtitleLines.length > 0) textY += 4;
    ctx.fillStyle = '#9aa7c5';
    ctx.font = subtitleFont;
    for (const line of subtitleLines) {
      ctx.fillText(line, ROOM_W / 2, textY);
      textY += subtitleLineH;
    }
    stackY += height + 10;
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function measureCanvasLines(ctx, lines) {
  return lines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0);
}

function wrapCanvasText(ctx, text, maxWidth) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    if (ctx.measureText(word).width <= maxWidth) {
      line = word;
      continue;
    }
    const chunks = breakCanvasWord(ctx, word, maxWidth);
    lines.push(...chunks.slice(0, -1));
    line = chunks[chunks.length - 1] ?? '';
  }

  if (line) lines.push(line);
  return lines;
}

function breakCanvasWord(ctx, word, maxWidth) {
  const chunks = [];
  let chunk = '';
  for (const char of Array.from(word)) {
    const candidate = `${chunk}${char}`;
    if (chunk && ctx.measureText(candidate).width > maxWidth) {
      chunks.push(chunk);
      chunk = char;
    } else {
      chunk = candidate;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

function easeOutCubic(value) {
  const t = Math.max(0, Math.min(1, value));
  return 1 - (1 - t) ** 3;
}

function renderMinimapLegend(ctx, bounds) {
  const unlocked = minimapState.legendUnlocked ?? new Set();
  const entries = [
    ['prime', t('legendPrime'), DISCOVERY_COLORS.prime],
    ['checkpoint', t('legendCheckpoint'), DISCOVERY_COLORS.checkpoint],
    ['merchant', t('legendMerchant'), DISCOVERY_COLORS.merchant],
    ['boss', t('legendBoss'), DISCOVERY_COLORS.boss],
    ['clone', t('legendClone'), DISCOVERY_COLORS.clone],
  ].filter(([key]) => key === 'prime' || unlocked.has(key));

  const panelW = 128;
  const rowH = 16;
  const panelH = 24 + entries.length * rowH;
  const x = bounds.x + bounds.w - panelW - 12;
  const y = bounds.y + 14;
  ctx.save();
  ctx.fillStyle = 'rgba(8, 12, 21, 0.88)';
  ctx.fillRect(x, y, panelW, panelH);
  ctx.strokeStyle = 'rgba(122, 240, 255, 0.28)';
  ctx.strokeRect(x + 0.5, y + 0.5, panelW - 1, panelH - 1);
  ctx.fillStyle = '#f0f3ff';
  ctx.font = '10px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(t('minimapLegend'), x + 9, y + 12);
  ctx.font = '9px ui-monospace, Menlo, monospace';
  for (let i = 0; i < entries.length; i += 1) {
    const [, label, color] = entries[i];
    const rowY = y + 26 + i * rowH;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + 12, rowY, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#cbd5ee';
    ctx.fillText(label, x + 22, rowY + 0.5);
  }
  ctx.restore();
}

function renderRunEndOverlay(ctx) {
  const victory = cloneState.endKind === 'victory';
  const revealed = performance.now() >= gameState.endRevealAt;
  renderMenuOverlay(ctx, {
    title: victory ? t('victoryTitle') : t('gameOverTitle'),
    message: revealed
      ? t(cloneState.endMessageKey, cloneState.endMessageParams)
      : (victory ? t('toastVictoryPrompt') : t('toastGameOverPrompt')),
    accent: victory ? COLORS.CLONE_SUPER : COLORS.MINIBOSS_LOCK,
    details: '',
    secondary: victory ? t('victorySecondary') : t('gameOverSecondary'),
    actions: revealed ? currentOverlayActions() : [],
  });
}

function renderControlsBoardOverlay(ctx) {
  const labelOf = (action) => {
    const codes = getActionCodes(action);
    if (!codes.length) return '?';
    return codeLabel(codes[0]);
  };
  const lines = [
    t('startHintMove', { left: labelOf('left'), right: labelOf('right') }),
    t('startHintJump', { jump: labelOf('jump') }),
    t('startHintCrouch', { crouch: labelOf('crouch') }),
    t('startHintAttack', { attack: labelOf('attack') }),
    t('startHintSuper', { super: labelOf('super') }),
    t('startHintMap', { map: labelOf('map') }),
    t('startHintInteract', { interact: labelOf('interact') }),
    t('startHintPause', { pause: labelOf('pause') }),
  ];

  const panelW = 380;
  const lineH = 22;
  const padTop = 56;
  const padBottom = 50;
  const panelH = padTop + lines.length * lineH + padBottom;
  const panelX = Math.round(ROOM_W / 2 - panelW / 2);
  const panelY = Math.round(ROOM_H / 2 - panelH / 2);

  ctx.save();
  // Velo scuro
  ctx.fillStyle = 'rgba(5, 6, 14, 0.78)';
  ctx.fillRect(0, 0, ROOM_W, ROOM_H);

  // Pannello
  const gradient = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
  gradient.addColorStop(0, 'rgba(28, 24, 18, 0.98)');
  gradient.addColorStop(1, 'rgba(18, 14, 10, 0.98)');
  ctx.fillStyle = gradient;
  ctx.fillRect(panelX, panelY, panelW, panelH);

  // Bordo legno (cornice)
  ctx.strokeStyle = '#8a6a3e';
  ctx.lineWidth = 2;
  ctx.strokeRect(panelX + 1, panelY + 1, panelW - 2, panelH - 2);
  ctx.strokeStyle = '#3a2a18';
  ctx.lineWidth = 1;
  ctx.strokeRect(panelX + 0.5, panelY + 0.5, panelW - 1, panelH - 1);

  // Riga decorativa sotto il titolo
  ctx.fillStyle = '#8a6a3e';
  ctx.fillRect(panelX + 24, panelY + 38, panelW - 48, 1);

  // Titolo
  ctx.fillStyle = '#f4ecd8';
  ctx.font = 'bold 14px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(t('controlsBoardTitle'), panelX + panelW / 2, panelY + 22);

  // Righe controlli
  ctx.font = '11px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'left';
  for (let i = 0; i < lines.length; i += 1) {
    const y = panelY + padTop + i * lineH + lineH / 2;
    // Pallino di elenco
    ctx.fillStyle = '#8a6a3e';
    ctx.fillRect(panelX + 28, y - 1, 3, 3);
    // Testo
    ctx.fillStyle = '#e8dfc8';
    ctx.fillText(lines[i], panelX + 40, y);
  }

  // Footer (chiudi)
  ctx.font = '10px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#a8997a';
  ctx.fillText(
    t('controlsBoardClose', { interact: labelOf('interact'), pause: labelOf('pause') }),
    panelX + panelW / 2,
    panelY + panelH - 22,
  );

  ctx.restore();
}

function renderPauseOverlay(ctx) {
  renderMenuOverlay(ctx, {
    title: t('pauseTitle'),
    message: t('pauseMessage', { pause: codeLabel(getActionCodes('pause')[0] ?? 'Escape') }),
    accent: COLORS.CHECKPOINT,
    details: '',
    secondary: t('pauseSecondary'),
    actions: currentOverlayActions(),
  });
}

function wrapTextLines(ctx, text, maxWidth) {
  if (!text) return [];
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function renderMenuOverlay(ctx, { title, message, accent, details, secondary, actions }) {
  const actionCount = actions?.length ?? 0;
  gameState.overlayFocusIndex = clampIndex(gameState.overlayFocusIndex, actionCount);
  const { panelWidth, panelTop } = menuOverlayMetrics(actionCount);
  const panelHeight = menuOverlayHeight(actionCount);
  const panelLeft = Math.round(ROOM_W / 2 - panelWidth / 2);
  const innerWidth = panelWidth - 48;

  ctx.save();
  ctx.fillStyle = 'rgba(5, 6, 14, 0.8)';
  ctx.fillRect(0, 0, ROOM_W, ROOM_H);

  const gradient = ctx.createLinearGradient(panelLeft, panelTop, panelLeft + panelWidth, panelTop + panelHeight);
  gradient.addColorStop(0, 'rgba(18, 24, 39, 0.98)');
  gradient.addColorStop(0.55, 'rgba(10, 14, 24, 0.98)');
  gradient.addColorStop(1, 'rgba(24, 20, 30, 0.98)');
  ctx.fillStyle = gradient;
  ctx.fillRect(panelLeft, panelTop, panelWidth, panelHeight);

  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;
  for (let x = panelLeft + 18; x < panelLeft + panelWidth; x += 34) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, panelTop);
    ctx.lineTo(x + 0.5, panelTop + panelHeight);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#323a54';
  ctx.lineWidth = 1;
  ctx.strokeRect(panelLeft + 0.5, panelTop + 0.5, panelWidth - 1, panelHeight - 1);
  ctx.fillStyle = accent;
  ctx.fillRect(panelLeft, panelTop, panelWidth, 4);
  ctx.fillRect(panelLeft + 12, panelTop + 12, 38, 2);
  ctx.fillRect(panelLeft + 12, panelTop + 12, 2, 38);
  ctx.fillRect(panelLeft + panelWidth - 50, panelTop + panelHeight - 14, 38, 2);
  ctx.fillRect(panelLeft + panelWidth - 14, panelTop + panelHeight - 50, 2, 38);

  const cx = ROOM_W / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#f0f3ff';
  ctx.font = '20px ui-monospace, Menlo, monospace';
  ctx.fillText(title, cx, panelTop + 36);

  ctx.fillStyle = '#d8d8e8';
  ctx.font = '12px ui-monospace, Menlo, monospace';
  const messageLines = wrapTextLines(ctx, message ?? '', innerWidth);
  let cursorY = panelTop + 70;
  for (const line of messageLines) {
    ctx.fillText(line, cx, cursorY);
    cursorY += 16;
  }

  ctx.fillStyle = '#8898b8';
  ctx.font = '10px ui-monospace, Menlo, monospace';
  const secondaryLines = wrapTextLines(ctx, secondary ?? '', innerWidth);
  cursorY = Math.max(cursorY + 4, panelTop + 96);
  for (const line of secondaryLines) {
    ctx.fillText(line, cx, cursorY);
    cursorY += 13;
  }

  ctx.font = '12px ui-monospace, Menlo, monospace';
  for (let index = 0; index < actionCount; index += 1) {
    const button = menuButtonRect(index, actionCount);
    const focused = index === gameState.overlayFocusIndex;
    ctx.fillStyle = focused ? '#18263b' : '#101522';
    ctx.fillRect(button.x, button.y, button.w, button.h);
    ctx.strokeStyle = focused ? accent : '#30364c';
    ctx.lineWidth = 1;
    ctx.strokeRect(button.x - 0.5, button.y - 0.5, button.w + 1, button.h + 1);
    if (focused) {
      ctx.fillStyle = accent;
      ctx.fillRect(button.x, button.y, 4, button.h);
    }
    ctx.fillStyle = focused ? '#f0f3ff' : '#d8d8e8';
    ctx.fillText(actions[index].label, cx, button.y + button.h / 2 + 1);
  }

  if (details) {
    ctx.fillStyle = COLORS.LABEL;
    ctx.font = '11px ui-monospace, Menlo, monospace';
    ctx.fillText(details, cx, panelTop + panelHeight - 18);
  }
  ctx.restore();
}

function renderCheckpointState(ctx) {
  if (!currentRoom.meta.checkpoint) return;

  const checkpoint = checkpointPoint();
  const activated = minimapState.activatedCheckpoints.has(currentRoom.id);
  const pulse = Math.max(0, gameState.checkpointPulseTimer);

  drawCheckpointSprite(ctx, checkpoint, activated, pulse);
}

function renderBenefactor(ctx) {
  if (!isBenefactorVisibleInCurrentRoom()) return;
  const npc = benefactorPoint();
  drawNpcSprite(ctx, 'benefactor', npc.x, npc.y, npc.w, npc.h);
}

function renderMinibossLock(ctx, room) {
  if (!isMinibossExitLocked(room)) return;
  for (const lock of minibossLockSolids(room)) {
    ctx.fillStyle = COLORS.MINIBOSS_LOCK;
    ctx.fillRect(lock.x, lock.y, lock.w, lock.h);
    ctx.fillStyle = '#fff0f5';
    if (lock.w >= lock.h) {
      for (let x = lock.x + 4; x < lock.x + lock.w; x += 12) {
        ctx.fillRect(x, lock.y + 4, 5, Math.max(4, lock.h - 8));
      }
    } else {
      for (let y = lock.y + 4; y < lock.y + lock.h; y += 12) {
        ctx.fillRect(lock.x + 4, y, Math.max(4, lock.w - 8), 5);
      }
    }
  }
}

function renderDebugGraph(ctx) {
  const panelX = 74;
  const panelY = 24;
  const panelW = 492;
  const panelH = 312;
  const gridX = panelX + 28;
  const gridY = panelY + 44;
  const cell = 26;
  const gap = 5;
  const step = cell + gap;

  ctx.save();
  ctx.fillStyle = COLORS.DEBUG_OVERLAY;
  ctx.fillRect(panelX, panelY, panelW, panelH);
  ctx.strokeStyle = COLORS.WALL;
  ctx.strokeRect(panelX + 0.5, panelY + 0.5, panelW - 1, panelH - 1);

  ctx.fillStyle = COLORS.LABEL;
  ctx.font = '12px ui-monospace, Menlo, monospace';
  ctx.fillText(`M3 seed: ${maze.seed}`, panelX + 16, panelY + 22);
  ctx.fillText(t('debugStats', {
    dead: maze.stats.deadEnds,
    mid: maze.stats.mid,
    close: t('debugClose'),
  }), panelX + 16, panelY + 38);

  ctx.strokeStyle = COLORS.DOOR;
  ctx.lineWidth = 2;
  for (const cellData of maze.cells.values()) {
    const x = gridX + cellData.x * step + cell / 2;
    const y = gridY + cellData.y * step + cell / 2;
    if (cellData.links.has('E')) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + step, y);
      ctx.stroke();
    }
    if (cellData.links.has('S')) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + step);
      ctx.stroke();
    }
  }

  for (const cellData of maze.cells.values()) {
    const x = gridX + cellData.x * step;
    const y = gridY + cellData.y * step;
    const isCurrent = cellData.id === currentRoom.id;
    ctx.fillStyle = cellData.meta.deadEnd ? COLORS.MINIBOSS : '#25283a';
    if (cellData.id === maze.startId) ctx.fillStyle = '#e8e8f0';
    if (cellData.meta.checkpoint) ctx.fillStyle = COLORS.CHECKPOINT;
    if (cellData.meta.npc) ctx.fillStyle = COLORS.NPC;
    if (cellData.meta.cloneStart) ctx.fillStyle = COLORS.CLONE_START;
    ctx.fillRect(x, y, cell, cell);
    ctx.strokeStyle = isCurrent ? '#ffffff' : '#111422';
    ctx.lineWidth = isCurrent ? 3 : 1;
    ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
  }

  const legendX = gridX + MAZE_SIZE * step + 26;
  const legendY = gridY + 6;
  const legend = [
    [t('debugPlayer'), '#ffffff'],
    [t('debugStart'), '#e8e8f0'],
    [t('debugCheckpoint'), COLORS.CHECKPOINT],
    [t('debugNpc'), COLORS.NPC],
    [t('debugMiniboss'), COLORS.MINIBOSS],
    [t('debugCloneStart'), COLORS.CLONE_START],
  ];
  ctx.font = '11px ui-monospace, Menlo, monospace';
  for (let i = 0; i < legend.length; i += 1) {
    const [label, color] = legend[i];
    const y = legendY + i * 20;
    ctx.fillStyle = color;
    ctx.fillRect(legendX, y - 9, 12, 12);
    ctx.fillStyle = COLORS.LABEL;
    ctx.fillText(label, legendX + 18, y + 1);
  }

  ctx.restore();
}

refreshLocalizedUi();

// --- Game loop: timestep fisso + accumulator + rendering interpolato ---
let lastTime = performance.now();
let accumulator = 0;

function frame(now) {
  try {
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > MAX_FRAME_DT) dt = MAX_FRAME_DT;
    accumulator += dt;

    while (accumulator >= FIXED_DT) {
      update(FIXED_DT);
      accumulator -= FIXED_DT;
    }

    render(accumulator / FIXED_DT);
  } catch (err) {
    // Una qualsiasi eccezione non gestita dentro il loop romperebbe la
    // catena rAF e farebbe sembrare il gioco "freezato" (e ridurrebbe la
    // musica al solo drone perche tickAmbientMelody smette di girare).
    // Logghiamo invece di morire silenziosamente e teniamo viva la rAF.
    console.error('[Echo Maze] frame error', err);
    accumulator = 0;
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
