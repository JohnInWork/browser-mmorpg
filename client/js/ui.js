// UI/HUD-помощники: панель игрока, панель цели боя, инвентарь/хотбар/экипировка, подсказки, цифры урона.
import { S } from './state.js';
import { itemIcon, itemName, itemPrice, buyPrice, sellPrice, SLOTS, SLOT_NAMES, ITEMS, CAT_NAMES, RARITY, itemRarity, rarityColor, UI_SVG } from './items.js';
import { SKILL_TEX } from './textures.js';

// Фон-плитка по редкости (с альфой) для слота с предметом; '' — сброс к стандартному фону
// Фон слота: НЕПРОЗРАЧНЫЙ — тёмная база слота + лёгкий оттенок редкости (чтобы фон не «просвечивал»).
function rarityBg(id) {
  const c = rarityColor(id).replace('#', '');
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  const a = 0.26, br = 20, bg = 20, bb = 28;   // база = цвет слота (rgb 20,20,28)
  return `rgb(${Math.round(br * (1 - a) + r * a)},${Math.round(bg * (1 - a) + g * a)},${Math.round(bb * (1 - a) + b * a)})`;
}
// Цвет названия по редкости (обычные — обычный светлый текст)
function rarityNameColor(id) { return itemRarity(id) === 'common' ? '' : rarityColor(id); }

export function addFloater(tx, ty, text, color) {
  // Несколько игроков бьют одного моба → цифры урона рождаются на одной клетке.
  // Разводим их веером по горизонтали (по числу «свежих» цифр над этой клеткой), чтобы не перекрывались.
  let n = 0;
  for (const f of S.floaters) if (f.wx === tx && f.wy === ty && f.t < 0.5) n++;
  const dx = (n % 2 === 0 ? 1 : -1) * (10 + Math.floor(n / 2) * 16) + (Math.random() - 0.5) * 4;
  S.floaters.push({ wx: tx, wy: ty, text, color, t: 0, dx });
}

// Верхний левый: имя + HP игрока
export function updateHpHud() {
  const me = S.players[S.myId];
  if (!me) return;
  const nameEl = document.getElementById('pName');
  const fill = document.getElementById('pHpFill');
  const txt = document.getElementById('pHpText');
  if (nameEl) nameEl.textContent = me.name;
  if (fill) fill.style.width = Math.max(0, (me.hp / me.maxHp) * 100) + '%';
  if (txt) txt.textContent = `${me.hp}/${me.maxHp}`;
}

export const TYPE_NAMES = { friendly: 'Дружественный', passive: 'Курица', aggressive: 'Волк', bear: 'Медведь' };

// Золото игрока (иконкой + число)
export function updateGold() {
  const me = S.players[S.myId];
  const el = document.getElementById('goldAmount');
  if (el && me) el.textContent = me.gold != null ? me.gold : 0;
}

// Заполнить слоты инвентаря предметами (иконка + количество)
export function renderInventory() {
  const grid = document.getElementById('invGrid');
  if (!grid) return;
  const slots = grid.children;
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const stack = S.inventory[i];
    if (stack) {
      let html = itemIcon(stack.id) + (stack.qty > 1 ? `<span class="qty">${stack.qty}</span>` : '');
      if (stack.id === 'returnStone' && S.returnCdUntil && Date.now() < S.returnCdUntil) {
        html += `<span class="cd">${Math.ceil((S.returnCdUntil - Date.now()) / 1000)}с</span>`;
      }
      slot.innerHTML = html;
      slot.draggable = true;
      slot.dataset.itemId = stack.id;
      slot.style.background = rarityBg(stack.id);
    } else {
      slot.innerHTML = '';
      slot.draggable = false;
      slot.dataset.itemId = '';
      slot.style.background = '';
    }
    // подсветка предмета, который сейчас в руке (правой или левой)
    slot.classList.toggle('active', !!stack && (stack.id === S.handR || stack.id === S.handL));
  }
}

// --- Контекстное меню предмета в рюкзаке (ПКМ) ---
let ctxIndex = null;
export function openItemMenu(invIndex, x, y) {
  const stack = S.inventory[invIndex];
  if (!stack) return;
  ctxIndex = invIndex;
  const def = ITEMS[stack.id] || {};
  const canSplit = def.stackable && stack.qty > 1;
  const items = [];
  if (def.type === 'armor' && def.slot) items.push({ key: 'equip', label: 'Надеть' });
  else if (def.type === 'weapon' || def.type === 'tool') items.push({ key: 'wield', label: 'Взять в руку' });
  else if (def.type === 'shield') items.push({ key: 'wield', label: 'Взять в левую руку' });
  if (canSplit) items.push({ key: 'split', label: 'Разделить' });
  if (def.pourTo) items.push({ key: 'pour', label: 'Вылить' });   // напр. колба с водой → пустая колба
  items.push({ key: 'wiki', label: 'Посмотреть в вики' });
  items.push({ key: 'chat', label: 'Отправить в чат' });
  items.push({ key: 'destroy', label: 'Уничтожить', danger: true });
  const menu = document.getElementById('ctxMenu');
  menu.innerHTML = `<div class="ctx-head">${escHtml(itemName(stack.id))}${stack.qty > 1 ? ` ×${stack.qty}` : ''}</div>`
    + items.map(it => `<button class="ctx-item${it.danger ? ' danger' : ''}" data-act="${it.key}">${it.label}</button>`).join('');
  menu.classList.remove('hidden');                                   // показать, чтобы измерить размер
  const w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = Math.max(6, Math.min(x, window.innerWidth - w - 8)) + 'px';
  menu.style.top = Math.max(6, Math.min(y, window.innerHeight - h - 8)) + 'px';
}
export function closeItemMenu() {
  const menu = document.getElementById('ctxMenu');
  if (menu) menu.classList.add('hidden');
  ctxIndex = null;
}
function ctxAction(act) {
  const idx = ctxIndex;
  closeItemMenu();
  const stack = S.inventory[idx];
  if (!stack) return;
  if (act === 'equip') S.socket.emit('equip', idx);
  else if (act === 'wield') S.socket.emit('activateInv', idx);
  else if (act === 'wiki') showItemInGuide(stack.id);
  else if (act === 'chat') insertItemLinkToChat(stack.id);
  else if (act === 'split') openSplitDialog(idx);
  else if (act === 'pour') S.socket.emit('pourFlask', { invIndex: idx });
  else if (act === 'destroy') openDestroyDialog(idx);
}

// --- Модальное окно (разделить стак / подтвердить уничтожение) ---
function openModal(html) {
  document.getElementById('modalBox').innerHTML = html;
  document.getElementById('modalOverlay').classList.remove('hidden');
}
export function closeModal() { document.getElementById('modalOverlay').classList.add('hidden'); }

// Табличка: показать игроку сообщение (модальное окно с текстом, сохраняем переносы строк)
export function openSign(text) {
  const body = text && text.trim() ? escHtml(text).replace(/\n/g, '<br>') : '<i class="sign-empty">Пустая табличка</i>';
  openModal(`
    <div class="sign-modal">
      <div class="sign-board">${body}</div>
      <div class="modal-btns"><button class="m-ok" data-act="sign-ok">Закрыть</button></div>
    </div>`);
  document.getElementById('modalBox').querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => closeModal()));
}

// Окно смерти: всегда сообщаем о потере рюкзака + что ещё потеряно (или что повезло)
export function showDeathWindow(d) {
  d = d || {};
  const lost = [];
  if (d.lostArmor) lost.push(`Броня: <b>${escHtml(d.lostArmor)}</b>`);
  if (d.lostHotbar) lost.push(`Быстрый доступ: <b>${escHtml(d.lostHotbar)}</b>`);
  const extra = lost.length
    ? `<div class="death-lost">Также потеряно:<br>${lost.join('<br>')}</div>`
    : `<div class="death-luck">Тебе повезло — броня и панель быстрого доступа уцелели.</div>`;
  openModal(`
    <div class="death-modal">
      <h2 class="death-title">Вы погибли</h2>
      <div class="death-body">
        <div class="death-bag">Потерян весь рюкзак.</div>
        ${extra}
      </div>
      <div class="modal-btns"><button class="m-ok" data-act="death-ok">Продолжить</button></div>
    </div>`);
  document.getElementById('modalBox').querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => closeModal()));
}

