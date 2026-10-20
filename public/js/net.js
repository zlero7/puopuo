// 온라인 대전 클라이언트
'use strict';

/* ================= 온라인 ================= */
const net = { ws: null };
$('srv').value = location.protocol.startsWith('http') ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}` : 'ws://localhost:3000';   // 앱은 서버 주소를 본체에서 받음(appbridge.js)
const status = msg => { $('netStatus').textContent = msg; };
function gsend(d) { if (net.ws && net.ws.readyState === 1) net.ws.send(JSON.stringify({ t: 'g', d })); }
function nsend(m) { if (net.ws && net.ws.readyState === 1) net.ws.send(JSON.stringify(m)); }
function connect(then) {
  if (net.ws && net.ws.readyState === 1 && net.authed) { then(); return; }
  if (net.ws && net.ws.readyState <= 1) return;                       // 연결 중(앱은 로그인 확인 중 포함)
  let ws;
  if (APP && !appCfg.server) { status('서버 주소가 정해지지 않았어요. 계정 창에서 서버 주소를 정해 주세요.'); openAcct('login'); return; }
  try { ws = new WebSocket(APP ? appCfg.ws : $('srv').value.trim()); } catch (e) { status('서버 주소 형식이 올바르지 않습니다. 예: ws://localhost:3000'); return; }
  net.ws = ws; net.authed = !APP; net.pending = null; status('서버에 연결하는 중…');
  ws.onopen = () => {
    if (!APP) { status('서버에 연결되었습니다.'); then(); return; }
    // 앱: 본체가 세션으로 1회용 접속표를 받아 오면 그것으로 로그인(세션·비밀번호는 이 화면에 없음)
    APP.ticket().then(r => {
      if (net.ws !== ws) return;
      if (!r.ok) { status(r.msg || '로그인이 필요해요.'); if (r.err === 'auth') { appCfg.account = null; openAcct('login', () => connect(then)); } ws.close(); return; }
      net.pending = then; ws.send(JSON.stringify({ t: 'auth', ticket: r.ticket, ver: appCfg.version }));
    });
  };
  ws.onerror = () => status('서버에 연결할 수 없습니다. 서버가 켜져 있는지, 주소가 맞는지 확인하세요.');
  ws.onclose = () => {
    if (net.ws === ws) { net.ws = null; setWait(null); }
    $('roomBox').classList.add('hidden'); $('bCancel').classList.add('hidden');
    if (game.net && (game.state === 'play' || game.state === 'over')) {
      game.net = false; showMessage('연결 끊김', '서버와의 연결이 끊겼습니다. 다시 접속해 주세요.');
    } else if (game.state === 'menu' && $('netStatus').textContent) status('서버와의 연결이 끊겼어요. 다시 시도해 주세요.');   // 기다리던 중이었으면 더는 찾는 중이 아님
  };
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } onNet(m); };
}
function onNet(m) {
  switch (m.t) {
    case 'authok': { net.authed = true; status('서버에 연결되었습니다.'); const f = net.pending; net.pending = null; if (f) f(); break; }
    case 'autherr': { net.pending = null; status(m.msg || '로그인하지 못했어요.'); if (m.code !== 'old') { appCfg.account = null; openAcct('login'); } break; }
    case 'created':
      setWait(`방 ${m.code}`, m.size > 2 ? `1/${m.size}명` : '상대 기다리는 중');
      $('roomCode').textContent = m.code; $('roomBox').classList.remove('hidden'); $('bCancel').classList.remove('hidden');
      status(m.size > 2 ? `방 코드를 알려주고 기다리세요. (1/${m.size}명)` : '상대에게 방 코드를 알려주고 기다리세요.'); break;
    case 'waiting': setWait('빠른 매칭', m.size > 2 ? `${m.have}/${m.size}명` : `${STYLE_KO[stats.style || 'puyo']}`); $('bCancel').classList.remove('hidden'); status(m.size > 2 ? `사람을 모으는 중… (${m.have}/${m.size}명)` : '상대를 찾는 중…'); break;
    case 'lobby': if (net.wait) net.wait.sub = `${m.have}/${m.size}명`; else setWait('방', `${m.have}/${m.size}명`); drawWait(); status(`사람을 모으는 중… (${m.have}/${m.size}명)`); break;
    case 'rwait': setWait('랭크전', `${STYLE_KO[stats.style || 'puyo']} · ${m.text}`); $('bCancel').classList.remove('hidden'); status(`랭크전 상대를 찾는 중… ${m.text} · 기다릴수록 범위가 넓어져요${m.botIn ? ` · ${m.botIn}초 안에 못 찾으면 비슷한 실력의 AI와 대전` : ''}`); break;
    case 'rdone':                          // 랭크전 끝: 레이팅 변화
      if (game.mode !== 'online' || !game.ranked) break;
      game.rankRes = m;
      // 내 기록의 이번 판 줄에 RP 변화 · 상대 티어를 붙임(마지막 판이 아직 안 끝났으면 기록할 때 붙임)
      if (m.why) { if (game.state === 'play' && !game.recorded) game.ffPending = m; else forfeitRow(m); }   // 기권·다음 판 안 함으로 끝남: 판 기록과 따로 '기권승/기권패' 한 줄(판이 끝나 기록된 뒤에)
      else if (game.recorded) attachRank(m); else game.rkPending = m;
      if (!overlay.classList.contains('hidden')) {
        $('ovSub').textContent = rankSub(m);
        if (m.why) $('ovTitle').textContent = rankTitle(m) || (m.win ? '랭크전 승리!' : '랭크전 패배');
        else if (rankTitle(m)) $('ovTitle').textContent = rankTitle(m);
        $('resultBox').className = 'result t-' + (m.win ? 'yellow' : 'blue');
        game.autoNextT = 0; overlayBtns('menu'); showRankRes(m); rankFx(m);
      }
      break;
    case 'rjudge': {                     // 랭크전: 서버가 정한 이번 판 승패(규칙 위반·시간 초과면 그쪽을 탈락시킴)
      game.rjudge = m;
      const f = game.seatField && game.seatField[m.loser];
      if (f && game.state === 'play' && !f.dead) {
        if (m.reason !== '탈락') f.texts.push({ txt: m.reason === '오래 두지 않음' ? '시간 초과' : '규칙 위반', x: f.fw / 2, y: FH * 0.3, age: 0, dur: 4000, col: '#ff8a9a', size: 30 });
        if (f === game.fields[0]) game.net = false;   // 내 판: 더 보내지 않음
        f.dieLater = false; f.queue = []; f.remote = false; f.die();
      }
      if (game.state === 'over') fixOver(m);
      break;
    }
    case 'error': status(m.msg); setWait(null); break;
    case 'start': $('roomBox').classList.add('hidden'); $('bCancel').classList.add('hidden'); status(''); setWait(null);
      if (!m.styles) { status('서버가 예전 버전이라 서로의 스타일을 알 수 없어요. 서버를 끄고 새 server.js로 다시 켜 주세요.'); nsend({ t: 'leave' }); break; }
      {
        // 자리 번호(seat) 순서: 나 → 나머지는 자리 순. 판 번호와 자리 번호를 서로 바꿀 수 있게 기억
        const order = [m.you, ...m.styles.map((_, i) => i).filter(i => i !== m.you)];
        game.netN = m.styles.length;
        if (m.ranked) { if (!game.ranked || game.rankRes) game.series = null; game.ranked = true; game.rankRes = null; } else game.ranked = false;
        game.mySeat = m.you; game.rjudge = null; game.rkPending = null; game.rankLeft = false; game.ffPending = null;
        game.botOpp = m.bot && CHARS.some(c => c.id === m.bot.char) ? { name: String(m.bot.name).slice(0, 10), char: m.bot.char, lv: +m.bot.lv || 0 } : null;
        start('online', m.seed, { me: m.styles[m.you], op: m.styles[order[1]], ops: order.slice(2).map(i => m.styles[i]) }, m.board, m.rule || 'tsu');
        game.seatField = {}; order.forEach((s, i) => { game.fields[i].seat = s; game.seatField[s] = game.fields[i]; game.fields[i].rankEm = m.ranks ? m.ranks[s] : null; });
      }
      break;
    case 'oppReady': $('ovSub').textContent = m.size > 2 ? `${m.have}/${m.size}명이 다시 하기를 눌렀습니다.` : '상대가 다시 하기를 눌렀습니다.'; break;
    case 'left':
      if (game.mode !== 'online') break;                  // 이미 다른 게임 중이면 예전 방 소식은 무시
      if (game.ranked && game.state === 'play') { game.oppLeft = true; game.net = false; game.fields[1].die(); break; }   // 랭크전: 상대 이탈 = 내 승리
      if (game.fields.length > 2 && m.rest >= 2) {          // 3~4인: 나간 사람만 탈락 처리하고 계속
        const f = game.seatField && game.seatField[m.who];
        if (f && !f.dead && game.state === 'play') { f.die(); f.texts.push({ txt: '나감', x: f.fw / 2, y: FH * 0.3, age: 0, dur: 1500, col: '#fff', size: 30 }); }
        break;
      }
      game.oppLeft = true; game.resetOnline = true;
      if (game.state === 'over' || (game.fields[1] && game.fields[1].dead)) {   // 이미 끝난 판(기권 포함): 결과는 그대로, 다시 하기만 막음
        game.net = false;
        if (!overlay.classList.contains('hidden')) { overlayBtns('menu'); if (!game.rankRes) $('ovSub').textContent += ' · 상대가 나갔습니다'; }
      } else if (game.net) { game.net = false; showMessage('상대가 나갔습니다', '메뉴에서 새 대전을 시작하세요.'); }
      break;
    case 'g': onGame(m.d, m.f); break;
  }
}
function onGame(d, from) {
  const op = from != null && game.seatField ? game.seatField[from] : game.fields[1];
  if (!op || !op.remote || game.mode !== 'online') return;
  d = cleanEv(op, d); if (!d) return;                           // 상대가 보낸 이상한 값은 고치거나 버림
  if (d.to != null) { const t = game.seatField && game.seatField[d.to]; d = { ...d, to: t ? game.fields.indexOf(t) : undefined }; }   // 자리 번호 → 내 판 번호
  if (d.t === 'hi') {
    op.name = cleanName(d.name || '상대'); if (CHARS.some(c => c.id === d.char)) op.char = d.char;   // 나와 같은 캐릭터여도 그대로 보여 줌
    if (op.other) { op.other.name = op.name; op.other.char = op.char; } return;
  }
  if (d.t === 'st') recState(op, d); else recEv(op, d);         // 상대 판도 리플레이에 기록
  applyRemote(op, d);
}
// 서버가 알려주는 내부망 주소를 표시 — 다른 사람은 이 주소로 접속하면 된다
function showLan() {
  if (!location.protocol.startsWith('http')) return;
  fetch('/info').then(r => r.json()).then(info => {
    if (!info.lan || !info.lan.length) return;
    $('lanInfo').innerHTML = '다른 사람 접속 주소 ' + info.lan.map(u => `<b>${esc(u)}</b>`).join(' · ');
    $('lanInfo').classList.remove('hidden');
  }).catch(() => {});
}
// 랭크전: 이 브라우저를 구분하는 토큰(처음 한 번 만들어 저장)
const rankToken = (() => {
  const mk = () => Array.from({ length: 24 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'[rnd(56)]).join('');
  try { let t = localStorage.getItem('puyo-token'); if (!/^[A-Za-z0-9]{16,40}$/.test(t || '')) { t = mk(); localStorage.setItem('puyo-token', t); } return t; } catch (e) { return mk(); }
})();
const rankUrl = (p, style) => `/rank/${p}?style=${style}&token=${rankToken}`;
function showRankRec() {
  if (!serverOk()) { $('recRank').textContent = '서버 필요'; return; }
  if (APP && !appCfg.account) { $('recRank').textContent = '로그인 필요'; return; }
  apiGet('/rank/me', { style: stats.style || 'puyo' }).then(m => { game.myRank = m; $('recRank').textContent = m.text; drawArts(); }).catch(e => { if (e.auth) $('recRank').textContent = '로그인 필요'; });
}
function cancelWait() { nsend({ t: 'leave' }); $('roomBox').classList.add('hidden'); $('bCancel').classList.add('hidden'); status(''); setWait(null); }
// 매칭·방 기다리는 중 표시: 다른 메뉴로 가도 기다림은 그대로이고, 화면 위 제목 옆에 '무슨 매칭 · 얼마나 기다렸는지'를 보여 줌(누르면 대전 화면으로)
function setWait(kind, sub) {
  if (!kind) net.wait = null;
  else if (!net.wait || net.wait.kind !== kind) net.wait = { kind, sub, since: Date.now() };
  else net.wait.sub = sub;
  drawWait();
}
function drawWait() {
  const b = $('mmBadge'), w = net.wait;
  if (!w || game.state !== 'menu') { b.classList.add('hidden'); return; }
  const s = Math.floor((Date.now() - w.since) / 1000);
  const what = w.kind === '랭크전' ? '랭크전 매칭' : w.kind === '빠른 매칭' ? '빠른 매칭' : `${w.kind} 대기`;
  b.innerHTML = `<span class="dot"></span><b>${esc(what)}<i> 중</i></b><small>${esc(w.sub || '')}</small><span class="tm">${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</span>`;
  b.classList.remove('hidden');
}
setInterval(() => { if (net.wait) drawWait(); }, 1000);
$('mmBadge').addEventListener('click', () => { if (game.state === 'menu') openMenu('vs', net.wait && net.wait.kind === '랭크전' ? 't-rank' : 't-quick'); });
$('bCancel').addEventListener('click', cancelWait);
$('bJoin').addEventListener('click', () => {
  const code = $('code').value.trim().toUpperCase();
  if (code.length !== 4) { status('4자리 방 코드를 입력하세요.'); return; }
  if (needLogin(() => $('bJoin').click())) return;
  if (askName(() => $('bJoin').click())) return;
  game.resetOnline = true;
  connect(() => nsend({ t: 'join', code, style: stats.style || 'puyo' }));
});
$('code').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') $('bJoin').click(); });
$('srv').addEventListener('keydown', e => e.stopPropagation());
$('bRematch').addEventListener('click', () => { nsend({ t: 'ready', style: stats.style || 'puyo' }); $('ovSub').textContent = '상대를 기다리는 중…'; });
$('bLeave').addEventListener('click', () => { if (rankLeave()) return; nsend({ t: 'leave' }); game.net = false; openMenu('vs', 't-quick'); });

// 터치 버튼: #pad는 1P(로컬 대전) · 나, #pad2는 로컬 대전 2P. 다시 보기에선 ◀ ▶가 배속
document.querySelectorAll('#pad button, #pad2 button').forEach(btn => {
  const k = btn.dataset.k, pi = btn.closest('#pad2') ? 1 : 0, act = { down: 'soft', menu: 'pause' }[k] || k;
  btn.addEventListener('pointerdown', e => {
    e.preventDefault(); btn.classList.add('on');
    if (stats.vib !== false && navigator.vibrate) try { navigator.vibrate(8); } catch (_) {}   // 짧은 진동(안드로이드)
    if (game.mode === 'replay') { if (k === 'left' || k === 'right') replaySpeed(k === 'left' ? -1 : 1); else if (k === 'menu') openPause(); return; }
    playerAction(pi, act, true);
  });
  const up = () => { btn.classList.remove('on'); if (game.mode !== 'replay' && (k === 'left' || k === 'right' || k === 'down')) playerAction(pi, act, false); };
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => btn.addEventListener(ev, up));
});
// 랭크전 결과(RP 변화)를 기록의 이번 판 줄에 붙임
function attachRank(m) {
  game.rkPending = null;
  stats = loadStats(); const h = stats.history[0];
  if (!h || h.cat !== 'ranked' || h.rk) return;
  h.rk = { d: m.d, event: m.event, placing: m.event === 'placed' || m.placing, after: m.text, group: m.group, div: m.div, opp: m.opp, score: m.score }; saveStats();
}
const rankSub = m => rankLine(m) + (m.why ? ` · ${m.win ? '상대 기권' : '기권'}` : '');
// 기권으로 끝난 시리즈: 기록에 따로 한 줄(승패 · 시리즈 점수 · RP 변화)
function forfeitRow(m) {
  game.rkPending = null; game.ffPending = null;
  stats = loadStats();                                 // 승패 횟수는 판마다 이미 셌으니 더하지 않음
  const me = game.fields[0], op = game.fields[1];
  stats.history.unshift({ d: Date.now(), m: `랭크전 · ${op ? op.name : '상대'} · ${m.win ? '상대 기권' : '기권'}`, r: m.win ? 'w' : 'l', sc: 0, ch: 0, k: me && me.kind === 'tetris' ? 't' : 'p', rp: null, cat: 'ranked',
    mc: (me && me.char) || 'lumi', oc: [(op && op.char) || 'lumi'], on: op ? op.name : '', pl: null, sr: m.score,
    rk: { d: m.d, event: m.event, placing: m.event === 'placed' || m.placing, after: m.text, group: m.group, div: m.div, opp: m.opp, score: m.score } });
  stats.history = stats.history.slice(0, 100); saveStats();
}
// 화면에서 판이 끝난 뒤 서버 판정이 왔을 때: 승패가 다르면 서버 쪽으로 고치고(기록·결과 화면 포함) 시리즈 점수 맞춤
function fixOver(m) {
  const me = game.fields[0], win = m.loser !== game.mySeat;
  if (!game.ranked || game.mode !== 'online' || !me || game.rankLeft) return;   // 내가 기권하고 나가는 중이면 기권 결과 화면 유지
  const was = `${!!me.won}${game.series ? game.series.me + ':' + game.series.op : ''}`;
  syncSeries();
  if (!!me.won !== win) {
    me.won = win; if (game.fields[1]) game.fields[1].won = !win;
    if (game.recorded) {
      stats = loadStats(); const h = stats.history[0];
      if (h && h.cat === 'ranked') { h.r = win ? 'w' : 'l'; stats.online[win ? 'w' : 'l']++; stats.online[win ? 'l' : 'w'] = Math.max(0, stats.online[win ? 'l' : 'w'] - 1); }
      saveStats();
    }
  }
  if (game.recorded) { stats = loadStats(); const h = stats.history[0]; if (h && h.cat === 'ranked' && game.series) { h.sr = [game.series.me, game.series.op]; saveStats(); } }
  // 이미 띄운 결과 화면은 닫았다가 고친 내용으로 다시 띄움(다음 판 자동 시작도 새로 정함)
  const now = `${!!me.won}${game.series ? game.series.me + ':' + game.series.op : ''}`;
  if (was !== now && !overlay.classList.contains('hidden') && (game.ovKind === 'rnext' || game.ovKind === 'menu')) { game.autoNextT = 0; overlay.classList.add('hidden'); }
}
// 랭크전 시리즈 점수는 서버 판정에 맞춤(거의 동시에 탈락해서 화면 판정이 다를 때)
function syncSeries() {
  const j = game.rjudge; if (!j || !game.series || !game.ranked || game.mySeat == null) return;
  game.series.me = j.score[game.mySeat]; game.series.op = j.score[1 - game.mySeat];
}
// 랭크전 결과 문구: 배치 진행 / 배치 완료 / RP 변화와 승급·강등
const rankLine = m => {
  const sc = m.score ? `${m.score[0]} : ${m.score[1]} · ` : '';
  if (m.event === 'placed') return `${sc}배치 완료(${m.pw}승 ${m.pl}패) → ${m.text}`;
  if (m.placing) return `${sc}배치 ${m.placed}/${m.need} (${m.pw}승 ${m.pl}패)`;
  const ev = { promote: ' · 승급!', master: ' · 마스터 달성!', demote: ' · 강등', shield: ' · 강등 보호' }[m.event] || '';
  return `${sc}${m.d >= 0 ? '+' : ''}${m.d} RP → ${m.text}${ev}`;
};
const rankTitle = m => m.event === 'placed' ? `배치 완료! ${m.label === '마스터' ? '마스터' : m.label}` : m.event === 'promote' ? `승급! ${m.label}` : m.event === 'master' ? '마스터 달성!' : m.event === 'demote' ? `강등… ${m.label}` : m.event === 'shield' ? `강등 보호! ${m.label}` : null;
// 랭크전 결과 패널: 왼쪽 내 티어와 RP 변화, 오른쪽 상대 이름·티어
function showRankRes(m) {
  const box = $('ovRank');
  const big = m.event === 'placed' ? esc(m.label) : m.placing ? `배치 ${m.placed}/${m.need}` : `${m.d > 0 ? '+' : ''}${m.d} RP`;
  const cls = m.placing || m.event === 'placed' ? '' : m.d > 0 ? 'up' : m.d < 0 ? 'down' : '';
  const ev = { placed: '배치 완료 · ', promote: '승급! · ', master: '마스터 달성! · ', demote: '강등 · ', shield: '강등 보호 · ' }[m.event] || '';
  const o = m.opp || {};
  box.innerHTML = `<div class="side me"><canvas data-g="${m.group}" data-d="${m.placing ? 0 : m.div}"></canvas><div><b class="${cls}${m.placing && m.event !== 'placed' ? ' pl' : ''}">${big}</b><small>${ev}${esc(m.event === 'placed' ? `${m.pw}승 ${m.pl}패 · ${m.rp} RP` : m.placing ? `${m.pw}승 ${m.pl}패` : m.text)}</small></div></div>` +
    `<span class="vs">VS</span><div class="side op"><canvas data-g="${o.group == null ? -1 : o.group}" data-d="${o.div || 0}"></canvas><div><b>${esc(o.name || '상대')}</b><small>${esc(o.text || '')}</small></div></div>`;
  box.classList.remove('hidden');
  requestAnimationFrame(() => box.querySelectorAll('canvas').forEach(c => { const g = fitCanvas(c); if (g) drawTierEmblem(g.x, g.w / 2, g.h / 2, Math.min(g.w, g.h) * 0.92, +c.dataset.g, +c.dataset.d); }));
}
