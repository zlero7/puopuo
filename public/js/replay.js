// 이벤트 버스 · 리플레이(녹화·저장·재생)
'use strict';

/* ================= 이벤트 버스 =================
   판에서 일어난 일(고정·방해·공격·상쇄·탈락·상태)을 한 곳으로 모아
   ① 온라인이면 상대에게 보내고 ② 녹화 중이면 리플레이에 기록한다.
   재생은 온라인 상대 화면을 재현하는 코드(원격 판)를 그대로 쓴다. */
function emit(f, d) {
  if (game.net && f === game.fields[0]) gsend({ ...d, to: d.to != null ? (game.fields[d.to] ? game.fields[d.to].seat : undefined) : undefined, at: Math.round(game.el || 0) });   // 판 번호 → 자리 번호 · 서버 검증용 진행 시간
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
// 받은 이벤트 검사(온라인 상대 · 불러온 리플레이 파일은 믿을 수 없음): 모양이 맞게 고치고, 고칠 수 없으면 null(버림)
// 이상한 값 하나로 화면 그리기에서 오류가 나면 게임이 멈추므로, 판에 넣기 전에 여기서 걸러냄
const evInt = (v, lo, hi, d = 0) => Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.round(+v))) : d;
const evNum = (v, lo, hi) => Number.isFinite(+v) ? Math.max(lo, Math.min(hi, +v)) : 0;
const evCol = v => Number.isInteger(v) && v >= 1 && v <= 5 ? v : 0;               // 뿌요 색 1~5
const evGrid = (g, re, n) => typeof g === 'string' && g.length <= n && re.test(g) ? g : undefined;
const evPuyoGrid = g => evGrid(g, /^[0-6]*$/, ROWS * COLS);
const evTetGrid = g => evGrid(g, /^[0-8]*$/, TW * TH);
function cleanEv(f, d) {
  if (!d || typeof d !== 'object' || Array.isArray(d) || typeof d.t !== 'string') return null;
  const to = d.to == null ? undefined : evInt(d.to, 0, 3);
  switch (d.t) {
    case 'st': {
      const o = { t: 'st', n: evInt(d.n, 0, 1e6), pe: evInt(d.pe, 0, 999), sc: evInt(d.sc, 0, 1e9), mc: evInt(d.mc, 0, 99), pc: null };
      const pc = d.pc && typeof d.pc === 'object' ? d.pc : null;
      if (d.k === 'p' || (!d.k && f.kind === 'puyo')) {
        if (pc && evCol(pc.a) && evCol(pc.b)) o.pc = { x: evInt(pc.x, -2, 20), y: evInt(pc.y, -2, 30), o: evInt(pc.o, 0, 3), a: pc.a, b: pc.b, p: evNum(pc.p, 0, 1) };
        if (d.hp && evCol(d.hp.a) && evCol(d.hp.b)) o.hp = { a: d.hp.a, b: d.hp.b };
        if (Array.isArray(d.fv)) o.fv = [evInt(d.fv[0], 0, 99), d.fv[1] ? 1 : 0, evNum(d.fv[2], 0, 9999)];
      } else {
        if (pc && TKEYS.includes(pc.k) && pc.k) o.pc = { ...pc, k: pc.k, x: evInt(pc.x, -4, TW + 4), y: evInt(pc.y, -4, TH + 4), r: evInt(pc.r, 0, 3) };
        if (pc && f.kind === 'fusion' && pc.t === 'p' && evCol(pc.a) && evCol(pc.b)) o.pc = { ...pc, x: evInt(pc.x, -4, TW + 4), y: evInt(pc.y, -4, TH + 4), o: evInt(pc.o, 0, 3) };
        o.ho = TKEYS.includes(d.ho) && d.ho ? d.ho : null; o.gg = evInt(d.gg, 0, 99);
      }
      if (d.k) o.k = d.k === 't' ? 't' : 'p';
      return o;
    }
    case 'lock': {
      if (!evCol(d.a) || !evCol(d.b)) return null;
      const o = { t: 'lock', n: evInt(d.n, 0, 1e6), x: evInt(d.x, 0, COLS - 1), y: evInt(d.y, 0, ROWS - 1), o: evInt(d.o, 0, 3), a: d.a, b: d.b, h: d.h ? 1 : 0, g: evPuyoGrid(d.g) };
      if (ITEM_KEYS.includes(d.ia)) o.ia = d.ia; if (ITEM_KEYS.includes(d.ib)) o.ib = d.ib;   // 파티 아이템
      return o;
    }
    case 'garb': {
      if (!Array.isArray(d.c) || d.c.length !== COLS) return null;
      return { t: 'garb', c: d.c.map(v => evInt(v, 0, ROWS + 1)), g: evPuyoGrid(d.g) };
    }
    case 'gs': case 'fv': { const g = evPuyoGrid(d.g); return g === undefined ? null : { t: d.t, g, on: d.on ? 1 : 0 }; }
    case 'tlock': {
      const g = evTetGrid(d.g); if (g === undefined) return null;
      const o = { t: 'tlock', g, rows: Array.isArray(d.rows) ? d.rows.slice(0, 4).map(v => evInt(v, 0, TH - 1)) : [] };
      const fx = d.fx;
      if (fx && typeof fx === 'object') o.fx = { labs: Array.isArray(fx.labs) ? fx.labs.slice(0, 4).map(v => String(v).slice(0, 20)) : [], pc: !!fx.pc, b2b: !!fx.b2b, ren: evInt(fx.ren, 0, 99) };
      for (const k of ['x', 'y', 'r', 'kick']) if (d[k] != null) o[k] = evInt(d[k], -8, 40);
      if (TKEYS.includes(d.k)) o.k = d.k; if (d.rot) o.rot = 1;
      return o;
    }
    case 'tgarb': { const g = evTetGrid(d.g); return g === undefined ? null : { t: 'tgarb', g }; }
    case 'fg': { const g = evGrid(d.g, /^[0-9A-G]*$/, FW_W * FW_H); return g === undefined ? null : { t: 'fg', g }; }
    case 'atk': case 'off': return { t: d.t, to, n: evInt(d.n, 0, 999), x: evNum(d.x, -2000, 2000), y: evNum(d.y, -2000, 2000), ch: evInt(d.ch, 0, 30) };
    case 'hi': return { t: 'hi', name: String(d.name == null ? '' : d.name).slice(0, 10), char: typeof d.char === 'string' ? d.char.slice(0, 12) : '' };
    case 'it': return typeof d.k === 'string' ? { t: 'it', k: d.k.slice(0, 20) } : null;
    case 'pend': return { t: 'pend', sc: evInt(d.sc, 0, 1e9) };
    case 'bb': return { t: 'bb', r: evInt(d.r, 0, 999), p: evInt(d.p, 0, 1e9), at: evNum(d.at, 0, 1e8) };
    case 'dead': case 'hold': case 'sw': case 'ce': return { t: d.t };
    default: return null;
  }
}
// 원격 판(온라인 상대 · 리플레이)에 이벤트 적용
function applyRemote(f, d) {
  d = cleanEv(f, d); if (!d) return;
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
      if (f.kind === 'puyo') f.atkOpen = true;
      if (game.state === 'play' && to) game.launch(f, to, d.n, f.ox + d.x, f.oy + d.y, 'attack', d.ch);
      break;
    }
    case 'off': game.launch(f, f, d.n, f.ox + d.x, f.oy + d.y, 'offset', d.ch); break;
    case 'ce': f.atkOpen = false; releaseGarb(f); break;             // 상대 연쇄 끝: 붙잡혀 있던 방해가 이제 떨어질 수 있음
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
// 자동 녹화는 최근 12판까지, ⤓로 '받은'(keep) 리플레이는 지우지 않음. 저장 공간이 모자라면 받지 않은 것 중 오래된 것부터 지움
function writeReplays(list) {
  for (;;) {
    try { localStorage.setItem(RP_KEY, JSON.stringify(list)); return true; }
    catch (e) { const i = list.map(x => !x.keep).lastIndexOf(true); if (i < 0) return false; list.splice(i, 1); }
  }
}
function saveReplay(rp) {
  const list = loadReplays().filter(x => x.id !== rp.id); list.unshift(rp);
  let auto = 0; for (let i = 0; i < list.length; i++) if (!list[i].keep && ++auto > RP_MAX) list.splice(i--, 1);
  return writeReplays(list);
}
// 기록의 ⤓: 그 경기 리플레이를 보관함으로(자동 삭제 안 됨). 성공하면 true
function keepReplay(id) {
  const list = loadReplays(), r = list.find(x => x.id === id);
  if (!r) return false;
  r.keep = true;
  if (writeReplays(list)) return true;
  r.keep = false; return false;
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
  if (!rp.players.every(p => p && ['puyo', 'tetris', 'fusion'].includes(p.style))) return null;
  if (!BOARDS[rp.board] || typeof rp.seed !== 'number') return null;
  if (!rp.ev.every(e => Array.isArray(e) && typeof e[0] === 'number' && Number.isInteger(e[1]) && e[1] >= 0 && e[1] < rp.players.length && e[2] && typeof e[2].t === 'string')) return null;
  // 이름·캐릭터는 다른 사람이 만든 파일일 수 있으니 짧은 글자로만(화면에 넣을 때도 esc)
  rp.players = rp.players.map(p => ({ ...p, name: String(p.name == null ? '' : p.name).slice(0, 10), char: CHARS.some(c => c.id === p.char) ? p.char : 'lumi' }));
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
  setSize(vs ? slotX(ps.length - 1) + SW + 20 : OX1 + SW + PANEL_W, ps.length === 2 ? SIDE_W : 0);
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
