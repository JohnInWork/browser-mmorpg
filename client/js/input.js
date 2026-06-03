// Ввод и перемещение: клавиатура, тач, клик-перемещение, поиск пути, бой по клику.
import { S } from './state.js';
import { BLOCKED, MOVE_SPEED } from './config.js';
import { screenToTile } from './iso.js';
import { addFloater, showTip, hideTip, TYPE_NAMES, openTrade, openCraft, openQuestDialog, closeInteractions } from './ui.js';

// Имя моба/НПС: из данных сервера (mobTypes), иначе из TYPE_NAMES
function mobLabel(type) { return (S.mobTypes[type] && S.mobTypes[type].name) || TYPE_NAMES[type] || 'Существо'; }

// Станция на клетке: {station, name} или null
function stationAt(x, y) {
  if (!S.MAP || !S.MAP[y]) return null;
  const t = S.MAP[y][x];
  if (t === 7) return { station: 'anvil', name: 'Наковальня' };
  if (t === 8) return { station: 'smelter', name: 'Плавильня' };
  if (t === 9) return { station: 'campfire', name: 'Костёр' };
  return null;
}
function chestAt(x, y) { return S.MAP && S.MAP[y] && S.MAP[y][x] === 10; }

function isWalkable(x, y) {
  if (!S.MAP || x < 0 || y < 0 || x >= S.mapW || y >= S.mapH) return false;
  return !BLOCKED.has(S.MAP[y][x]);
}
export function mobAt(x, y) {
  for (const id in S.mobs) { const m = S.mobs[id]; if (m.alive && m.x === x && m.y === y) return m; }
  return null;
}
// Игрок под клеткой (по видимой позиции) — для подсказки с ником при наведении
function playerAt(x, y) {
  for (const id in S.players) { const p = S.players[id]; if (Math.round(p.rx) === x && Math.round(p.ry) === y) return p; }
  return null;
}
function canStep(x, y) { return isWalkable(x, y) && !mobAt(x, y); }
function adjOrtho(ax, ay, bx, by) { return Math.abs(ax - bx) + Math.abs(ay - by) === 1; }

// --- Слой ввода (фундамент под мобильный тач) ---
function getInputDir() {
  const k = S.keys, t = S.touchDir;
  if (t.dx || t.dy) return t;                                  // тач имеет приоритет
  if (k['w'] || k['arrowup'])    return { dx: 0, dy: -1 };      // NE
  if (k['a'] || k['arrowleft'])  return { dx: -1, dy: 0 };      // NW
  if (k['s'] || k['arrowdown'])  return { dx: 0, dy: 1 };       // SW
  if (k['d'] || k['arrowright']) return { dx: 1, dy: 0 };       // SE
  return { dx: 0, dy: 0 };
}

// BFS по сетке (4 направления, в обход непроходимых тайлов и мобов)
function findPath(sx, sy, tx, ty) {
  if (!canStep(tx, ty) || (sx === tx && sy === ty)) return [];
  const key = (x, y) => y * S.mapW + x;
  const prev = new Map();
  prev.set(key(sx, sy), null);
  const queue = [{ x: sx, y: sy }];
  while (queue.length) {
    const c = queue.shift();
    if (c.x === tx && c.y === ty) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = c.x + dx, ny = c.y + dy;
      if (!canStep(nx, ny) || prev.has(key(nx, ny))) continue;
      prev.set(key(nx, ny), { x: c.x, y: c.y });
      queue.push({ x: nx, y: ny });
    }
  }
  if (!prev.has(key(tx, ty))) return [];
  const out = [];
  let cur = { x: tx, y: ty };
  while (cur && !(cur.x === sx && cur.y === sy)) { out.push(cur); cur = prev.get(key(cur.x, cur.y)); }
  return out.reverse();
}

// Подойти вплотную к клетке (моб/дерево): ближайшая проходимая соседняя клетка
function approachTo(tx, ty) {
  const me = S.players[S.myId];
  let bestPath = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const cx = tx + dx, cy = ty + dy;
    if (cx === me.x && cy === me.y) return { path: [] }; // уже вплотную
    if (!canStep(cx, cy)) continue;
    const p = findPath(me.x, me.y, cx, cy);
    if (p.length && (!bestPath || p.length < bestPath.length)) bestPath = p;
  }
  return bestPath ? { path: bestPath } : null;
}

