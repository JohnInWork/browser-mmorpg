// Рендер персонажа из векторного тела пользователя (Персонаж.svg).
// Кастомизация: цвет кожи, причёска (форма) и цвет волос.
import { BODY_SVG } from './body-data.js';
import { ARMOR_PARTS } from './armor-data.js';
import { HAIR_BY_ID, HAIR_COLORS } from './hair-data.js';
import { HELD_OVERLAY_IDS } from './held-items.js';   // предметы, рисуемые слоем поверх (не в композите)
import { ARMOR_TEX } from './textures.js';   // пути к svg брони — единый источник
export { HAIR_STYLES } from './hair-data.js';   // для экрана создания и редактора НПС

function shade(hex, p){ hex=hex.replace('#',''); if(hex.length===3) hex=hex.split('').map(c=>c+c).join(''); const n=parseInt(hex,16); let r=(n>>16)&255,g=(n>>8)&255,b=n&255; const t=p<0?0:255,a=Math.abs(p)/100; r=Math.round((t-r)*a+r);g=Math.round((t-g)*a+g);b=Math.round((t-b)*a+b); return '#'+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1); }

// Палитры кастомизации
export const PALETTES = {
  skin: ['#f3cfa6','#ffa78f','#e8bf94','#d9a06b','#b97a4e','#8a5a34','#5e3a1e'],
  hair: HAIR_COLORS,
};
export const DEFAULT_APPEARANCE = { skin:'#f3cfa6', hair:'#4a3525', hairStyle:'h1' };

// Порядок отрисовки брони ПОВЕРХ тела (низ→верх). Плащ рисуется ОТДЕЛЬНО — позади тела.
const ARMOR_ORDER = ['pants','chest','gloves','boots','helmet'];

// Плащ (нарисован вручную в координатах тела 512×512) — слой ЗА телом
const CLOAK_BACK = `<path d="M180 176 L120 480 Q256 510 392 480 L332 176 Q256 200 180 176 Z" fill="#8e2f3a"/><path d="M256 190 L392 480 Q256 510 256 510 Z" fill="#6f2530" opacity="0.45"/>`;

// Инструменты в правой руке (кисть ~x395,y330), чуть под наклоном, покрупнее. Рисуются поверх всего.
const AXE = `<line x1="388" y1="392" x2="456" y2="150" stroke="#7a5230" stroke-width="17" stroke-linecap="round"/><line x1="395" y1="392" x2="463" y2="150" stroke="#5e3c1e" stroke-width="6" stroke-linecap="round" opacity="0.45"/><path d="M456 146 q44 -6 50 34 q-26 16 -50 6 z" fill="#cfd6dd"/><path d="M456 146 q44 -6 50 34 q-11 -25 -50 -40 z" fill="#9aa4b0"/>`;
const PICKAXE = `<line x1="388" y1="392" x2="456" y2="150" stroke="#7a5230" stroke-width="16" stroke-linecap="round"/><line x1="395" y1="392" x2="463" y2="150" stroke="#5e3c1e" stroke-width="5" stroke-linecap="round" opacity="0.45"/><path d="M404 130 Q456 142 506 130 Q482 156 456 150 Q430 156 404 130 Z" fill="#c0c7d0"/><path d="M404 130 Q456 142 506 130 Q482 156 456 150 Q430 156 404 130 Z" fill="none" stroke="#8e979f" stroke-width="2"/><path d="M456 142 Q482 152 506 130 Q494 150 456 150 Z" fill="#9aa4b0"/>`;
const SHOVEL = `<line x1="388" y1="392" x2="452" y2="160" stroke="#7a5230" stroke-width="16" stroke-linecap="round"/><line x1="395" y1="392" x2="459" y2="160" stroke="#5e3c1e" stroke-width="5" stroke-linecap="round" opacity="0.45"/><path d="M434 158 Q452 104 470 158 Q452 184 434 158 Z" fill="#c0c7d0" stroke="#8e979f" stroke-width="2"/><path d="M452 128 Q470 140 470 158 Q452 184 452 158 Z" fill="#9aa4b0"/>`;
const HELD_TOOLS = { axe: AXE, pickaxe: PICKAXE, shovel: SHOVEL };

