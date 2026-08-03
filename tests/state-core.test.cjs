'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const STATE = require('../state-core.js');

test('save migration removes hidden league rating differences', () => {
  const migrated = STATE.migrateSave({
    schemaVersion: 5,
    screen: 'season',
    career: { league: { players: [{ id: 'p1', ovr: 91, simOvr: 89, sourceOvr: 92 }] } },
    season: { stage: 'regular', isSimulating: true, seriesSimulation: { wins: 2 } }
  }, 6);
  assert.equal(migrated.schemaVersion, 6);
  assert.equal(migrated.career.league.players[0].ovr, 91);
  assert.equal(migrated.career.league.players[0].simOvr, 91);
  assert.equal(migrated.season.isSimulating, false);
  assert.equal(migrated.season.seriesSimulation, null);
});

test('save snapshot is serializable and trims selected player data', () => {
  const snapshot = STATE.createSaveSnapshot({
    screen: 'build',
    sessionId: 'session-1',
    selectedPlayer: { name: '测试球员', teamId: 'BOS', threePT: 99 },
    attrs: {}
  }, 6, '2026-07-30T00:00:00.000Z');
  assert.deepEqual(snapshot.selectedPlayer, { name: '测试球员', teamId: 'BOS' });
  assert.equal(snapshot.savedAt, '2026-07-30T00:00:00.000Z');
  assert.doesNotThrow(() => JSON.stringify(snapshot));
});

test('stored save selection falls back to backup when primary is corrupt', () => {
  const result = STATE.selectStoredSave([
    { source: 'current', value: '{broken' },
    { source: 'backup', value: JSON.stringify({ screen: 'season', sessionId: 'safe' }) }
  ], 6);
  assert.equal(result.state.sessionId, 'safe');
  assert.equal(result.source, 'backup');
  assert.equal(result.recovered, true);
});

test('fresh navigation is not progress but a started session is', () => {
  assert.equal(STATE.hasMeaningfulProgress({ screen: 'era', sessionId: null }), false);
  assert.equal(STATE.hasMeaningfulProgress({ screen: 'position', sessionId: 'new-session' }), true);
});

test('season state machine rejects skips and allows the intended loop', () => {
  assert.equal(STATE.canTransitionSeason('regular', 'playoffs'), false);
  assert.equal(STATE.canTransitionSeason('regular', 'awards'), true);
  assert.equal(STATE.canTransitionSeason('awards', 'playoffs'), true);
  assert.equal(STATE.canTransitionSeason('playoffs', 'champion'), true);
  assert.equal(STATE.canTransitionSeason('champion', 'regular'), false);
});

test('award records are idempotent by season number', () => {
  const first = STATE.upsertSeasonRecord([], { seasonNumber: 3, mvp: '甲' });
  const second = STATE.upsertSeasonRecord(first, { seasonNumber: 3, mvp: '乙' });
  assert.deepEqual(second, [{ seasonNumber: 3, mvp: '乙' }]);
});

test('save compaction does not mutate source and preserves the user career history', () => {
  const source = {
    candidatePlayers: [{ id: 'candidate-1' }],
    seenCandidatePlayers: ['candidate-1'],
    career: {
      seasonHistory: Array.from({ length: 20 }, (_, index) => ({ seasonNumber: index + 1 })),
      league: {
        players: [
          {
            id: 'user',
            isUser: true,
            active: true,
            seasonHistory: Array.from({ length: 20 }, (_, index) => ({ seasonNumber: index + 1 }))
          },
          {
            id: 'active',
            active: true,
            ageSource: 'estimated',
            sourceOvr: 80,
            seasonHistory: Array.from({ length: 12 }, (_, index) => ({ seasonNumber: index + 1 })),
            injuryHistory: Array.from({ length: 9 }, (_, index) => ({ seasonNumber: index + 1 }))
          },
          { id: 'retired', active: false, seasonHistory: [{ seasonNumber: 1 }] }
        ]
      }
    }
  };

  const snapshot = STATE.createSaveSnapshot(source, 7, '2026-08-03T00:00:00.000Z');

  assert.equal(source.candidatePlayers.length, 1);
  assert.equal(source.career.league.players.length, 3);
  assert.deepEqual(snapshot.candidatePlayers, []);
  assert.deepEqual(snapshot.seenCandidatePlayers, []);
  assert.equal(snapshot.career.seasonHistory.length, 20);
  assert.equal(snapshot.career.league.players.some(player => player.id === 'retired'), false);
  assert.equal(snapshot.career.league.players.find(player => player.id === 'user').seasonHistory.length, 8);
  assert.equal(snapshot.career.league.players.find(player => player.id === 'active').seasonHistory.length, 8);
  assert.equal(snapshot.career.league.players.find(player => player.id === 'active').injuryHistory.length, 6);
  assert.equal('ageSource' in snapshot.career.league.players.find(player => player.id === 'active'), false);
});

test('serializedBytes measures UTF-8 content and compaction substantially reduces a large save', () => {
  assert.equal(STATE.serializedBytes('中文'), 6);
  const history = Array.from({ length: 20 }, (_, season) => ({
    season,
    stats: { pts: 20 + season, reb: 8, ast: 7 },
    payload: 'x'.repeat(240)
  }));
  const state = {
    candidatePlayers: Array.from({ length: 50 }, (_, id) => ({ id, payload: 'x'.repeat(500) })),
    seenCandidatePlayers: Array.from({ length: 200 }, (_, id) => `player-${id}`),
    career: {
      seasonHistory: history,
      league: {
        players: Array.from({ length: 300 }, (_, id) => ({
          id,
          active: id < 150,
          seasonHistory: history,
          injuryHistory: history,
          projected: { payload: 'x'.repeat(300) }
        }))
      }
    }
  };
  const before = STATE.serializedBytes(state);
  const snapshot = STATE.createSaveSnapshot(state, 7);
  const after = STATE.serializedBytes(snapshot);

  assert.ok(after < before * 0.45, `expected compact snapshot below 45%, got ${(after / before * 100).toFixed(1)}%`);
});
