// 연습 모드 글로벌 순위: 모드마다 계정별 최고 기록 하나. 점수는 화면이 알려 주는 값이라 있을 수 없는 값(상·하한)만 걸러 냄
'use strict';
const auth = require('./auth');

// dir 1: 클수록 좋음(점수) · -1: 작을수록 좋음(시간 ms)
const MODES = {
  pe: { ko: '뿌요뿌요 연습', dir: 1, min: 1, max: 99999999, unit: '점' },
  pf: { ko: '엔드리스 피버', dir: 1, min: 1, max: 99999999, unit: '점' },
  te: { ko: '테트리스 끝없이', dir: 1, min: 1, max: 99999999, unit: '점' },
  tm: { ko: '마라톤', dir: 1, min: 1, max: 3000000, unit: '점' },
  tu: { ko: '울트라', dir: 1, min: 1, max: 3000000, unit: '점' },
  ts: { ko: '스프린트', dir: -1, min: 10000, max: 3600000, unit: 'ms' },
};
const better = (m, a, b) => MODES[m].dir > 0 ? a > b : a < b;
const cache = {};                                   // 모드 → 정렬된 목록(기록이 바뀔 때만 다시 계산)
function rows(m) {
  if (cache[m]) return cache[m];
  const list = auth.all().filter(a => a.pr && a.pr[m]).map(a => ({ uid: a.uid, name: a.name, char: a.char, v: a.pr[m].v, at: a.pr[m].at }));
  list.sort((x, y) => MODES[m].dir > 0 ? y.v - x.v || x.at - y.at : x.v - y.v || x.at - y.at);
  return (cache[m] = list);
}
// 기록 올리기: 더 좋을 때만 바뀜. 돌려주는 값: { rank, total, best, improved }
function submit(a, m, v) {
  if (!MODES[m] || !Number.isFinite(v)) return { err: '기록이 올바르지 않아요.' };
  v = Math.round(v);
  if (v < MODES[m].min || v > MODES[m].max) return { err: '기록이 올바르지 않아요.' };
  const pr = a.pr && typeof a.pr === 'object' ? a.pr : (a.pr = {}), cur = pr[m];
  let improved = false;
  if (!cur || better(m, v, cur.v)) { pr[m] = { v, at: Date.now() }; improved = true; delete cache[m]; auth.saveSoon(); }
  const list = rows(m), i = list.findIndex(r => r.uid === a.uid);
  return { rank: i + 1, total: list.length, best: pr[m].v, improved };
}
// 순위표: 위에서 limit명 + 내 기록
function board(m, uid, limit, pidOf) {
  if (!MODES[m]) return { err: '알 수 없는 모드예요.' };
  const list = rows(m), i = list.findIndex(r => r.uid === uid);
  const row = (r, k) => ({ place: k + 1, pid: pidOf(r.uid), name: r.name, char: r.char, v: r.v, me: r.uid === uid });
  return { mode: m, total: list.length, rows: list.slice(0, limit).map(row), me: i >= 0 ? row(list[i], i) : null };
}
module.exports = { MODES, submit, board };
