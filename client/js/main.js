// Точка входа клиента: инициализация, экран входа, игровой цикл.
import { S } from './state.js';
import { setupNet } from './net.js';
import { setupInput, update } from './input.js';
import { render } from './render.js';
import { showTip, hideTip, closeTrade, selectedTrade, clearTradeSel, selectAllTrade, closeCraft, closeBank, chatFilters, renderChatLog, openGuide, renderGuide, guideGo, guideBack, renderQuests, toggleQuestCat, openItemMenu, setupItemMenu } from './ui.js';
import { buildCharacterSVG, PALETTES } from './character.js';
import { itemType } from './items.js';

// socket.io подключён глобально через <script> в index.html
S.socket = io();
S.canvas = document.getElementById('canvas');
S.ctx = S.canvas.getContext('2d');
window.S = S; // для отладки в консоли

const loginEl = document.getElementById('login');
const gameEl = document.getElementById('game');
const nameInput = document.getElementById('nameInput');
const playBtn = document.getElementById('playBtn');

function resize() { S.canvas.width = S.canvas.clientWidth; S.canvas.height = S.canvas.clientHeight; }
window.addEventListener('resize', resize);

// --- Окно создания персонажа ---
const previewEl = document.getElementById('charPreview');
function renderPreview() { previewEl.innerHTML = buildCharacterSVG(S.appearance); }

function buildCreator() {
  // пока только цвет кожи
  document.querySelectorAll('.swatches').forEach(box => {
    const kind = box.dataset.kind;
    if (!PALETTES[kind]) return;
    PALETTES[kind].forEach(col => {
      const sw = document.createElement('div');
      sw.className = 'swatch-c' + (S.appearance[kind] === col ? ' sel' : '');
      sw.style.background = col;
      sw.addEventListener('click', () => {
        S.appearance[kind] = col;
        box.querySelectorAll('.swatch-c').forEach(e => e.classList.remove('sel'));
        sw.classList.add('sel');
        renderPreview();
      });
      box.appendChild(sw);
    });
  });
  renderPreview();
}

function enterGame() {
  const name = nameInput.value.trim() || 'Игрок';
  S.socket.emit('setName', name);
  S.socket.emit('setAppearance', S.appearance);
  loginEl.classList.add('hidden');
  gameEl.classList.remove('hidden');
  resize();
}
playBtn.addEventListener('click', enterGame);
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') enterGame(); });

setupNet();
setupInput();
setupUi();
setupChat();
setupItemMenu();
buildCreator();

