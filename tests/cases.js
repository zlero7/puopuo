// 단계별로 추가하는 테스트 케이스
module.exports = [
  { name: '원작 6×12 뿌요 vs 뿌요', mode: 'vs', my: 'puyo', op: 'puyo', board: 'classic',
    probe: '[COLS, VIS, game.fields[0].grid.length, game.fields[0].grid[0].length, game.fields[0].ox]',
    expect: r => JSON.stringify(r.extra) === '[6,12,13,6,40]' && r.state === 'over' },
  { name: '원작 6×12 뿌요 vs 테트리스', mode: 'vs', my: 'puyo', op: 'tetris', board: 'classic' },
  { name: '원작 6×12 연습', mode: 'solo', my: 'puyo', op: 'puyo', board: 'classic', steps: 6000 },
  { name: 'T스핀 CPU(어려움) 테트리스 vs 테트리스', mode: 'vs', my: 'tetris', op: 'tetris', steps: 40000,
    probe: 'game.fields.map(f => ({ spins: f.doubles, lines: f.lines, b2b: f.b2b }))',
    expect: r => r.extra.reduce((a, f) => a + f.spins, 0) > 0 },
  { name: 'T스핀 CPU 테트리스 연습(끝없이)', mode: 'solo', my: 'tetris', op: 'puyo', solo: 'endless', steps: 30000,
    probe: 'game.fields.map(f => ({ spins: f.doubles, lines: f.lines, tetris: f.chains2 }))',
    expect: r => r.extra[0].spins > 0 },
  { name: '리플레이: 뿌요 vs 뿌요 다시 보기', mode: 'vs', my: 'puyo', op: 'puyo', replay: true, expect: r => r.same },
  { name: '리플레이: 뿌요 vs 테트리스 다시 보기', mode: 'vs', my: 'puyo', op: 'tetris', replay: true, expect: r => r.same },
  { name: '리플레이: 테트리스 vs 테트리스 다시 보기', mode: 'vs', my: 'tetris', op: 'tetris', replay: true, expect: r => r.same },
];
