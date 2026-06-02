// Изометрия: тайл ↔ экран.
import { TW, TH } from './config.js';
import { S } from './state.js';

// Тайл (x,y) → экранные координаты ЦЕНТРА ромба (без камеры)
export function isoX(x, y) { return (x - y) * (TW / 2); }
export function isoY(x, y) { return (x + y) * (TH / 2); }

// Экран → тайл (учёт камеры originX/originY)
export function screenToTile(mx, my) {
  const hw = TW / 2, hh = TH / 2;
  const a = (mx - S.originX) / hw; // x - y
  const b = (my - S.originY) / hh; // x + y
  return { x: Math.round((a + b) / 2), y: Math.round((b - a) / 2) };
}
