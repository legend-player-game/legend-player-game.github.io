'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const SIM = require('../sim-core.js');

test('seeded random stream is reproducible', () => {
  let left = 123456;
  let right = 123456;
  for (let index = 0; index < 100; index += 1) {
    const leftRoll = SIM.nextRandom(left);
    const rightRoll = SIM.nextRandom(right);
    assert.equal(leftRoll.value, rightRoll.value);
    left = leftRoll.seed;
    right = rightRoll.seed;
  }
});

test('fifteen-player rotation conserves 240 minutes', () => {
  const roster = Array.from({ length: 15 }, (_, index) => ({ id: `p${index}`, ovr: 90 - index, isUser: false }));
  const allocation = SIM.allocateRotation(roster);
  assert.equal(SIM.rotationTotal(allocation), 240);
});

test('short-handed rotation still conserves 240 minutes', () => {
  const roster = Array.from({ length: 7 }, (_, index) => ({ id: `short${index}`, ovr: 82 - index }));
  const allocation = SIM.allocateRotation(roster);
  assert.equal(SIM.rotationTotal(allocation), 240);
  assert.ok(Object.values(allocation).every(minutes => minutes <= 48));
});

test('team records conserve league wins and losses', () => {
  const teams = Array.from({ length: 30 }, (_, index) => `T${index}`);
  const rawWins = Object.fromEntries(teams.map((teamId, index) => [teamId, 25 + index]));
  const records = SIM.normalizeTeamRecords(teams, rawWins, { teamId: 'T0', wins: 52 });
  const wins = Object.values(records).reduce((sum, record) => sum + record.wins, 0);
  const losses = Object.values(records).reduce((sum, record) => sum + record.losses, 0);
  assert.equal(records.T0.wins, 52);
  assert.equal(wins, losses);
});

test('odd-sized historical league records remain balanced', () => {
  const teams = Array.from({ length: 29 }, (_, index) => `H${index}`);
  const rawWins = Object.fromEntries(teams.map((teamId, index) => [teamId, 67 - index]));
  const records = SIM.normalizeTeamRecords(teams, rawWins, { teamId: 'H4', wins: 48 });
  const wins = Object.values(records).reduce((sum, record) => sum + record.wins, 0);
  const losses = Object.values(records).reduce((sum, record) => sum + record.losses, 0);
  assert.equal(wins, losses);
});

test('conference seeds never mix east and west teams', () => {
  const teams = Array.from({ length: 30 }, (_, index) => ({
    id: `C${index}`,
    conference: index < 15 ? 'EAST' : 'WEST'
  }));
  const records = Object.fromEntries(teams.map((team, index) => [team.id, { wins: 30 + index % 20, losses: 52 - index % 20 }]));
  const standings = SIM.conferenceSeeds(teams, records);
  assert.equal(standings.EAST.length, 15);
  assert.equal(standings.WEST.length, 15);
  assert.ok(standings.EAST.every(team => team.conference === 'EAST'));
  assert.ok(standings.WEST.every(team => team.conference === 'WEST'));
});

test('league audit reports roster and record invariants', () => {
  const teams = [{ id: 'A' }, { id: 'B' }];
  const players = Array.from({ length: 30 }, (_, index) => ({ id: `p${index}`, teamId: index < 15 ? 'A' : 'B', active: true }));
  const records = { A: { wins: 50, losses: 32 }, B: { wins: 32, losses: 50 } };
  const audit = SIM.auditLeague(teams, players, records);
  assert.deepEqual(audit.rosterSizes, { A: 15, B: 15 });
  assert.equal(audit.recordsBalanced, true);
  assert.deepEqual(audit.duplicateIds, []);
});

test('series probability responds to both teams', () => {
  assert.ok(SIM.seriesWinProbability(92, 80, 0) > 0.7);
  assert.ok(SIM.seriesWinProbability(80, 92, 0) < 0.3);
  assert.equal(SIM.seriesWinProbability(86, 86, 0), 0.5);
});

test('trade value rewards youth and penalizes aging contracts', () => {
  const young = SIM.tradeValue({ ovr: 86, age: 22, potential: 92, contractYears: 4 });
  const veteran = SIM.tradeValue({ ovr: 86, age: 35, potential: 70, contractYears: 3 });
  assert.ok(young > veteran + 15);
  assert.ok(SIM.tradeValue({ ovr: 94, age: 28, potential: 80, contractYears: 2 }) > young);
});

function careerFixture(overrides = {}) {
  const history = Array.from({ length: 20 }, (_, index) => ({
    seasonNumber: index + 1,
    age: 18 + index,
    ovr: 84 + Math.min(index, 8) - Math.max(0, index - 13) * 2,
    games: 82,
    wins: 44,
    champion: false,
    postseason: '首轮止步'
  }));
  return {
    history,
    totals: { pts: 23358, reb: 14920, ast: 4964 },
    awardCounts: { '最佳阵容': 7 },
    championships: 0,
    peakOVR: 97,
    totalGames: 1640,
    ...overrides
  };
}

test('twenty seasons alone do not max production or longevity', () => {
  const legacy = SIM.calculateCareerLegacy(careerFixture());
  assert.ok(legacy.dimensions['生涯产量'] < 85);
  assert.ok(legacy.dimensions['持久稳定'] < 100);
  assert.ok(legacy.score < 68);
  assert.equal(/历史前/.test(legacy.tier.rank), false);
});

test('historical tiers require awards and winning gates', () => {
  const history = Array.from({ length: 20 }, (_, index) => ({
    seasonNumber: index + 1,
    age: 18 + index,
    ovr: index < 15 ? 97 : 92,
    games: 80,
    wins: 58,
    champion: index < 4,
    postseason: index < 4 ? '总冠军' : '分区决赛止步'
  }));
  const legacy = SIM.calculateCareerLegacy(careerFixture({
    history,
    totals: { pts: 39000, reb: 12500, ast: 10500 },
    awardCounts: { '最有价值球员': 4, '最佳阵容': 15, '常规赛得分王': 5 },
    championships: 4,
    peakOVR: 99,
    totalGames: 1600
  }));
  assert.ok(legacy.score >= 89);
  assert.match(legacy.tier.rank, /历史前/);
});
