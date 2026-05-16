import { PLAYER, SHOP } from '../config.js';
import { itemName, t } from '../i18n.js';
import { addStack, canAddStack, normalizeStackableInventory } from '../systems/inventory.js';
import { Rng } from '../utils/rng.js';

export const NPCS = {
  healer: {
    type: 'healer',
    name: 'Guaritore',
    role: 'Vite e cibo',
  },
  mystic: {
    type: 'mystic',
    name: 'Mistico',
    role: 'Abilita',
  },
  armorer: {
    type: 'armorer',
    name: 'Armaiolo',
    role: 'Consumabili',
  },
  blacksmith: {
    type: 'blacksmith',
    name: 'Fabbro',
    role: 'Upgrade arma',
  },
};

export const ABILITIES = [
  { id: 'double_jump', name: 'Doppio salto' },
  { id: 'wall_jump', name: 'Wall jump' },
  { id: 'run', name: 'Corsa' },
  { id: 'dash', name: 'Scatto' },
  { id: 'shield', name: 'Scudo' },
  { id: 'ranged_weapon', name: 'Arma a distanza' },
  { id: 'ground_slam', name: 'Schianto a terra' },
  { id: 'coin_multiplier', name: 'Moltiplicatore monete' },
  { id: 'coin_retention', name: 'Salvamonete' },
  { id: 'stop', name: 'Stop' },
];

export const CONSUMABLES = [
  { id: 'slow_time', name: 'Rallentatore' },
  { id: 'teleport', name: 'Teletrasporto' },
  { id: 'mini_platform', name: 'Mini-piattaforma' },
  { id: 'camouflage', name: 'Mimetizzazione' },
];

function cloneItem(item) {
  return { ...item };
}

function pricedAbility(ability, rng) {
  return {
    id: `ability:${ability.id}`,
    type: 'ability',
    abilityId: ability.id,
    name: ability.name,
    description: "Sblocca l'effetto abilita durante il gameplay.",
    price: SHOP.ABILITY_PRICES?.[ability.id] ?? rng.int(SHOP.ABILITY_PRICE_MIN, SHOP.ABILITY_PRICE_MAX),
    stock: 1,
  };
}

function pricedConsumable(consumable, rng) {
  const stock = rng.int(2, 5);
  return {
    id: `consumable:${consumable.id}`,
    type: 'consumable',
    consumableId: consumable.id,
    name: consumable.name,
    description: 'Consumabile usabile dagli slot rapidi.',
    price: SHOP.CONSUMABLE_PRICES?.[consumable.id] ?? rng.int(SHOP.CONSUMABLE_PRICE_MIN, SHOP.CONSUMABLE_PRICE_MAX),
    stock,
    maxStock: stock,
    restockable: true,
    restockTimer: 0,
  };
}

function weaponUpgradeDescription(level) {
  const descriptions = {
    2: 'Allunga la gittata della lama.',
    3: 'Riduce il tempo tra due colpi.',
    4: 'Aumenta il danno della lama.',
    5: 'Aggiunge veleno per 3 secondi: non si somma mentre e gia attivo.',
  };
  return descriptions[level] ?? `Potenzia l'arma al livello ${level}.`;
}

function superUpgradeDescription(level) {
  const descriptions = {
    2: 'Riduce il caricamento della super barra.',
    3: 'Aumenta il danno della super arma.',
  };
  return descriptions[level] ?? `Potenzia la super arma al livello ${level}.`;
}

export function createShopInventories(seed, options = {}) {
  const rng = new Rng(`${seed}:shops`);
  const mysticAbilityIds = options.mysticAbilityIds
    ? new Set(options.mysticAbilityIds)
    : null;
  const abilityPool = mysticAbilityIds
    ? ABILITIES.filter((ability) => mysticAbilityIds.has(ability.id))
    : ABILITIES;
  const abilities = rng.shuffle(abilityPool.map(cloneItem));
  const consumables = rng.shuffle(CONSUMABLES.map(cloneItem));

  function createHealerInventory(label) {
    const foodStock = rng.int(5, 9);
    return [
      {
        id: 'life_slot',
        type: 'life_slot',
        name: 'Slot vita',
        description: 'Aumenta le vite massime di 1 e ricarica il nuovo slot.',
        price: SHOP.LIFE_SLOT_COST,
        stock: PLAYER.MAX_LIFE_SLOTS - PLAYER.START_LIFE_SLOTS,
      },
      {
        id: 'food',
        type: 'food',
        name: 'Cibo',
        description: 'Cura 1 vita. Stackabile.',
        price: SHOP.FOOD_COST,
        stock: foodStock,
        maxStock: foodStock,
        restockable: true,
        restockTimer: 0,
      },
    ].map((item) => ({ ...item, shopKey: label }));
  }

  const inventories = {
    healer: createHealerInventory('healer'),
    'healer:1': createHealerInventory('healer:1'),
    'healer:2': createHealerInventory('healer:2'),
    mystic: abilities.map((ability) => pricedAbility(ability, rng)),
    armorer: consumables.map((consumable) => pricedConsumable(consumable, rng)),
    blacksmith: [
      ...[2, 3, 4, 5].map((level) => ({
        id: `weapon:${level}`,
        type: 'weapon_upgrade',
        targetLevel: level,
        name: `Arma L${level}`,
        description: weaponUpgradeDescription(level),
        price: SHOP.WEAPON_UPGRADE_COSTS[level],
        stock: 1,
      })),
      ...[2, 3].map((level) => ({
        id: `super:${level}`,
        type: 'super_upgrade',
        targetLevel: level,
        name: `Super arma L${level}`,
        description: superUpgradeDescription(level),
        price: SHOP.SUPER_WEAPON_UPGRADE_COSTS[level],
        stock: 1,
      })),
    ],
  };

  return inventories;
}

