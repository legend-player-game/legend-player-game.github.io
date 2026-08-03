'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const STORAGE = require('../storage-core.js');

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}

test('storage checksum is stable and detects changed content', () => {
  assert.equal(STORAGE.checksum('生涯存档'), STORAGE.checksum('生涯存档'));
  assert.notEqual(STORAGE.checksum('生涯存档'), STORAGE.checksum('生涯存档2'));
});

test('storage errors expose actionable categories', () => {
  assert.equal(STORAGE.classifyStorageError({ name: 'QuotaExceededError' }).code, 'quota');
  assert.equal(STORAGE.classifyStorageError({ name: 'SecurityError' }).code, 'blocked');
  assert.equal(STORAGE.classifyStorageError({ name: 'DataError' }).code, 'invalid');
});

test('storage falls back to one compact local copy when IndexedDB is unavailable', async () => {
  const localStorage = memoryStorage();
  const storage = STORAGE.createGameStorage({
    indexedDB: null,
    localStorage,
    parse: JSON.parse,
    fallbackKey: 'test-save'
  });
  const saved = await storage.save({ screen: 'season', season: 20, savedAt: 'now' });
  const loaded = await storage.load();

  assert.equal(saved.storage, 'local-fallback');
  assert.equal(loaded.source, 'local-fallback');
  assert.equal(loaded.state.season, 20);
  assert.ok(localStorage.getItem('test-save'));
});
