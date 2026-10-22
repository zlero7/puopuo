// 시작
'use strict';

/* ================= 시작 ================= */
build('vs');
window.gameReady = true;
// 그림이 스크립트를 읽는 동안 이미 다 읽혔으면 그때는 준비 전이라 다시 그리기가 건너뛰어졌음 → 준비된 뒤 그림이 다 풀리면(decode) 한 번 더 그림(시작하자마자 그림이 안 보이다 다른 탭을 누르면 보이던 문제)
if (CHAR_IMG) Object.values(CHAR_IMG).forEach(i => { if (i.src) i.decode().then(onArtImage, () => {}); });
TIER_IMG.decode().then(onArtImage, () => {});
// 시작 직후 화면 크기가 아직 정해지기 전에 한 번 그리면 그림 칸이 비어 있을 수 있음 → 크기가 바뀔 때, 창이 다 읽힌 뒤, 시작 화면이 걷힌 뒤에도 다시 그림
{
  let rt = 0; const again = () => { clearTimeout(rt); rt = setTimeout(onArtImage, 60); };
  if (window.ResizeObserver) { const menu = document.getElementById('menu'); if (menu) new ResizeObserver(again).observe(menu); }
  window.addEventListener('load', again); window.addEventListener('resize', again); window.addEventListener('puyo-splash-out', again);
  [150, 600, 1500, 3500].forEach(ms => setTimeout(onArtImage, ms));
}
if (APP && APP.uiReady) APP.uiReady().catch(() => {});
if (typeof socSyncBoot === 'function') setTimeout(socSyncBoot, 1500);   // 켤 때 로그인돼 있으면 이 계정의 기록을 서버와 맞춤   // 새 화면이 잘 떴다고 본체에 알림(안 알리면 이전 화면으로 되돌림)
game.lowFx = stats.lowFx === true;
// 게임 중엔 화면이 꺼지지 않게(지원하는 브라우저만)
let wakeLock = null;
setInterval(() => {
  const want = game.state === 'play' && document.visibilityState === 'visible';
  if (want && !wakeLock && navigator.wakeLock) navigator.wakeLock.request('screen').then(l => { wakeLock = l; l.addEventListener('release', () => { wakeLock = null; }); }).catch(() => {});
  else if (!want && wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}, 2000);
openMenu('main');
if (!stats.tutSeen && !stats.games) {          // 처음 온 사람: 튜토리얼 안내(한 번만)
  stats.tutSeen = true; saveStats();
  dialog([['lumi', '어서 와! 처음이라면 AI 대전 → 연습 → 튜토리얼에서 조작법부터 배워 봐.'], ['lumi', '폰에서는 화면 아래 버튼으로 움직이고, 위의 ← 로 뒤로 갈 수 있어!']]);
}
document.fonts && document.fonts.ready.then(() => { if (game.state === 'menu') drawArts(); });
let last = 0;
let frameErrs = 0;
let lastDraw = 0;
// 프레임 제한(설정 > 게임): 0은 모니터 기준. 모니터가 120·144Hz여도 60으로 묶어 CPU·배터리를 아낌. 메뉴(움직임이 거의 없음)는 항상 30으로
const fpsGap = () => game.state === 'menu' ? 1000 / 30 : stats.fps > 0 ? 1000 / stats.fps : 0;
function frame(ts) {
  requestAnimationFrame(frame);                 // 먼저 다음 프레임을 예약(이번 프레임에서 오류가 나도 게임이 멈추지 않게)
  const gap = fpsGap();
  if (gap && ts - lastDraw < gap - 2) return;   // 아직 시간이 안 됐으면 건너뜀(−2ms: 모니터 주기와 어긋나 한 프레임씩 더 걸리지 않게)
  lastDraw = ts;
  try { step(ts); } catch (e) { if (frameErrs++ < 5) console.error(e); }
}
// 느린 기기 자동 감지: 게임 중 3초 평균 한 프레임이 26ms(약 38fps)보다 길면 '가볍게' 모드(설정에서 직접 켤 수도 있음)
const perf = { t: 0, n: 0, sum: 0, base: 1e9 };   // base: 이 기기의 기본 프레임 간격(30Hz로 묶인 기기를 느린 기기로 오해하지 않게)
function watchPerf(dt) {
  if (game.state !== 'play' || game.lowFx || stats.lowFx === false) { perf.t = perf.n = perf.sum = 0; return; }   // 설정에서 직접 끈 사람은 자동으로 켜지 않음
  if (dt > 250) return;   // 탭을 갔다 온 직후의 긴 프레임은 빼고
  perf.t += dt; perf.n++; perf.sum += dt; if (dt > 4) perf.base = Math.min(perf.base, dt);
  if (perf.t >= 3000) { if (perf.sum / perf.n > Math.max(26, perf.base * 1.6)) { game.lowFx = true; fit(); } perf.t = perf.n = perf.sum = 0; }
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
