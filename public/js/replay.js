// 이벤트 버스 · 리플레이(녹화·저장·재생)
'use strict';

/* ================= 이벤트 버스 =================
   판에서 일어난 일(고정·방해·공격·상쇄·탈락·상태)을 한 곳으로 모아
   ① 온라인이면 상대에게 보내고 ② 녹화 중이면 리플레이에 기록한다.
   재생은 온라인 상대 화면을 재현하는 코드(원격 판)를 그대로 쓴다. */
function emit(f, d) {
  if (game.net && f === game.fields[0]) gsend(d.to != null ? { ...d, to: game.fields[d.to] ? game.fields[d.to].seat : undefined } : d);   // 판 번호 → 자리 번호
  recEv(f, d);
}
// 녹화: [진행 시간(ms), 판 번호, 이벤트]
function recEv(f, d) {
  const r = game.rec; if (!r || game.mode === 'replay') return;
  const pi = game.fields.indexOf(f); if (pi < 0) return;
  if (f.kind === 'puyo' && d.g && (d.t === 'lock' || d.t === 'garb')) { const { g, ...rest } = d; d = rest; }   // 뿌요 고정·방해는 결정적이라 격자 스냅샷 없이도 똑같이 재생됨(판 교체 이벤트는 격자 필요)
  else if (d.g) d = { ...d, g: d.g.replace(/^0+/, '') };                     // 테트리스 격자는 위쪽 빈칸을 빼고 저장
  r.ev.push([Math.round(game.el || 0), pi, d]);
}
// 상태(조각 위치·점수·쌓인 방해)는 바뀌었을 때만 기록
function recState(f, d) {
  const r = game.rec; if (!r || game.mode === 'replay') return;
  if (game.el - (f._recAt || -1e9) < 100) return; f._recAt = game.el;           // 초당 10번까지
  const s = JSON.stringify(d); if (f._recSt === s) return; f._recSt = s;
  recEv(f, d);
}
// 원격 판(온라인 상대 · 리플레이)에 이벤트 적용
function applyRemote(f, d) {
  f = routeKind(f, d);                      // 스왑: 뿌요/테트리스 이벤트는 맞는 판으로
  switch (d.t) {
    case 'sw': f.queue.push(d); break;
    case 'fg': if (f.kind === 'fusion') f.queue.push(typeof d.g === 'string' && d.g.length < FW_W * FW_H ? { ...d, g: d.g.padStart(FW_W * FW_H, '0') } : d); break;
    case 'st':
      f.pending = d.pe; f.score = d.sc; f.maxChain = d.mc;
      if (game.mode === 'replay' && d.n != null) f.idx = d.n;
      if (f.kind === 'fusion') { f.net = d.pc; break; }
      if (f.kind === 'tetris') { f.net = d.pc; f.holdK = d.ho; f.gauge = d.gg || 0; }
      else { if (d.fv) { f.fv.gauge = d.fv[0]; f.fv.on = !!d.fv[1]; f.fv.t = d.fv[2] * 100; }
        f.net = d.pc ? { ...d.pc, n: d.n } : null; if (game.mode === 'replay') f.holdP = d.hp || null; if (f.phase === 'wait') f.applyNet(); }
      break;
    case 'lock': case 'garb': case 'tlock': case 'tgarb':
      if (f.kind === 'tetris' && typeof d.g === 'string' && d.g.length < TW * TH) d = { ...d, g: d.g.padStart(TW * TH, '0') };
      f.queue.push(d); break;
    case 'atk': {
      const to = game.fields[d.to] || f.opp;
      if (game.state === 'play' && to) game.launch(f, to, d.n, f.ox + d.x, f.oy + d.y, 'attack', d.ch);
      break;
    }
    case 'off': game.launch(f, f, d.n, f.ox + d.x, f.oy + d.y, 'offset', d.ch); break;
    case 'bb': bbReport(f, d.p, d.at, d.r); break;
    case 'it': itemFx(f, d.k); break;
    case 'pend': partyFinish(f, d.sc); break;
    case 'gs': case 'fv':                    // 판 통째로 바꾸기(파티 정리·피버·빅뱅 씨앗판)
      if (f.kind !== 'puyo') break;
      if (typeof d.g === 'string' && d.g.length < ROWS * COLS) d = { ...d, g: d.g.padStart(ROWS * COLS, '0') };
      f.queue.push(d); break;
    case 'dead':
      if (f.kind === 'tetris') {                                   // 남은 이벤트를 바로 적용해서 마지막으로 놓은 블록까지 보이게
        if (f.phase === 'clear') f.dropRows(f.clearRows);
        while (f.queue.length) {
          const ev = f.queue.shift();
          if (ev.t === 'sw') { swapField(f); applyRemote(f.other, d); return; }   // 스왑한 뒤에 탈락했으면 바뀐 판이 탈락
          if (ev.g) { f.decode(ev.g); if (ev.rows && ev.rows.length) f.dropRows(ev.rows); }
        }
      }
      if (game.state === 'play') f.die(); break;
  }
}