// Активный инструмент (id «в руке») — сервер уже разрешил: слот хотбара или выбор из рюкзака.
function activeTool() { return S.activeTool; }
// Узел-ресурс под клеткой: {kind, tool, name} или null
function nodeAt(x, y) {
  if (!S.MAP || !S.MAP[y] || S.depletedNodes.has(`${x},${y}`)) return null;
  const t = S.MAP[y][x];
  if (t === 3) return { tool: 'axe', name: 'Дерево', need: 'Нужен топор' };
  if (t === 5) return { tool: 'pickaxe', name: 'Камень', need: 'Нужна кирка' };
  if (t === 6) return { tool: 'pickaxe', name: 'Железная руда', need: 'Нужна кирка' };
  return null;
}

export function setupInput() {
  const canvas = S.canvas;

  window.addEventListener('keydown', (e) => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;     // печатаем в поле (чат/ник) — игру не трогаем
    if (e.key === 'Enter') { const ci = document.getElementById('chatInput'); if (ci) ci.focus(); return; } // Enter — открыть чат
    S.keys[e.key.toLowerCase()] = true;
    // Клавиши 1–6 — активировать слот хотбара (как клик по слоту)
    if (e.key >= '1' && e.key <= '6') S.socket.emit('activateSlot', +e.key - 1);
  });
  window.addEventListener('keyup',   (e) => { S.keys[e.key.toLowerCase()] = false; });
  window.setMoveDir = (dx, dy) => { S.touchDir.dx = dx; S.touchDir.dy = dy; }; // API для будущего тач-UI

  // Наведение на интерактивное (моб/дерево) → подсказка с названием сверху по центру
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    const t = screenToTile(e.clientX - r.left, e.clientY - r.top);
    const m = mobAt(t.x, t.y);
    const pl = playerAt(t.x, t.y);
    const node = nodeAt(t.x, t.y);
    const st = stationAt(t.x, t.y);
    if (m) { showTip(mobLabel(m.type)); canvas.style.cursor = 'pointer'; }
    else if (pl) { showTip(pl.name); canvas.style.cursor = 'pointer'; }
    else if (st) { showTip(st.name); canvas.style.cursor = 'pointer'; }
    else if (chestAt(t.x, t.y)) { showTip('Сундук'); canvas.style.cursor = 'pointer'; }
    else if (node) { showTip(node.name); canvas.style.cursor = 'pointer'; }
    else { hideTip(); canvas.style.cursor = ''; }
  });
  canvas.addEventListener('mouseleave', () => { hideTip(); });

  canvas.addEventListener('click', (e) => {
    const me = S.players[S.myId];
    if (!me) return;
    const r = canvas.getBoundingClientRect();
    const t = screenToTile(e.clientX - r.left, e.clientY - r.top);

    // Клик по мобу/торговцу
    const m = mobAt(t.x, t.y);
    if (m) {
      if (m.type === 'trader') { // подойти и открыть торговлю
        const ap = approachTo(m.x, m.y);
        if (!ap) return;
        S.pendingAction = { kind: 'trade', x: m.x, y: m.y };
        S.path = ap.path; S.targetTile = null;
        return;
      }
      if (m.type === 'questgiver') { // подойти и открыть диалог квеста
        const ap = approachTo(m.x, m.y);
        if (!ap) return;
        S.pendingAction = { kind: 'questnpc', x: m.x, y: m.y, npc: m.type };
        S.path = ap.path; S.targetTile = null;
        return;
      }
      if (m.type === 'friendly') { // подойти, затем сообщить, что он мирный
        const ap = approachTo(m.x, m.y);
        if (!ap) { addFloater(me.x, me.y, 'Мирный', '#2ecc71'); return; }
        S.pendingAction = { kind: 'notice', text: 'Мирный', color: '#2ecc71' };
        S.path = ap.path; S.targetTile = null;
        return;
      }
      const ap = approachTo(m.x, m.y);
      if (!ap) return;
      S.socket.emit('engage', m.id);                 // намерение драться: этот моб не ударит первым
      S.pendingAction = { kind: 'attack', id: m.id };
      S.path = ap.path; S.targetTile = null;
      return;
    }
    // Клик по станции (плавильня/наковальня) — подойти и открыть крафт
    const st = stationAt(t.x, t.y);
    if (st) {
      const ap = approachTo(t.x, t.y);
      if (!ap) return;
      S.pendingAction = { kind: 'station', x: t.x, y: t.y, station: st.station };
      S.path = ap.path; S.targetTile = null;
      return;
    }
    // Клик по сундуку — подойти и открыть хранилище
    if (chestAt(t.x, t.y)) {
      const ap = approachTo(t.x, t.y);
      if (!ap) return;
      S.pendingAction = { kind: 'chest', x: t.x, y: t.y };
      S.path = ap.path; S.targetTile = null;
      return;
    }
    // Клик по ресурсу (дерево/камень/руда) — добывать (нужен правильный инструмент в руке)
    const node = nodeAt(t.x, t.y);
    if (node) {
      const ap = approachTo(t.x, t.y);
      if (!ap) return;
      // нет нужного инструмента — подойти, затем сообщить; иначе подойти и добывать
      if (activeTool() !== node.tool) S.pendingAction = { kind: 'notice', text: node.need, color: '#fff' };
      else S.pendingAction = { kind: 'gather', x: t.x, y: t.y };
      S.path = ap.path; S.targetTile = null;
      return;
    }
    // Иначе — обычный ход
    if (!canStep(t.x, t.y)) return;
    if (S.pendingAction) { S.pendingAction = null; S.socket.emit('stopAttack'); }
    S.path = findPath(me.x, me.y, t.x, t.y);
    S.targetTile = S.path.length ? t : null;
  });
}

