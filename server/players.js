// Игроки: хранилище, инвентарь/хотбар, операции. Владеет объектом players.
const { PLAYER_MAX_HP, BANK_BASE, BANK_PER_LEVEL, BANK_UPGRADE_COST } = require('./config');
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
    appearance: { skin:'#f3cfa6', hair:'#6e4426', hairStyle:'short', top:'#3f7aa8', bottom:'#5a4636' },
    gold: 0,
    // стартовый инвентарь: топор + комплект брони (чтобы было что надеть)
    inventory: [
      { id: 'axe', qty: 1 }, { id: 'pickaxe', qty: 1 }, { id: 'shovel', qty: 1 },
      { id: 'helmet', qty: 1 }, { id: 'chest', qty: 1 }, { id: 'gloves', qty: 1 },
      { id: 'pants', qty: 1 }, { id: 'boots', qty: 1 }, { id: 'cloak', qty: 1 },
      { id: 'bearHelmet', qty: 1 }, { id: 'ironSword', qty: 1 }, { id: 'ironGreatsword', qty: 1 }, { id: 'ironShield', qty: 1 },
    ],
    hotbar: [null, null, null, null, null, null], // 6 слотов: id предмета или null
    activeSlot: null,  // индекс активного слота хотбара (предмет «в руке»)
    activeInvId: null, // id инструмента, активированного прямо из рюкзака (без переноса в слот)
    // надетая экипировка (id предмета или null) — задел: статы/характеристики добавим позже
    equipment: { helmet: null, chest: null, gloves: null, pants: null, boots: null, cloak: null, mainHand: null, offHand: null },
    target: null,      // id моба, которого бьём
    turn: null,        // 'player' | 'mob' — чей удар
    engaging: null,    // id моба, на которого игрок сам идёт драться (он не бьёт первым)
    gathering: null,   // id ресурс-ноды (дерева), которую рубим
    quests: { story: 0, progress: 0, completed: [], active: {} }, // story-цепочка + npc-квесты (active: id→прогресс)
    skills: skills.defaultSkills(),  // навыки игрока (опыт/уровни)
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

// id предмета «в руке»: из активного слота хотбара ИЛИ инструмент, выбранный прямо в рюкзаке.
function activeTool(p) {
  if (p.activeSlot != null && p.hotbar[p.activeSlot]) return p.hotbar[p.activeSlot].id;
  if (p.activeInvId && hasItem(p, p.activeInvId)) return p.activeInvId;
  return null;
}

// Активировать инструмент прямо из рюкзака (не переносит в слот, только «берёт в руку»). Повторно — снять.
function activateInv(p, invIndex) {
  if (!Number.isInteger(invIndex) || invIndex < 0 || invIndex >= p.inventory.length) return false;
  const item = p.inventory[invIndex];
  if (!item) return false;
  const def = ITEMS[item.id];
  if (!def || def.type !== 'tool') return false;          // «в руку» из рюкзака — только инструмент
  p.activeInvId = (p.activeInvId === item.id) ? null : item.id;
  if (p.activeInvId != null) p.activeSlot = null;          // выбор из рюкзака снимает выбор хотбара
  return true;
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
  if (p.activeInvId === item.id) p.activeInvId = null; // активный инструмент уехал в слот — снять «рюкзачную» активность
  return true;
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
  else { p.hotbar[slot] = null; if (p.activeSlot === slot) p.activeSlot = null; }
  p.inventory[dest] = item;
  return true;
}

// Переместить/обменять предметы внутри рюкзака (drag-n-drop в любую клетку).
function moveItem(p, from, to) { return moveSlot(p.inventory, from, p.inventory, to); }

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

// Суммарная защита от надетой брони
function armorValue(p) {
  let a = 0;
  for (const slot in p.equipment) {
    const id = p.equipment[slot];
    if (id && ITEMS[id]) a += ITEMS[id].armor || 0;
  }
  return a;
}

// Надеть броню/оружие/щит из рюкзака (по индексу). Занятый слот — обмен. Двуручное оружие занимает обе руки.
function equipItem(p, invIndex) {
  if (!Number.isInteger(invIndex) || invIndex < 0 || invIndex >= p.inventory.length) return false;
  const item = p.inventory[invIndex];
  if (!item) return false;
  const def = ITEMS[item.id];
  if (!def || !def.slot || !['armor', 'weapon', 'shield'].includes(def.type)) return false;
  if (!(def.slot in p.equipment)) return false;
  p.inventory[invIndex] = null;                  // освободить клетку (снятое вернётся в неё или в свободную)
  const back = (id) => { if (id) { const e = firstEmpty(p); if (e >= 0) p.inventory[e] = { id, qty: 1 }; } };
  // Двуручное оружие — освободить вторую руку; щит/одноручное — снять двуручное, если оно надето
  if (def.slot === 'mainHand' && def.hands === 2) { back(p.equipment.offHand); p.equipment.offHand = null; }
  if (def.slot === 'offHand') { const mh = ITEMS[p.equipment.mainHand]; if (mh && mh.hands === 2) { back(p.equipment.mainHand); p.equipment.mainHand = null; } }
  const prev = p.equipment[def.slot];
  p.equipment[def.slot] = item.id;
  back(prev);
  return true;
}

// Бонус урона от оружия в правой руке
function weaponDamage(p) {
  const w = p.equipment.mainHand;
  return (w && ITEMS[w] && ITEMS[w].damage) || 0;
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
    inventory: p.inventory, hotbar: p.hotbar, activeSlot: p.activeSlot,
    activeInvId: p.activeInvId, activeTool: activeTool(p), gold: p.gold,
    equipment: p.equipment, armor: armorValue(p), hp: p.hp, maxHp: p.maxHp,
  };
}

// Смерть → респаун с полным HP в новой точке
function respawn(io, p) {
  const s = world.pickSpawn(p.location);
  p.x = s.x; p.y = s.y; p.hp = PLAYER_MAX_HP;
  p.target = null; p.turn = null; p.gathering = null;
  io.emit('playerRespawn', { id: p.id, x: p.x, y: p.y, hp: p.hp, location: p.location });
}

module.exports = { players, create, remove, count, respawn, addItem, hasItem, countItem, removeItems, craft, eat, activeTool, activateInv, invToHotbar, hotbarToInv, equipItem, unequipItem, armorValue, weaponDamage, moveItem, splitStack, destroyStack,
  bankMove, bankQuick, upgradeBank, bankStateOf, pourFlask, fillFlasks, invState, ITEMS };
