'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../roster-data.js');
require('../era-data.js');
require('../data.js');

test('current Celtics age metadata preserves the real age gap', () => {
  const roster = global.GAME_DATA.PLAYERS.BOS;
  const tatum = roster.find(player => player.name === '杰森-塔特姆');
  const white = roster.find(player => player.name === '德里克-怀特');
  assert.equal(tatum.age, 27);
  assert.equal(white.age, 31);
  assert.equal(white.age - tatum.age, 4);
  assert.deepEqual(
    { tatum: tatum.age + 8, white: white.age + 8 },
    { tatum: 35, white: 39 }
  );
});

test('current roster metadata includes rookie years for age evolution', () => {
  const knownPlayers = Object.values(global.GAME_DATA.PLAYERS).flat()
    .filter(player => Number.isFinite(player.age));
  assert.ok(knownPlayers.length >= 140);
  assert.ok(knownPlayers.every(player => Number.isFinite(player.rookieYear)));
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
