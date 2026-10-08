// 결과 창 · 이펙트 · 게임 진행(update) · 그리기(render)
'use strict';

/* ================= 결과 창 ================= */
const overlayBtns = kind => {           // offline | next | online | menu | pause | forfeit | replay
  game.ovKind = kind;
  const show = { bResume: ['pause', 'forfeit'], bRetry: ['offline', 'pause', 'next', 'replay'], bRematch: ['online'], bLeave: ['online'], bMenu: ['offline', 'menu', 'pause', 'next', 'replay'], bForfeit: ['forfeit'] };
  for (const [id, ks] of Object.entries(show)) $(id).classList.toggle('hidden', !ks.includes(kind));
  $('bRetry').textContent = kind === 'pause' ? '처음부터' : kind === 'replay' ? '다시 보기' : '다시 하기';
  $('bMenu').textContent = kind === 'pause' ? '메뉴로 나가기' : '메뉴로';
};
// Esc / P: 일시정지 창(연습·AI 대전) 또는 기권 확인(온라인 — 게임은 멈추지 않음)
function openPause() {
  if (game.state !== 'play' || !overlay.classList.contains('hidden')) return;
  if (game.net) { showResult('purple', '대전 중', '지금 나가면 패배로 기록돼요. 게임은 계속 진행 중이에요.', [], 'forfeit'); return; }
  game.state = 'pause';
  showResult('purple', '일시정지', game.mode === 'replay' ? '리플레이' : game.mode === 'solo' ? '연습' : game.mode === 'local' ? '로컬 대전' : `AI 대전 · ${DIFF[game.diff]}`, [], 'pause');
}
function resume() {
  overlay.classList.add('hidden');
  if (game.state === 'pause') { game.state = 'play'; last = 0; }
}
function forfeit() {
  const me = game.fields[0];
  if (game.state === 'play') {
    me.die(); me.place = game.fields.filter(f => !f.dead).length + 1;
    if (game.fields.length === 2) game.fields[1].won = true;
    game.state = 'over'; recordGame();
  }
  nsend({ t: 'leave' }); game.net = false;
  openMenu('vs', 't-quick');
}
function showResult(tone, title, sub, chips, kind) {
  $('resultBox').className = 'result t-' + tone;
  $('ovTitle').textContent = title; $('ovSub').textContent = sub;
  $('ovStats').innerHTML = (chips || []).map(([k, v]) => `<div class="chip"><span>${k}</span><b>${v}</b></div>`).join('');
  overlayBtns(kind); overlay.classList.remove('hidden'); game.ovAt = performance.now();
  requestAnimationFrame(() => { const b = [...overlay.querySelectorAll('.btn')].find(b => !b.classList.contains('hidden')); if (b) b.focus({ preventScroll: true }); });
}
function showMessage(title, sub) {
  if (game.state === 'menu') { status(sub); return; }
  game.state = 'over'; showResult('purple', title, sub, [], 'menu');
}
game.fx = { rings: [], sparks: [] };
const ring = (x, y, col, r0, r1, dur, w = 5) => game.fx.rings.push({ x, y, col, r0, r1, dur, w, age: 0 });
const burst = (x, y, col, n, sp = 0.35) => { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = sp * (0.4 + Math.random() * 0.8);
  game.fx.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 380 + Math.random() * 300, max: 680, r: 2 + Math.random() * 3.5, col }); } };

