// MMORPG — одиночный тест (без сервера, открывается по file://)
// Рендерит мир из window.TEST_MAP (генерит сервер) и даёт походить одному.

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const coordsEl = document.getElementById('coords');

// Запасная карта, если map-data.js ещё не создан (совпадает с дефолтом сервера)
const G = 0, R = 1, S = 2, T = 3, P = 4;
const FALLBACK = [
  [S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S],
  [S,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,T,G,G,G,G,S],
  [S,G,G,T,G,G,G,G,G,T,G,G,G,G,G,G,G,G,G,G,G,T,G,G,S],
  [S,G,G,G,G,G,P,P,P,P,P,P,P,P,P,P,P,G,G,G,G,G,G,G,S],
  [S,G,T,G,G,G,P,G,G,G,G,G,G,G,G,G,P,G,G,G,T,G,G,G,S],
  [S,G,G,G,G,G,P,G,G,G,R,R,R,G,G,G,P,G,G,G,G,G,G,G,S],
  [S,G,G,G,T,G,P,G,G,R,R,R,R,R,G,G,P,G,G,T,G,G,G,G,S],
  [S,G,G,G,G,G,P,G,G,R,R,R,R,R,G,G,P,G,G,G,G,G,G,G,S],
  [S,G,T,G,G,G,P,G,G,G,R,R,R,G,G,G,P,G,G,G,G,T,G,G,S],
  [S,G,G,G,G,G,P,G,G,G,G,G,G,G,G,G,P,G,G,G,G,G,G,G,S],
  [S,G,G,G,G,G,P,P,P,P,P,P,P,P,P,P,P,G,G,G,T,G,G,G,S],
  [S,G,G,T,G,G,G,G,G,G,P,G,G,G,G,G,G,G,G,G,G,G,G,G,S],
  [S,G,G,G,G,G,G,T,G,G,P,G,G,T,G,G,G,G,T,G,G,G,T,G,S],
  [S,G,T,G,G,G,G,G,G,G,P,G,G,G,G,G,G,G,G,G,G,G,G,G,S],
  [S,G,G,G,G,T,G,G,G,G,P,G,G,G,T,G,G,G,G,G,T,G,G,G,S],
  [S,G,G,G,G,G,G,G,G,G,P,G,G,G,G,G,G,G,G,G,G,G,G,G,S],
  [S,G,G,T,G,G,G,T,G,G,G,G,G,G,G,T,G,G,G,T,G,G,G,G,S],
  [S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S],
];

const MAP = (window.TEST_MAP && Array.isArray(window.TEST_MAP)) ? window.TEST_MAP : FALLBACK;
const mapW = MAP[0].length, mapH = MAP.length;

const BLOCKED = new Set([1, 2, 3, 5, 6, 7, 8, 9]);
function isWalkable(x, y) {
  if (x < 0 || y < 0 || x >= mapW || y >= mapH) return false;
  return !BLOCKED.has(MAP[y][x]);
}

// --- Изометрия ---
const TW = 64, TH = 32, WALL_H = 34, TREE_H = 46;
let zoom = 1.6, camDX = 0, camDY = 0; // стартовый масштаб (как в игре); ПКМ-драг — смещение камеры
const TOP = { 0:'#5fa84e', 1:'#3a86c8', 2:'#9aa0ac', 3:'#5fa84e', 4:'#c6a96a', 5:'#5fa84e', 6:'#5fa84e', 7:'#5fa84e', 8:'#5fa84e', 9:'#5fa84e' };
const WALL = { top:'#9aa0ac', left:'#5d626d', right:'#787e8a' };

function isoX(x, y) { return (x - y) * (TW / 2) * zoom; }
function isoY(x, y) { return (x + y) * (TH / 2) * zoom; }

// --- Игрок (один) ---
function findSpawn() {
  for (let i = 0; i < 400; i++) {
    const x = 1 + Math.floor(Math.random() * (mapW - 2));
    const y = 1 + Math.floor(Math.random() * (mapH - 2));
    if (isWalkable(x, y)) return { x, y };
  }
  return { x: 1, y: 1 };
}
const me = (() => { const s = findSpawn(); return { x: s.x, y: s.y, rx: s.x, ry: s.y, color: '#e74c3c' }; })();

// --- Ввод ---
const keys = {};
window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

let moveCooldown = 0;
const STEP_DELAY = 0.14;

