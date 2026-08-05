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

test('position-aware rotation conserves minutes and reduces opportunity in a crowded role', () => {
  const balanced = ['PG', 'SG', 'SF', 'PF', 'C'].flatMap((pos, index) => [
    { id: `${pos}-starter`, pos, positions: [pos], ovr: 90 - index },
    { id: `${pos}-backup`, pos, positions: [pos], ovr: 80 - index }
  ]);
  const crowded = balanced.concat([
    { id: 'pg-extra-1', pos: 'PG', positions: ['PG'], ovr: 87 },
    { id: 'pg-extra-2', pos: 'PG', positions: ['PG'], ovr: 86 }
  ]);
  const normalMinutes = SIM.allocatePositionAwareRotation(balanced)['PG-backup'];
  const crowdedAllocation = SIM.allocatePositionAwareRotation(crowded);
  assert.equal(SIM.rotationTotal(crowdedAllocation), 240);
  assert.ok(crowdedAllocation['PG-backup'] < normalMinutes);
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

test('playoff strength rewards shortened rotations and multiple superstars', () => {
  const contender = [95, 93, 91, 82, 80, 78, 76, 74].map(ovr => ({ ovr }));
  const eighthSeed = [87, 84, 82, 81, 80, 78, 77, 76].map(ovr => ({ ovr }));
  const contenderStrength = SIM.calculatePlayoffTeamStrength(contender);
  const eighthSeedStrength = SIM.calculatePlayoffTeamStrength(eighthSeed);
  const gameChance = SIM.seriesWinProbability(contenderStrength, eighthSeedStrength, 0);
  const seriesChance = SIM.bestOfSevenWinProbability(gameChance);
  assert.ok(contenderStrength > eighthSeedStrength + 5);
  assert.ok(seriesChance > 0.9);
});

test('equal playoff teams remain a coin flip over seven games', () => {
  const gameChance = SIM.seriesWinProbability(86, 86, 2);
  assert.equal(gameChance, 0.5);
  assert.ok(Math.abs(SIM.bestOfSevenWinProbability(gameChance) - 0.5) < 0.0001);
});

test('first seed receives a bounded postseason prior over an equal eighth seed', () => {
  const gameChance = SIM.seriesWinProbability(84, 84, 0, {
    ownSeed: 1, opponentSeed: 8, ownWins: 56, opponentWins: 43
  });
  const seriesChance = SIM.bestOfSevenWinProbability(gameChance);
  assert.ok(seriesChance > 0.78);
  assert.ok(seriesChance < 0.95);
});

test('trade value rewards youth and penalizes aging contracts', () => {
  const young = SIM.tradeValue({ ovr: 86, age: 22, potential: 92, contractYears: 4 });
  const veteran = SIM.tradeValue({ ovr: 86, age: 35, potential: 70, contractYears: 3 });
  assert.ok(young > veteran + 15);
  assert.ok(SIM.tradeValue({ ovr: 94, age: 28, potential: 80, contractYears: 2 }) > young);
});

test('young high-potential and franchise players receive trade protection', () => {
  const youngCore = SIM.calculateTradeProbability({
    age: 22, ovr: 86, potential: 94, contractYears: 3, teamTenure: 4,
    teamsPlayed: 1, recentMoves: 0, franchiseScore: 60, teamWins: 45, seasonsSinceMove: 4
  });
  const franchiseIcon = SIM.calculateTradeProbability({
    age: 30, ovr: 92, potential: 82, contractYears: 2, teamTenure: 11,
    teamsPlayed: 1, recentMoves: 0, franchiseScore: 190, championships: 2, majorAwards: 2,
    teamWins: 52, relationship: 90, seasonsSinceMove: 11, franchiseRank: 1
  });
  assert.ok(youngCore.chance <= 0.03);
  assert.ok(franchiseIcon.chance <= 0.02);
  assert.ok(youngCore.protections.includes('年轻高潜核心'));
  assert.ok(franchiseIcon.protections.includes('队史第一人级贡献'));
});

test('journeyman history and roster mismatch increase trade probability', () => {
  const stable = SIM.calculateTradeProbability({
    age: 29, ovr: 81, potential: 74, contractYears: 2, teamTenure: 5,
    teamsPlayed: 2, recentMoves: 0, franchiseScore: 70, teamWins: 44, seasonsSinceMove: 5
  });
  const journeyman = SIM.calculateTradeProbability({
    age: 33, ovr: 78, potential: 68, contractYears: 3, teamTenure: 2,
    teamsPlayed: 6, recentMoves: 3, franchiseScore: 12, teamWins: 31,
    replacementPressure: 12, directionMismatch: 8, relationship: 30, seasonsSinceMove: 2
  });
  assert.ok(journeyman.chance > stable.chance + 0.25);
  assert.ok(journeyman.risks.includes('生涯换队较多'));
  assert.ok(journeyman.risks.includes('近期流动频繁'));
});

test('trade demand pressure materially raises future involuntary trade risk', () => {
  const stable = SIM.calculateTradeProbability({
    age: 28, ovr: 86, potential: 80, contractYears: 2, teamTenure: 5,
    teamsPlayed: 1, recentMoves: 0, franchiseScore: 60, teamWins: 44,
    relationship: 60, seasonsSinceMove: 5, tradeDemandPressure: 0
  });
  const softened = SIM.calculateTradeProbability({
    age: 28, ovr: 86, potential: 80, contractYears: 2, teamTenure: 5,
    teamsPlayed: 1, recentMoves: 0, franchiseScore: 60, teamWins: 44,
    relationship: 50, seasonsSinceMove: 5, tradeDemandPressure: 0.1
  });
  const hardline = SIM.calculateTradeProbability({
    age: 28, ovr: 86, potential: 80, contractYears: 2, teamTenure: 5,
    teamsPlayed: 1, recentMoves: 0, franchiseScore: 60, teamWins: 44,
    relationship: 5, seasonsSinceMove: 5, tradeDemandPressure: 0.3
  });
  assert.ok(softened.chance >= stable.chance + 0.09);
  assert.ok(hardline.chance >= softened.chance + 0.2);
  assert.ok(hardline.risks.includes('公开离队矛盾'));
});

test('hardline trade request has more leverage but remains bounded', () => {
  const profile = { ovr: 88, contractYears: 3, teamWins: 50, failures: 1, relationship: 45, candidateQuality: 8 };
  const initial = SIM.calculateTradeRequestApproval(profile);
  const hardline = SIM.calculateTradeRequestApproval({ ...profile, hardline: true });
  assert.ok(hardline > initial);
  assert.ok(hardline <= 0.9);
  assert.ok(initial >= 0.18);
});

test('development opportunity rewards real minutes usage and availability', () => {
  const reserve = SIM.calculateDevelopmentProfile({ potential: 90, age: 22, minutes: 8, usage: 18, games: 55 });
  const rotation = SIM.calculateDevelopmentProfile({ potential: 90, age: 22, minutes: 24, usage: 23, games: 70 });
  const core = SIM.calculateDevelopmentProfile({ potential: 90, age: 22, minutes: 35, usage: 31, games: 78 });
  assert.ok(rotation.chance > reserve.chance);
  assert.ok(core.chance > rotation.chance);
  assert.ok(core.magnitudeMultiplier > rotation.magnitudeMultiplier);
  assert.equal(reserve.usageEligible, false);
});

test('small-sample usage cannot unlock growth and age decline remains independent', () => {
  const smallSample = SIM.calculateDevelopmentProfile({ potential: 99, age: 21, minutes: 10, usage: 40, games: 20 });
  const veteran = SIM.calculateDevelopmentProfile({ potential: 99, age: 33, minutes: 38, usage: 35, games: 82 });
  assert.equal(smallSample.usageFactor, 0);
  assert.equal(veteran.chance, 0);
});

test('computer development uses a bounded TP budget instead of direct OVR growth', () => {
  const reserve = SIM.calculateLeagueDevelopmentBudget({ potential: 92, age: 21, minutes: 9, usage: 18, games: 42 });
  const core = SIM.calculateLeagueDevelopmentBudget({ potential: 92, age: 21, minutes: 35, usage: 31, games: 78 });
  const veteran = SIM.calculateLeagueDevelopmentBudget({ potential: 99, age: 31, minutes: 38, usage: 34, games: 82 });
  assert.ok(core.points > reserve.points);
  assert.ok(core.points <= 12);
  assert.equal(veteran.points, 0);
});

test('rotation merit lets sustained production soften but not erase an OVR gap', () => {
  const productive = SIM.calculateRotationMerit({
    ovr: 84, attributeOvr: 84,
    lastSeason: { games: 76, minutes: 34, pts: 27, reb: 6, ast: 8, stl: 1.3, blk: 0.4, tov: 2.7, trueShooting: 62 }
  });
  const unproven = SIM.calculateRotationMerit({ ovr: 86, attributeOvr: 86 });
  const weakHighRated = SIM.calculateRotationMerit({
    ovr: 90, attributeOvr: 90,
    lastSeason: { games: 75, minutes: 31, pts: 10, reb: 3, ast: 2, stl: 0.5, blk: 0.2, tov: 2, trueShooting: 51 }
  });
  assert.ok(productive > unproven);
  assert.ok(weakHighRated > productive);
});

test('active veterans always receive training points while youth keeps an efficiency advantage', () => {
  const veteran = SIM.calculateTrainingPoints({ potential: 95, age: 38, minutes: 8, usage: 12, games: 25, awards: [] });
  const youngCore = SIM.calculateTrainingPoints({ potential: 95, age: 21, minutes: 35, usage: 31, games: 78, awards: ['最有价值球员'], champion: true });
  assert.ok(veteran.total >= 6);
  assert.ok(youngCore.total > veteran.total);
  assert.ok(youngCore.total <= 18);
  assert.equal(youngCore.sources.reduce((sum, source) => sum + source.points, 0), youngCore.total);
});

test('training honors use the highest tier and remain capped', () => {
  const points = SIM.calculateTrainingPoints({
    potential: 80, age: 24, minutes: 35, usage: 30, games: 82, champion: true,
    awards: ['最有价值球员', '最佳防守球员', '常规赛得分王']
  });
  assert.equal(points.sources.find(source => source.type === 'honors').points, 5);
});

test('legendary and historic seasons extend the training tail without using overall rating', () => {
  const season = {
    games: 78, wins: 56, usage: 34, champion: false, mvpStanding: { rank: 3 },
    attrs: { HAN: 97, FIN: 97, DNK: 97, ATH: 97 },
    averages: { min: 36, pts: 31, reb: 8, ast: 8, stl: 1.8, blk: 0.8, tov: 3.2, fgPct: 57, fga: 20, fta: 8 },
    postseasonStats: { pts: 29 },
    awards: ['最佳阵容']
  };
  const legendary = SIM.calculateTrainingPoints({ potential: 95, age: 24, season });
  const historic = SIM.calculateTrainingPoints({
    potential: 95,
    age: 24,
    season: {
      ...season,
      wins: 62,
      champion: true,
      finalsMvp: true,
      postseasonStats: { pts: 32 },
      awards: ['最有价值球员', '总决赛最有价值球员']
    }
  });
  assert.equal(legendary.total, 20);
  assert.equal(legendary.seasonTier.key, 'legendary');
  assert.equal(historic.total, 22);
  assert.equal(historic.seasonTier.key, 'historic');
  assert.equal(historic.sources.reduce((sum, source) => sum + source.points, 0), historic.total);
});

test('short seasons cannot receive the legendary training tail', () => {
  const points = SIM.calculateTrainingPoints({
    potential: 99,
    age: 23,
    season: {
      games: 40, wins: 60, usage: 36, champion: true, finalsMvp: true, mvpStanding: { rank: 1 },
      attrs: { HAN: 99, FIN: 99 },
      averages: { min: 38, pts: 35, reb: 10, ast: 11, tov: 3, fgPct: 58, fga: 22, fta: 9 },
      postseasonStats: { pts: 34 },
      awards: ['最有价值球员', '总决赛最有价值球员']
    }
  });
  assert.equal(points.seasonTier.key, 'standard');
  assert.ok(points.total <= 18);
});

test('training upgrade costs use the confirmed four tiers at every boundary', () => {
  assert.equal(SIM.trainingUpgradeCost('HAN', 79), 1);
  assert.equal(SIM.trainingUpgradeCost('HAN', 80), 2);
  assert.equal(SIM.trainingUpgradeCost('threePT', 94), 2);
  assert.equal(SIM.trainingUpgradeCost('threePT', 95), 6);
  assert.equal(SIM.trainingUpgradeCost('CLU', 96), 6);
  assert.equal(SIM.trainingUpgradeCost('CLU', 97), 10);
  assert.equal(SIM.trainingUpgradeCost('HAN', 98), 10);
  assert.equal(SIM.trainingUpgradeCost('HAN', 99), Infinity);
});

test('training maintenance applies the tier discount without dropping below one point', () => {
  assert.equal(SIM.trainingUpgradeCost('HAN', 79, { maintenance: true }), 1);
  assert.equal(SIM.trainingUpgradeCost('HAN', 94, { maintenance: true }), 1);
  assert.equal(SIM.trainingUpgradeCost('HAN', 95, { maintenance: true }), 3);
  assert.equal(SIM.trainingUpgradeCost('HAN', 97, { maintenance: true }), 4);
});

test('training allocation conserves points and separates veteran maintenance from growth', () => {
  const attrs = { HAN: 93, PDEF: 80, POT: 90 };
  const result = SIM.calculateTrainingAllocation({
    attrs,
    allocations: { HAN: 2, PDEF: 1 },
    points: 20,
    age: 38,
    maintenanceLimits: { HAN: 2 },
    ceilings: { HAN: 97, PDEF: 97 }
  });
  assert.equal(result.valid, true);
  assert.equal(result.nextAttrs.HAN, 95);
  assert.equal(result.nextAttrs.PDEF, 81);
  assert.equal(result.regularGrowth, 1);
  assert.equal(result.spent + result.remaining, 20);
  assert.deepEqual(attrs, { HAN: 93, PDEF: 80, POT: 90 });
});

test('training points can be spent immediately without seasonal or per-attribute growth limits', () => {
  const result = SIM.calculateTrainingAllocation({
    attrs: { HAN: 80, PAS: 80 },
    allocations: { HAN: 5, PAS: 5 },
    points: 20,
    age: 38,
    ceilings: { HAN: 97, PAS: 97 }
  });
  assert.equal(result.valid, true);
  assert.equal(result.nextAttrs.HAN, 85);
  assert.equal(result.nextAttrs.PAS, 85);
  assert.equal(result.regularGrowth, 10);
  assert.equal(result.remaining, 0);
});

test('attribute proof progress unlocks 98 and a matching apex seal unlocks 99', () => {
  const aSeason = { seasonNumber: 1, games: 78, averages: { ast: 9.5, tov: 3, min: 35 }, usage: 30 };
  const secondA = { seasonNumber: 2, games: 80, averages: { ast: 10, tov: 3.1, min: 36 }, usage: 31 };
  const sSeason = { seasonNumber: 3, games: 79, averages: { ast: 12.1, tov: 3.2, min: 36 }, usage: 32 };
  assert.equal(SIM.attributeBreakthroughStatus({ key: 'PAS', current: 97, seasons: [aSeason] }).ceiling, 97);
  assert.equal(SIM.attributeBreakthroughStatus({ key: 'PAS', current: 97, seasons: [aSeason, secondA] }).ceiling, 98);
  const apex = SIM.attributeBreakthroughStatus({ key: 'PAS', current: 98, seasons: [aSeason, sSeason] });
  assert.equal(apex.ceiling, 99);
  assert.equal(apex.hasS, true);
  assert.equal(apex.seal, true);
});

test('short injury seasons do not erase breakthrough progress', () => {
  const status = SIM.attributeBreakthroughStatus({
    key: 'threePT', current: 97,
    seasons: [
      { seasonNumber: 1, games: 78, averages: { threePct: 40, tpa: 8 } },
      { seasonNumber: 2, games: 20, averages: { threePct: 20, tpa: 1 } },
      { seasonNumber: 3, games: 75, averages: { threePct: 40.5, tpa: 8.5 } }
    ]
  });
  assert.equal(status.ceiling, 98);
  assert.equal(status.proofs.length, 2);
});

test('contract market value can fall below the offer threshold', () => {
  const star = SIM.contractMarketValue({ ovr: 91, age: 27, potential: 82, availability: 0.95 });
  const decliningReserve = SIM.contractMarketValue({ ovr: 68, age: 36, potential: 60, availability: 0.45 });
  assert.ok(star > 60);
  assert.ok(decliningReserve < 10);
});

test('season stat profile responds to the matching detailed attributes', () => {
  const attrs = {
    threePT: 70, MID: 70, FIN: 70, DNK: 70, HAN: 70, PAS: 70,
    PDEF: 70, IDEF: 70, BLK: 70, REB: 70, ATH: 70, STR: 70, CLU: 70
  };
  const base = SIM.calculateStatProfile({ attrs, position: 'SF', minutes: 34, usage: 25, ovr: 82 });
  const passer = SIM.calculateStatProfile({ attrs: { ...attrs, HAN: 92, PAS: 95 }, position: 'SF', minutes: 34, usage: 25, ovr: 82 });
  const rebounder = SIM.calculateStatProfile({ attrs: { ...attrs, REB: 96, STR: 90 }, position: 'SF', minutes: 34, usage: 25, ovr: 82 });
  const scorer = SIM.calculateStatProfile({ attrs: { ...attrs, threePT: 94, MID: 92, FIN: 94, HAN: 90 }, position: 'SF', minutes: 34, usage: 25, ovr: 82 });
  assert.ok(passer.ast > base.ast * 1.15);
  assert.ok(passer.tov < base.tov * 0.93);
  assert.ok(rebounder.reb > base.reb * 1.15);
  assert.ok(scorer.fga > base.fga * 1.08);
});

test('overall is only a secondary stat stabilizer', () => {
  const attrs = Object.fromEntries(['threePT', 'MID', 'FIN', 'DNK', 'HAN', 'PAS', 'PDEF', 'IDEF', 'BLK', 'REB', 'ATH', 'STR', 'CLU'].map(key => [key, 82]));
  const low = SIM.calculateStatProfile({ attrs, position: 'PG', minutes: 34, usage: 25, ovr: 75 });
  const high = SIM.calculateStatProfile({ attrs, position: 'PG', minutes: 34, usage: 25, ovr: 95 });
  assert.ok(high.ast > low.ast);
  assert.ok(high.ast < low.ast * 1.1);
});

test('elite tail makes 99 meaningfully stronger than 97 in the matching role', () => {
  const baseAttrs = Object.fromEntries(['threePT', 'MID', 'FIN', 'DNK', 'HAN', 'PAS', 'PDEF', 'IDEF', 'BLK', 'REB', 'ATH', 'STR', 'CLU'].map(key => [key, 84]));
  const elite = SIM.calculateStatProfile({ attrs: { ...baseAttrs, PAS: 99, HAN: 99 }, position: 'SF', role: 'creator', minutes: 36, usage: 31, ovr: 94, pace: 1.04 });
  const nearElite = SIM.calculateStatProfile({ attrs: { ...baseAttrs, PAS: 97, HAN: 97 }, position: 'SF', role: 'creator', minutes: 36, usage: 31, ovr: 94, pace: 1.04 });
  assert.ok(elite.ast > nearElite.ast * 1.08);
});

test('modern elite usage produces high but bounded shot volume', () => {
  const attrs = Object.fromEntries(['threePT', 'MID', 'FIN', 'DNK', 'HAN', 'PAS', 'PDEF', 'IDEF', 'BLK', 'REB', 'ATH', 'STR', 'CLU'].map(key => [key, 97]));
  attrs.threePT = 99;
  attrs.HAN = 99;
  const profile = SIM.calculateStatProfile({ attrs, position: 'PG', minutes: 36, usage: 34, ovr: 97, role: 'creator', pace: 1.04 });
  assert.ok(profile.fga >= 20 && profile.fga <= 25, `unexpected elite shot volume: ${profile.fga}`);
});

test('point big with generational passing and rebounding can approach a triple-double', () => {
  const attrs = Object.fromEntries(['threePT', 'MID', 'FIN', 'DNK', 'HAN', 'PAS', 'PDEF', 'IDEF', 'BLK', 'REB', 'ATH', 'STR', 'CLU'].map(key => [key, 92]));
  attrs.PAS = 99;
  attrs.HAN = 99;
  attrs.REB = 99;
  attrs.STR = 99;
  const profile = SIM.calculateStatProfile({ attrs, position: 'PF', role: 'pointbig', minutes: 37, usage: 30, ovr: 97, pace: 1.04 });
  assert.ok(profile.ast >= 10);
  assert.ok(profile.reb >= 10);
});

test('historical attributes stop at 97 without sustained qualifying seasons', () => {
  const locked = SIM.historicalAttributeCeiling({ key: 'threePT', current: 97, focus: true, seasons: [{ threePct: 39, tpa: 7 }] });
  const unlocked = SIM.historicalAttributeCeiling({
    key: 'threePT', current: 97, focus: true,
    seasons: [{ threePct: 42, tpa: 9 }, { threePct: 41, tpa: 8.5 }]
  });
  assert.equal(locked.ceiling, 97);
  assert.equal(unlocked.ceiling, 98);
});

test('MVP score favors a 52-win core over a slightly better 38-win stat line', () => {
  const winner = SIM.calculateMvpScore({ ovr: 94, pts: 26.7, reb: 4.3, ast: 10.7, tov: 2, wins: 52, games: 82, trueShooting: 63 });
  const loser = SIM.calculateMvpScore({ ovr: 95, pts: 28, reb: 4.8, ast: 11.1, tov: 3, wins: 38, games: 82, trueShooting: 61 });
  assert.ok(winner.total > loser.total + 3);
});

test('scoring leader ranking is decided by points per game before other ratings', () => {
  const lowerRatedLeader = SIM.calculateScoringLeaderScore({ pts: 30, games: 78, ovr: 82 });
  const higherRatedRunnerUp = SIM.calculateScoringLeaderScore({ pts: 27.6, games: 82, ovr: 99 });
  assert.ok(lowerRatedLeader > higherRatedRunnerUp);
});

test('MVP finalists do not contain multiple stars from the same team', () => {
  const finalists = SIM.selectAwardFinalists([
    { name: 'A队核心一', teamId: 'A', awardScore: 92 },
    { name: 'A队核心二', teamId: 'A', awardScore: 90 },
    { name: 'B队核心', teamId: 'B', awardScore: 88 },
    { name: 'C队核心', teamId: 'C', awardScore: 86 }
  ], { limit: 3, maxPerTeam: 1 });
  assert.deepEqual(finalists.map(player => player.name), ['A队核心一', 'B队核心', 'C队核心']);
});

test('period scoring is the single source of play-in totals and result', () => {
  const regulation = SIM.summarizePeriodScores([
    { own: 28, opponent: 24 }, { own: 21, opponent: 27 },
    { own: 30, opponent: 25 }, { own: 22, opponent: 20 }
  ]);
  assert.equal(regulation.ownScore, 101);
  assert.equal(regulation.opponentScore, 96);
  assert.equal(regulation.won, true);
  assert.equal(regulation.complete, true);

  const tied = SIM.summarizePeriodScores([
    { own: 25, opponent: 25 }, { own: 25, opponent: 25 },
    { own: 25, opponent: 25 }, { own: 25, opponent: 25 }
  ]);
  assert.equal(tied.complete, false);
  const overtime = SIM.summarizePeriodScores([...tied.periods, { own: 12, opponent: 9 }]);
  assert.equal(overtime.ownScore, 112);
  assert.equal(overtime.opponentScore, 109);
  assert.equal(overtime.periods[4].label, 'OT1');
  assert.equal(overtime.won, true);
});

test('team wins are conserved while two elite teammates can both become MVP finalists', () => {
  const allocated = SIM.allocateWinContributions([
    { name: 'A队核心一', teamId: 'A', wins: 60, games: 80, minutes: 37, pts: 31, reb: 8, ast: 9, stl: 1.5, blk: 0.7, tov: 3, trueShooting: 63, defense: 88, ovr: 96 },
    { name: 'A队核心二', teamId: 'A', wins: 60, games: 79, minutes: 36, pts: 28, reb: 7, ast: 8, stl: 1.2, blk: 0.6, tov: 2.5, trueShooting: 62, defense: 86, ovr: 94 },
    { name: 'A队角色', teamId: 'A', wins: 60, games: 82, minutes: 20, pts: 9, reb: 4, ast: 2, stl: 0.6, blk: 0.2, tov: 1, trueShooting: 57, defense: 75, ovr: 78 },
    { name: 'B队核心', teamId: 'B', wins: 48, games: 80, minutes: 37, pts: 29, reb: 7, ast: 7, stl: 1, blk: 0.5, tov: 3, trueShooting: 61, defense: 84, ovr: 94 }
  ]);
  const teamA = allocated.filter(player => player.teamId === 'A');
  assert.equal(Math.round(teamA.reduce((sum, player) => sum + player.winContribution, 0) * 100) / 100, 60);
  const finalists = SIM.selectAwardFinalists(allocated.map(player => ({
    ...player,
    awardScore: SIM.calculateMvpScore(player).total
  })), { limit: 3, maxPerTeam: 3 });
  assert.equal(finalists.filter(player => player.teamId === 'A').length, 2);
});

test('equal user and CPU award profiles receive equal win contribution', () => {
  const shared = { teamId: 'A', wins: 50, games: 82, minutes: 35, pts: 28, reb: 7, ast: 8, stl: 1.3, blk: 0.6, tov: 2.8, trueShooting: 61, defense: 86 };
  const allocated = SIM.allocateWinContributions([
    { ...shared, id: 'user-player', name: '我', isUser: true },
    { ...shared, id: 'cpu-player', name: '电脑核心' }
  ]);
  assert.equal(allocated[0].winContribution, allocated[1].winContribution);
  assert.equal(allocated.reduce((sum, player) => sum + player.winContribution, 0), 50);
});

test('real playing time materially affects allocated win contribution', () => {
  const shared = { teamId: 'A', wins: 50, games: 82, pts: 28, reb: 7, ast: 8, stl: 1.3, blk: 0.6, tov: 2.8, trueShooting: 61, defense: 86 };
  const allocated = SIM.allocateWinContributions([
    { ...shared, id: 'real-minutes', name: '真实时间', minutes: 35 },
    { ...shared, id: 'missing-minutes', name: '缺失时间' }
  ]);
  assert.ok(allocated[0].winContribution > allocated[1].winContribution + 10);
});

test('roster balance rewards position coverage and penalizes congestion', () => {
  const balanced = ['PG', 'SG', 'SF', 'PF', 'C'].flatMap((pos, index) => [
    { id: `${pos}-1`, pos, positions: [pos], ovr: 88 - index },
    { id: `${pos}-2`, pos, positions: [pos], ovr: 79 - index }
  ]);
  const congested = Array.from({ length: 10 }, (_, index) => ({ id: `pg-${index}`, pos: 'PG', positions: ['PG'], ovr: 88 - index }));
  assert.ok(SIM.calculateRosterBalance(balanced).score > SIM.calculateRosterBalance(congested).score + 50);

  const missingCenter = balanced.filter(player => player.pos !== 'C');
  const withCenter = missingCenter.concat({ id: 'new-c', pos: 'C', positions: ['C'], ovr: 82 });
  assert.ok(SIM.calculateRosterBalance(withCenter).score > SIM.calculateRosterBalance(missingCenter).score);
});

test('All-NBA scoring balances production, efficiency, defense and team success', () => {
  const winningCore = SIM.calculateAllNbaScore({ games: 78, pts: 28, reb: 8, ast: 8, stl: 1.5, blk: 0.8, tov: 3, trueShooting: 62, wins: 56, defense: 88, ovr: 94 });
  const emptyStats = SIM.calculateAllNbaScore({ games: 78, pts: 29, reb: 7, ast: 8, stl: 1, blk: 0.4, tov: 3.5, trueShooting: 57, wins: 38, defense: 76, ovr: 92 });
  assert.ok(winningCore > emptyStats);
});

test('award scores use season performance rather than overall rating', () => {
  const season = { games: 80, minutes: 36, usage: 31, pts: 29, reb: 7, ast: 8, stl: 1.4, blk: 0.7, tov: 2.9, trueShooting: 62, wins: 54, defense: 88, winContribution: 12 };
  assert.equal(SIM.calculateAllNbaScore({ ...season, ovr: 80 }), SIM.calculateAllNbaScore({ ...season, ovr: 99 }));
  assert.equal(SIM.calculateMvpScore({ ...season, ovr: 80 }).total, SIM.calculateMvpScore({ ...season, ovr: 99 }).total);
});

test('elite defense adds MVP value without replacing clear offensive dominance', () => {
  const defender = SIM.calculateMvpScore({ games: 80, usage: 27, pts: 24, reb: 8, ast: 5, stl: 2.2, blk: 1.6, tov: 2.2, trueShooting: 59, wins: 53, defense: 97, winContribution: 11 });
  const neutralDefense = SIM.calculateMvpScore({ games: 80, usage: 27, pts: 24, reb: 8, ast: 5, stl: 1, blk: 0.5, tov: 2.2, trueShooting: 59, wins: 53, defense: 75, winContribution: 11 });
  const offensiveLeader = SIM.calculateMvpScore({ games: 80, usage: 34, pts: 32, reb: 7, ast: 10, stl: 1.1, blk: 0.4, tov: 3.2, trueShooting: 63, wins: 53, defense: 80, winContribution: 12 });
  assert.ok(defender.total > neutralDefense.total + 2);
  assert.ok(offensiveLeader.total > defender.total);
});

test('MVP winner is always All-NBA first team and other finalists cannot fall below second team', () => {
  const players = Array.from({ length: 18 }, (_, index) => ({
    id: `all-nba-${index}`,
    name: `球员${index}`,
    teamId: `T${index}`,
    games: 75,
    pts: 32 - index * 0.6,
    reb: 8,
    ast: 7,
    stl: 1,
    blk: 0.5,
    tov: 2.8,
    trueShooting: 60,
    wins: 52,
    defense: 82,
    ovr: 92
  }));
  const mvpFinalists = [players[14], players[15], players[16]];
  const selections = SIM.selectAllNbaTeams(players, { mvpFinalists });
  assert.equal(selections.find(player => player.id === players[14].id).allNbaTeam, 1);
  assert.equal(selections.find(player => player.id === players[15].id).allNbaTeam, 2);
  assert.equal(selections.find(player => player.id === players[16].id).allNbaTeam, 2);
  assert.equal(selections.length, 15);
});

test('generational playmaking unlocks higher offensive involvement and team impact', () => {
  const elite = SIM.calculateOffensiveUsage({
    ovr: 97, teamCoreOvr: 90, scoring: 92, playmaking: 99, minutes: 36, rank: 1, archetypeBonus: 3.5
  });
  const ordinary = SIM.calculateOffensiveUsage({
    ovr: 97, teamCoreOvr: 90, scoring: 92, playmaking: 86, minutes: 36, rank: 1, archetypeBonus: 3.5
  });
  assert.ok(elite.usage >= 39, `unexpected elite usage: ${elite.usage}`);
  assert.ok(elite.usage > ordinary.usage + 5);
  assert.ok(elite.ceiling > 40);
  const impact = SIM.calculatePlaymakingImpact([
    { minutes: 36, usage: elite.usage, attrs: { PAS: 99, HAN: 99 } }
  ]);
  assert.ok(impact >= 1.4);
});

test('franchise icon retention survives late-career market decline', () => {
  const icon = SIM.calculateMotherTeamRetention({ tenure: 18, relationship: 90, legacyScore: 610, franchiseRank: 1, franchiseStatus: '队史第一人', championships: 2, tradeRequests: 0 });
  const estranged = SIM.calculateMotherTeamRetention({ tenure: 18, relationship: 25, legacyScore: 80, championships: 0, tradeRequests: 3 });
  assert.equal(icon.guaranteed, true);
  assert.ok(icon.probability >= 0.98);
  assert.ok(estranged.probability < 0.6);
});

test('long tenure alone cannot pass a real franchise legend', () => {
  const standing = SIM.calculateFranchiseStanding({
    score: 170,
    seasons: 18,
    consecutive: 18,
    championships: 0,
    majorAwards: 0,
    legends: [
      { name: '真实队史第一人', score: 600 },
      { name: '真实队史第二人', score: 480 },
      { name: '真实队史第三人', score: 420 },
      { name: '真实队史第四人', score: 360 },
      { name: '真实队史第五人', score: 300 }
    ]
  });
  assert.equal(standing.status, '功勋球员');
  assert.equal(standing.firstEligible, false);
  assert.equal(standing.rankLabel, '暂未进入队史前 5');
});

test('a historic championship career can legitimately become franchise number one', () => {
  const standing = SIM.calculateFranchiseStanding({
    score: 705,
    seasons: 15,
    consecutive: 15,
    championships: 3,
    majorAwards: 4,
    legends: [{ name: '迈克尔-乔丹', score: 700 }, { name: '斯科蒂-皮蓬', score: 560 }]
  });
  assert.equal(standing.rank, 1);
  assert.equal(standing.status, '队史第一人');
  assert.equal(standing.firstEligible, true);
});

test('two core titles guarantee a top-two place for a previously titleless franchise', () => {
  const standing = SIM.calculateFranchiseStanding({
    score: 210,
    seasons: 7,
    consecutive: 7,
    championships: 2,
    majorAwards: 0,
    historicalChampionships: 0,
    coreChampionships: 2,
    legends: [620, 510, 430, 350, 280].map((score, index) => ({ name: `功勋${index + 1}`, score }))
  });
  assert.equal(standing.rawRank, 6);
  assert.equal(standing.rank, 2);
  assert.equal(standing.status, '队史前三');
  assert.equal(standing.championshipGuaranteeApplied, true);
});

test('one core title guarantees top three for a previously titleless franchise', () => {
  const standing = SIM.calculateFranchiseStanding({
    score: 180,
    seasons: 5,
    championships: 1,
    historicalChampionships: 0,
    coreChampionships: 1,
    legends: [620, 510, 430, 350, 280].map((score, index) => ({ name: `功勋${index + 1}`, score }))
  });
  assert.equal(standing.rank, 3);
  assert.equal(standing.status, '队史前三');
});

test('bench titles add legacy points but do not trigger core-title rank protection', () => {
  const score = SIM.calculateFranchiseLegacyScore({
    historicalChampionships: 0,
    seasons: [
      { games: 60, ovr: 72, wins: 50, champion: true, averages: { pts: 4, reb: 2, ast: 1, min: 10 }, awards: [] },
      { games: 55, ovr: 73, wins: 52, champion: true, averages: { pts: 5, reb: 2, ast: 1, min: 11 }, awards: [] }
    ]
  });
  const standing = SIM.calculateFranchiseStanding({
    score: score.total,
    seasons: 2,
    championships: 2,
    historicalChampionships: 0,
    coreChampionships: score.coreChampionships,
    legends: [620, 510, 430, 350, 280].map((legendScore, index) => ({ name: `功勋${index + 1}`, score: legendScore }))
  });
  assert.equal(score.coreChampionships, 0);
  assert.equal(standing.championshipGuaranteeApplied, false);
  assert.ok(standing.rank > 3);
});

test('three core titles cannot make a player number one without passing the leader', () => {
  const standing = SIM.calculateFranchiseStanding({
    score: 590,
    seasons: 12,
    championships: 3,
    majorAwards: 3,
    historicalChampionships: 0,
    coreChampionships: 3,
    legends: [{ name: '真实队史第一人', score: 600 }, { name: '真实队史第二人', score: 480 }]
  });
  assert.equal(standing.rank, 2);
  assert.equal(standing.firstEligible, false);
  assert.equal(standing.status, '队史前三');
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

test('a short low-production career is not called reliable', () => {
  const history = Array.from({ length: 4 }, (_, index) => ({
    seasonNumber: index + 1,
    age: 18 + index,
    ovr: 45 + index,
    games: 82,
    wins: 24,
    averages: { min: 8.2 },
    champion: false,
    postseason: '无缘季后赛'
  }));
  const legacy = SIM.calculateCareerLegacy({
    history,
    totals: { pts: 912, reb: 287, ast: 333 },
    awardCounts: {},
    championships: 0,
    peakOVR: 48,
    totalGames: 328
  });
  assert.equal(legacy.tier.title, '未能站稳联盟');
  assert.equal(legacy.tier.top30, undefined);
  assert.ok(legacy.careerPpg < 3);
});

test('top 25 historical careers stay in the formal commentary group', () => {
  const history = Array.from({ length: 15 }, (_, index) => ({
    seasonNumber: index + 1,
    age: 18 + index,
    ovr: 96,
    games: 80,
    wins: 58,
    averages: { min: 36 },
    champion: index < 2,
    postseason: index < 2 ? '总冠军' : '分区决赛止步'
  }));
  const legacy = SIM.calculateCareerLegacy({
    history,
    totals: { pts: 36000, reb: 9000, ast: 8500 },
    awardCounts: { '最有价值球员': 2, '最佳阵容': 12, '常规赛得分王': 3 },
    championships: 2,
    peakOVR: 98,
    totalGames: 1200
  });
  assert.equal(legacy.tier.top30, true);
  assert.match(legacy.tier.rank, /历史前 (3|10|25)/);
});

test('career titles expose achieved evidence and the next unmet condition', () => {
  const history = Array.from({ length: 16 }, (_, index) => ({
    seasonNumber: index + 1,
    age: 18 + index,
    ovr: index < 13 ? 96 : 88,
    games: 78,
    champion: index < 2,
    postseason: index < 2 ? '总冠军' : (index < 5 ? '分区决赛止步' : '首轮止步')
  }));
  const career = careerFixture({
    history,
    totals: { pts: 32000, reb: 8200, ast: 7600 },
    awardCounts: { '最有价值球员': 2, '最佳阵容': 11 },
    championships: 2,
    peakOVR: 98,
    totalGames: 1248,
    teamsPlayed: ['BOS']
  });
  const titles = SIM.calculateCareerTitles(career);
  const names = titles.achieved.map(item => item.title);
  assert.ok(names.includes('联盟门面'));
  assert.ok(names.includes('冠军核心'));
  assert.ok(names.includes('球队图腾'));
  assert.ok(names.includes('数据巨匠'));
  assert.equal(typeof titles.achieved[0].reason, 'string');
  assert.equal(typeof titles.next.requirement, 'string');
});

test('career title conditions do not award empty prestige labels', () => {
  const titles = SIM.calculateCareerTitles(careerFixture({
    history: Array.from({ length: 4 }, (_, index) => ({ seasonNumber: index + 1, age: 18 + index, ovr: 68, games: 40 })),
    totals: { pts: 800, reb: 300, ast: 180 },
    awardCounts: {},
    championships: 0,
    peakOVR: 70,
    totalGames: 160,
    teamsPlayed: ['WAS', 'DET']
  }));
  assert.equal(titles.achieved.length, 0);
  assert.equal(titles.next.title, '联盟门面');
});

test('Finals MVP scoring rewards complete championship-series production', () => {
  const scorer = SIM.calculateFinalsMvpScore({ games: 6, pts: 31.2, reb: 6.1, ast: 5.4, stl: 1.2, blk: 0.5, tov: 3.1, min: 39, fgPct: 49.2 });
  const complete = SIM.calculateFinalsMvpScore({ games: 6, pts: 27.4, reb: 10.8, ast: 8.7, stl: 1.8, blk: 1.1, tov: 2.4, min: 40, fgPct: 52.1 });
  assert.ok(complete > scorer);
});

test('early retirement requires both career tenure and a decline condition', () => {
  assert.equal(SIM.retirementEligibility({ age: 27, currentOvr: 96, peakOvr: 97, seasons: 9, minutes: 36 }).eligible, false);
  assert.equal(SIM.retirementEligibility({ age: 35, currentOvr: 83, peakOvr: 96, seasons: 4, minutes: 25 }).eligible, false);
  const veteran = SIM.retirementEligibility({ age: 33, currentOvr: 76, peakOvr: 94, seasons: 15, minutes: 13 });
  assert.equal(veteran.eligible, true);
  assert.ok(veteran.reasons.length >= 2);
});
