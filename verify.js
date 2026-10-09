// 랭크전 서버 검증: 각자 보낸 '놓은 기록'대로 서버가 판을 다시 계산해서 맞는지 확인
// - 받은 조각(시드 순서 · 홀드)을 그 자리에 실제로 옮겨 놓을 수 있었는지(이동·회전으로 닿는 자리인지)
// - 연쇄·줄 지우기로 낼 수 있는 만큼만 공격·상쇄했는지
// - 상대가 보낸 방해를 제때 받았는지, 받은 것보다 더 상쇄하지 않았는지
// - 탈락했는데 계속 두지 않는지
// 판정은 서버 계산이 기준. 위반하면 그 판은 위반한 쪽 패배
'use strict';
const vm = require('vm');
const { createEngine } = require('./sim');

const SLACK = 3000;          // 공격이 상대 화면에 닿기까지 넉넉히(네트워크 + 날아가는 연출)
const MIN_10_LOCKS = 1500;   // 10개를 이보다 빨리 놓으면 사람이 할 수 없는 속도
const FF_MAX = 4000;         // 연쇄·줄 지우기 연출을 빨리 감을 때 최대 걸음 수

class Match {
  // seed: 조각 순서 시드 · styles: [자리0, 자리1] 'puyo'|'tetris' · rule · board
  constructor({ seed, styles, rule = 'tsu', board = 'classic' }) {
    this.E = createEngine();
    this.run = code => vm.runInContext(code, this.E);
    this.run(`applyBoard(${JSON.stringify(board)}); seedSeq(${seed >>> 0}); game.vs = true; game.rule = ${JSON.stringify(rule)};
      game.state = 'play'; game.mode = 'online'; game.el = 0; game.marginLv = 0;`);
    this.K = this.run(`({ game, Field, TField, tReach, tspinOf, tValidOn, rotateOn, OJ, DX, DY, BOARDS, TW, TH, T2P, dims: () => ({ COLS, ROWS, SP, BOARD }) })`);
    const mk = this.run(`(st, i) => { const f = st === 'tetris' ? new TField(0, 0, true, 'P' + i) : new Field(0, 0, true, 'P' + i); return f; }`);
    const F = styles.map((st, i) => mk(st, i));
    F[0].opp = F[1]; F[1].opp = F[0];
    this.K.game.fields = F;
    this.seats = F.map((f, i) => ({
      f, i, real: Object.getPrototypeOf(f).spawn, dead: false, bad: null, lastAt: 0, locks: [],
      inc: [], paid: 0, garbSince: true, agedAtLock: 0,
      pool: 0, poolOff: 0, poolAtk: 0, gauge: 0,
    }));
    for (const s of this.seats) {
      s.f.spawn = () => { s.f.piece = null; s.f.cur = null; s.f.phase = 'next'; };   // 다음 조각은 기록이 오면 꺼냄(방해를 먼저 받을 수 있게)
      s.f.pending = 0;
    }
    this.loser = null; this.reason = null;
    for (const s of this.seats) this.spawn(s);
  }
  get events() { return this.run('__events'); }
  // 진짜 다음 조각 꺼내기(막혀 있으면 탈락)
  spawn(s) { if (s.f.phase !== 'next' && s.f.phase !== 'none') return; s.f.phase = 'none'; s.real.call(s.f); if (s.f.dead) s.dead = true; }
  ff(s) {                                      // 연쇄·줄 지우기·내려앉기를 끝까지 진행(시간은 멈춘 채)
    const f = s.f;
    for (let i = 0; i < FF_MAX && ['settle', 'pop', 'clear', 'are'].includes(f.phase); i++) f.update(16, true);
    if (f.dead) s.dead = true;
  }
  // 이 자리에서 생긴 공격(서버 계산)을 예산에 더함
  collect(s) {
    const L = this.run('__launch.splice(0)'), opp = this.seats[1 - s.i];
    for (const l of L) if (l.from === s.f && l.kind === 'attack') { if (this.cross(s)) s.poolAtk += l.n; else s.pool += l.n; }
    this.run('__events.length = 0');
    return opp;
  }
  cross(s) { return s.f.kind !== this.seats[1 - s.i].f.kind; }
  pend(s) { return s.inc.reduce((a, x) => a + x.n, 0) - s.paid; }
  aged(s, t) { return s.inc.filter(x => x.t <= t - SLACK).reduce((a, x) => a + x.n, 0); }
  owed(s) { return s.agedAtLock - s.paid; }      // 지난번에 놓을 때 이미 와 있던 방해 중 아직 안 받은 것
  fail(s, why) { if (!s.bad) s.bad = why; if (this.loser == null) { this.loser = s.i; this.reason = why; } return { bad: why }; }

