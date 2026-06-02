// Рендер: изометрический мир, мобы, игроки, эффекты.
import { S } from './state.js';
import { SCALE, TW, TH, WALL_H, TREE_H, TILE } from './config.js';
import { isoX, isoY } from './iso.js';
import { getCharImage, CHAR_RATIO, CHAR_FEET, DEFAULT_APPEARANCE } from './character.js';

// Спрайты мобов из SVG-файлов (client/assets/) — рисуются картинками
const wolfImg = new Image();
let wolfReady = false;
wolfImg.onload = () => { wolfReady = true; };
wolfImg.src = '/assets/wolf.svg';

const bearImg = new Image();
let bearReady = false;
bearImg.onload = () => { bearReady = true; };
bearImg.src = '/assets/bear.svg';

// Деревья: 2 текстуры одного дерева (для разнообразия), вариант стабилен по координатам клетки
const treeImgs = ['/assets/tree1.svg', '/assets/tree2.svg'].map(src => { const im = new Image(); im._ready = false; im.onload = () => { im._ready = true; }; im.src = src; return im; });
function treeVariant(x, y) { let h = (Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663)) >>> 0; h = (h ^ (h >>> 13)) >>> 0; return h & 1; }

function fillDiamond(cx, cy, color, stroke) {
  const ctx = S.ctx;
  ctx.beginPath();
  ctx.moveTo(cx, cy - TH / 2);
  ctx.lineTo(cx + TW / 2, cy);
  ctx.lineTo(cx, cy + TH / 2);
  ctx.lineTo(cx - TW / 2, cy);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

// Детерминированный «случайный» по клетке (стабильно между кадрами)
function tileSeed(x, y) { return (Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663)) >>> 0; }
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Трава: объёмные кустики-тафты (тёмная основа + светлые кончики, 4 оттенка), неровности земли,
// редкие цветы — всё плоскими цветами (cel, без градиентов). Вариативно и стабильно по клетке.
const GRASS_BASE = ['#5aa148', '#5fa84e', '#56a046', '#62ab51']; // 4 близких базовых зелёных
// одно лезвие травы как залитый лист (база → кончик → база)
function blade(ctx, bx, by, h, lean, w, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(bx - w, by);
  ctx.quadraticCurveTo(bx + lean * 0.4, by - h * 0.55, bx + lean, by - h);
  ctx.quadraticCurveTo(bx + lean * 0.4, by - h * 0.55, bx + w, by);
  ctx.closePath(); ctx.fill();
}
// кустик: тёмные задние лезвия + светлые передние кончики (объём)
function drawTuft(ctx, bx, by, z, rnd) {
  const n = 3 + Math.floor(rnd() * 2); // 3–4 лезвия
  for (let i = 0; i < n; i++) {        // тёмная основа (тень)
    const lean = (i - (n - 1) / 2) * 2.6 * z + (rnd() - 0.5) * 1.2 * z;
    blade(ctx, bx, by, (7 + rnd() * 4) * z, lean, 1.7 * z, '#3f8a39');
  }
  for (let i = 0; i < n; i++) {        // светлые кончики поверх (центральный — хайлайт)
    const lean = (i - (n - 1) / 2) * 2.3 * z + (rnd() - 0.5) * 1.1 * z;
    blade(ctx, bx, by - 0.5 * z, (5 + rnd() * 3.5) * z, lean, 1.2 * z, i === (n >> 1) ? '#88d06a' : '#63b653');
  }
}
function drawGrass(cx, cy, x, y) {
  const ctx = S.ctx, z = SCALE;
  const seed = tileSeed(x, y), rnd = mulberry32(seed);
  // 1) база — ровный зелёный (вариация оттенка по клетке)
  fillDiamond(cx, cy, GRASS_BASE[(seed >>> 3) & 3], 'rgba(0,0,0,.10)');
  // 2) тёмные «проплешины» земли для неровности (плоские пятна)
  ctx.fillStyle = 'rgba(42,92,42,.16)';
  for (let i = 0; i < 2; i++) {
    const px = cx + (rnd() - 0.5) * TW * 0.5, py = cy + (rnd() - 0.5) * TH * 0.5;
    ctx.beginPath(); ctx.ellipse(px, py, (4 + rnd() * 3) * z, (2 + rnd() * 1.4) * z, 0, 0, Math.PI * 2); ctx.fill();
  }
  // 3) кустики травы (густо)
  const tufts = 5 + Math.floor(rnd() * 3); // 5–7
  for (let i = 0; i < tufts; i++) {
    const bx = cx + (rnd() - 0.5) * TW * 0.7, by = cy + (rnd() - 0.5) * TH * 0.6 + 1 * z;
    drawTuft(ctx, bx, by, z, rnd);
  }
  // 4) изредка цветок (для красоты/разнообразия)
  if (rnd() < 0.12) {
    const fx = cx + (rnd() - 0.5) * TW * 0.4, fy = cy + (rnd() - 0.5) * TH * 0.35;
    ctx.fillStyle = rnd() < 0.5 ? '#eee6a3' : '#ece8ee';
    for (let p = 0; p < 4; p++) { const a = p * Math.PI / 2; ctx.beginPath(); ctx.ellipse(fx + Math.cos(a) * 1.8 * z, fy + Math.sin(a) * 1.8 * z, 1.5 * z, 1.5 * z, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#e0a83a'; ctx.beginPath(); ctx.arc(fx, fy, 1.3 * z, 0, Math.PI * 2); ctx.fill();
  }
}

// Вода: плоские тона (cel-стиль, БЕЗ градиентов) — светлый верх + тёмный низ + анимированные блики
function drawWater(cx, cy, x, y) {
  const ctx = S.ctx, z = SCALE;
  fillDiamond(cx, cy, '#4a90cf', 'rgba(0,0,0,.12)');     // верхняя половина (светлее)
  ctx.fillStyle = '#2f6aa8';                             // нижняя половина темнее — ощущение глубины
  ctx.beginPath();
  ctx.moveTo(cx - TW / 2, cy); ctx.lineTo(cx, cy + TH / 2); ctx.lineTo(cx + TW / 2, cy);
  ctx.closePath(); ctx.fill();
  const ph = performance.now() / 850 + x * 0.6 + y * 1.1;
  ctx.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    const yo = (-4 + i * 8) * z + Math.sin(ph + i * 1.7) * 1.6 * z;
    ctx.strokeStyle = i === 0 ? 'rgba(255,255,255,.30)' : 'rgba(255,255,255,.16)';
    ctx.lineWidth = 1.5 * z;
    ctx.beginPath();
    ctx.moveTo(cx - 11 * z, cy + yo);
    ctx.quadraticCurveTo(cx, cy + yo - 2.6 * z, cx + 11 * z, cy + yo);
    ctx.stroke();
  }
}

function drawCube(cx, cy, h, c) {
  const ctx = S.ctx;
  // правая грань
  ctx.beginPath();
  ctx.moveTo(cx, cy + TH / 2); ctx.lineTo(cx + TW / 2, cy);
  ctx.lineTo(cx + TW / 2, cy - h); ctx.lineTo(cx, cy + TH / 2 - h);
  ctx.closePath(); ctx.fillStyle = c.right; ctx.fill();
  // левая грань
  ctx.beginPath();
  ctx.moveTo(cx, cy + TH / 2); ctx.lineTo(cx - TW / 2, cy);
  ctx.lineTo(cx - TW / 2, cy - h); ctx.lineTo(cx, cy + TH / 2 - h);
  ctx.closePath(); ctx.fillStyle = c.left; ctx.fill();
  // верхняя грань
  fillDiamond(cx, cy - h, c.top, 'rgba(0,0,0,.15)');
}

function drawTree(cx, cy, depleted, x, y) {
  const ctx = S.ctx, z = SCALE;
  if (depleted) {
    // пень: короткий ствол + светлый срез
    ctx.fillStyle = '#6b4a2b';
    ctx.fillRect(cx - 5 * z, cy - 12 * z, 10 * z, 12 * z);
    ctx.fillStyle = '#a9743f';
    ctx.beginPath(); ctx.ellipse(cx, cy - 12 * z, 5 * z, 2.4 * z, 0, 0, Math.PI * 2); ctx.fill();
    return;
  }
  // тень под кроной
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.beginPath(); ctx.ellipse(cx, cy + 4 * z, 13 * z, 5 * z, 0, 0, Math.PI * 2); ctx.fill();
  // спрайт дерева из SVG (один из 2 вариантов, стабильно по клетке), ствол у точки клетки
  const img = treeImgs[treeVariant(x, y)];
  const W = 56 * z, H = 56 * z, top = cy + 6 * z - H;
  if (img._ready) ctx.drawImage(img, cx - W / 2, top, W, H);
}

// Камень / железная руда (фасеточный валун в cel-стиле). ore — вкрапления руды; depleted — обломки.
function drawRock(cx, cy, ore, depleted) {
  const ctx = S.ctx, z = SCALE;
  if (depleted) {
    ctx.fillStyle = '#7a808a';
    ctx.beginPath(); ctx.ellipse(cx - 3 * z, cy - 2 * z, 5 * z, 3 * z, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 5 * z, cy, 4 * z, 2.5 * z, 0, 0, Math.PI * 2); ctx.fill();
    return;
  }
  // силуэт валуна
  ctx.fillStyle = '#828892';
  ctx.beginPath();
  ctx.moveTo(cx - 20 * z, cy + 2 * z); ctx.lineTo(cx - 14 * z, cy - 14 * z); ctx.lineTo(cx + 2 * z, cy - 20 * z);
  ctx.lineTo(cx + 18 * z, cy - 11 * z); ctx.lineTo(cx + 21 * z, cy + 3 * z); ctx.lineTo(cx + 4 * z, cy + 10 * z);
  ctx.closePath(); ctx.fill();
  // светлая грань (лево-верх)
  ctx.fillStyle = '#9aa0aa';
  ctx.beginPath();
  ctx.moveTo(cx - 20 * z, cy + 2 * z); ctx.lineTo(cx - 14 * z, cy - 14 * z); ctx.lineTo(cx + 2 * z, cy - 20 * z); ctx.lineTo(cx - 2 * z, cy - 2 * z);
  ctx.closePath(); ctx.fill();
  // тёмная грань (право)
  ctx.fillStyle = '#646a74';
  ctx.beginPath();
  ctx.moveTo(cx + 2 * z, cy - 20 * z); ctx.lineTo(cx + 18 * z, cy - 11 * z); ctx.lineTo(cx + 21 * z, cy + 3 * z); ctx.lineTo(cx + 4 * z, cy + 10 * z); ctx.lineTo(cx - 2 * z, cy - 2 * z);
  ctx.closePath(); ctx.fill();
  // руда — оранжевые вкрапления
  if (ore) {
    ctx.fillStyle = '#c2641f';
    ctx.beginPath(); ctx.arc(cx - 6 * z, cy - 6 * z, 2.6 * z, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 8 * z, cy - 4 * z, 2.2 * z, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 2 * z, cy - 13 * z, 2 * z, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e6953f';
    ctx.beginPath(); ctx.arc(cx - 5 * z, cy - 7 * z, 1.1 * z, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 9 * z, cy - 5 * z, 1 * z, 0, Math.PI * 2); ctx.fill();
  }
}

// Наковальня — на деревянной колоде, чёрная наковальня
function drawAnvil(cx, cy) {
  const ctx = S.ctx, z = SCALE;
  // колода (пень)
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(cx - 12 * z, cy - 10 * z, 24 * z, 12 * z);
  ctx.fillStyle = '#6b4a2b';
  ctx.fillRect(cx, cy - 10 * z, 12 * z, 12 * z);
  // наковальня (металл)
  ctx.fillStyle = '#3a3f47';
  ctx.beginPath();
  ctx.moveTo(cx - 16 * z, cy - 22 * z); ctx.lineTo(cx + 14 * z, cy - 22 * z); ctx.lineTo(cx + 22 * z, cy - 18 * z);
  ctx.lineTo(cx + 10 * z, cy - 16 * z); ctx.lineTo(cx + 8 * z, cy - 12 * z); ctx.lineTo(cx - 8 * z, cy - 12 * z);
  ctx.lineTo(cx - 10 * z, cy - 16 * z); ctx.lineTo(cx - 14 * z, cy - 18 * z); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#52596380'; // лёгкий блик
  ctx.fillRect(cx - 16 * z, cy - 22 * z, 30 * z, 3 * z);
}

// Плавильня — каменная печь со светящимся жерлом
function drawSmelter(cx, cy) {
  const ctx = S.ctx, z = SCALE;
  // корпус печи
  ctx.fillStyle = '#7a808a';
  ctx.beginPath();
  ctx.moveTo(cx - 18 * z, cy + 2 * z); ctx.lineTo(cx - 16 * z, cy - 30 * z); ctx.lineTo(cx + 16 * z, cy - 30 * z);
  ctx.lineTo(cx + 18 * z, cy + 2 * z); ctx.closePath(); ctx.fill();
  // тёмная правая грань
  ctx.fillStyle = '#5e646e';
  ctx.beginPath(); ctx.moveTo(cx, cy + 2 * z); ctx.lineTo(cx, cy - 30 * z); ctx.lineTo(cx + 16 * z, cy - 30 * z); ctx.lineTo(cx + 18 * z, cy + 2 * z); ctx.closePath(); ctx.fill();
  // жерло с огнём
  ctx.fillStyle = '#2a2d33';
  ctx.beginPath(); ctx.ellipse(cx, cy - 10 * z, 9 * z, 7 * z, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8632a';
  ctx.beginPath(); ctx.ellipse(cx, cy - 9 * z, 6 * z, 4.5 * z, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f4b73d';
  ctx.beginPath(); ctx.ellipse(cx, cy - 8 * z, 3 * z, 2.4 * z, 0, 0, Math.PI * 2); ctx.fill();
  // труба
  ctx.fillStyle = '#646a74';
  ctx.fillRect(cx + 6 * z, cy - 40 * z, 8 * z, 12 * z);
}

function drawCampfire(cx, cy) {
  const ctx = S.ctx, z = SCALE;
  // кольцо камней
  ctx.fillStyle = '#7c8088';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * 15 * z, cy + Math.sin(a) * 7 * z, 3.6 * z, 2.9 * z, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // поленья крест-накрест
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#7a4f22'; ctx.lineWidth = 4.5 * z;
  ctx.beginPath();
  ctx.moveTo(cx - 11 * z, cy + 2 * z); ctx.lineTo(cx + 11 * z, cy - 4 * z);
  ctx.moveTo(cx - 11 * z, cy - 4 * z); ctx.lineTo(cx + 11 * z, cy + 2 * z);
  ctx.stroke();
  ctx.strokeStyle = '#9a6b34'; ctx.lineWidth = 1.6 * z;
  ctx.beginPath();
  ctx.moveTo(cx - 11 * z, cy + 2 * z); ctx.lineTo(cx + 11 * z, cy - 4 * z);
  ctx.moveTo(cx - 11 * z, cy - 4 * z); ctx.lineTo(cx + 11 * z, cy + 2 * z);
  ctx.stroke();
  // пламя (языки)
  const flame = (ox, h, w, c) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(cx + ox, cy - 2 * z);
    ctx.quadraticCurveTo(cx + ox - w, cy - h * 0.5, cx + ox, cy - h);
    ctx.quadraticCurveTo(cx + ox + w, cy - h * 0.5, cx + ox, cy - 2 * z);
    ctx.closePath(); ctx.fill();
  };
  flame(0, 26 * z, 9 * z, '#e8632a');
  flame(-3 * z, 18 * z, 6 * z, '#f4a23d');
  flame(3 * z, 16 * z, 5 * z, '#f4a23d');
  flame(0, 12 * z, 3.5 * z, '#ffe07a');
}

function drawHpBar(cx, topY, hp, maxHp) {
  const ctx = S.ctx, z = SCALE, w = 28 * z, h = 5 * z;
  const x = cx - w / 2, y = topY;
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  const frac = Math.max(0, hp / maxHp);
  ctx.fillStyle = frac > 0.5 ? '#2ecc71' : frac > 0.25 ? '#f1c40f' : '#e74c3c';
  ctx.fillRect(x, y, w * frac, h);
}

function drawChicken(cx, cy, m) {
  const ctx = S.ctx, z = SCALE * 0.5;   // курица мелкая (в 2 раза меньше прочих мобов)
  const body = m.flash > 0 ? '#ffffff' : '#f6f5ef';
  const shade = m.flash > 0 ? '#e9e9e4' : '#dcdbd0';
  // тень
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.ellipse(cx, cy + 3 * z, 14 * z, 6 * z, 0, 0, Math.PI * 2); ctx.fill();
  // лапки
  ctx.strokeStyle = '#e8902b'; ctx.lineWidth = 2 * z; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 3 * z, cy - 1 * z); ctx.lineTo(cx - 3 * z, cy + 3 * z);
  ctx.moveTo(cx + 5 * z, cy - 1 * z); ctx.lineTo(cx + 5 * z, cy + 3 * z);
  ctx.stroke();
  // хвост (перья сзади-слева)
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.moveTo(cx - 9 * z, cy - 13 * z);
  ctx.quadraticCurveTo(cx - 20 * z, cy - 20 * z, cx - 13 * z, cy - 5 * z);
  ctx.closePath(); ctx.fill();
  // тело
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(cx, cy - 9 * z, 11 * z, 10 * z, 0, 0, Math.PI * 2); ctx.fill();
  // крыло
  ctx.fillStyle = shade;
  ctx.beginPath(); ctx.ellipse(cx + 1 * z, cy - 8 * z, 6 * z, 7 * z, -0.2, 0, Math.PI * 2); ctx.fill();
  // голова
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(cx + 6 * z, cy - 19 * z, 6.5 * z, 0, Math.PI * 2); ctx.fill();
  // гребень
  ctx.fillStyle = '#e2473b';
  ctx.beginPath();
  ctx.arc(cx + 4 * z, cy - 25 * z, 2.2 * z, 0, Math.PI * 2);
  ctx.arc(cx + 7 * z, cy - 26 * z, 2.4 * z, 0, Math.PI * 2);
  ctx.arc(cx + 10 * z, cy - 25 * z, 2 * z, 0, Math.PI * 2);
  ctx.fill();
  // клюв
  ctx.fillStyle = '#f0a02a';
  ctx.beginPath();
  ctx.moveTo(cx + 12 * z, cy - 19 * z); ctx.lineTo(cx + 17 * z, cy - 18 * z); ctx.lineTo(cx + 12 * z, cy - 16.5 * z);
  ctx.closePath(); ctx.fill();
  // бородка
  ctx.fillStyle = '#e2473b';
  ctx.beginPath(); ctx.arc(cx + 12 * z, cy - 15 * z, 1.6 * z, 0, Math.PI * 2); ctx.fill();
  // глаз
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath(); ctx.arc(cx + 7 * z, cy - 20 * z, 1.5 * z, 0, Math.PI * 2); ctx.fill();
  if (m.hp < m.maxHp) drawHpBar(cx, cy - 34 * z, m.hp, m.maxHp);
}

function drawWolf(cx, cy, m) {
  const ctx = S.ctx, z = SCALE;
  // тень
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.ellipse(cx, cy + 4 * z, 18 * z, 6 * z, 0, 0, Math.PI * 2); ctx.fill();
  // спрайт волка из SVG (квадратный viewBox 512×512, ступни ~внизу)
  const W = 44 * z, H = 44 * z, top = cy + 7 * z - H;
  if (wolfReady) {
    ctx.save();
    if (m.flash > 0) ctx.globalAlpha = 0.6; // лёгкое мигание при ударе
    ctx.drawImage(wolfImg, cx - W / 2, top, W, H);
    ctx.restore();
  }
  // маркер агрессии + полоса HP (над картинкой)
  ctx.fillStyle = '#ff5b5b'; ctx.font = `bold ${Math.round(13 * z)}px sans-serif`; ctx.textAlign = 'center';
  ctx.fillText('!', cx, top + 4 * z);
  if (m.hp < m.maxHp) drawHpBar(cx, top + 8 * z, m.hp, m.maxHp);
}

function drawBear(cx, cy, m) {
  const ctx = S.ctx, z = SCALE;
  // тень
  ctx.fillStyle = 'rgba(0,0,0,.32)';
  ctx.beginPath(); ctx.ellipse(cx, cy + 5 * z, 24 * z, 8 * z, 0, 0, Math.PI * 2); ctx.fill();
  // спрайт медведя из SVG (босс — крупнее прочих)
  const W = 60 * z, H = 60 * z, top = cy + 9 * z - H;
  if (bearReady) {
    ctx.save();
    if (m.flash > 0) ctx.globalAlpha = 0.6; // лёгкое мигание при ударе
    ctx.drawImage(bearImg, cx - W / 2, top, W, H);
    ctx.restore();
  }
  // маркер агрессии + полоса HP (над картинкой)
  ctx.fillStyle = '#ff5b5b'; ctx.font = `bold ${Math.round(15 * z)}px sans-serif`; ctx.textAlign = 'center';
  ctx.fillText('!', cx, top + 4 * z);
  if (m.hp < m.maxHp) drawHpBar(cx, top + 8 * z, m.hp, m.maxHp);
}

function drawMob(cx, cy, m) {
  if (m.sprite === 'chicken') return drawChicken(cx, cy, m);
  if (m.sprite === 'wolf') return drawWolf(cx, cy, m);
  if (m.sprite === 'bear') return drawBear(cx, cy, m);
  const ctx = S.ctx, z = SCALE;
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.ellipse(cx, cy + 4 * z, 15 * z, 7 * z, 0, 0, Math.PI * 2); ctx.fill();
  const r = 13 * z;
  ctx.fillStyle = m.flash > 0 ? '#ffffff' : m.color;
  ctx.beginPath(); ctx.arc(cx, cy - r, r, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.stroke();
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath(); ctx.arc(cx - 4 * z, cy - r - 1 * z, 2 * z, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 4 * z, cy - r - 1 * z, 2 * z, 0, Math.PI * 2); ctx.fill();
  if (m.type === 'aggressive') {
    ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(13 * z)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.fillText('!', cx, cy - 2 * r - 4 * z);
  }
  if (m.hp < m.maxHp) drawHpBar(cx, cy - 2 * r - 12 * z, m.hp, m.maxHp);
}

function roundRect(x, y, w, h, r) {
  const ctx = S.ctx;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const CHAR_H = 59 * (SCALE / 1.6); // высота фигуры на экране (уменьшено в 2 раза)
function drawPlayer(cx, cy, p, isMe) {
  const ctx = S.ctx;
  // тень под ногами
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.ellipse(cx, cy + 2, 12 * (SCALE / 1.6), 5 * (SCALE / 1.6), 0, 0, Math.PI * 2); ctx.fill();
  if (isMe) { ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2; ctx.stroke(); }

  // фигура персонажа из внешности (ступни у точки клетки)
  const ent = getCharImage(p.appearance || DEFAULT_APPEARANCE, p.equipment, p.held);
  const H = CHAR_H, W = H * CHAR_RATIO;
  const topY = cy + 5 - H * CHAR_FEET;
  if (ent.ready) ctx.drawImage(ent.img, cx - W / 2, topY, W, H);

  // HP-бар над головой (только при ранении). Имя НЕ рисуем — показывается по наведению сверху экрана.
  if (p.hp != null && p.maxHp && p.hp < p.maxHp) drawHpBar(cx, topY - 4, p.hp, p.maxHp);
}

// NPC-торговец — рисуется как персонаж с золотым именем
const FORESTER_APP = { skin: '#b5793f' }; // «Лесник» — смуглее, отличается от торговца
const TRADER_APP = { skin: '#f3cfa6' };
// Одежда НПС (новая экипировка — пока только на них): чтобы не стояли голыми
const TRADER_EQUIP = { chest: 'merchantRobe', pants: 'goldPants' };
const FORESTER_EQUIP = { chest: 'forestTunic', pants: 'brownPants', boots: 'leatherBoots', gloves: 'blueGloves' };
// Маркер над квестодателем: '!' если квест можно взять, иначе ничего (взят/выполнен)
function npcMarker(m) {
  const qid = S.mobTypes[m.type] && S.mobTypes[m.type].quest;
  if (!qid) return null;
  if ((S.quests.completed || []).includes(qid)) return null;
  if (S.quests.active && S.quests.active[qid] != null) return null;
  return '!';
}
function drawNpc(cx, cy, appearance, equipment, marker) {
  const ctx = S.ctx;
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.ellipse(cx, cy + 2, 12 * (SCALE / 1.6), 5 * (SCALE / 1.6), 0, 0, Math.PI * 2); ctx.fill();
  const ent = getCharImage(appearance || DEFAULT_APPEARANCE, equipment);
  const H = CHAR_H, W = H * CHAR_RATIO, topY = cy + 5 - H * CHAR_FEET;
  if (ent.ready) ctx.drawImage(ent.img, cx - W / 2, topY, W, H);
  // Имя НЕ рисуем (по наведению). Маркер квеста — рисуем.
  if (marker) {
    ctx.fillStyle = '#f1c40f';
    ctx.font = `bold ${Math.round(17 * (SCALE / 1.6))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(marker, cx, topY - 3);
  }
}

export function render() {
  if (!S.MAP) return;
  const ctx = S.ctx;
  ctx.fillStyle = '#10131a';
  ctx.fillRect(0, 0, S.canvas.width, S.canvas.height);

  // Камера: центр экрана на игроке
  const me = S.players[S.myId];
  const camX = me ? isoX(me.rx, me.ry) : isoX(S.mapW / 2, S.mapH / 2);
  const camY = me ? isoY(me.rx, me.ry) : isoY(S.mapW / 2, S.mapH / 2);
  S.originX = S.canvas.width / 2 - camX;
  S.originY = S.canvas.height / 2 - camY;
  const ox = S.originX, oy = S.originY;

  // 1) ПОЛ
  for (let y = 0; y < S.mapH; y++) {
    for (let x = 0; x < S.mapW; x++) {
      const t = S.MAP[y][x];
      if (t === 2) continue;
      const cx = ox + isoX(x, y), cy = oy + isoY(x, y);
      if (t === 1) drawWater(cx, cy, x, y);
      else if (TILE[t].top === '#5fa84e') drawGrass(cx, cy, x, y); // трава (под деревом/камнем/станциями тоже)
      else fillDiamond(cx, cy, TILE[t].top, 'rgba(0,0,0,.18)');     // тропа и пр.
    }
  }

  // Маркер цели клика
  if (S.targetTile) {
    fillDiamond(ox + isoX(S.targetTile.x, S.targetTile.y), oy + isoY(S.targetTile.x, S.targetTile.y),
                'rgba(241,196,15,.35)', '#f1c40f');
  }

  // 2) ОБЪЕКТЫ (стены, деревья, мобы, игроки) — сортировка по глубине (x+y)
  const drawables = [];
  for (let y = 0; y < S.mapH; y++) {
    for (let x = 0; x < S.mapW; x++) {
      const t = S.MAP[y][x];
      if (t === 2) drawables.push({ d: x + y, kind: 'wall', x, y });
      else if (t === 3) drawables.push({ d: x + y + 0.1, kind: 'tree', x, y });
      else if (t === 5) drawables.push({ d: x + y + 0.1, kind: 'rock', x, y, ore: false });
      else if (t === 6) drawables.push({ d: x + y + 0.1, kind: 'rock', x, y, ore: true });
      else if (t === 7) drawables.push({ d: x + y + 0.1, kind: 'anvil', x, y });
      else if (t === 8) drawables.push({ d: x + y + 0.1, kind: 'smelter', x, y });
      else if (t === 9) drawables.push({ d: x + y + 0.1, kind: 'campfire', x, y });
    }
  }
  for (const id in S.mobs) { const m = S.mobs[id]; if (m.alive) drawables.push({ d: m.x + m.y + 0.15, kind: 'mob', m }); }
  for (const id in S.players) { const p = S.players[id]; drawables.push({ d: p.rx + p.ry + 0.2, kind: 'player', p, isMe: id === S.myId }); }
  drawables.sort((a, b) => a.d - b.d);

  for (const o of drawables) {
    if (o.kind === 'wall') drawCube(ox + isoX(o.x, o.y), oy + isoY(o.x, o.y), WALL_H, TILE[2]);
    else if (o.kind === 'tree') drawTree(ox + isoX(o.x, o.y), oy + isoY(o.x, o.y), S.depletedNodes.has(`${o.x},${o.y}`), o.x, o.y);
    else if (o.kind === 'rock') drawRock(ox + isoX(o.x, o.y), oy + isoY(o.x, o.y), o.ore, S.depletedNodes.has(`${o.x},${o.y}`));
    else if (o.kind === 'anvil') drawAnvil(ox + isoX(o.x, o.y), oy + isoY(o.x, o.y));
    else if (o.kind === 'smelter') drawSmelter(ox + isoX(o.x, o.y), oy + isoY(o.x, o.y));
    else if (o.kind === 'campfire') drawCampfire(ox + isoX(o.x, o.y), oy + isoY(o.x, o.y));
    else if (o.kind === 'mob') {
      if (o.m.type === 'trader') drawNpc(ox + isoX(o.m.x, o.m.y), oy + isoY(o.m.x, o.m.y), TRADER_APP, TRADER_EQUIP, null);
      else if (o.m.type === 'questgiver') drawNpc(ox + isoX(o.m.x, o.m.y), oy + isoY(o.m.x, o.m.y), FORESTER_APP, FORESTER_EQUIP, npcMarker(o.m));
      else drawMob(ox + isoX(o.m.x, o.m.y), oy + isoY(o.m.x, o.m.y), o.m);
    }
    else drawPlayer(ox + isoX(o.p.rx, o.p.ry), oy + isoY(o.p.rx, o.p.ry), o.p, o.isMe);
  }

  // 3) Всплывающие цифры урона
  ctx.textAlign = 'center';
  for (const f of S.floaters) {
    const fx = ox + isoX(f.wx, f.wy);
    const fy = oy + isoY(f.wx, f.wy) - 30 * SCALE - f.t * 40;
    ctx.globalAlpha = Math.max(0, 1 - f.t / 1.1);
    ctx.fillStyle = f.color;
    ctx.font = `bold ${Math.round(15 * SCALE)}px sans-serif`;
    ctx.shadowColor = 'rgba(0,0,0,.9)'; ctx.shadowBlur = 3;
    ctx.fillText(f.text, fx, fy);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;

  // 4) Эффект урона/смерти
  if (S.hurtFlash > 0 || S.deathFlash > 0) {
    const a = S.deathFlash > 0 ? S.deathFlash * 0.6 : S.hurtFlash * 0.5;
    ctx.fillStyle = `rgba(180,0,0,${a})`;
    ctx.fillRect(0, 0, S.canvas.width, S.canvas.height);
    if (S.deathFlash > 0.4) {
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.font = 'bold 40px sans-serif';
      ctx.fillText('Вы погибли', S.canvas.width / 2, S.canvas.height / 2);
    }
  }
}
