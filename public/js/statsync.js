// 기록 동기화: 계정에 묶인 기록(판수·승패·최고 기록·최근 경기·어드벤처/퍼즐 진행)을 서버에 올리고, 다른 컴퓨터에서 받아 합침
// 합치는 규칙은 순서와 상관없이 같은 결과가 되게(최댓값·합집합) 해서, 두 컴퓨터가 번갈아 올려도 서로 덮어쓰지 않고 수렴함. 브라우저와 서버가 같은 파일을 씀
(function (root) {
  'use strict';
  const COUNT = { games: 1e7, playMs: 1e12, bestChain: 999, pops: 1e9, chains: 1e8, allClear: 1e7, sent: 1e9, doubles: 1e8, tLines: 1e9, tTetris: 1e8, tSpins: 1e8, tPC: 1e7, bestRen: 999 };
  const PRACTICE = { games: 1e7, best: 1e9, tBest: 1e9, fBest: 1e9, fChain: 999 }, TREC = { marathon: 1e9, ultra: 1e9 }, SPRINT = [10000, 3600000];
  const ni = (v, max) => Number.isFinite(+v) ? Math.max(0, Math.min(max, Math.round(+v))) : 0;
  const str = (v, n) => typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').slice(0, n) : '';
  const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const hkey = h => `${h.d}|${h.m}|${h.sc}`;

  function cleanRk(k) {
    if (!k || typeof k !== 'object') return undefined;
    const o = { d: k.d == null ? null : ni(k.d, 1000), event: str(k.event, 12) || null, placing: !!k.placing, after: str(k.after, 40), group: Number.isFinite(+k.group) ? Math.max(-1, Math.min(5, Math.round(+k.group))) : -1, div: ni(k.div, 3) };
    if (k.d != null && Number.isFinite(+k.d)) o.d = Math.max(-1000, Math.min(1000, Math.round(+k.d)));
    if (k.opp && typeof k.opp === 'object') o.opp = { text: str(k.opp.text, 40) };
    return o;
  }
  function cleanHist(h) {
    h = obj(h); const d = ni(h.d, 4e12); if (!d) return null;
    const o = { d, m: str(h.m, 70), r: ['w', 'l', 'p'].includes(h.r) ? h.r : 'p', sc: ni(h.sc, 1e10), ch: ni(h.ch, 999), k: h.k === 't' ? 't' : 'p', cat: str(h.cat, 10), mc: str(h.mc, 12) || 'lumi',
      oc: Array.isArray(h.oc) ? h.oc.slice(0, 3).map(x => str(x, 12)) : [], on: str(h.on, 40), pl: h.pl == null ? null : ni(h.pl, 4), sr: Array.isArray(h.sr) && h.sr.length === 2 ? [ni(h.sr[0], 9), ni(h.sr[1], 9)] : null };
    const rk = cleanRk(h.rk); if (rk) o.rk = rk;
    return o;
  }
  // 보내거나 받은 기록을 모양에 맞게 고침(이상한 값은 0·빈칸). 쓸 수 없으면 null
  function clean(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
    const o = {};
    for (const [k, max] of Object.entries(COUNT)) o[k] = ni(d[k], max);
    o.ai = [0, 1, 2].map(i => ({ w: ni(((d.ai || [])[i] || {}).w, 1e7), l: ni(((d.ai || [])[i] || {}).l, 1e7) }));
    o.online = { w: ni(obj(d.online).w, 1e7), l: ni(obj(d.online).l, 1e7) };
    o.practice = {}; for (const [k, max] of Object.entries(PRACTICE)) o.practice[k] = ni(obj(d.practice)[k], max);
    o.tRec = { sprint: 0, marathon: ni(obj(d.tRec).marathon, TREC.marathon), ultra: ni(obj(d.tRec).ultra, TREC.ultra) };
    const sp = ni(obj(d.tRec).sprint, SPRINT[1]); o.tRec.sprint = sp >= SPRINT[0] ? sp : 0;
    o.history = (Array.isArray(d.history) ? d.history : []).slice(0, 100).map(cleanHist).filter(Boolean);
    o.adv = {}; Object.entries(obj(d.adv)).slice(0, 300).forEach(([k, v]) => { if (/^[\w-]{1,16}$/.test(k)) o.adv[k] = ni(v, 3); });
    o.puz = {}; Object.entries(obj(d.puz)).slice(0, 600).forEach(([k, v]) => { if (/^[a-z]{1,8}-\d{1,3}$/.test(k) && v) o.puz[k] = true; });
    o.tutSeen = !!d.tutSeen;
    return o;
  }
  // 두 기록을 합침: 쌓이는 숫자·최고 기록은 큰 쪽, 스프린트는 짧은 쪽, 최근 경기·진행은 합집합
  function merge(a, b) {
    a = clean(a) || clean({}); b = clean(b) || clean({});
    const o = clean({}), mx = (x, y) => Math.max(x, y);
    for (const k of Object.keys(COUNT)) o[k] = mx(a[k], b[k]);
    o.ai = a.ai.map((x, i) => ({ w: mx(x.w, b.ai[i].w), l: mx(x.l, b.ai[i].l) }));
    o.online = { w: mx(a.online.w, b.online.w), l: mx(a.online.l, b.online.l) };
    for (const k of Object.keys(PRACTICE)) o.practice[k] = mx(a.practice[k], b.practice[k]);
    o.tRec.marathon = mx(a.tRec.marathon, b.tRec.marathon); o.tRec.ultra = mx(a.tRec.ultra, b.tRec.ultra);
    o.tRec.sprint = a.tRec.sprint && b.tRec.sprint ? Math.min(a.tRec.sprint, b.tRec.sprint) : a.tRec.sprint || b.tRec.sprint;
    const seen = new Map(); for (const h of [...a.history, ...b.history]) { const k = hkey(h); if (!seen.has(k) || (!seen.get(k).rk && h.rk)) seen.set(k, h); }
    o.history = [...seen.values()].sort((x, y) => y.d - x.d).slice(0, 100);
    for (const k of new Set([...Object.keys(a.adv), ...Object.keys(b.adv)])) o.adv[k] = mx(a.adv[k] || 0, b.adv[k] || 0);
    o.puz = { ...a.puz, ...b.puz }; o.tutSeen = a.tutSeen || b.tutSeen;
    const sorted = x => Object.fromEntries(Object.entries(x).sort((p, q) => p[0] < q[0] ? -1 : 1)); o.adv = sorted(o.adv); o.puz = sorted(o.puz);   // 키 순서까지 같게
    return o;
  }
  // 기록 부분만 뽑기(설정·키·닉네임은 제외) / 로컬 stats에 합친 결과를 입히기
  const pick = s => clean(s);
  function apply(s, m) {
    for (const k of Object.keys(COUNT)) s[k] = m[k];
    s.ai = m.ai; s.online = m.online; s.practice = { ...(s.practice || {}), ...m.practice }; s.tRec = { ...(s.tRec || {}), ...m.tRec };
    // 이 컴퓨터에만 있는 리플레이 번호(rp)는 같은 경기라면 지켜 줌
    const mine = new Map((s.history || []).map(h => [hkey(h), h.rp]));
    s.history = m.history.map(h => mine.get(hkey(h)) ? { ...h, rp: mine.get(hkey(h)) } : h);
    s.adv = { ...(s.adv || {}), ...m.adv }; s.puz = { ...(s.puz || {}), ...m.puz }; if (m.tutSeen) s.tutSeen = true;
    return s;
  }
  const same = (a, b) => JSON.stringify(clean(a)) === JSON.stringify(clean(b));
  const api = { clean, merge, pick, apply, same };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.StatSync = api;
})(typeof window !== 'undefined' ? window : globalThis);