// Плавный доезд отрисовочной позиции (rx,ry) к логической клетке (x,y) с постоянной скоростью.
// Используется для всех игроков. Для своего — шаг выбирает decideStep() ниже.
function glide(p, dt) {
  const dx = p.x - p.rx, dy = p.y - p.ry;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-4) { p.rx = p.x; p.ry = p.y; return; }
  if (dist > 2) { p.rx = p.x; p.ry = p.y; return; } // далеко (респаун/рассинхрон) — телепорт
  const step = MOVE_SPEED * dt;
  if (step >= dist) { p.rx = p.x; p.ry = p.y; }
  else { p.rx += (dx / dist) * step; p.ry += (dy / dist) * step; }
}

// Выбор следующего шага для своего игрока — только когда доехал до текущей клетки.
function decideStep() {
  const me = S.players[S.myId];
  if (!me) return;
  // ещё едем к текущей клетке — новый шаг не начинаем (но движение НЕ прерывается)
  if (Math.abs(me.rx - me.x) > 0.02 || Math.abs(me.ry - me.y) > 0.02) return;

  const dir = getInputDir();
  let dx = dir.dx, dy = dir.dy;
  if (dx || dy) {
    S.path = []; S.targetTile = null;
    if (S.pendingAction) { S.pendingAction = null; S.socket.emit('stopAttack'); }
  } else if (S.path.length) {
    const next = S.path[0];
    dx = next.x - me.x; dy = next.y - me.y;
    if (Math.abs(dx) + Math.abs(dy) !== 1 || !canStep(next.x, next.y)) {
      S.path = []; S.targetTile = null; return;
    }
    S.path.shift();
    if (!S.path.length) S.targetTile = null;
  } else if (S.pendingAction) {
    // дошли до цели — начинаем действие
    const a = S.pendingAction;
    if (a.kind === 'attack') {
      const m = S.mobs[a.id];
      if (m && m.alive && adjOrtho(me.x, me.y, m.x, m.y)) S.socket.emit('attack', a.id);
    } else if (a.kind === 'gather') {
      if (adjOrtho(me.x, me.y, a.x, a.y)) S.socket.emit('gather', { x: a.x, y: a.y });
    } else if (a.kind === 'trade') {
      if (adjOrtho(me.x, me.y, a.x, a.y)) openTrade();
    } else if (a.kind === 'station') {
      if (adjOrtho(me.x, me.y, a.x, a.y)) openCraft(a.station);
    } else if (a.kind === 'chest') {
      if (adjOrtho(me.x, me.y, a.x, a.y)) S.socket.emit('openBank');
    } else if (a.kind === 'questnpc') {
      if (adjOrtho(me.x, me.y, a.x, a.y)) openQuestDialog(a.npc);
    } else if (a.kind === 'notice') {
      addFloater(me.x, me.y, a.text, a.color || '#fff'); // дошли до объекта — показать сообщение
    }
    S.pendingAction = null;
    return;
  }
  if (dx === 0 && dy === 0) return;

  const nx = me.x + dx, ny = me.y + dy;
  if (!canStep(nx, ny)) { S.path = []; return; }

  me.x = nx; me.y = ny;            // фиксируем следующую клетку, дальше rx,ry плавно к ней едут
  S.socket.emit('move', { x: nx, y: ny });
  closeInteractions();             // отошёл от НПС/станции — закрыть окна взаимодействия
}

// Кадр движения: выбрать шаг + плавно подвинуть всех игроков
export function update(dt) {
  decideStep();
  for (const id in S.players) glide(S.players[id], dt);
}
