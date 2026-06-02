// Мелкие общие утилиты
function rnd(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
function adjOrtho(ax, ay, bx, by) { return Math.abs(ax - bx) + Math.abs(ay - by) === 1; } // прямое соседство (не угол)
module.exports = { rnd, adjOrtho };