// Оружие в ПРАВОЙ руке (кисть ~x392,y392), клинок вверх
const SWORD = `<line x1="392" y1="402" x2="392" y2="322" stroke="#7a5230" stroke-width="13" stroke-linecap="round"/><circle cx="392" cy="404" r="7" fill="#5e3c1e"/><rect x="368" y="312" width="48" height="12" rx="4" fill="#6b7480"/><path d="M380 316 L404 316 L399 175 L392 152 L385 175 Z" fill="#cfd6dd" stroke="#9aa4b0" stroke-width="2"/><path d="M392 314 L392 160" stroke="#9aa4b0" stroke-width="2" opacity="0.5"/>`;
// Двуручный меч: длинная рукоять от правой руки к левой (навершие в левой руке), клинок вверх из правой руки
const GREATSWORD = `<line x1="392" y1="388" x2="120" y2="400" stroke="#7a5230" stroke-width="15" stroke-linecap="round"/><circle cx="116" cy="401" r="8" fill="#5e3c1e"/><line x1="378" y1="400" x2="408" y2="372" stroke="#6b7480" stroke-width="12" stroke-linecap="round"/><path d="M384 386 L408 376 L422 175 L406 150 L390 178 Z" fill="#dfe6ee" stroke="#9aa4b0" stroke-width="2"/><path d="M406 168 L397 360" stroke="#9aa4b0" stroke-width="2" opacity="0.45"/>`;
// Щит в ЛЕВОЙ руке (~x120,y350)
const SHIELD = `<path d="M70 300 Q120 288 170 300 L162 372 Q120 408 78 372 Z" fill="#8a939e" stroke="#5e6670" stroke-width="4"/><path d="M70 302 Q120 290 170 302 L166 336 Q120 350 74 336 Z" fill="#9aa6b2"/><circle cx="120" cy="345" r="11" fill="#b9c2cd" stroke="#5e6670" stroke-width="3"/>`;
// Деревянная дубина в ПРАВОЙ руке (кисть ~x392,y395), утолщается к навершию вверх-вправо
const CLUB = `<line x1="390" y1="404" x2="462" y2="172" stroke="#8C5E53" stroke-width="18" stroke-linecap="round"/><circle cx="470" cy="158" r="25" fill="#8C5E53"/><circle cx="470" cy="158" r="25" fill="none" stroke="#6D4B41" stroke-width="3"/><circle cx="392" cy="406" r="8" fill="#6D4B41"/><line x1="430" y1="302" x2="448" y2="308" stroke="#6D4B41" stroke-width="5" stroke-linecap="round" opacity="0.55"/><line x1="448" y1="248" x2="468" y2="254" stroke="#6D4B41" stroke-width="5" stroke-linecap="round" opacity="0.55"/>`;
const WEAPON_ART = { ironSword: SWORD, ironGreatsword: GREATSWORD, woodClub: CLUB };
const SHIELD_ART = { ironShield: SHIELD };
const TWO_HANDED = new Set(['ironGreatsword']);

// Визуал брони, привязанный к КОНКРЕТНОМУ ПРЕДМЕТУ (переопределяет стандартный по слоту).
// Медвежий шлем: коричневый купол на месте головы + медвежьи ушки сверху.
// Перекраска формы брони в другой цвет (для крашеной одежды). pairs: [исходный_цвет, новый, ...]
function recolor(svg, pairs) { let s = svg; for (let i = 0; i < pairs.length; i += 2) s = s.split(pairs[i]).join(pairs[i + 1]); return s; }
const ITEM_ART = {
  bearHelmet:
    `<circle cx="214" cy="41" r="19" fill="#6b4a2b"/><circle cx="298" cy="41" r="19" fill="#6b4a2b"/>`
    + `<path d="M321.044 103.018H191C189.939 103.018 188.922 102.597 188.172 101.846C187.421 101.096 187 100.079 187 99.018V93.155C187 66.476 208.628 44.849 235.306 44.849H276.737C303.416 44.849 325.043 66.477 325.043 93.155V99.018C325.044 101.227 323.253 103.018 321.044 103.018Z" fill="#6b4a2b"/>`
    + `<path d="M276.738 44.849H245.832C272.511 44.849 294.138 66.476 294.138 93.155V103.018H321.043C322.104 103.018 323.121 102.597 323.871 101.846C324.622 101.096 325.043 100.079 325.043 99.018V93.155C325.044 66.477 303.417 44.849 276.738 44.849Z" fill="#523619"/>`
    + `<circle cx="214" cy="39" r="8" fill="#a98455"/><circle cx="298" cy="39" r="8" fill="#a98455"/>`,
  // Одежда — те же формы брони, перекрашенные. Носят НПС; позже доступна игроку.
  merchantRobe: recolor(ARMOR_PARTS.chest,  ['#BAAFB9', '#8e44c4', '#AA9EA9', '#6f2f9e']),
  forestTunic:  recolor(ARMOR_PARTS.chest,  ['#BAAFB9', '#3f8f3a', '#AA9EA9', '#2e6b2b']),
  goldPants:    recolor(ARMOR_PARTS.pants,  ['#B2A7B1', '#d9b24a']),
  brownPants:   recolor(ARMOR_PARTS.pants,  ['#B2A7B1', '#6b4a2b']),
  redPants:     recolor(ARMOR_PARTS.pants,  ['#B2A7B1', '#c0392b']),
  blueGloves:   recolor(ARMOR_PARTS.gloves, ['#AA9EA9', '#3a78c2']),
  leatherBoots: recolor(ARMOR_PARTS.boots,  ['#D6694B', '#7a5230', '#C4573A', '#5e3c1e', '#918291', '#4a2f18']),
};

// Область тела (viewBox в координатах 512×512) для каждого слота — чтобы из арта на персонаже
// сделать иконку для рюкзака (один источник графики: что на персонаже, то и в инвентаре).
const SLOT_VIEWBOX = {
  helmet: '175 18 165 95',
  chest:  '90 158 332 206',
  gloves: '356 285 78 75',
  pants:  '170 323 172 195',
  boots:  '170 436 172 80',
  cloak:  '112 170 290 345',
};