// 공격 구슬: 연쇄 위치에서 출발해 크게 호를 그리며 상대 방해뿌요 칸으로 날아감(상쇄는 내 칸으로 짧게)
game.launch = (from, to, n, x, y, kind, ch) => {
  const col = kind === 'offset' ? '#8fd0ff' : CH_COL[Math.max(0, (ch == null ? from.chain : ch) - 1) % CH_COL.length];
  const tx = to.ox + to.fw / 2, ty = to.oy - 32;
  game.orbs.push({ x0: x, y0: y, x1: tx, y1: ty, t: 0, dur: kind === 'attack' ? 720 : 420, n, from, to, kind, col,
    size: 9 + Math.min(16, Math.sqrt(n) * 3.2), lift: kind === 'attack' ? 170 + Math.min(120, n * 3) : 60, trail: [] });
  ring(x, y, col, 8, 46, 320, 6); burst(x, y, col, 10, 0.25);
  kind === 'attack' ? sfx.send() : sfx.rot();
};
function orbPos(o) {
  const k = Math.min(1, o.t / o.dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  const mx = (o.x0 + o.x1) / 2, my = Math.min(o.y0, o.y1) - o.lift;
  return [(1 - e) * (1 - e) * o.x0 + 2 * (1 - e) * e * mx + e * e * o.x1, (1 - e) * (1 - e) * o.y0 + 2 * (1 - e) * e * my + e * e * o.y1];
}
function impact(o) {
  if (o.kind === 'attack') {
    if (!o.to.remote) o.to.pending += o.n;          // 상대 화면의 방해뿌요 수는 상대가 보내주는 값으로 표시
    if (o.from !== o.to) o.to.lastHitBy = o.from;   // 3~4인: 나를 공격한 사람에게 반격
    o.to.trayBump = 1; o.to.hit = Math.min(1, 0.4 + o.n / 20);
    o.to.shake = Math.max(o.to.shake, 3 + Math.min(7, o.n / 3));
    ring(o.x1, o.y1, o.col, 6, 40 + Math.min(40, o.n * 2), 380, 7); ring(o.x1, o.y1, '#ffffff', 4, 28, 240, 3);
    burst(o.x1, o.y1, o.col, 14 + Math.min(20, o.n), 0.4); sfx.hit(o.n);
  } else {
    ring(o.x1, o.y1, '#8fd0ff', 6, 52, 360, 6); ring(o.x1, o.y1, '#ffffff', 4, 30, 260, 3);
    burst(o.x1, o.y1, '#cdeaff', 16, 0.35); sfx.clash();
  }
}
function updateFx(dt) {
  for (const o of game.orbs) {
    o.t += dt; const [x, y] = orbPos(o); o.trail.push([x, y]); if (o.trail.length > 16) o.trail.shift();
    if (Math.random() < 0.5) game.fx.sparks.push({ x, y, vx: (Math.random() - 0.5) * 0.08, vy: (Math.random() - 0.5) * 0.08, life: 260, max: 260, r: 1.5 + Math.random() * 2, col: o.col });
  }
  game.orbs = game.orbs.filter(o => { if (o.t >= o.dur) { impact(o); return false; } return true; });
  for (const r of game.fx.rings) r.age += dt;
  game.fx.rings = game.fx.rings.filter(r => r.age < r.dur);
  for (const p of game.fx.sparks) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.0004 * dt; p.life -= dt; }
  game.fx.sparks = game.fx.sparks.filter(p => p.life > 0);
}
function drawFx(c) {
  for (const r of game.fx.rings) {
    const k = r.age / r.dur, e = 1 - Math.pow(1 - k, 3);
    c.globalAlpha = 1 - k; c.strokeStyle = r.col; c.lineWidth = r.w * (1 - k) + 0.5;
    c.beginPath(); c.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * e, 0, Math.PI * 2); c.stroke();
  }
  for (const p of game.fx.sparks) { c.globalAlpha = clamp(p.life / p.max, 0, 1); c.fillStyle = p.col; c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.fill(); }
  c.globalAlpha = 1;
  for (const o of game.orbs) {
    c.lineCap = 'round'; c.strokeStyle = o.col;              // 꼬리: 끝으로 갈수록 가늘고 옅어지는 빛줄기
    for (let i = 1; i < o.trail.length; i++) {
      const a = i / o.trail.length, [x0, y0] = o.trail[i - 1], [x1, y1] = o.trail[i];
      c.globalAlpha = a * 0.6; c.lineWidth = o.size * 1.6 * a;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    }
    c.globalAlpha = 1;
    const [x, y] = orbPos(o), R2 = o.size * (1 + 0.12 * Math.sin(o.t / 40));
    const gr = c.createRadialGradient(x, y, 1, x, y, R2 * 2);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.3, o.col); gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr; c.beginPath(); c.arc(x, y, R2 * 2, 0, Math.PI * 2); c.fill();
    c.save(); c.translate(x, y); c.rotate(o.t / 90); c.fillStyle = '#ffffff';     // 반짝이는 별 모양 코어
    c.beginPath(); for (let i = 0; i < 8; i++) { const rr2 = i % 2 ? R2 * 0.35 : R2 * 0.85, a = i * Math.PI / 4; c.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); } c.closePath(); c.fill();
    c.restore();
  }
}

