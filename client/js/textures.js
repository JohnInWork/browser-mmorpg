// ЕДИНЫЙ МАНИФЕСТ ТЕКСТУР — один путь к svg на каждую вещь.
// Все модули берут пути ОТСЮДА, поэтому иконка везде одинаковая: инвентарь, торговля, покупка,
// вики, крафт, чат, предмет в руке персонажа и иконка навыка. Меняешь текстуру — правишь ТОЛЬКО здесь.

// Иконки ПРЕДМЕТОВ (не брони): инструменты, материалы. Инструменты используются ещё в руке и в навыках.
export const ITEM_TEX = {
  pickaxe: '/assets/pickaxe.svg',
  axe: '/assets/axe.svg',
  shovel: '/assets/shovel.svg',
  leather: '/assets/leather.svg',
  silverOre: '/assets/silver-ore.svg',
  silverIngot: '/assets/silver-ingot.svg',
};

// БРОНЯ: рисуется на теле и даёт иконку (обрезается по слоту). Один файл = и на персонаже, и в инвентаре.
export const ARMOR_TEX = {
  helmet: '/assets/iron-helmet.svg', chest: '/assets/iron-chest.svg',
  leatherHat: '/assets/leather-helmet.svg', leatherTunic: '/assets/leather-chest.svg',
  leatherMitts: '/assets/leather-gloves.svg', leatherLegs: '/assets/leather-pants.svg', leatherShoes: '/assets/leather-boots.svg',
  silverHelmet: '/assets/silver-helmet.svg', silverChest: '/assets/silver-chest.svg',
  silverGloves: '/assets/silver-gloves.svg', silverLegs: '/assets/silver-legs.svg', silverBoots: '/assets/silver-boots.svg',
};

// ИКОНКИ НАВЫКОВ — те же файлы, что у связанного инструмента/станции (чтобы совпадали).
export const SKILL_TEX = {
  woodcutting: ITEM_TEX.axe,
  mining: ITEM_TEX.pickaxe,
  smithing: '/assets/anvil.svg',
  cooking: '/assets/campfire.svg',
};
