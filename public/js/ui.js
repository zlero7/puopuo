// 설정 창 · 메뉴
'use strict';

/* ================= 설정 창 ================= */
let keyWait = null;
function openSettings() {
  stats = loadStats(); stats.vol = { bgm: 0.5, sfx: 0.8, ...(stats.vol || {}) };
  $('vBgm').value = stats.vol.bgm; $('vSfx').value = stats.vol.sfx; $('oppRank').checked = !!stats.oppRank; $('rankBot').checked = !!stats.rankBot; showVol(); renderKeys();
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  $('padInfo').textContent = pads.length ? `게임패드 ${pads.length}개 연결됨 · 십자키 이동(↑ 하드드롭) · A 시계 · B 반시계 · X/LB 홀드 · Start 일시정지`
    : '게임패드: 연결 후 아무 버튼이나 누르면 인식돼요. 로컬 대전은 패드 2개로도 할 수 있어요.';
  $('settings').classList.remove('hidden'); $('bSetClose').focus();
  if (game.state === 'play') openPause();
}
function closeSettings() { $('settings').classList.add('hidden'); keyWait = null; setHints(game.state === 'menu' ? 'menu' : 'game'); }
function showVol() { $('vBgmV').textContent = Math.round($('vBgm').value * 100) + '%'; $('vSfxV').textContent = Math.round($('vSfx').value * 100) + '%'; }
function renderKeys() {
  const b = { ...DEF_KEYS, ...(stats.keys || {}) };
  $('keyList').innerHTML = ACTIONS.map(([a, lab]) => `<span>${lab}</span>` + [0, 1].map(i =>
    `<button data-k="${a}" data-i="${i}" class="${keyWait && keyWait[0] === a && keyWait[1] === i ? 'wait' : ''}">${keyWait && keyWait[0] === a && keyWait[1] === i ? '키를 누르세요…' : esc(keyName(b[a][i] || ''))}</button>`).join('')).join('');
  $('keyList').querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => { keyWait = [btn.dataset.k, +btn.dataset.i]; renderKeys(); }));
}
['vBgm', 'vSfx'].forEach(id => $(id).addEventListener('input', () => {
  stats = loadStats(); stats.vol = { bgm: +$('vBgm').value, sfx: +$('vSfx').value }; saveStats(); applyVolume(); showVol();
  if (id === 'vSfx') sfx.rot();
}));
window.addEventListener('keydown', e => {          // 키 설정 입력(다른 입력보다 먼저 받음)
  if ($('settings').classList.contains('hidden')) return;
  e.stopImmediatePropagation();
  if (!keyWait) { if (e.key === 'Escape') { e.preventDefault(); closeSettings(); } return; }
  e.preventDefault();
  stats = loadStats(); const keys = { ...DEF_KEYS, ...(stats.keys || {}) };
  const k = e.key === 'Delete' || e.key === 'Backspace' ? '' : e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k) for (const [a] of ACTIONS) keys[a] = keys[a].map(x => x.toLowerCase() === k.toLowerCase() ? '' : x);   // 같은 키 중복 제거
  keys[keyWait[0]] = keys[keyWait[0]].slice(); keys[keyWait[0]][keyWait[1]] = k;
  stats.keys = keys; saveStats(); keyWait = null; renderKeys();
}, true);
$('oppRank').addEventListener('change', () => { stats = loadStats(); stats.oppRank = $('oppRank').checked; saveStats(); });
$('rankBot').addEventListener('change', () => { stats = loadStats(); stats.rankBot = $('rankBot').checked; saveStats(); });
$('bKeyReset').addEventListener('click', () => { stats = loadStats(); stats.keys = null; saveStats(); keyWait = null; renderKeys(); });
$('bSetClose').addEventListener('click', closeSettings);
$('settings').addEventListener('click', e => { if (e.target.id === 'settings') closeSettings(); });
$('bSettings').addEventListener('click', openSettings);

