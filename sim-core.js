(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SIM_CORE = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const ROTATION_TEMPLATE = [34, 33, 31, 29, 27, 24, 20, 16, 12, 8, 3, 2, 1, 0, 0];

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function nextRandom(seed) {
    let next = (Number(seed) || 0x6d2b79f5) >>> 0;
    next += 0x6d2b79f5;
    let value = next;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    value = ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    return { seed: next >>> 0, value };
  }

  function allocateRotation(roster) {
    const sorted = roster.slice().sort((left, right) => {
      return right.ovr - left.ovr || String(left.id).localeCompare(String(right.id));
    });
    const allocation = {};
    sorted.forEach((player, index) => {
      allocation[player.id] = ROTATION_TEMPLATE[index] || 0;
    });
    let missing = 240 - rotationTotal(allocation);
    let index = 0;
    while (missing > 0 && sorted.length) {
      const player = sorted[index % sorted.length];
      if (allocation[player.id] < 48) {
        allocation[player.id] += 1;
        missing -= 1;
      }
      index += 1;
      if (index > 1000) break;
    }
    return allocation;
  }

  function rotationTotal(allocation) {
    return Object.values(allocation).reduce((sum, minutes) => sum + minutes, 0);
  }

  function normalizeTeamRecords(teamIds, rawWins, lockedRecord) {
    const records = Object.fromEntries(teamIds.map(teamId => {
      const wins = clamp(Math.round(rawWins[teamId] ?? 41), 10, 72);
      return [teamId, { wins, losses: 82 - wins }];
    }));
    if (lockedRecord && records[lockedRecord.teamId]) {
      records[lockedRecord.teamId] = {
        wins: lockedRecord.wins,
        losses: 82 - lockedRecord.wins
      };
    }
    const targetWins = teamIds.length * 41;
    let delta = targetWins - teamIds.reduce((sum, teamId) => sum + records[teamId].wins, 0);
    const adjustable = teamIds.filter(teamId => teamId !== lockedRecord?.teamId);
    let guard = 0;
    while (delta !== 0 && adjustable.length && guard < 10000) {
      const direction = Math.sign(delta);
      const teamId = adjustable[guard % adjustable.length];
      const nextWins = records[teamId].wins + direction;
      if (nextWins >= 10 && nextWins <= 72) {
        records[teamId].wins = nextWins;
        records[teamId].losses = 82 - nextWins;
        delta -= direction;
      }
      guard += 1;
    }
    return records;
  }

  function conferenceSeeds(teams, records) {
    return ['EAST', 'WEST'].reduce((result, conference) => {
      result[conference] = teams
        .filter(team => team.conference === conference)
        .map(team => ({ ...team, ...(records[team.id] || { wins: 0, losses: 82 }) }))
        .sort((left, right) => right.wins - left.wins || left.losses - right.losses || left.id.localeCompare(right.id))
        .map((team, index) => ({ ...team, seed: index + 1 }));
      return result;
    }, {});
  }

  function seriesWinProbability(ownStrength, opponentStrength, round) {
    const difference = ownStrength - opponentStrength;
    const logistic = 1 / (1 + Math.exp(-difference / 7.5));
    const roundPressure = Math.max(0, Number(round) || 0) * 0.008;
    return clamp(logistic - Math.sign(difference) * roundPressure, 0.16, 0.84);
  }

  function auditLeague(teams, players, records) {
    const active = players.filter(player => player.active && player.teamId);
    const ids = new Set();
    const duplicateIds = [];
    active.forEach(player => {
      if (ids.has(player.id)) duplicateIds.push(player.id);
      ids.add(player.id);
    });
    const rosterSizes = Object.fromEntries(teams.map(team => [team.id, active.filter(player => player.teamId === team.id).length]));
    const totalWins = records ? Object.values(records).reduce((sum, record) => sum + record.wins, 0) : null;
    const totalLosses = records ? Object.values(records).reduce((sum, record) => sum + record.losses, 0) : null;
    return {
      duplicateIds,
      rosterSizes,
      totalWins,
      totalLosses,
      recordsBalanced: records ? totalWins === totalLosses : true
    };
  }

  return {
    ROTATION_TEMPLATE,
    nextRandom,
    allocateRotation,
    rotationTotal,
    normalizeTeamRecords,
    conferenceSeeds,
    seriesWinProbability,
    auditLeague
  };
}));
