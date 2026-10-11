// 独立记录每个鼠标键的触点，允许另一只手同时拖动圆柄。
export function bindMouseButton(button, { down, up, now = () => Date.now() }) {
  let active = null, pressed = false, lastDirectInput = -Infinity, lastPointerInput = -Infinity;
  function press() {
    if (pressed) return true;
    if (down() === false) return false;
    pressed = true; button.setAttribute('aria-pressed', 'true'); return true;
  }
  function release() {
    active = null;
    if (pressed) { pressed = false; up(); }
    button.setAttribute('aria-pressed', 'false');
  }
  button.addEventListener('pointerdown', e => {
    e.preventDefault(); if (active !== null) return;
    lastDirectInput = now(); lastPointerInput = now();
    if (!press()) return;
    active = { kind:'pointer', id:e.pointerId };
    try { button.setPointerCapture(e.pointerId); } catch {}
  });
  function endPointer(e) {
    if (active?.kind !== 'pointer' || active.id !== e.pointerId) return;
    lastDirectInput = now(); lastPointerInput = now(); release();
  }
  for (const name of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(name, endPointer);
  button.addEventListener('touchstart', e => {
    e.preventDefault(); if (active !== null || now()-lastPointerInput < 750) return;
    const touch=e.changedTouches[0];
    if (touch && press()) active={kind:'touch',id:touch.identifier};
  }, { passive:false });
  function endTouch(e) {
    e.preventDefault(); if (active?.kind !== 'touch') return;
    if (Array.from(e.changedTouches).some(t=>t.identifier===active.id)) { lastDirectInput=now(); release(); }
  }
  button.addEventListener('touchend',endTouch,{passive:false});
  button.addEventListener('touchcancel',endTouch,{passive:false});
  button.addEventListener('keydown', e => {
    if ((e.key===' '||e.key==='Enter')&&!e.repeat) { e.preventDefault(); lastDirectInput=now(); press(); }
  });
  button.addEventListener('keyup', e => {
    if (e.key===' '||e.key==='Enter') { e.preventDefault(); lastDirectInput=now(); release(); }
  });
  // 部分内置浏览器或辅助功能只派发 click；避免正常触摸生成的 click 重复提交。
  button.addEventListener('click', () => { if(now()-lastDirectInput>=750&&press())release(); });
  return { cancel: release };
}
