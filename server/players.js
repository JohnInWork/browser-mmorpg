// Игроки: хранилище, инвентарь/хотбар, операции. Владеет объектом players.
const { PLAYER_MAX_HP, BANK_BASE, BANK_PER_LEVEL, BANK_UPGRADE_COST, DEATH_ARMOR_LOSS_CHANCE, DEATH_HOTBAR_LOSS_CHANCE } = require('./config');
const world = require('./world');
const skills = require('./skills');
const ITEMS = require('./data/items.json').items;

const COLORS = ['#e74c3c','#3498db','#2ecc71','#f1c40f','#9b59b6','#e67e22','#1abc9c','#ff6b9d'];

const players = {}; // socketId -> player

// Инвентарь — фиксированные 32 ячейки: {id,qty} или null (пустая клетка).
const INV_SIZE = 32;
function padTo(items, size) { const a = items.slice(0, size); while (a.length < size) a.push(null); return a; }
function padInv(items) { return padTo(items, INV_SIZE); }
function firstEmptyIn(arr) { return arr.findIndex(s => !s); }
function firstEmpty(p) { return firstEmptyIn(p.inventory); }

// Размер банка по уровню апгрейда
function bankSize(level) { return BANK_BASE + (level || 0) * BANK_PER_LEVEL; }

// Универсальный перенос {id,qty}/null между ячейками двух массивов: на пустую / слияние стака / обмен.
function moveSlot(srcArr, srcIdx, dstArr, dstIdx) {
  if (!Number.isInteger(srcIdx) || !Number.isInteger(dstIdx)) return false;
  if (srcIdx < 0 || srcIdx >= srcArr.length || dstIdx < 0 || dstIdx >= dstArr.length) return false;
  if (srcArr === dstArr && srcIdx === dstIdx) return false;
  const a = srcArr[srcIdx];
  if (!a) return false;
  const b = dstArr[dstIdx];
  if (!b) { dstArr[dstIdx] = a; srcArr[srcIdx] = null; return true; }
  const def = ITEMS[a.id];
  if (b.id === a.id && def && def.stackable) { b.qty += a.qty; srcArr[srcIdx] = null; return true; }
  dstArr[dstIdx] = a; srcArr[srcIdx] = b; return true;            // обмен местами
}

function create(id) {
  const location = world.startLocation();
  const spawn = world.pickSpawn(location);     // случайная из расставленных точек спавна (иначе любая клетка)
  const player = {
    id,
    name: 'Игрок',
    location,                       // в какой локации находится игрок
    x: spawn.x, y: spawn.y,
    color: COLORS[Object.keys(players).length % COLORS.length],
    hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP,
    appearance: { skin:'#f3cfa6', hair:'#4a3525', hairStyle:'h1' },
    gold: 0,
    // стартовый инвентарь пуст — всё берётся из Админ-сундука (для тестов)
    inventory: [],
    hotbar: [null, null, null, null, null, null], // 6 слотов: id предмета или null
    // Предметы «в руке» (id предмета или null). Правая: оружие/инструмент. Левая: щит. Предмет остаётся в хотбаре/рюкзаке.
    handR: null,
    handL: null,
    // надетая экипировка — ТОЛЬКО броня (оружие/щит теперь берутся «в руку», см. handR/handL)
    equipment: { helmet: null, chest: null, gloves: null, pants: null, boots: null, cloak: null },
    target: null,      // id моба, которого бьём
    turn: null,        // 'player' | 'mob' — чей удар
    engaging: null,    // id моба, на которого игрок сам идёт драться (он не бьёт первым)
    gathering: null,   // id ресурс-ноды (дерева), которую рубим
    quests: { story: 0, progress: 0, completed: [], active: {} }, // story-цепочка + npc-квесты (active: id→прогресс)
    skills: skills.defaultSkills(),  // навыки игрока (опыт/уровни)
    returnPoint: null,   // точка возврата камня: {location,x,y,name} | null
    returnCdUntil: 0,    // timestamp окончания кулдауна телепорта камнем
  };
  player.inventory = padInv(player.inventory);   // дополнить до 32 ячеек пустыми
  player.bank = { level: 0, slots: padTo([], bankSize(0)) }; // личное хранилище (банк)
  players[id] = player;
  return player;
}

function remove(id) { delete players[id]; }
function count() { return Object.keys(players).length; }