function togglePause() {
  if (game.net) return;
  if (game.state === 'play') game.state = 'pause'; else if (game.state === 'pause') game.state = 'play';
}

function stateOf(f) {
  if (f.kind === 'tetris') {
    const q = f.phase === 'drop' && f.cur ? { k: f.cur.k, x: f.cur.x, y: f.cur.y, r: f.cur.r } : null;
    return { t: 'st', n: f.idx, pc: q, ho: f.holdK, gg: f.gauge, pe: f.pending, sc: f.score, mc: f.maxChain };
  }
  const p = f.piece; let pc = null;
  if (p && f.phase === 'drop') {
    const cf = f.fits({ ...p, y: p.y + 1 });
    pc = { x: p.x, y: p.y, o: p.o, a: p.a, b: p.b, p: cf ? Math.round(Math.min(1, f.acc / (f.soft ? 35 : f.fallIv())) * 100) / 100 : 0 };
  }
  return { t: 'st', n: f.idx, pc, hp: f.holdP, pe: f.pending, sc: f.score, mc: f.maxChain };
}
function update(dt) {
  if (game.state === 'intro') {
    game.introT -= dt;
    if (!game.introGo && game.introT <= 650) { game.introGo = true; sfx.go(); }
    if (game.introT <= 0) { game.state = 'play'; game.t0 = performance.now(); game.el = 0; }
  }
  const active = game.state === 'play';
  if (active) game.el += dt;                // 게임 진행 시간(일시정지·인트로 제외). 시간 규칙은 모두 이 값을 씀
  if (active && game.vs) {
    const lv = marginLv();
    if (lv > (game.marginLv || 0)) {
      game.marginLv = lv; sfx.margin();
      for (const f of game.fields) f.texts.push({ txt: lv === 1 ? '마진 타임!' : '공격력 UP!', x: f.fw / 2, y: FH * 0.3, age: 0, dur: 1500, col: '#ff9a3d', size: 34 });
    }
  }
  if (active && game.mode === 'replay') replayTick();
  for (const f of game.fields) f.update(dt, active);
  updateFx(dt);
  if (active && (game.net || game.rec)) {         // 상태(조각 위치·점수 등): 온라인 전송 + 녹화, 초당 20번
    game.stT += dt;
    if (game.stT >= 50) {
      game.stT = 0;
      for (const f of game.fields) if (!f.remote) {
        const d = stateOf(f);
        if (game.net && f === game.fields[0]) gsend(d);
        recState(f, d);
      }
    }
  }
  if (active) {
    const fin = !game.vs && game.fields[0].done;
    if (fin) { game.state = 'over'; game.overT = 0; sfx.win(); recordGame(); }
    const F = game.fields, first = !fin && F.find(f => f.dead);
    if (first && !game.vs) { game.state = 'over'; game.overT = 0; sfx.lose(); recordGame(); }
    else if (first) {
      for (const f of F) if (f.dead && !f.place) { f.place = F.filter(o => !o.dead).length + 1; f.piece = null; }   // 탈락 순위
      const alive = F.filter(f => !f.dead);
      const humansOut = game.mode !== 'online' && F.some(f => f.human) && F.every(f => !f.human || f.dead);    // 3~4인: 사람이 모두 탈락하면 끝(온라인은 끝까지 관전)
      if (alive.length <= 1 || humansOut) {
        game.state = 'over'; game.overT = 0;
        alive.sort((a, b) => b.score - a.score).forEach((f, i) => { f.place = i + 1; });
        const w = alive[0] || F.find(f => f !== first);
        w.won = true; w.place = 1; w.piece = null;
        (F[0].won || !F[0].human ? sfx.win : sfx.lose)();
        if (game.series && game.mode !== 'replay') { if (w === F[0]) game.series.me++; else game.series.op++; }
        recordGame();                        // 승패(won)가 정해진 뒤에 기록해야 함
      }
    }
  } else if (game.state === 'over') {
    game.overT += dt;
    if (game.ovKind === 'next' && !overlay.classList.contains('hidden')) {
      game.autoNextT -= dt;
      $('bRetry').textContent = `다음 판 (${Math.max(1, Math.ceil(game.autoNextT / 1000))})`;
      if (game.autoNextT <= 0) $('bRetry').click();
    }
    if (game.ovKind === 'forfeit' && !overlay.classList.contains('hidden')) overlay.classList.add('hidden');
    if (game.overT > 1400 && overlay.classList.contains('hidden') && game.recorded && game.mode === 'replay') {
      const rp = game.replay.data, f = game.fields, d = new Date(rp.d);
      const who = f.length > 1 ? `${f[0].name} vs ${f[1].name}` : f[0].name;
      const win = f.find(x => x.won);
      showResult('purple', '리플레이 끝', `${d.getMonth() + 1}/${d.getDate()} 경기 · ${who}${win ? ` · ${win.name} 승리` : ''}`,
        f.map(x => [x.name, `${x.score.toLocaleString()}점 · ${x.kind === 'tetris' ? `${x.maxChain} REN` : `${x.maxChain}연쇄`}`]), 'replay');
    } else if (game.overT > 1400 && overlay.classList.contains('hidden') && game.recorded) {
      const me = game.fields[0], online = game.mode === 'online';
      const isT = me.kind === 'tetris';
      const chips = [['점수', me.score.toLocaleString()], isT ? ['최고 REN', `${me.maxChain} REN`] : ['최고 연쇄', `${me.maxChain}연쇄`],
        [game.vs ? '보낸 공격' : isT ? '지운 줄' : '터뜨린 뿌요', game.vs ? me.sent : me.pops], ['플레이 시간', game.el < 60000 ? '1분 미만' : fmtTime(game.el)]];
      if (game.vs) {
        const local = game.mode === 'local';
        const many = game.fields.length > 2;
        const who = (online ? `${game.fields[1].name} 님과의 대전` : local ? '로컬 대전' : `AI ${DIFF[game.diff]}`) +
          (many ? ` · ${game.fields.length}인 대전` : ` · ${STYLE_KO[me.kind]} vs ${STYLE_KO[game.fields[1].kind]}`);
        if (many) chips[3] = ['순위', `${me.place || 1}위 / ${game.fields.length}명`];
        const sr = game.series, done = sr && sr.to > 1 && (sr.me >= sr.to || sr.op >= sr.to), mid = sr && sr.to > 1 && !done;
        const winner = game.fields.find(f => f.won);
        const title = local && many ? `${winner ? winner.name : ''} 승리!`
          : local ? `${done ? '최종 ' : ''}${(done ? sr.me > sr.op : me.won) ? '1P' : '2P'} 승리!`
          : done ? (sr.me > sr.op ? '최종 승리!' : '최종 패배') : me.won ? '승리!' : many ? `${me.place}위` : '패배';
        const sub = (sr ? `시리즈 ${sr.me} : ${sr.op}${sr.to > 1 ? ` (${sr.to}선승)` : ''} · ` : '') + who + (game.oppLeft ? ' · 상대가 나갔습니다' : '');
        showResult(me.won ? 'yellow' : 'blue', title, sub, chips, online ? (net.ws && !game.oppLeft ? 'online' : 'menu') : mid ? 'next' : 'offline');
        if (mid) game.autoNextT = 3500;
      } else {
        const sm = isT ? game.soloMode || 'endless' : 'endless', fin = me.done;
        const rec = !isT ? `뿌요뿌요 연습 최고 ${(stats.practice.best || 0).toLocaleString()}점`
          : sm === 'sprint' ? (fin ? `기록 ${fmtClock(me.doneAt)} · 최고 ${fmtClock(stats.tRec.sprint)}` : `40줄을 채우지 못했어요 · 최고 ${stats.tRec.sprint ? fmtClock(stats.tRec.sprint) : '-'}`)
          : sm === 'endless' ? `테트리스 끝없이 최고 ${(stats.practice.tBest || 0).toLocaleString()}점`
          : `${SOLO_KO[sm]} 최고 ${(stats.tRec[sm] || 0).toLocaleString()}점`;
        const title = fin ? (sm === 'ultra' ? '시간 종료!' : '완주!') : '게임 오버';
        if (isT) chips[2] = ['지운 줄', me.lines];
        showResult(fin ? 'yellow' : 'green', game.newRecord && (fin || sm !== 'sprint') ? title + ' 신기록!' : title, rec, chips, 'offline');
      }
    }
  }
}

