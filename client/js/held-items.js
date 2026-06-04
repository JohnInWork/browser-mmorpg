// Предметы «в руке» (оружие/инструменты): рисуются отдельным слоем поверх персонажа,
// прикрепляются к ладони и НЕ обрезаются рамкой 512 — поэтому могут быть большими и торчать за тело.
// Поля: src (картинка), hand ('right'|'left'), size (ширина в координатах тела 512), grip {x,y}
// (доля картинки, которая ложится в ладонь), rot (поворот, градусы).
// ДОБАВИТЬ ПРЕДМЕТ = положить файл в client/assets/ и дописать строку (ключ = id предмета в игре).
// src берётся из единого манифеста client/js/textures.js — тот же файл, что в инвентаре/навыке.
import { ITEM_TEX } from './textures.js';
export const HELD_ITEMS = {
  pickaxe: { src: ITEM_TEX.pickaxe, hand: 'right', size: 300, grip: { x: 0.18, y: 0.82 }, rot: 0 },
  axe:     { src: ITEM_TEX.axe,     hand: 'right', size: 300, grip: { x: 0.18, y: 0.82 }, rot: 0 },
  shovel:  { src: ITEM_TEX.shovel,  hand: 'right', size: 400, grip: { x: 0.46, y: 0.82 }, rot: 0 },
  fishingRod: { src: ITEM_TEX.fishingRod, hand: 'right', size: 360, grip: { x: 0.2, y: 0.9 }, rot: 0 },
};
export const HELD_OVERLAY_IDS = new Set(Object.keys(HELD_ITEMS));
// Точка ладони в координатах тела 512×512
export const HAND_POS = { right: { x: 390, y: 388 }, left: { x: 120, y: 352 } };