// Добавить предмет в инвентарь (стакается, если stackable). Возвращает false, если нет места.
function addItem(p, id, qty = 1) {
  const def = ITEMS[id];
  if (def && def.stackable) {
    const stack = p.inventory.find(s => s && s.id === id);
    if (stack) { stack.qty += qty; return true; }
  }
  const e = firstEmpty(p);
  if (e < 0) return false;                       // рюкзак полон
  p.inventory[e] = { id, qty };
  return true;
}
function hasItem(p, id) { return p.inventory.some(s => s && s.id === id); }
function countItem(p, id) { let n = 0; for (const s of p.inventory) if (s && s.id === id) n += s.qty || 1; return n; }
function removeItems(p, id, qty) {
  let need = qty;
  for (let i = p.inventory.length - 1; i >= 0 && need > 0; i--) {
    const s = p.inventory[i];
    if (!s || s.id !== id) continue;
    const take = Math.min(need, s.qty || 1);
    s.qty -= take; need -= take;
    if (s.qty <= 0) p.inventory[i] = null;       // освободить клетку (не схлопывать)
  }
}
// Крафт по рецепту {out, outQty, in:[{id,qty}]}: проверка ингредиентов, расход, выдача
function craft(p, recipe) {
  if (!recipe || !recipe.in.every(ing => countItem(p, ing.id) >= ing.qty)) return false;
  recipe.in.forEach(ing => removeItems(p, ing.id, ing.qty));
  addItem(p, recipe.out, recipe.outQty || 1);
  return true;
}

// Есть ли предмет в распоряжении игрока (хотбар или рюкзак) — для валидации «в руке».
function ownsItem(p, id) { return p.hotbar.some(s => s && s.id === id) || hasItem(p, id); }

// Какая рука для предмета: 'L' для щита (offHand), иначе 'R' (оружие/инструмент). null — нельзя взять в руку.
function handFor(def) {
  if (!def) return null;
  if (def.type === 'shield' || def.slot === 'offHand') return 'L';
  if (def.type === 'weapon' || def.type === 'tool') return 'R';
  return null;
}

// Предмет в руке (валидируется владением; иначе очищается). side: 'R' | 'L'.
function handItem(p, side) {
  const key = side === 'L' ? 'handL' : 'handR';
  const id = p[key];
  if (id && ownsItem(p, id)) return id;
  p[key] = null;
  return null;
}

// id предмета «в руке» для добычи/совместимости = правая рука (инструменты держат правой).
function activeTool(p) { return handItem(p, 'R'); }

// Взять предмет «в руку» (по id). Сам предмет остаётся в хотбаре/рюкзаке. Повторно тем же — снять.
// Щит → левая рука; оружие/инструмент → правая; двуручное оружие → правая + освобождает левую.
function wieldId(p, id) {
  const def = ITEMS[id];
  const hand = handFor(def);
  if (!hand || !ownsItem(p, id)) return false;
  if (hand === 'L') {
    const rDef = ITEMS[p.handR];
    if (rDef && rDef.hands === 2) return false;            // двуручное занимает обе руки — щит нельзя
    p.handL = (p.handL === id) ? null : id;
  } else {
    p.handR = (p.handR === id) ? null : id;
    if (p.handR && def.hands === 2) p.handL = null;        // взяли двуручное — освободить левую
  }
  return true;
}
// Взять «в руку» предмет из слота хотбара
function wieldHotbar(p, slot) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= p.hotbar.length) return false;
  const it = p.hotbar[slot];
  return it ? wieldId(p, it.id) : false;
}
// Взять «в руку» предмет прямо из рюкзака (по индексу)
function activateInv(p, invIndex) {
  if (!Number.isInteger(invIndex) || invIndex < 0 || invIndex >= p.inventory.length) return false;
  const item = p.inventory[invIndex];
  return item ? wieldId(p, item.id) : false;
}

// Перенести предмет из рюкзака в слот хотбара (исчезает из рюкзака). Занятый слот — обмен.
function invToHotbar(p, invIndex, slot) {
  if (!Number.isInteger(invIndex) || invIndex < 0 || invIndex >= p.inventory.length) return false;
  if (!Number.isInteger(slot) || slot < 0 || slot >= p.hotbar.length) return false;
  const item = p.inventory[invIndex];
  if (!item) return false;
  const prev = p.hotbar[slot];
  p.hotbar[slot] = item;
  p.inventory[invIndex] = prev || null;          // то, что лежало в слоте, кладём на освободившуюся клетку
  return true;                                    // руки хранятся по id — остаются валидными при перемещении предмета
}

