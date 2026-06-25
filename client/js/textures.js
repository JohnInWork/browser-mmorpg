// ЕДИНЫЙ МАНИФЕСТ ТЕКСТУР — один путь к svg на каждую вещь.
// Все модули берут пути ОТСЮДА, поэтому иконка везде одинаковая: инвентарь, торговля, покупка,
// вики, крафт, чат, предмет в руке персонажа и иконка навыка. Меняешь текстуру — правишь ТОЛЬКО здесь.

// Иконки ПРЕДМЕТОВ (не брони): инструменты, материалы. Инструменты используются ещё в руке и в навыках.
export const ITEM_TEX = {
  pickaxe: '/assets/pickaxe.svg',
  axe: '/assets/axe.svg',
  shovel: '/assets/shovel.svg',
  fishingRod: '/assets/fishing-rod.svg',
  returnStone: '/assets/return-stone.svg',
  leather: '/assets/leather.svg',
  silverOre: '/assets/silver-ore.svg',
  silverIngot: '/assets/silver-ingot.svg',
  goldOre: '/assets/gold-ore.svg',
  goldIngot: '/assets/gold-ingot.svg',
  wolfHelmet: '/assets/wolf-helmet.svg',   // легендарный шлем — полная иконка в инвентаре (на теле берётся из ARMOR_TEX)
  woodClub: '/assets/wood-club.svg',       // деревянная дубина — иконка в инвентаре (на теле берётся из WEAPON_ART)
  ironSword: '/assets/iron-sword.svg',     // железный меч — иконка в инвентаре (на теле берётся из WEAPON_ART)
  ironGreatsword: '/assets/iron-greatsword.svg', // двуручный меч — иконка (на теле берётся из WEAPON_ART)
  // Рыба сырая (14 предсозданных видов)
  fish1: '/assets/fish-1.svg', fish2: '/assets/fish-2.svg', fish3: '/assets/fish-3.svg',
  fish4: '/assets/fish-4.svg', fish5: '/assets/fish-5.svg', fish6: '/assets/fish-6.svg',
  fish7: '/assets/fish-7.svg', fish8: '/assets/fish-8.svg', fish9: '/assets/fish-9.svg',
  fish10: '/assets/fish-10.svg', fish11: '/assets/fish-11.svg', fish12: '/assets/fish-12.svg',
  fish13: '/assets/fish-13.svg', fish14: '/assets/fish-14.svg',
  // Рыба жареная (золотисто-коричневая + полоски гриля)
  cookedFish1: '/assets/cooked-fish-1.svg', cookedFish2: '/assets/cooked-fish-2.svg', cookedFish3: '/assets/cooked-fish-3.svg',
  cookedFish4: '/assets/cooked-fish-4.svg', cookedFish5: '/assets/cooked-fish-5.svg', cookedFish6: '/assets/cooked-fish-6.svg',
  cookedFish7: '/assets/cooked-fish-7.svg', cookedFish8: '/assets/cooked-fish-8.svg', cookedFish9: '/assets/cooked-fish-9.svg',
  cookedFish10: '/assets/cooked-fish-10.svg', cookedFish11: '/assets/cooked-fish-11.svg', cookedFish12: '/assets/cooked-fish-12.svg',
  cookedFish13: '/assets/cooked-fish-13.svg', cookedFish14: '/assets/cooked-fish-14.svg',
};

// БРОНЯ: рисуется на теле и даёт иконку (обрезается по слоту). Один файл = и на персонаже, и в инвентаре.
export const ARMOR_TEX = {
  helmet: '/assets/iron-helmet.svg', chest: '/assets/iron-chest.svg',
  leatherHat: '/assets/leather-helmet.svg', leatherTunic: '/assets/leather-chest.svg',
  leatherMitts: '/assets/leather-gloves.svg', leatherLegs: '/assets/leather-pants.svg', leatherShoes: '/assets/leather-boots.svg',
  banditHelmet: '/assets/bandit-helmet.svg', banditChest: '/assets/bandit-chest.svg',
  banditGloves: '/assets/bandit-gloves.svg', banditLegs: '/assets/bandit-pants.svg', banditBoots: '/assets/bandit-boots.svg',
  silverHelmet: '/assets/silver-helmet.svg', silverChest: '/assets/silver-chest.svg',
  silverGloves: '/assets/silver-gloves.svg', silverLegs: '/assets/silver-legs.svg', silverBoots: '/assets/silver-boots.svg',
  goldHelmet: '/assets/gold-helmet.svg', goldChest: '/assets/gold-chest.svg',
  goldGloves: '/assets/gold-gloves.svg', goldLegs: '/assets/gold-legs.svg', goldBoots: '/assets/gold-boots.svg',
  wolfHelmet: '/assets/wolf-helmet.svg',   // легендарный волчий шлем
  // Одежда для НПС (монах, фермер) — характеристики настраиваются в редакторе
  monkHelmet: '/assets/monk-helmet.svg', monkChest: '/assets/monk-chest.svg', monkPants: '/assets/monk-pants.svg',
  farmerChest: '/assets/farmer-chest.svg', farmerLegs: '/assets/farmer-legs.svg',
};

// ИКОНКИ НАВЫКОВ — те же файлы, что у связанного инструмента/станции (чтобы совпадали).
export const SKILL_TEX = {
  woodcutting: ITEM_TEX.axe,
  mining: ITEM_TEX.pickaxe,
  smithing: '/assets/anvil.svg',
  cooking: '/assets/campfire.svg',
  fishing: ITEM_TEX.fishingRod,
};
