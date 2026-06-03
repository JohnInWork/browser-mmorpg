// Предметы (клиент): ИКОНКИ и помощники представления. Данные предметов (name/type/cat/price/
// tags/desc/armor/damage/…) приходят с сервера в S.items — ЕДИНЫЙ источник (server/data/items.json).
// Здесь только то, что нужно для интерфейса и чего нет на сервере (SVG-иконки, цвета редкости).
import { wornIconSVG } from './character.js';
import { S } from './state.js';

// Живая ссылка на серверные данные: S.items наполняется в net.js (Object.assign), НЕ переприсваивается.
export const ITEMS = S.items;

// Названия категорий — для будущего внутриигрового гайда (рецепты/подсказки)
export const CAT_NAMES = { tool: 'Инструменты', weapon: 'Оружие', armor: 'Броня', clothing: 'Одежда', material: 'Материалы', ingredient: 'Ингредиенты', food: 'Еда' };

// Редкость предметов: цвет-индикатор + название. Жёлтые (легендарные) имеют крутые пассивки.
export const RARITY = {
  common:    { name: 'Обычный',     color: '#9aa0b0' },
  uncommon:  { name: 'Необычный',   color: '#3ad07a' },
  rare:      { name: 'Редкий',      color: '#4a90e2' },
  epic:      { name: 'Эпический',   color: '#a558d0' },
  legendary: { name: 'Легендарный', color: '#f1c40f' },
};
export function itemRarity(id) { return (ITEMS[id] && ITEMS[id].rarity) || 'common'; }
export function rarityColor(id) { return (RARITY[itemRarity(id)] || RARITY.common).color; }