/* ================= 저장 ================= */
const RP_KEY = 'puyo-replays-v1', RP_MAX = 12;
function loadReplays() { try { const v = JSON.parse(localStorage.getItem(RP_KEY)); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
// 최근 12판까지. 저장 공간이 모자라면 오래된 것부터 지움
function saveReplay(rp) {
  const list = loadReplays().filter(x => x.id !== rp.id); list.unshift(rp);
  while (list.length > RP_MAX) list.pop();
  for (;;) {
    try { localStorage.setItem(RP_KEY, JSON.stringify(list)); return true; }
    catch (e) { if (list.length <= 1) return false; list.pop(); }
  }
}
const findReplay = id => loadReplays().find(x => x.id === id) || null;
function newRecording(seed) {
  return { v: 1, id: Date.now().toString(36) + rnd(1296).toString(36), d: Date.now(), mode: game.mode, diff: game.diff, solo: game.soloMode,
    board: BOARD, rule: game.rule, seed, players: game.fields.map(f => ({ name: f.name, style: f.kind, char: f.char })), ev: [] };
}
// 판이 끝났을 때 저장하고 기록(최근 경기)에 붙일 id를 돌려줌
function finishRecording() {
  const r = game.rec; if (!r || game.mode === 'replay') return null;
  game.fields.forEach((f, pi) => { if (!f.remote) r.ev.push([Math.round(game.el || 0), pi, stateOf(f)]); });   // 마지막 점수까지
  game.rec = null;
  r.players.forEach((p, i) => { if (game.fields[i]) { p.name = game.fields[i].name; p.char = game.fields[i].char; } });   // 이름만 갱신(스타일은 시작할 때 것 — 스왑이면 끝에 바뀌어 있음)
  r.len = Math.round(game.el || 0);
  return r.ev.length && saveReplay(r) ? r.id : null;
}
function exportReplay(rp) {
  const d = new Date(rp.d), p2 = n => String(n).padStart(2, '0');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(rp)], { type: 'application/json' }));
  a.download = `puyo-replay-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// 불러온 파일 검사: 형식이 맞지 않으면 null
function checkReplay(rp) {
  if (!rp || rp.v !== 1 || !Array.isArray(rp.ev) || !Array.isArray(rp.players)) return null;
  if (rp.players.length < 1 || rp.players.length > 4) return null;
  if (!rp.players.every(p => p && (p.style === 'puyo' || p.style === 'tetris'))) return null;
  if (!BOARDS[rp.board] || typeof rp.seed !== 'number') return null;
  if (!rp.ev.every(e => Array.isArray(e) && typeof e[0] === 'number' && Number.isInteger(e[1]) && e[1] >= 0 && e[1] < rp.players.length && e[2] && typeof e[2].t === 'string')) return null;
  return rp;
}

/* ================= 재생 ================= */
const RP_SPEEDS = [0.5, 1, 2, 4];
function startReplay(rp) {
  audio(); game.net = false; game.oppLeft = false; game.rec = null; game.series = null;
  game.replay = { data: rp, i: 0, speed: 1, end: rp.ev.length ? rp.ev[rp.ev.length - 1][0] : 0 };
  applyBoard(rp.board); seedSeq(rp.seed >>> 0); game.rule = RULES[rp.rule] ? rp.rule : 'tsu';
  const ps = rp.players, vs = ps.length > 1;
  game.mode = 'replay'; game.vs = vs; game.diff = rp.diff; game.soloMode = rp.solo;
  seq = []; tseq = []; game.orbs = []; game.fx.rings = []; game.fx.sparks = [];
  setSize(vs ? slotX(ps.length - 1) + SW + 20 : OX1 + SW + PANEL_W);
  game.myStyle = ps[0].style; game.oppStyle = vs ? ps[1].style : null;
  game.fields = ps.map((p, i) => { const f = mkField(p.style, slotX(i), false, p.name); f.remote = true; f.tone = vs ? PLAYER_TONES[i] : TONES.green; if (CHARS.some(c => c.id === p.char)) f.char = p.char; return f; });
  if (vs) for (const f of game.fields) f.opp = pickTarget(f);
  if (game.rule === 'swap' && vs) game.fields.forEach(f => makeSwapPair(f, 1));
  game.stT = 0; game.t0 = performance.now(); game.el = 0; game.recorded = false;
  game.seed = rp.seed; game.bb = null;
  if (game.rule === 'bigbang' && vs) bbInit();
  game.party = null; if (game.rule === 'party' && vs) partyInit();
  game.fields.forEach(f => f.spawn());
  game.marginLv = 0; game.state = 'intro'; game.introT = 1600; game.introGo = false; overlay.classList.add('hidden'); bgmPlay('game'); sfx.ready();
  showGame();
}
// 진행 시간에 맞춰 기록된 이벤트를 판에 넣음. 다 끝나면 결과 창
function replayTick() {
  const R = game.replay, ev = R.data.ev;
  while (R.i < ev.length && ev[R.i][0] <= game.el) { const [, pi, d] = ev[R.i++]; const f = game.fields[pi]; if (f) applyRemote(f, d); }
  const idle = game.fields.every(f => !f.queue.length && (f.phase === 'wait' || f.dead));
  if (R.i >= ev.length && idle && game.el > R.end + 1200 && !game.fields.some(f => f.dead)) { game.state = 'over'; game.overT = 0; game.recorded = true; }
}
function replaySpeed(d) {
  const R = game.replay; if (!R) return;
  const i = Math.max(0, Math.min(RP_SPEEDS.length - 1, RP_SPEEDS.indexOf(R.speed) + d));
  R.speed = RP_SPEEDS[i];
}
function drawReplayHud(c) {
  const R = game.replay; if (!R) return;
  const k = R.end ? Math.min(1, game.el / R.end) : 0, w = 140, x = PX - w / 2, y = OY + FH + 40;   // 가운데 패널 아래
  c.save();
  slab(c, x, y - 22, w, 44, TONES.purple, 4);
  outlined(c, `리플레이 ×${R.speed}`, PX, y - 4, 16, '#fff', TONES.purple.d, 4);
  c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(x + 12, y + 10, w - 24, 4);
  c.fillStyle = '#ffe066'; c.fillRect(x + 12, y + 10, (w - 24) * k, 4);
  c.restore();
}
