// 시작
'use strict';

/* ================= 시작 ================= */
build('vs');
window.gameReady = true;
openMenu('main');
importedNotice();
if (!stats.tutSeen && !stats.games) {          // 처음 온 사람: 튜토리얼 안내(한 번만)
  stats.tutSeen = true; saveStats();
  dialog([['lumi', '어서 와! 처음이라면 AI 대전 → 연습 → 튜토리얼에서 조작법부터 배워 봐.'], ['lumi', '폰에서는 화면 아래 버튼으로 움직이고, 위의 ← 로 뒤로 갈 수 있어!']]);
}
document.fonts && document.fonts.ready.then(() => { if (game.state === 'menu') drawArts(); });
let last = 0;
let frameErrs = 0;
function frame(ts) {
  requestAnimationFrame(frame);                 // 먼저 다음 프레임을 예약(이번 프레임에서 오류가 나도 게임이 멈추지 않게)
  try { step(ts); } catch (e) { if (frameErrs++ < 5) console.error(e); }
}
function step(ts) {
  const dt = Math.min(50, ts - (last || ts)); last = ts;
  pollPads();
  if (game.state !== 'pause' && game.state !== 'menu') {
    const R = game.mode === 'replay' && game.state === 'play' ? game.replay : null;
    if (R && R.speed < 1) update(dt * R.speed);                        // 리플레이 배속
    else for (let i = 0; i < (R ? R.speed : 1); i++) update(dt);
  }
  if (game.state !== 'menu') render(ts);
}
requestAnimationFrame(frame);
