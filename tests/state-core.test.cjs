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
