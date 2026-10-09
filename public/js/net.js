// 온라인 대전 클라이언트
'use strict';

/* ================= 온라인 ================= */
const net = { ws: null };
$('srv').value = location.protocol.startsWith('http') ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}` : 'ws://localhost:3000';
const status = msg => { $('netStatus').textContent = msg; };
function gsend(d) { if (net.ws && net.ws.readyState === 1) net.ws.send(JSON.stringify({ t: 'g', d })); }
function nsend(m) { if (net.ws && net.ws.readyState === 1) net.ws.send(JSON.stringify(m)); }
function connect(then) {
  if (net.ws && net.ws.readyState === 1) { then(); return; }
  if (net.ws && net.ws.readyState === 0) return;
  let ws;
  try { ws = new WebSocket($('srv').value.trim()); } catch (e) { status('서버 주소 형식이 올바르지 않습니다. 예: ws://localhost:3000'); return; }
  net.ws = ws; status('서버에 연결하는 중…');
  ws.onopen = () => { status('서버에 연결되었습니다.'); then(); };
  ws.onerror = () => status('서버에 연결할 수 없습니다. 서버가 켜져 있는지, 주소가 맞는지 확인하세요.');
  ws.onclose = () => {
    if (net.ws === ws) net.ws = null;
    $('roomBox').classList.add('hidden'); $('bCancel').classList.add('hidden');
    if (game.net && (game.state === 'play' || game.state === 'over')) {
      game.net = false; showMessage('연결 끊김', '서버와의 연결이 끊겼습니다. 다시 접속해 주세요.');
    }
  };
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } onNet(m); };
}
function onNet(m) {
  switch (m.t) {
    case 'created':
      $('roomCode').textContent = m.code; $('roomBox').classList.remove('hidden'); $('bCancel').classList.remove('hidden');
      status(m.size > 2 ? `방 코드를 알려주고 기다리세요. (1/${m.size}명)` : '상대에게 방 코드를 알려주고 기다리세요.'); break;
    case 'waiting': $('bCancel').classList.remove('hidden'); status(m.size > 2 ? `사람을 모으는 중… (${m.have}/${m.size}명)` : '상대를 찾는 중…'); break;
    case 'lobby': status(`사람을 모으는 중… (${m.have}/${m.size}명)`); break;
    case 'rwait': $('bCancel').classList.remove('hidden'); status(`랭크전 상대를 찾는 중… ${m.text} · 기다릴수록 범위가 넓어져요${m.botIn ? ` · ${m.botIn}초 안에 못 찾으면 비슷한 실력의 AI와 대전` : ''}`); break;
    case 'rdone':                          // 랭크전 끝: 레이팅 변화
      game.rankRes = m;
      {                                    // 내 기록의 마지막 랭크전 줄에 RP 변화 · 상대 티어를 붙임
        stats = loadStats(); const h = stats.history.find(x => x.cat === 'ranked');
        if (h && !h.rk) { h.rk = { d: m.d, event: m.event, placing: m.event === 'placed' || m.placing, after: m.text, group: m.group, div: m.div, opp: m.opp, score: m.score }; saveStats(); }
      }
      if (!overlay.classList.contains('hidden') && game.ranked) { $('ovSub').textContent = rankLine(m); if (rankTitle(m)) $('ovTitle').textContent = rankTitle(m); showRankRes(m); rankFx(m); }
      break;
    case 'error': status(m.msg); break;
    case 'start': $('roomBox').classList.add('hidden'); $('bCancel').classList.add('hidden'); status('');
      if (!m.styles) { status('서버가 예전 버전이라 서로의 스타일을 알 수 없어요. 서버를 끄고 새 server.js로 다시 켜 주세요.'); nsend({ t: 'leave' }); break; }
      {
        // 자리 번호(seat) 순서: 나 → 나머지는 자리 순. 판 번호와 자리 번호를 서로 바꿀 수 있게 기억
        const order = [m.you, ...m.styles.map((_, i) => i).filter(i => i !== m.you)];
        game.netN = m.styles.length;
        if (m.ranked) { if (!game.ranked || game.rankRes) game.series = null; game.ranked = true; game.rankRes = null; } else game.ranked = false;
        game.botOpp = m.bot && CHARS.some(c => c.id === m.bot.char) ? { name: String(m.bot.name).slice(0, 10), char: m.bot.char, lv: +m.bot.lv || 0 } : null;
        start('online', m.seed, { me: m.styles[m.you], op: m.styles[order[1]], ops: order.slice(2).map(i => m.styles[i]) }, m.board, m.rule || 'tsu');
        game.seatField = {}; order.forEach((s, i) => { game.fields[i].seat = s; game.seatField[s] = game.fields[i]; game.fields[i].rankEm = m.ranks ? m.ranks[s] : null; });
      }
      break;
    case 'oppReady': $('ovSub').textContent = m.size > 2 ? `${m.have}/${m.size}명이 다시 하기를 눌렀습니다.` : '상대가 다시 하기를 눌렀습니다.'; break;
    case 'left':
      if (game.ranked && game.state === 'play') { game.oppLeft = true; game.net = false; game.fields[1].die(); break; }   // 랭크전: 상대 이탈 = 내 승리
      if (game.fields.length > 2 && m.rest >= 2) {          // 3~4인: 나간 사람만 탈락 처리하고 계속
        const f = game.seatField && game.seatField[m.who];
        if (f && !f.dead && game.state === 'play') { f.die(); f.texts.push({ txt: '나감', x: f.fw / 2, y: FH * 0.3, age: 0, dur: 1500, col: '#fff', size: 30 }); }
        break;
      }
      game.oppLeft = true; game.resetOnline = true;
      if (game.state === 'over' || (game.fields[1] && game.fields[1].dead)) {   // 이미 끝난 판(기권 포함): 결과는 그대로, 다시 하기만 막음
        game.net = false;
        if (!overlay.classList.contains('hidden')) { overlayBtns('menu'); $('ovSub').textContent += ' · 상대가 나갔습니다'; }
      } else if (game.net) { game.net = false; showMessage('상대가 나갔습니다', '메뉴에서 새 대전을 시작하세요.'); }
      break;
    case 'g': onGame(m.d, m.f); break;
  }
}
function onGame(d, from) {
  const op = from != null && game.seatField ? game.seatField[from] : game.fields[1];
  if (!op || !op.remote || game.mode !== 'online') return;
  if (d.to != null) { const t = game.seatField && game.seatField[d.to]; d = { ...d, to: t ? game.fields.indexOf(t) : undefined }; }   // 자리 번호 → 내 판 번호
  if (d.t === 'hi') { op.name = String(d.name || '상대').slice(0, 10); if (CHARS.some(c => c.id === d.char)) op.char = d.char; if (op.other) { op.other.name = op.name; op.other.char = op.char; } return; }
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
  if (!location.protocol.startsWith('http')) { $('recRank').textContent = '서버 필요'; return; }
  fetch(rankUrl('me', stats.style || 'puyo')).then(r => r.json()).then(m => { game.myRank = m; $('recRank').textContent = m.text; drawArts(); }).catch(() => {});
}
function cancelWait() { nsend({ t: 'leave' }); $('roomBox').classList.add('hidden'); $('bCancel').classList.add('hidden'); status(''); }
$('bCancel').addEventListener('click', cancelWait);
$('bJoin').addEventListener('click', () => {
  const code = $('code').value.trim().toUpperCase();
  if (code.length !== 4) { status('4자리 방 코드를 입력하세요.'); return; }
  game.resetOnline = true;
  connect(() => nsend({ t: 'join', code, style: stats.style || 'puyo' }));
});
$('code').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') $('bJoin').click(); });
$('srv').addEventListener('keydown', e => e.stopPropagation());
$('bRematch').addEventListener('click', () => { nsend({ t: 'ready', style: stats.style || 'puyo' }); $('ovSub').textContent = '상대를 기다리는 중…'; });
$('bLeave').addEventListener('click', () => { nsend({ t: 'leave' }); game.net = false; openMenu('vs', 't-quick'); });

document.querySelectorAll('#pad button').forEach(btn => {
  const k = btn.dataset.k;
  btn.addEventListener('pointerdown', e => {
    e.preventDefault(); btn.classList.add('on');
    if (k === 'left' || k === 'right') playerAction(0, k, true); else if (k === 'down') playerAction(0, 'soft', true);
    else if (k === 'hard') { const f = human(); if (f) f.hardDrop(); }
    else if (k === 'menu') openPause();
    else if (k === 'hold') { const f = human(); if (f && f.hold) f.hold(); }
    else { const f = human(); if (f) f.rotate(k === 'cw' ? 1 : -1); }
  });
  const up = () => { btn.classList.remove('on'); if (k === 'left' || k === 'right') playerAction(0, k, false); else if (k === 'down') playerAction(0, 'soft', false); };
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => btn.addEventListener(ev, up));
});
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
