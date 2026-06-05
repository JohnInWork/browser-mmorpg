// Рендер: изометрический мир, мобы, игроки, эффекты.
import { S } from './state.js';
import { SCALE, TW, TH, WALL_H, TREE_H, TILE } from './config.js';
import { isoX, isoY, screenToTile } from './iso.js';
import { getCharImage, CHAR_RATIO, CHAR_FEET, DEFAULT_APPEARANCE } from './character.js';
import { MOB_TEX_BY_ID } from './mob-textures.js';
import { HELD_ITEMS, HAND_POS } from './held-items.js';
import { FLOOR_TEX } from './floor-textures.js';

// Спрайты мобов из SVG-файлов (client/assets/) — рисуются картинками
const wolfImg = new Image();
let wolfReady = false;
wolfImg.onload = () => { wolfReady = true; };
wolfImg.src = '/assets/wolf.svg';

const bearImg = new Image();
let bearReady = false;
bearImg.onload = () => { bearReady = true; };
bearImg.src = '/assets/bear.svg';

const chickenImg = new Image();
let chickenReady = false;
chickenImg.onload = () => { chickenReady = true; };
chickenImg.src = '/assets/chicken.svg';

const chestImg = new Image();
let chestReady = false;
chestImg.onload = () => { chestReady = true; };
chestImg.src = '/assets/chest.svg';

const anvilImg = new Image();
let anvilReady = false;
anvilImg.onload = () => { anvilReady = true; };
anvilImg.src = '/assets/anvil.svg';

const campfireImg = new Image();
let campfireReady = false;
campfireImg.onload = () => { campfireReady = true; };
campfireImg.src = '/assets/campfire.svg';

// Прочие объекты — тоже из SVG-файлов (единый источник: правишь файл — меняется в игре, редакторе и палитре)
const loadImg = (src) => { const im = new Image(); im._ready = false; im.onload = () => { im._ready = true; }; im.src = src; return im; };