// Маленькие UI-иконки (свои SVG вместо системных эмодзи) для статов/наград
export const UI_SVG = {
  coin:   `<svg class="uic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#f1c40f" stroke="#b8890c" stroke-width="2"/><circle cx="12" cy="12" r="4.5" fill="none" stroke="#b8890c" stroke-width="1.4"/></svg>`,
  shield: `<svg class="uic" viewBox="0 0 24 24"><path d="M12 3 L20 6 V11 C20 16 16.5 19.5 12 21 C7.5 19.5 4 16 4 11 V6 Z" fill="#9aa6b6" stroke="#6b7685" stroke-width="1.3"/></svg>`,
  heart:  `<svg class="uic" viewBox="0 0 24 24"><path d="M12 21 C4 15 3 10.5 3 8 A4.6 4.6 0 0 1 12 6.2 A4.6 4.6 0 0 1 21 8 C21 10.5 20 15 12 21 Z" fill="#e74c3c"/></svg>`,
  sword:  `<svg class="uic" viewBox="0 0 24 24"><line x1="20" y1="4" x2="10" y2="14" stroke="#cfd6dd" stroke-width="3" stroke-linecap="round"/><line x1="4" y1="20" x2="9" y2="15" stroke="#8a5a28" stroke-width="3.4" stroke-linecap="round"/><line x1="6" y1="13" x2="11" y2="18" stroke="#8a5a28" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  star:   `<svg class="uic" viewBox="0 0 24 24"><path d="M12 2 L14.7 8.6 L21.8 9.2 L16.4 13.8 L18.2 20.8 L12 16.9 L5.8 20.8 L7.6 13.8 L2.2 9.2 L9.3 8.6 Z" fill="#f1c40f"/></svg>`,
};

export const TREE_NAME = 'Дерево';
export const SLOTS = ['helmet','chest','gloves','pants','boots','cloak','mainHand','offHand'];
export const SLOT_NAMES = { helmet:'Шлем', chest:'Грудь', gloves:'Перчатки', pants:'Ноги', boots:'Сапоги', cloak:'Плащ', mainHand:'Оружие', offHand:'Щит' };

const ST = '#b9c2cd', STD = '#8c98a6'; // сталь
const ICONS = {
  axe: `<svg viewBox="0 0 24 24" width="30" height="30">
    <line x1="6" y1="20" x2="15" y2="7" stroke="#8a5a28" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M13 4 c4 0 7 3 7 7 c-3 -2 -7 -1 -9 2 z" fill="#cfd6dd" stroke="#8e979f" stroke-width="0.9"/></svg>`,
  wood: `<svg viewBox="0 0 24 24" width="30" height="30">
    <rect x="5" y="8" width="15" height="8" rx="4" fill="#a9743f" stroke="#7a4f22" stroke-width="1.2"/>
    <ellipse cx="7" cy="12" rx="2.4" ry="4" fill="#c98a4b" stroke="#7a4f22" stroke-width="1"/>
    <circle cx="7" cy="12" r="1.2" fill="#7a4f22"/></svg>`,
  pickaxe: `<svg viewBox="0 0 24 24" width="30" height="30">
    <line x1="7" y1="20" x2="16" y2="7" stroke="#8a5a28" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M9 5 q7 -1 12 5 q-7 -1 -12 5 q3 -5 0 -10z" fill="#c0c7d0" stroke="#8e979f" stroke-width="0.9"/></svg>`,
  stone: `<svg viewBox="0 0 24 24" width="30" height="30">
    <path d="M5 15 l3 -7 l8 -1 l3 6 l-2 5 l-9 1 z" fill="#8a8f98" stroke="#5e636b" stroke-width="1"/>
    <path d="M8 8 l3 4 l-3 6 z" fill="#9aa0aa"/></svg>`,
  ore: `<svg viewBox="0 0 24 24" width="30" height="30">
    <path d="M5 15 l3 -7 l8 -1 l3 6 l-2 5 l-9 1 z" fill="#8a8f98" stroke="#5e636b" stroke-width="1"/>
    <circle cx="10" cy="12" r="1.6" fill="#d07a3a"/><circle cx="15" cy="14" r="1.4" fill="#c2641f"/><circle cx="13" cy="9" r="1.2" fill="#e08a3a"/></svg>`,
  ingot: `<svg viewBox="0 0 24 24" width="30" height="30">
    <path d="M5 17 h14 l-2 -7 h-10 z" fill="#aeb7c4" stroke="#7c8694" stroke-width="1"/>
    <path d="M7 10 h10 l1 -2 h-12 z" fill="#cfd6dd" stroke="#7c8694" stroke-width="1"/></svg>`,
  rawChicken: `<svg viewBox="0 0 24 24" width="30" height="30">
    <line x1="6" y1="18" x2="13" y2="11" stroke="#efe7d6" stroke-width="3.2" stroke-linecap="round"/>
    <circle cx="5.6" cy="18.2" r="2.1" fill="#efe7d6"/><circle cx="7.9" cy="19.4" r="1.9" fill="#efe7d6"/>
    <circle cx="15" cy="9" r="6" fill="#e3a3a3" stroke="#c06b6b" stroke-width="1.1"/>
    <circle cx="13.4" cy="7.6" r="1.4" fill="#f1bfbf"/></svg>`,
  cookedChicken: `<svg viewBox="0 0 24 24" width="30" height="30">
    <line x1="6" y1="18" x2="13" y2="11" stroke="#efe7d6" stroke-width="3.2" stroke-linecap="round"/>
    <circle cx="5.6" cy="18.2" r="2.1" fill="#efe7d6"/><circle cx="7.9" cy="19.4" r="1.9" fill="#efe7d6"/>
    <circle cx="15" cy="9" r="6" fill="#bd7f3e" stroke="#7d4f22" stroke-width="1.1"/>
    <path d="M11.2 7 l6 3 M12.6 5.4 l5 4.2" stroke="#6e451e" stroke-width="1" stroke-linecap="round" opacity="0.7"/></svg>`,
  helmet: `<svg viewBox="0 0 24 24" width="28" height="28">
    <path d="M4 14 a8 8 0 0 1 16 0 v2 h-16 z" fill="${ST}" stroke="${STD}" stroke-width="1"/>
    <rect x="11" y="9" width="2" height="7" fill="${STD}"/></svg>`,
  chest: `<svg viewBox="0 0 24 24" width="28" height="28">
    <path d="M5 7 l4 -2 q3 2 6 0 l4 2 l-1 12 q-6 2 -12 0 z" fill="${ST}" stroke="${STD}" stroke-width="1"/>
    <line x1="12" y1="6" x2="12" y2="18" stroke="${STD}" stroke-width="1"/></svg>`,
  gloves: `<svg viewBox="0 0 24 24" width="28" height="28">
    <path d="M8 6 h6 a2 2 0 0 1 2 2 v8 a3 3 0 0 1 -3 3 h-4 a3 3 0 0 1 -3 -3 v-8 a2 2 0 0 1 2 -2z" fill="${ST}" stroke="${STD}" stroke-width="1"/>
    <rect x="6" y="16" width="10" height="3" fill="${STD}"/></svg>`,
  pants: `<svg viewBox="0 0 24 24" width="28" height="28">
    <path d="M7 5 h10 v6 l-1 9 h-3 l-1 -8 l-1 8 h-3 l-1 -9 z" fill="${ST}" stroke="${STD}" stroke-width="1"/></svg>`,
  boots: `<svg viewBox="0 0 24 24" width="28" height="28">
    <path d="M9 4 h4 v10 l4 2 v3 h-9 z" fill="${ST}" stroke="${STD}" stroke-width="1"/></svg>`,
  cloak: `<svg viewBox="0 0 24 24" width="28" height="28">
    <path d="M7 5 q5 3 10 0 l2 15 q-7 3 -14 0 z" fill="#9a3a3a" stroke="#6e2828" stroke-width="1"/></svg>`,
  bearHelmet: `<svg viewBox="0 0 24 24" width="28" height="28">
    <circle cx="6.5" cy="6" r="2.7" fill="#6b4a2b" stroke="#523619" stroke-width="0.9"/>
    <circle cx="17.5" cy="6" r="2.7" fill="#6b4a2b" stroke="#523619" stroke-width="0.9"/>
    <path d="M4 14 a8 8 0 0 1 16 0 v2 h-16 z" fill="#7a5230" stroke="#523619" stroke-width="1.1"/>
    <ellipse cx="12" cy="13.5" rx="3" ry="2.4" fill="#a98455"/>
    <ellipse cx="12" cy="12.4" rx="1.1" ry="0.8" fill="#26201a"/></svg>`,
  ironSword: `<svg viewBox="0 0 24 24" width="30" height="30">
    <path d="M12 2 L14 5 L13 14 L11 14 L10 5 Z" fill="#cfd6dd" stroke="#9aa4b0" stroke-width="0.8"/>
    <rect x="8" y="13.6" width="8" height="2.2" rx="1" fill="#5e6670"/>
    <rect x="11" y="15.8" width="2" height="5" rx="1" fill="#8a5a28"/>
    <circle cx="12" cy="21" r="1.3" fill="#5e3c1e"/></svg>`,
  ironGreatsword: `<svg viewBox="0 0 24 24" width="30" height="30">
    <path d="M12 1.5 L15 6 L13.5 15 L10.5 15 L9 6 Z" fill="#dfe6ee" stroke="#9aa4b0" stroke-width="0.8"/>
    <rect x="6.5" y="14.8" width="11" height="2.4" rx="1" fill="#5e6670"/>
    <rect x="11" y="17.2" width="2" height="4.5" rx="1" fill="#8a5a28"/>
    <circle cx="12" cy="21.6" r="1.4" fill="#5e3c1e"/></svg>`,
  ironShield: `<svg viewBox="0 0 24 24" width="30" height="30">
    <path d="M12 3 L19 5 V11 C19 16 15.5 19.5 12 21 C8.5 19.5 5 16 5 11 V5 Z" fill="#8a939e" stroke="#5e6670" stroke-width="1.4"/>
    <circle cx="12" cy="11.5" r="2.2" fill="#b9c2cd" stroke="#5e6670" stroke-width="1"/></svg>`,
  shovel: `<svg viewBox="0 0 24 24" width="30" height="30">
    <line x1="7" y1="18" x2="15" y2="7" stroke="#8a5a28" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M5 16 l4 4 l3 -3 l-4 -4 z" fill="#c0c7d0" stroke="#8e979f" stroke-width="0.9"/></svg>`,
  sand: `<svg viewBox="0 0 24 24" width="30" height="30">
    <ellipse cx="12" cy="17" rx="9" ry="4" fill="#c9ad6a"/>
    <path d="M4 17 q8 -11 16 0 z" fill="#dcc480"/>
    <path d="M9 14 q3 -6 6 0 z" fill="#ecdca0"/>
    <circle cx="8" cy="16" r="0.8" fill="#b89a52"/><circle cx="14" cy="15" r="0.8" fill="#b89a52"/></svg>`,
  emptyFlask: `<svg viewBox="0 0 24 24" width="30" height="30">
    <rect x="10" y="3" width="4" height="5" rx="1" fill="none" stroke="#aeb9c4" stroke-width="1.4"/>
    <path d="M10 7 L7 16 a5 5 0 0 0 10 0 L14 7 Z" fill="rgba(180,200,220,.25)" stroke="#aeb9c4" stroke-width="1.4"/></svg>`,
  waterFlask: `<svg viewBox="0 0 24 24" width="30" height="30">
    <rect x="10" y="3" width="4" height="5" rx="1" fill="none" stroke="#aeb9c4" stroke-width="1.4"/>
    <path d="M10 7 L7 16 a5 5 0 0 0 10 0 L14 7 Z" fill="rgba(180,200,220,.18)" stroke="#aeb9c4" stroke-width="1.4"/>
    <path d="M8.2 12 L15.8 12 a5 5 0 0 1 -7.6 0 Z" fill="#4a90cf"/>
    <ellipse cx="12" cy="17" rx="3.4" ry="2" fill="#4a90cf"/></svg>`,
};

// Иконка предмета. Для брони — её вид на персонаже (один источник графики), иначе нарисованная иконка.
export function itemIcon(id) {
  const it = ITEMS[id];
  if (it && it.type === 'armor' && it.slot) { const w = wornIconSVG(id, it.slot); if (w) return w; }
  return ICONS[id] || '';
}
export function itemName(id) { return (ITEMS[id] && ITEMS[id].name) || id; }
export function itemType(id) { return ITEMS[id] && ITEMS[id].type; }
export function itemPrice(id) { return (ITEMS[id] && ITEMS[id].price) || 0; }
