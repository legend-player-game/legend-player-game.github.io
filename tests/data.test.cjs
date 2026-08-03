'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../roster-data.js');
require('../era-data.js');
require('../team-history.js');
require('../data.js');

test('current Celtics age metadata preserves the real age gap', () => {
  const roster = global.GAME_DATA.PLAYERS.BOS;
  const tatum = roster.find(player => player.name === '杰森-塔特姆');
  const white = roster.find(player => player.name === '德里克-怀特');
  assert.equal(tatum.age, 28);
  assert.equal(white.age, 32);
  assert.equal(white.age - tatum.age, 4);
  assert.deepEqual(
    { tatum: tatum.age + 8, white: white.age + 8 },
    { tatum: 36, white: 40 }
  );
});

test('current roster metadata includes rookie years for age evolution', () => {
  const players = Object.values(global.GAME_DATA.PLAYERS).flat();
  assert.equal(players.length, 450);
  assert.ok(players.every(player => Number.isFinite(player.age)));
  assert.ok(players.every(player => Number.isFinite(player.rookieYear)));
  assert.ok(players.every(player => ['verified', 'draft-class', 'estimated'].includes(player.ageSource)));
});

test('current roster timeline matches its 2026 capture date', () => {
  const era = global.GAME_DATA.getEra('current');
  assert.equal(era.startYear, 2026);
  assert.equal(era.seasonLabel, '2026-27');
});

test('2009 era ratings preserve the championship Lakers hierarchy', () => {
  global.GAME_DATA.setEra('2009');
  const lakers = global.GAME_DATA.PLAYERS.LAL;
  const kobe = lakers.find(player => player.name === '科比-布莱恩特');
  const gasol = lakers.find(player => player.name === '保罗-加索尔');
  assert.equal(kobe.ovr, 97);
  assert.equal(gasol.ovr, 91);
  assert.ok(kobe.ovr > gasol.ovr);
  global.GAME_DATA.setEra('current');
});

test('era calibration corrects obvious star and role-player inversions', () => {
  global.GAME_DATA.setEra('2009');
  const players2009 = Object.values(global.GAME_DATA.PLAYERS).flat();
  const rating2009 = name => players2009.find(player => player.name === name)?.ovr;
  assert.ok(rating2009('凯文-加内特') > rating2009('约什-史密斯'));
  assert.ok(rating2009('卡梅隆-安东尼') > rating2009('内内'));
  global.GAME_DATA.setEra('2003');
  const players2003 = Object.values(global.GAME_DATA.PLAYERS).flat();
  const rating2003 = name => players2003.find(player => player.name === name)?.ovr;
  assert.equal(rating2003('阿伦-艾弗森'), 94);
  assert.ok(rating2003('科比-布莱恩特') > rating2003('唐耶尔-马歇尔'));
  assert.ok(rating2003('保罗-皮尔斯') > rating2003('布莱恩-卡迪纳尔'));
  global.GAME_DATA.setEra('current');
});

test('era snapshots do not inherit current-day star attributes', () => {
  global.GAME_DATA.setEra('2009');
  const players2009 = Object.values(global.GAME_DATA.PLAYERS).flat();
  const curry = players2009.find(player => player.name === '斯蒂芬-库里');
  const lebron2009 = players2009.find(player => player.name === '勒布朗-詹姆斯');
  assert.equal(curry.threePT, 91);
  assert.ok(curry.HAN < 90);
  assert.equal(lebron2009.threePT, 79);

  global.GAME_DATA.setEra('2003');
  const players2003 = Object.values(global.GAME_DATA.PLAYERS).flat();
  const rookieLebron = players2003.find(player => player.name === '勒布朗-詹姆斯');
  assert.equal(rookieLebron.threePT, 68);
  assert.ok(rookieLebron.ATH >= 95);
  global.GAME_DATA.setEra('current');
});

test('generated snapshots preserve realistic specialist differences', () => {
  const curry = global.GAME_DATA.createPlayerSnapshot({ name: '斯蒂芬-库里', pos: 'PG', archetype: 'sniper', ovr: 95, potential: 90, eraKey: 'current' });
  const yang = global.GAME_DATA.createPlayerSnapshot({ name: '杨瀚森', pos: 'C', archetype: 'pointbig', ovr: 72, potential: 86, eraKey: 'current' });
  assert.ok(curry.threePT > yang.threePT + 30);
  assert.ok(yang.REB > curry.REB + 20);
  assert.ok(yang.BLK > curry.BLK + 25);
});

test('public and simulated OVR use one value in every era', () => {
  ['current', '2003', '2009'].forEach(eraKey => {
    global.GAME_DATA.setEra(eraKey);
    const players = Object.values(global.GAME_DATA.PLAYERS).flat();
    assert.ok(players.length > 400);
    assert.ok(players.every(player => player.ovr === player.simOvr));
  });
  global.GAME_DATA.setEra('current');
});

test('current-era 99 ratings are rare and limited to audited signature skills', () => {
  global.GAME_DATA.setEra('current');
  const ratings = Object.values(global.GAME_DATA.PLAYERS).flat().flatMap(player => (
    global.GAME_DATA.ATTRS
      .filter(([key]) => key !== 'POT' && player[key] === 99)
      .map(([key]) => `${player.name}:${key}`)
  ));
  assert.deepEqual(ratings.sort(), [
    '尼古拉-约基奇:PAS',
    '斯蒂芬-库里:threePT',
    '扬尼斯-阿德托昆博:DNK',
    '扬尼斯-阿德托昆博:FIN',
    '维克托·文班亚马:BLK'
  ].sort());
});

test('all 30 teams include championship history and a five-player franchise ranking', () => {
  const { TEAMS, TEAM_HISTORY, getTeamHistory } = global.GAME_DATA;
  assert.equal(Object.keys(TEAM_HISTORY).length, 30);
  TEAMS.forEach(team => {
    const history = getTeamHistory(team.id);
    assert.equal(history.legends.length, 5, `${team.id} should have five franchise legends`);
    assert.deepEqual(history.legends.map(legend => legend.rank), [1, 2, 3, 4, 5]);
    assert.ok(history.legends.every(legend => legend.name && legend.score >= 200));
  });
  assert.equal(getTeamHistory('BOS').championshipYears.length, 18);
  assert.equal(getTeamHistory('LAL').championshipYears.length, 17);
  assert.deepEqual(getTeamHistory('CHI').championshipYears, [1991, 1992, 1993, 1996, 1997, 1998]);
  assert.equal(getTeamHistory('SAS').legends[0].name, '蒂姆-邓肯');
  assert.equal(getTeamHistory('NJN').legends[0].name, '杰森-基德');
  assert.equal(getTeamHistory('NOH').legends[0].name, '克里斯-保罗');
  assert.equal(getTeamHistory('SEA', 2003).championshipYears.length, 1);
  assert.deepEqual(getTeamHistory('OKC', 2024).championshipYears, [1979]);
});