export function ensureShopInventory(player) {
  player.abilities ??= [];
  normalizeStackableInventory(player, CONSUMABLES);
  player.superWeaponLevel ??= 1;
  for (const consumable of CONSUMABLES) {
    player.consumables[consumable.id] ??= 0;
  }
}

function startRestockTimer(item) {
  if (!item.restockable || item.stock >= item.maxStock) return;
  if (!item.restockTimer || item.restockTimer <= 0) item.restockTimer = SHOP.RESTOCK_TIME;
}

export function updateShopRestock(inventories, dt) {
  for (const inventory of Object.values(inventories)) {
    for (const item of inventory) {
      if (!item.restockable || item.stock >= item.maxStock) continue;
      startRestockTimer(item);
      item.restockTimer -= dt;
      if (item.restockTimer > 0) continue;
      item.stock = Math.min(item.maxStock, item.stock + 1);
      item.restockTimer = item.stock < item.maxStock ? SHOP.RESTOCK_TIME : 0;
    }
  }
}

function validatePurchase(player, gameState, item) {
  ensureShopInventory(player);
  if (!item) return t('errorUnavailable');
  if (item.stock <= 0) return t('errorSoldOut');
  if (item.type === 'food' && !canAddStack(player, 'food')) {
    return t('errorStackFull');
  }
  if (item.type === 'consumable' && !canAddStack(player, 'consumable', item.consumableId)) {
    return t('errorStackFull');
  }
  if (player.coins < item.price) return t('errorCoins');

  if (item.type === 'life_slot' && player.maxLifeSlots >= gameState.lifeSlotCap) {
    return t('errorLifeCap');
  }
  if (item.type === 'ability' && player.abilities.includes(item.abilityId)) {
    return t('errorAbilityBought');
  }
  if (item.type === 'weapon_upgrade' && player.weaponLevel >= item.targetLevel) {
    return t('errorUpgradeBought');
  }
  if (item.type === 'weapon_upgrade' && player.weaponLevel !== item.targetLevel - 1) {
    return t('errorNeedWeapon', { level: item.targetLevel - 1 });
  }
  if (item.type === 'super_upgrade' && player.superWeaponLevel >= item.targetLevel) {
    return t('errorUpgradeBought');
  }
  if (item.type === 'super_upgrade' && player.superWeaponLevel !== item.targetLevel - 1) {
    return t('errorNeedSuper', { level: item.targetLevel - 1 });
  }

  return null;
}

export function buyShopItem(player, gameState, item) {
  const reason = validatePurchase(player, gameState, item);
  if (reason) return { ok: false, message: reason };

  player.coins -= item.price;
  item.stock -= 1;
  startRestockTimer(item);

  if (item.type === 'life_slot') {
    player.maxLifeSlots = Math.min(gameState.lifeSlotCap, player.maxLifeSlots + 1);
    player.currentLife = player.maxLifeSlots;
  } else if (item.type === 'food') {
    addStack(player, 'food');
  } else if (item.type === 'ability') {
    player.abilities.push(item.abilityId);
  } else if (item.type === 'consumable') {
    addStack(player, 'consumable', item.consumableId);
  } else if (item.type === 'weapon_upgrade') {
    player.weaponLevel = item.targetLevel;
  } else if (item.type === 'super_upgrade') {
    player.superWeaponLevel = item.targetLevel;
  }

  return { ok: true, message: t('buySuccess', { item: itemName(item) }) };
}

export function itemStatus(player, gameState, item) {
  return validatePurchase(player, gameState, item);
}
