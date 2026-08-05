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

  function allocatePositionAwareRotation(roster) {
    const players = (Array.isArray(roster) ? roster : []).filter(Boolean);
    const allocation = allocateRotation(players);
    const positions = player => Array.isArray(player.positions) && player.positions.length ? player.positions : [player.pos];
    let available = 0;
    players.forEach(player => {
      const competitors = players.filter(other => (
        other.id !== player.id
        && (Number(other.ovr) || 0) >= (Number(player.ovr) || 0) - 3
        && positions(other).some(position => positions(player).includes(position))
      )).length;
      if (competitors <= 1) return;
      const reduction = Math.min(Math.max(0, (allocation[player.id] || 0) - 4), Math.round((competitors - 1) * 3.5));
      allocation[player.id] -= reduction;
      available += reduction;
    });
    const receivers = players.slice().sort((left, right) => {
      const leftCoverage = players.filter(player => positions(player).some(position => positions(left).includes(position))).length;
      const rightCoverage = players.filter(player => positions(player).some(position => positions(right).includes(position))).length;
      return leftCoverage - rightCoverage || right.ovr - left.ovr;
    });
    while (available > 0) {
      const receiver = receivers.find(player => (allocation[player.id] || 0) < 42);
      if (!receiver) break;
      allocation[receiver.id] += 1;
      available -= 1;
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

  function seriesWinProbability(ownStrength, opponentStrength, round, context = {}) {
    const ownSeed = Number(context.ownSeed) || 0;
    const opponentSeed = Number(context.opponentSeed) || 0;
    const ownWins = Number(context.ownWins) || 0;
    const opponentWins = Number(context.opponentWins) || 0;
    const isConferenceRound = Math.max(0, Number(round) || 0) < 3;
    const seedPrior = isConferenceRound && ownSeed && opponentSeed
      ? clamp((opponentSeed - ownSeed) * 0.35, -2.45, 2.45)
      : 0;
    const recordPrior = ownWins && opponentWins
      ? clamp((ownWins - opponentWins) * 0.06, -0.96, 0.96)
      : 0;
    const homeCourt = context.homeCourt === true ? 0.35 : (context.homeCourt === false ? -0.35 : 0);
    const difference = ownStrength - opponentStrength + seedPrior + recordPrior + homeCourt;
    return clamp(1 / (1 + Math.exp(-difference / 3.6)), 0.06, 0.94);
  }

  function calculatePlayoffTeamStrength(players) {
    const rotation = (Array.isArray(players) ? players : [])
      .map(player => ({
        rating: Number(player?.effectiveOvr ?? player?.ovr) || 0,
        minutes: Math.max(0, Number(player?.minutes) || 0),
        usage: Math.max(0, Number(player?.usage) || 0),
        attrs: player?.attrs || null
      }))
      .filter(player => player.rating > 0)
      .sort((left, right) => right.minutes - left.minutes || right.rating - left.rating)
      .slice(0, 8);
    if (!rotation.length) return 60;
    const fallbackWeights = [40, 38, 35, 32, 28, 25, 22, 20];
    const hasRealMinutes = rotation.some(player => player.minutes > 0);
    const minuteWeights = rotation.map((player, index) => hasRealMinutes ? Math.max(8, player.minutes) : fallbackWeights[index]);
    const totalMinutes = minuteWeights.reduce((sum, value) => sum + value, 0);
    const rotationStrength = rotation.reduce((sum, player, index) => sum + player.rating * minuteWeights[index], 0) / totalMinutes;
    const stars = rotation.slice().sort((left, right) => right.rating - left.rating).slice(0, 3);
    const starBonus = stars.reduce((sum, player) => sum + Math.pow(Math.max(0, player.rating - 87), 1.22) * 0.22, 0);
    const attributeAverage = key => {
      const values = rotation.map(player => Number(player.attrs?.[key])).filter(Number.isFinite);
      return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 75;
    };
    const creation = (attributeAverage('HAN') + attributeAverage('PAS')) / 2;
    const spacing = (attributeAverage('threePT') + attributeAverage('MID')) / 2;
    const defense = (attributeAverage('PDEF') + attributeAverage('IDEF') + attributeAverage('BLK')) / 3;
    const fitBonus = Math.max(0, creation - 82) * 0.025 + Math.max(0, spacing - 82) * 0.018 + Math.max(0, defense - 82) * 0.022;
    const playmakingImpact = calculatePlaymakingImpact(rotation);
    const weakRotationPenalty = rotation.length < 7 ? (7 - rotation.length) * 0.8 : 0;
    return Math.round((rotationStrength + starBonus + fitBonus + playmakingImpact - weakRotationPenalty) * 10) / 10;
  }

  function calculateOffensiveUsage(profile = {}) {
    const ovr = clamp(Number(profile.ovr) || 60, 40, 99);
    const teamCoreOvr = clamp(Number(profile.teamCoreOvr) || 75, 40, 99);
    const scoring = clamp(Number(profile.scoring) || ovr, 40, 99);
    const playmaking = clamp(Number(profile.playmaking) || ovr, 40, 99);
    const minutes = clamp(Number(profile.minutes) || 0, 0, 48);
    const rank = Math.max(1, Number(profile.rank) || 15);
    const archetypeBonus = Number(profile.archetypeBonus) || 0;
    const roleOpportunity = clamp((minutes - 14) / 20, 0, 1);
    const relativeValue = (ovr - teamCoreOvr) * 0.42;
    const scoringValue = Math.max(0, scoring - 78) * 0.11;
    const creationValue = Math.max(0, playmaking - 75) * 0.18 + eliteTail(playmaking, 90) * 8.8;
    const hierarchyValue = Math.max(0, 3 - rank) * 0.8;
    const raw = 17.5 + relativeValue + scoringValue + creationValue * roleOpportunity + hierarchyValue + archetypeBonus;
    const ceiling = clamp(37 + Math.max(0, playmaking - 92) * 0.72 + Math.max(0, scoring - 95) * 0.2, 37, 44);
    return {
      usage: Math.round(clamp(raw, 8, ceiling) * 10) / 10,
      ceiling: Math.round(ceiling * 10) / 10,
      playmaking: Math.round(playmaking * 10) / 10,
      creationBonus: Math.round(creationValue * roleOpportunity * 10) / 10
    };
  }

  function calculatePlaymakingImpact(players) {
    const creators = (Array.isArray(players) ? players : []).map(player => {
      const passing = Number(player?.attrs?.PAS);
      const handling = Number(player?.attrs?.HAN);
      if (!Number.isFinite(passing) || !Number.isFinite(handling)) return null;
      const creation = passing * 0.72 + handling * 0.28;
      const minutesFactor = clamp((Number(player?.minutes) || 0) / 34, 0, 1.15);
      const usageFactor = clamp((Number(player?.usage) || 24) / 32, 0.55, 1.35);
      return { creation, impact: Math.max(0, creation - 88) * 0.13 * minutesFactor * usageFactor };
    }).filter(Boolean).sort((left, right) => right.impact - left.impact);
    if (!creators.length) return 0;
    const lead = creators[0].impact;
    const secondary = Math.min(0.45, (creators[1]?.impact || 0) * 0.25);
    return Math.round(clamp(lead + secondary, 0, 2.4) * 100) / 100;
  }

  function selectAwardFinalists(players, options = {}) {
    const limit = Math.max(1, Number(options.limit) || 3);
    const maxPerTeam = Math.max(1, Number(options.maxPerTeam) || limit);
    const selected = [];
    const teamCounts = new Map();
    (Array.isArray(players) ? players : [])
      .slice()
      .sort((left, right) => (Number(right.awardScore) || 0) - (Number(left.awardScore) || 0))
      .some(player => {
        const teamKey = player.teamId || `player:${player.name}`;
        const count = teamCounts.get(teamKey) || 0;
        if (count < maxPerTeam) {
          selected.push(player);
          teamCounts.set(teamKey, count + 1);
        }
        return selected.length >= limit;
      });
    return selected;
  }

  function summarizePeriodScores(periods) {
    const normalized = (Array.isArray(periods) ? periods : []).map((period, index) => ({
      period: index + 1,
      label: index < 4 ? `Q${index + 1}` : `OT${index - 3}`,
      own: Math.max(0, Math.round(Number(period?.own) || 0)),
      opponent: Math.max(0, Math.round(Number(period?.opponent) || 0))
    }));
    const ownScore = normalized.reduce((sum, period) => sum + period.own, 0);
    const opponentScore = normalized.reduce((sum, period) => sum + period.opponent, 0);
    return {
      periods: normalized,
      ownScore,
      opponentScore,
      tied: ownScore === opponentScore,
      complete: normalized.length >= 4 && ownScore !== opponentScore,
      won: normalized.length >= 4 && ownScore !== opponentScore ? ownScore > opponentScore : null
    };
  }

  function playerContributionWeight(player) {
    const games = Math.max(0, Number(player?.games) || 0);
    const availability = clamp(games / 82, 0, 1);
    const minutes = clamp(Number(player?.minutes ?? player?.min) || 0, 0, 48);
    const pts = Number(player?.pts) || 0;
    const reb = Number(player?.reb) || 0;
    const ast = Number(player?.ast) || 0;
    const stl = Number(player?.stl) || 0;
    const blk = Number(player?.blk) || 0;
    const tov = Number(player?.tov) || 0;
    const trueShooting = Number(player?.trueShooting ?? player?.ts) || 56;
    const defense = Number(player?.defense) || 70;
    const production = pts + reb * 0.65 + ast * 0.82 + stl * 1.25 + blk * 1.15 - tov * 0.72;
    const efficiency = clamp(0.82 + (trueShooting - 54) * 0.018, 0.72, 1.18);
    const defenseFactor = clamp(0.9 + (defense - 70) * 0.0045, 0.82, 1.14);
    const roleFactor = clamp(0.35 + minutes / 48 * 0.65, 0.35, 1);
    return Math.max(0.01, production * efficiency * defenseFactor * roleFactor * Math.max(0.08, availability));
  }

  function allocateWinContributions(players) {
    const groups = new Map();
    (Array.isArray(players) ? players : []).forEach(player => {
      const teamId = player?.teamId || `player:${player?.name || groups.size}`;
      if (!groups.has(teamId)) groups.set(teamId, []);
      groups.get(teamId).push(player);
    });
    const result = [];
    groups.forEach(teamPlayers => {
      const wins = Math.max(0, Number(teamPlayers[0]?.wins) || 0);
      const weighted = teamPlayers.map(player => ({ player, weight: playerContributionWeight(player) }));
      const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0) || 1;
      const contributions = weighted.map(item => wins * item.weight / totalWeight);
      const rounded = contributions.map(value => Math.round(value * 100) / 100);
      if (rounded.length) {
        const difference = Math.round((wins - rounded.reduce((sum, value) => sum + value, 0)) * 100) / 100;
        rounded[0] = Math.round((rounded[0] + difference) * 100) / 100;
      }
      weighted.forEach((item, index) => result.push({
        ...item.player,
        contributionWeight: Math.round(item.weight * 100) / 100,
        contributionShare: Math.round(item.weight / totalWeight * 10000) / 10000,
        winContribution: rounded[index]
      }));
    });
    return result;
  }

  function calculateRosterBalance(players, positions = ['PG', 'SG', 'SF', 'PF', 'C']) {
    const roster = (Array.isArray(players) ? players : []).filter(player => player && player.active !== false);
    const details = {};
    let score = 0;
    positions.forEach(position => {
      const eligible = roster.map(player => {
        const playerPositions = Array.isArray(player.positions) && player.positions.length ? player.positions : [player.pos];
        const primary = playerPositions[0] === position;
        const secondary = !primary && playerPositions.includes(position);
        return { player, factor: primary ? 1 : (secondary ? 0.88 : 0) };
      }).filter(item => item.factor > 0).sort((left, right) => right.player.ovr * right.factor - left.player.ovr * left.factor);
      const coverage = eligible.reduce((sum, item) => sum + (item.factor === 1 ? 1 : 0.45), 0);
      const starter = (Number(eligible[0]?.player.ovr) || 55) * (eligible[0]?.factor || 1);
      const backup = (Number(eligible[1]?.player.ovr) || 52) * (eligible[1]?.factor || 1);
      const deficit = Math.max(0, 2 - coverage);
      const congestion = Math.max(0, coverage - 3.25);
      score += starter * 0.22 + backup * 0.12 - deficit * 11 - congestion * 5.5;
      details[position] = { coverage: Math.round(coverage * 100) / 100, starter: Math.round(starter), backup: Math.round(backup), deficit, congestion: Math.round(congestion * 100) / 100 };
    });
    const allocation = allocateRotation(roster);
    const rotationPlayers = Object.values(allocation).filter(minutes => minutes >= 10).length;
    const unusedPlayers = Object.values(allocation).filter(minutes => minutes < 4).length;
    score += rotationPlayers * 1.4 - unusedPlayers * 0.8;
    return { score: Math.round(score * 100) / 100, details, rotationPlayers, unusedPlayers };
  }

  function bestOfSevenWinProbability(gameWinProbability) {
    const probability = clamp(Number(gameWinProbability) || 0, 0, 1);
    const lossProbability = 1 - probability;
    return probability ** 4 * (
      1
      + 4 * lossProbability
      + 10 * lossProbability ** 2
      + 20 * lossProbability ** 3
    );
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

  function calculateTradeProbability(profile) {
    const age = Number(profile?.age) || 27;
    const ovr = Number(profile?.ovr) || 75;
    const potential = Number(profile?.potential) || 70;
    const contractYears = clamp(Number(profile?.contractYears) || 1, 1, 5);
    const teamTenure = Math.max(0, Number(profile?.teamTenure) || 0);
    const teamsPlayed = Math.max(1, Number(profile?.teamsPlayed) || 1);
    const recentMoves = Math.max(0, Number(profile?.recentMoves) || 0);
    const franchiseScore = Math.max(0, Number(profile?.franchiseScore) || 0);
    const franchiseRank = Number.isFinite(Number(profile?.franchiseRank)) ? Number(profile.franchiseRank) : null;
    const championships = Math.max(0, Number(profile?.championships) || 0);
    const majorAwards = Math.max(0, Number(profile?.majorAwards) || 0);
    const teamWins = Number(profile?.teamWins) || 41;
    const replacementPressure = clamp(Number(profile?.replacementPressure) || 0, 0, 20);
    const directionMismatch = clamp(Number(profile?.directionMismatch) || 0, 0, 14);
    const relationship = clamp(Number(profile?.relationship) || 50, 0, 100);
    const seasonsSinceMove = Math.max(0, Number(profile?.seasonsSinceMove) || 99);
    const tradeDemandPressure = clamp(Number(profile?.tradeDemandPressure) || 0, 0, 0.4);
    const protections = [];
    const risks = [];
    let chance = 0.085;

    if (age <= 25 && potential >= 86) {
      const protection = 0.09 + (potential - 86) * 0.004;
      chance -= protection;
      protections.push('年轻高潜核心');
    }
    if (teamTenure >= 5) {
      chance -= Math.min(0.11, (teamTenure - 4) * 0.018);
      protections.push(teamTenure >= 9 ? '长期功勋球员' : '长期效力本队');
    }
    if (franchiseRank === 1) {
      chance -= 0.13;
      protections.push('队史第一人级贡献');
    } else if ((franchiseRank && franchiseRank <= 5) || franchiseScore >= 85) {
      chance -= 0.07;
      protections.push('队史代表球员');
    }
    if (championships > 0 || majorAwards > 0) {
      chance -= Math.min(0.09, championships * 0.035 + majorAwards * 0.018);
      protections.push(championships ? '冠军功勋' : '核心荣誉积累');
    }
    if (seasonsSinceMove <= 1) {
      chance -= 0.1;
      protections.push('刚刚加盟球队');
    }
    if (relationship >= 75) {
      chance -= (relationship - 70) * 0.0015;
      protections.push('球队关系稳固');
    }

    if (teamsPlayed >= 4) {
      chance += Math.min(0.12, (teamsPlayed - 3) * 0.025);
      risks.push('生涯换队较多');
    }
    if (recentMoves >= 2) {
      chance += Math.min(0.11, (recentMoves - 1) * 0.045);
      risks.push('近期流动频繁');
    }
    if (age >= 32 && contractYears >= 2) {
      chance += (age - 31) * 0.012 + (contractYears - 1) * 0.018;
      risks.push('老将合同风险');
    }
    if (teamWins < 35) {
      chance += Math.min(0.065, (35 - teamWins) * 0.004);
      risks.push('球队进入调整周期');
    }
    if (replacementPressure > 0) {
      chance += replacementPressure * 0.008;
      risks.push('同位置竞争拥挤');
    }
    if (directionMismatch > 0) {
      chance += directionMismatch * 0.008;
      risks.push('与球队建队方向不匹配');
    }
    if (relationship <= 35) {
      chance += (40 - relationship) * 0.003;
      risks.push('与管理层关系紧张');
    }
    if (tradeDemandPressure > 0) {
      chance += tradeDemandPressure;
      risks.push(tradeDemandPressure >= 0.25 ? '公开离队矛盾' : '仍有离队意愿');
    }
    if (ovr < 76 && age >= 28) {
      chance += Math.min(0.08, (76 - ovr) * 0.012);
      risks.push('轮换价值下降');
    }

    return {
      chance: Math.round(clamp(chance, 0.01, tradeDemandPressure > 0 ? 0.72 : 0.45) * 1000) / 1000,
      protections: [...new Set(protections)],
      risks: [...new Set(risks)]
    };
  }

  function calculateTradeRequestApproval(profile = {}) {
    const ovr = Number(profile.ovr) || 75;
    const contractYears = clamp(Number(profile.contractYears) || 1, 1, 5);
    const teamWins = Number(profile.teamWins) || 41;
    const failures = Math.max(0, Number(profile.failures) || 0);
    const relationship = clamp(Number(profile.relationship) || 50, 0, 100);
    const candidateQuality = clamp(Number(profile.candidateQuality) || 0, -10, 20);
    const hardline = Boolean(profile.hardline);
    const contractFactor = contractYears <= 1 ? 0.18 : (contractYears === 2 ? 0.08 : (contractYears >= 4 ? -0.08 : 0));
    let probability = 0.34 + (ovr - 80) * 0.018 + contractFactor
      - Math.max(0, teamWins - 45) * 0.004 - failures * 0.035
      + (50 - relationship) * 0.0015 + candidateQuality * 0.006;
    if (hardline) probability += 0.18;
    return Math.round(clamp(probability, hardline ? 0.3 : 0.18, hardline ? 0.9 : 0.82) * 1000) / 1000;
  }

  function calculateDevelopmentProfile(profile = {}) {
    const potential = clamp(Number(profile.potential) || 70, 40, 99);
    const age = Math.max(18, Number(profile.age) || 24);
    const minutes = clamp(Number(profile.minutes) || 0, 0, 48);
    const usage = clamp(Number(profile.usage) || 0, 0, 50);
    const games = clamp(Number(profile.games) || 0, 0, 82);
    const potentialFactor = clamp((potential - 40) / 59, 0, 1);
    const ageFactor = age <= 21 ? 1 : (age <= 24 ? 0.82 : (age <= 27 ? 0.55 : (age <= 30 ? 0.25 : 0)));
    const baseChance = clamp((0.12 + potentialFactor * 0.75) * ageFactor, 0, 0.9);
    const minutesFactor = clamp((minutes - 8) / 24, 0, 1);
    const usageEligible = minutes >= 12 && games >= 40;
    const usageFactor = usageEligible ? clamp((usage - 14) / 18, 0, 1) : 0;
    const availabilityFactor = clamp(games / 70, 0, 1);
    const opportunity = availabilityFactor * (minutesFactor * 0.7 + usageFactor * 0.3);
    const chanceMultiplier = 0.55 + opportunity * 0.65;
    const magnitudeMultiplier = 0.75 + opportunity * 0.4;
    const chance = age <= 30 ? clamp(baseChance * chanceMultiplier, 0, 0.92) : 0;
    const level = opportunity >= 0.8 ? '优秀' : (opportunity >= 0.58 ? '充足' : (opportunity >= 0.32 ? '一般' : '有限'));
    return {
      chance: Math.round(chance * 1000) / 1000,
      baseChance: Math.round(baseChance * 1000) / 1000,
      opportunity: Math.round(opportunity * 1000) / 1000,
      chanceMultiplier: Math.round(chanceMultiplier * 1000) / 1000,
      magnitudeMultiplier: Math.round(magnitudeMultiplier * 1000) / 1000,
      minutesFactor: Math.round(minutesFactor * 1000) / 1000,
      usageFactor: Math.round(usageFactor * 1000) / 1000,
      availabilityFactor: Math.round(availabilityFactor * 1000) / 1000,
      level,
      usageEligible
    };
  }

  const TRAINING_GROUPS = {
    core: new Set(['HAN', 'PAS', 'ATH']),
    primary: new Set(['threePT', 'FIN', 'PDEF', 'IDEF', 'BLK', 'REB']),
    situational: new Set(['MID', 'DNK', 'STR', 'CLU'])
  };

  const TRAINING_GROUP_LABELS = {
    core: '核心驱动',
    primary: '主要能力',
    situational: '情境能力'
  };

  const TRAINING_ATTRIBUTE_KEYS = ['threePT', 'MID', 'FIN', 'DNK', 'HAN', 'PAS', 'PDEF', 'IDEF', 'BLK', 'REB', 'ATH', 'STR', 'CLU'];

  function trainingAttributeGroup(key) {
    if (TRAINING_GROUPS.core.has(key)) return 'core';
    if (TRAINING_GROUPS.primary.has(key)) return 'primary';
    return 'situational';
  }

  function trainingPotentialBonus(potential) {
    const value = clamp(Number(potential) || 40, 40, 99);
    if (value >= 95) return 5;
    if (value >= 90) return 4;
    if (value >= 80) return 3;
    if (value >= 70) return 2;
    if (value >= 60) return 1;
    return 0;
  }

  function trainingAgeWeight(age) {
    const value = Math.max(18, Number(age) || 18);
    if (value <= 24) return 1;
    if (value <= 30) return 0.75;
    if (value <= 34) return 0.5;
    return 0.25;
  }

  function trainingAwardPoints(awards = [], champion = false, coreChampion = false) {
    let highest = 0;
    (Array.isArray(awards) ? awards : []).forEach(award => {
      const label = typeof award === 'string' ? award : (award?.recordLabel || award?.label || '');
      const detail = typeof award === 'string' ? award : `${award?.winner || ''} ${award?.detail || ''}`;
      if (['最有价值球员', '最佳防守球员', '总决赛最有价值球员'].includes(label)) highest = Math.max(highest, 5);
      else if (label === '常规赛得分王' || (label === '最佳阵容' && detail.includes('一阵'))) highest = Math.max(highest, 4);
      else if (label === '最佳阵容' && detail.includes('二阵')) highest = Math.max(highest, 3);
      else if (['最佳阵容', '最佳新秀'].includes(label)) highest = Math.max(highest, 2);
      else if (label.includes('全明星')) highest = Math.max(highest, 1);
    });
    return Math.min(5, highest + (champion && coreChampion ? 1 : 0));
  }

  function trainingSeasonTier(profile = {}) {
    const season = profile.season && typeof profile.season === 'object' ? profile.season : profile;
    const averages = season.averages || profile.averages || season;
    const games = clamp(Number(profile.games ?? season.games) || 0, 0, 82);
    const minutes = clamp(Number(profile.minutes ?? averages.min ?? season.minutes) || 0, 0, 48);
    const usage = clamp(Number(profile.usage ?? season.usage) || 0, 0, 50);
    const wins = clamp(Number(profile.wins ?? season.wins) || 0, 0, 82);
    const champion = Boolean(profile.champion ?? season.champion);
    const postseasonStats = profile.postseasonStats || season.postseasonStats || {};
    const postseasonPts = Number(postseasonStats.pts) || 0;
    const awards = profile.awards ?? season.awards ?? [];
    const labels = new Set((Array.isArray(awards) ? awards : []).map(award => (
      typeof award === 'string' ? award : (award?.recordLabel || award?.label || '')
    )));
    const hasMvp = labels.has('最有价值球员');
    const hasDpoy = labels.has('最佳防守球员');
    const hasFmvp = labels.has('总决赛最有价值球员') || Boolean(profile.finalsMvp ?? season.finalsMvp);
    const mvpRank = Number(profile.mvpRank ?? season.mvpStanding?.rank) || Infinity;
    const proofSeason = {
      ...season,
      games,
      wins,
      usage,
      champion,
      finalsMvp: hasFmvp,
      averages,
      attrs: profile.attrs || season.attrs || {},
      postseasonStats
    };
    const sProofCount = TRAINING_ATTRIBUTE_KEYS.reduce((count, key) => (
      count + (seasonAttributeProof(key, proofSeason).tier === 'S' ? 1 : 0)
    ), 0);
    const eligible = games >= 65 && minutes >= 30;
    if (!eligible) return { key: 'standard', label: '常规赛季', target: 0, sProofCount, mvpRank };

    const historicCombo = (hasMvp && hasFmvp) || (hasMvp && hasDpoy);
    const historicProduction = mvpRank <= 3 && sProofCount >= 3 && wins >= 60;
    const historicPostseason = hasFmvp && champion && sProofCount >= 3 && postseasonPts >= 30;
    if (historicCombo || historicProduction || historicPostseason) {
      const target = historicCombo || (historicProduction && historicPostseason) ? 22 : 21;
      return { key: 'historic', label: '历史级赛季', target, sProofCount, mvpRank };
    }

    const majorAward = hasMvp || hasDpoy || hasFmvp;
    const coreChampion = champion && (minutes >= 32 || usage >= 27);
    const legendary = (mvpRank <= 3 && sProofCount >= 1)
      || (mvpRank <= 5 && sProofCount >= 2)
      || (majorAward && sProofCount >= 2)
      || (coreChampion && postseasonPts >= 28 && sProofCount >= 1);
    if (legendary) {
      const target = mvpRank <= 3 || [hasMvp, hasDpoy, hasFmvp].filter(Boolean).length >= 2 ? 20 : 19;
      return { key: 'legendary', label: '传奇赛季', target, sProofCount, mvpRank };
    }
    return { key: 'standard', label: '常规赛季', target: 0, sProofCount, mvpRank };
  }

  function calculateTrainingPoints(profile = {}) {
    const season = profile.season && typeof profile.season === 'object' ? profile.season : {};
    const averages = season.averages || {};
    const age = Math.max(18, Number(profile.age ?? season.age) || 18);
    const minutes = clamp(Number(profile.minutes ?? averages.min) || 0, 0, 48);
    const usage = clamp(Number(profile.usage ?? season.usage) || 0, 0, 50);
    const games = clamp(Number(profile.games ?? season.games) || 0, 0, 82);
    const rawPotential = trainingPotentialBonus(profile.potential);
    const potential = Math.round(rawPotential * trainingAgeWeight(age));
    const opportunity = (minutes >= 20 ? 1 : 0) + (minutes >= 30 ? 1 : 0)
      + (usage >= 28 ? 1 : 0) + (games >= 65 ? 1 : 0);
    const awards = profile.awards ?? season.awards ?? [];
    const champion = Boolean(profile.champion ?? season.champion);
    const rawHonors = trainingAwardPoints(awards, champion, minutes >= 24 || usage >= 22);
    const honors = Math.min(rawHonors, Math.max(0, 18 - 6 - potential - opportunity));
    const sources = [
      { type: 'base', label: '生涯基础', points: 6 },
      { type: 'potential', label: `潜力兑现（${Math.round(trainingAgeWeight(age) * 100)}%）`, points: potential },
      { type: 'opportunity', label: '比赛机会', points: opportunity },
      { type: 'honors', label: honors < rawHonors ? '赛季荣誉（年度封顶）' : '赛季荣誉', points: honors }
    ];
    const ordinaryTotal = sources.reduce((sum, source) => sum + source.points, 0);
    const seasonTier = trainingSeasonTier({ ...profile, season, awards, champion, minutes, usage, games });
    const tailBonus = Math.max(0, seasonTier.target - ordinaryTotal);
    if (tailBonus) sources.push({ type: 'performance', label: seasonTier.label, points: tailBonus });
    const total = ordinaryTotal + tailBonus;
    return { total, sources, age, minimum: 6, ordinaryMaximum: 18, maximum: 22, seasonTier };
  }

  function trainingUpgradeCost(key, current, options = {}) {
    const value = clamp(Number(current) || 40, 40, 99);
    if (value >= 99) return Infinity;
    let cost;
    if (value < 80) cost = 1;
    else if (value < 95) cost = 2;
    else if (value < 97) cost = 6;
    else cost = 10;
    return options.maintenance ? Math.max(1, Math.ceil(cost * 0.4)) : cost;
  }

  function calculateTrainingAllocation({ attrs = {}, allocations = {}, points = 0, maintenanceLimits = {}, ceilings = {} } = {}) {
    const nextAttrs = { ...attrs };
    const breakdown = {};
    const errors = [];
    let spent = 0;
    let regularGrowth = 0;
    Object.keys(allocations || {}).forEach(key => {
      if (key === 'POT') return;
      const requested = Math.max(0, Math.floor(Number(allocations[key]) || 0));
      let maintenanceUsed = 0;
      let regularUsed = 0;
      let attributeSpent = 0;
      for (let index = 0; index < requested; index += 1) {
        const current = clamp(Number(nextAttrs[key]) || 40, 40, 99);
        const maintenance = maintenanceUsed < Math.max(0, Number(maintenanceLimits[key]) || 0);
        const ceiling = clamp(Number(ceilings[key]) || 97, current, 99);
        if (current >= ceiling) {
          errors.push(`${key}尚未解锁更高上限`);
          break;
        }
        const cost = trainingUpgradeCost(key, current, { maintenance });
        if (!Number.isFinite(cost) || spent + cost > points) {
          errors.push('训练点不足');
          break;
        }
        nextAttrs[key] = current + 1;
        spent += cost;
        attributeSpent += cost;
        if (maintenance) maintenanceUsed += 1;
        else {
          regularUsed += 1;
          regularGrowth += 1;
        }
      }
      breakdown[key] = { requested, applied: maintenanceUsed + regularUsed, maintenance: maintenanceUsed, growth: regularUsed, spent: attributeSpent };
    });
    return {
      valid: errors.length === 0,
      errors: [...new Set(errors)],
      spent,
      remaining: Math.max(0, Number(points) - spent),
      regularGrowth,
      nextAttrs,
      breakdown
    };
  }

  function contractMarketValue(player) {
    const ovr = Number(player?.ovr) || 60;
    const age = Number(player?.age) || 27;
    const potential = Number(player?.potential) || 70;
    const availability = clamp(Number(player?.availability) || 1, 0, 1);
    const base = (ovr - 67) * 3.1;
    const upside = age <= 25 ? Math.max(0, potential - 70) * 0.55 : 0;
    const decline = Math.max(0, age - 32) * 3.2;
    return Math.round((base + upside - decline) * (0.55 + availability * 0.45) * 10) / 10;
  }

  function eliteTail(value, threshold = 90) {
    return Math.pow(clamp(((Number(value) || 40) - threshold) / Math.max(1, 99 - threshold), 0, 1), 1.45);
  }

  function calculateStatProfile({ attrs = {}, position = 'SF', minutes = 34, usage = 25, ovr = 80, role = '', pace = 1 } = {}) {
    const base = {
      PG: { fga: 17, reb: 4, ast: 9, stl: 1.5, blk: 0.3, tov: 2.8 },
      SG: { fga: 19, reb: 5, ast: 5, stl: 1.2, blk: 0.4, tov: 2.3 },
      SF: { fga: 17, reb: 7, ast: 5, stl: 1.1, blk: 0.7, tov: 2.1 },
      PF: { fga: 15, reb: 10, ast: 4, stl: 0.9, blk: 1.0, tov: 1.9 },
      C: { fga: 14, reb: 12, ast: 4, stl: 0.7, blk: 1.6, tov: 2.0 }
    }[position] || { fga: 17, reb: 7, ast: 5, stl: 1.1, blk: 0.7, tov: 2.1 };
    const value = key => clamp(Number(attrs[key]) || 40, 40, 99);
    const minuteScale = clamp(minutes, 0, 48) / 34;
    const usageScale = clamp(usage / 25, 0.48, 1.48);
    const shotUsageScale = clamp(0.52 + usageScale * 0.35, 0.7, 1.08);
    const scoringSkill = value('threePT') * 0.22 + value('MID') * 0.18 + value('FIN') * 0.23
      + value('DNK') * 0.12 + value('HAN') * 0.17 + value('ATH') * 0.08;
    const reboundingSkill = value('REB') * 0.62 + value('STR') * 0.2 + value('ATH') * 0.18;
    const playmakingSkill = value('PAS') * 0.68 + value('HAN') * 0.25 + value('CLU') * 0.07;
    const stealSkill = value('PDEF') * 0.72 + value('ATH') * 0.2 + value('HAN') * 0.08;
    const blockSkill = value('BLK') * 0.64 + value('IDEF') * 0.24 + value('ATH') * 0.12;
    const ballSecurity = value('HAN') * 0.62 + value('PAS') * 0.3 + value('CLU') * 0.08;
    const ovrStability = clamp(0.96 + (clamp(ovr, 40, 99) - 80) * 0.0022, 0.86, 1.045);
    const paceScale = clamp(Number(pace) || 1, 0.86, 1.12);
    const scoringNorm = clamp((scoringSkill - 40) / 59, 0, 1);
    const reboundingNorm = clamp((reboundingSkill - 40) / 59, 0, 1);
    const playmakingNorm = clamp((playmakingSkill - 40) / 59, 0, 1);
    const roleModifiers = {
      creator: { fga: 1.02, ast: 1.14, reb: 1 },
      pointbig: { fga: 0.98, ast: 1.2, reb: 1.1 },
      sniper: { fga: 1.08, ast: 0.92, reb: 0.96 },
      slasher: { fga: 1.06, ast: 0.98, reb: 1.02 },
      wing: { fga: 1, ast: 1, reb: 1.04 },
      twoway: { fga: 0.97, ast: 0.98, reb: 1.04 },
      anchor: { fga: 0.9, ast: 0.9, reb: 1.12 },
      big: { fga: 0.96, ast: 0.92, reb: 1.12 }
    }[role] || { fga: 1, ast: 1, reb: 1 };
    const rebEliteBonus = eliteTail(reboundingSkill, 85) * ({ PG: 3.5, SG: 3.8, SF: 4.5, PF: 4, C: 3.2 }[position] || 4);
    const astEliteBonus = eliteTail(playmakingSkill) * ({ PG: 3.5, SG: 5, SF: 6, PF: 6, C: 6 }[position] || 5);
    const usageOpportunity = 0.76 + usageScale * 0.24;
    return {
      fga: base.fga * minuteScale * shotUsageScale * (0.74 + scoringNorm * 0.34 + eliteTail(scoringSkill) * 0.12) * ovrStability * paceScale * roleModifiers.fga,
      reb: (base.reb * (0.74 + reboundingNorm * 0.26) + rebEliteBonus) * minuteScale * ovrStability * paceScale * roleModifiers.reb,
      ast: Math.min(13.8, (base.ast * (0.7 + playmakingNorm * 0.3) + astEliteBonus) * minuteScale * usageOpportunity * ovrStability * paceScale * roleModifiers.ast),
      stl: base.stl * minuteScale * (0.72 + clamp((stealSkill - 40) / 59, 0, 1) * 0.3 + eliteTail(stealSkill) * 0.14),
      blk: base.blk * minuteScale * (0.7 + clamp((blockSkill - 40) / 59, 0, 1) * 0.32 + eliteTail(blockSkill) * 0.16),
      tov: base.tov * minuteScale * usageScale * clamp(1.42 - ballSecurity / 160, 0.76, 1.12),
      minuteScale,
      usageScale,
      shotUsageScale,
      paceScale
    };
  }

  const ATTRIBUTE_PROOF_LABELS = {
    threePT: '高产高效三分', MID: '中距离主攻', FIN: '篮下终结与造犯规', DNK: '高强度篮筐冲击',
    HAN: '高球权低失误创造', PAS: '组织产量与助失控制', PDEF: '外线压迫与抢断', IDEF: '禁区防守覆盖',
    BLK: '护筐封盖产量', REB: '篮板控制', ATH: '运动影响与出勤', STR: '对抗终结与篮板', CLU: '关键时段与季后赛'
  };

  function seasonAttributeProof(key, season = {}) {
    const averages = season.averages || season;
    const attrs = season.attrs || {};
    const games = Number(season.games) || 0;
    if (games && games < 41) return { tier: 'ignored', points: 0 };
    const pts = Number(averages.pts) || 0;
    const reb = Number(averages.reb) || 0;
    const ast = Number(averages.ast) || 0;
    const stl = Number(averages.stl) || 0;
    const blk = Number(averages.blk) || 0;
    const tov = Number(averages.tov) || 99;
    const minutes = Number(averages.min ?? season.minutes) || 0;
    const usage = Number(season.usage) || 0;
    const fgPct = Number(averages.fgPct) || 0;
    const threePct = Number(averages.threePct) || 0;
    const tpa = Number(season.tpaPerGame ?? averages.tpa) || 0;
    const fta = Number(averages.fta) || 0;
    const wins = Number(season.wins) || 0;
    const postseason = season.postseasonStats || {};
    let a = false;
    let s = false;
    if (key === 'threePT') {
      a = threePct >= 39 && tpa >= 7;
      s = (threePct >= 41.5 && tpa >= 9) || (threePct >= 44 && tpa >= 7.5);
    } else if (key === 'MID') {
      a = fgPct >= 47 && pts >= 24 && Number(averages.fga) >= 16;
      s = fgPct >= 51 && pts >= 28 && Number(averages.fga) >= 18;
    } else if (key === 'FIN') {
      a = fgPct >= 52 && fta >= 5 && pts >= 24;
      s = fgPct >= 56 && fta >= 7 && pts >= 28;
    } else if (key === 'DNK') {
      a = pts >= 23 && fgPct >= 52 && Number(attrs.DNK || 0) >= 94;
      s = pts >= 28 && fgPct >= 56 && Number(attrs.DNK || 0) >= 97;
    } else if (key === 'HAN') {
      a = usage >= 30 && tov <= 3.8 && (pts >= 27 || ast >= 7);
      s = usage >= 34 && tov <= 3.6 && (pts >= 30 || ast >= 9);
    } else if (key === 'PAS') {
      a = ast >= 9 && ast / Math.max(1, tov) >= 2.8;
      s = ast >= 11 && ast / Math.max(1, tov) >= 3;
    } else if (key === 'PDEF') {
      a = stl >= 1.7 && wins >= 42;
      s = stl >= 2.1 && wins >= 50;
    } else if (key === 'IDEF') {
      a = blk + stl >= 2.5 && reb >= 8 && wins >= 42;
      s = blk + stl >= 3.2 && reb >= 10 && wins >= 50;
    } else if (key === 'BLK') {
      const blocksPer36 = blk * 36 / Math.max(12, minutes);
      a = blocksPer36 >= 2.2;
      s = blocksPer36 >= 3;
    } else if (key === 'REB') {
      a = reb >= 11.5;
      s = reb >= 14;
    } else if (key === 'ATH') {
      const activity = pts + reb * 0.7 + stl * 2 + blk * 1.5;
      a = games >= 65 && minutes >= 32 && activity >= 31 && Number(attrs.ATH || 0) >= 94;
      s = games >= 70 && minutes >= 34 && activity >= 37 && Number(attrs.ATH || 0) >= 97;
    } else if (key === 'STR') {
      a = fgPct >= 51 && reb >= 8 && fta >= 5 && Number(attrs.STR || 0) >= 94;
      s = fgPct >= 55 && reb >= 11 && fta >= 7 && Number(attrs.STR || 0) >= 97;
    } else if (key === 'CLU') {
      const playoffPts = Number(postseason.pts) || 0;
      a = pts >= 25 && (playoffPts >= 25 || season.champion);
      s = pts >= 27 && playoffPts >= 28 && Boolean(season.champion || season.finalsMvp);
    }
    return { tier: s ? 'S' : (a ? 'A' : 'none'), points: s ? 2 : (a ? 1 : 0) };
  }

  function attributeSealUnlocked(key, recent, awards) {
    const labels = new Set([
      ...(Array.isArray(awards) ? awards : []).map(award => typeof award === 'string' ? award : (award?.recordLabel || award?.label)),
      ...recent.flatMap(season => season.awards || [])
    ]);
    const has = label => labels.has(label);
    const best = recent.reduce((current, season) => {
      const proof = seasonAttributeProof(key, season);
      return proof.points > current.proof.points ? { season, proof } : current;
    }, { season: {}, proof: { points: 0 } }).season;
    const averages = best.averages || best;
    if (['threePT', 'MID', 'FIN'].includes(key)) return has('常规赛得分王') || has('最有价值球员') || Number(averages.pts) >= 32;
    if (key === 'HAN') return has('最有价值球员') || (Number(best.usage) >= 35 && Number(averages.tov) <= 3.4);
    if (key === 'PAS') return has('最有价值球员') || Number(averages.ast) >= 12;
    if (['PDEF', 'IDEF', 'BLK'].includes(key)) return has('最佳防守球员') || Number(averages.stl) + Number(averages.blk) >= 3.8;
    if (key === 'REB') return has('最佳防守球员') || Number(averages.reb) >= 15;
    if (['DNK', 'ATH', 'STR'].includes(key)) return has('最有价值球员') || has('最佳防守球员') || Number(averages.pts) + Number(averages.reb) >= 42;
    if (key === 'CLU') return has('总决赛最有价值球员') || recent.some(season => season.champion && Number(season.postseasonStats?.pts) >= 30);
    return false;
  }

  function attributeBreakthroughStatus({ key, current = 40, official99 = false, seasons = [], awards = [] } = {}) {
    if (official99 || current >= 99) return { ceiling: 99, level: '时代标志', unlocked: true, progress: 3, seal: true };
    const recent = (Array.isArray(seasons) ? seasons : []).filter(season => !season.games || Number(season.games) >= 41).slice(-4);
    const proofs = recent.map(season => ({ seasonNumber: season.seasonNumber, ...seasonAttributeProof(key, season) }));
    const progress = proofs.reduce((sum, proof) => sum + proof.points, 0);
    const hasS = proofs.some(proof => proof.tier === 'S');
    const seal = attributeSealUnlocked(key, recent, awards);
    const ceiling = progress >= 3 && hasS && seal ? 99 : (progress >= 2 ? 98 : 97);
    return {
      ceiling,
      level: ceiling >= 99 ? '时代标志' : (ceiling >= 98 ? '历史级候选' : '联盟顶级'),
      unlocked: current <= ceiling,
      progress,
      hasS,
      seal,
      proofs,
      proofLabel: ATTRIBUTE_PROOF_LABELS[key] || '专项表现',
      nextRequirement: ceiling >= 99 ? '已完成时代级突破' : (ceiling >= 98 ? '需要累计3点证明、至少1个S级赛季并完成时代封印' : 'A级赛季计1点，S级赛季计2点；累计2点解锁98')
    };
  }

  function historicalAttributeCeiling(options = {}) {
    return attributeBreakthroughStatus(options);
  }

  function calculateSeasonImpactScore(player) {
    const wins = Number(player?.wins) || 0;
    const games = Math.max(1, Number(player?.games) || 0);
    const availability = clamp(games / 82, 0, 1);
    const pts = Number(player?.pts) || 0;
    const reb = Number(player?.reb) || 0;
    const ast = Number(player?.ast) || 0;
    const stl = Number(player?.stl) || 0;
    const blk = Number(player?.blk) || 0;
    const tov = Number(player?.tov) || 0;
    const trueShooting = Number(player?.trueShooting ?? player?.ts) || 56;
    const defense = Number(player?.defense) || 70;
    const production = pts * 0.68 + reb * 0.24 + ast * 0.38 + stl * 0.85 + blk * 0.75 - tov * 0.22;
    const efficiency = clamp((trueShooting - 56) * 0.25, -2.5, 3);
    const defenseValue = clamp((defense - 75) * 0.06, -0.9, 1.5);
    const availabilityValue = clamp((availability - 0.79) * 6, -1.5, 1.3);
    const teamRecord = clamp((wins - 41) * 0.11, -3, 3.3);
    const total = production + efficiency + defenseValue + availabilityValue + teamRecord;
    return {
      total: Math.round(total * 100) / 100,
      production: Math.round(production * 100) / 100,
      efficiency: Math.round(efficiency * 100) / 100,
      defense: Math.round(defenseValue * 100) / 100,
      availability: Math.round(availabilityValue * 100) / 100,
      teamRecord: Math.round(teamRecord * 100) / 100
    };
  }

  function calculateMvpScore(player) {
    const wins = Number(player?.wins) || 0;
    const pts = Number(player?.pts) || 0;
    const usage = Number(player?.usage) || 25;
    const impact = calculateSeasonImpactScore(player);
    const winContribution = Number(player?.winContribution);
    const winning = Number.isFinite(winContribution)
      ? winContribution * 0.9 + impact.teamRecord * 0.6
      : impact.teamRecord * 2.6;
    const offensiveLoad = clamp((usage - 25) * 0.12, -1, 2);
    const belowFiveHundredPenalty = wins < 41 && pts < 34 ? 7 + (41 - wins) * 0.4 : 0;
    const total = impact.production + impact.efficiency + impact.defense + impact.availability
      + winning + offensiveLoad - belowFiveHundredPenalty;
    return {
      total: Math.round(total * 100) / 100,
      production: impact.production,
      efficiency: impact.efficiency,
      defense: impact.defense,
      teamSuccess: Math.round(winning * 100) / 100,
      teamRecord: impact.teamRecord,
      winContribution: Number.isFinite(winContribution) ? Math.round(winContribution * 100) / 100 : null,
      availability: impact.availability,
      offensiveLoad: Math.round(offensiveLoad * 100) / 100,
      belowFiveHundredPenalty
    };
  }

  function calculateScoringLeaderScore(player) {
    return (Number(player?.pts) || 0) * 100 + (Number(player?.games) || 0) / 100;
  }

  function calculateFinalsMvpScore(player) {
    const games = Math.max(1, Number(player?.games) || 0);
    const pts = Number(player?.pts) || 0;
    const reb = Number(player?.reb) || 0;
    const ast = Number(player?.ast) || 0;
    const stl = Number(player?.stl) || 0;
    const blk = Number(player?.blk) || 0;
    const tov = Number(player?.tov) || 0;
    const minutes = Number(player?.min ?? player?.minutes) || 0;
    const fgPct = Number(player?.fgPct) || 0;
    const impact = pts + reb * 0.72 + ast * 0.92 + stl * 1.7 + blk * 1.55 - tov * 0.85;
    const efficiency = clamp((fgPct - 42) * 0.12, -1.5, 3);
    const workload = clamp((minutes - 24) * 0.08, -1, 1.2);
    const availability = clamp(games / 4, 0.65, 1);
    return Math.round((impact + efficiency + workload) * availability * 100) / 100;
  }

  function calculateAllNbaScore(player) {
    return calculateSeasonImpactScore(player).total;
  }

  function selectAllNbaTeams(players, { mvpFinalists = [] } = {}) {
    const keyOf = player => player?.id || `${player?.teamId || ''}:${player?.name || ''}:${player?.isUser ? 'user' : ''}`;
    const unique = [];
    const seen = new Set();
    (Array.isArray(players) ? players : []).forEach(player => {
      const key = keyOf(player);
      if (!player || seen.has(key)) return;
      seen.add(key);
      unique.push({ ...player, allNbaScore: calculateAllNbaScore(player) });
    });
    unique.sort((left, right) => right.allNbaScore - left.allNbaScore || (Number(right.wins) || 0) - (Number(left.wins) || 0));

    const promoteTo = (candidate, maximumIndex) => {
      const key = keyOf(candidate);
      const index = unique.findIndex(player => keyOf(player) === key);
      if (index < 0 || index <= maximumIndex) return;
      const [player] = unique.splice(index, 1);
      unique.splice(maximumIndex, 0, player);
    };
    if (mvpFinalists[0]) promoteTo(mvpFinalists[0], 0);
    if (mvpFinalists[1]) promoteTo(mvpFinalists[1], 5);
    if (mvpFinalists[2]) promoteTo(mvpFinalists[2], 6);

    return unique.slice(0, 15).map((player, index) => ({
      ...player,
      allNbaRank: index + 1,
      allNbaTeam: Math.floor(index / 5) + 1
    }));
  }

  function retirementEligibility({ age = 18, currentOvr = 99, peakOvr = currentOvr, seasons = 0, minutes = 36, forcedRetirement = false } = {}) {
    const decline = Math.max(0, Number(peakOvr) - Number(currentOvr));
    const reasons = [];
    if (forcedRetirement) reasons.push('医疗评估建议结束生涯');
    if (Number(age) >= 34) reasons.push('已进入生涯末期');
    if (Number(age) >= 32 && Number(currentOvr) <= 78) reasons.push('年龄与能力均明显下滑');
    if (Number(age) >= 30 && decline >= 10) reasons.push(`较巅峰下降 ${decline} OVR`);
    if (Number(age) >= 30 && Number(minutes) <= 14) reasons.push('预计轮换时间已降至14分钟或以下');
    const eligible = Number(seasons) >= 5 && reasons.length > 0;
    return { eligible, decline, reasons: eligible ? reasons : [], minimumSeasons: 5 };
  }

  function calculateFranchiseLegacyScore(profile = {}) {
    const seasons = Array.isArray(profile.seasons) ? profile.seasons : [];
    const historicalChampionships = Math.max(0, Number(profile.historicalChampionships) || 0);
    const seasonScore = seasons.reduce((total, season) => {
      const games = Math.max(0, Number(season.games) || 0);
      const availability = clamp(games / 82, 0, 1);
      const ovr = Number(season.ovr) || 60;
      const averages = season.averages || season;
      const pts = Number(averages.pts) || 0;
      const reb = Number(averages.reb) || 0;
      const ast = Number(averages.ast) || 0;
      const wins = Number(season.wins) || 0;
      const quality = clamp((ovr - 70) / 25, 0, 1) * 8;
      const production = clamp((pts + reb * 0.55 + ast * 0.75 - 10) / 30, 0, 1) * 8;
      const winning = clamp((wins - 40) * 0.2, 0, 6);
      return total + (quality + production + winning) * availability;
    }, 0);
    const awards = seasons.flatMap(season => Array.isArray(season.awards) ? season.awards : []);
    const awardPoints = awards.reduce((total, award) => total + ({
      '最有价值球员': 80,
      '最佳防守球员': 55,
      '最佳阵容': 22,
      '常规赛得分王': 12,
      '年度最佳新秀': 5
    }[award] || 0), 0);
    const titleValues = historicalChampionships === 0
      ? [170, 125, 95]
      : (historicalChampionships === 1 ? [140, 105, 85] : (historicalChampionships <= 3 ? [115, 90, 75] : [90, 75, 60]));
    let coreChampionships = 0;
    let championshipPoints = 0;
    seasons.filter(season => season.champion).forEach((season, index) => {
      const minutes = Number(season.averages?.min ?? season.minutes) || 0;
      const ovr = Number(season.ovr) || 60;
      const roleFactor = minutes >= 28 || ovr >= 86 ? 1 : (minutes >= 18 || ovr >= 78 ? 0.65 : 0.35);
      if (roleFactor === 1) coreChampionships += 1;
      const titleValue = titleValues[Math.min(index, titleValues.length - 1)];
      championshipPoints += titleValue * roleFactor;
    });
    const total = Math.round(seasonScore + awardPoints + championshipPoints);
    return {
      total,
      seasonScore: Math.round(seasonScore),
      awardPoints: Math.round(awardPoints),
      championshipPoints: Math.round(championshipPoints),
      coreChampionships
    };
  }

  function calculateFranchiseStanding(profile = {}) {
    const score = Math.max(0, Number(profile.score) || 0);
    const seasons = Math.max(0, Number(profile.seasons) || 0);
    const consecutive = Math.max(0, Number(profile.consecutive) || 0);
    const championships = Math.max(0, Number(profile.championships) || 0);
    const majorAwards = Math.max(0, Number(profile.majorAwards) || 0);
    const historicalChampionships = Math.max(0, Number(profile.historicalChampionships) || 0);
    const coreChampionships = Math.max(0, Number(profile.coreChampionships) || 0);
    const legends = (Array.isArray(profile.legends) ? profile.legends : [])
      .map((legend, index) => ({ rank: index + 1, name: legend.name, score: Math.max(0, Number(legend.score) || 0) }))
      .sort((left, right) => right.score - left.score);
    const rawRank = legends.filter(legend => legend.score > score).length + 1;
    let championshipRankCap = Infinity;
    if (historicalChampionships === 0) {
      if (coreChampionships >= 2) championshipRankCap = 2;
      else if (coreChampionships >= 1) championshipRankCap = 3;
    } else if (historicalChampionships === 1) {
      if (coreChampionships >= 3) championshipRankCap = 3;
      else if (coreChampionships >= 2) championshipRankCap = 5;
    } else if (historicalChampionships <= 3 && coreChampionships >= 3) {
      championshipRankCap = 5;
    } else if (historicalChampionships >= 4 && coreChampionships >= 4) {
      championshipRankCap = 5;
    }
    const leader = legends[0] || null;
    const firstEligible = rawRank === 1 && seasons >= 8 && (championships >= 1 || majorAwards >= 2);
    const scoreRank = firstEligible ? 1 : Math.max(rawRank, rawRank === 1 ? 2 : rawRank);
    const displayedRank = Math.min(scoreRank, championshipRankCap);
    let status = '新加盟球员';
    if (firstEligible) status = '队史第一人';
    else if (displayedRank <= 3) status = '队史前三';
    else if (displayedRank <= 5) status = '队史前五';
    else if (score >= (legends[legends.length - 1]?.score || 180) * 0.75) status = '队史代表';
    else if (consecutive >= 8) status = '功勋球员';
    else if (consecutive >= 5) status = '长期成员';
    else if (consecutive >= 2) status = '轮换骨干';
    const ranked = displayedRank <= legends.length;
    const nextLegend = firstEligible ? null : legends[Math.max(0, displayedRank - 2)] || leader;
    return {
      rank: displayedRank,
      rawRank,
      ranked,
      status,
      firstEligible,
      championshipRankCap: Number.isFinite(championshipRankCap) ? championshipRankCap : null,
      championshipGuaranteeApplied: Number.isFinite(championshipRankCap) && championshipRankCap < scoreRank,
      leader,
      nextLegend,
      rankLabel: ranked ? `队史功勋榜第 ${displayedRank}` : `暂未进入队史前 ${legends.length}`,
      rankBasis: Number.isFinite(championshipRankCap) && championshipRankCap < scoreRank
        ? `${coreChampionships} 次核心冠军触发队史前 ${championshipRankCap} 保障`
        : '按综合贡献分排位',
      scoreToNext: nextLegend ? Math.max(0, Math.ceil(nextLegend.score - score + 1)) : 0
    };
  }

  function calculateMotherTeamRetention(profile = {}) {
    const tenure = Math.max(0, Number(profile.tenure) || 0);
    const relationship = clamp(Number(profile.relationship) || 50, 0, 100);
    const legacyScore = Math.max(0, Number(profile.legacyScore) || 0);
    const franchiseRank = Number.isFinite(Number(profile.franchiseRank)) ? Number(profile.franchiseRank) : null;
    const franchiseStatus = String(profile.franchiseStatus || '');
    const championships = Math.max(0, Number(profile.championships) || 0);
    const tradeRequests = Math.max(0, Number(profile.tradeRequests) || 0);
    const forcedRetirement = Boolean(profile.forcedRetirement);
    const reasons = [];
    let probability = 0.18 + relationship * 0.004 + Math.min(0.28, tenure * 0.025) + Math.min(0.22, legacyScore * 0.0012) + Math.min(0.12, championships * 0.04);
    if (tenure >= 8) reasons.push('长期效力本队');
    if (tenure >= 12) reasons.push('一人一城功勋');
    if ((franchiseRank && franchiseRank <= 5) || franchiseStatus === '队史代表') reasons.push('队史代表球员');
    if (franchiseRank === 1 && franchiseStatus === '队史第一人') reasons.push('队史第一人级贡献');
    if (championships) reasons.push('冠军功勋');
    probability -= Math.min(0.42, tradeRequests * 0.14);
    if (relationship < 35) probability -= (35 - relationship) * 0.012;
    if (forcedRetirement) probability = 0;
    const franchiseLeader = franchiseRank === 1 && franchiseStatus === '队史第一人';
    const guaranteed = !forcedRetirement && relationship >= 70 && (tenure >= 12 || franchiseLeader);
    if (guaranteed) probability = Math.max(probability, franchiseLeader ? 0.98 : 0.92);
    return { probability: Math.round(clamp(probability, 0, 0.99) * 1000) / 1000, guaranteed, reasons };
  }

  function calculateCareerLegacy(career) {
    const history = Array.isArray(career?.history) ? career.history : [];
    const totals = career?.totals || {};
    const awards = career?.awardCounts || {};
    const mvp = awards['最有价值球员'] || 0;
    const dpoy = awards['最佳防守球员'] || 0;
    const finalsMvp = awards['总决赛最有价值球员'] || 0;
    const allNba = awards['最佳阵容'] || 0;
    const scoringTitles = awards['常规赛得分王'] || 0;
    const rookieAwards = awards['年度最佳新秀'] || 0;
    const championships = career?.championships || 0;
    const peakOvr = Number(career?.peakOVR) || 60;
    const totalGames = Number(career?.totalGames) || 0;
    const seasonCount = Math.max(1, history.length);
    const careerPpg = totalGames > 0 ? (Number(totals.pts) || 0) / totalGames : 0;
    const careerMpg = totalGames > 0
      ? history.reduce((sum, season) => sum + (Number(season.averages?.min) || 0) * (Number(season.games) || 0), 0) / totalGames
      : 0;
    const topFiveOvr = history.slice().sort((left, right) => right.ovr - left.ovr).slice(0, 5)
      .reduce((sum, season) => sum + season.ovr, 0) / Math.max(1, Math.min(5, history.length));
    const peakRating = ratingFromMilestones(peakOvr, [[0, 0], [75, 10], [80, 25], [85, 45], [90, 65], [95, 82], [99, 94]]);
    const topFiveRating = ratingFromMilestones(topFiveOvr, [[0, 0], [75, 8], [80, 22], [85, 42], [90, 63], [95, 80], [99, 92]]);
    const peakDominance = clamp(Math.round(peakRating * 0.72 + topFiveRating * 0.18 + Math.min(10, mvp * 4 + scoringTitles * 1.5)), 0, 100);
    const personalHonors = clamp(Math.round(mvp * 22 + finalsMvp * 12 + dpoy * 14 + allNba * 7 + scoringTitles * 5 + rookieAwards * 2), 0, 100);
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
      { threshold: 95, title: '历史王座候选', rank: '历史前 3 讨论', top30: true, eligible: mvp >= 3 && championships >= 3 && allNba >= 12 && peakOvr >= 96 },
      { threshold: 89, title: '不朽传奇', rank: '历史前 10 级别', top30: true, eligible: mvp >= 2 && championships >= 2 && allNba >= 10 },
      { threshold: 83, title: '时代统治者', rank: '历史前 25 级别', top30: true, eligible: (mvp >= 2 || (mvp >= 1 && championships >= 1)) && allNba >= 8 },
      { threshold: 76, title: '名人堂超级巨星', rank: '历史前 50 级别', eligible: ((majorAwards >= 1 && championships >= 1) || mvp >= 2) && allNba >= 6 },
      { threshold: 68, title: '名人堂巨星', rank: '历史前 75 讨论', eligible: allNba >= 7 && (majorAwards >= 1 || championships >= 1) },
      { threshold: 58, title: '名人堂球星', rank: '名人堂级别（非历史前 75）', eligible: allNba >= 4 || majorAwards >= 1 || championships >= 1 },
      { threshold: 50, title: '多届最佳阵容球员', rank: '时代代表球星', eligible: allNba >= 2 || majorAwards >= 1 },
      { threshold: 42, title: '全明星级生涯', rank: '有过高光，离历史前列还有几个档位', eligible: seasonCount >= 5 && (allNba >= 1 || peakOvr >= 90) },
      { threshold: 34, title: '球队核心', rank: '能扛一段时间的球权，扛不起历史讨论', eligible: seasonCount >= 6 && totalGames >= 350 && (careerPpg >= 15 || peakOvr >= 88) },
      { threshold: 24, title: '合格首发', rank: '首发履历够用，退役巡演就先省了', eligible: totalGames >= 350 && careerMpg >= 24 },
      { threshold: 14, title: '稳定轮换球员', rank: '轮换里有位置，历史榜单里没有', eligible: seasonCount >= 5 && totalGames >= 220 && (careerMpg >= 15 || careerPpg >= 6) },
      { threshold: 7, title: '联盟边缘球员', rank: '名单上出现过，比赛里不一定找得到', eligible: totalGames >= 50 },
      { threshold: 0, title: '未能站稳联盟', rank: '短暂联盟经历，生涯比重建计划结束得更早', eligible: true }
    ];
    const tier = tiers.find(item => score >= item.threshold && item.eligible) || tiers[tiers.length - 1];
    return { score, rawScore, dimensions, tier, productionRatings, qualityUnits, careerPpg, careerMpg, seasonCount, totalGames };
  }

  function calculateCareerTitles(career, legacy = calculateCareerLegacy(career)) {
    const history = Array.isArray(career?.history) ? career.history : [];
    const awards = career?.awardCounts || {};
    const totals = career?.totals || {};
    const teamsPlayed = Array.isArray(career?.teamsPlayed) ? career.teamsPlayed : [];
    const mvp = awards['最有价值球员'] || 0;
    const allNba = awards['最佳阵容'] || 0;
    const championships = career?.championships || 0;
    const deepRuns = history.filter(season => season.champion || /总决赛|分区决赛/.test(String(season.postseason))).length;
    const latePrime = history.filter(season => season.age >= 33 && season.ovr >= 85 && season.games >= 58).length;
    const definitions = [
      {
        title: '联盟门面',
        achieved: mvp >= 2 && allNba >= 8 && (career?.peakOVR || 0) >= 95,
        reason: `${mvp} 次 MVP、${allNba} 次最佳阵容，巅峰 ${career?.peakOVR || 0} OVR`,
        requirement: '至少2次MVP、8次最佳阵容且巅峰达到95 OVR'
      },
      {
        title: '冠军核心',
        achieved: championships >= 1 && ((career?.peakOVR || 0) >= 88 || allNba >= 2),
        reason: `${championships} 次夺冠，巅峰 ${career?.peakOVR || 0} OVR`,
        requirement: '以核心能力赢得至少1次总冠军'
      },
      {
        title: '无冕之王',
        achieved: championships === 0 && legacy.score >= 65 && (mvp >= 1 || allNba >= 7),
        reason: `没有总冠军，但拥有 ${mvp} 次 MVP、${allNba} 次最佳阵容`,
        requirement: '无冠且历史评分65以上，并有MVP或至少7次最佳阵容'
      },
      {
        title: '常青树',
        achieved: history.length >= 15 && (career?.totalGames || 0) >= 1000 && latePrime >= 2,
        reason: `${history.length} 个赛季、${career?.totalGames || 0} 场，33岁后仍有 ${latePrime} 个高水平赛季`,
        requirement: '至少15季、1000场，33岁后仍有2个高水平赛季'
      },
      {
        title: '球队图腾',
        achieved: teamsPlayed.length === 1 && history.length >= 10 && (career?.totalGames || 0) >= 650,
        reason: `全部 ${history.length} 个赛季效力同一支球队`,
        requirement: '只效力一队至少10季并出战650场'
      },
      {
        title: '季后赛杀手',
        achieved: deepRuns >= 3 && championships >= 1,
        reason: `${deepRuns} 次打入分区决赛或更远，并赢得 ${championships} 冠`,
        requirement: '至少3次深入季后赛并夺得总冠军'
      },
      {
        title: '数据巨匠',
        achieved: (totals.pts || 0) >= 30000 || (totals.reb || 0) >= 15000 || (totals.ast || 0) >= 10000,
        reason: `累计 ${Math.round(totals.pts || 0)} 分、${Math.round(totals.reb || 0)} 篮板、${Math.round(totals.ast || 0)} 助攻`,
        requirement: '达到30000分、15000篮板或10000助攻之一'
      },
      {
        title: '辗转名将',
        achieved: teamsPlayed.length >= 4 && legacy.score >= 45 && (allNba >= 2 || mvp >= 1),
        reason: `效力 ${teamsPlayed.length} 支球队，仍累积 ${allNba} 次最佳阵容`,
        requirement: '效力至少4队，并以明星级履历维持影响力'
      }
    ];
    const achieved = definitions.filter(item => item.achieved);
    const next = definitions.find(item => !item.achieved) || null;
    return { achieved, next, definitions };
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
    allocatePositionAwareRotation,
    rotationTotal,
    normalizeTeamRecords,
    conferenceSeeds,
    seriesWinProbability,
    calculatePlayoffTeamStrength,
    calculateOffensiveUsage,
    calculatePlaymakingImpact,
    selectAwardFinalists,
    summarizePeriodScores,
    playerContributionWeight,
    allocateWinContributions,
    calculateRosterBalance,
    bestOfSevenWinProbability,
    tradeValue,
    calculateTradeProbability,
    calculateTradeRequestApproval,
    calculateDevelopmentProfile,
    calculateTrainingPoints,
    trainingAttributeGroup,
    trainingUpgradeCost,
    calculateTrainingAllocation,
    contractMarketValue,
    calculateStatProfile,
    seasonAttributeProof,
    attributeBreakthroughStatus,
    historicalAttributeCeiling,
    calculateSeasonImpactScore,
    calculateMvpScore,
    calculateScoringLeaderScore,
    calculateFinalsMvpScore,
    calculateAllNbaScore,
    selectAllNbaTeams,
    retirementEligibility,
    calculateFranchiseLegacyScore,
    calculateFranchiseStanding,
    calculateMotherTeamRetention,
    calculateCareerLegacy,
    calculateCareerTitles,
    auditLeague
  };
}));
