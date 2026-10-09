// 랭크 규칙 테스트(서버 없이 rank.js 직접): 배치 · 티어 이름 · 잃은 만큼 내려가기 · 승급 보호 · 마스터 등수 · 시즌 넘김
// 실행: node tests/rank-rules.js
const os = require('os'), path = require('path'), fs = require('fs');
process.env.RANK_FILE = path.join(os.tmpdir(), `rank-rules-${process.pid}.json`);
process.env.RANK_NOW = String(new Date(2026, 8, 10).getTime());           // 2026년 9월 = 시즌 5
const R = require('../rank.js');
let fail = 0; const ok = (c, msg) => { console.log(`${c ? '✓' : '✗'} ${msg}`); if (!c) fail++; };
const tok = i => 'tok' + String(i).padStart(14, '0');

// 티어 이름: 숫자가 클수록 높음
ok(R.tierOf(0).label === '브론즈 1' && R.tierOf(250).label === '브론즈 3' && R.tierOf(300).label === '실버 1' && R.tierOf(1499).label === '다이아 3' && R.tierOf(1500).label === '마스터', '티어 순서: 브론즈 1 < 브론즈 3 < 실버 1 … 다이아 3 < 마스터');
ok(R.seasonInfo().name === '2026 시즌 5' && R.seasonInfo().months === '9~10월', '시즌: 2달 단위(9~10월 = 시즌 5)');

// 배치 10시리즈
const a = R.get(tok(1), 'puyo', 'A'), b = R.get(tok(2), 'puyo', 'B');
for (let i = 0; i < 9; i++) R.report(a, b, [2, 0]);
ok(R.view(a).placing && R.view(a).placed === 9 && R.labelOf(R.view(a)) === '배치 9/10', '배치 중에는 RP 없이 배치 9/10');
const [ra] = R.report(a, b, [2, 1]);
const va = R.view(a), vb = R.view(b);
ok(ra.event === 'placed' && !va.placing && va.total <= 1199 && va.rp === 25, `배치 완료(10승) → ${va.label} ${va.rp} RP (첫 시즌 최대 플래티넘 3)`);
ok(!vb.placing && vb.total < va.total, `10패 → ${vb.label} ${vb.rp} RP`);

// 잃은 만큼 그대로 내려가기: 실버 1 · 10 RP에서 지면 브론즈 3 · 90 근처
a.total = 310; a.shield = false;
const c = R.get(tok(3), 'puyo', 'C'); Object.assign(c, { placed: 10, season: a.season, total: 310, r: 1000, rd: 60 });
const [, rc] = R.report(a, c, [2, 0]);   // c가 짐
ok(rc.d < 0 && R.tierOf(c.total).label === '브론즈 3' && c.total === 310 + rc.d, `강등은 잃은 점수만큼: 실버 1 · 10 RP ${rc.d} → ${R.tierOf(c.total).label} · ${R.tierOf(c.total).rp} RP`);

// 승급 → 바로 다음 시리즈는 져도 그 칸 아래로 안 내려감
const d = R.get(tok(4), 'puyo', 'D'); Object.assign(d, { placed: 10, season: a.season, total: 395, r: 1700, rd: 60 });
const e = R.get(tok(5), 'puyo', 'E'); Object.assign(e, { placed: 10, season: a.season, total: 400, r: 1500, rd: 60 });
const [rd1] = R.report(d, e, [2, 0]);
ok(rd1.event === 'promote' && R.tierOf(d.total).label === '실버 2', `승급: 실버 1 · 95 RP +${rd1.d} → ${R.tierOf(d.total).label}`);
d.total = 405;
const [, rd2] = R.report(e, d, [2, 0]);
ok(rd2.event === 'shield' && d.total === 400, '승급 직후 패배는 실버 2 · 0 RP에서 멈춤(강등 보호)');
const [, rd3] = R.report(e, d, [2, 0]);
ok(rd3.d < 0 && d.total < 400 && R.tierOf(d.total).label === '실버 1', `보호는 한 번만: 다음 패배는 ${R.tierOf(d.total).label} · ${R.tierOf(d.total).rp} RP`);

// 마스터: RP가 계속 쌓이고 등수로 표시
const m1 = R.get(tok(6), 'puyo', 'M1'), m2 = R.get(tok(7), 'puyo', 'M2');
Object.assign(m1, { placed: 10, season: a.season, total: 1620 }); Object.assign(m2, { placed: 10, season: a.season, total: 1580 });
ok(R.labelOf(R.view(m1)) === '마스터 #1' && R.labelOf(R.view(m2)) === '마스터 #2', `마스터 등수 표시: ${R.labelOf(R.view(m1))}, ${R.labelOf(R.view(m2))}`);
R.report(m2, m1, [2, 0]); R.report(m2, m1, [2, 0]); R.report(m2, m1, [2, 0]);
ok(R.labelOf(R.view(m2)) === '마스터 #1', `RP 순으로 등수 바뀜: M2 ${m2.total - R.MASTER} RP → 마스터 #1`);
ok(R.top('puyo')[0].text.startsWith('마스터 #1'), '순위표 1위는 마스터 #1');

// 시즌 넘김: 세부 티어 3칸 하락 + 재배치(기준 ±3칸)
const gold3 = R.get(tok(8), 'puyo', 'G'); Object.assign(gold3, { placed: 10, season: a.season, total: 850, peak: 870 });   // 골드 3 · 50
const foe = R.get(tok(9), 'puyo', 'F'); Object.assign(foe, { placed: 10, season: a.season, total: 850 });
process.env.RANK_NOW = String(new Date(2026, 10, 3).getTime());          // 11월 = 시즌 6
const g2 = R.get(tok(8), 'puyo'), f2 = R.get(tok(9), 'puyo');
ok(R.view(g2).placing && g2.total === 550 && g2.hist[0].final === '골드 3' && g2.hist[0].peak === '골드 3', '새 시즌: 배치 중, 기준은 3칸 아래(골드 3 · 50 → 실버 3 · 50), 지난 시즌 기록 남김');
for (let i = 0; i < 5; i++) { R.report(g2, f2, [2, 1]); R.report(f2, g2, [2, 1]); }   // 5승 5패
ok(!R.view(g2).placing && R.view(g2).label === '실버 3', `재배치 5승 5패 → ${R.labelOf(R.view(g2))}(기준 그대로)`);

R.flush(); try { fs.unlinkSync(process.env.RANK_FILE); } catch {}
console.log(fail ? `\n${fail}개 실패` : '\n모두 통과'); process.exitCode = fail ? 1 : 0;
