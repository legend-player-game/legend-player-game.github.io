(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.GAME_STORAGE_CORE = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function checksum(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function classifyStorageError(error) {
    const name = error?.name || '';
    if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      return { code: 'quota', message: '存储空间不足，请清理浏览器空间后重试' };
    }
    if (name === 'SecurityError' || name === 'NotAllowedError') {
      return { code: 'blocked', message: '浏览器禁止本地存储，请关闭无痕模式或允许站点存储' };
    }
    if (name === 'DataError' || name === 'SyntaxError') {
      return { code: 'invalid', message: '存档校验失败，已保留上一份有效进度' };
    }
    return { code: 'unknown', message: '存档失败，已保留上一份有效进度' };
  }

  function createGameStorage(options = {}) {
    const databaseName = options.databaseName || 'build-a-player-career';
    const storeName = options.storeName || 'saves';
    const pointerKey = options.pointerKey || 'build-a-player-save-pointer-v8';
    const fallbackKey = options.fallbackKey || 'build-a-player-save-fallback-v8';
    const backupFallbackKey = `${fallbackKey}-backup`;
    const parse = options.parse || (value => JSON.parse(value));
    const local = options.localStorage || (typeof localStorage !== 'undefined' ? localStorage : null);
    const idb = options.indexedDB || (typeof indexedDB !== 'undefined' ? indexedDB : null);
    let databasePromise = null;

    function openDatabase() {
      if (!idb) return Promise.reject(Object.assign(new Error('IndexedDB unavailable'), { name: 'SecurityError' }));
      if (databasePromise) return databasePromise;
      databasePromise = new Promise((resolve, reject) => {
        const request = idb.open(databaseName, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, { keyPath: 'key' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
        request.onblocked = () => reject(Object.assign(new Error('IndexedDB blocked'), { name: 'SecurityError' }));
      });
      return databasePromise;
    }

    async function put(record) {
      const database = await openDatabase();
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readwrite');
        transaction.objectStore(storeName).put(record);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error('IndexedDB write failed'));
        transaction.onabort = () => reject(transaction.error || new Error('IndexedDB write aborted'));
      });
    }

    async function get(key) {
      const database = await openDatabase();
      return new Promise((resolve, reject) => {
        const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('IndexedDB read failed'));
      });
    }

    function validRecord(record) {
      if (!record?.serialized || checksum(record.serialized) !== record.checksum) return null;
      try {
        return parse(record.serialized);
      } catch (error) {
        return null;
      }
    }

    async function loadSlot(key) {
      const record = await get(key);
      return { state: validRecord(record), record };
    }

    async function load() {
      try {
        const pointer = local?.getItem(pointerKey) === 'B' ? 'B' : 'A';
        const primary = await loadSlot(pointer);
        if (primary.state) return { state: primary.state, source: `indexeddb-${pointer}`, recovered: false };
        const secondaryKey = pointer === 'A' ? 'B' : 'A';
        const secondary = await loadSlot(secondaryKey);
        if (secondary.state) return { state: secondary.state, source: `indexeddb-${secondaryKey}`, recovered: true };
      } catch (error) {
        // Fall through to the single compact local copy.
      }
      try {
        const serialized = local?.getItem(fallbackKey);
        return { state: serialized ? parse(serialized) : null, source: serialized ? 'local-fallback' : null, recovered: false };
      } catch (error) {
        return { state: null, source: null, recovered: false, error: classifyStorageError(error) };
      }
    }

    async function save(snapshot) {
      const serialized = JSON.stringify(snapshot);
      const savedAt = snapshot.savedAt || new Date().toISOString();
      try {
        const current = local?.getItem(pointerKey) === 'B' ? 'B' : 'A';
        const target = current === 'A' ? 'B' : 'A';
        const record = { key: target, serialized, checksum: checksum(serialized), savedAt };
        await put(record);
        const verified = await loadSlot(target);
        if (!verified.state) throw Object.assign(new Error('Save verification failed'), { name: 'DataError' });
        local?.setItem(pointerKey, target);
        local?.removeItem(fallbackKey);
        return { storage: 'indexeddb', bytes: new TextEncoder().encode(serialized).length, savedAt };
      } catch (indexedDbError) {
        try {
          local?.setItem(fallbackKey, serialized);
          if (!parse(local.getItem(fallbackKey))) throw Object.assign(new Error('Fallback verification failed'), { name: 'DataError' });
          return { storage: 'local-fallback', bytes: new TextEncoder().encode(serialized).length, savedAt, fallbackReason: classifyStorageError(indexedDbError).code };
        } catch (fallbackError) {
          const classified = classifyStorageError(fallbackError);
          const wrapped = Object.assign(new Error(classified.message), fallbackError, { storageCode: classified.code });
          throw wrapped;
        }
      }
    }

    async function loadBackup() {
      try {
        const slot = await loadSlot('backup');
        if (slot.state) return slot.state;
      } catch (error) {
        // Fall through to local fallback.
      }
      try {
        const serialized = local?.getItem(backupFallbackKey);
        return serialized ? parse(serialized) : null;
      } catch (error) {
        return null;
      }
    }

    async function saveBackup(snapshot) {
      const serialized = JSON.stringify(snapshot);
      const record = { key: 'backup', serialized, checksum: checksum(serialized), savedAt: snapshot.savedAt || new Date().toISOString() };
      try {
        await put(record);
      } catch (error) {
        local?.setItem(backupFallbackKey, serialized);
      }
    }

    return { load, loadBackup, save, saveBackup };
  }

  return { checksum, classifyStorageError, createGameStorage };
}));