// Вернуть предмет из слота хотбара в рюкзак (в выбранную клетку, иначе в первую свободную).
function hotbarToInv(p, slot, invIndex = null) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= p.hotbar.length) return false;
  const item = p.hotbar[slot];
  if (!item) return false;
  let dest = Number.isInteger(invIndex) && invIndex >= 0 && invIndex < p.inventory.length ? invIndex : firstEmpty(p);
  if (dest < 0) return false;                     // рюкзак полон
  const occ = p.inventory[dest];
  if (occ) { p.hotbar[slot] = occ; }              // занятая клетка — обмен с хотбаром
  else { p.hotbar[slot] = null; }
  p.inventory[dest] = item;
  return true;
}

// Переместить/обменять предметы внутри рюкзака (drag-n-drop в любую клетку).
function moveItem(p, from, to) { return moveSlot(p.inventory, from, p.inventory, to); }
// Переместить/обменять предметы между слотами панели быстрого доступа (хотбар).
function moveHotbar(p, from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= p.hotbar.length || to >= p.hotbar.length) return false;
  return moveSlot(p.hotbar, from, p.hotbar, to);
}

// --- Банк (личное хранилище, общее для всех сундуков) ---
function bankArr(p, which) { return which === 'bank' ? p.bank.slots : p.inventory; }

// Перенос между рюкзаком и банком (или внутри них) перетаскиванием в конкретную клетку.
function bankMove(p, src, from, dst, to) {
  if (!['inv', 'bank'].includes(src) || !['inv', 'bank'].includes(dst)) return false;
  return moveSlot(bankArr(p, src), from, bankArr(p, dst), to);
}

// Быстрый перенос (клик): из одного хранилища в первую свободную/подходящую ячейку другого.
function bankQuick(p, src, index) {
  if (!['inv', 'bank'].includes(src)) return false;
  const from = bankArr(p, src), to = bankArr(p, src === 'inv' ? 'bank' : 'inv');
  const item = from[index];
  if (!item) return false;
  const def = ITEMS[item.id];
  if (def && def.stackable) { const m = to.findIndex(s => s && s.id === item.id); if (m >= 0) return moveSlot(from, index, to, m); }
  const e = firstEmptyIn(to);
  if (e < 0) return false;
  return moveSlot(from, index, to, e);
}

// Апгрейд банка за золото (5 уровней). Возвращает true при успехе.
function upgradeBank(p) {
  const lvl = p.bank.level;
  if (lvl >= BANK_UPGRADE_COST.length) return false;        // максимум
  const cost = BANK_UPGRADE_COST[lvl];
  if (p.gold < cost) return false;
  p.gold -= cost;
  p.bank.level = lvl + 1;
  p.bank.slots = padTo(p.bank.slots, bankSize(p.bank.level)); // дорастить ячейки
  return true;
}

// Снимок банка для клиента
function bankStateOf(p) {
  const nextCost = p.bank.level < BANK_UPGRADE_COST.length ? BANK_UPGRADE_COST[p.bank.level] : null;
  return { slots: p.bank.slots, level: p.bank.level, maxLevel: BANK_UPGRADE_COST.length, perLevel: BANK_PER_LEVEL, nextCost, gold: p.gold };
}

// Съесть еду из рюкзака (по индексу): только type==='food' с heal. Возвращает фактически вылеченное HP (0 — нельзя).
function eat(p, invIndex) {
  if (!Number.isInteger(invIndex) || invIndex < 0 || invIndex >= p.inventory.length) return 0;
  const item = p.inventory[invIndex];
  if (!item) return 0;
  const def = ITEMS[item.id];
  if (!def || def.type !== 'food' || !def.heal) return 0; // сырое/не-еда не лечит (это ингредиент)
  if (p.hp >= p.maxHp) return 0;                          // уже полное HP — не тратим еду
  const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + def.heal);
  removeItems(p, item.id, 1);
  return p.hp - before;
}

// Съесть еду прямо из слота хотбара (по номеру слота). Возвращает вылеченное HP (0 — нельзя).
function eatHotbar(p, slot) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= p.hotbar.length) return 0;
  const item = p.hotbar[slot];
  if (!item) return 0;
  const def = ITEMS[item.id];
  if (!def || def.type !== 'food' || !def.heal) return 0;
  if (p.hp >= p.maxHp) return 0;
  const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + def.heal);
  item.qty -= 1;
  if (item.qty <= 0) { p.hotbar[slot] = null; }
  return p.hp - before;
}

