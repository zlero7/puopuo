// 시작
'use strict';

/* ================= 시작 ================= */
build('vs');
openMenu('main');
document.fonts && document.fonts.ready.then(() => { if (game.state === 'menu') drawArts(); });
let last = 0;
function frame(ts) {
  const dt = Math.min(50, ts - (last || ts)); last = ts;
  pollPads();
  if (game.state !== 'pause' && game.state !== 'menu') {
    const R = game.mode === 'replay' && game.state === 'play' ? game.replay : null;
    if (R && R.speed < 1) update(dt * R.speed);                        // 리플레이 배속
    else for (let i = 0; i < (R ? R.speed : 1); i++) update(dt);
  }
  if (game.state !== 'menu') render(ts);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