// --- Интерфейс: хотбар, инвентарь, меню ---
function setupUi() {
  const parseDrag = (e) => { try { return JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return null; } };

  // 6 слотов быстрого доступа: принимают предмет из рюкзака, отдают обратно, клик = активировать
  const hotbar = document.getElementById('hotbar');
  for (let i = 0; i < 6; i++) {
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.innerHTML = `<span class="num">${i + 1}</span>`;
    slot.addEventListener('dragstart', (e) => {
      if (S.hotbar[i]) e.dataTransfer.setData('text/plain', JSON.stringify({ from: 'hot', index: i }));
    });
    slot.addEventListener('dragover', (e) => e.preventDefault());
    slot.addEventListener('drop', (e) => {
      e.preventDefault();
      const src = parseDrag(e);
      if (src && src.from === 'inv') S.socket.emit('invToHotbar', { invIndex: src.index, slot: i });
    });
    slot.addEventListener('click', () => S.socket.emit('activateSlot', i));
    hotbar.appendChild(slot);
  }

  // сетка рюкзака 8×4 = 32 клетки: отдают предмет в хотбар, принимают обратно
  const invGrid = document.getElementById('invGrid');
  for (let i = 0; i < 32; i++) {
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.addEventListener('dragstart', (e) => {
      if (slot.dataset.itemId) e.dataTransfer.setData('text/plain', JSON.stringify({ from: 'inv', index: i }));
    });
    slot.addEventListener('dragover', (e) => e.preventDefault());
    slot.addEventListener('drop', (e) => {
      e.preventDefault();
      const src = parseDrag(e);
      if (!src) return;
      if (src.from === 'hot') S.socket.emit('hotbarToInv', { slot: src.index, invIndex: i });   // в выбранную клетку
      else if (src.from === 'inv' && src.index !== i) S.socket.emit('moveItem', { from: src.index, to: i }); // перенос внутри рюкзака
    });
    // Клик по предмету: броню — надеть; инструмент — взять «в руку» (без переноса в слот)
    slot.addEventListener('click', () => {
      const stack = S.inventory[i];
      if (!stack) return;
      const t = itemType(stack.id);
      if (t === 'armor' || t === 'weapon' || t === 'shield') S.socket.emit('equip', i);
      else if (t === 'tool') S.socket.emit('activateInv', i);
      else if (t === 'food') S.socket.emit('eat', i);
    });
    // ПКМ по предмету — контекстное меню (разделить / вики / в чат / уничтожить)
    slot.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (S.inventory[i]) openItemMenu(i, e.clientX, e.clientY);
    });
    invGrid.appendChild(slot);
  }

  // Панели (персонаж / инвентарь / меню) — взаимоисключающие
  const panels = [
    { panel: 'charPanel',  btn: 'charBtn' },
    { panel: 'invPanel',   btn: 'invBtn' },
    { panel: 'questPanel', btn: 'questBtn' },
    { panel: 'guidePanel', btn: 'guideBtn' },
    { panel: 'menuPanel',  btn: 'menuBtn' },
  ];
  panels.forEach(({ panel, btn }) => {
    const pEl = document.getElementById(panel), bEl = document.getElementById(btn);
    bEl.addEventListener('click', () => {
      const show = pEl.classList.contains('hidden');
      panels.forEach(o => { document.getElementById(o.panel).classList.add('hidden'); document.getElementById(o.btn).classList.remove('active'); });
      if (show) { pEl.classList.remove('hidden'); bEl.classList.add('active'); if (panel === 'guidePanel') openGuide(); if (panel === 'questPanel') renderQuests(); }
    });
  });

  // Энциклопедия: «Назад» и переходы по ссылкам внутри (делегирование кликов)
  document.getElementById('guideBack').addEventListener('click', () => guideBack());
  document.getElementById('guideBody').addEventListener('click', (e) => {
    const a = e.target.closest('.glink');
    if (a) guideGo(a.dataset.k, a.dataset.id);
  });

  // Квесты: клик по заголовку категории — свернуть/развернуть
  document.getElementById('questBody').addEventListener('click', (e) => {
    const c = e.target.closest('.q-cat');
    if (c) toggleQuestCat(c.dataset.cat);
  });

  // Выход = вернуться на экран входа
  document.getElementById('logoutBtn').addEventListener('click', () => location.reload());

  // Торговля: закрыть / выбрать всё / продать выделенное
  document.getElementById('tradeClose').addEventListener('click', () => closeTrade());
  document.getElementById('selectAllBtn').addEventListener('click', () => selectAllTrade());
  document.getElementById('sellSelBtn').addEventListener('click', () => {
    const sel = selectedTrade();
    if (sel.length) { S.socket.emit('sellItems', sel); clearTradeSel(); }
  });

  // Крафт: закрыть
  document.getElementById('craftClose').addEventListener('click', () => closeCraft());

  // Сундук-хранилище: закрыть / улучшить за золото
  document.getElementById('bankClose').addEventListener('click', () => closeBank());
  document.getElementById('bankUpgradeBtn').addEventListener('click', () => S.socket.emit('bankUpgrade'));

  // Подсказка-название при наведении на интерактивные кнопки (data-tip)
  document.querySelectorAll('[data-tip]').forEach((el) => {
    el.addEventListener('mouseenter', () => showTip(el.dataset.tip));
    el.addEventListener('mouseleave', hideTip);
  });
}

// --- Чат: сворачивание, фильтры категорий, отправка сообщений ---
function setupChat() {
  const chat = document.getElementById('chat');
  const input = document.getElementById('chatInput');
  const filters = document.getElementById('chatFilters');

  // Свернуть/развернуть (клик по шапке). Кнопка фильтров — отдельно, не сворачивает.
  document.getElementById('chatBar').addEventListener('click', () => chat.classList.toggle('collapsed'));
  document.getElementById('chatFilterBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    filters.classList.toggle('hidden');
  });

  // Чекбоксы фильтров — что показывать в ленте
  filters.querySelectorAll('input[type=checkbox]').forEach((cb) => {
    cb.addEventListener('change', () => { chatFilters[cb.dataset.cat] = cb.checked; renderChatLog(); });
  });

  // Ввод: Enter — отправить и вернуться к игре; Esc — закрыть поле
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const text = input.value.trim();
      if (text) S.socket.emit('chat', text);
      input.value = ''; input.blur();
      e.stopPropagation();
    } else if (e.key === 'Escape') { input.value = ''; input.blur(); }
  });
}

// Игровой цикл
let last = 0;
function frame(t) {
  const dt = Math.min((t - last) / 1000, 0.05);
  last = t;

  update(dt); // движение: выбор шага + плавный доезд всех игроков
  // таймеры эффектов
  for (const id in S.mobs) if (S.mobs[id].flash > 0) S.mobs[id].flash -= dt;
  if (S.hurtFlash > 0) S.hurtFlash -= dt;
  if (S.deathFlash > 0) S.deathFlash -= dt;
  for (let i = S.floaters.length - 1; i >= 0; i--) {
    S.floaters[i].t += dt;
    if (S.floaters[i].t > 1.1) S.floaters.splice(i, 1);
  }

  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