// --- Камень возвращения ---
const RETURN_STONE_ID = 'returnStone';
// Найти камень возвращения у игрока где угодно: рюкзак/банк/хотбар → {store,index} | null
function findReturnStone(p) {
  let i = p.inventory.findIndex(s => s && s.id === RETURN_STONE_ID);
  if (i >= 0) return { store: 'inv', index: i };
  i = p.bank.slots.findIndex(s => s && s.id === RETURN_STONE_ID);
  if (i >= 0) return { store: 'bank', index: i };
  i = p.hotbar.findIndex(s => s && s.id === RETURN_STONE_ID);
  if (i >= 0) return { store: 'hotbar', index: i };
  return null;
}
function ownsReturnStone(p) { return !!findReturnStone(p); }
// Привязать/сменить точку: убрать старый камень откуда угодно и выдать новый в рюкзак.
// { ok:true } | { ok:false, reason:'full' } — если в рюкзаке нет места под новый камень.
function bindReturnStone(p, point) {
  const existing = findReturnStone(p);
  let free = p.inventory.filter(s => !s).length;          // свободных клеток рюкзака
  if (existing && existing.store === 'inv') free += 1;     // старый освободит свою клетку
  if (free < 1) return { ok: false, reason: 'full' };
  if (existing) {
    if (existing.store === 'inv') p.inventory[existing.index] = null;
    else if (existing.store === 'bank') p.bank.slots[existing.index] = null;
    else if (existing.store === 'hotbar') { p.hotbar[existing.index] = null; }
  }
  addItem(p, RETURN_STONE_ID, 1);                          // не стакается → в первую свободную клетку рюкзака
  p.returnPoint = { location: point.location, x: point.x, y: point.y, name: String(point.name || 'Точка возврата') };
  return { ok: true };
}

// Суммарная защита: надетая броня + щит в левой руке
function armorValue(p) {
  let a = 0;
  for (const slot in p.equipment) {
    const id = p.equipment[slot];
    if (id && ITEMS[id]) a += ITEMS[id].armor || 0;
  }
  const sh = handItem(p, 'L');                    // щит в левой руке тоже даёт защиту
  if (sh && ITEMS[sh]) a += ITEMS[sh].armor || 0;
  return a;
}

// Надеть БРОНЮ из рюкзака (по индексу). Занятый слот — обмен. (Оружие/щит теперь «в руку», см. wieldId.)
function equipItem(p, invIndex) {
  if (!Number.isInteger(invIndex) || invIndex < 0 || invIndex >= p.inventory.length) return false;
  const item = p.inventory[invIndex];
  if (!item) return false;
  const def = ITEMS[item.id];
  if (!def || def.type !== 'armor' || !def.slot || !(def.slot in p.equipment)) return false;
  p.inventory[invIndex] = null;                  // освободить клетку (снятое вернётся в неё или в свободную)
  const prev = p.equipment[def.slot];
  p.equipment[def.slot] = item.id;
  if (prev) { const e = firstEmpty(p); if (e >= 0) p.inventory[e] = { id: prev, qty: 1 }; }
  return true;
}

// Надеть БРОНЮ прямо из слота хотбара (по номеру слота). Снятое возвращается в тот же слот (свап).
function equipHotbar(p, slot) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= p.hotbar.length) return false;
  const item = p.hotbar[slot];
  if (!item) return false;
  const def = ITEMS[item.id];
  if (!def || def.type !== 'armor' || !def.slot || !(def.slot in p.equipment)) return false;
  const prev = p.equipment[def.slot];
  p.equipment[def.slot] = item.id;
  p.hotbar[slot] = prev ? { id: prev, qty: 1 } : null;   // снятое — обратно в этот слот хотбара (свап)
  return true;
}

// Бонус урона от оружия в правой руке (инструмент урона не даёт)
function weaponDamage(p) {
  const w = handItem(p, 'R');
  return (w && ITEMS[w] && ITEMS[w].type === 'weapon' && ITEMS[w].damage) || 0;
}

// Снять предмет из слота брони в рюкзак (в первую свободную клетку)
function unequipItem(p, slot) {
  if (!p.equipment[slot]) return false;
  const e = firstEmpty(p);
  if (e < 0) return false;                       // рюкзак полон — некуда снять
  p.inventory[e] = { id: p.equipment[slot], qty: 1 };
  p.equipment[slot] = null;
  return true;
}

// Разделить стак: отнять amount у стака и положить новый стак в свободную клетку
function splitStack(p, invIndex, amount) {
  if (!Number.isInteger(invIndex) || invIndex < 0 || invIndex >= p.inventory.length) return false;
  const s = p.inventory[invIndex];
  amount = Math.floor(Number(amount));
  if (!s || !(s.qty > 1) || !(amount >= 1) || amount >= s.qty) return false;
  const e = firstEmpty(p);
  if (e < 0) return false;                        // нет свободной клетки под новый стак
  s.qty -= amount;
  p.inventory[e] = { id: s.id, qty: amount };
  return true;
}

