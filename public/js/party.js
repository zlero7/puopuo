// 파티 규칙
'use strict';

/* ================= 파티(우리 게임 버전) =================
   - 2분 동안 점수 경쟁. 꼭대기까지 차도 탈락하지 않고 판이 비워지며 점수가 15% 깎임
   - 6조각마다 조각에 ★아이템이 붙어 나옴. 뿌요는 그 뿌요를 터뜨리면, 테트리스는 그 칸이 있는 줄을 지우면 발동
   - 아이템: 방해 폭탄(상대 모두에게 방해) · 판 정리(내 판 아래 3줄 없앰) · 조작 반전(상대 좌우 반대 8초)
             미리보기 가리기(상대 '다음' 가림 8초) · 속도 업(상대 낙하 3배 8초) · 점수 2배(내 점수 10초)
   - 시간이 끝나면 각자 최종 점수를 알리고, 다 모이면 점수 순으로 순위를 정함(온라인·리플레이 일치) */
const PARTY_T = 120000, ITEM_EVERY = 6;
const ITEMS = {
  bomb:  { ko: '방해 폭탄', col: '#ff4559' },
  clean: { ko: '판 정리',   col: '#39c63c' },
  rev:   { ko: '조작 반전', col: '#9a4fd8', dur: 8000, foe: true, tag: '반전' },
  blind: { ko: '미리보기 가리기', col: '#55507a', dur: 8000, foe: true, tag: '가림' },
  speed: { ko: '속도 업',   col: '#ff8a1c', dur: 8000, foe: true, tag: '빠름' },
  dbl:   { ko: '점수 2배',  col: '#ffc915', dur: 10000, tag: '×2' },
};
const ITEM_KEYS = Object.keys(ITEMS);
const effOn = (f, k) => game.rule === 'party' && f.eff && f.eff[k] > (game.el || 0);
// 이번 조각에 아이템을 붙일지(6조각마다)
function nextItem(f) {
  if (game.rule !== 'party' || f.remote) return null;
  f.itemN = (f.itemN || 0) + 1;
  return f.itemN % ITEM_EVERY === 0 ? ITEM_KEYS[rnd(ITEM_KEYS.length)] : null;
}
// 아이템 효과 표시·적용(보낸 쪽과 받는 쪽 모두에서). 실제 판 변화(방해·정리)는 쓴 사람 쪽에서만
function itemFx(from, k) {
  const it = ITEMS[k]; if (!it) return;
  from.texts.push({ txt: `★ ${it.ko}!`, x: from.fw / 2, y: FH * 0.22, age: 0, dur: 1500, col: it.col, size: 26 });
  if (!it.dur) return;
  const targets = it.foe ? game.fields.filter(o => o !== from && !o.dead) : [from];
  for (const o of targets) { o.eff = o.eff || {}; o.eff[k] = (game.el || 0) + it.dur; if (it.foe) o.texts.push({ txt: it.ko, x: o.fw / 2, y: FH * 0.3, age: 0, dur: 1300, col: it.col, size: 28 }); }
}
function useItem(f, k) {
  if (f.remote) return;
  emit(f, { t: 'it', k });
  itemFx(f, k);
  if (f.human) sfx.margin();
  if (k === 'bomb') {
    for (const o of game.fields) {
      if (o === f || o.dead) continue;
      const n = o.kind === 'tetris' ? 3 : 12, x = f.ox + f.fw / 2, y = OY + FH * 0.3;
      game.launch(f, o, n, x, y, 'attack', 6);
      emit(f, { t: 'atk', to: game.fields.indexOf(o), n, x: x - f.ox, y: y - f.oy, ch: 6 });
    }
  } else if (k === 'clean') f.cleanRows(3);
}
// 꼭대기까지 찬 판: 비우고 점수 15% 깎기
function partyReset(f) {
  const cut = Math.round(f.score * 0.15);
  f.score -= cut;
  f.texts.push({ txt: `리셋 -${cut.toLocaleString()}`, x: f.fw / 2, y: FH * 0.4, age: 0, dur: 1600, col: '#ff4f6a', size: 30 });
  f.shake = 8; f.hit = 1;
  f.clearBoard();
}

/* ---------- 진행 ---------- */
function partyInit() { game.party = { fin: {} }; }
function partyFinish(f, sc) {
  const P = game.party, i = game.fields.indexOf(f);
  if (!P || i < 0 || P.fin[i] != null) return;
  P.fin[i] = sc; f.score = sc;
  if (!f.remote) { emit(f, { t: 'pend', sc }); f.piece = null; f.cur = null; f.phase = 'bbwait'; }
}
function partyTick() {
  const P = game.party; if (!P) return;
  if ((game.el || 0) >= PARTY_T) for (const f of game.fields) if (!f.remote) partyFinish(f, f.score);
  if (!game.fields.every((f, i) => P.fin[i] != null)) return;
  // 모두 모임: 점수 순위(같으면 앞 번호)
  const order = game.fields.map((f, i) => i).sort((a, b) => P.fin[b] - P.fin[a] || a - b);
  order.forEach((i, r) => { game.fields[i].place = r + 1; });
  const w = game.fields[order[0]]; w.won = true;
  game.state = 'over'; game.overT = 0;
  (game.fields[0].won || !game.fields[0].human ? sfx.win : sfx.lose)();
  if (game.series && game.mode !== 'replay') { if (w === game.fields[0]) game.series.me++; else game.series.op++; }
  recordGame();
}
function drawParty(c) {
  const left = Math.max(0, PARTY_T - (game.el || 0)), base = OY + 376, m = Math.floor(left / 60000), s = Math.floor(left / 1000) % 60;
  slab(c, PX - 66, base, 132, 36, left < 10000 ? TONES.red : TONES.purple, 4);
  outlined(c, `파티 ${m}:${String(s).padStart(2, '0')}`, PX, base + 18, 18, '#fff', (left < 10000 ? TONES.red : TONES.purple).d, 5);
  for (const f of game.fields) {                  // 걸린 효과(판 위쪽)
    if (!f.eff) continue;
    let x = f.ox + 8;
    for (const k of ITEM_KEYS) {
      const it = ITEMS[k]; if (!it.tag || !effOn(f, k)) continue;
      const sec = Math.ceil((f.eff[k] - game.el) / 1000);
      slab(c, x, OY + 6, 58, 24, { c: it.col, d: '#22212e' }, 3);
      outlined(c, `${it.tag} ${sec}`, x + 29, OY + 18, 13, '#fff', '#22212e', 4);
      x += 64;
    }
  }
}
// 아이템 별 표시
function drawStar(c, x, y, r, col = '#ffe066') {
  c.save(); c.translate(x, y); c.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr2 = i % 2 ? r * 0.45 : r; c.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); }
  c.closePath(); c.fillStyle = col; c.fill(); c.lineWidth = 2; c.strokeStyle = '#7a4c00'; c.stroke(); c.restore();
}
