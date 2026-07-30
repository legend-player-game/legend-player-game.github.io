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