// клик-перемещение
let path = [], targetTile = null;
function findPath(sx, sy, tx, ty) {
  if (!isWalkable(tx, ty) || (sx === tx && sy === ty)) return [];
  const key = (x, y) => y * mapW + x;
  const prev = new Map(); prev.set(key(sx, sy), null);
  const q = [{ x: sx, y: sy }];
  while (q.length) {
    const c = q.shift();
    if (c.x === tx && c.y === ty) break;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = c.x + dx, ny = c.y + dy;
      if (!isWalkable(nx, ny) || prev.has(key(nx, ny))) continue;
      prev.set(key(nx, ny), { x: c.x, y: c.y }); q.push({ x: nx, y: ny });
    }
  }
  if (!prev.has(key(tx, ty))) return [];
  const out = []; let cur = { x: tx, y: ty };
  while (cur && !(cur.x === sx && cur.y === sy)) { out.push(cur); cur = prev.get(key(cur.x, cur.y)); }
  return out.reverse();
}

function tryMove(dt) {
  moveCooldown -= dt;
  const arrived = Math.abs(me.rx - me.x) < 0.02 && Math.abs(me.ry - me.y) < 0.02;
  if (!arrived || moveCooldown > 0) return;
  let dx = 0, dy = 0;
  if (keys['w'] || keys['arrowup'])         dy = -1;
  else if (keys['a'] || keys['arrowleft'])  dx = -1;
  else if (keys['s'] || keys['arrowdown'])  dy = 1;
  else if (keys['d'] || keys['arrowright']) dx = 1;
  if (dx || dy) { path = []; targetTile = null; }       // клавиатура отменяет путь
  else if (path.length) {
    const next = path[0]; dx = next.x - me.x; dy = next.y - me.y;
    if (Math.abs(dx) + Math.abs(dy) !== 1 || !isWalkable(next.x, next.y)) { path = []; targetTile = null; return; }
    path.shift(); if (!path.length) targetTile = null;
  }
  if (dx === 0 && dy === 0) return;
  const nx = me.x + dx, ny = me.y + dy;
  if (!isWalkable(nx, ny)) return;
  me.x = nx; me.y = ny;
  moveCooldown = STEP_DELAY;
}

// камера: пан ПКМ и зум колесом
let panning = false, lastX = 0, lastY = 0, downX = 0, downY = 0;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 2) { panning = true; lastX = e.clientX; lastY = e.clientY; }
  else if (e.button === 0) { downX = e.clientX; downY = e.clientY; }
});
window.addEventListener('mouseup', () => { panning = false; });
canvas.addEventListener('click', (e) => {
  const t = screenToTile(e.clientX, e.clientY);
  if (!isWalkable(t.x, t.y)) return;
  path = findPath(me.x, me.y, t.x, t.y);
  targetTile = path.length ? t : null;
});
canvas.addEventListener('mousemove', (e) => {
  if (panning) { camDX += e.clientX - lastX; camDY += e.clientY - lastY; lastX = e.clientX; lastY = e.clientY; }
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoom = Math.max(0.4, Math.min(2.5, zoom * (e.deltaY < 0 ? 1.1 : 1/1.1)));
}, { passive: false });

// --- Цикл ---
let last = 0;
const LERP = 9;
function frame(t) {
  const dt = Math.min((t - last) / 1000, 0.05); last = t;
  tryMove(dt);
  me.rx += (me.x - me.rx) * Math.min(1, LERP * dt);
  me.ry += (me.y - me.ry) * Math.min(1, LERP * dt);
  coordsEl.textContent = `тайл: ${me.x},${me.y}`;
  render();
  requestAnimationFrame(frame);
}

// --- Рендер ---
function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resize);
resize();