// Есть ли у игрока камень возвращения где угодно (рюкзак/хотбар/банк)
function clientOwnsReturnStone() {
  const has = arr => (arr || []).some(s => s && s.id === 'returnStone');
  return has(S.inventory) || has(S.hotbar) || has(S.bank && S.bank.slots);
}

// Окно привязки/смены точки возврата (при взаимодействии с камнем в мире)
export function openStoneBind(stone) {
  const owns = clientOwnsReturnStone();
  const cur = S.returnPoint;
  const body = (owns && cur)
    ? `Сменить точку возврата на «<b>${escHtml(stone.name)}</b>»?<br><span class="stone-warn">Прежний камень («${escHtml(cur.name)}») будет удалён, новый появится в рюкзаке.</span>`
    : `Взять камень возвращения «<b>${escHtml(stone.name)}</b>»?<br>Он появится в рюкзаке — используй его, чтобы телепортироваться сюда (кулдаун 5 мин).`;
  openModal(`
    <div class="stone-modal">
      <h3 class="stone-title">Камень возвращения</h3>
      <div class="stone-body">${body}</div>
      <div class="modal-btns">
        <button class="m-cancel" data-act="cancel">Отмена</button>
        <button class="m-ok" data-act="bind">${owns && cur ? 'Сменить' : 'Взять'}</button>
      </div>
    </div>`);
  document.getElementById('modalBox').querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.act === 'bind') S.socket.emit('bindStone', { x: stone.x, y: stone.y });
    closeModal();
  }));
}

// Окно использования камня возвращения. onConfirm() вызывается при подтверждении (источник — рюкзак или хотбар).
export function openReturnTeleport(onConfirm) {
  const rp = S.returnPoint;
  if (!rp) {
    openModal(`<div class="stone-modal"><div class="stone-body">Камень ни к чему не привязан. Активируй его у камня возвращения в мире, чтобы задать точку.</div><div class="modal-btns"><button class="m-ok" data-act="cancel">Закрыть</button></div></div>`);
    document.getElementById('modalBox').querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => closeModal()));
    return;
  }
  const now = Date.now();
  const onCd = S.returnCdUntil && now < S.returnCdUntil;
  const left = onCd ? Math.ceil((S.returnCdUntil - now) / 1000) : 0;
  openModal(`
    <div class="stone-modal">
      <h3 class="stone-title">Возвращение</h3>
      <div class="stone-body">Телепортироваться к «<b>${escHtml(rp.name)}</b>»?</div>
      ${onCd ? `<div class="stone-cd">Перезарядка: ${left} c.</div>` : ''}
      <div class="modal-btns">
        <button class="m-cancel" data-act="cancel">Отмена</button>
        <button class="m-ok" data-act="tp"${onCd ? ' disabled' : ''}>Телепорт</button>
      </div>
    </div>`);
  document.getElementById('modalBox').querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.act === 'tp' && !onCd && onConfirm) onConfirm();
    closeModal();
  }));
}

// «Горячее» использование слота хотбара: еда — съесть, камень — окно телепорта, иначе — взять в руку.
export function pressHotbar(i) {
  const it = S.hotbar[i];
  if (!it) { S.socket.emit('activateSlot', i); return; }
  const def = ITEMS[it.id];
  if (it.id === 'returnStone') { openReturnTeleport(() => S.socket.emit('useHotbar', i)); return; }
  if (def && def.type === 'food' && def.heal) { S.socket.emit('useHotbar', i); return; }
  if (def && def.type === 'armor' && def.slot) { S.socket.emit('equipHotbar', i); return; } // броню — надеть
  S.socket.emit('activateSlot', i);   // оружие/щит/инструмент — взять «в руку» (сервер выберет руку)
}

function openSplitDialog(invIndex) {
  const stack = S.inventory[invIndex];
  if (!stack || stack.qty < 2) return;
  const max = stack.qty - 1, def = Math.floor(stack.qty / 2);
  openModal(`
    <h3>Разделить стак</h3>
    <p class="modal-sub">${escHtml(itemName(stack.id))} ×${stack.qty}</p>
    <div class="split-row">
      <button class="split-step" data-d="-1">−</button>
      <input id="splitRange" type="range" min="1" max="${max}" value="${def}">
      <button class="split-step" data-d="1">+</button>
    </div>
    <div class="split-amt">Отделить: <b id="splitVal">${def}</b> · останется <span id="splitRest">${stack.qty - def}</span></div>
    <div class="modal-btns">
      <button class="m-cancel" data-act="cancel">Отмена</button>
      <button class="m-ok" data-act="split-ok">Разделить</button>
    </div>`);
  const box = document.getElementById('modalBox');
  const range = box.querySelector('#splitRange');
  const upd = () => {
    const v = Math.max(1, Math.min(max, parseInt(range.value, 10) || 1));
    range.value = v;
    box.querySelector('#splitVal').textContent = v;
    box.querySelector('#splitRest').textContent = stack.qty - v;
  };
  range.addEventListener('input', upd);
  box.querySelectorAll('.split-step').forEach(b => b.addEventListener('click', () => {
    range.value = (parseInt(range.value, 10) || 1) + parseInt(b.dataset.d, 10); upd();
  }));
  box.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.act === 'split-ok') S.socket.emit('splitStack', { invIndex, amount: parseInt(range.value, 10) });
    closeModal();
  }));
}

function openDestroyDialog(invIndex) {
  const stack = S.inventory[invIndex];
  if (!stack) return;
  openModal(`
    <h3>Уничтожить предмет?</h3>
    <p class="modal-sub"><b>${escHtml(itemName(stack.id))}${stack.qty > 1 ? ` ×${stack.qty}` : ''}</b> будет безвозвратно удалён.</p>
    <div class="modal-btns">
      <button class="m-cancel" data-act="cancel">Отмена</button>
      <button class="m-danger" data-act="destroy-ok">Уничтожить</button>
    </div>`);
  document.getElementById('modalBox').querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.act === 'destroy-ok') S.socket.emit('destroyStack', { invIndex });
    closeModal();
  }));
}

// Вставить ссылку-предмет в поле чата (не отправляя — игрок жмёт Enter сам)
export function insertItemLinkToChat(id) {
  const input = document.getElementById('chatInput');
  if (!input) return;
  const cur = input.value;
  const sep = cur && !cur.endsWith(' ') ? ' ' : '';
  input.value = cur + sep + `[[${id}]]` + ' ';
  document.getElementById('chat')?.classList.remove('collapsed');     // развернуть чат, если свёрнут
  input.focus();
}

// Открыть энциклопедию на странице конкретного предмета
export function showItemInGuide(id) {
  if (!ITEMS[id]) return;
  closeItemMenu();
  ['invPanel', 'charPanel', 'menuPanel', 'questPanel', 'questDialog', 'craftPanel', 'tradePanel']
    .forEach(p => document.getElementById(p)?.classList.add('hidden'));
  document.querySelectorAll('#bottomRight button.active').forEach(b => b.classList.remove('active'));
  document.getElementById('guideBtn')?.classList.add('active');
  document.getElementById('guidePanel').classList.remove('hidden');
  S.guideNav = [{ kind: 'index' }, { kind: 'item', id }];
  renderGuide();
}

