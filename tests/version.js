// 자동 버전 올리기(tools/next-version.js) 테스트
// 실행: node tests/version.js
const { pickLevel, bump } = require('../tools/next-version');
let fail = 0; const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };
ok(bump('1.1.35', 'patch') === '1.1.36', '사소한 변경: 1.1.35 → 1.1.36');
ok(bump('1.1.35', 'minor') === '1.2.0', '적당한 변경: 1.1.35 → 1.2.0(마지막 자리는 0으로)');
ok(bump('1.1.35', 'major') === '2.0.0', '큰 변경: 1.1.35 → 2.0.0(뒤 두 자리는 0으로)');
ok(pickLevel({ lines: 12, files: 1 }) === 'patch', '12줄·파일 1개 → 사소');
ok(pickLevel({ lines: 149, files: 5 }) === 'patch', '149줄·파일 5개 → 사소(경계)');
ok(pickLevel({ lines: 150, files: 2 }) === 'minor', '150줄 → 적당');
ok(pickLevel({ lines: 40, files: 6 }) === 'minor', '파일 6개 → 적당');
ok(pickLevel({ lines: 10, files: 1, shellChanged: true }) === 'minor', '앱 본체 호환 번호가 바뀌면 적어도 적당');
ok(pickLevel({ lines: 3000, files: 10 }) === 'major', '3000줄 → 큰 변경');
ok(pickLevel({ lines: 100, files: 60 }) === 'major', '파일 60개 → 큰 변경');
ok(pickLevel({ title: '글자 고침 [minor]', lines: 3 }) === 'minor', '커밋 제목의 [minor]가 우선');
ok(pickLevel({ title: '대규모 개편 [MAJOR]', lines: 3 }) === 'major', '[major] 표시(대소문자 무관)');
ok(pickLevel({ title: '[patch] 작은 수정', lines: 5000 }) === 'patch', '[patch] 표시는 변경량이 많아도 사소로');
ok(pickLevel({ forced: 'major', title: '[patch]', lines: 1 }) === 'major', '수동 실행에서 고른 단계가 가장 우선');
let bad = false; try { bump('abc', 'patch'); } catch (e) { bad = true; } ok(bad, '버전 모양이 이상하면 멈춤');
console.log(fail ? `\n${fail}개 실패` : '\n모두 통과'); process.exit(fail ? 1 : 0);