// Вылить содержимое колбы (waterFlask → emptyFlask) по полю pourTo. Возвращает true при успехе.
function pourFlask(p, invIndex) {
  if (!Number.isInteger(invIndex) || invIndex < 0 || invIndex >= p.inventory.length) return false;
  const s = p.inventory[invIndex];
  if (!s) return false;
  const to = ITEMS[s.id] && ITEMS[s.id].pourTo;
  if (!to) return false;
  s.id = to;                       // тот же стак, тот же объём — просто опустошили
  return true;
}

// Наполнить все пустые колбы водой у колодца (emptyFlask → waterFlask). Возвращает число наполненных колб.
function fillFlasks(p) {
  let n = 0;
  for (const s of p.inventory) {
    if (s && s.id === 'emptyFlask') { n += s.qty || 1; s.id = 'waterFlask'; }
  }
  return n;
}

// Уничтожить стак целиком (клетка становится пустой)
function destroyStack(p, invIndex) {
  if (!Number.isInteger(invIndex) || invIndex < 0 || invIndex >= p.inventory.length) return false;
  if (!p.inventory[invIndex]) return false;
  p.inventory[invIndex] = null;
  return true;
}

// Снимок инвентаря/экипировки/статов для клиента
function invState(p) {
  return {
    inventory: p.inventory, hotbar: p.hotbar,
    handR: handItem(p, 'R'), handL: handItem(p, 'L'), gold: p.gold,
    equipment: p.equipment, armor: armorValue(p), hp: p.hp, maxHp: p.maxHp,
    returnPoint: p.returnPoint, returnCdUntil: p.returnCdUntil,
  };
}

// Штраф за смерть: рюкзак теряется ПОЛНОСТЬЮ. Отдельными бросками — шанс потерять 1 предмет брони
// и шанс потерять 1 предмет из хотбара (независимо). Возвращает имена потерянного для окна смерти.
function applyDeathPenalty(p) {
  for (let i = 0; i < p.inventory.length; i++) p.inventory[i] = null;   // весь рюкзак — всегда
  let lostArmor = null, lostHotbar = null;
  // бросок по броне (слоты экипировки)
  if (Math.random() < DEATH_ARMOR_LOSS_CHANCE) {
    const slots = Object.keys(p.equipment).filter(s => p.equipment[s]);
    if (slots.length) {
      const slot = slots[Math.floor(Math.random() * slots.length)];
      const id = p.equipment[slot]; p.equipment[slot] = null;
      lostArmor = (ITEMS[id] && ITEMS[id].name) || id;
    }
  }
  // отдельный бросок по панели быстрого доступа (хотбар)
  if (Math.random() < DEATH_HOTBAR_LOSS_CHANCE) {
    const idxs = []; p.hotbar.forEach((it, i) => { if (it) idxs.push(i); });
    if (idxs.length) {
      const i = idxs[Math.floor(Math.random() * idxs.length)];
      const id = p.hotbar[i].id; p.hotbar[i] = null;
      lostHotbar = (ITEMS[id] && ITEMS[id].name) || id;
    }
  }
  handItem(p, 'R'); handItem(p, 'L');   // подчистят руку, если предмет исчез
  return { lostArmor, lostHotbar };
}

// Смерть → штраф + респаун с полным HP в точке спавна
function respawn(io, p) {
  const { lostArmor, lostHotbar } = applyDeathPenalty(p);
  const s = world.pickSpawn(p.location);
  p.x = s.x; p.y = s.y; p.hp = PLAYER_MAX_HP;
  p.target = null; p.turn = null; p.gathering = null;
  io.emit('playerRespawn', { id: p.id, x: p.x, y: p.y, hp: p.hp, location: p.location });
  io.to(p.id).emit('inventoryUpdate', invState(p));                 // обновить рюкзак/хотбар/броню владельцу
  io.emit('playerEquipment', { id: p.id, equipment: p.equipment }); // другие видят изменившуюся броню
  io.emit('playerHands', { id: p.id, right: handItem(p, 'R'), left: handItem(p, 'L') }); // предметы в руках
  io.to(p.id).emit('youDied', { lostArmor, lostHotbar });           // окно смерти у погибшего
}

module.exports = { players, create, remove, count, respawn, addItem, hasItem, countItem, removeItems, craft, eat, activeTool, handItem, activateInv, wieldId, wieldHotbar, invToHotbar, hotbarToInv, equipItem, unequipItem, armorValue, weaponDamage, moveItem, splitStack, destroyStack,
  bankMove, bankQuick, upgradeBank, bankStateOf, pourFlask, fillFlasks, invState, ITEMS,
  ownsReturnStone, bindReturnStone, RETURN_STONE_ID, eatHotbar, moveHotbar, equipHotbar };