// Навесить обработчики меню/модалки/ссылок (вызывается один раз при инициализации)
export function setupItemMenu() {
  const menu = document.getElementById('ctxMenu');
  menu.addEventListener('click', (e) => { const b = e.target.closest('.ctx-item'); if (b) ctxAction(b.dataset.act); });
  document.addEventListener('mousedown', (e) => {
    if (!menu.classList.contains('hidden') && !menu.contains(e.target)) closeItemMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeItemMenu(); closeModal(); } });
  const ov = document.getElementById('modalOverlay');
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeModal(); });
  const log = document.getElementById('chatLog');
  if (log) log.addEventListener('click', (e) => { const a = e.target.closest('.chat-itemlink'); if (a) showItemInGuide(a.dataset.id); });
}

// Заполнить хотбар предметами (стаки) + подсветить активный
export function renderHotbar() {
  const hb = document.getElementById('hotbar');
  if (!hb) return;
  const slots = hb.children;
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const stack = S.hotbar[i];
    const cd = (stack && stack.id === 'returnStone' && S.returnCdUntil && Date.now() < S.returnCdUntil)
      ? `<span class="cd">${Math.ceil((S.returnCdUntil - Date.now()) / 1000)}с</span>` : '';
    slot.innerHTML = `<span class="num">${i + 1}</span>`
      + (stack ? itemIcon(stack.id) + (stack.qty > 1 ? `<span class="qty">${stack.qty}</span>` : '') + cd : '');
    slot.draggable = !!stack;
    slot.style.background = stack ? rarityBg(stack.id) : '';
    const inHand = stack && (stack.id === S.handR || stack.id === S.handL);   // предмет сейчас в руке
    slot.classList.toggle('active', !!inHand);
  }
}

// Панель экипировки (только броня) + клик по слоту = снять. Оружие/щит теперь «в руке», не здесь.
const ARMOR_SLOTS = ['helmet', 'chest', 'gloves', 'pants', 'boots', 'cloak'];
export function renderEquipment() {
  const grid = document.getElementById('equipGrid');
  if (!grid) return;
  grid.innerHTML = '';
  ARMOR_SLOTS.forEach(slot => {
    const id = S.equipment[slot];
    const row = document.createElement('div');
    row.className = 'equip-row';
    row.innerHTML = `<span class="lbl">${SLOT_NAMES[slot]}</span><div class="equip-slot${id ? ' filled' : ''}">${id ? itemIcon(id) : ''}</div>`;
    const cell = row.querySelector('.equip-slot');
    if (id) cell.style.background = rarityBg(id);
    cell.addEventListener('click', () => { if (S.equipment[slot]) S.socket.emit('unequip', slot); });
    grid.appendChild(row);
  });
}

// Характеристики персонажа
export function updateStats() {
  const a = document.getElementById('statArmor'); if (a) a.textContent = S.armor || 0;
  const me = S.players[S.myId]; const h = document.getElementById('statHp');
  if (h && me) h.textContent = `${me.hp}/${me.maxHp}`;
}

// --- Окно торговли (плитка с выделением) ---
let tradeOpen = false;
const tradeSel = new Set(); // выбранные индексы инвентаря
const TRADE_SLOTS = 32;

export function isTradeOpen() { return tradeOpen; }
export function openTrade() { tradeOpen = true; tradeSel.clear(); document.getElementById('tradePanel').classList.remove('hidden'); renderTrade(); }
export function closeTrade() { tradeOpen = false; document.getElementById('tradePanel').classList.add('hidden'); }
export function selectedTrade() { return Array.from(tradeSel); }
export function clearTradeSel() { tradeSel.clear(); }
export function selectAllTrade() { tradeSel.clear(); S.inventory.forEach((s, i) => { if (s) tradeSel.add(i); }); renderTrade(); }

function updateTradeFooter() {
  const me = S.players[S.myId];
  let sum = 0; tradeSel.forEach(i => { const s = S.inventory[i]; if (s) sum += sellPrice(s.id) * (s.qty || 1); });
  document.getElementById('tradeGold').textContent = (me && me.gold) || 0;
  document.getElementById('tradeSelCount').textContent = tradeSel.size;
  document.getElementById('tradeSelSum').textContent = sum;
  document.getElementById('sellSelBtn').disabled = tradeSel.size === 0;
}

export function renderTrade() {
  if (!tradeOpen) return;
  const grid = document.getElementById('tradeGrid');
  grid.innerHTML = '';
  for (let i = 0; i < TRADE_SLOTS; i++) {
    const stack = S.inventory[i];
    const slot = document.createElement('div');
    slot.className = 'slot' + (tradeSel.has(i) ? ' sel' : '');
    if (stack) {
      slot.innerHTML = itemIcon(stack.id) + (stack.qty > 1 ? `<span class="qty">${stack.qty}</span>` : '');
      slot.style.background = rarityBg(stack.id);
      slot.addEventListener('click', () => {
        if (tradeSel.has(i)) tradeSel.delete(i); else tradeSel.add(i);
        slot.classList.toggle('sel'); updateTradeFooter();
      });
    }
    grid.appendChild(slot);
  }
  updateTradeFooter();
}

// --- Сундук-хранилище (банк): рюкзак + хранилище, перетаскивание и клик-перенос ---
let bankOpen = false;
export function isBankOpen() { return bankOpen; }
export function openBank(data) {
  if (data) S.bank = data;
  bankOpen = true;
  document.getElementById('bankPanel').classList.remove('hidden');
  renderBank();
}
export function closeBank() { bankOpen = false; document.getElementById('bankPanel').classList.add('hidden'); }

