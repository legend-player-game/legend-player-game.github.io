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

  function ratingFromMilestones(value, milestones) {
    const amount = Math.max(0, Number(value) || 0);
    for (let index = 1; index < milestones.length; index += 1) {
      const [upperValue, upperScore] = milestones[index];
      const [lowerValue, lowerScore] = milestones[index - 1];
      if (amount <= upperValue) {
        const progress = (amount - lowerValue) / Math.max(1, upperValue - lowerValue);
        return lowerScore + (upperScore - lowerScore) * clamp(progress, 0, 1);
      }
    }
    return milestones[milestones.length - 1][1];
  }

  function tradeValue(player) {
    const ovr = Number(player?.ovr) || 60;
    const age = Number(player?.age) || 27;
    const potential = Number(player?.potential) || 70;
    const contractYears = clamp(Number(player?.contractYears) || 1, 1, 5);
    const production = Math.max(0, ovr - 60) * 2.25 + Math.pow(Math.max(0, ovr - 88), 2) * 0.55;
    const upside = age <= 25 ? Math.max(0, potential - 60) * (26 - age) * 0.045 : 0;
    const ageAdjustment = age <= 23 ? (24 - age) * 1.8 : -Math.max(0, age - 30) * 2.35;
    const control = age <= 30 ? contractYears * 1.15 : -Math.max(0, contractYears - 1) * 0.8;
    return Math.round(Math.max(1, production + upside + ageAdjustment + control) * 10) / 10;
  }

  function calculateCareerLegacy(career) {
    const history = Array.isArray(career?.history) ? career.history : [];
    const totals = career?.totals || {};
    const awards = career?.awardCounts || {};
    const mvp = awards['最有价值球员'] || 0;
    const dpoy = awards['最佳防守球员'] || 0;
    const allNba = awards['最佳阵容'] || 0;
    const scoringTitles = awards['常规赛得分王'] || 0;
    const rookieAwards = awards['年度最佳新秀'] || 0;
    const championships = career?.championships || 0;
    const peakOvr = Number(career?.peakOVR) || 60;
    const totalGames = Number(career?.totalGames) || 0;
    const seasonCount = Math.max(1, history.length);
    const topFiveOvr = history.slice().sort((left, right) => right.ovr - left.ovr).slice(0, 5)
      .reduce((sum, season) => sum + season.ovr, 0) / Math.max(1, Math.min(5, history.length));
    const peakRating = ratingFromMilestones(peakOvr, [[0, 0], [75, 10], [80, 25], [85, 45], [90, 65], [95, 82], [99, 94]]);
    const topFiveRating = ratingFromMilestones(topFiveOvr, [[0, 0], [75, 8], [80, 22], [85, 42], [90, 63], [95, 80], [99, 92]]);
    const peakDominance = clamp(Math.round(peakRating * 0.72 + topFiveRating * 0.18 + Math.min(10, mvp * 4 + scoringTitles * 1.5)), 0, 100);
    const personalHonors = clamp(Math.round(mvp * 22 + dpoy * 14 + allNba * 7 + scoringTitles * 5 + rookieAwards * 2), 0, 100);
    const finalsAppearances = history.filter(season => season.champion || String(season.postseason).includes('总决赛')).length;
    const deepRuns = history.filter(season => String(season.postseason).includes('分区决赛')).length;
    const winningResume = clamp(Math.round(championships * 25 + Math.max(0, finalsAppearances - championships) * 8 + deepRuns * 3 + history.filter(season => season.wins >= 50).length * 1.5), 0, 100);
    const productionRatings = [
      ratingFromMilestones(totals.pts, [[0, 0], [10000, 25], [20000, 55], [30000, 80], [40000, 100]]),
      ratingFromMilestones(totals.reb, [[0, 0], [5000, 25], [10000, 55], [15000, 78], [20000, 100]]),
      ratingFromMilestones(totals.ast, [[0, 0], [3000, 25], [7000, 55], [10000, 78], [14000, 100]])
    ].sort((left, right) => right - left);
    const careerProduction = Math.round(productionRatings[0] * 0.55 + productionRatings[1] * 0.3 + productionRatings[2] * 0.15);
    const qualityUnits = history.reduce((sum, season) => (
      sum + (Number(season.games) || 0) / 82 * clamp(((Number(season.ovr) || 60) - 72) / 23, 0, 1)
    ), 0);
    const qualityLongevity = clamp(qualityUnits / 15 * 70, 0, 70);
    const availability = clamp(totalGames / (seasonCount * 82), 0, 1) * 18;
    const latePrime = Math.min(12, history.filter(season => season.age >= 33 && season.ovr >= 85 && season.games >= 58).length * 2);
    const longevity = clamp(Math.round(qualityLongevity + availability + latePrime), 0, 100);
    const dimensions = {
      '巅峰统治': peakDominance,
      '个人荣誉': personalHonors,
      '赢球履历': winningResume,
      '生涯产量': careerProduction,
      '持久稳定': longevity
    };
    const rawScore = Math.round(peakDominance * 0.26 + personalHonors * 0.25 + winningResume * 0.16 + careerProduction * 0.18 + longevity * 0.15);
    let score = rawScore;
    if (!allNba && !mvp && !dpoy && !championships) score = Math.min(score, 49);
    if (!mvp && !dpoy && !championships) score = Math.min(score, 67);
    if (!mvp && !championships) score = Math.min(score, 76);
    const majorAwards = mvp + dpoy;
    const tiers = [
      { threshold: 95, title: '历史王座候选', rank: '历史前 3 讨论', eligible: mvp >= 3 && championships >= 3 && allNba >= 12 && peakOvr >= 96 },
      { threshold: 89, title: '不朽传奇', rank: '历史前 10 级别', eligible: mvp >= 2 && championships >= 2 && allNba >= 10 },
      { threshold: 83, title: '时代统治者', rank: '历史前 25 级别', eligible: (mvp >= 2 || (mvp >= 1 && championships >= 1)) && allNba >= 8 },
      { threshold: 76, title: '名人堂超级巨星', rank: '历史前 50 级别', eligible: ((majorAwards >= 1 && championships >= 1) || mvp >= 2) && allNba >= 6 },
      { threshold: 68, title: '名人堂巨星', rank: '历史前 75 讨论', eligible: allNba >= 7 && (majorAwards >= 1 || championships >= 1) },
      { threshold: 58, title: '名人堂球星', rank: '名人堂级别（非历史前 75）', eligible: allNba >= 4 || majorAwards >= 1 || championships >= 1 },
      { threshold: 50, title: '多届最佳阵容球员', rank: '时代代表球星', eligible: allNba >= 2 || majorAwards >= 1 },
      { threshold: 42, title: '全明星级生涯', rank: '优秀核心球员', eligible: true },
      { threshold: 0, title: '可靠职业球员', rank: '长期轮换与首发级别', eligible: true }
    ];
    const tier = tiers.find(item => score >= item.threshold && item.eligible) || tiers[tiers.length - 1];
    return { score, rawScore, dimensions, tier, productionRatings, qualityUnits };
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
    tradeValue,
    calculateCareerLegacy,
    auditLeague
  };
}));
