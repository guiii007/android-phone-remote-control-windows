import { timingSafeEqual } from 'node:crypto';

export const MAX_TEXT = 4000;
export function sameToken(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function validCommand(c) {
  if (!c || typeof c !== 'object' || !/^[a-zA-Z0-9_-]{1,80}$/.test(c.id ?? '')) return false;
  const point = Number.isInteger(c.x) && Number.isInteger(c.y) && Math.abs(c.x) <= 100000 && Math.abs(c.y) <= 100000;
  if (c.action === 'move') return point;
  if (c.action === 'button') return point && ['left', 'right'].includes(c.button) && typeof c.down === 'boolean';
  if (c.action === 'text') return typeof c.text === 'string' && c.text.length > 0 && c.text.length <= MAX_TEXT && !c.text.includes('\0') && (c.focusId === null || typeof c.focusId === 'string');
  if (c.action === 'key') return ['Enter', 'ShiftEnter', 'Backspace', 'Escape', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(c.key);
  if (c.action === 'wheel') return point && Number.isInteger(c.delta) && Math.abs(c.delta) <= 1200;
  return c.action === 'release';
}