function bankCell(side, index, stack) {
  const slot = document.createElement('div');
  slot.className = 'slot';
  if (stack) {
    slot.innerHTML = itemIcon(stack.id) + (stack.qty > 1 ? `<span class="qty">${stack.qty}</span>` : '');
    slot.style.background = rarityBg(stack.id);
    slot.draggable = true;
    slot.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', JSON.stringify({ bank: true, from: side, index })));
    slot.addEventListener('click', () => S.socket.emit('bankQuick', { src: side, index }));   // клик — быстрый перенос
  }
  slot.addEventListener('dragover', (e) => e.preventDefault());
  slot.addEventListener('drop', (e) => {
    e.preventDefault();
    let src; try { src = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
    if (!src || !src.bank) return;                                                              // принимаем только перетаскивания из банка
    S.socket.emit('bankMove', { src: src.from, from: src.index, dst: side, to: index });
  });
  return slot;
}

export function renderBank() {
  if (!bankOpen) return;
  const invGrid = document.getElementById('bankInvGrid');
  const storeGrid = document.getElementById('bankStoreGrid');
  invGrid.innerHTML = ''; storeGrid.innerHTML = '';
  for (let i = 0; i < 32; i++) invGrid.appendChild(bankCell('inv', i, S.inventory[i]));
  const slots = S.bank.slots || [];
  for (let i = 0; i < slots.length; i++) storeGrid.appendChild(bankCell('bank', i, slots[i]));
  document.getElementById('bankLevel').textContent = `· ур. ${S.bank.level}/${S.bank.maxLevel} · ${slots.length} слотов`;
  const gold = (S.players[S.myId] && S.players[S.myId].gold != null) ? S.players[S.myId].gold : (S.bank.gold || 0);
  document.getElementById('bankGold').textContent = gold;
  const btn = document.getElementById('bankUpgradeBtn');
  if (S.bank.nextCost == null) { btn.textContent = 'Максимальный уровень'; btn.disabled = true; }
  else { btn.textContent = `Улучшить +${S.bank.perLevel || 8} слотов · ${S.bank.nextCost} зол.`; btn.disabled = gold < S.bank.nextCost; }
}

// --- Окно крафта (станции) ---
let craftStation = null;
const STATION_NAMES = { smelter: 'Плавильня', anvil: 'Наковальня', campfire: 'Костёр', workbench: 'Верстак' };
function countInv(id) { let n = 0; for (const s of S.inventory) if (s && s.id === id) n += s.qty || 1; return n; }
export function isCraftOpen() { return !!craftStation; }
export function openCraft(station) {
  craftStation = station;
  document.getElementById('craftTitle').textContent = STATION_NAMES[station] || 'Станция';
  document.getElementById('craftPanel').classList.remove('hidden');
  renderCraft();
}
export function closeCraft() { craftStation = null; document.getElementById('craftPanel').classList.add('hidden'); }

// Закрыть все окна взаимодействия с НПС/станциями (вызывается, когда игрок отошёл/двинулся)
// --- Админ-сундук (тест): взять любой предмет игры ---
export function openCreative() {
  const panel = document.getElementById('creativePanel');
  if (!panel) return;
  const ids = Object.keys(S.items || {});
  const grid = ids.map(id => `<button class="cr-item" data-id="${id}" title="${escHtml(itemName(id))}">${itemIcon(id)}<span class="cr-name">${escHtml(itemName(id))}</span></button>`).join('');
  panel.innerHTML = `<button class="popup-close" id="crClose">✕</button><h3>Админ-сундук</h3>
    <p class="cr-hint">Клик — взять предмет (стопкой). Тест-режим.</p>
    <div class="cr-grid">${grid || '<div class="cr-empty">Нет данных предметов</div>'}</div>
    <button id="crClear" class="cr-clear">Очистить рюкзак</button>`;
  panel.classList.remove('hidden');
  panel.querySelector('#crClose').addEventListener('click', closeCreative);
  panel.querySelector('#crClear').addEventListener('click', () => S.socket.emit('creativeClear'));
  panel.querySelectorAll('.cr-item').forEach(b => b.addEventListener('click', () => S.socket.emit('creativeTake', { id: b.dataset.id })));
}
export function closeCreative() { const p = document.getElementById('creativePanel'); if (p) p.classList.add('hidden'); }

export function closeInteractions() {
  closeTrade();
  closeCraft();
  closeBank();
  closeBuy();
  closeTalk();
  closeNpcHub();
  closeCreative();
  closeBoard();
  const qd = document.getElementById('questDialog'); if (qd) qd.classList.add('hidden');
}
export function renderCraft() {
  if (!craftStation) return;
  const list = document.getElementById('craftList');
  const recipes = (S.recipes && S.recipes[craftStation]) || [];
  list.innerHTML = '';
  // Показываем ТОЛЬКО то, что игрок может создать прямо сейчас (есть все ресурсы)
  let shown = 0;
  recipes.forEach((r, i) => {
    if (!r.in.every(ing => countInv(ing.id) >= ing.qty)) return;
    shown++;
    const ings = r.in.map(ing => `<span class="ing">${itemIcon(ing.id)} ${countInv(ing.id)}/${ing.qty}</span>`).join('');
    const row = document.createElement('div');
    row.className = 'craft-row';
    row.innerHTML = `<span class="craft-out">${itemIcon(r.out)}</span>`
      + `<span class="craft-info"><div class="cn">${itemName(r.out)}${r.outQty > 1 ? ` ×${r.outQty}` : ''}</div><div class="ci">${ings}</div></span>`
      + `<button>Создать</button>`;
    row.querySelector('button').addEventListener('click', () => S.socket.emit('craft', { station: craftStation, recipe: i }));
    list.appendChild(row);
  });
  if (!shown) list.innerHTML = '<p class="craft-empty">Нет ресурсов для крафта. Загляни в «Энциклопедию» — там все рецепты.</p>';
}

// Подсказка-название сверху по центру
export function showTip(text) {
  const el = document.getElementById('tooltip');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('hidden');
}
export function hideTip() {
  const el = document.getElementById('tooltip');
  if (el) el.classList.add('hidden');
}

// Панель HP цели (показывается у игрока, пока идёт бой)
export function updateTargetHud() {
  const panel = document.getElementById('targetPanel');
  if (!panel) return;
  const id = S.combatTargetId;
  const m = id ? S.mobs[id] : null;
  if (!m || !m.alive) { panel.classList.add('hidden'); return; }
  panel.classList.remove('hidden');
  document.getElementById('tName').textContent = m.label || 'Враг';
  document.getElementById('tHpFill').style.width = Math.max(0, (m.hp / m.maxHp) * 100) + '%';
  document.getElementById('tHpText').textContent = `${m.hp}/${m.maxHp}`;
}

// --- Чат / лента событий (категории: chat | system | loot | combat) ---
const CHAT_MAX = 80;
const chatLines = [];                                  // { cat, html }
export const chatFilters = { chat: true, system: true, loot: true, combat: true };
const escHtml = (s) => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
const safeColor = (c) => (/^#[0-9a-fA-F]{3,6}$/.test(c || '') ? c : '#9ec1ff');

export function addChat(cat, html) {
  chatLines.push({ cat, html });
  if (chatLines.length > CHAT_MAX) chatLines.shift();
  renderChatLog();
}
export function renderChatLog() {
  const log = document.getElementById('chatLog');
  if (!log) return;
  log.innerHTML = chatLines
    .filter(l => chatFilters[l.cat])
    .map(l => `<div class="cl cl-${l.cat}">${l.html}</div>`).join('');
  log.scrollTop = log.scrollHeight; // автопрокрутка вниз
}
// Ссылка-предмет внутри сообщения чата: токен [[id]] → кликабельный чип (иконка + цветное имя)
function itemChip(id) {
  return `<span class="chat-itemlink" data-id="${id}" style="color:${rarityColor(id)}"><span class="cil-ic">${itemIcon(id)}</span>${escHtml(itemName(id))}</span>`;
}
function renderItemTokens(escaped) {
  return escaped.replace(/\[\[(\w+)\]\]/g, (m, id) => (ITEMS[id] ? itemChip(id) : m));
}
export function chatPlayerMsg(name, text, color) {
  addChat('chat', `<span class="cl-name" style="color:${safeColor(color)}">${escHtml(name)}:</span> ${renderItemTokens(escHtml(text))}`);
}
export function chatSystem(text) { addChat('system', escHtml(text)); }
export function chatLoot(text)   { addChat('loot', escHtml(text)); }
export function chatCombat(text) { addChat('combat', escHtml(text)); }

// --- Энциклопедия (гайд): предметы, мобы, рецепты с переходами по ссылкам ---
const GATHER_SRC = { wood: 'Срубить дерево (топор)', stone: 'Добыть киркой из камня', ore: 'Добыть киркой из жилы руды' };

function recipeFor(itemId) {                                   // в каком верстаке и из чего создаётся
  for (const st in S.recipes) { const list = S.recipes[st]; if (!Array.isArray(list)) continue; for (const r of list) if (r.out === itemId) return { station: st, recipe: r }; }
  return null;
}
function usedIn(itemId) {                                      // в какие рецепты входит ингредиентом
  const out = [];
  for (const st in S.recipes) { const list = S.recipes[st]; if (!Array.isArray(list)) continue; for (const r of list) if (r.in.some(i => i.id === itemId)) out.push(r.out); }
  return [...new Set(out)];
}
function droppedBy(itemId) {                                   // с каких мобов падает
  const out = [];
  for (const t in S.mobTypes) {
    const lt = S.mobTypes[t].loot, drops = Array.isArray(lt) ? lt : (lt ? [lt] : []);
    if (drops.some(d => d.id === itemId)) out.push(t);
  }
  return out;
}
function mobName(t) { return (S.mobTypes[t] && S.mobTypes[t].name) || TYPE_NAMES[t] || t; }
// Иконка существа = тот же SVG-спрайт, что и в игре (client/assets/<sprite>.svg).
const MOB_SPRITES = { chicken: '/assets/chicken.svg', wolf: '/assets/wolf.svg', bear: '/assets/bear.svg' };
function mobIcon(t) {
  const m = S.mobTypes[t] || {};
  if (MOB_SPRITES[m.sprite]) return `<img class="mob-sprite" src="${MOB_SPRITES[m.sprite]}" alt="">`;
  const c = m.color || '#2ecc71';                              // запасной вид (без спрайта): цветной зверёк, как в игре
  return `<svg viewBox="0 0 24 24" width="26" height="26"><circle cx="12" cy="12" r="8" fill="${c}" stroke="rgba(0,0,0,.25)" stroke-width="1"/><circle cx="9" cy="11" r="1.4" fill="#173d27"/><circle cx="15" cy="11" r="1.4" fill="#173d27"/><path d="M9 15 q3 1.8 6 0" stroke="#173d27" stroke-width="1.3" fill="none" stroke-linecap="round"/></svg>`;
}
// Иконки навыков (свои SVG)
const SKILL_ICONS = {
  woodcutting: `<svg viewBox="0 0 24 24" width="26" height="26"><line x1="5" y1="20" x2="15" y2="8" stroke="#8a5a28" stroke-width="2.6" stroke-linecap="round"/><path d="M13 4 c4 0 7 3 7 7 c-3 -2 -7 -1 -9 2 z" fill="#cfd6dd" stroke="#8e979f" stroke-width="0.9"/></svg>`,
  mining: `<svg viewBox="0 0 24 24" width="26" height="26"><line x1="6" y1="20" x2="15" y2="7" stroke="#8a5a28" stroke-width="2.6" stroke-linecap="round"/><path d="M8 5 q7 -1 12 5 q-7 -1 -12 5 q3 -5 0 -10z" fill="#c0c7d0" stroke="#8e979f" stroke-width="0.9"/></svg>`,
  smithing: `<svg viewBox="0 0 24 24" width="26" height="26"><rect x="11" y="9" width="2.4" height="12" rx="1" fill="#8a5a28"/><rect x="6" y="5" width="12" height="5" rx="1.5" fill="#7c828b" stroke="#5e636b" stroke-width="1"/></svg>`,
  cooking: `<svg viewBox="0 0 24 24" width="26" height="26"><rect x="5" y="11" width="12" height="7" rx="2" fill="#5e6670" stroke="#3a3f47" stroke-width="1"/><rect x="16" y="13" width="5" height="2.4" rx="1.2" fill="#5e6670"/><path d="M8 9 q1 -2 0 -3 M11 9 q1 -2 0 -3 M14 9 q1 -2 0 -3" stroke="#cfd6dd" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>`,
  combat: `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 2 L14 5 L13 14 L11 14 L10 5 Z" fill="#cfd6dd" stroke="#9aa4b0" stroke-width="0.8"/><rect x="8" y="13.6" width="8" height="2.2" rx="1" fill="#5e6670"/><rect x="11" y="15.8" width="2" height="5" rx="1" fill="#8a5a28"/></svg>`,
};
// Иконки навыков — из единого манифеста client/js/textures.js (те же файлы, что у инструментов).
function skillIcon(key) {
  if (SKILL_TEX[key]) return `<svg viewBox="0 0 512 512" width="26" height="26"><image href="${SKILL_TEX[key]}" width="512" height="512"/></svg>`;
  return SKILL_ICONS[key] || '';
}
function skillName(key) { return (S.skills[key] && S.skills[key].name) || key; }

const link = (kind, id, inner) => `<span class="glink" data-k="${kind}" data-id="${id}">${inner}</span>`;
const chip = (kind, id, icon, name) => {
  const col = kind === 'item' ? rarityNameColor(id) : '';
  const ns = col ? ` style="color:${col}"` : '';
  return `<div class="g-chip glink" data-k="${kind}" data-id="${id}"><span class="g-ic">${icon}</span><span${ns}>${name}</span></div>`;
};

function guideIndexHtml() {
  let h = '<p class="g-hint">Нажми на предмет или существо, чтобы узнать характеристики, из чего создаётся и где взять. Ингредиенты внутри — кликабельны.</p>';
  for (const c of ['tool', 'weapon', 'armor', 'clothing', 'material', 'ingredient', 'food']) {
    const ids = Object.keys(ITEMS).filter(id => ITEMS[id].cat === c);
    if (!ids.length) continue;
    h += `<div class="g-cat">${CAT_NAMES[c] || c}</div><div class="g-grid">` + ids.map(id => chip('item', id, itemIcon(id), itemName(id))).join('') + `</div>`;
  }
  const mobs = Object.keys(S.mobTypes).filter(t => !S.mobTypes[t].npc);   // NPC в вики не показываем — их много, описывать смысла нет
  if (mobs.length) h += `<div class="g-cat">Существа</div><div class="g-grid">` + mobs.map(t => chip('mob', t, mobIcon(t), mobName(t))).join('') + `</div>`;
  const sk = Object.keys(S.skills);
  if (sk.length) h += `<div class="g-cat">Навыки</div><div class="g-grid">` + sk.map(k => chip('skill', k, skillIcon(k), `${skillName(k)} · ур.${S.skills[k].level}`)).join('') + `</div>`;
  return h;
}
function guideSkillHtml(key) {
  const s = S.skills[key];
  if (!s) return 'Нет данных';
  const cur = s.xp - s.levelXp, need = s.nextXp != null ? s.nextXp - s.levelXp : 0;
  const pct = s.nextXp != null && need > 0 ? Math.round(cur / need * 100) : 100;
  let h = `<div class="g-head"><span class="g-bigic">${skillIcon(key)}</span><div><div class="g-name">${s.name}</div><div class="g-sub">Навык · уровень ${s.level}/${s.max}</div></div></div>`;
  if (s.desc) h += `<p class="g-desc">${s.desc}</p>`;
  h += `<div class="g-sec">Уровень ${s.level}</div>`;
  h += `<div class="skill-bar"><div class="skill-bar-fill" style="width:${pct}%"></div></div>`;
  h += `<div class="g-stats"><div>Опыт: <b>${s.xp}</b>${s.nextXp != null ? ` · до ур.${s.level + 1}: <b>${s.nextXp - s.xp}</b>` : ' · максимум'}</div></div>`;
  if (s.trains) h += `<div class="g-sec">Как качать</div><div class="g-col"><div>${s.trains}</div></div>`;
  return h;
}
function guideItemHtml(id) {
  const it = ITEMS[id];
  if (!it) return 'Нет данных';
  const rc = itemRarity(id);
  const badge = rc !== 'common' ? ` <span class="g-rar" style="background:${RARITY[rc].color}">${RARITY[rc].name}</span>` : '';
  const ns = rc !== 'common' ? ` style="color:${RARITY[rc].color}"` : '';
  const typeName = CAT_NAMES[it.cat] || '';
  const rarName = rc !== 'common' ? ` · <span style="color:${RARITY[rc].color}">${RARITY[rc].name}</span>` : '';
  let h = `<div class="g-head"><span class="g-bigic" style="background:${rarityBg(id)}">${itemIcon(id)}</span><div><div class="g-name"${ns}>${itemName(id)}${badge}</div><div class="g-sub">${typeName}${rarName}</div></div></div>`;
  if (it.desc) h += `<p class="g-desc">${it.desc}</p>`;
  if (Array.isArray(it.tags) && it.tags.length)
    h += `<div class="g-tags">` + it.tags.map(t => `<span class="g-tag">${escHtml(t)}</span>`).join('') + `</div>`;
  const stats = [];
  if (it.damage) stats.push(`${UI_SVG.sword} Урон: <b>+${it.damage}</b>${it.hands === 2 ? ' (двуручный)' : ''}`);
  if (it.armor) stats.push(`${UI_SVG.shield} Защита: <b>${it.armor}</b>`);
  if (it.slot && SLOT_NAMES[it.slot]) stats.push(`Слот: <b>${SLOT_NAMES[it.slot]}</b>`);
  if (it.onHitHeal) stats.push(`${UI_SVG.star} За удар по врагу: <b>+${it.onHitHeal} HP</b>`);
  if (it.bonusVsPassive) stats.push(`${UI_SVG.sword} Урон по мирным существам: <b>+${it.bonusVsPassive}</b>`);
  if (it.heal) stats.push(`${UI_SVG.heart} Лечит: <b>+${it.heal}</b>`);
  if (it.gathers) stats.push(`Добывает: <b>${({ tree: 'древесину', rock: 'камень/руду', sand: 'песок' })[it.gathers] || it.gathers}</b>`);
  if (it.price) {
    stats.push(`${UI_SVG.coin} Купить: <b>${buyPrice(id)}</b> зол.`);
    if (!it.nosell) stats.push(`${UI_SVG.coin} Продать: <b>${sellPrice(id)}</b> зол.`);
  }
  if (stats.length) h += `<div class="g-sec">Характеристики</div><div class="g-stats">${stats.map(s => `<div>${s}</div>`).join('')}</div>`;
  const rf = recipeFor(id);
  if (rf) h += `<div class="g-sec">Создаётся · ${STATION_NAMES[rf.station] || rf.station}</div><div class="g-row">`
    + rf.recipe.in.map(ing => link('item', ing.id, `${itemIcon(ing.id)} ${itemName(ing.id)} ×${ing.qty}`)).join('') + `</div>`;
  const src = [];
  if (GATHER_SRC[id]) src.push(GATHER_SRC[id]);
  droppedBy(id).forEach(t => src.push(`Выпадает с: ${link('mob', t, mobName(t))}`));
  if (src.length) h += `<div class="g-sec">Где взять</div><div class="g-col">${src.map(s => `<div>${s}</div>`).join('')}</div>`;
  const u = usedIn(id);
  if (u.length) h += `<div class="g-sec">Используется в</div><div class="g-row">` + u.map(o => link('item', o, `${itemIcon(o)} ${itemName(o)}`)).join('') + `</div>`;
  return h;
}
function guideMobHtml(t) {
  const m = S.mobTypes[t];
  if (!m) return 'Нет данных';
  let h = `<div class="g-head"><span class="g-bigic">${mobIcon(t)}</span><div><div class="g-name">${mobName(t)}</div><div class="g-sub">Существо</div></div></div>`;
  if (m.desc) h += `<p class="g-desc">${m.desc}</p>`;
  const stats = [`${UI_SVG.heart} Здоровье: <b>${m.maxHp}</b>`];
  if (m.canAttack && m.dmgMax) stats.push(`${UI_SVG.sword} Урон: <b>${m.dmgMin}–${m.dmgMax}</b>`);
  if (m.armor) stats.push(`${UI_SVG.shield} Броня: <b>${m.armor}</b>`);
  stats.push(`Поведение: <b>${m.aggressive ? 'агрессивное' : (m.canAttack ? 'даёт сдачи' : 'мирное')}</b>`);
  if (m.boss) stats.push(`<b style="color:#e0863b">БОСС</b>`);
  h += `<div class="g-stats">${stats.map(s => `<div>${s}</div>`).join('')}</div>`;
  const lt = m.loot, drops = Array.isArray(lt) ? lt : (lt ? [lt] : []);
  if (drops.length) h += `<div class="g-sec">Добыча</div><div class="g-row">`
    + drops.map(d => link('item', d.id, `${itemIcon(d.id)} ${itemName(d.id)}${d.qty > 1 ? ` ×${d.qty}` : ''}`)).join('') + `</div>`;
  return h;
}

export function renderGuide() {
  const body = document.getElementById('guideBody');
  if (!body) return;
  if (!S.guideNav.length) S.guideNav = [{ kind: 'index' }];
  const v = S.guideNav[S.guideNav.length - 1];
  let html, title;
  if (v.kind === 'item') { html = guideItemHtml(v.id); title = itemName(v.id); }
  else if (v.kind === 'mob') { html = guideMobHtml(v.id); title = mobName(v.id); }
  else if (v.kind === 'skill') { html = guideSkillHtml(v.id); title = skillName(v.id); }
  else { html = guideIndexHtml(); title = 'Энциклопедия'; }
  body.innerHTML = html;
  document.getElementById('guideTitle').textContent = title;
  document.getElementById('guideBack').style.display = S.guideNav.length > 1 ? '' : 'none';
}

// Обновить отображение навыков (панель персонажа + живой пересчёт вики, если открыта)
export function renderSkills() {
  const list = document.getElementById('skillsList');
  if (list) {
    list.innerHTML = Object.keys(S.skills).map(k => {
      const s = S.skills[k];
      const cur = s.xp - s.levelXp, need = s.nextXp != null ? s.nextXp - s.levelXp : 1;
      const pct = s.nextXp != null && need > 0 ? Math.round(cur / need * 100) : 100;
      return `<div class="skill-row"><span class="skill-ic">${skillIcon(k)}</span><span class="skill-nm">${s.name}</span><span class="skill-lv">ур. ${s.level}</span><div class="skill-bar"><div class="skill-bar-fill" style="width:${pct}%"></div></div></div>`;
    }).join('');
  }
  const gp = document.getElementById('guidePanel');
  if (gp && !gp.classList.contains('hidden')) renderGuide();   // живое обновление полоски опыта в вики
}
export function openGuide() { S.guideNav = [{ kind: 'index' }]; renderGuide(); }
export function guideGo(kind, id) { if (!kind || !id) return; S.guideNav.push({ kind, id }); renderGuide(); }
export function guideBack() { if (S.guideNav.length > 1) S.guideNav.pop(); renderGuide(); }

// --- Квесты (категории: Сюжетные / Побочные / Выполненные) ---
const questCats = { story: true, side: true, done: false }; // развёрнутость категорий
export function toggleQuestCat(key) { questCats[key] = !questCats[key]; renderQuests(); }
export function renderQuests() {
  const body = document.getElementById('questBody');
  if (!body) return;
  const defs = S.questDefs || {};
  const qs = S.quests || { story: 0, progress: 0, completed: [], active: {} };
  const npcDefs = defs.npc ? Object.values(defs.npc) : [];
  const findDef = (id) => [...(defs.story || []), ...npcDefs].find(q => q.id === id);

  const storyActive = (defs.story && defs.story[qs.story]) ? [defs.story[qs.story]] : []; // текущий сюжетный
  const sideActive = Object.keys(qs.active || {}).map(id => defs.npc && defs.npc[id]).filter(Boolean); // активные НПС-квесты
  const completed = (qs.completed || []).map(findDef).filter(Boolean);                    // выполненные

  const qrow = (q, mode) => {
    let tag = '';
    if (mode === 'storyActive') tag = ` <span class="q-prog">${qs.progress}/${q.count}</span>`;
    else if (mode === 'sideActive') tag = questStatusOf(q) === 'ready' ? ` <span class="q-ready">готов к сдаче</span>` : ` <span class="q-prog">${questProgress(q)}/${q.count}</span>`;
    else if (mode === 'done') tag = ` <span class="q-done">✓</span>`;
    return `<div class="q-item${mode === 'done' ? ' done' : ''}"><div class="q-title">${q.title}${tag}</div>`
      + `<div class="q-desc">${q.desc}</div><div class="q-reward">${UI_SVG.coin} ${q.reward}</div></div>`;
  };
  const cat = (key, title, items, mode) => {
    const open = questCats[key];
    return `<div class="q-cat" data-cat="${key}">${open ? '▾' : '▸'} ${title} <span class="q-count">${items.length}</span></div>`
      + (open ? `<div class="q-list">${items.length ? items.map(q => qrow(q, mode)).join('') : '<div class="q-empty">Пусто</div>'}</div>` : '');
  };
  body.innerHTML = cat('story', 'Сюжетные', storyActive, 'storyActive')
    + cat('side', 'Побочные', sideActive, 'sideActive')
    + cat('done', 'Выполненные', completed, 'done');
}

// --- Статус и прогресс НПС-квеста на клиенте (зеркалит сервер) ---
// gather считается по фактическому наличию предметов в рюкзаке, kill — по счётчику убийств с сервера.
function questTarget(def) { return def.type ? def.target : (def.gather || def.kill || def.talk); }
function questInvCount(id) { let n = 0; for (const s of (S.inventory || [])) if (s && s.id === id) n += s.qty || 1; return n; }
function isGather(def) { return def.type === 'gather' || (!def.type && def.gather); }
function isKill(def) { return def.type === 'kill' || (!def.type && def.kill); }
function questProgress(def) {
  const cnt = def.count || 1;
  if (isGather(def)) return Math.min(questInvCount(questTarget(def)), cnt);
  if (isKill(def)) return Math.min(((S.quests.active && S.quests.active[def.id]) || 0), cnt);
  return 0;
}
// 'done' | 'ready' (цель достигнута, можно сдать) | 'active' (взят, в процессе) | 'offer' (ещё не взят)
function questStatusOf(def) {
  const id = def.id;
  if ((S.quests.completed || []).includes(id)) return 'done';
  if (!(S.quests.active && S.quests.active[id] != null)) return 'offer';
  const cnt = def.count || 1;
  if (isGather(def)) return questInvCount(questTarget(def)) >= cnt ? 'ready' : 'active';
  if (isKill(def)) return (((S.quests.active[id]) || 0) >= cnt) ? 'ready' : 'active';
  return 'active'; // talk — завершается разговором, отдельной сдачи нет
}

// --- Диалог квеста от НПС (взять / отказаться / спасибо) ---
// Строка цели квеста: что и сколько нужно сделать. cur — текущий прогресс (для активного).
// Поддерживает авторский формат ({type,target,count}) и статический ({gather|kill|talk,count}).
function questObjective(def, cur = 0) {
  const cnt = def.count || 1;
  if (def.type === 'gather' || (!def.type && def.gather)) {
    const t = def.type ? def.target : def.gather;
    return `🎯 Собрать: ${escHtml(itemName(t))} — ${cur}/${cnt}`;
  }
  if (def.type === 'kill' || (!def.type && def.kill)) {
    const t = def.type ? def.target : def.kill;
    return `🎯 Убить: ${escHtml(t)} — ${cur}/${cnt}`;
  }
  if (def.type === 'talk' || (!def.type && def.talk)) {
    const t = def.type ? def.target : def.talk;
    return `🎯 Поговорить с: ${escHtml(t)}`;
  }
  return '';
}

// arg: объект-определение квеста (def) ИЛИ строка-тип моба (легаси questgiver)
export function openQuestDialog(arg) {
  let def;
  if (arg && typeof arg === 'object' && arg.id && arg.type) def = arg;              // готовое определение квеста
  else if (arg && typeof arg === 'object' && arg.quest) def = arg.quest;           // легаси: объект с .quest
  else { const qid = S.mobTypes[arg] && S.mobTypes[arg].quest; def = qid && S.questDefs.npc && S.questDefs.npc[qid]; }
  const panel = document.getElementById('questDialog');
  if (!def || !panel) return;
  hideNpcHubPanel();                                   // прячем хаб (вернётся по «Назад»), чтобы окна не накладывались
  const fromHub = !!hubNpc;
  const qid = def.id;
  const rewardLine = `Награда: ${UI_SVG.coin} ${def.reward}` + (def.rewardItem ? ` + ${escHtml(itemName(def.rewardItem.id))}${def.rewardItem.qty > 1 ? ' ×' + def.rewardItem.qty : ''}` : '');
  const status = questStatusOf(def);
  const backBtn = fromHub ? `<button class="popup-back" id="qdBack" title="Назад">←</button>` : '';
  let html = `${backBtn}<button class="popup-close" id="qdClose">✕</button><h3>${escHtml(def.title)}</h3>`;
  const goal = questObjective(def, questProgress(def));
  html += `<p class="qd-desc">${escHtml(def.desc)}</p>`;
  if (status === 'offer') {
    html += (goal ? `<div class="qd-goal">${goal}</div>` : '')
      + `<div class="qd-reward">${rewardLine}</div>`
      + `<div class="qd-btns"><button id="qdAccept" class="qd-accept">Взять</button><button id="qdDecline">Отказаться</button></div>`;
  } else if (status === 'ready') {
    html += (goal ? `<div class="qd-goal qd-goal-done">${goal} ✓</div>` : '')
      + `<div class="qd-reward">${rewardLine}</div>`
      + `<div class="qd-btns"><button id="qdTurnIn" class="qd-accept">Сдать</button><button id="qdDecline">Закрыть</button></div>`;
  } else if (status === 'active') {
    html += (goal ? `<div class="qd-goal">${goal}</div>` : '')
      + `<div class="qd-btns"><button id="qdDecline">Закрыть</button></div>`;
  } else {
    html = `${backBtn}<button class="popup-close" id="qdClose">✕</button><h3>${escHtml(def.title)}</h3>`
      + `<p class="qd-desc">${escHtml(def.thanks || 'Спасибо за помощь!')}</p>`
      + `<div class="qd-btns"><button id="qdDecline">Закрыть</button></div>`;
  }
  panel.innerHTML = html;
  panel.classList.remove('hidden');
  const hide = () => panel.classList.add('hidden');
  const backToHub = () => { hide(); if (hubNpc) openNpcHub(hubNpc); };          // вернуться к окну разговора
  const closeAll = () => { hide(); closeNpcHub(); };
  panel.querySelector('#qdClose').addEventListener('click', closeAll);
  panel.querySelector('#qdDecline').addEventListener('click', fromHub ? backToHub : hide);
  const bk = panel.querySelector('#qdBack'); if (bk) bk.addEventListener('click', backToHub);
  const acc = panel.querySelector('#qdAccept');
  if (acc) acc.addEventListener('click', () => { S.socket.emit('acceptQuest', qid); fromHub ? backToHub() : hide(); });
  const ti = panel.querySelector('#qdTurnIn');
  if (ti) ti.addEventListener('click', () => { S.socket.emit('turnInQuest', qid); fromHub ? backToHub() : hide(); });
}

// --- Окно разговора с НПС: имя, описание, кнопки (Поговорить / Квесты / Купить / Продать) ---
let hubNpc = null;
let boardState = null;   // последнее состояние доски объявлений (для перерисовки)

// Реплика НПС — отдельное окно с кнопкой «Назад» к хабу. Используется для «Поговорить» и для текста talk-квеста.
export function openNpcTalk(text) {
  const panel = document.getElementById('talkPanel');
  if (!panel || !hubNpc) { openSign(text); return; }   // нет хаба (напр. talk-квест без открытого окна) — показать табличкой
  hideNpcHubPanel();
  panel.innerHTML = `<button class="popup-back" id="talkBack" title="Назад">←</button>`
    + `<button class="popup-close" id="talkClose">✕</button>`
    + `<h3>${escHtml(hubNpc.name)}</h3>`
    + `<p class="talk-text">${escHtml(text || '…')}</p>`
    + `<div class="qd-btns"><button id="talkBackBtn">Назад</button></div>`;
  panel.classList.remove('hidden');
  const back = () => { panel.classList.add('hidden'); if (hubNpc) openNpcHub(hubNpc); };
  panel.querySelector('#talkBack').addEventListener('click', back);
  panel.querySelector('#talkBackBtn').addEventListener('click', back);
  panel.querySelector('#talkClose').addEventListener('click', () => { panel.classList.add('hidden'); closeNpcHub(); });
}
export function closeTalk() { const p = document.getElementById('talkPanel'); if (p) p.classList.add('hidden'); }
// Сообщение от НПС (завершение talk-квеста): открыть окно реплики, если есть активный хаб; иначе табличкой
export function npcHubMessage(text) { if (hubNpc) openNpcTalk(text); else openSign(text); }

// Спрятать DOM окна разговора, НЕ сбрасывая hubNpc (чтобы подокна могли вернуться по «Назад»).
function hideNpcHubPanel() { const p = document.getElementById('npcDialog'); if (p) p.classList.add('hidden'); }
// Пересобрать окно разговора, если оно сейчас открыто (после questUpdate/inventoryUpdate — статусы квестов).
export function refreshNpcHub() {
  const p = document.getElementById('npcDialog');
  if (hubNpc && p && !p.classList.contains('hidden')) openNpcHub(hubNpc);
}

const QSTATUS_TAG = { active: ' · в процессе', ready: ' · готов к сдаче', done: ' · выполнен', offer: '' };

export function openNpcHub(npc) {
  const panel = document.getElementById('npcDialog');
  if (!panel) return;
  hubNpc = npc;
  closeBuy(); closeTrade(); closeTalk();                          // одно активное окно НПС: прячем возможные подокна
  const questBtns = (npc.quests || []).map((q, i) => {
    const status = questStatusOf(q);
    const cls = status === 'ready' ? ' ready' : status === 'done' ? ' done' : '';
    return `<button class="npc-act${cls}" data-act="quest" data-i="${i}">Квест: ${escHtml(q.title)}<span class="npc-qtag">${QSTATUS_TAG[status] || ''}</span></button>`;
  }).join('');
  const talkBtn = npc.dialogue ? `<button class="npc-act" data-act="talk">Поговорить</button>` : '';
  const buyBtn = (npc.sells && npc.sells.length) ? `<button class="npc-act" data-act="buy">Купить</button>` : '';
  const sellBtn = npc.trader ? `<button class="npc-act" data-act="sell">Продать</button>` : '';
  panel.innerHTML = `<button class="popup-close" id="npcClose">✕</button>
    <h3>${escHtml(npc.name)}</h3>
    ${npc.description ? `<p class="npc-desc">${escHtml(npc.description)}</p>` : ''}
    <div class="npc-acts">${talkBtn}${questBtns}${buyBtn}${sellBtn}</div>`;
  panel.classList.remove('hidden');
  panel.querySelector('#npcClose').addEventListener('click', closeNpcHub);
  panel.querySelectorAll('.npc-act').forEach(b => b.addEventListener('click', () => {
    const act = b.dataset.act;
    if (act === 'talk') openNpcTalk(npc.dialogue);                // реплика — в отдельном окне с «Назад»
    else if (act === 'quest') openQuestDialog(npc.quests[+b.dataset.i]);
    else if (act === 'buy') openBuy(npc);
    else if (act === 'sell') { closeNpcHub(); openTrade(); }      // торговля — отдельное большое окно
  }));
}

// --- Окно покупки у НПС-продавца (цена = базовая ×2) ---
export function openBuy(npc) {
  const panel = document.getElementById('buyPanel');
  if (!panel) return;
  hideNpcHubPanel();                                   // прячем хаб (вернётся по «Назад»)
  const fromHub = !!hubNpc;
  const rows = (npc.sells || []).map(id => {
    const price = buyPrice(id);
    return `<div class="buy-row"><span class="buy-ic">${itemIcon(id)}</span><span class="buy-name">${escHtml(itemName(id))}</span><button class="buy-btn" data-id="${id}">${UI_SVG.coin} ${price}</button></div>`;
  }).join('');
  const backBtn = fromHub ? `<button class="popup-back" id="buyBack" title="Назад">←</button>` : '';
  panel.innerHTML = `${backBtn}<button class="popup-close" id="buyClose">✕</button><h3>Купить — ${escHtml(npc.name)}</h3>
    <div class="buy-list">${rows || '<div class="buy-empty">Нет товаров</div>'}</div>`;
  panel.classList.remove('hidden');
  panel.querySelector('#buyClose').addEventListener('click', () => { panel.classList.add('hidden'); closeNpcHub(); });
  const bk = panel.querySelector('#buyBack');
  if (bk) bk.addEventListener('click', () => { panel.classList.add('hidden'); if (hubNpc) openNpcHub(hubNpc); });
  panel.querySelectorAll('.buy-btn').forEach(b => b.addEventListener('click', () => S.socket.emit('buyItem', { id: b.dataset.id })));
}
export function closeBuy() { const p = document.getElementById('buyPanel'); if (p) p.classList.add('hidden'); }
export function closeNpcHub() { const p = document.getElementById('npcDialog'); if (p) p.classList.add('hidden'); hubNpc = null; }

// --- Доска объявлений (генерируемые квесты: сдавать не нужно, ресурсы не забираются, награда — золото) ---
const BOARD_VERB = { craft: 'Сделать', gather: 'Добыть', kill: 'Убить' };
function boardQuestLabel(q) {
  const verb = BOARD_VERB[q.type] || '?';
  const what = q.type === 'kill' ? mobName(q.target) : itemName(q.target);
  return `${verb} ${q.count} × ${escHtml(what)}`;
}
function boardQuestIcon(q) { return q.type === 'kill' ? mobIcon(q.target) : itemIcon(q.target); }

export function openBoard(state) {
  boardState = state || boardState;
  const panel = document.getElementById('boardPanel');
  if (!panel || !boardState) return;
  const a = boardState.active;
  let activeHtml;
  if (a) {
    const pct = Math.min(100, Math.round((a.progress / a.count) * 100));
    activeHtml = `<div class="board-active">
      <div class="board-active-h">Взятое объявление</div>
      <div class="board-row"><span class="board-ic">${boardQuestIcon(a)}</span>
        <span class="board-name">${boardQuestLabel(a)}</span></div>
      <div class="board-bar"><div class="board-bar-fill" style="width:${pct}%"></div></div>
      <div class="board-prog">${a.progress} / ${a.count} · награда ${UI_SVG.coin} ${a.reward} (придёт сама)</div>
    </div>`;
  } else {
    activeHtml = `<div class="board-hint">Можно взять одно объявление. Сдавать не нужно — награда придёт сама.</div>`;
  }
  const slots = (boardState.slots || []).map(q =>
    `<div class="board-row">
      <span class="board-ic">${boardQuestIcon(q)}</span>
      <span class="board-name">${boardQuestLabel(q)}</span>
      <span class="board-rew">${UI_SVG.coin} ${q.reward}</span>
      <button class="board-take" data-id="${q.id}"${a ? ' disabled' : ''}>Взять</button>
    </div>`).join('');
  // Сколько ждать до обновления (слоты пополняются только по таймеру)
  const leftMs = Math.max(0, (boardState.nextRefresh || 0) - Date.now());
  const mins = Math.ceil(leftMs / 60000);
  const refreshLine = `<div class="board-refresh">Новые объявления — через ~${mins} мин</div>`;
  panel.innerHTML = `<button class="popup-close" id="boardClose">✕</button>
    <h3>Доска объявлений</h3>
    ${activeHtml}
    <div class="board-list">${slots || '<div class="board-empty">Все объявления разобраны — жди обновления</div>'}</div>
    ${refreshLine}`;
  panel.classList.remove('hidden');
  panel.querySelector('#boardClose').addEventListener('click', closeBoard);
  panel.querySelectorAll('.board-take').forEach(b => b.addEventListener('click', () => S.socket.emit('acceptBoardQuest', b.dataset.id)));
}
// Тихое обновление: перерисовать, только если доска сейчас открыта (прогресс во время добычи).
export function updateBoard(state) {
  boardState = state || boardState;
  const p = document.getElementById('boardPanel');
  if (p && !p.classList.contains('hidden')) openBoard(boardState);
}
export function closeBoard() { const p = document.getElementById('boardPanel'); if (p) p.classList.add('hidden'); }
