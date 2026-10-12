// 시작
'use strict';

/* ================= 시작 ================= */
build('vs');
window.gameReady = true;
game.lowFx = stats.lowFx === true;
// 게임 중엔 화면이 꺼지지 않게(지원하는 브라우저만)
let wakeLock = null;
setInterval(() => {
  const want = game.state === 'play' && document.visibilityState === 'visible';
  if (want && !wakeLock && navigator.wakeLock) navigator.wakeLock.request('screen').then(l => { wakeLock = l; l.addEventListener('release', () => { wakeLock = null; }); }).catch(() => {});
  else if (!want && wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}, 2000);
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
// 느린 기기 자동 감지: 게임 중 3초 평균 한 프레임이 26ms(약 38fps)보다 길면 '가볍게' 모드(설정에서 직접 켤 수도 있음)
const perf = { t: 0, n: 0, sum: 0 };
function watchPerf(dt) {
  if (game.state !== 'play' || game.lowFx) { perf.t = perf.n = perf.sum = 0; return; }
  if (dt > 250) return;   // 탭을 갔다 온 직후의 긴 프레임은 빼고
  perf.t += dt; perf.n++; perf.sum += dt;
  if (perf.t >= 3000) { if (perf.sum / perf.n > 26) { game.lowFx = true; fit(); } perf.t = perf.n = perf.sum = 0; }
}
function step(ts) {
  const dt = Math.min(50, ts - (last || ts)); last = ts;
  watchPerf(ts - (frame.prev || ts)); frame.prev = ts;
  pollPads();
  if (game.state !== 'pause' && game.state !== 'menu') {
    const R = game.mode === 'replay' && game.state === 'play' ? game.replay : null;
    if (R && R.speed < 1) update(dt * R.speed);                        // 리플레이 배속
    else for (let i = 0; i < (R ? R.speed : 1); i++) update(dt);
  }
  if (game.state !== 'menu') render(ts);
}
requestAnimationFrame(frame);