  // 이벤트 하나 처리. now: 서버 기준 진행 시간(ms). 돌려주는 값: { bad } 위반 · { relay } 상대에게 보낼(필요하면 고친) 이벤트
  feed(i, ev, now) {
    const s = this.seats[i];
    if (this.loser != null || !ev || typeof ev.t !== 'string') return {};
    if (s.dead && ['lock', 'tlock', 'hold', 'garb', 'tgarb'].includes(ev.t)) return this.fail(s, '탈락한 뒤에도 계속 둠');
    if (ev.t === 'dead') { s.dead = true; if (this.loser == null) { this.loser = i; this.reason = '탈락'; } return { relay: ev }; }
    const at = Math.max(s.lastAt, Math.min(+ev.at || 0, now + 1500)); s.lastAt = at; this.K.game.el = at;
    const f = s.f, puyo = f.kind === 'puyo';
    switch (ev.t) {
      case 'hold': {
        this.spawn(s); if (s.dead) return this.fail(s, '탈락한 뒤에도 계속 둠');
        if (!f.canHold || f.phase !== 'drop') return this.fail(s, '홀드를 할 수 없는 때 홀드');
        f.hold(); if (f.dead) s.dead = true;
        return { relay: ev };
      }
      case 'lock': case 'tlock': {
        if (puyo !== (ev.t === 'lock')) return this.fail(s, '스타일이 다른 기록');
        // 받은 방해를 미루지 않았는지: 지난번에 놓기 전에 도착한 공격은 그 차례가 끝날 때 떨어졌어야 함
        if (!s.garbSince && this.owed(s) > 0) { if (process.env.VDEBUG) console.log('LAZY', s.i, f.kind, now, JSON.stringify(s.inc.slice(-4)), 'paid', s.paid, 'aged', s.agedAtLock); return this.fail(s, '방해를 받지 않음'); }
        this.spawn(s); if (s.dead) return this.fail(s, '탈락한 뒤에도 계속 둠');
        s.locks.push(at); if (s.locks.length > 10) s.locks.shift();
        if (s.locks.length === 10 && s.locks[9] - s.locks[0] < MIN_10_LOCKS) return this.fail(s, '사람이 할 수 없는 속도');
        const r = puyo ? this.lockPuyo(s, ev) : this.lockTetris(s, ev);
        if (r) return this.fail(s, r);
        s.agedAtLock = this.aged(s, now); s.garbSince = false;
        this.collect(s);
        return { relay: ev };
      }
      case 'garb': {                             // 뿌요: 방해뿌요 떨어뜨리기(열마다 개수)
        if (!puyo || f.phase !== 'next') return this.fail(s, '방해를 떨어뜨릴 수 없는 때');
        const c = Array.isArray(ev.c) ? ev.c.map(v => v | 0) : null, { COLS } = this.K.dims();
        if (!c || c.length !== COLS || c.some(v => v < 0)) return this.fail(s, '방해 기록이 이상함');
        const n = c.reduce((a, b) => a + b, 0), cap = this.K.BOARDS[this.K.dims().BOARD].drop || 30;
        if (n <= 0 || n > cap || n > this.pend(s)) return this.fail(s, '받지 않은 방해를 떨어뜨림');
        if (Math.max(...c) - Math.min(...c) > 1) return this.fail(s, '방해 모양이 이상함');
        if (n < Math.min(cap, this.owed(s))) return this.fail(s, '방해를 덜 받음');
        s.paid += n; s.garbSince = true;
        f.placeGarbage(c); this.ff(s);
        return { relay: ev };
      }
      case 'tgarb': {                            // 테트리스: 아래에서 방해 줄이 올라옴(결과 격자)
        if (puyo || typeof ev.g !== 'string') return this.fail(s, '방해 기록이 이상함');
        const { TW, TH } = this.K, g = ev.g.padStart(TW * TH, '0');
        const before = f.encode();
        let n = 0;
        for (let k = 1; k <= 7; k++) if (before.slice(k * TW) === g.slice(0, (TH - k) * TW)) { n = k; break; }
        if (!n) return this.fail(s, '방해 줄이 맞지 않음');
        for (let r = TH - n; r < TH; r++) { const row = g.slice(r * TW, (r + 1) * TW); if (!/^[08]+$/.test(row) || row.split('0').length !== 2) return this.fail(s, '방해 줄 모양이 이상함'); }
        if (n > this.pend(s)) return this.fail(s, '받지 않은 방해를 넣음');
        if (n < Math.min(7, this.owed(s))) return this.fail(s, '방해를 덜 받음');
        if (/[1-8]/.test(before.slice(0, n * TW))) return this.fail(s, '방해 줄이 맞지 않음');   // 위가 차 있으면 클라이언트는 탈락(줄을 넣지 않음)
        s.paid += n; s.garbSince = true; f.decode(g);
        return { relay: ev };
      }
      case 'off': {                              // 상쇄: 받은 방해 안에서, 낼 수 있는 공격 안에서
        const n = ev.n | 0; if (n <= 0) return {};
        if (n > this.pend(s)) return this.fail(s, '받지 않은 방해를 상쇄');
        if (this.cross(s)) { if (n > s.poolOff) return this.fail(s, '낼 수 없는 만큼 상쇄'); s.poolOff -= n; }
        else { if (n > s.pool) return this.fail(s, '낼 수 없는 만큼 상쇄'); s.pool -= n; }
        s.paid += n;
        return { relay: ev };
      }
      case 'atk': {                              // 공격: 서버가 계산한 만큼까지만 상대에게 보냄
        const n = ev.n | 0; if (n <= 0) return {};
        const key = this.cross(s) ? 'poolAtk' : 'pool';
        if (n > s[key]) return this.fail(s, '낼 수 없는 만큼 공격');
        s[key] -= n;
        this.seats[1 - i].inc.push({ n, t: now });
        return { relay: ev };
      }
      case 'st': case 'hi': return { relay: ev };
      default: return this.fail(s, `랭크전에서 쓸 수 없는 기록(${ev.t})`);
    }
  }