/* ================= 메뉴 ================= */
let cur = 'main';
function setHints(kind) {
  $('hints').innerHTML = kind === 'menu'
    ? '<span><kbd>Esc</kbd> 뒤로</span><span><kbd>Enter</kbd> 결정</span>'
    : game.mode === 'replay' ? '<span><kbd>← →</kbd> 배속</span><span><kbd>Esc</kbd> 일시정지</span>'
    : game.mode === 'local' ? '<span>1P <kbd>WASD</kbd> <kbd>Q E</kbd> 회전 <kbd>R</kbd> 홀드</span><span>2P <kbd>방향키</kbd> <kbd>. /</kbd> 회전 <kbd>,</kbd> 홀드</span><span><kbd>Esc</kbd> 일시정지</span>'
    : (() => { const b = { ...DEF_KEYS, ...(stats.keys || {}) }, n = a => keyName(b[a][0]).replace('방향키 ', '');
      return `<span><kbd>${n('left')} ${n('right')}</kbd> 이동</span><span><kbd>${n('ccw')} ${n('cw')}</kbd> 회전</span><span><kbd>${n('hard')}</kbd> 하드드롭</span>` +
        `<span><kbd>${n('hold')}</kbd> 홀드</span>` + `<span><kbd>${n('pause')}</kbd> ${game.net ? '나가기' : '일시정지'}</span>`; })();
}
// 캐릭터 고르기 화면(카드 8장)
function renderChars(focusId) {
  const sec = $('sc-chars'), mine = stats.char || 'lumi';
  if (!sec.children.length) {
    sec.innerHTML = CHARS.map(ch => `<button class="tile charcard" id="ch-${ch.id}" data-act="char:${ch.id}" style="--c:${ch.col};--d:${ch.d}" data-desc="${esc(ch.name)} — ${esc(ch.desc)}">` +
      `<span class="in"></span><canvas data-char="${ch.id}"></canvas><span class="mine">내 캐릭터</span><span class="tt">${esc(ch.name)}</span></button>`).join('');
    sec.querySelectorAll('.tile').forEach(t => {
      t.addEventListener('click', () => act(t.dataset.act));
      t.addEventListener('mouseenter', () => t.focus({ preventScroll: true }));
      t.addEventListener('focus', () => { $('mDesc').textContent = t.dataset.desc; });
    });
  }
  sec.querySelectorAll('.tile').forEach(t => t.classList.toggle('sel', t.id === 'ch-' + mine));
  requestAnimationFrame(() => sec.querySelectorAll('canvas[data-char]').forEach(c => {
    const g = fitCanvas(c); if (!g) return; drawChar(g.x, c.dataset.char, g.w / 2, g.h / 2 + 4, Math.min(g.w, g.h) * 0.8, 'happy');
  }));
}
function showScreen(id, focusId) {
  document.querySelectorAll('.screen').forEach(el => el.classList.toggle('hidden', el.id !== 'sc-' + id));
  cur = id; $('bandTitle').textContent = TITLES[id];
  renderRecords();
  if (id === 'stats') renderStats();
  if (id === 'adv') { renderAdv(); focusId = focusId || 'adv-0'; }
  if (id === 'chars') { renderChars(); focusId = focusId || 'ch-' + (stats.char || 'lumi'); }
  if (id === 'vs') { showLan(); showRankRec(); }
  setHints('menu');
  requestAnimationFrame(() => {
    drawArts();
    const t = focusId ? $(focusId) : $('sc-' + id).querySelector('.tile[data-act]');
    if (t) t.focus({ preventScroll: true }); else $('mDesc').textContent = '닉네임은 온라인 대전에서 상대에게 보여요.';
  });
}
function openMenu(id = 'main', focusId) {
  game.state = 'menu'; if (AC) bgmPlay('menu'); overlay.classList.add('hidden');
  document.body.classList.remove('ingame');
  $('game').classList.add('hidden'); $('menu').classList.remove('hidden');
  showScreen(id, focusId);
}
function showGame() {
  document.body.classList.add('ingame');
  $('menu').classList.add('hidden'); $('game').classList.remove('hidden');
  if (game.adv) { $('bandTitle').textContent = `어드벤처 ${game.adv.c + 1}-${game.adv.s + 1}`; setHints('game'); fit(); return; }
  const rl = game.rule && game.rule !== 'tsu' && game.mode !== 'solo' ? ` · ${RULES[game.rule].ko}` : '';
  $('bandTitle').textContent = (game.mode === 'replay' ? '리플레이' : game.mode === 'local' ? '로컬 대전' : game.mode === 'solo' ? (game.myStyle === 'tetris' ? `연습 · ${SOLO_KO[game.soloMode || 'endless']}` : game.soloMode === 'efever' ? '엔드리스 피버' : '연습') : game.mode === 'vs' ? `AI 대전 · ${DIFF[game.diff]}` : '대전') + rl;
  setHints('game'); fit();
}
function menuBack() {
  if (cur === 'main') return;
  if (cur === 'vs') cancelWait();
  if (cur === 'solo' || cur === 'psolo') { showScreen('ai', 't-solo'); return; }
  showScreen('main', 't-' + cur);
}
function renderStyle() {
  document.querySelectorAll('.seg').forEach(b => {
    if (!b.dataset.act) return;
    const [kind, who, st] = b.dataset.act.split(':');
    if (kind === 'itab') { b.classList.toggle('on', who === infoTab); return; }
    if (kind === 'ft') { b.classList.toggle('on', +who === (stats.firstTo || 2)); return; }
    if (kind === 'rule') { b.classList.toggle('on', who === (stats.rule || 'tsu')); return; }
    if (kind === 'pl') { b.classList.toggle('on', +who === (stats.players || 2)); return; }
    if (kind === 'board') { b.classList.toggle('on', who === (stats.board || 'wide')); return; }
    b.classList.toggle('on', (who === 'me' ? stats.style || 'puyo' : who === 'p2' ? stats.p2Style || 'puyo' : stats.cpuStyle || 'puyo') === st);
  });
}
function act(a) {
  const [k, v, w] = a.split(':');
  if (k === 'style') {
    stats = loadStats(); if (v === 'me') stats.style = w; else if (v === 'p2') stats.p2Style = w; else stats.cpuStyle = w; saveStats(); renderRecords();
    if (v === 'me') nsend({ t: 'style', style: w });
    return;
  }
  if (k === 'go') showScreen(v);
  else if (k === 'solo') showScreen((stats.style || 'puyo') === 'tetris' ? 'solo' : 'psolo');
  else if (k === 'psolo') { game.soloMode = v; start('solo'); }
  else if (k === 'tsolo') { game.soloMode = v; start('solo'); }
  else if (k === 'local') start('local');
  else if (k === 'advc') { advChap = +v; renderAdv(); $('adv-0') && $('adv-0').focus(); }
  else if (k === 'adv') advPlay(+v);
  else if (k === 'char') { stats = loadStats(); stats.char = v; saveStats(); renderChars(v); }
  else if (k === 'rule') { stats = loadStats(); stats.rule = v; saveStats(); renderStyle(); }
  else if (k === 'pl') { stats = loadStats(); stats.players = +v; saveStats(); renderStyle(); }
  else if (k === 'board') { stats = loadStats(); stats.board = v; saveStats(); renderStyle(); nsend({ t: 'board', board: v }); }
  else if (k === 'ft') { stats = loadStats(); stats.firstTo = +v; saveStats(); renderStyle(); }
  else if (k === 'itab') { infoTab = v; renderInfo(); }
  else if (k === 'diff') { game.diff = +v; start('vs'); }
  else if (k === 'ranked') { if (!location.protocol.startsWith('http')) { status('랭크전은 서버에 접속한 주소(http://…)로 열어야 해요.'); return; } if (needLogin(() => act('ranked'))) return; game.resetOnline = true; connect(() => nsend({ t: 'rq', style: stats.style || 'puyo', name: stats.name, char: stats.char || 'lumi', bot: !!stats.rankBot })); }
  else if (k === 'quick') (game.resetOnline = true), connect(() => nsend({ t: 'quick', style: stats.style || 'puyo', board: stats.board || 'wide', rule: stats.rule || 'tsu', size: stats.players || 2 }));
  else if (k === 'create') (game.resetOnline = true), connect(() => nsend({ t: 'create', style: stats.style || 'puyo', board: stats.board || 'wide', rule: stats.rule || 'tsu', size: stats.players || 2 }));
  else if (k === 'join') $('code').focus();
}
function moveSel(dx, dy) {
  const ts = [...$('sc-' + cur).querySelectorAll('.tile[data-act], .seg')];
  if (!ts.length) return;
  const a = document.activeElement;
  if (!ts.includes(a)) { ts[0].focus(); return; }
  const r = a.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let best = null, bs = Infinity;
  for (const t of ts) {
    if (t === a) continue;
    const q = t.getBoundingClientRect(), x = q.left + q.width / 2 - cx, y = q.top + q.height / 2 - cy;
    const along = x * dx + y * dy; if (along <= 4) continue;
    const overlap = dx ? Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top) : Math.min(r.right, q.right) - Math.max(r.left, q.left);
    const sc = along + (overlap > 0 ? 0 : Math.abs(x * dy - y * dx) * 2);
    if (sc < bs) { bs = sc; best = t; }
  }
  if (best) best.focus();
}
document.querySelectorAll('.seg').forEach(b => {
  b.addEventListener('click', () => { if (b.dataset.act) act(b.dataset.act); });
  b.addEventListener('focus', () => { $('mDesc').textContent = b.dataset.desc || ''; });
});
document.addEventListener('pointerdown', () => { if (!AC) { audio(); applyVolume(); if (game.state === 'menu') bgmPlay('menu'); } }, { once: true });
document.addEventListener('keydown', () => { if (!AC) { audio(); applyVolume(); if (game.state === 'menu') bgmPlay('menu'); } }, { once: true });
document.querySelectorAll('.tile[data-desc]').forEach(t => {
  const d = document.createElement('span'); d.className = 'td'; d.textContent = t.dataset.desc; t.appendChild(d);
});
document.querySelectorAll('.tile[data-act]').forEach(t => {
  t.addEventListener('click', e => { if (e.target.closest('input, .mini')) return; act(t.dataset.act); });
  t.addEventListener('mouseenter', () => { if (document.activeElement.tagName !== 'INPUT') t.focus({ preventScroll: true }); });
  t.addEventListener('focus', () => { const d = t.querySelector('.td'); $('mDesc').textContent = d && getComputedStyle(d).display === 'none' ? t.dataset.desc : ''; });
});
$('pName').addEventListener('change', () => { stats = loadStats(); stats.name = $('pName').value.trim().slice(0, 10) || '플레이어'; $('pName').value = stats.name; saveStats(); });
// 랭크 티어 엠블럼: 브론즈·실버·골드·플래티넘·다이아·마스터(-1은 배치 중). div: 세부 티어 1~3(별 개수)
const TIER_COL = [['#c9834a', '#7a4618'], ['#c3ccd6', '#6d7a88'], ['#ffd23d', '#b07a00'], ['#4fe0c4', '#14806c'], ['#7cb8ff', '#2556b8'], ['#d58cff', '#6b2aa8']];
function drawTierEmblem(c, x, y, size, group, div) {
  const [col, dk] = TIER_COL[group] || ['#cfd1dc', '#6d6b80'], r = size / 2;
  c.save(); c.translate(x, y);
  c.beginPath(); c.moveTo(0, -r); c.lineTo(r * 0.85, -r * 0.55); c.lineTo(r * 0.7, r * 0.45); c.lineTo(0, r); c.lineTo(-r * 0.7, r * 0.45); c.lineTo(-r * 0.85, -r * 0.55); c.closePath();
  const g = c.createLinearGradient(0, -r, 0, r); g.addColorStop(0, mixW(col, 0.35)); g.addColorStop(1, col);
  c.fillStyle = g; c.fill(); c.lineWidth = r * 0.1; c.strokeStyle = dk; c.stroke();
  if (group === 5) drawStar(c, 0, -r * 0.05, r * 0.45, '#fff6c2');
  else if (group < 0) outlined(c, '?', 0, 2, r * 0.9, '#fff', dk, r * 0.12);
  else for (let i = 0; i < div; i++) drawStar(c, (i - (div - 1) / 2) * r * 0.42, r * 0.05, r * 0.2, '#fff');
  c.restore();
}
/* 타일 그림: 게임과 같은 뿌요 렌더러로 그림 */
const SCENES = {
  ai:     { rows: ['000000', '000040', '300440', '331240', '312222', '111322'] },
  solo:   { rows: ['000', '000', '040', '044', '214', '211', '331'] },
  easy:   { rows: ['000', '000', '000', '000', '010', '213', '223'] },
  normal: { rows: ['000', '000', '000', '230', '244', '214', '211'] },
  hard:   { rows: ['000', '102', '132', '332', '344', '314', '114'] },
};
function fitCanvas(c) {
  const w = c.clientWidth, h = c.clientHeight;
  if (!w || !h) return null;
  c.width = w * DPR; c.height = h * DPR;
  const x = c.getContext('2d'); x.setTransform(DPR, 0, 0, DPR, 0, 0); x.clearRect(0, 0, w, h);
  return { x, w, h };
}
function miniField(x, rows, x0, y0, w, h) {
  const nr = rows.length, nc = rows[0].length, cell = Math.min(w / nc, h / nr);
  const ox = x0 + (w - nc * cell) / 2, oy = y0 + (h - nr * cell);
  x.fillStyle = '#1e174e'; x.fillRect(x0, y0, w, h);
  for (let r = 0; r < nr; r++) for (let q = 0; q < nc; q++) { x.fillStyle = (r + q) % 2 ? '#191342' : '#211a55'; x.fillRect(ox + q * cell, oy + r * cell, cell, cell); }
  const items = [], links = [], quads = [], map = {};
  rows.forEach((row, r) => [...row].forEach((ch, q) => { const v = +ch; if (!v) return; const it = { cx: q * CS + CS / 2, cy: r * CS + CS / 2, rx: R, ry: R, col: v }; items.push(it); map[r + ',' + q] = it; }));
  rows.forEach((row, r) => [...row].forEach((ch, q) => {
    const v = +ch, a = map[r + ',' + q]; if (!v || v === OJ) return;
    const rt = map[r + ',' + (q + 1)], dn = map[(r + 1) + ',' + q], dg = map[(r + 1) + ',' + (q + 1)];
    if (rt && rt.col === v) { a.mask = (a.mask || 0) | RT; rt.mask = (rt.mask || 0) | LT; links.push([a, rt]); }
    if (dn && dn.col === v) { a.mask = (a.mask || 0) | DN; dn.mask = (dn.mask || 0) | UP; links.push([a, dn]); }
    if (rt && dn && dg && rt.col === v && dn.col === v && dg.col === v) quads.push([a, rt, dn, dg]);
  }));
  x.save(); x.translate(ox, oy); x.scale(cell / CS, cell / CS); drawPuyos(x, items, links, quads); x.restore();
}
function drawArts() {
  document.querySelectorAll('#menu .screen:not(.hidden) canvas.art').forEach(c => {
    const g = fitCanvas(c); if (!g) return; const { x, w, h } = g, kind = c.dataset.art;
    if (SCENES[kind]) miniField(x, SCENES[kind].rows, 0, 0, w, h);
    else if (kind === 'vs') {
      const fw = w * 0.42;
      miniField(x, ['000', '000', '200', '234', '114'], 0, 0, fw, h);
      miniField(x, ['000', '000', '000', '403', '433'], w - fw, 0, fw, h);
      x.strokeStyle = '#ffd93d'; x.lineWidth = 4; x.lineCap = 'round'; x.setLineDash([2, 9]);
      x.beginPath(); x.moveTo(fw * 0.6, h * 0.55); x.quadraticCurveTo(w / 2, -h * 0.1, w - fw * 0.5, h * 0.18); x.stroke(); x.setLineDash([]);
      const gr = x.createRadialGradient(w - fw * 0.5, h * 0.18, 1, w - fw * 0.5, h * 0.18, 16); gr.addColorStop(0, '#fff'); gr.addColorStop(0.4, '#ffd93d'); gr.addColorStop(1, 'rgba(255,217,61,0)');
      x.fillStyle = gr; x.beginPath(); x.arc(w - fw * 0.5, h * 0.18, 16, 0, Math.PI * 2); x.fill();
    } else if (kind === 'chars') {
      const ids = [stats.char || 'lumi', ...CHARS.map(c => c.id).filter(i => i !== (stats.char || 'lumi'))].slice(0, 3);
      [1, 2, 0].forEach(i => drawChar(x, ids[i], w * (0.5 + (i === 0 ? 0 : i === 1 ? -0.3 : 0.3)), h * (i ? 0.58 : 0.5), Math.min(w * 0.36, h * (i ? 0.7 : 0.9)), 'happy'));   // 가운데(내 캐릭터)를 맨 위에
    } else if (kind === 'adv') {
      const ids = ['toto', 'lumi', 'kuro'];
      x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(0, h * 0.62, w, h * 0.38);
      [0, 2, 1].forEach(i => drawChar(x, ids[i], w * (0.2 + i * 0.3), h * (i === 1 ? 0.48 : 0.56), Math.min(w * 0.3, h * (i === 1 ? 0.85 : 0.7)), 'happy'));
    } else if (kind === 'rank') {               // 내 티어 엠블럼(서버에서 받아온 뒤 다시 그림)
      const m = game.myRank;
      drawTierEmblem(x, w / 2, h / 2, Math.min(w, h) * 0.9, m ? m.group : -1, m && !m.placing ? m.div : 0);
    } else if (kind === 'stats') {
      x.fillStyle = '#f4f2fb'; x.fillRect(0, 0, w, h);
      const C = ['#39c63c', '#ffb400', '#ff4559', '#2f78f0'];
      for (let i = 0; i < 4; i++) {
        const y = h * (0.14 + i * 0.21), bw = w * [0.62, 0.8, 0.45, 0.7][i];
        x.fillStyle = '#dcd8ec'; x.fillRect(w * 0.1, y, w * 0.8, h * 0.11);
        x.fillStyle = C[i]; x.fillRect(w * 0.1, y, bw, h * 0.11);
      }
    }
  });
  document.querySelectorAll('#menu .screen:not(.hidden) canvas.ico').forEach(c => {
    const g = fitCanvas(c); if (!g) return; const { x, w, h } = g, s = Math.min(w, h) / (CS * 1.15);
    x.save(); x.translate(w / 2, h / 2 + 2); x.scale(s, s);
    drawPuyos(x, [{ cx: 0, cy: 0, rx: R, ry: R, col: +c.dataset.col }], []); x.restore();
  });
}
window.addEventListener('resize', () => { if (game.state === 'menu') drawArts(); });
