// Предметы «в руке» (оружие/инструменты): рисуются отдельным слоем поверх персонажа,
// прикрепляются к ладони и НЕ обрезаются рамкой 512 — поэтому могут быть большими и торчать за тело.
// Поля: src (картинка), hand ('right'|'left'), size (ширина в координатах тела 512), grip {x,y}
// (доля картинки, которая ложится в ладонь), rot (поворот, градусы).
// ДОБАВИТЬ ПРЕДМЕТ = положить файл в client/assets/ и дописать строку (ключ = id предмета в игре).
export const HELD_ITEMS = {
  pickaxe: { src: '/assets/pickaxe.svg', hand: 'right', size: 300, grip: { x: 0.18, y: 0.82 }, rot: 0 },
  axe:     { src: '/assets/axe.svg',     hand: 'right', size: 300, grip: { x: 0.18, y: 0.82 }, rot: 0 },
  shovel:  { src: '/assets/shovel.svg',  hand: 'right', size: 400, grip: { x: 0.46, y: 0.82 }, rot: 0 },
};
export const HELD_OVERLAY_IDS = new Set(Object.keys(HELD_ITEMS));
// Точка ладони в координатах тела 512×512
export const HAND_POS = { right: { x: 390, y: 388 }, left: { x: 120, y: 352 } };
