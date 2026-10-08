// 단계별로 추가하는 테스트 케이스
module.exports = [
  { name: '원작 6×12 뿌요 vs 뿌요', mode: 'vs', my: 'puyo', op: 'puyo', board: 'classic',
    probe: '[COLS, VIS, game.fields[0].grid.length, game.fields[0].grid[0].length, game.fields[0].ox]',
    expect: r => JSON.stringify(r.extra) === '[6,12,13,6,40]' && r.state === 'over' },
  { name: '원작 6×12 뿌요 vs 테트리스', mode: 'vs', my: 'puyo', op: 'tetris', board: 'classic' },
  { name: '원작 6×12 연습', mode: 'solo', my: 'puyo', op: 'puyo', board: 'classic', steps: 6000 },
];
