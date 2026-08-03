'use strict';

const fs = require('node:fs');
const path = require('node:path');
const SIM = require('../sim-core.js');

let seed = 0x5eed2026;
function random() {
  const result = SIM.nextRandom(seed);
  seed = result.seed;
  return result.value;
}

function simulateSeries(ownSeed, opponentSeed, ownWins, opponentWins, samples = 100000) {
  let upsetWins = 0;
  for (let sample = 0; sample < samples; sample += 1) {
    let ownSeriesWins = 0;
    let opponentSeriesWins = 0;
    while (ownSeriesWins < 4 && opponentSeriesWins < 4) {
      const gameNumber = ownSeriesWins + opponentSeriesWins + 1;
      const homeCourt = [1, 2, 5, 7].includes(gameNumber);
      const probability = SIM.seriesWinProbability(84, 84, 0, { ownSeed, opponentSeed, ownWins, opponentWins, homeCourt });
      if (random() < probability) ownSeriesWins += 1;
      else opponentSeriesWins += 1;
    }
    if (opponentSeriesWins === 4) upsetWins += 1;
  }
  return Math.round(upsetWins / samples * 10000) / 100;
}

function validateMvp(samples = 10000) {
  let strongerRecordWins = 0;
  for (let index = 0; index < samples; index += 1) {
    const goodTeam = SIM.calculateMvpScore({
      pts: 27 + random() * 3, reb: 7 + random() * 2, ast: 7 + random() * 2,
      tov: 3, trueShooting: 59, wins: 52, games: 76, ovr: 93
    }).total + (random() - 0.5) * 1.1;
    const poorTeam = SIM.calculateMvpScore({
      pts: 29 + random() * 3, reb: 7 + random() * 2, ast: 7 + random() * 2,
      tov: 3.2, trueShooting: 59, wins: 38, games: 76, ovr: 93
    }).total + (random() - 0.5) * 1.1;
    if (goodTeam > poorTeam) strongerRecordWins += 1;
  }
  return Math.round(strongerRecordWins / samples * 10000) / 100;
}

function statProfiles() {
  const elite = { threePT: 99, MID: 97, FIN: 97, DNK: 88, HAN: 99, PAS: 99, PDEF: 82, IDEF: 74, BLK: 55, REB: 93, ATH: 93, STR: 86, CLU: 98 };
  const common = { ...elite, threePT: 90, MID: 90, FIN: 90, HAN: 90, PAS: 90, REB: 84, CLU: 90 };
  return {
    eliteCreator: SIM.calculateStatProfile({ attrs: elite, position: 'PG', minutes: 36, usage: 34, ovr: 97, role: 'creator', pace: 1.04 }),
    allStarCreator: SIM.calculateStatProfile({ attrs: common, position: 'PG', minutes: 36, usage: 30, ovr: 91, role: 'creator', pace: 1.04 }),
    elitePointBig: SIM.calculateStatProfile({ attrs: elite, position: 'C', minutes: 36, usage: 30, ovr: 97, role: 'pointbig', pace: 1.04 })
  };
}

const playoff = {
  '1v8': simulateSeries(1, 8, 58, 42),
  '2v7': simulateSeries(2, 7, 54, 44),
  '3v6': simulateSeries(3, 6, 50, 46),
  '4v5': simulateSeries(4, 5, 48, 47)
};
const report = {
  generatedAt: new Date().toISOString(),
  seed: '0x5eed2026',
  samples: { eachPlayoffMatchup: 100000, mvpCases: 10000 },
  playoffUpsetPercent: playoff,
  mvpBetterRecordWinnerPercent: validateMvp(),
  statProfiles: statProfiles(),
  retention: {
    twelveYearVeteran: SIM.calculateMotherTeamRetention({ tenure: 12, relationship: 78, legacyScore: 105, championships: 1 }),
    franchiseIcon: SIM.calculateMotherTeamRetention({ tenure: 18, relationship: 90, legacyScore: 210, championships: 2 }),
    estrangedVeteran: SIM.calculateMotherTeamRetention({ tenure: 15, relationship: 28, legacyScore: 90, tradeRequests: 3 })
  }
};

const targets = { '1v8': [8, 12], '2v7': [15, 22], '3v6': [25, 32], '4v5': [40, 50] };
report.playoffPass = Object.fromEntries(Object.entries(targets).map(([key, range]) => [key, playoff[key] >= range[0] && playoff[key] <= range[1]]));
report.pass = Object.values(report.playoffPass).every(Boolean) && report.mvpBetterRecordWinnerPercent >= 95;

const outputDirectory = path.join(__dirname, '..', 'reports');
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, 'p0-p1-validation.json'), `${JSON.stringify(report, null, 2)}\n`);
const markdown = `# P0-P1 批量验证报告

- 固定随机种子：\`${report.seed}\`
- 季后赛每类对阵：100,000 组
- MVP 固定类型样本：10,000 组

| 项目 | 结果 | 目标 | 是否通过 |
| --- | ---: | ---: | --- |
| 1/8 爆冷率 | ${playoff['1v8']}% | 8%-12% | ${report.playoffPass['1v8'] ? '是' : '否'} |
| 2/7 爆冷率 | ${playoff['2v7']}% | 15%-22% | ${report.playoffPass['2v7'] ? '是' : '否'} |
| 3/6 爆冷率 | ${playoff['3v6']}% | 25%-32% | ${report.playoffPass['3v6'] ? '是' : '否'} |
| 4/5 爆冷率 | ${playoff['4v5']}% | 40%-50% | ${report.playoffPass['4v5'] ? '是' : '否'} |
| 52胜核心压过38胜轻微数据领先者 | ${report.mvpBetterRecordWinnerPercent}% | >=95% | ${report.mvpBetterRecordWinnerPercent >= 95 ? '是' : '否'} |

> 此报告验证纯函数模型。完整20年浏览器生涯仍需通过前端调试入口执行视觉与存档回归。
`;
fs.writeFileSync(path.join(outputDirectory, 'p0-p1-validation.md'), markdown);

if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(report, null, 2));
}
