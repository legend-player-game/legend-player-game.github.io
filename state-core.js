(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.GAME_STATE_CORE = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const SEASON_TRANSITIONS = {
    regular: new Set(['awards']),
    awards: new Set(['playin', 'playoffs', 'ended']),
    playin: new Set(['playin', 'playoffs', 'ended']),
    playoffs: new Set(['playoffs', 'ended', 'champion']),
    ended: new Set(['career-complete']),
    champion: new Set(['career-complete']),
    'career-complete': new Set()
  };

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function finiteRating(...values) {
    return values.find(value => Number.isFinite(Number(value)));
  }

  function normalizePlayerRating(player) {
    if (!player || typeof player !== 'object') return player;
    const rating = Number(finiteRating(player.ovr, player.simOvr, player.sourceOvr, 60));
    player.ovr = rating;
    // Keep the legacy field for old UI code, but never allow a second simulation value.
    player.simOvr = rating;
    return player;
  }

  function normalizeLeagueRatings(save) {
    const players = save?.career?.league?.players;
    if (Array.isArray(players)) players.forEach(normalizePlayerRating);
    return save;
  }

  function compactLeaguePlayer(player) {
    const compact = { ...player };
    if (Array.isArray(compact.seasonHistory)) compact.seasonHistory = compact.seasonHistory.slice(-8);
    if (Array.isArray(compact.injuryHistory)) compact.injuryHistory = compact.injuryHistory.slice(-6);
    delete compact.ageSource;
    delete compact.sourceOvr;
    delete compact.projected;
    return compact;
  }

  function compactSave(save) {
    if (!save || typeof save !== 'object') return save;
    delete save.lastSaveStatus;
    if (save.career) {
      save.candidatePlayers = [];
      save.seenCandidatePlayers = [];
      save.selectedPlayer = null;
      const league = save.career.league;
      if (league && Array.isArray(league.players)) {
        league.players = league.players
          .filter(player => player?.active || player?.isUser)
          .map(compactLeaguePlayer);
        if (Array.isArray(league.transactionHistory)) league.transactionHistory = league.transactionHistory.slice(-120);
        if (Array.isArray(league.awardHistory)) league.awardHistory = league.awardHistory.slice(-24);
      }
      if (Array.isArray(save.career.recentDepartures)) save.career.recentDepartures = save.career.recentDepartures.slice(-8);
      if (Array.isArray(save.career.tradeCounterpartIds)) save.career.tradeCounterpartIds = save.career.tradeCounterpartIds.slice(-20);
    }
    return save;
  }

  function migrateSave(rawSave, targetVersion) {
    if (!rawSave || typeof rawSave !== 'object') return null;
    const save = clone(rawSave);
    save.schemaVersion = targetVersion;
    save.sessionId = save.sessionId || `legacy-${save.eraKey || 'current'}-${save.career?.startYear || 0}`;
    if (save.season) {
      save.season.isSimulating = false;
      save.season.playInSimulation = null;
      save.season.seriesSimulation = null;
    }
    normalizeLeagueRatings(save);
    return save;
  }

  function createSaveSnapshot(state, targetVersion, savedAt) {
    const snapshot = compactSave(migrateSave(state, targetVersion));
    if (!snapshot) return null;
    snapshot.savedAt = savedAt || new Date().toISOString();
    snapshot.selectedPlayer = state.selectedPlayer
      ? { name: state.selectedPlayer.name, teamId: state.selectedPlayer.teamId }
      : null;
    return snapshot;
  }

  function parseSave(rawValue, targetVersion) {
    if (!rawValue) return null;
    try {
      return migrateSave(JSON.parse(rawValue), targetVersion);
    } catch (error) {
      return null;
    }
  }

  function selectStoredSave(candidates, targetVersion) {
    for (const candidate of candidates) {
      const state = parseSave(candidate.value, targetVersion);
      if (state) return { state, source: candidate.source, recovered: candidate.source === 'backup' };
    }
    return { state: null, source: null, recovered: false };
  }

  function hasMeaningfulProgress(save) {
    if (!save || typeof save !== 'object') return false;
    return Boolean(
      save.sessionId
      || save.position
      || save.finalOVR
      || save.career
      || ['build', 'reveal', 'career', 'season'].includes(save.screen)
    );
  }

  function canTransitionSeason(currentStage, nextStage) {
    return Boolean(SEASON_TRANSITIONS[currentStage]?.has(nextStage));
  }

  function upsertSeasonRecord(records, entry) {
    const list = Array.isArray(records) ? records.slice() : [];
    const index = list.findIndex(item => item?.seasonNumber === entry?.seasonNumber);
    if (index >= 0) list[index] = entry;
    else list.push(entry);
    return list;
  }

  function serializedBytes(value) {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(serialized).length;
    return unescape(encodeURIComponent(serialized)).length;
  }

  return {
    canTransitionSeason,
    compactSave,
    createSaveSnapshot,
    hasMeaningfulProgress,
    migrateSave,
    normalizePlayerRating,
    parseSave,
    selectStoredSave,
    serializedBytes,
    upsertSeasonRecord
  };
}));