let originX = 0, originY = 0;
// Экран → тайл (учёт зума и камеры)
function screenToTile(mx, my) {
  const hw = (TW/2)*zoom, hh = (TH/2)*zoom;
  const a = (mx - originX) / hw, b = (my - originY) / hh;
  return { x: Math.round((a + b) / 2), y: Math.round((b - a) / 2) };
}
function fillDiamond(cx, cy, color, stroke) {
  const hw = (TW/2)*zoom, hh = (TH/2)*zoom;
  ctx.beginPath();
  ctx.moveTo(cx, cy - hh); ctx.lineTo(cx + hw, cy);
  ctx.lineTo(cx, cy + hh); ctx.lineTo(cx - hw, cy);
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}
function drawCube(cx, cy, h) {
  const hw = (TW/2)*zoom, hh = (TH/2)*zoom; h *= zoom;
  ctx.beginPath(); ctx.moveTo(cx, cy + hh); ctx.lineTo(cx + hw, cy);
  ctx.lineTo(cx + hw, cy - h); ctx.lineTo(cx, cy + hh - h);
  ctx.closePath(); ctx.fillStyle = WALL.right; ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx, cy + hh); ctx.lineTo(cx - hw, cy);
  ctx.lineTo(cx - hw, cy - h); ctx.lineTo(cx, cy + hh - h);
  ctx.closePath(); ctx.fillStyle = WALL.left; ctx.fill();
  fillDiamond(cx, cy - h, WALL.top, 'rgba(0,0,0,.15)');
}
function drawTree(cx, cy) {
  const z = zoom;
  ctx.fillStyle = '#6b4a2b'; ctx.fillRect(cx - 4*z, cy - (TREE_H-14)*z, 8*z, 22*z);
  ctx.fillStyle = '#2f7d32'; ctx.beginPath(); ctx.arc(cx, cy - (TREE_H-6)*z, 16*z, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#3a9140';
  ctx.beginPath(); ctx.arc(cx - 9*z, cy - (TREE_H-14)*z, 12*z, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 9*z, cy - (TREE_H-14)*z, 12*z, 0, Math.PI*2); ctx.fill();
}
function drawRock(cx, cy, ore) {
  const z = zoom;
  ctx.fillStyle = '#828892';
  ctx.beginPath(); ctx.moveTo(cx-20*z,cy+2*z); ctx.lineTo(cx-14*z,cy-14*z); ctx.lineTo(cx+2*z,cy-20*z); ctx.lineTo(cx+18*z,cy-11*z); ctx.lineTo(cx+21*z,cy+3*z); ctx.lineTo(cx+4*z,cy+10*z); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#9aa0aa'; ctx.beginPath(); ctx.moveTo(cx-20*z,cy+2*z); ctx.lineTo(cx-14*z,cy-14*z); ctx.lineTo(cx+2*z,cy-20*z); ctx.lineTo(cx-2*z,cy-2*z); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#646a74'; ctx.beginPath(); ctx.moveTo(cx+2*z,cy-20*z); ctx.lineTo(cx+18*z,cy-11*z); ctx.lineTo(cx+21*z,cy+3*z); ctx.lineTo(cx+4*z,cy+10*z); ctx.lineTo(cx-2*z,cy-2*z); ctx.closePath(); ctx.fill();
  if (ore) { ctx.fillStyle='#c2641f'; ctx.beginPath(); ctx.arc(cx-6*z,cy-6*z,2.6*z,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(cx+8*z,cy-4*z,2.2*z,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(cx+2*z,cy-13*z,2*z,0,Math.PI*2); ctx.fill(); }
}
function drawAnvil(cx, cy) { const z=zoom;
  ctx.fillStyle='#7a5230'; ctx.fillRect(cx-12*z,cy-10*z,24*z,12*z);
  ctx.fillStyle='#3a3f47'; ctx.beginPath(); ctx.moveTo(cx-16*z,cy-22*z); ctx.lineTo(cx+14*z,cy-22*z); ctx.lineTo(cx+22*z,cy-18*z); ctx.lineTo(cx+10*z,cy-16*z); ctx.lineTo(cx+8*z,cy-12*z); ctx.lineTo(cx-8*z,cy-12*z); ctx.lineTo(cx-10*z,cy-16*z); ctx.lineTo(cx-14*z,cy-18*z); ctx.closePath(); ctx.fill();
}
function drawSmelter(cx, cy) { const z=zoom;
  ctx.fillStyle='#7a808a'; ctx.beginPath(); ctx.moveTo(cx-18*z,cy+2*z); ctx.lineTo(cx-16*z,cy-30*z); ctx.lineTo(cx+16*z,cy-30*z); ctx.lineTo(cx+18*z,cy+2*z); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#2a2d33'; ctx.beginPath(); ctx.ellipse(cx,cy-10*z,9*z,7*z,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#e8632a'; ctx.beginPath(); ctx.ellipse(cx,cy-9*z,6*z,4.5*z,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#f4b73d'; ctx.beginPath(); ctx.ellipse(cx,cy-8*z,3*z,2.4*z,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#646a74'; ctx.fillRect(cx+6*z,cy-40*z,8*z,12*z);
}
function drawCampfire(cx, cy) { const z=zoom;
  ctx.fillStyle='#7c8088'; for(let i=0;i<8;i++){const a=(i/8)*Math.PI*2; ctx.beginPath(); ctx.ellipse(cx+Math.cos(a)*15*z,cy+Math.sin(a)*7*z,3.6*z,2.9*z,0,0,Math.PI*2); ctx.fill();}
  ctx.lineCap='round'; ctx.strokeStyle='#7a4f22'; ctx.lineWidth=4.5*z;
  ctx.beginPath(); ctx.moveTo(cx-11*z,cy+2*z); ctx.lineTo(cx+11*z,cy-4*z); ctx.moveTo(cx-11*z,cy-4*z); ctx.lineTo(cx+11*z,cy+2*z); ctx.stroke();
  const flame=(ox,h,w,c)=>{ctx.fillStyle=c; ctx.beginPath(); ctx.moveTo(cx+ox,cy-2*z); ctx.quadraticCurveTo(cx+ox-w,cy-h*0.5,cx+ox,cy-h); ctx.quadraticCurveTo(cx+ox+w,cy-h*0.5,cx+ox,cy-2*z); ctx.closePath(); ctx.fill();};
  flame(0,26*z,9*z,'#e8632a'); flame(-3*z,18*z,6*z,'#f4a23d'); flame(3*z,16*z,5*z,'#f4a23d'); flame(0,12*z,3.5*z,'#ffe07a');
}
function drawPlayer(cx, cy) {
  const z = zoom;
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.ellipse(cx, cy + 4*z, 14*z, 7*z, 0, 0, Math.PI*2); ctx.fill();
  const bw = 16*z, bh = 26*z;
  ctx.fillStyle = me.color;
  ctx.fillRect(cx - bw/2, cy - bh, bw, bh);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(cx - bw/2, cy - bh, bw, bh);
  ctx.fillStyle = '#f1c9a5'; ctx.beginPath(); ctx.arc(cx, cy - bh - 4*z, 8*z, 0, Math.PI*2); ctx.fill();
}

function render() {
  ctx.fillStyle = '#10131a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  originX = canvas.width/2 - isoX(me.rx, me.ry) + camDX;
  originY = canvas.height/2 - isoY(me.rx, me.ry) + camDY;

  // пол
  for (let y = 0; y < mapH; y++)
    for (let x = 0; x < mapW; x++) {
      const tt = MAP[y][x];
      if (tt === 2) continue;
      fillDiamond(originX + isoX(x, y), originY + isoY(x, y), TOP[tt], 'rgba(0,0,0,.18)');
    }

  // маркер цели клика
  if (targetTile) {
    fillDiamond(originX + isoX(targetTile.x, targetTile.y), originY + isoY(targetTile.x, targetTile.y),
                'rgba(241,196,15,.35)', '#f1c40f');
  }

  // объекты + игрок по глубине
  const drawables = [];
  for (let y = 0; y < mapH; y++)
    for (let x = 0; x < mapW; x++) {
      const tt = MAP[y][x];
      if (tt === 2) drawables.push({ d: x + y, k: 'wall', x, y });
      else if (tt === 3) drawables.push({ d: x + y + 0.1, k: 'tree', x, y });
      else if (tt === 5) drawables.push({ d: x + y + 0.1, k: 'rock', x, y, ore: false });
      else if (tt === 6) drawables.push({ d: x + y + 0.1, k: 'rock', x, y, ore: true });
      else if (tt === 7) drawables.push({ d: x + y + 0.1, k: 'anvil', x, y });
      else if (tt === 8) drawables.push({ d: x + y + 0.1, k: 'smelter', x, y });
      else if (tt === 9) drawables.push({ d: x + y + 0.1, k: 'campfire', x, y });
    }
  drawables.push({ d: me.rx + me.ry + 0.2, k: 'me' });
  drawables.sort((a, b) => a.d - b.d);
  for (const o of drawables) {
    if (o.k === 'wall') drawCube(originX + isoX(o.x, o.y), originY + isoY(o.x, o.y), WALL_H);
    else if (o.k === 'tree') drawTree(originX + isoX(o.x, o.y), originY + isoY(o.x, o.y));
    else if (o.k === 'rock') drawRock(originX + isoX(o.x, o.y), originY + isoY(o.x, o.y), o.ore);
    else if (o.k === 'anvil') drawAnvil(originX + isoX(o.x, o.y), originY + isoY(o.x, o.y));
    else if (o.k === 'smelter') drawSmelter(originX + isoX(o.x, o.y), originY + isoY(o.x, o.y));
    else if (o.k === 'campfire') drawCampfire(originX + isoX(o.x, o.y), originY + isoY(o.x, o.y));
    else drawPlayer(originX + isoX(me.rx, me.ry), originY + isoY(me.rx, me.ry));
  }
}

requestAnimationFrame(frame);
