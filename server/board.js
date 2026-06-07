// Доска объявлений: генерируемые квесты, отдельные от НПС-квестов.
// Отличия от НПС-квестов: НЕ нужно сдавать (авто-завершение по факту действия),
// ресурсы НЕ забираются, награда — только золото. Считаются только действия игрока
// «своими руками»: craft — что он скрафтил, gather — что добыл/выловил, kill — кого убил.
// Покупка/лут с мобов в зачёт НЕ идут (хуки стоят именно на крафте/добыче/убийстве).
const fs = require('fs');
const path = require('path');

const REFRESH_MS = 5 * 60 * 1000;   // обновление слотов доски раз в 5 минут
const SLOTS = 3;                    // сколько объявлений висит на доске одновременно

let POOL = [];                      // пул шаблонов { type, target, count, reward } (из data/board.json, правится в редакторе)
let seq = 1;                        // счётчик уникальных id экземпляров объявлений

function loadPool() {
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'board.json'), 'utf8'));
    POOL = Array.isArray(doc.quests) ? doc.quests : [];
  } catch (e) { POOL = []; }
}
loadPool();

function getPool() { return POOL; }
function setPool(arr) { POOL = Array.isArray(arr) ? arr : []; }

// Нормализованный шаблон → экземпляр объявления (со свежим id)
function instOf(tpl) {
  return {
    id: 'b' + (seq++),
    type: tpl.type,
    target: String(tpl.target || ''),
    count: Math.max(1, parseInt(tpl.count, 10) || 1),
    reward: Math.max(0, parseInt(tpl.reward, 10) || 0),
  };
}
function genOne() {
  if (!POOL.length) return null;
  const tpl = POOL[Math.floor(Math.random() * POOL.length)];
  return instOf(tpl);
}

function ensure(p) {
  if (!p.board) p.board = { slots: [], active: null, nextRefresh: 0 };
  return p.board;
}

// Перегенерировать слоты (взятый квест — в active, его не трогаем). Вызывается лениво при просмотре.
function refresh(p, now) {
  const b = ensure(p);
  b.slots = [];
  for (let i = 0; i < SLOTS; i++) { const q = genOne(); if (q) b.slots.push(q); }
  b.nextRefresh = now + REFRESH_MS;
}

// Состояние доски для клиента. Слоты пополняются ТОЛЬКО по таймеру (раз в 5 мин),
// а не по мере взятия — игрок может «вычистить» все 3 и ждать обновления.
// nextRefresh=0 у нового игрока → первая генерация сработает при первом просмотре.
function state(p, now) {
  const b = ensure(p);
  if (now >= b.nextRefresh) refresh(p, now);
  return { slots: b.slots.slice(), active: b.active ? { ...b.active } : null, nextRefresh: b.nextRefresh, refreshMs: REFRESH_MS };
}

// Взять объявление со слота. Можно держать только ОДНО за раз. Взятый слот УБИРАЕТСЯ с доски
// (новый не подставляется) — освободившееся место заполнится только при обновлении по таймеру.
// Возврат: { ok:true, active } | { ok:false, reason }
function accept(p, slotId, now) {
  const b = ensure(p);
  if (b.active) return { ok: false, reason: 'busy' };       // уже есть взятое объявление
  const idx = b.slots.findIndex(s => s.id === slotId);
  if (idx < 0) return { ok: false, reason: 'gone' };
  const q = b.slots[idx];
  b.active = { ...q, progress: 0 };
  b.slots.splice(idx, 1);                                   // убрать с доски, не заменять
  return { ok: true, active: { ...b.active } };
}

// Совпадает ли цель убийства (kill-квест целится по спрайту ИЛИ по имени моба — как у НПС-квестов)
function killMatch(target, kind, name) { return target === kind || target === name; }

// Продвинуть активное объявление действием игрока. qty — сколько единиц.
// Возврат: null (нет совпадения) | { done:false, active } | { done:true, reward, quest }
function progress(p, kind, target, qty = 1) {
  const b = ensure(p);
  const a = b.active;
  if (!a || a.type !== kind) return null;
  const match = kind === 'kill' ? killMatch(a.target, target.kind, target.name) : (a.target === target.id);
  if (!match) return null;
  a.progress = Math.min(a.count, a.progress + qty);
  if (a.progress >= a.count) {
    const reward = a.reward;
    p.gold += reward;                 // награда — только золото, ресурсы не забираем
    b.active = null;
    return { done: true, reward, quest: a };
  }
  return { done: false, active: { ...a } };
}

// Хуки конкретных действий (вызываются из мест выдачи предметов/убийств)
function recordCraft(p, itemId, qty) { return progress(p, 'craft', { id: itemId }, qty); }
function recordGather(p, itemId, qty) { return progress(p, 'gather', { id: itemId }, qty); }
function recordKill(p, kind, name) { return progress(p, 'kill', { kind, name }, 1); }

// Разослать игроку результат: обновление доски + (при завершении) награда и уведомление.
// io/pid передаются вызывающим (модуль не держит ссылку на сокеты).
function notify(io, pid, p, res) {
  if (!res) return;
  io.to(pid).emit('boardUpdate', state(p, Date.now()));   // тихое обновление (панель обновится, только если открыта)
  if (res.done) {
    io.to(pid).emit('boardDone', { reward: res.reward, quest: res.quest });
    io.to(pid).emit('loot', { gold: res.reward });
    const playersMod = require('./players');
    io.to(pid).emit('inventoryUpdate', playersMod.invState(p));   // золото изменилось
  }
}

module.exports = { REFRESH_MS, SLOTS, loadPool, getPool, setPool, state, accept, progress, recordCraft, recordGather, recordKill, notify };