// Текстуры брони — из единого манифеста client/js/textures.js (один источник для всей игры).
// На теле: подгружаем содержимое файла (fetch) и встраиваем (внешние ссылки в <img>-SVG не грузятся).
// В инвентаре: <image href> в живом DOM грузится напрямую.
const ARMOR_ART_CACHE = {};   // id → внутреннее содержимое svg (для композита персонажа)

// SVG-иконка надеваемой вещи = её вид на персонаже, обрезанный по слоту (или null, если арта нет).
export function wornIconSVG(id, slot) {
  const vb = SLOT_VIEWBOX[slot];
  if (ARMOR_TEX[id] && vb) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="30" height="30"><image href="${ARMOR_TEX[id]}" width="512" height="512"/></svg>`;
  const art = ITEM_ART[id] || (slot === 'cloak' ? CLOAK_BACK : ARMOR_PARTS[slot]);
  if (!art || !vb) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="30" height="30">${art}</svg>`;
}

// Собрать SVG персонажа: [плащ сзади] + тело (с цветом кожи) + надетая броня + [инструмент/оружие в руке]
export function buildCharacterSVG(app, equipment, opts = {}){
  app = { ...DEFAULT_APPEARANCE, ...(app||{}) };
  const skin = app.skin;
  const sh = shade(skin, -16); // тень кожи
  const body = BODY_SVG.replace(/#FFA78F/gi, skin).replace(/#F89580/gi, sh);
  // Причёска: слой поверх головы, перекрашен в цвет волос (под шлемом, если надет)
  const hairDef = app.hairStyle && HAIR_BY_ID[app.hairStyle];
  const hair = hairDef ? hairDef.art.split('#484848').join(app.hair || '#4a3525') : '';
  const back = (equipment && equipment.cloak) ? CLOAK_BACK : '';
  let armor = '';
  if (equipment) for (const slot of ARMOR_ORDER) {
    const id = equipment[slot];
    if (!id) continue;
    const art = ARMOR_ART_CACHE[id] || ITEM_ART[id] || ARMOR_PARTS[slot]; // файл-текстура → конкретный предмет → стандарт по слоту
    if (art) armor += art;
  }
  // Руки: двуручное оружие перекрывает всё; иначе щит (левая) + инструмент или оружие (правая).
  // Предметы из реестра held-items рисуются ОТДЕЛЬНЫМ слоем в render (overlay), здесь их пропускаем.
  const mh = equipment && equipment.mainHand, oh = equipment && equipment.offHand;
  let hands = '';
  if (mh && TWO_HANDED.has(mh) && WEAPON_ART[mh] && !HELD_OVERLAY_IDS.has(mh)) {
    hands = WEAPON_ART[mh];
  } else {
    if (oh && SHIELD_ART[oh] && !HELD_OVERLAY_IDS.has(oh)) hands += SHIELD_ART[oh];
    if (opts.held && HELD_TOOLS[opts.held] && !HELD_OVERLAY_IDS.has(opts.held)) hands += HELD_TOOLS[opts.held];
    else if (mh && WEAPON_ART[mh] && !HELD_OVERLAY_IDS.has(mh)) hands += WEAPON_ART[mh];
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${back}${body}${hair}${armor}${hands}</svg>`;
}

// Сигнатура надетых слотов (для ключа кэша)
function equipKey(equipment){
  if(!equipment) return '';
  return ['cloak', 'mainHand', 'offHand', ...ARMOR_ORDER].filter(s => equipment[s]).map(s => s + ':' + equipment[s]).join(',');
}

// Кэш Image по внешности+экипировке+предмету в руке
const imgCache = new Map();

// Подгрузить содержимое SVG-файлов брони и встроить в композит; после загрузки — пересобрать персонажей.
(function loadArmorTex() {
  for (const id in ARMOR_TEX) {
    fetch(ARMOR_TEX[id]).then(r => r.text()).then(t => {
      ARMOR_ART_CACHE[id] = t.replace(/<\?xml[^?]*\?>/i, '').replace(/<svg[^>]*>/i, '').replace(/<\/svg>/i, '');
      imgCache.clear();   // пересобрать персонажей с подгруженной бронёй
    }).catch(() => {});
  }
})();
export function getCharImage(app, equipment, held){
  const opts = { held };
  const a = app || {};
  const key = (a.skin || DEFAULT_APPEARANCE.skin) + '|' + (a.hairStyle || '') + '|' + (a.hair || '') + '|' + equipKey(equipment) + '|' + (held || '');
  if(imgCache.has(key)) return imgCache.get(key);
  const ent = { img: new Image(), ready:false };
  ent.img.onload = ()=>{ ent.ready=true; };
  ent.img.src = 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(buildCharacterSVG(app, equipment, opts));
  imgCache.set(key, ent);
  return ent;
}
// Тело занимает весь viewBox 512×512, ступни у нижней кромки
export const CHAR_RATIO = 1;     // квадратный viewBox
export const CHAR_FEET = 1.0;    // стопы у низа
