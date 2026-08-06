'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const SIM = require('../sim-core.js');

const ATTRIBUTE_KEYS = ['threePT', 'MID', 'FIN', 'DNK', 'HAN', 'PAS', 'PDEF', 'IDEF', 'BLK', 'REB', 'ATH', 'STR', 'CLU'];

function createRoster(teamId, teamIndex) {
  return Array.from({ length: 15 }, (_, index) => {
    const base = Math.max(58, 91 - index + (teamIndex % 5) - 2);
    return {
      id: `${teamId}-${index}`,
      teamId,
      name: `${teamId}球员${index}`,
      pos: ['PG', 'SG', 'SF', 'PF', 'C'][index % 5],
      ovr: base,
      shotUsage: index === 0 ? 31 : Math.max(10, 24 - index),
      creationLoad: index === 1 ? 29 : Math.max(10, 22 - index),
      attrs: Object.fromEntries(ATTRIBUTE_KEYS.map((key, attrIndex) => [key, Math.max(50, Math.min(97, base + (attrIndex + index) % 7 - 3))]))
    };
  });
}

test('full league season preserves schedule, records and contribution invariants within budget', () => {
  const teams = Array.from({ length: 30 }, (_, index) => ({ id: `T${index}`, conference: index < 15 ? 'EAST' : 'WEST' }));
  const rosters = Object.fromEntries(teams.map((team, index) => [team.id, createRoster(team.id, index)]));
  const records = Object.fromEntries(teams.map(team => [team.id, { wins: 0, losses: 0 }]));
  const contributions = Object.fromEntries(teams.map(team => [team.id, 0]));
  const schedule = SIM.generateLeagueSchedule(teams, 8086);
  let seed = 20260806;
  const started = performance.now();

  schedule.forEach(round => round.games.forEach(matchup => {
    const result = SIM.simulateLeagueGame({
      homeTeamId: matchup.home,
      awayTeamId: matchup.away,
      homePlayers: rosters[matchup.home],
      awayPlayers: rosters[matchup.away],
      seasonYear: 2026,
      seed
    });
    seed = result.seed;
    const winner = result.homeWon ? matchup.home : matchup.away;
    const loser = result.homeWon ? matchup.away : matchup.home;
    records[winner].wins += 1;
    records[loser].losses += 1;
    contributions[winner] += (result.homeWon ? result.homePlayers : result.awayPlayers)
      .reduce((sum, player) => sum + player.winContribution, 0);
  }));

  const elapsed = performance.now() - started;
  assert.ok(Object.values(records).every(record => record.wins + record.losses === 82));
  assert.equal(Object.values(records).reduce((sum, record) => sum + record.wins, 0), 1230);
  assert.equal(Object.values(records).reduce((sum, record) => sum + record.losses, 0), 1230);
  teams.forEach(team => assert.ok(Math.abs(contributions[team.id] - records[team.id].wins) < 0.001));
  assert.ok(elapsed < 5000, `full league season exceeded budget: ${elapsed.toFixed(1)}ms`);
});