  // 뿌요 한 쌍 놓기
  lockPuyo(s, ev) {
    const f = s.f, p = f.piece;
    if (f.phase !== 'drop' || !p) return '놓을 조각이 없음';
    if (ev.n !== f.idx || ev.a !== p.a || ev.b !== p.b) return '받지 않은 조각';
    if (typeof ev.g === 'string' && ev.g !== f.encode()) return '판이 서버 계산과 다름';
    const x = ev.x | 0, y = ev.y | 0, o = ev.o | 0;
    if (!this.reachPuyo(f, x, y, o)) return '갈 수 없는 자리에 놓음';
    p.x = x; p.y = y; p.o = o; p.ia = p.ib = undefined;
    f.lock(0, !!ev.h); this.ff(s);
    if (this.cross(s)) s.poolOff += this.unitsOff; this.unitsOff = 0;
    return null;
  }
  // 뿌요: 시작 자리에서 좌우·회전·내리기로 그 자리(더 못 내려가는 자리)까지 갈 수 있는지
  reachPuyo(f, X, Y, O) {
    const { DX, DY } = this.K, p0 = f.piece;
    const fits = (x, y, o) => f.fits({ x, y, o });
    if (!fits(X, Y, O) || fits(X, Y + 1, O)) return false;
    const key = (x, y, o) => (y * 32 + x) * 4 + o, seen = new Set([key(p0.x, p0.y, p0.o)]), q = [[p0.x, p0.y, p0.o]];
    while (q.length) {
      const [x, y, o] = q.shift();
      if (x === X && y === Y && o === O) return true;
      const nx = [[x - 1, y, o], [x + 1, y, o], [x, y + 1, o]];
      for (const dir of [1, -1]) {               // 회전: 막히면 밀어내기, 그래도 막히면 반 바퀴(퀵턴)
        const o2 = (o + dir + 4) % 4;
        if (fits(x, y, o2)) nx.push([x, y, o2]);
        else if (fits(x - DX[o2], y - DY[o2], o2)) nx.push([x - DX[o2], y - DY[o2], o2]);
        else if (fits(x, y, (o + 2) % 4)) nx.push([x, y, (o + 2) % 4]);
      }
      for (const [a, b, c] of nx) { const k = key(a, b, c); if (!seen.has(k) && fits(a, b, c)) { seen.add(k); q.push([a, b, c]); } }
    }
    return false;
  }
  // 테트리스 한 조각 놓기
  lockTetris(s, ev) {
    const f = s.f, cur = f.cur;
    if (f.phase !== 'drop' || !cur) return '놓을 조각이 없음';
    if (ev.k !== cur.k) return '받지 않은 조각';
    const p = { k: cur.k, x: ev.x | 0, y: ev.y | 0, r: (ev.r | 0) & 3 }, rot = !!ev.rot, kick = ev.kick | 0;
    const spin = this.K.tspinOf(f.grid, p, rot, kick);
    const ok = this.K.tReach(f.grid, cur, 0).some(o => o.p.x === p.x && o.p.y === p.y && o.p.r === p.r && o.spin === spin);
    if (!ok) return '갈 수 없는 자리에 놓음';
    f.cur = p; f.lastRot = rot; f.lastKick = kick;
    f.lock(false);
    const mine = this.events.filter(([fl, d]) => fl === f && d.t === 'tlock').pop();
    if (mine && typeof ev.g === 'string' && mine[1].g !== ev.g.padStart(this.K.TW * this.K.TH, '0')) return '판이 서버 계산과 다름';
    this.ff(s);
    return null;
  }
}

// 상쇄 예산(뿌요 → 테트리스): 연쇄 단계마다 상쇄할 수 있는 양
function hookUnits(m) {
  for (const s of m.seats) {
    const f = s.f;
    if (f.kind === 'puyo') {
      const orig = Object.getPrototypeOf(f).attackT;
      f.attackT = function (step, units, x, y) { m.unitsOff = (m.unitsOff || 0) + Math.max(1, units); return orig.call(this, step, units, x, y); };
    } else {
      const orig = Object.getPrototypeOf(f).deliver;
      f.deliver = function (amount, x, y) {
        const n = Math.floor(amount * m.run('tMarginMul()'));
        if (n > 0 && m.cross(s)) s.poolOff += n;          // 뿌요 상대: 게이지로 모으기 전에 상쇄할 수 있는 양
        return orig.call(this, amount, x, y);
      };
    }
  }
}
function newMatch(o) { const m = new Match(o); hookUnits(m); return m; }

module.exports = { newMatch, Match, SLACK };
