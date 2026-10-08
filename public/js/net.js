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
    case 'error': status(m.msg); break;
    case 'start': $('roomBox').classList.add('hidden'); $('bCancel').classList.add('hidden'); status('');
      if (!m.styles) { status('서버가 예전 버전이라 서로의 스타일을 알 수 없어요. 서버를 끄고 새 server.js로 다시 켜 주세요.'); nsend({ t: 'leave' }); break; }
      {
        // 자리 번호(seat) 순서: 나 → 나머지는 자리 순. 판 번호와 자리 번호를 서로 바꿀 수 있게 기억
        const order = [m.you, ...m.styles.map((_, i) => i).filter(i => i !== m.you)];
        game.netN = m.styles.length;
        start('online', m.seed, { me: m.styles[m.you], op: m.styles[order[1]], ops: order.slice(2).map(i => m.styles[i]) }, m.board, m.rule || 'tsu');
        game.seatField = {}; order.forEach((s, i) => { game.fields[i].seat = s; game.seatField[s] = game.fields[i]; });
      }
      break;
    case 'oppReady': $('ovSub').textContent = m.size > 2 ? `${m.have}/${m.size}명이 다시 하기를 눌렀습니다.` : '상대가 다시 하기를 눌렀습니다.'; break;
    case 'left':
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