// Текстуры пола из FLOOR_TEX (твои svg). Кладём картинку в изо-клетку с обрезкой по ромбу.
// Возвращает true, если клетка нарисована своей текстурой (тогда процедурную не рисуем).
const floorTexImg = {};
function floorImg(path) { return floorTexImg[path] || (floorTexImg[path] = loadImg(path)); }
function drawFloorTex(f, cx, cy, x, y) {
  const t = FLOOR_TEX[f];
  if (!t) return false;
  const list = Array.isArray(t) ? t : [t];
  const path = list.length > 1 ? list[tileSeed(x, y) % list.length] : list[0];   // вариант по клетке (без повторов-сетки)
  const img = floorImg(path);
  if (!img._ready) return false;                  // ещё грузится — кадр-другой рисуем процедурно
  const ctx = S.ctx, hw = TW / 2, hh = TH / 2;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, cy - hh); ctx.lineTo(cx + hw, cy); ctx.lineTo(cx, cy + hh); ctx.lineTo(cx - hw, cy); ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, cx - hw, cy - hh, TW, TH);   // квадратную текстуру укладываем в bounding box клетки
  ctx.restore();
  return true;
}
const smelterImg = loadImg('/assets/smelter.svg');
const wellImg = loadImg('/assets/well.svg');
const sandpileImg = loadImg('/assets/sandpile.svg');
const stairsDownImg = loadImg('/assets/stairs-down.svg');
const stairsUpImg = loadImg('/assets/stairs-up.svg');
const rockImg = loadImg('/assets/rock.svg');
const oreImg = loadImg('/assets/ore.svg');
const portalImg = { 16: loadImg('/assets/portal-blue.svg'), 17: loadImg('/assets/portal-purple.svg'), 18: loadImg('/assets/portal-green.svg') };
// Новый набор объектов (рельеф/декор) — тоже из SVG
const mountainImg = loadImg('/assets/mountain.svg');
const bushImg = loadImg('/assets/bush.svg');
const boulderImg = loadImg('/assets/boulder.svg');
const fenceImg = loadImg('/assets/fence.svg');
const lampImg = loadImg('/assets/lamp.svg');
const bridgeImg = loadImg('/assets/bridge.svg');
const signImg = loadImg('/assets/sign.svg');
const workbenchImg = loadImg('/assets/workbench.svg');
const adminChestImg = loadImg('/assets/admin-chest.svg');
const silverOreImg = loadImg('/assets/silver-ore.svg');
const goldOreImg = loadImg('/assets/gold-ore.svg');
const returnStoneImg = loadImg('/assets/return-stone.svg');
// Мебель для домиков (id тайла → картинка + размер). 48 (ковёр) — проходим, остальное непроходимо.
const FURN = {
  42: { img: loadImg('/assets/table.svg'), sz: 44 },
  43: { img: loadImg('/assets/bed.png'), sz: 46 },
  44: { img: loadImg('/assets/wardrobe.svg'), sz: 48 },
  45: { img: loadImg('/assets/nightstand.svg'), sz: 40 },
  46: { img: loadImg('/assets/chair.svg'), sz: 40 },
  47: { img: loadImg('/assets/barrel.svg'), sz: 30 },
  48: { img: loadImg('/assets/rug.svg'), sz: 46 },
  49: { img: loadImg('/assets/table2.svg'), sz: 44 },
  50: { img: loadImg('/assets/wardrobe2.svg'), sz: 48 },
  51: { img: loadImg('/assets/wardrobe3.svg'), sz: 48 },
  52: { img: loadImg('/assets/barrel2.svg'), sz: 32 },
  53: { img: loadImg('/assets/barrel3.svg'), sz: 32 },
};
// Текстуры мобов из реестра (для НОВЫХ существ — общий рисовальщик; курица/волк/медведь рисуются по-своему)
const mobTexImg = {};
for (const id in MOB_TEX_BY_ID) mobTexImg[id] = loadImg(MOB_TEX_BY_ID[id].svg);
// Картинки предметов «в руке» (оружие/инструменты) — слой поверх персонажа
const heldImg = {};
for (const id in HELD_ITEMS) heldImg[id] = loadImg(HELD_ITEMS[id].src);
// Нарисовать предмет в руке поверх персонажа (не обрезается рамкой)
function drawHeldItem(cx, topY, W, H, id) {
  const def = HELD_ITEMS[id], img = heldImg[id];
  if (!def || !img || !img._ready) return;
  const hp = HAND_POS[def.hand] || HAND_POS.right;
  const hx = cx - W / 2 + (hp.x / 512) * W, hy = topY + (hp.y / 512) * H;
  const dw = (def.size / 512) * W, ar = (img.naturalHeight || 512) / (img.naturalWidth || 512), dh = dw * ar;
  const ctx = S.ctx;
  ctx.save();
  ctx.translate(hx, hy);
  if (def.rot) ctx.rotate(def.rot * Math.PI / 180);
  ctx.drawImage(img, -(def.grip.x || 0.5) * dw, -(def.grip.y || 0.5) * dh, dw, dh);
  ctx.restore();
}
// --- Обводка спрайтов (вкл/выкл в настройках) ----------------------------------------------
// Двойной контур (тёмный + светлый ореол) по силуэту спрайта. Включается S.settings.outline.
// Силуэты кэшируются по (src+размер+цвет), поэтому на FPS не влияет.
const OUTLINE = { dark: '#171210', light: '#ffffff', darkR: 1.3, lightR: 2.2, darkA: 0.9, lightA: 0.35 };
const _silCache = new Map();
function _silhouette(img, w, h, color) {
  const key = (img.src || img._okey || '') + '|' + Math.round(w) + 'x' + Math.round(h) + '|' + color;
  let c = _silCache.get(key);
  if (c) return c;
  c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0, w, h);
  x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  _silCache.set(key, c);
  return c;
}
function _ring(ctx, sil, x, y, w, h, r) { const n = 16; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; ctx.drawImage(sil, x + Math.cos(a) * r, y + Math.sin(a) * r, w, h); } }
function outlineOn() { return !!(S.settings && S.settings.outline); }
// Нарисовать любой спрайт: с обводкой (если включена) либо обычным drawImage. Уважает текущую globalAlpha (мигание при ударе).
function blit(img, x, y, w, h) {
  const ctx = S.ctx;
  if (outlineOn() && img && (img._ready || img.complete || img._okey)) {
    const base = ctx.globalAlpha;
    const ds = _silhouette(img, w, h, OUTLINE.dark), ls = _silhouette(img, w, h, OUTLINE.light);
    ctx.save();
    ctx.globalAlpha = base * OUTLINE.lightA; _ring(ctx, ls, x, y, w, h, OUTLINE.lightR);
    ctx.globalAlpha = base * OUTLINE.darkA;  _ring(ctx, ds, x, y, w, h, OUTLINE.darkR);
    ctx.restore();
  }
  ctx.drawImage(img, x, y, w, h);
}
// Обводка ПРОЦЕДУРНЫХ фигур (стены, горы — рисуются многоугольниками, не картинкой).
// Рендерим фигуру один раз в офскрин-канвас (кэш по ключу), затем выводим через blit() —
// тот же двойной контур, что и у спрайтов. При выключенной обводке рисуем напрямую (ноль накладных).
const _procCache = new Map();
function procBlit(key, cx, cy, W, H, bx, by, drawFn) {
  if (!outlineOn()) { drawFn(cx, cy); return; }
  let cv = _procCache.get(key);
  if (!cv) {
    cv = document.createElement('canvas'); cv.width = Math.ceil(W); cv.height = Math.ceil(H);
    const prev = S.ctx; S.ctx = cv.getContext('2d');
    try { drawFn(bx, by); } finally { S.ctx = prev; }   // перенаправляем отрисовку фигуры в офскрин
    cv._okey = key; cv._ready = true;
    _procCache.set(key, cv);
  }
  blit(cv, cx - bx, cy - by, cv.width, cv.height);
}
// Куб-стена (drawCube/drawWoodWall): вершина на h+hh выше cy, низ на hh ниже
function blitWall(cx, cy, key, drawFn) {
  const p = 4 * SCALE, hh = TH / 2, W = TW + 2 * p, H = WALL_H + TH + 2 * p, bx = TW / 2 + p, by = WALL_H + hh + p;
  procBlit(key, cx, cy, W, H, bx, by, drawFn);
}
// Высокая фигура (гора/пещерная скала): topExtent — насколько поднимается над cy
function blitTall(cx, cy, topExtent, key, drawFn) {
  const p = 4 * SCALE, hh = TH / 2, W = TW + 2 * p, H = topExtent + hh + 2 * p, bx = TW / 2 + p, by = topExtent + p;
  procBlit(key, cx, cy, W, H, bx, by, drawFn);
}
// Нарисовать спрайт объекта по центру клетки (как сундук/наковальня)
function objSprite(im, cx, cy, sz) { if (im && im._ready) { const W = sz * SCALE, H = sz * SCALE; blit(im, cx - W / 2, cy - H / 2 - 5 * SCALE, W, H); } }

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
const GRASS_BASE = ['#819A35', '#86a03a', '#7c9531', '#8aa440']; // 4 близких оттенка базовой травы (#819A35)
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
  for (let i = 0; i < n; i++) {        // тёмная основа (тень) — оттенок базовой травы
    const lean = (i - (n - 1) / 2) * 2.6 * z + (rnd() - 0.5) * 1.2 * z;
    blade(ctx, bx, by, (7 + rnd() * 4) * z, lean, 1.7 * z, '#5f7a2a');
  }
  for (let i = 0; i < n; i++) {        // светлые кончики поверх (центральный — хайлайт)
    const lean = (i - (n - 1) / 2) * 2.3 * z + (rnd() - 0.5) * 1.1 * z;
    blade(ctx, bx, by - 0.5 * z, (5 + rnd() * 3.5) * z, lean, 1.2 * z, i === (n >> 1) ? '#aec766' : '#93ad48');
  }
}
function drawGrass(cx, cy, x, y, base) {
  const ctx = S.ctx, z = SCALE;
  const seed = tileSeed(x, y), rnd = mulberry32(seed);
  // 1) база — ровный зелёный (вариация оттенка по клетке; base — переопределение для тёмной травы)
  fillDiamond(cx, cy, base || GRASS_BASE[(seed >>> 3) & 3], 'rgba(0,0,0,.10)');
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

// Земля / грязь: плоский ромб с пятнами темнее и редкими камешками (cel-стиль)
function drawDirt(cx, cy, x, y) {
  const ctx = S.ctx, z = SCALE;
  const rnd = mulberry32(tileSeed(x, y));
  fillDiamond(cx, cy, '#9c7a4d', 'rgba(0,0,0,.16)');
  ctx.fillStyle = 'rgba(74,52,30,.22)';
  for (let i = 0; i < 3; i++) {
    const px = cx + (rnd() - 0.5) * TW * 0.55, py = cy + (rnd() - 0.5) * TH * 0.55;
    ctx.beginPath(); ctx.ellipse(px, py, (4 + rnd() * 3) * z, (2 + rnd() * 1.4) * z, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(120,98,68,.5)';
  for (let i = 0; i < 2; i++) { const px = cx + (rnd() - 0.5) * TW * 0.5, py = cy + (rnd() - 0.5) * TH * 0.5; ctx.beginPath(); ctx.arc(px, py, 1.2 * z, 0, Math.PI * 2); ctx.fill(); }
}

// Песок (пустыня): тёплый ромб + лёгкая рябь дюн (плоские штрихи, cel)
function drawSand(cx, cy, x, y) {
  const ctx = S.ctx, z = SCALE;
  const rnd = mulberry32(tileSeed(x, y));
  fillDiamond(cx, cy, '#dcc878', 'rgba(0,0,0,.10)');
  ctx.strokeStyle = 'rgba(180,150,90,.45)'; ctx.lineWidth = 1.3 * z; ctx.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    const px = cx + (rnd() - 0.5) * TW * 0.4, py = cy + (rnd() - 0.5) * TH * 0.5;
    ctx.beginPath(); ctx.moveTo(px - 7 * z, py); ctx.quadraticCurveTo(px, py - 2 * z, px + 7 * z, py); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(245,228,170,.5)';
  const fx = cx + (rnd() - 0.5) * TW * 0.4, fy = cy + (rnd() - 0.5) * TH * 0.4;
  ctx.beginPath(); ctx.arc(fx, fy, 1.1 * z, 0, Math.PI * 2); ctx.fill();
}

// Брусчатка: плоский ромб + сетка швов (камни мостовой)
function drawCobble(cx, cy, x, y) {
  const ctx = S.ctx, z = SCALE;
  fillDiamond(cx, cy, '#8d8f97', 'rgba(0,0,0,.22)');
  ctx.strokeStyle = 'rgba(60,62,70,.35)'; ctx.lineWidth = 1;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath(); ctx.moveTo(cx - TW / 2 + (i + 1) * TW / 3, cy); ctx.lineTo(cx + (i + 1) * TW / 3 - TW / 6, cy + TH / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - TW / 2 + (i + 1) * TW / 3, cy); ctx.lineTo(cx + (i + 1) * TW / 3 - TW / 6, cy - TH / 2); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(170,172,180,.5)';
  ctx.beginPath(); ctx.ellipse(cx, cy - 2 * z, 6 * z, 3 * z, 0, 0, Math.PI * 2); ctx.fill();
}

// Цветочная поляна: трава + гарантированные яркие цветы (плоские, cel)
const FLOWER_COLORS = ['#e8556b', '#e0a83a', '#d27ad0', '#5fb0e0', '#ece8ee'];
function drawFlowers(cx, cy, x, y) {
  drawGrass(cx, cy, x, y);
  const ctx = S.ctx, z = SCALE, rnd = mulberry32(tileSeed(x, y) ^ 0x9e37);
  const n = 3 + Math.floor(rnd() * 2);
  for (let f = 0; f < n; f++) {
    const fx = cx + (rnd() - 0.5) * TW * 0.55, fy = cy + (rnd() - 0.5) * TH * 0.5;
    const col = FLOWER_COLORS[Math.floor(rnd() * FLOWER_COLORS.length)];
    ctx.fillStyle = col;
    for (let p = 0; p < 5; p++) { const a = p * Math.PI * 2 / 5; ctx.beginPath(); ctx.ellipse(fx + Math.cos(a) * 1.9 * z, fy + Math.sin(a) * 1.9 * z, 1.5 * z, 1.5 * z, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#f4d24a'; ctx.beginPath(); ctx.arc(fx, fy, 1.2 * z, 0, Math.PI * 2); ctx.fill();
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

// Гора: процедурный 3D-изо массив (скальное тело + гранёный пик + снег), вид варьируется по клетке.
// Используется как «стены»-границы — образует хаотичный красивый хребет.
function drawMountain(cx, cy, x, y) {
  const ctx = S.ctx, z = SCALE, hw = TW / 2, hh = TH / 2;
  const rnd = mulberry32(tileSeed(x, y) ^ 0x51a3);
  const bodyH = (14 + rnd() * 22) * z;          // высота скального тела
  const peakH = (20 + rnd() * 30) * z;          // высота пика над телом
  const adx = (rnd() - 0.5) * TW * 0.34;        // смещение вершины (наклон горы)
  const ty = cy - bodyH;                         // верх тела = основание пика
  // 1) Скальное тело (две боковые грани куба)
  ctx.fillStyle = '#646b75';
  ctx.beginPath(); ctx.moveTo(cx, cy + hh); ctx.lineTo(cx + hw, cy); ctx.lineTo(cx + hw, ty); ctx.lineTo(cx, ty + hh); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#474d56';
  ctx.beginPath(); ctx.moveTo(cx, cy + hh); ctx.lineTo(cx - hw, cy); ctx.lineTo(cx - hw, ty); ctx.lineTo(cx, ty + hh); ctx.closePath(); ctx.fill();
  // 2) Пик (4-гранная пирамида от верхнего ромба к вершине); задние грани — раньше
  const ax = cx + adx, ay = ty - peakH;
  const T = [cx, ty - hh], R = [cx + hw, ty], B = [cx, ty + hh], L = [cx - hw, ty];
  const face = (p1, p2, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(ax, ay); ctx.closePath(); ctx.fill(); };
  face(L, T, '#565c66');   // задняя-левая
  face(R, T, '#727983');   // задняя-правая
  face(L, B, '#5c636d');   // передняя-левая (тень)
  face(R, B, '#8a929c');   // передняя-правая (свет)
  // ребро от вершины вниз (лёгкий объём)
  ctx.strokeStyle = 'rgba(30,33,40,.35)'; ctx.lineWidth = 1.2 * z;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(B[0], B[1]); ctx.stroke();
  // 3) Снежная шапка (часто)
  if (rnd() < 0.62) {
    const sh = peakH * (0.28 + rnd() * 0.14);
    const lx = ax - (sh * 0.8), rx = ax + (sh * 0.8);
    ctx.fillStyle = '#cdd6e0';
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax, ay + sh); ctx.lineTo(lx, ay + sh * 0.7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#eef3f8';
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax, ay + sh); ctx.lineTo(rx, ay + sh * 0.7); ctx.closePath(); ctx.fill();
  }
}

// Пещерная скала-стена: тёмный объёмный изо-массив со скалистым гребнем (без снега), варьируется по клетке.
function drawCaveWall(cx, cy, x, y) {
  const ctx = S.ctx, z = SCALE, hw = TW / 2, hh = TH / 2;
  const rnd = mulberry32(tileSeed(x, y) ^ 0x7c0f);
  const bodyH = (26 + rnd() * 14) * z;          // высота стены (около WALL_H, варьируется)
  const crest = (6 + rnd() * 13) * z;           // невысокий скалистый гребень
  const adx = (rnd() - 0.5) * TW * 0.22;
  const ty = cy - bodyH;
  // тело
  ctx.fillStyle = '#4a4f59'; ctx.beginPath(); ctx.moveTo(cx, cy + hh); ctx.lineTo(cx + hw, cy); ctx.lineTo(cx + hw, ty); ctx.lineTo(cx, ty + hh); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#333842'; ctx.beginPath(); ctx.moveTo(cx, cy + hh); ctx.lineTo(cx - hw, cy); ctx.lineTo(cx - hw, ty); ctx.lineTo(cx, ty + hh); ctx.closePath(); ctx.fill();
  // скалистый верх (низкий гранёный гребень)
  const ax = cx + adx, ay = ty - crest, T = [cx, ty - hh], R = [cx + hw, ty], B = [cx, ty + hh], L = [cx - hw, ty];
  const face = (p1, p2, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(ax, ay); ctx.closePath(); ctx.fill(); };
  face(L, T, '#3a3f48'); face(R, T, '#545a64'); face(L, B, '#41464f'); face(R, B, '#646b75');
  // трещины (тёмные штрихи на гранях)
  ctx.strokeStyle = 'rgba(18,20,26,.45)'; ctx.lineWidth = 1.2 * z;
  ctx.beginPath(); ctx.moveTo(cx, cy + hh); ctx.lineTo(cx, ty + hh); ctx.stroke();           // переднее ребро
  ctx.beginPath(); ctx.moveTo(cx + hw * 0.5, cy - bodyH * 0.4); ctx.lineTo(cx + hw * 0.3, cy - bodyH * 0.05); ctx.stroke();
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
  if (img._ready) blit(img, cx - W / 2, top, W, H);
}

// Камень / железная руда (фасеточный валун в cel-стиле). ore — вкрапления руды; depleted — обломки.
function drawRock(cx, cy, ore, depleted) {
  const ctx = S.ctx, z = SCALE;
  if (depleted) {                                   // обломки после добычи
    ctx.fillStyle = '#7a808a';
    ctx.beginPath(); ctx.ellipse(cx - 3 * z, cy - 2 * z, 5 * z, 3 * z, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 5 * z, cy, 4 * z, 2.5 * z, 0, 0, Math.PI * 2); ctx.fill();
    return;
  }
  objSprite(ore ? oreImg : rockImg, cx, cy, 42);
}

// Наковальня — спрайт из SVG пользователя (client/assets/anvil.svg)
function drawAnvil(cx, cy) {
  const ctx = S.ctx, z = SCALE;
  const W = 32 * z, H = 32 * z, top = cy - H / 2 - 5 * z;   // по центру клетки, чуть приподнят
  if (anvilReady) blit(anvilImg, cx - W / 2, top, W, H);
}

// Плавильня — спрайт из SVG (client/assets/smelter.svg)
function drawSmelter(cx, cy) { objSprite(smelterImg, cx, cy, 40); }

// Костёр — спрайт из SVG пользователя (client/assets/campfire.svg)
function drawCampfire(cx, cy) {
  const ctx = S.ctx, z = SCALE;
  const W = 34 * z, H = 34 * z, top = cy - H / 2 - 5 * z;   // по центру клетки, чуть приподнят
  if (campfireReady) blit(campfireImg, cx - W / 2, top, W, H);
}

// Сундук-хранилище — спрайт из SVG пользователя (client/assets/chest.svg)
function drawChest(cx, cy) {
  const ctx = S.ctx, z = SCALE;
  const W = 32 * z, H = 32 * z, top = cy - H / 2 - 5 * z;   // по центру клетки, чуть приподнят
  if (chestReady) blit(chestImg, cx - W / 2, top, W, H);
}

// Песочная куча — спрайт из SVG; depleted — выкопана (плоское пятно)
function drawSandPile(cx, cy, depleted) {
  const ctx = S.ctx, z = SCALE;
  if (depleted) { ctx.fillStyle = '#cdb274'; ctx.beginPath(); ctx.ellipse(cx, cy, 10 * z, 4.5 * z, 0, 0, Math.PI * 2); ctx.fill(); return; }
  objSprite(sandpileImg, cx, cy, 36);
}
// Колодец — спрайт из SVG (client/assets/well.svg)
function drawWell(cx, cy) { objSprite(wellImg, cx, cy, 42); }
// Рыбное место: анимированная рябь (расходящиеся кольца) + всплывающий поплавок-пузырёк на воде.
function drawFishingSpot(cx, cy, x, y) {
  const ctx = S.ctx, z = SCALE;
  const ph = performance.now() / 600 + x * 0.7 + y * 1.3;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.4 * z;
  for (let i = 0; i < 2; i++) {                       // два расходящихся кольца ряби
    const t = (ph + i * 0.5) % 1;
    ctx.globalAlpha = 0.5 * (1 - t);
    const rad = (3 + t * 9) * z;
    ctx.beginPath(); ctx.ellipse(cx, cy, rad, rad * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 0.85; ctx.fillStyle = 'rgba(225,242,255,.9)';
  const bx = cx + Math.sin(ph * 1.7) * 4 * z, by = cy - 1 * z + Math.cos(ph * 2.1) * 1.5 * z;
  ctx.beginPath(); ctx.arc(bx, by, 1.5 * z, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
// Портал-телепорт — спрайт из SVG по цвету тайла (16/17/18)
function drawPortal(cx, cy, tile) { objSprite(portalImg[tile], cx, cy, 36); }
// Лестница-телепорт — спрайт из SVG (вниз/вверх)
function drawStairs(cx, cy, down) { objSprite(down ? stairsDownImg : stairsUpImg, cx, cy, 34); }
// Мост — лежит плоско на клетке (без подъёма), накрывает воду; по нему можно идти
// Мост — плоская клетка-настил (деревянный ромб с досками), как тайлы земли. Накрывает воду, проходим.
function drawBridge(cx, cy) {
  const ctx = S.ctx, z = SCALE, hx = TW / 2, hy = TH / 2;
  fillDiamond(cx, cy, '#a9743f', 'rgba(58,36,16,.55)');           // деревянный настил
  ctx.fillStyle = 'rgba(140,92,48,.35)';                          // нижняя половина темнее (лёгкий объём, без градиента)
  ctx.beginPath(); ctx.moveTo(cx - hx, cy); ctx.lineTo(cx, cy + hy); ctx.lineTo(cx + hx, cy); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(74,48,24,.6)'; ctx.lineWidth = 1.3 * z; ctx.lineCap = 'round';   // швы между досками (вдоль ребра ромба)
  for (const s of [0.28, 0.5, 0.72]) {
    ctx.beginPath();
    ctx.moveTo(cx - s * hx, cy - hy + s * hy);
    ctx.lineTo(cx + hx - s * hx, cy + s * hy);
    ctx.stroke();
  }
}

// Деревянные полы — у каждого свой цвет И свой узор (pat): доски '/', доски '\', паркет-сетка, ёлочка.
const WOOD_FLOORS = {
  38: { base: '#c08a4f', shade: 'rgba(150,100,55,.28)', seam: 'rgba(92,60,28,.5)',  pat: 'd1' },     // обычный — доски «/»
  39: { base: '#7a5228', shade: 'rgba(50,32,14,.30)',   seam: 'rgba(40,26,10,.55)', pat: 'd2' },     // тёмный — доски «\»
  40: { base: '#d9b277', shade: 'rgba(185,140,85,.25)', seam: 'rgba(120,82,40,.45)', pat: 'grid' },  // светлый — паркет-сетка
  41: { base: '#b3814a', shade: 'rgba(150,100,55,.28)', seam: 'rgba(92,60,28,.5)',  pat: 'herring' },// ёлочка
};
// Узоры рисуются общей функцией (используется и игрой, и редактором с тем же видом)
function woodFloorPattern(ctx, cx, cy, hx, hy, lw, w) {
  ctx.strokeStyle = w.seam; ctx.lineWidth = lw; ctx.lineCap = 'round';
  const d1 = (s) => { ctx.beginPath(); ctx.moveTo(cx + s * hx, cy - hy + s * hy); ctx.lineTo(cx - s * hx, cy + hy - s * hy); ctx.stroke(); };
  const d2 = (s) => { ctx.beginPath(); ctx.moveTo(cx - s * hx, cy - hy + s * hy); ctx.lineTo(cx + hx - s * hx, cy + s * hy); ctx.stroke(); };
  if (w.pat === 'd1') { for (const s of [0.28, 0.5, 0.72]) d1(s); }
  else if (w.pat === 'd2') { for (const s of [0.28, 0.5, 0.72]) d2(s); }
  else if (w.pat === 'grid') { for (const s of [0.34, 0.66]) { d1(s); d2(s); } }            // паркет: оба направления
  else if (w.pat === 'herring') {                                                            // ёлочка (клип по ромбу)
    ctx.save();
    ctx.beginPath(); ctx.moveTo(cx, cy - hy); ctx.lineTo(cx + hx, cy); ctx.lineTo(cx, cy + hy); ctx.lineTo(cx - hx, cy); ctx.closePath(); ctx.clip();
    const u = hy * 0.5;
    let row = 0;
    for (let yy = cy - hy; yy <= cy + hy + u; yy += u, row++) {
      for (let xx = cx - hx, col = 0; xx <= cx + hx; xx += u, col++) {
        ctx.beginPath();
        if ((row + col) % 2 === 0) { ctx.moveTo(xx, yy + u); ctx.lineTo(xx + u, yy); }
        else { ctx.moveTo(xx, yy); ctx.lineTo(xx + u, yy + u); }
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
function drawWoodFloor(cx, cy, tile) {
  const w = WOOD_FLOORS[tile] || WOOD_FLOORS[38];
  const ctx = S.ctx, hx = TW / 2, hy = TH / 2;
  fillDiamond(cx, cy, w.base, 'rgba(60,40,18,.45)');
  ctx.fillStyle = w.shade;                                         // нижняя половина чуть темнее (объём)
  ctx.beginPath(); ctx.moveTo(cx - hx, cy); ctx.lineTo(cx, cy + hy); ctx.lineTo(cx + hx, cy); ctx.closePath(); ctx.fill();
  woodFloorPattern(ctx, cx, cy, hx, hy, 1.2 * SCALE, w);
}

// Деревянная стена (для домиков) — куб с деревянными гранями и горизонтальными досками.
function drawWoodWall(cx, cy) {
  drawCube(cx, cy, WALL_H, TILE[37]);
  const ctx = S.ctx, z = SCALE, hw = TW / 2, hh = TH / 2, h = WALL_H;
  ctx.strokeStyle = 'rgba(60,38,18,.4)'; ctx.lineWidth = 1.1 * z;
  for (let k = 1; k <= 3; k++) {                                   // горизонтальные швы досок на обеих гранях
    const d = (h * k) / 4;
    ctx.beginPath(); ctx.moveTo(cx, cy + hh - d); ctx.lineTo(cx + hw, cy - d); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy + hh - d); ctx.lineTo(cx - hw, cy - d); ctx.stroke();
  }
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

function drawChicken(cx, cy, m, s = 1) {
  const ctx = S.ctx, z = SCALE * 0.5 * s;   // курица мелкая; s — множитель размера из настроек моба
  // тень
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.ellipse(cx, cy + 3 * z, 14 * z, 6 * z, 0, 0, Math.PI * 2); ctx.fill();
  // спрайт курицы из того же SVG, что в вики (viewBox -20 -27 38 31, лапки внизу у cy)
  if (chickenReady) {
    ctx.save();
    if (m.flash > 0) ctx.globalAlpha = 0.6; // мигание при ударе (как у волка/медведя)
    blit(chickenImg, cx - 20 * z, cy - 27 * z, 38 * z, 31 * z);
    ctx.restore();
  }
  // HP над головой не рисуем — здоровье показывается в интерфейсе
}

function drawWolf(cx, cy, m, s = 1) {
  const ctx = S.ctx, z = SCALE * s;
  // тень
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.ellipse(cx, cy + 4 * z, 18 * z, 6 * z, 0, 0, Math.PI * 2); ctx.fill();
  // спрайт волка из SVG (квадратный viewBox 512×512, ступни ~внизу)
  const W = 44 * z, H = 44 * z, top = cy + 7 * z - H;
  if (wolfReady) {
    ctx.save();
    if (m.flash > 0) ctx.globalAlpha = 0.6; // лёгкое мигание при ударе
    blit(wolfImg, cx - W / 2, top, W, H);
    ctx.restore();
  }
  // маркер агрессии + полоса HP (над картинкой)
  ctx.fillStyle = '#ff5b5b'; ctx.font = `bold ${Math.round(13 * z)}px sans-serif`; ctx.textAlign = 'center';
  ctx.fillText('!', cx, top + 4 * z);
  // HP над головой не рисуем — здоровье показывается в интерфейсе (своё слева, цель боя справа)
}

function drawBear(cx, cy, m, s = 1) {
  const ctx = S.ctx, z = SCALE * s;
  // тень
  ctx.fillStyle = 'rgba(0,0,0,.32)';
  ctx.beginPath(); ctx.ellipse(cx, cy + 5 * z, 24 * z, 8 * z, 0, 0, Math.PI * 2); ctx.fill();
  // спрайт медведя из SVG (босс — крупнее прочих)
  const W = 60 * z, H = 60 * z, top = cy + 9 * z - H;
  if (bearReady) {
    ctx.save();
    if (m.flash > 0) ctx.globalAlpha = 0.6; // лёгкое мигание при ударе
    blit(bearImg, cx - W / 2, top, W, H);
    ctx.restore();
  }
  // маркер агрессии + полоса HP (над картинкой)
  ctx.fillStyle = '#ff5b5b'; ctx.font = `bold ${Math.round(15 * z)}px sans-serif`; ctx.textAlign = 'center';
  ctx.fillText('!', cx, top + 4 * z);
  // HP над головой не рисуем — здоровье показывается в интерфейсе (своё слева, цель боя справа)
}

// Общий рисовальщик моба из любой текстуры реестра (для новых существ)
function drawSpriteMob(cx, cy, m) {
  const ctx = S.ctx, z = SCALE;
  const tex = MOB_TEX_BY_ID[m.sprite], img = mobTexImg[m.sprite];
  const sz = (m.size || (tex && tex.size) || 46) * z, top = cy + 7 * z - sz;
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.ellipse(cx, cy + 4 * z, sz * 0.4, sz * 0.16, 0, 0, Math.PI * 2); ctx.fill();
  if (img && img._ready) { ctx.save(); if (m.flash > 0) ctx.globalAlpha = 0.6; blit(img, cx - sz / 2, top, sz, sz); ctx.restore(); }
  if (m.aggressive) { ctx.fillStyle = '#ff5b5b'; ctx.font = `bold ${Math.round(13 * z)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('!', cx, top + 4 * z); }
  // HP над головой не рисуем — здоровье показывается в интерфейсе (своё слева, цель боя справа)
}

// Гуманоидный враг: рисуется как персонаж (своя внешность/экипировка) + красная подсветка и метка
function drawCharacterMob(cx, cy, m) {
  const ctx = S.ctx, z = SCALE;
  ctx.fillStyle = 'rgba(255,70,70,.30)';   // красная «опасная» тень под ногами
  ctx.beginPath(); ctx.ellipse(cx, cy + 4 * z, 13 * (z / 1.6), 6 * (z / 1.6), 0, 0, Math.PI * 2); ctx.fill();
  const ent = getCharImage(m.appearance || DEFAULT_APPEARANCE, m.equipment || {});
  const H = CHAR_H, W = H * CHAR_RATIO, topY = cy + 5 - H * CHAR_FEET;
  if (ent.ready) { ctx.save(); if (m.flash > 0) ctx.globalAlpha = 0.6; drawCharRim(ent.img, cx - W / 2, topY, W, H); ctx.restore(); }
  ctx.fillStyle = '#ff5b5b'; ctx.font = `bold ${Math.round(15 * (z / 1.6))}px sans-serif`; ctx.textAlign = 'center';
  ctx.fillText('!', cx, topY - 3);
}

function drawMob(cx, cy, m) {
  // множитель размера: своя настройка моба относительно базового размера текстуры (s=1 — без изменений)
  const baseSize = (MOB_TEX_BY_ID[m.sprite] && MOB_TEX_BY_ID[m.sprite].size) || 46;
  const s = m.size ? m.size / baseSize : 1;
  if (m.sprite === 'character') return drawCharacterMob(cx, cy, m);      // гуманоидный враг (внешность как у персонажа)
  if (m.sprite === 'chicken') return drawChicken(cx, cy, m, s);
  if (m.sprite === 'wolf') return drawWolf(cx, cy, m, s);
  if (m.sprite === 'bear') return drawBear(cx, cy, m, s);
  if (m.sprite && mobTexImg[m.sprite]) return drawSpriteMob(cx, cy, m);   // новая текстура (size — абсолютный)
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
  if (m.aggressive) {
    ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(13 * z)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.fillText('!', cx, cy - 2 * r - 4 * z);
  }
  // HP над головой не рисуем — здоровье показывается в интерфейсе
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

// Тёмный ореол-подложка по контуру фигуры: отделяет персонажа от фона, чтобы он не сливался
// и не казался плоской картонкой. Силуэт следует за прозрачностью спрайта (рисуем картинку как «тень»).
function drawCharRim(img, x, y, w, h) {
  if (outlineOn()) { blit(img, x, y, w, h); return; }        // режим обводки — общий двойной контур (как у всех объектов)
  const ctx = S.ctx, z = SCALE / 1.6;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.3)';
  ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 1.5 * z;
  ctx.shadowBlur = 9 * z; ctx.drawImage(img, x, y, w, h);   // мягкий растушёванный ореол (один проход — без жёсткого чёрного контура)
  ctx.restore();
  ctx.drawImage(img, x, y, w, h);                            // сама фигура поверх (без тени)
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
  if (ent.ready) drawCharRim(ent.img, cx - W / 2, topY, W, H);
  if (p.held && HELD_ITEMS[p.held]) drawHeldItem(cx, topY, W, H, p.held);   // предмет в руке (слой поверх)

  // HP над головой НЕ рисуем — здоровье показывается в интерфейсе (своя панель слева сверху).
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
  if (ent.ready) drawCharRim(ent.img, cx - W / 2, topY, W, H);
  // Имя НЕ рисуем (по наведению). Маркер квеста — рисуем.
  if (marker) {
    ctx.fillStyle = '#f1c40f';
    ctx.font = `bold ${Math.round(17 * (SCALE / 1.6))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(marker, cx, topY - 3);
  }
}

// Маркер квеста авторского НПС: '!' если есть невзятый квест, '?' если есть взятый незавершённый
function authNpcMarker(n) {
  const qs = n.quests || [];
  let active = false;
  for (const q of qs) {
    if ((S.quests.completed || []).includes(q.id)) continue;
    if (S.quests.active && S.quests.active[q.id] != null) { active = true; continue; }
    return '!';   // есть доступный к взятию
  }
  return active ? '?' : null;
}
// Авторский НПС: персонаж со своей внешностью/экипировкой + имя + маркер квеста
function drawAuthNpc(cx, cy, n) {
  const ctx = S.ctx;
  drawNpc(cx, cy, n.appearance, n.equipment, authNpcMarker(n));
  if (n.name) {   // имя над головой (маленькое, с тенью)
    const topY = cy + 5 - CHAR_H * CHAR_FEET;
    ctx.fillStyle = '#fff'; ctx.font = `${Math.round(11 * (SCALE / 1.6))}px sans-serif`; ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,.9)'; ctx.shadowBlur = 3;
    ctx.fillText(n.name, cx, topY - 14 * (SCALE / 1.6));
    ctx.shadowBlur = 0;
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

  // Видимая область карты (отсечение): рисуем только клетки рядом с экраном — карта может быть огромной.
  // Запас по краям, побольше снизу/справа: высокие объекты (стены/деревья/горы) торчат вверх от своей клетки.
  const cc = [screenToTile(0, 0), screenToTile(S.canvas.width, 0), screenToTile(0, S.canvas.height), screenToTile(S.canvas.width, S.canvas.height)];
  const vMinX = Math.max(0, Math.min(cc[0].x, cc[1].x, cc[2].x, cc[3].x) - 3);
  const vMaxX = Math.min(S.mapW - 1, Math.max(cc[0].x, cc[1].x, cc[2].x, cc[3].x) + 6);
  const vMinY = Math.max(0, Math.min(cc[0].y, cc[1].y, cc[2].y, cc[3].y) - 3);
  const vMaxY = Math.min(S.mapH - 1, Math.max(cc[0].y, cc[1].y, cc[2].y, cc[3].y) + 6);

  // 1) ПОЛ (из слоя FLOOR — он лежит под объектами; тропа/вода сохраняются под сундуком и т.п.)
  for (let y = vMinY; y <= vMaxY; y++) {
    for (let x = vMinX; x <= vMaxX; x++) {
      if (S.MAP[y][x] === 2 || S.MAP[y][x] === 32 || S.MAP[y][x] === 37) continue; // под стеной/скалой/дерев.стеной пол не рисуем
      const f = (S.FLOOR[y] && S.FLOOR[y][x]) || 0;                 // тайл пола
      const cx = ox + isoX(x, y), cy = oy + isoY(x, y);
      if (drawFloorTex(f, cx, cy, x, y)) continue;                  // своя текстура пользователя (если задана и загружена)
      if (f === 1) drawWater(cx, cy, x, y);
      else if (f === 4) fillDiamond(cx, cy, TILE[4].top, 'rgba(0,0,0,.18)'); // тропа
      else if (f === 15) fillDiamond(cx, cy, '#3b3b46', 'rgba(0,0,0,.3)');   // пещерный пол (Шахты)
      else if (f === 20) drawDirt(cx, cy, x, y);                    // земля / грязь
      else if (f === 21) drawGrass(cx, cy, x, y, '#3f7e3a');        // тёмная трава (поляна)
      else if (f === 22) drawFlowers(cx, cy, x, y);                 // цветочная поляна
      else if (f === 23) drawCobble(cx, cy, x, y);                  // брусчатка
      else if (f === 31) drawSand(cx, cy, x, y);                    // песок (пустыня)
      else if (f === 29) drawBridge(cx, cy);                        // мост — теперь обычный пол
      else if (f >= 38 && f <= 41) drawWoodFloor(cx, cy, f);        // деревянные полы (разные виды)
      else drawGrass(cx, cy, x, y);                                 // трава (0) по умолчанию
    }
  }

  // 1.5) ОБВОДКА ТАЙЛОВ: тонкая сетка по каждому тайлу + более сильный контур по берегу (суша↔вода).
  if (outlineOn()) {
    const ctx = S.ctx, hw = TW / 2, hh = TH / 2;
    const isWall = (xx, yy) => { const t = S.MAP[yy][xx]; return t === 2 || t === 32 || t === 37; };
    const isWater = (xx, yy) => {
      if (xx < 0 || yy < 0 || xx >= S.mapW || yy >= S.mapH) return true;                 // за картой — как «вода» (край суши)
      if (isWall(xx, yy)) return false;                                                   // стены — не вода
      return ((S.FLOOR[yy] && S.FLOOR[yy][xx]) || 0) === 1;                               // вода
    };
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // а) Сетка: контур каждого тайла (кроме клеток под стенами — там пол не рисуется). Одна линия — дёшево.
    const grid = new Path2D();
    for (let y = vMinY; y <= vMaxY; y++) {
      for (let x = vMinX; x <= vMaxX; x++) {
        if (isWall(x, y)) continue;
        const cx = ox + isoX(x, y), cy = oy + isoY(x, y);
        grid.moveTo(cx, cy - hh); grid.lineTo(cx + hw, cy); grid.lineTo(cx, cy + hh); grid.lineTo(cx - hw, cy); grid.closePath();
      }
    }
    ctx.strokeStyle = OUTLINE.dark; ctx.lineWidth = 1.1; ctx.globalAlpha = 0.4; ctx.stroke(grid);
    // б) Берег: рёбра суши у воды/края — двойной контур поверх сетки (акцент)
    for (let y = vMinY; y <= vMaxY; y++) {
      for (let x = vMinX; x <= vMaxX; x++) {
        if (isWater(x, y) || isWall(x, y)) continue;                                      // только суша
        const cx = ox + isoX(x, y), cy = oy + isoY(x, y);
        const T = [cx, cy - hh], R = [cx + hw, cy], B = [cx, cy + hh], L = [cx - hw, cy];
        const segs = [];
        if (isWater(x, y - 1)) segs.push([T, R]);                                         // верх-право
        if (isWater(x + 1, y)) segs.push([R, B]);                                         // низ-право
        if (isWater(x, y + 1)) segs.push([B, L]);                                         // низ-лево
        if (isWater(x - 1, y)) segs.push([L, T]);                                         // верх-лево
        if (!segs.length) continue;
        for (const pass of [[OUTLINE.dark, 2.6, OUTLINE.darkA], [OUTLINE.light, 1.0, OUTLINE.lightA]]) {
          ctx.strokeStyle = pass[0]; ctx.lineWidth = pass[1]; ctx.globalAlpha = pass[2];
          ctx.beginPath();
          for (const s of segs) { ctx.moveTo(s[0][0], s[0][1]); ctx.lineTo(s[1][0], s[1][1]); }
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  // 2) ОБЪЕКТЫ (стены, деревья, мобы, игроки) — сортировка по глубине (x+y); только видимая область
  const drawables = [];
  for (let y = vMinY; y <= vMaxY; y++) {
    for (let x = vMinX; x <= vMaxX; x++) {
      const t = S.MAP[y][x];
      if (t === 2) drawables.push({ d: x + y, kind: 'wall', x, y });
      else if (t === 37) drawables.push({ d: x + y, kind: 'woodWall', x, y });
      else if (t === 32) drawables.push({ d: x + y, kind: 'caveWall', x, y });
      else if (t === 3) drawables.push({ d: x + y + 0.1, kind: 'tree', x, y });
      else if (t === 5) drawables.push({ d: x + y + 0.1, kind: 'rock', x, y, ore: false });
      else if (t === 6) drawables.push({ d: x + y + 0.1, kind: 'rock', x, y, ore: true });
      else if (t === 7) drawables.push({ d: x + y + 0.1, kind: 'anvil', x, y });
      else if (t === 8) drawables.push({ d: x + y + 0.1, kind: 'smelter', x, y });
      else if (t === 9) drawables.push({ d: x + y + 0.1, kind: 'campfire', x, y });
      else if (t === 10) drawables.push({ d: x + y + 0.1, kind: 'chest', x, y });
      else if (t === 11) drawables.push({ d: x + y + 0.1, kind: 'sandpile', x, y });
      else if (t === 12) drawables.push({ d: x + y + 0.1, kind: 'well', x, y });
      else if (t === 13) drawables.push({ d: x + y + 0.1, kind: 'stairsDown', x, y });
      else if (t === 14) drawables.push({ d: x + y + 0.1, kind: 'stairsUp', x, y });
      else if (t === 16 || t === 17 || t === 18) drawables.push({ d: x + y + 0.1, kind: 'portal', x, y, t });
      else if (t === 24) drawables.push({ d: x + y + 0.1, kind: 'mountain', x, y });
      else if (t === 25) drawables.push({ d: x + y + 0.1, kind: 'bush', x, y });
      else if (t === 26) drawables.push({ d: x + y + 0.1, kind: 'boulder', x, y });
      else if (t === 27) drawables.push({ d: x + y + 0.1, kind: 'fence', x, y });
      else if (t === 28) drawables.push({ d: x + y + 0.1, kind: 'lamp', x, y });
      else if (t === 30) drawables.push({ d: x + y + 0.1, kind: 'sign', x, y });
      else if (t === 33) drawables.push({ d: x + y + 0.1, kind: 'workbench', x, y });
      else if (t === 34) drawables.push({ d: x + y + 0.1, kind: 'adminChest', x, y });
      else if (t === 35) drawables.push({ d: x + y + 0.1, kind: 'silverOre', x, y });
      else if (t === 54) drawables.push({ d: x + y + 0.1, kind: 'goldOre', x, y });
      else if (t === 36) drawables.push({ d: x + y + 0.1, kind: 'returnStone', x, y });
      else if (FURN[t]) drawables.push({ d: x + y + 0.1, kind: 'furn', x, y, t });
    }
  }
  // Мобы и игроки — только из текущей локации
  for (const id in S.mobs) { const m = S.mobs[id]; if (m.alive && m.location === S.location) drawables.push({ d: m.x + m.y + 0.15, kind: 'mob', m }); }
  for (const n of (S.npcs || [])) drawables.push({ d: n.x + n.y + 0.16, kind: 'authNpc', n });   // авторские НПС
  for (const s of (S.spots || [])) drawables.push({ d: s.x + s.y + 0.05, kind: 'fishspot', x: s.x, y: s.y }); // рыбные места (рябь на воде)
  for (const id in S.players) { const p = S.players[id]; if ((p.location || 'surface') === S.location) drawables.push({ d: p.rx + p.ry + 0.2, kind: 'player', p, isMe: id === S.myId }); }
  drawables.sort((a, b) => a.d - b.d);

  for (const o of drawables) {
    if (o.kind === 'wall') blitWall(ox + isoX(o.x, o.y), oy + isoY(o.x, o.y), 'wall', (x, y) => drawCube(x, y, WALL_H, TILE[2]));
    else if (o.kind === 'woodWall') blitWall(ox + isoX(o.x, o.y), oy + isoY(o.x, o.y), 'woodWall', (x, y) => drawWoodWall(x, y));
    else if (o.kind === 'caveWall') blitTall(ox + isoX(o.x, o.y), oy + isoY(o.x, o.y), 59 * SCALE, `cw:${S.location}:${o.x},${o.y}`, (x, y) => drawCaveWall(x, y, o.x, o.y));
    else if (o.kind === 'tree') drawTree(ox + isoX(o.x, o.y), oy + isoY(o.x, o.y), S.depletedNodes.has(`${o.x},${o.y}`), o.x, o.y);
    else if (o.kind === 'rock') drawRock(ox + isoX(o.x, o.y), oy + isoY(o.x, o.y), o.ore, S.depletedNodes.has(`${o.x},${o.y}`));
    else if (o.kind === 'anvil') drawAnvil(ox + isoX(o.x, o.y), oy + isoY(o.x, o.y));
    else if (o.kind === 'smelter') drawSmelter(ox + isoX(o.x, o.y), oy + isoY(o.x, o.y));
    else if (o.kind === 'campfire') drawCampfire(ox + isoX(o.x, o.y), oy + isoY(o.x, o.y));
    else if (o.kind === 'chest') drawChest(ox + isoX(o.x, o.y), oy + isoY(o.x, o.y));
    else if (o.kind === 'sandpile') drawSandPile(ox + isoX(o.x, o.y), oy + isoY(o.x, o.y), S.depletedNodes.has(`${o.x},${o.y}`));
    else if (o.kind === 'well') drawWell(ox + isoX(o.x, o.y), oy + isoY(o.x, o.y));
    else if (o.kind === 'stairsDown') drawStairs(ox + isoX(o.x, o.y), oy + isoY(o.x, o.y), true);
    else if (o.kind === 'stairsUp') drawStairs(ox + isoX(o.x, o.y), oy + isoY(o.x, o.y), false);
    else if (o.kind === 'portal') drawPortal(ox + isoX(o.x, o.y), oy + isoY(o.x, o.y), o.t);
    else if (o.kind === 'mountain') blitTall(ox + isoX(o.x, o.y), oy + isoY(o.x, o.y), 86 * SCALE, `mt:${S.location}:${o.x},${o.y}`, (x, y) => drawMountain(x, y, o.x, o.y));
    else if (o.kind === 'bush') objSprite(bushImg, ox + isoX(o.x, o.y), oy + isoY(o.x, o.y), 34);
    else if (o.kind === 'boulder') objSprite(boulderImg, ox + isoX(o.x, o.y), oy + isoY(o.x, o.y), 38);
    else if (o.kind === 'fence') objSprite(fenceImg, ox + isoX(o.x, o.y), oy + isoY(o.x, o.y), 42);
    else if (o.kind === 'lamp') objSprite(lampImg, ox + isoX(o.x, o.y), oy + isoY(o.x, o.y), 44);
    else if (o.kind === 'sign') objSprite(signImg, ox + isoX(o.x, o.y), oy + isoY(o.x, o.y), 32);
    else if (o.kind === 'workbench') objSprite(workbenchImg, ox + isoX(o.x, o.y), oy + isoY(o.x, o.y), 44);
    else if (o.kind === 'adminChest') objSprite(adminChestImg, ox + isoX(o.x, o.y), oy + isoY(o.x, o.y), 44);
    else if (o.kind === 'silverOre') { if (S.depletedNodes.has(`${o.x},${o.y}`)) drawRock(ox + isoX(o.x, o.y), oy + isoY(o.x, o.y), true, true); else objSprite(silverOreImg, ox + isoX(o.x, o.y), oy + isoY(o.x, o.y), 42); }
    else if (o.kind === 'goldOre') { if (S.depletedNodes.has(`${o.x},${o.y}`)) drawRock(ox + isoX(o.x, o.y), oy + isoY(o.x, o.y), true, true); else objSprite(goldOreImg, ox + isoX(o.x, o.y), oy + isoY(o.x, o.y), 42); }
    else if (o.kind === 'returnStone') objSprite(returnStoneImg, ox + isoX(o.x, o.y), oy + isoY(o.x, o.y), 40);
    else if (o.kind === 'furn') objSprite(FURN[o.t].img, ox + isoX(o.x, o.y), oy + isoY(o.x, o.y), FURN[o.t].sz);
    else if (o.kind === 'fishspot') drawFishingSpot(ox + isoX(o.x, o.y), oy + isoY(o.x, o.y), o.x, o.y);
    else if (o.kind === 'mob') drawMob(ox + isoX(o.m.x, o.m.y), oy + isoY(o.m.x, o.m.y), o.m);
    else if (o.kind === 'authNpc') drawAuthNpc(ox + isoX(o.n.x, o.n.y), oy + isoY(o.n.x, o.n.y), o.n);
    else drawPlayer(ox + isoX(o.p.rx, o.p.ry), oy + isoY(o.p.rx, o.p.ry), o.p, o.isMe);
  }

  // Маркер цели клика — ПОВЕРХ объектов (виден и на мосту/дереве/мобе, которые перекрыли бы пол)
  if (S.targetTile) {
    fillDiamond(ox + isoX(S.targetTile.x, S.targetTile.y), oy + isoY(S.targetTile.x, S.targetTile.y),
                'rgba(241,196,15,.22)', '#f1c40f');
  }

  // 3) Всплывающие цифры урона
  ctx.textAlign = 'center';
  for (const f of S.floaters) {
    const fx = ox + isoX(f.wx, f.wy) + (f.dx || 0);
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
