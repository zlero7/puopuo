// 키보드 · 터치 입력
'use strict';

/* ================= 입력 ================= */
function human() { return game.state === 'play' ? game.fields.find(f => f.human && !(f.pi > 0)) || null : null; }
window.addEventListener('keydown', e => {
  const k = e.key;
  if (dlgOpen()) { dlgKey(e); return; }             // 어드벤처 대화창
  if (game.state === 'menu') { menuKey(e); return; }
  if (!overlay.classList.contains('hidden')) {           // 일시정지·결과 창
    if (k === ' ' || (k === 'Enter' && performance.now() - game.ovAt < 600)) { e.preventDefault(); return; }
    if (k === 'Escape' || ((k === 'p' || k === 'P') && game.ovKind === 'pause')) {
      e.preventDefault();
      if (game.ovKind === 'pause' || game.ovKind === 'forfeit') resume();
      else ($('bMenu').classList.contains('hidden') ? $('bLeave') : $('bMenu')).click();
    }
    const step = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[k];
    if (step) {                                          // 방향키로 버튼 이동
      e.preventDefault();
      const bs = [...overlay.querySelectorAll('.btn')].filter(b => !b.classList.contains('hidden'));
      const i = bs.indexOf(document.activeElement);
      bs[(i + step + bs.length) % bs.length].focus();
    }
    return;
  }
  if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' '].includes(k)) e.preventDefault();
  if ((k === 'm' || k === 'M') && !e.repeat) { muted = !muted; applyVolume(); return; }
  const lk = k.toLowerCase();
  if (game.mode === 'replay') {                         // 리플레이: ← → 배속, Esc 일시정지
    if ((lk === 'escape' || lk === 'p') && !e.repeat) openPause();
    else if (k === 'ArrowLeft' || k === 'ArrowDown') replaySpeed(-1);
    else if (k === 'ArrowRight' || k === 'ArrowUp') replaySpeed(1);
    return;
  }
  if (game.mode === 'local') {
    if ((lk === 'escape' || lk === 'p') && !e.repeat) { openPause(); return; }
    for (let pi = 0; pi < 2; pi++) { const a = LOCAL_KEYS[pi][lk]; if (a) { e.preventDefault(); playerAction(pi, a, true, e.repeat); return; } }
    return;
  }
  const a = keyMap()[lk];
  if (!a) return;
  e.preventDefault();
  if (game.state === 'intro' && a !== 'left' && a !== 'right') return;
  playerAction(0, a, true, e.repeat);
});
function menuKey(e) {
  const k = e.key, ae = document.activeElement;
  if (ae && ae.tagName === 'INPUT') {
    if (k === 'Escape') { ae.blur(); const t = ae.closest('.tile[data-act]'); if (t) t.focus(); }
    return;
  }
  if (k === 'Escape' || k === 'Backspace') { e.preventDefault(); menuBack(); return; }
  const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
  if (d) { e.preventDefault(); moveSel(d[0], d[1]); return; }
  if ((k === 'Enter' || k === ' ') && ae && ae.matches('div.tile[data-act]')) { e.preventDefault(); act(ae.dataset.act); }
}
window.addEventListener('keyup', e => {
  if (e.key === ' ' && !overlay.classList.contains('hidden')) e.preventDefault();
  const lk = e.key.toLowerCase();
  if (game.mode === 'local') { for (let pi = 0; pi < 2; pi++) { const a = LOCAL_KEYS[pi][lk]; if (a) playerAction(pi, a, false, false); } return; }
  const a = keyMap()[lk]; if (a) playerAction(0, a, false, false);
});
window.addEventListener('blur', () => { for (const i of game.inp) i.left = i.right = i.down = false; if (game.state === 'play' && !game.net) openPause(); });
window.addEventListener('resize', fit);
$('bRetry').addEventListener('click', () => {
  if (game.adv && game.ovKind === 'adv') { if (game.advResult > 0) advNext(); else advPlay(game.adv.s, true, game.adv.c); return; }
  if (game.adv && game.ovKind === 'pause') { advPlay(game.adv.s, true, game.adv.c); return; }
  if (game.mode === 'replay') { startReplay(game.replay.data); return; } game.keepSeries = game.ovKind === 'next'; start(game.lastMode, null, game.lastMode === 'solo' ? null : { me: game.myStyle, op: game.oppStyle, ops: game.cpuStyles }, BOARD, game.rule); });
$('bResume').addEventListener('click', resume);
$('dlg').addEventListener('click', () => dlgNext());
$('bForfeit').addEventListener('click', forfeit);
$('bMenu').addEventListener('click', () => {
  if (game.net) { nsend({ t: 'leave' }); game.net = false; }
  if (game.mode === 'replay') { game.replay = null; openMenu('stats'); return; }
  if (game.adv) { advToMenu(game.ovKind === 'adv' && game.advResult > 0); return; }
  if (game.mode === 'solo' && game.myStyle === 'tetris') { openMenu('solo', 't-' + (game.soloMode || 'endless')); return; }
  if (game.mode === 'solo') { openMenu('psolo', 't-p' + (game.soloMode || 'endless')); return; }
  if (game.mode === 'local') { openMenu('vs', 't-local'); return; }
  openMenu(game.mode === 'online' ? 'vs' : 'ai', game.mode === 'solo' ? 't-solo' : game.mode === 'vs' ? ['t-easy', 't-normal', 't-hard'][game.diff] : 't-quick');
});