function drawPair(c, cx, cy, s, a, b, bob) {
  c.save(); c.translate(cx, cy + bob); c.scale(s, s);
  drawPuyos(c, [{ cx: 0, cy: -CS / 2, rx: R, ry: R, col: b }, { cx: 0, cy: CS / 2, rx: R, ry: R, col: a }], []); c.restore();
}

function render(t) {
  const W = LW, rs = game.rs || DPR;
  ctx.setTransform(rs, 0, 0, rs, 0, -VIEW_Y0 * rs); ctx.clearRect(0, 0, W, CANVAS_H);
  for (const f of game.fields) f.draw(t);
  const me = game.fields[0]; if (!me) return;
  ctx.save();
  // 다음 (뿌요: 2쌍 / 테트리스: 5개 + 홀드)
  const isT = me.kind === 'tetris';
  slab(ctx, PX - 70, OY - 8, 140, 250, TONES.yellow, 6);
  ctx.fillStyle = '#fff'; ctx.fillRect(PX - 54, OY + 30, 108, 200);
  ctx.fillStyle = '#1e174e'; ctx.fillRect(PX - 50, OY + 34, 100, 192);
  outlined(ctx, '다음', PX, OY + 13, 22, '#fff', TONES.yellow.d, 6);
  if (me.phase !== 'none' && !me.dead) {
    if (isT) {
      for (let i = 0; i < 5; i++) drawMino(ctx, tPieceAt(me.idx + i), PX, OY + 62 + i * 36, i ? 12 : 15, i ? 0.85 : 1);
    } else {
      const n1 = pairAt(me.idx), n2 = pairAt(me.idx + 1);
      drawPair(ctx, PX, OY + 92, 1, n1[0], n1[1], Math.sin(t / 300) * 2);
      drawPair(ctx, PX, OY + 182, 0.78, n2[0], n2[1], 0);
    }
  }
  {                                    // 홀드(뿌요·테트리스 공통)
    const hk = keyName(({ ...DEF_KEYS, ...(stats.keys || {}) }).hold[0] || '');
    slab(ctx, PX - 70, OY + 256, 140, 100, TONES.purple, 6);
    ctx.fillStyle = '#fff'; ctx.fillRect(PX - 54, OY + 290, 108, 56);
    ctx.fillStyle = '#1e174e'; ctx.fillRect(PX - 50, OY + 294, 100, 48);
    outlined(ctx, game.mode === 'local' ? '홀드' : `홀드 (${hk})`, PX, OY + 274, 19, '#fff', TONES.purple.d, 5);
    ctx.save(); ctx.globalAlpha = me.canHold === false ? 0.35 : 1;
    if (isT && me.holdK) drawMino(ctx, me.holdK, PX, OY + 318, 15, 1);
    else if (!isT && me.holdP) {          // 홀드한 뿌요 쌍을 옆으로 눕혀 표시
      ctx.translate(PX, OY + 318); ctx.scale(0.6, 0.6);
      drawPuyos(ctx, [{ cx: -CS / 2, cy: 0, rx: R, ry: R, col: me.holdP[0] }, { cx: CS / 2, cy: 0, rx: R, ry: R, col: me.holdP[1] }], []);
    }
    ctx.restore();
  }
  if (game.vs) {
    const base = OY + 376;
    if (game.marginLv) {                       // 마진 타임: 현재 공격력 배율
      slab(ctx, PX - 66, base, 132, 36, TONES.orange, 4);
      outlined(ctx, `공격력 ×${(70 / targetPt()).toFixed(1)}`, PX, base + 18, 17, '#fff', TONES.orange.d, 5);
    }
    const y = base + 92;                       // VS 엠블럼
    ctx.save(); ctx.translate(PX, y); ctx.rotate(-0.08);
    slab(ctx, -66, -34, 66, 68, TONES.red, 5); slab(ctx, 0, -34, 66, 68, TONES.blue, 5);
    ctx.font = '64px ' + HFONT(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = 14; ctx.strokeStyle = '#22212e'; ctx.strokeText('VS', 0, 3);
    ctx.lineWidth = 7; ctx.strokeStyle = '#fff'; ctx.strokeText('VS', 0, 3);
    const gr = ctx.createLinearGradient(0, -26, 0, 30); gr.addColorStop(0, '#ffe066'); gr.addColorStop(1, '#ff8a1c');
    ctx.fillStyle = gr; ctx.fillText('VS', 0, 3);
    ctx.restore();
    const sr = game.series;                    // 시리즈 점수(선승제 / 같은 상대와의 누적)
    if (game.fields.length > 2 && me.opp && !me.dead && game.state === 'play') {   // 3~4인: 지금 공격 대상
      slab(ctx, PX - 66, y + 50, 132, 54, me.opp.tone || TONES.blue, 4);
      outlined(ctx, '공격 대상', PX, y + 64, 13, '#fff', (me.opp.tone || TONES.blue).d, 4);
      outlined(ctx, me.opp.name, PX, y + 86, 20, '#fff', (me.opp.tone || TONES.blue).d, 5);
    } else if (sr) {
      slab(ctx, PX - 62, y + 50, 124, 46, TONES.white, 4);
      outlined(ctx, `${sr.me} : ${sr.op}`, PX, y + 74, 28, '#22212e', '#fff', 4);
      if (sr.to > 1) { ctx.font = '13px ' + FONT(); ctx.fillStyle = '#6d6b80'; ctx.textAlign = 'center'; ctx.fillText(`${sr.to}선승`, PX, y + 108); }
    }
  } else {
    const ly = OY + 372, sm = game.soloMode;
    slab(ctx, PX - 70, ly, 140, 62, TONES.green, 5);
    outlined(ctx, isT && sm !== 'endless' ? SOLO_KO[sm] : '레벨 ' + me.level, PX, ly + 32, isT && sm !== 'endless' ? 24 : 26, '#fff', TONES.green.d, 6);
    if (isT) {
      const el = game.state === 'play' || game.state === 'over' || game.state === 'pause' ? (me.doneAt || game.el) : 0;
      const lines = [
        sm === 'sprint' ? `남은 줄 ${Math.max(0, 40 - me.lines)}` : sm === 'marathon' ? `${me.lines} / 150줄` : `${me.lines}줄`,
        sm === 'ultra' ? `남은 시간 ${fmtClock(Math.max(0, 180000 - el))}` : sm === 'marathon' ? `레벨 ${me.level}` : fmtClock(el),
      ];
      lines.forEach((txt, i) => { slab(ctx, PX - 70, ly + 72 + i * 50, 140, 44, TONES.white, 4); outlined(ctx, txt, PX, ly + 94 + i * 50, 18, '#22212e', '#fff', 4); });
    }
  }
  ctx.restore();
  drawFx(ctx);
  if (game.mode === 'replay') drawReplayHud(ctx);
  if (game.state === 'intro') drawIntro(t);
}
// 시작 연출: 각자 고른 스타일(뿌요뿌요/테트리스)과 VS, 준비→시작
function drawIntro(t) {
  const W = LW, k = game.introT, go = k <= 650;
  ctx.save();
  ctx.fillStyle = 'rgba(20,16,50,0.5)'; ctx.fillRect(0, 0, W, CANVAS_H);
  if (!go) {
    for (const f of game.fields) {
      const cx = f.ox + f.fw / 2, cy = OY + FH * 0.36, tone = f.tone || TONES.red;
      const e = Math.min(1, (2000 - k) / 260), off = (1 - e) * (f.ox < W / 2 ? -80 : 80);
      ctx.save(); ctx.translate(cx + off, cy); ctx.rotate(-0.05); ctx.globalAlpha = e;
      slab(ctx, -f.fw / 2 - 6, -54, f.fw + 12, 108, tone, 6);
      outlined(ctx, f.name, 0, -18, 26, '#fff', tone.d, 7);
      outlined(ctx, STYLE_KO[f.kind], 0, 22, 34, '#ffe066', tone.d, 8);
      ctx.restore();
    }
  }
  const msg = go ? '시작!' : '준비…', age = go ? 650 - k : 2000 - k;
  const sc = 0.6 + 0.4 * Math.min(1, age / 180) + (go ? 0.15 * Math.max(0, 1 - age / 200) : 0);
  ctx.translate(W / 2, OY + FH * 0.82); ctx.scale(sc, sc);
  outlined(ctx, msg, 0, 0, go ? 76 : 56, go ? '#ffe066' : '#fff', '#22212e', 12);
  ctx.restore();
}
