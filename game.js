(function () {
  'use strict';

  const DATA = window.GAME_DATA;
  const SIM = window.SIM_CORE;
  const app = document.getElementById('app');
  const modalRoot = document.getElementById('modal-root');
  const toastEl = document.getElementById('toast');
  const backBtn = document.getElementById('back-btn');
  const homeBtn = document.getElementById('home-btn');
  const soundBtn = document.getElementById('sound-btn');
  const SAVE_KEY = 'build-a-player-save-v5';
  const LEGACY_SAVE_KEYS = ['build-a-player-save-v4', 'build-a-player-save-v3'];
  const SAVE_SCHEMA_VERSION = 5;
  const HONOR_KEY = 'build-a-player-honors-v1';
  const CAREER_SEASONS = 20;
  const CAREER_START_AGE = 18;
  const POSITION_ARCHETYPES = {
    PG: ['creator', 'sniper', 'slasher', 'twoway'],
    SG: ['sniper', 'creator', 'slasher', 'wing', 'twoway'],
    SF: ['wing', 'twoway', 'sniper', 'slasher', 'creator'],
    PF: ['wing', 'slasher', 'anchor', 'big', 'twoway', 'pointbig'],
    C: ['anchor', 'big', 'pointbig']
  };
  const POSITION_ARCHETYPE_LABELS = {
    PG: { creator: '持球发动机', sniper: '投射型控卫', slasher: '突破型控卫', twoway: '双向控卫' },
    SG: { sniper: '空间狙击手', creator: '持球得分手', slasher: '强力突破手', wing: '攻防一体侧翼', twoway: '双向后卫' },
    SF: { wing: '攻防一体锋线', twoway: '双向锋线', sniper: '空间型锋线', slasher: '冲击型锋线', creator: '持球核心' },
    PF: { wing: '全能前锋', slasher: '冲击型大前锋', anchor: '协防型内线', big: '低位终结者', twoway: '双向大前锋', pointbig: '组织型内线' },
    C: { anchor: '禁区守护者', big: '低位巨兽', pointbig: '全能策应中锋' }
  };
  const POSITION_ORDER = ['PG', 'SG', 'SF', 'PF', 'C'];
  const POSITION_DECAY_FACTORS = [1, 0.97, 0.92, 0.86, 0.70];
  const ROTATION_MINUTES = [36, 34, 32, 30, 27, 24, 21, 18, 14, 10];
  const INJURY_LABELS = {
    light: '轻度伤病',
    severe: '重度伤病',
    devastating: '毁灭性伤病'
  };
  const ROOKIE_FIRST_NAMES = ['杰伦', '凯登', '马库斯', '德文', '特雷', '以赛亚', '卡梅伦', '安德烈', '科比', '贾马尔', '达里厄斯', '泰勒', '诺阿', '布兰登', '乔丹', '迈尔斯', '奥斯汀', '德里克', '朱利安', '阿伦'];
  const ROOKIE_LAST_NAMES = ['布朗', '约翰逊', '威廉姆斯', '戴维斯', '米切尔', '霍尔', '沃克', '刘易斯', '克拉克', '罗宾逊', '杨', '格林', '怀特', '哈里斯', '马丁', '汤普森', '安德森', '托马斯', '摩尔', '杰克逊', '贝克', '库珀', '里德', '金', '赖特', '斯科特', '亚当斯', '希尔', '卡特', '特纳'];
  const INITIAL_ROOKIES = new Set(['库珀-弗拉格', '康-克尼普尔', 'VJ-埃奇库姆', '迪伦-哈珀', '埃斯-贝利', '特雷-约翰逊', '杰里迈亚-费尔斯', '德里克-奎因', '卡特-布莱恩特']);

  let audioContext = null;
  let toastTimer = null;
  let spinTimer = null;
  const simulationTimers = new Set();
  let debugCareerMode = false;
  let state = freshState();

  function freshState() {
    return {
      screen: 'home',
      eraKey: 'current',
      resumeScreen: null,
      schemaVersion: SAVE_SCHEMA_VERSION,
      sound: true,
      rngState: 0,
      position: null,
      attrs: {},
      attrSlots: {},
      lockedCount: 0,
      rerolls: 3,
      currentTeam: null,
      selectedPlayer: null,
      candidatePlayers: [],
      seenCandidatePlayers: [],
      usedPlayers: [],
      visitedTeams: [],
      finalOVR: null,
      archetype: null,
      similarPlayers: [],
      careerTeam: null,
      career: null,
      season: null
    };
  }

  function freshPlayerTotals() {
    return { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, min: 0 };
  }

  function buildDebugCareerState(targetSeason) {
    const debugState = freshState();
    const source = DATA.PLAYERS.OKC[0];
    const perSeasonTotals = { pts: 2296, reb: 492, ast: 738, stl: 123, blk: 41, tov: 205, fgm: 816, fga: 1640, tpm: 205, tpa: 492, ftm: 459, fta: 533, min: 2870 };
    const history = Array.from({ length: Math.max(0, targetSeason - 1) }, (_, index) => ({
      seasonNumber: index + 1,
      age: CAREER_START_AGE + index,
      teamId: index > 8 ? 'NYK' : 'OKC',
      ovr: Math.max(82, 91 + Math.min(index, 7) - Math.max(0, index - 12)),
      potential: 97,
      games: 82,
      wins: 50,
      losses: 32,
      seed: 4,
      totals: { ...perSeasonTotals },
      averages: averagesFromTotals(perSeasonTotals, 82),
      awards: index % 4 === 0 ? ['最佳阵容'] : [],
      champion: index === 6,
      postseason: index === 6 ? '总冠军' : '分区半决赛止步'
    }));
    const careerTotals = freshPlayerTotals();
    history.forEach(entry => Object.keys(careerTotals).forEach(key => { careerTotals[key] += entry.totals[key]; }));
    debugState.screen = 'season';
    debugState.resumeScreen = 'season';
    debugState.position = 'PG';
    debugState.attrs = Object.fromEntries(DATA.ATTRS.map(([key]) => [key, source[key]]));
    debugState.attrs.POT = 97;
    debugState.lockedCount = DATA.ATTRS.length;
    debugState.finalOVR = Math.round(DATA.ATTRS.reduce((sum, [key], index) => (
      sum + (debugState.attrs[key] || 0) * DATA.POSITION_WEIGHTS.PG[index]
    ), 0));
    debugState.archetype = { key: 'creator', ...DATA.ARCHETYPES.creator };
    debugState.similarPlayers = [];
    debugState.careerTeam = targetSeason > 9 ? 'NYK' : 'OKC';
    debugState.career = {
      startYear: DATA.getEra(debugState.eraKey).startYear,
      seasonNumber: targetSeason,
      age: CAREER_START_AGE + targetSeason - 1,
      currentTeam: debugState.careerTeam,
      currentOVR: debugState.finalOVR,
      peakOVR: 98,
      potential: 97,
      contract: { yearsRemaining: 1, totalYears: 4, annualSalary: 38 },
      history,
      transactions: [
        { season: 1, age: 18, type: '新秀签约', teamId: 'OKC', text: '以新秀身份加盟俄克拉荷马雷霆，签下 4 年合同' },
        ...(targetSeason > 9 ? [{ season: 10, age: 27, type: '交易', teamId: 'NYK', text: '被交易至纽约尼克斯' }] : [])
      ],
      totals: careerTotals,
      totalGames: history.length * 82,
      awardCounts: { '最佳阵容': Math.ceil(history.length / 4), '最有价值球员': targetSeason > 8 ? 2 : 0 },
      championships: history.filter(entry => entry.champion).length,
      teamsPlayed: targetSeason > 9 ? ['OKC', 'NYK'] : ['OKC'],
      luck: 72,
      injuries: [],
      tradeRequestFailures: 0,
      tradeCounterpartIds: [],
      recentDepartures: [],
      teamRelationships: { [debugState.careerTeam]: 65 },
      pendingOffseason: null,
      minutesPenaltyNextSeason: 0,
      forcedRetirement: false,
      completed: false,
      lastOffseasonNote: '测试生涯状态'
    };
    debugState.season = {
      stage: 'ended', seasonNumber: targetSeason, age: debugState.career.age, teamId: debugState.careerTeam, ovrAtStart: debugState.finalOVR,
      schedule: [], wins: 52, losses: 30, seed: 3, playerTotals: { ...perSeasonTotals, min: 2870 }, playerGames: 82,
      roleProfile: { minutes: 35, usage: 31, role: '绝对核心', rotationRank: 1, penalty: 0, teamRotationAverage: 82 },
      injuryStatus: null, injuries: [], playoffRound: 1,
      series: [{ label: '分区半决赛', opponent: 'BOS', won: false, score: '2-4' }], postSeasonStage: 'ended',
      awards: [{ label: '最佳阵容', short: 'ALL', winner: '我', detail: '最佳阵容一阵', isUser: true }],
      isSimulating: false, playInSimulation: null, seriesSimulation: null, ended: true, champion: false, archived: false,
      offseasonNote: '测试赛季已完成'
    };
    return debugState;
  }

  function activateAwardDebugState(targetSeason) {
    state = buildDebugCareerState(targetSeason);
    state.career.league = createLeagueState();
    for (let seasonNumber = 1; seasonNumber <= targetSeason; seasonNumber += 1) {
      state.career.seasonNumber = seasonNumber;
      state.season.seasonNumber = seasonNumber;
      state.season.awards = buildSeasonAwards();
      if (seasonNumber < targetSeason) evolveLeagueSeason(state.career.league, seasonNumber + 1);
    }
    state.career.seasonNumber = targetSeason;
    state.season.seasonNumber = targetSeason;
    state.season.stage = 'awards';
    state.season.postSeasonStage = 'playoffs';
    state.season.seed = 3;
  }

  function activatePlayoffDebugState() {
    state = buildDebugCareerState(1);
    state.finalOVR = 99;
    state.career.currentOVR = 99;
    state.career.league = createLeagueState();
    state.season.stage = 'playoffs';
    state.season.postSeasonStage = 'playoffs';
    state.season.playoffRound = 0;
    state.season.series = [];
    state.season.ended = false;
    state.season.champion = false;
  }

  function activateInjuryDebugState(type) {
    state = buildDebugCareerState(1);
    state.season = {
      ...state.season,
      stage: 'regular',
      schedule: createSeasonSchedule(state.careerTeam),
      wins: 0,
      losses: 0,
      seed: null,
      playerTotals: freshPlayerTotals(),
      playerGames: 0,
      injuryStatus: null,
      injuries: [],
      series: [],
      awards: [],
      isSimulating: false,
      ended: false,
      archived: false
    };
    state.season.roleProfile = buildSeasonRoleProfile();
  }

  function activateArchetypeDebugState(position) {
    state = freshState();
    state.position = position;
    state.attrs = Object.fromEntries(DATA.ATTRS.map(([key], index) => [key, key === 'POT' ? 99 : DATA.ARCHETYPES.pointbig.values[index]]));
    state.lockedCount = DATA.ATTRS.length;
    finalizePlayer();
    state.screen = 'reveal';
    state.resumeScreen = 'reveal';
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function random() {
    const holder = state.career || state;
    if (!Number.isFinite(holder.rngState) || holder.rngState === 0) holder.rngState = hashText(`${state.eraKey}-${Date.now()}-${Math.random()}`);
    const roll = SIM.nextRandom(holder.rngState);
    holder.rngState = roll.seed;
    return roll.value;
  }

  function startSimulationTimer(callback, delay) {
    const timer = window.setInterval(callback, delay);
    simulationTimers.add(timer);
    return timer;
  }

  function stopSimulationTimer(timer) {
    window.clearInterval(timer);
    simulationTimers.delete(timer);
  }

  function stopSimulationTimers() {
    simulationTimers.forEach(timer => window.clearInterval(timer));
    simulationTimers.clear();
  }

  function localDebugParam(name) {
    if (!['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)) return null;
    return new URLSearchParams(window.location.search).get(name);
  }

  function cloneTemplate(id) {
    const template = document.getElementById(id);
    return template.content.cloneNode(true);
  }

  function showScreen(name) {
    const previousScreen = state.screen;
    if (previousScreen === 'season' && name !== 'season' && state.season) {
      stopSimulationTimers();
      state.season.isSimulating = false;
      state.season.playInSimulation = null;
      state.season.seriesSimulation = null;
    }
    if (name === 'home' && !['home', 'honors'].includes(previousScreen)) state.resumeScreen = previousScreen;
    if (name !== 'home' && name !== 'honors') state.resumeScreen = name;
    state.screen = name;
    backBtn.classList.toggle('is-hidden', name === 'home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (name === 'home') renderHome();
    if (name === 'era') renderEraSelect();
    if (name === 'position') renderPosition();
    if (name === 'build') renderBuild();
    if (name === 'reveal') renderReveal();
    if (name === 'career') renderCareer();
    if (name === 'season') renderSeason();
    if (name === 'honors') renderHonors();
    saveGame();
  }

  function renderHome() {
    app.replaceChildren(cloneTemplate('home-template'));
    const continueBtn = app.querySelector('[data-action="continue"]');
    const saved = loadStoredGame();
    continueBtn.disabled = !saved || (!saved.resumeScreen && saved.screen === 'home');
    continueBtn.title = continueBtn.disabled ? '暂无可继续的进度' : '继续最近一次游戏';
  }

  function renderEraSelect() {
    app.replaceChildren(cloneTemplate('era-template'));
  }

  function renderPosition() {
    app.replaceChildren(cloneTemplate('position-template'));
    if (state.eraKey !== 'current') {
      const era = DATA.getEra(state.eraKey);
      app.querySelector('.step-label').textContent = `${era.label.toUpperCase()} · STEP 01 / 03`;
      app.querySelector('.subtitle').textContent = `${era.seasonLabel} 赛季名单 · 属性按最近适配位置计算`;
    }
    const grid = document.getElementById('position-grid');
    Object.entries(DATA.POSITIONS).forEach(([key, pos]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `position-card${state.position === key ? ' is-selected' : ''}`;
      button.dataset.position = key;
      button.innerHTML = `<b>${pos.icon} ${key}</b><strong>${pos.name}</strong><small>${pos.desc}</small>`;
      grid.append(button);
    });
    document.getElementById('confirm-position').disabled = !state.position;
  }

  function renderBuild() {
    app.replaceChildren(cloneTemplate('build-template'));
    document.getElementById('position-stamp').textContent = state.position;
    updateBuildUI();
  }

  function updateBuildUI() {
    const locked = document.getElementById('locked-count');
    if (!locked) return;
    locked.textContent = String(state.lockedCount);
    document.getElementById('progress-fill').style.width = `${state.lockedCount / DATA.ATTRS.length * 100}%`;
    document.getElementById('reroll-count').textContent = `换人 ${state.rerolls} 次`;
    document.getElementById('ovr-preview').textContent = state.lockedCount ? String(calculateOVR(true)) : '--';
    renderAttributeList();
    renderSlotResult();
    renderRoster();
  }

  function renderAttributeList() {
    const list = document.getElementById('attribute-list');
    list.replaceChildren();
    DATA.ATTRS.forEach(([key, name, desc]) => {
      const lockedValue = state.attrs[key];
      const source = state.attrSlots[key];
      const previewValue = lockedValue == null && state.selectedPlayer
        ? positionAdjustedAttribute(state.selectedPlayer, key).value
        : null;
      const displayValue = lockedValue != null ? lockedValue : previewValue;
      const sourceName = source
        ? source.player
        : (state.selectedPlayer ? '预览' : '待选择');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `attribute-slot${lockedValue != null ? ' is-locked' : ''}${previewValue != null ? ' is-preview' : ''}`;
      button.dataset.attribute = key;
      button.title = lockedValue != null
        ? `${desc} · 来自${source.player}`
        : (previewValue != null
          ? `${desc} · 预览值${previewValue} · 点击锁定`
          : `${desc} · 选择球员后点击锁定`);
      button.disabled = lockedValue != null || !state.selectedPlayer;
      const displayGrade = displayValue != null ? DATA.grade(displayValue) : null;
      const valueColor = displayGrade ? displayGrade.color : '';
      button.innerHTML = `
        <span class="attr-cn">${name}</span>
        <span class="attr-source">${sourceName}</span>
        <span class="attr-value" style="color:${valueColor}">${displayGrade ? `<small>${displayGrade.label}</small><b>${displayValue}</b>` : '<b>--</b>'}</span>`;
      list.append(button);
    });
  }

  function renderSlotResult() {
    const result = document.getElementById('slot-result');
    const spinButton = document.getElementById('spin-team');
    result.classList.remove('is-spinning');
    if (!state.currentTeam) {
      result.innerHTML = '<span class="slot-placeholder">?</span><b>等待抽签</b>';
      spinButton.disabled = false;
      spinButton.textContent = '拉杆抽队';
      return;
    }
    const team = DATA.getTeam(state.currentTeam);
    result.innerHTML = `<img src="${team.logo}" alt="${team.name}队标"><div><b>${team.name}</b><small>${team.id} · ${team.conference === 'EAST' ? '东部' : '西部'}</small></div>`;
    spinButton.disabled = true;
    spinButton.textContent = '锁定属性后继续';
  }

  function shuffledPlayers(players) {
    const result = [...players];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function prepareCandidateBatch(teamId, isReroll) {
    const available = DATA.PLAYERS[teamId].filter(player => !state.usedPlayers.includes(player.name));
    const seenNames = new Set(state.seenCandidatePlayers || []);
    const pool = isReroll ? available.filter(player => !seenNames.has(player.name)) : available;
    if (isReroll && pool.length < 5) return [];
    const batch = shuffledPlayers(pool).slice(0, 5);

    state.candidatePlayers = batch.map(player => player.name);
    state.seenCandidatePlayers = [...new Set([...(state.seenCandidatePlayers || []), ...state.candidatePlayers])];
    return batch;
  }

  function canRerollCandidates(teamId) {
    if (!teamId || state.rerolls <= 0) return false;
    const seenNames = new Set(state.seenCandidatePlayers || []);
    return DATA.PLAYERS[teamId].filter(player => (
      !state.usedPlayers.includes(player.name) && !seenNames.has(player.name)
    )).length >= 5;
  }

  function renderRoster() {
    const panel = document.getElementById('roster-panel');
    if (!state.currentTeam) {
      panel.innerHTML = '<div class="empty-state"><div class="mini-ball" aria-hidden="true"></div><p>抽到球队后，从球员中挑选一人</p><small>再点击左侧未锁定的属性</small></div>';
      return;
    }
    const team = DATA.getTeam(state.currentTeam);
    if (!state.candidatePlayers || state.candidatePlayers.length !== 5) prepareCandidateBatch(state.currentTeam, false);
    const roster = state.candidatePlayers
      .map(name => DATA.PLAYERS[state.currentTeam].find(player => player.name === name))
      .filter(Boolean);
    panel.innerHTML = `
      <div class="roster-header">
        <div><img src="${team.logo}" alt=""><strong>${team.name}</strong></div>
        <button class="text-btn" type="button" data-action="reroll" ${canRerollCandidates(state.currentTeam) ? '' : 'disabled'}>换一批 · ${state.rerolls}</button>
      </div>
      <div class="player-list">
        ${roster.map(player => playerCardHTML(player, team)).join('')}
      </div>
      <p class="selection-help${state.selectedPlayer ? ' is-ready' : ''}">${state.selectedPlayer ? `已选 ${state.selectedPlayer.name}，现在点击左侧属性锁定` : '先选择一名球员，再夺取他的一项属性'}</p>`;
  }

  function playerCardHTML(player, team) {
    const selected = state.selectedPlayer && state.selectedPlayer.name === player.name;
    const positions = (player.positions || [player.pos]).join(' / ');
    return `
      <button class="player-card${selected ? ' is-selected' : ''}" type="button" data-player="${player.name}">
        <span class="player-avatar" style="--team-color:${team.primary}">${initials(player.name)}</span>
        <span class="player-meta"><strong>${player.name}</strong><small>${positions} · ${player.archetypeLabel}</small></span>
        <span class="player-ovr"><b>${player.ovr}</b><small>OVR</small></span>
      </button>`;
  }

  function initials(name) {
    return name.replace(/[·\-]/g, '').slice(-2);
  }

  function startGame(eraKey = 'current') {
    stopSimulationTimers();
    if (spinTimer) window.clearInterval(spinTimer);
    spinTimer = null;
    state = freshState();
    state.eraKey = eraKey;
    state.rngState = hashText(`${eraKey}-${Date.now()}-${Math.random()}`);
    DATA.setEra(eraKey);
    state.screen = 'position';
    playTone(380, 0.07);
    showScreen('position');
  }

  function selectPosition(position) {
    state.position = position;
    playTone(460, 0.05);
    renderPosition();
  }

  function confirmPosition() {
    if (!state.position) return;
    state.attrs = Object.fromEntries(DATA.ATTRS.map(([key]) => [key, null]));
    showScreen('build');
  }

  function spinTeam() {
    if (state.currentTeam || spinTimer) return;
    const result = document.getElementById('slot-result');
    const button = document.getElementById('spin-team');
    const remaining = DATA.TEAMS.filter(team => !state.visitedTeams.includes(team.id));
    const pool = remaining.length ? remaining : DATA.TEAMS;
    const target = pool[Math.floor(random() * pool.length)];
    let ticks = 0;
    button.disabled = true;
    result.classList.add('is-spinning');
    playTone(150, 0.14, 'sawtooth');
    spinTimer = window.setInterval(() => {
      const preview = DATA.TEAMS[Math.floor(random() * DATA.TEAMS.length)];
      result.innerHTML = `<img src="${preview.logo}" alt=""><div><b>${preview.name}</b><small>抽签中...</small></div>`;
      ticks += 1;
      if (ticks >= 10) {
        window.clearInterval(spinTimer);
        spinTimer = null;
        state.currentTeam = target.id;
        if (!state.visitedTeams.includes(target.id)) state.visitedTeams.push(target.id);
        state.selectedPlayer = null;
        state.candidatePlayers = [];
        state.seenCandidatePlayers = [];
        prepareCandidateBatch(target.id, false);
        playTone(640, 0.12);
        updateBuildUI();
        saveGame();
      }
    }, 65);
  }

  function rerollPlayers() {
    if (!canRerollCandidates(state.currentTeam)) return;
    const batch = prepareCandidateBatch(state.currentTeam, true);
    if (batch.length !== 5) return;
    state.rerolls -= 1;
    state.selectedPlayer = null;
    playTone(320, 0.05);
    updateBuildUI();
    showToast(`已换成 5 名全新候选 · 剩余换人 ${state.rerolls} 次`);
    saveGame();
  }

  function selectPlayer(name) {
    const player = DATA.PLAYERS[state.currentTeam].find(item => item.name === name);
    if (!player) return;
    state.selectedPlayer = player;
    playTone(520, 0.04);
    renderRoster();
    renderAttributeList();
  }

  function positionAdjustedAttribute(player, attributeKey) {
    const rawValue = player[attributeKey];
    const eligiblePositions = player.positions || [player.pos];
    const targetIndex = POSITION_ORDER.indexOf(state.position);
    const distance = Math.min(...eligiblePositions.map(position => Math.abs(POSITION_ORDER.indexOf(position) - targetIndex)));
    const factor = attributeKey === 'POT' ? 1 : POSITION_DECAY_FACTORS[distance];
    return {
      rawValue,
      value: clamp(Math.round(rawValue * factor), 40, 99),
      distance,
      factor,
      decayPercent: Math.round((1 - factor) * 100),
      positions: eligiblePositions
    };
  }

  function requestLock(attributeKey) {
    const player = state.selectedPlayer;
    if (!player || state.attrs[attributeKey] != null) return;
    const attr = DATA.ATTRS.find(([key]) => key === attributeKey);
    const fit = positionAdjustedAttribute(player, attributeKey);
    const value = fit.value;
    const team = DATA.getTeam(player.teamId);
    const positionText = fit.positions.join(' / ');
    const decayText = attributeKey === 'POT'
      ? '潜力属于成长概率，不受位置衰减。'
      : (fit.distance === 0
        ? `我的位置与他的适配位置一致，保留原始数值 ${fit.rawValue}。`
        : `与我的位置相距 ${fit.distance} 档，数值由 ${fit.rawValue} 衰减 ${fit.decayPercent}% 至 ${value}。`);
    modalRoot.innerHTML = `
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="lock-title">
        <header class="modal-head"><h2 id="lock-title">锁定${attr[1]}</h2><button class="modal-close" type="button" data-action="close-modal" aria-label="关闭">×</button></header>
        <div class="modal-body">
          <div class="confirm-player">
            <span class="player-avatar" style="--team-color:${team.primary}">${initials(player.name)}</span>
            <div><strong>${player.name}</strong><div>${positionText} · ${team.name}</div></div>
          </div>
          <p class="confirm-copy">将他的 <b>${attr[1]}</b> 锁定为 <b style="color:${DATA.grade(value).color}">${value}</b>。${decayText}</p>
          <div class="confirm-actions">
            <button class="secondary-btn" type="button" data-action="close-modal">再想想</button>
            <button class="primary-btn" type="button" data-action="confirm-lock" data-attribute="${attributeKey}">确认锁定</button>
          </div>
        </div>
      </section>`;
  }

  function confirmLock(attributeKey) {
    const player = state.selectedPlayer;
    if (!player) return;
    const fit = positionAdjustedAttribute(player, attributeKey);
    const value = fit.value;
    state.attrs[attributeKey] = value;
    state.attrSlots[attributeKey] = {
      player: player.name,
      team: player.teamId,
      value,
      rawValue: fit.rawValue,
      positionDistance: fit.distance,
      decayPercent: fit.decayPercent
    };
    state.lockedCount += 1;
    state.usedPlayers.push(player.name);
    state.selectedPlayer = null;
    state.currentTeam = null;
    state.candidatePlayers = [];
    state.seenCandidatePlayers = [];
    closeModal();
    playTone(760, 0.1);
    if (state.lockedCount >= DATA.ATTRS.length) {
      finalizePlayer();
      showScreen('reveal');
      return;
    }
    updateBuildUI();
    showToast(`${DATA.ATTRS.find(([key]) => key === attributeKey)[1]}已锁定，进入下一轮`);
    saveGame();
  }

  function calculateOVR(preview) {
    const weights = DATA.POSITION_WEIGHTS[state.position];
    const lockedValues = DATA.ATTRS.filter(([key]) => key !== 'POT').map(([key]) => state.attrs[key]).filter(value => value != null);
    const fallback = lockedValues.length ? lockedValues.reduce((sum, value) => sum + value, 0) / lockedValues.length : 70;
    let weighted = 0;
    DATA.ATTRS.forEach(([key], index) => {
      const value = state.attrs[key] == null && preview ? fallback : (state.attrs[key] || 50);
      weighted += value * weights[index];
    });
    return Math.max(40, Math.min(99, Math.round(weighted)));
  }

  function finalizePlayer() {
    state.finalOVR = calculateOVR(false);
    state.archetype = findArchetype();
    state.similarPlayers = findSimilarPlayers(3);
  }

  function findArchetype() {
    let best = null;
    const allowed = new Set(POSITION_ARCHETYPES[state.position] || Object.keys(DATA.ARCHETYPES));
    Object.entries(DATA.ARCHETYPES).filter(([key]) => allowed.has(key)).forEach(([key, profile]) => {
      const distance = DATA.ATTRS.reduce((sum, [attrKey], index) => (
        attrKey === 'POT' ? sum : sum + Math.abs(state.attrs[attrKey] - profile.values[index])
      ), 0);
      if (!best || distance < best.distance) best = { key, ...profile, label: POSITION_ARCHETYPE_LABELS[state.position]?.[key] || profile.label, distance };
    });
    return best;
  }

  function findSimilarPlayers(count) {
    const candidates = Object.values(DATA.PLAYERS).flat().filter(player => (player.positions || [player.pos]).includes(state.position));
    return candidates.map(player => {
      const distance = DATA.ATTRS.reduce((sum, [key]) => sum + Math.abs(state.attrs[key] - player[key]), 0) / DATA.ATTRS.length;
      return { ...player, similarity: Math.max(50, Math.round(100 - distance)) };
    }).sort((a, b) => b.similarity - a.similarity).slice(0, count);
  }

  function renderReveal() {
    if (!state.finalOVR) finalizePlayer();
    app.replaceChildren(cloneTemplate('reveal-template'));
    const pass = document.getElementById('player-pass');
    pass.innerHTML = `
      <div class="pass-top">
        <div class="pass-rating"><b>${state.finalOVR}</b><span>${state.position} · OVR</span></div>
        <div class="pass-identity"><small>ONE OF ONE</small><strong>${DATA.POSITIONS[state.position].name}</strong><span>${state.archetype.label} · ${state.archetype.category}型</span></div>
      </div>
      <div class="pass-body">
        <div class="pass-title"><strong>最终能力面板</strong><span>综合评级 ${DATA.grade(state.finalOVR).label}</span></div>
        <div class="pass-attrs">
          ${DATA.ATTRS.map(([key, name]) => `<div class="pass-attr"><b style="color:${DATA.grade(state.attrs[key]).color}">${state.attrs[key]}</b><span>${name}</span></div>`).join('')}
        </div>
        <div class="similar-row"><span>相似现役球员</span><div class="similar-list">
          ${state.similarPlayers.map(player => {
            const team = DATA.getTeam(player.teamId);
            return `<div class="similar-chip"><img src="${team.logo}" alt=""><small>${player.name}<br>${player.similarity}%</small></div>`;
          }).join('')}
        </div></div>`;
  }

  function renderCareer() {
    app.replaceChildren(cloneTemplate('career-template'));
    const slot = document.getElementById('career-slot');
    if (state.careerTeam) {
      const team = DATA.getTeam(state.careerTeam);
      slot.innerHTML = careerSlotHTML(team);
      document.getElementById('career-spin').textContent = '进入球队报到';
      document.getElementById('career-spin').dataset.ready = 'true';
    } else {
      slot.innerHTML = '<div class="career-slot__inner"><span class="slot-placeholder">?</span><b>等待命运揭晓</b><small>你的生涯会从哪里开始？</small></div>';
    }
  }

  function careerSlotHTML(team, spinning) {
    return `<div class="career-slot__inner${spinning ? ' is-spinning' : ''}"><img src="${team.logo}" alt="${team.name}队标"><b>${team.name}</b><small>${team.conference === 'EAST' ? '东部联盟' : '西部联盟'}</small></div>`;
  }

  function spinCareerTeam() {
    const button = document.getElementById('career-spin');
    if (button.dataset.ready === 'true') {
      startSeason();
      return;
    }
    if (spinTimer) return;
    const poolIds = state.visitedTeams.length ? state.visitedTeams : DATA.TEAMS.map(team => team.id);
    const pool = poolIds.map(id => DATA.getTeam(id));
    const target = pool[Math.floor(random() * pool.length)];
    const slot = document.getElementById('career-slot');
    let ticks = 0;
    button.disabled = true;
    spinTimer = window.setInterval(() => {
      const team = pool[Math.floor(random() * pool.length)];
      slot.innerHTML = careerSlotHTML(team, true);
      ticks += 1;
      if (ticks >= 12) {
        window.clearInterval(spinTimer);
        spinTimer = null;
        state.careerTeam = target.id;
        slot.innerHTML = careerSlotHTML(target, false);
        button.disabled = false;
        button.textContent = '进入球队报到';
        button.dataset.ready = 'true';
        playTone(820, 0.14);
        saveGame();
      }
    }, 80);
  }

  function startSeason() {
    if (!state.career) {
      const era = DATA.getEra(state.eraKey);
      const rookieSalary = Math.max(3, Math.round((state.finalOVR - 68) * 1.35));
      state.career = {
        eraKey: state.eraKey,
        startYear: era.startYear,
        rngState: state.rngState,
        seasonNumber: 1,
        age: CAREER_START_AGE,
        currentTeam: state.careerTeam,
        currentOVR: state.finalOVR,
        peakOVR: state.finalOVR,
        potential: clamp(state.attrs.POT, 40, 99),
        contract: { yearsRemaining: 4, totalYears: 4, annualSalary: rookieSalary, type: 'rookie', number: 1 },
        completedContracts: 0,
        history: [],
        transactions: [{
          season: 1,
          age: CAREER_START_AGE,
          type: '新秀签约',
          teamId: state.careerTeam,
          text: `以新秀身份加盟${DATA.getTeam(state.careerTeam).name}，签下 4 年合同`
        }],
        totals: freshPlayerTotals(),
        totalGames: 0,
        awardCounts: {},
        championships: 0,
        teamsPlayed: [state.careerTeam],
        league: createLeagueState(),
        luck: 45 + hashText(`${state.position}-${state.careerTeam}-${state.finalOVR}-${state.attrs.POT}`) % 51,
        injuries: [],
        tradeRequestFailures: 0,
        tradeCounterpartIds: [],
        recentDepartures: [],
        teamRelationships: { [state.careerTeam]: 65 },
        pendingOffseason: null,
        minutesPenaltyNextSeason: 0,
        forcedRetirement: false,
        completed: false,
        lastOffseasonNote: `18 岁进入联盟，开启 ${era.seasonLabel} 新秀赛季`
      };
      syncUserLeaguePlayer();
      trimLeagueRosters(state.career.league);
    }
    initializeCareerSeason();
  }

  function createSeasonSchedule(teamId) {
    const team = DATA.getTeam(teamId);
    const opponents = DATA.TEAMS.filter(item => item.id !== teamId);
    const schedule = opponents.flatMap(opponent => [opponent.id, opponent.id]);
    const conferencePool = shuffledPlayers(opponents.filter(opponent => opponent.conference === team.conference));
    const crossConferencePool = shuffledPlayers(opponents.filter(opponent => opponent.conference !== team.conference));
    const extraPool = [...conferencePool, ...conferencePool, ...crossConferencePool];
    let extraIndex = 0;
    while (schedule.length < 82) {
      schedule.push(extraPool[extraIndex % extraPool.length].id);
      extraIndex += 1;
    }
    return shuffledPlayers(schedule).map((opponent, index) => ({
      game: index + 1,
      opponent,
      home: index % 2 === 0,
      result: null
    }));
  }

  function buildSeasonRoleProfile() {
    const league = ensureLeagueState();
    syncUserLeaguePlayer();
    const penalty = clamp(state.career.minutesPenaltyNextSeason || 0, 0, 18);
    assignLeagueRotations(league, penalty);
    const roster = league.players.filter(player => player.active && player.teamId === state.career.currentTeam);
    const user = roster.find(player => player.isUser);
    const teamRotationAverage = roster.length
      ? roster.reduce((sum, player) => sum + player.ovr, 0) / roster.length
      : 75;
    const minutes = user?.seasonRole?.minutes ?? 6;
    const usage = user?.seasonRole?.usage ?? 10;
    const rotationRank = user?.seasonRole?.rotationRank ?? 15;
    const role = minutes >= 34 ? '绝对核心' : (minutes >= 29 ? '主力首发' : (minutes >= 22 ? '主要轮换' : (minutes >= 14 ? '边缘轮换' : '板凳末端')));
    return { minutes, usage, role, rotationRank, penalty, teamRotationAverage: Math.round(teamRotationAverage * 10) / 10 };
  }

  function initializeCareerSeason() {
    const league = ensureLeagueState();
    syncUserLeaguePlayer();
    state.careerTeam = state.career.currentTeam;
    const roleProfile = buildSeasonRoleProfile();
    initializeLeagueSeasonHealth(league, state.career.seasonNumber);
    state.career.minutesPenaltyNextSeason = 0;
    state.season = {
      stage: 'regular',
      seasonNumber: state.career.seasonNumber,
      age: state.career.age,
      teamId: state.careerTeam,
      ovrAtStart: state.finalOVR,
      schedule: createSeasonSchedule(state.careerTeam),
      wins: 0,
      losses: 0,
      seed: null,
      playerTotals: freshPlayerTotals(),
      playerGames: 0,
      roleProfile,
      injuryStatus: null,
      injuries: [],
      playoffRound: 0,
      series: [],
      postSeasonStage: null,
      awards: [],
      isSimulating: true,
      playInSimulation: null,
      seriesSimulation: null,
      tradeRequested: false,
      tradeResult: null,
      ended: false,
      champion: false,
      archived: false,
      offseasonNote: state.career.lastOffseasonNote
    };
    showScreen('season');
    window.setTimeout(() => {
      if (state.screen === 'season' && state.season && state.season.stage === 'regular') runRegularSeasonAnimation();
    }, 600);
  }

  function teamStrength(teamId) {
    if (state.career && state.career.league) {
      const currentGame = (state.season?.wins || 0) + (state.season?.losses || 0) + 1;
      const activeRoster = state.career.league.players
        .filter(player => player.active && player.teamId === teamId && playerAvailableForGame(player, currentGame));
      const allocation = SIM.allocateRotation(activeRoster);
      const weightedRoster = activeRoster
        .map(player => ({ player, effectiveOVR: leaguePlayerGameOVR(player, currentGame), minutes: allocation[player.id] || 0 }))
        .filter(item => item.minutes > 0);
      const totalMinutes = weightedRoster.reduce((sum, item) => sum + item.minutes, 0);
      if (weightedRoster.length >= 5 && totalMinutes > 0) {
        return weightedRoster.reduce((sum, item) => sum + item.effectiveOVR * item.minutes, 0) / totalMinutes;
      }
    }
    const roster = DATA.PLAYERS[teamId] || [];
    return roster.length ? roster.reduce((sum, player) => sum + player.ovr, 0) / roster.length : 60;
  }

  function randomNormal() {
    const u = Math.max(0.0001, random());
    const v = Math.max(0.0001, random());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function hashText(text) {
    let value = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      value ^= text.charCodeAt(index);
      value = Math.imul(value, 16777619);
    }
    return value >>> 0;
  }

  function inferLeagueAge(player) {
    const variance = hashText(player.name) % 4;
    if (INITIAL_ROOKIES.has(player.name)) return 19;
    if (player.ovr <= 74) return 21 + (hashText(player.name) % 10);
    if (player.ovr >= 90) return 27 + (hashText(player.name) % 8);
    return 23 + variance * 3;
  }

  function createLeaguePlayer(player) {
    const age = Number.isFinite(player.age) ? player.age : inferLeagueAge(player);
    const eraStartYear = DATA.getEra(state.eraKey).startYear;
    const initialProspect = state.eraKey === 'current' ? null : DATA.getDraftClass(eraStartYear).find(prospect => prospect.name === player.name);
    let seasons = INITIAL_ROOKIES.has(player.name) ? 0 : Math.max(1, age - 20);
    if (Number.isFinite(player.rookieYear)) {
      seasons = Math.max(0, eraStartYear - player.rookieYear);
      if (seasons === 0 && !initialProspect) seasons = 1;
    }
    return {
      id: `base-${hashText(`${player.teamId}-${player.name}`)}`,
      name: player.name,
      teamId: player.teamId,
      pos: player.pos,
      positions: player.positions || [player.pos],
      archetype: player.archetype,
      age,
      sourceOvr: player.sourceOvr ?? player.ovr,
      simOvr: player.simOvr ?? player.ovr,
      attributeOvr: player.attributeOvr ?? player.ovr,
      ovr: player.simOvr ?? player.ovr,
      potential: clamp(player.POT ?? 70, 40, 99),
      defense: Math.round((player.PDEF + player.IDEF + player.BLK + player.REB) / 4),
      seasons,
      rookieYear: player.rookieYear,
      draftYear: initialProspect ? eraStartYear : undefined,
      draftOrder: initialProspect?.order,
      projected: Boolean(initialProspect?.projected),
      luck: 45 + hashText(`health-${player.name}`) % 51,
      injuryHistory: [],
      seasonInjury: null,
      seasonRole: null,
      pendingInjuryDecline: 0,
      forcedRetirement: false,
      seasonHistory: [],
      contractYears: 1 + hashText(`contract-${player.name}`) % 4,
      active: true
    };
  }

  function canonicalLeagueName(name) {
    return String(name || '').replace(/[\s·‧\-.]/g, '').toLowerCase();
  }

  function uniqueLeagueName(league, base) {
    const names = new Set(league.players.map(player => player.name));
    if (!names.has(base)) return base;
    let suffix = 2;
    while (names.has(`${base}${suffix}世`)) suffix += 1;
    return `${base}${suffix}世`;
  }

  function createDepthPlayer(league, teamId, seasonNumber, index) {
    const key = hashText(`depth-${league.eraKey}-${seasonNumber}-${teamId}-${index}-${league.players.length}`);
    const first = ROOKIE_FIRST_NAMES[key % ROOKIE_FIRST_NAMES.length];
    const last = ROOKIE_LAST_NAMES[(key >>> 5) % ROOKIE_LAST_NAMES.length];
    const name = uniqueLeagueName(league, `${first}·${last}`);
    const pos = POSITION_ORDER[(key >>> 9) % POSITION_ORDER.length];
    const archetypes = POSITION_ARCHETYPES[pos];
    const archetype = archetypes[(key >>> 13) % archetypes.length];
    const ovr = 67 + (key % 9);
    return {
      id: `depth-${league.eraKey}-${seasonNumber}-${teamId}-${key}`,
      name,
      teamId,
      pos,
      positions: [pos],
      archetype,
      age: 22 + (key % 8),
      sourceOvr: ovr,
      simOvr: ovr,
      ovr,
      potential: 45 + (key % 36),
      defense: clamp(ovr + (['anchor', 'twoway'].includes(archetype) ? 4 : -2), 55, 82),
      seasons: 1 + (key % 7),
      luck: 45 + hashText(`health-${name}`) % 51,
      injuryHistory: [],
      seasonInjury: null,
      seasonRole: null,
      pendingInjuryDecline: 0,
      forcedRetirement: false,
      seasonHistory: [],
      contractYears: 1 + key % 4,
      depthPlayer: true,
      active: true
    };
  }

  function fillLeagueRosters(league, seasonNumber) {
    DATA.TEAMS.forEach(team => {
      let count = league.players.filter(player => player.active && player.teamId === team.id).length;
      let index = 0;
      while (count < 15) {
        league.players.push(createDepthPlayer(league, team.id, seasonNumber, index));
        count += 1;
        index += 1;
      }
    });
  }

  function syncUserLeaguePlayer() {
    const league = state.career?.league;
    if (!league) return null;
    let player = league.players.find(item => item.isUser);
    if (!player) {
      player = {
        id: 'user-player',
        name: '我',
        isUser: true,
        injuryHistory: [],
        seasonHistory: [],
        pendingInjuryDecline: 0,
        forcedRetirement: false,
        seasons: state.career.seasonNumber - 1,
        active: true
      };
      league.players.push(player);
    }
    Object.assign(player, {
      teamId: state.career.currentTeam,
      pos: state.position,
      positions: [state.position],
      archetype: state.archetype.key,
      age: state.career.age,
      sourceOvr: state.finalOVR,
      simOvr: state.finalOVR,
      ovr: state.finalOVR,
      potential: state.career.potential,
      defense: Math.round(['PDEF', 'IDEF', 'BLK', 'REB'].reduce((sum, key) => sum + state.attrs[key], 0) / 4),
      luck: state.career.luck,
      contractYears: state.career.contract?.yearsRemaining || 1,
      active: true
    });
    if (league.players.filter(item => item.active && item.teamId === player.teamId).length > 15) trimLeagueRosters(league);
    return player;
  }

  function rookieName(league, seasonNumber, index) {
    const offset = seasonNumber * 37 + index * 11;
    const base = `${ROOKIE_FIRST_NAMES[offset % ROOKIE_FIRST_NAMES.length]}·${ROOKIE_LAST_NAMES[(offset * 7 + seasonNumber) % ROOKIE_LAST_NAMES.length]}`;
    const duplicateCount = league.players.filter(player => player.name === base).length;
    return duplicateCount ? `${base}${duplicateCount + 1}世` : base;
  }

  function addRookieClass(league, seasonNumber) {
    if (league.eraKey !== 'current') {
      const draftYear = league.startYear + seasonNumber - 1;
      const draftClass = DATA.getDraftClass(draftYear).slice().sort((left, right) => left.order - right.order);
      const existingNames = new Set(league.players.filter(player => player.active).map(player => player.name));
      const incomingProspects = draftClass.filter(prospect => !existingNames.has(prospect.name));
      const weakestTeams = DATA.TEAMS.map(team => ({ team, strength: teamStrengthForLeague(league, team.id) }))
        .sort((left, right) => left.strength - right.strength);
      incomingProspects.forEach((prospect, index) => {
        const team = weakestTeams[index % weakestTeams.length].team;
        const profile = DATA.ARCHETYPES[prospect.archetype] || DATA.ARCHETYPES.wing;
        league.players.push({
          id: `draft-${draftYear}-${prospect.order}-${hashText(prospect.name)}`,
          name: prospect.name,
          teamId: team.id,
          pos: prospect.pos,
          positions: [prospect.pos],
          archetype: prospect.archetype,
          age: prospect.age,
          sourceOvr: prospect.ovr,
          simOvr: prospect.ovr,
          ovr: prospect.ovr,
          potential: prospect.potential,
          defense: clamp(Math.round((prospect.ovr + profile.values[6] + profile.values[7] + profile.values[8]) / 4), 50, 99),
          seasons: 0,
          rookieYear: draftYear,
          draftYear,
          draftOrder: prospect.order,
          projected: Boolean(prospect.projected),
          luck: 45 + hashText(`health-${prospect.name}`) % 51,
          injuryHistory: [],
          seasonInjury: null,
          seasonRole: null,
          pendingInjuryDecline: 0,
          forcedRetirement: false,
          seasonHistory: [],
          contractYears: 4,
          active: true
        });
      });
      return incomingProspects.length;
    }
    DATA.TEAMS.forEach((team, index) => {
      const talentRoll = Math.max(-2, Math.min(5, Math.round(randomNormal() * 2)));
      const ovr = clamp(76 + (hashText(`${seasonNumber}-${team.id}`) % 6) + talentRoll, 72, 86);
      const potential = clamp(55 + (hashText(`${team.id}-${seasonNumber}-pot`) % 43), 40, 99);
      const pos = ['PG', 'SG', 'SF', 'PF', 'C'][(seasonNumber + index * 3) % 5];
      const archetypes = POSITION_ARCHETYPES[pos];
      const archetype = archetypes[(seasonNumber + index) % archetypes.length];
      league.players.push({
        id: `rookie-${seasonNumber}-${team.id}`,
        name: rookieName(league, seasonNumber, index),
        teamId: team.id,
        pos,
        positions: [pos],
        archetype,
        age: 19,
        sourceOvr: ovr,
        simOvr: ovr,
        ovr,
        potential,
        defense: clamp(ovr + (['anchor', 'twoway'].includes(archetype) ? 5 : -4) + talentRoll, 55, 96),
        seasons: 0,
        luck: 45 + hashText(`health-${seasonNumber}-${team.id}`) % 51,
        injuryHistory: [],
        seasonInjury: null,
        seasonRole: null,
        pendingInjuryDecline: 0,
        forcedRetirement: false,
        seasonHistory: [],
        contractYears: 4,
        active: true
      });
    });
    return DATA.TEAMS.length;
  }

  function teamStrengthForLeague(league, teamId) {
    const roster = league.players.filter(player => player.active && player.teamId === teamId)
      .sort((left, right) => right.ovr - left.ovr).slice(0, 10);
    return roster.length ? roster.reduce((sum, player) => sum + player.ovr, 0) / roster.length : 60;
  }

  function trimLeagueRosters(league) {
    DATA.TEAMS.forEach(team => {
      const roster = league.players
        .filter(player => player.active && player.teamId === team.id)
        .sort((left, right) => ((right.isUser ? 1000 : 0) + right.ovr + (right.seasons === 0 ? 2 : 0)) - ((left.isUser ? 1000 : 0) + left.ovr + (left.seasons === 0 ? 2 : 0)));
      roster.slice(15).forEach(player => {
        player.active = false;
        player.exitReason = '离开联盟';
      });
    });
  }

  function leaguePlayerPositions(player) {
    return Array.isArray(player.positions) && player.positions.length ? player.positions : [player.pos];
  }

  function teamPositionNeed(league, teamId, positions, excludedPlayerId) {
    const roster = league.players.filter(player => player.active && player.teamId === teamId && player.id !== excludedPlayerId);
    return Math.max(...positions.map(position => {
      const depth = roster.filter(player => leaguePlayerPositions(player).includes(position)).sort((left, right) => right.ovr - left.ovr);
      const starter = depth[0]?.ovr ?? 58;
      const backup = depth[1]?.ovr ?? 55;
      return Math.max(0, 88 - starter) * 1.3 + Math.max(0, 79 - backup) * 0.55 + (depth.length < 2 ? 8 : 0);
    }));
  }

  function recentTeamTrade(league, leftTeamId, rightTeamId, seasonNumber, window = 2) {
    return (league.transactionHistory || []).some(transaction => (
      seasonNumber - transaction.seasonNumber <= window
      && ((transaction.fromTeamId === leftTeamId && transaction.toTeamId === rightTeamId)
        || (transaction.fromTeamId === rightTeamId && transaction.toTeamId === leftTeamId))
    ));
  }

  function tradePairScore(league, first, second, seasonNumber) {
    if (!first || !second || first.teamId === second.teamId) return -Infinity;
    if (recentTeamTrade(league, first.teamId, second.teamId, seasonNumber)) return -Infinity;
    const valueDifference = Math.abs(SIM.tradeValue(first) - SIM.tradeValue(second));
    if (valueDifference > 14 || Math.abs(first.ovr - second.ovr) > 6) return -Infinity;
    const firstTeamNeed = teamPositionNeed(league, first.teamId, leaguePlayerPositions(second), first.id);
    const secondTeamNeed = teamPositionNeed(league, second.teamId, leaguePlayerPositions(first), second.id);
    const samePosition = leaguePlayerPositions(first).some(position => leaguePlayerPositions(second).includes(position));
    return firstTeamNeed + secondTeamNeed + (samePosition ? 4 : 0) - valueDifference * 1.8;
  }

  function userTradeCandidates(league, oldTeamId) {
    const user = syncUserLeaguePlayer();
    const usedCounterparts = new Set(state.career.tradeCounterpartIds || []);
    const blockedTeams = new Set((state.career.recentDepartures || [])
      .filter(entry => state.career.seasonNumber - entry.season < 3)
      .map(entry => entry.teamId));
    return league.players
      .filter(player => player.active && !player.isUser && player.teamId !== oldTeamId && !usedCounterparts.has(player.id) && !blockedTeams.has(player.teamId))
      .map(player => {
        const valueDifference = Math.abs(SIM.tradeValue(player) - SIM.tradeValue(user));
        const ovrDifference = Math.abs(player.ovr - user.ovr);
        const targetNeed = teamPositionNeed(league, player.teamId, leaguePlayerPositions(user), player.id);
        const oldTeamNeed = teamPositionNeed(league, oldTeamId, leaguePlayerPositions(player), user.id);
        const samePosition = leaguePlayerPositions(player).some(position => leaguePlayerPositions(user).includes(position));
        const targetWins = league.teamRecords?.[player.teamId]?.wins ?? 41;
        const strategyFit = user.age <= 25 && targetWins < 40 ? 4 : (user.ovr >= 88 && targetWins >= 42 ? 5 : 0);
        const score = targetNeed * 0.7 + oldTeamNeed * 0.45 + strategyFit + (samePosition ? 5 : 0) - valueDifference * 1.9 - ovrDifference * 1.2;
        return { player, valueDifference, ovrDifference, targetNeed, oldTeamNeed, score };
      })
      .filter(candidate => candidate.valueDifference <= 22 && candidate.ovrDifference <= 7 && !recentTeamTrade(league, oldTeamId, candidate.player.teamId, state.career.seasonNumber + 1, 3))
      .sort((left, right) => right.score - left.score || left.valueDifference - right.valueDifference || left.ovrDifference - right.ovrDifference);
  }

  function userTeamLegacy(teamId) {
    const seasons = (state.career?.history || []).filter(entry => entry.teamId === teamId);
    const championships = seasons.filter(entry => entry.champion).length;
    const majorAwards = seasons.reduce((sum, entry) => sum + (entry.awards || []).filter(label => ['最有价值球员', '最佳防守球员'].includes(label)).length, 0);
    const score = seasons.reduce((sum, entry) => (
      sum + (entry.games / 82) * Math.max(0, entry.ovr - 70) * 0.55 + entry.wins * 0.05
    ), 0) + championships * 28 + majorAwards * 18 + seasons.reduce((sum, entry) => sum + (entry.awards || []).filter(label => label === '最佳阵容').length * 6, 0);
    let consecutive = 0;
    for (let index = state.career.history.length - 1; index >= 0; index -= 1) {
      if (state.career.history[index].teamId !== teamId) break;
      consecutive += 1;
    }
    const status = score >= 150 ? '队史第一人' : (score >= 85 ? '队史代表' : (consecutive >= 5 ? '功勋球员' : (consecutive >= 2 ? '长期成员' : '新加盟球员')));
    return { seasons: seasons.length, consecutive, championships, majorAwards, score: Math.round(score), status };
  }

  function recentCareerMoves(window = 5) {
    const cutoff = state.career.seasonNumber - window + 1;
    return (state.career.transactions || []).filter(event => (
      event.season >= cutoff && ['球队交易', '申请交易', '自由签约'].includes(event.type)
    )).length;
  }

  function seasonsSinceCareerMove() {
    const movements = (state.career.transactions || []).filter(event => ['球队交易', '申请交易', '自由签约'].includes(event.type));
    if (!movements.length) return state.career.seasonNumber;
    return Math.max(0, state.career.seasonNumber - movements[movements.length - 1].season + 1);
  }

  function replacementPressureForUser(teamId) {
    const league = ensureLeagueState();
    const competitors = league.players.filter(player => (
      player.active && !player.isUser && player.teamId === teamId
      && leaguePlayerPositions(player).some(position => leaguePlayerPositions(syncUserLeaguePlayer()).includes(position))
      && player.ovr >= state.finalOVR - 3
    ));
    return clamp(competitors.length * 4, 0, 20);
  }

  function userTradeAssessment(completedSeason, nextAge) {
    const legacy = userTeamLegacy(state.career.currentTeam);
    const wins = completedSeason?.wins ?? state.season?.wins ?? 41;
    const rebuildingVeteran = nextAge >= 31 && wins < 39 ? 8 : 0;
    const developingMismatch = nextAge >= 28 && state.finalOVR < 82 && wins >= 46 ? 6 : 0;
    return SIM.calculateTradeProbability({
      age: nextAge,
      ovr: state.finalOVR,
      potential: state.career.potential,
      contractYears: state.career.contract.yearsRemaining,
      teamTenure: legacy.consecutive,
      teamsPlayed: state.career.teamsPlayed.length,
      recentMoves: recentCareerMoves(),
      franchiseScore: legacy.score,
      championships: legacy.championships,
      majorAwards: legacy.majorAwards,
      teamWins: wins,
      replacementPressure: replacementPressureForUser(state.career.currentTeam),
      directionMismatch: rebuildingVeteran + developingMismatch,
      relationship: state.career.teamRelationships[state.career.currentTeam] ?? 55,
      seasonsSinceMove: seasonsSinceCareerMove()
    });
  }

  function leaguePlayerTradeAssessment(league, player, seasonNumber) {
    const history = player.seasonHistory || [];
    const currentHistory = history.filter(entry => entry.teamId === player.teamId);
    let tenure = 0;
    for (let index = history.length - 1; index >= 0; index -= 1) {
      if (history[index].teamId !== player.teamId) break;
      tenure += 1;
    }
    const teamsPlayed = new Set(history.map(entry => entry.teamId).filter(Boolean));
    const recentTeams = history.slice(-5).map(entry => entry.teamId).filter(Boolean);
    let recentMoves = 0;
    recentTeams.forEach((teamId, index) => { if (index && recentTeams[index - 1] !== teamId) recentMoves += 1; });
    const teamWins = league.teamRecords?.[player.teamId]?.wins ?? 41;
    const samePosition = league.players.filter(item => item.active && item.id !== player.id && item.teamId === player.teamId
      && leaguePlayerPositions(item).some(position => leaguePlayerPositions(player).includes(position)) && item.ovr >= player.ovr - 3).length;
    return SIM.calculateTradeProbability({
      age: player.age,
      ovr: player.ovr,
      potential: player.potential,
      contractYears: player.contractYears,
      teamTenure: tenure,
      teamsPlayed: Math.max(1, teamsPlayed.size),
      recentMoves,
      franchiseScore: currentHistory.reduce((sum, entry) => sum + Math.max(0, (entry.pts || 0) - 8) * 0.35 + Math.max(0, (entry.wins || 0) - 30) * 0.08, 0),
      teamWins,
      replacementPressure: samePosition * 4,
      directionMismatch: player.age >= 31 && teamWins < 38 ? 8 : 0,
      seasonsSinceMove: tenure
    });
  }

  function roleLabel(minutes) {
    return minutes >= 34 ? '绝对核心' : (minutes >= 29 ? '主力首发' : (minutes >= 22 ? '主要轮换' : (minutes >= 14 ? '边缘轮换' : '板凳末端')));
  }

  function projectedUserRole(teamId) {
    const league = ensureLeagueState();
    const user = { ...syncUserLeaguePlayer(), teamId };
    const roster = league.players.filter(player => player.active && !player.isUser && player.teamId === teamId).concat(user)
      .sort((left, right) => right.ovr - left.ovr || String(left.id).localeCompare(String(right.id))).slice(0, 15);
    const allocation = SIM.allocateRotation(roster);
    const rank = roster.findIndex(player => player.id === user.id);
    const minutes = allocation[user.id] || 0;
    const profile = leagueRoleProfile(user, roster, Math.max(0, rank), minutes);
    const competitors = roster.filter(player => !player.isUser && leaguePlayerPositions(player).some(position => leaguePlayerPositions(user).includes(position)))
      .slice(0, 3).map(player => ({ id: player.id, name: player.name, ovr: player.ovr, positions: leaguePlayerPositions(player) }));
    return { minutes, usage: profile.usage, rotationRank: rank + 1, role: roleLabel(minutes), competitors };
  }

  function teamMarketContext(teamId) {
    const league = ensureLeagueState();
    const team = DATA.getTeam(teamId);
    const records = league.teamRecords || {};
    const record = records[teamId] || { wins: 41, losses: 41 };
    const standings = league.standings || SIM.conferenceSeeds(DATA.TEAMS, records);
    const rank = standings[team.conference]?.find(item => item.id === teamId)?.seed || 15;
    const phase = record.wins >= 49 ? '争冠' : (record.wins >= 40 ? '冲击季后赛' : '重建');
    const roster = league.players.filter(player => player.active && !player.isUser && player.teamId === teamId)
      .sort((left, right) => right.ovr - left.ovr).slice(0, 8)
      .map(player => ({ id: player.id, name: player.name, ovr: player.ovr, age: player.age, positions: leaguePlayerPositions(player) }));
    return { rank, wins: record.wins, losses: record.losses, phase, roster };
  }

  function generateContractOffers(waitRound = false) {
    const league = ensureLeagueState();
    const user = syncUserLeaguePlayer();
    const age = state.career.age + 1;
    const availability = state.season.playerGames / 82;
    const marketValue = SIM.contractMarketValue({ ovr: state.finalOVR, age, potential: state.career.potential, availability });
    const forcedMarket = localDebugParam('marketOutcome');
    if (forcedMarket === 'none') return [];
    const isRookieExtension = state.career.contract?.type === 'rookie'
      || ((state.career.contract?.number ?? 1) === 1 && (state.career.completedContracts ?? 0) === 0);
    const rookieRightsOffer = isRookieExtension && state.finalOVR >= 68 && !state.career.forcedRetirement;
    const candidates = DATA.TEAMS.map(team => {
      const context = teamMarketContext(team.id);
      const need = teamPositionNeed(league, team.id, leaguePlayerPositions(user), user.id);
      const strategyFit = age <= 25 && context.phase === '重建' ? 8 : (state.finalOVR >= 86 && context.phase === '争冠' ? 9 : 0);
      const motherBonus = team.id === state.career.currentTeam
        ? 4 + (state.career.teamRelationships[team.id] ?? 55) * 0.08 + userTeamLegacy(team.id).score * 0.035
        : 0;
      const rightsBonus = rookieRightsOffer && team.id === state.career.currentTeam ? 1000 : 0;
      const score = marketValue + need * 0.38 + strategyFit + motherBonus + rightsBonus + randomNormal() * (waitRound ? 4 : 7);
      return { team, context, need, score };
    }).sort((left, right) => right.score - left.score);
    const threshold = waitRound ? 15 : 27;
    const eligible = candidates.filter(candidate => candidate.score >= threshold);
    let cap = marketValue >= 64 ? 3 : (marketValue >= 38 ? 2 : (marketValue >= 18 ? 1 : 0));
    if (rookieRightsOffer) cap = Math.max(1, cap);
    if (waitRound && marketValue >= 8) cap = Math.max(1, cap);
    if (forcedMarket === 'three') cap = 3;
    const offerCount = forcedMarket === 'three' ? 3 : Math.min(cap, eligible.length, cap ? 1 + Math.floor(random() * cap) : 0);
    return eligible.slice(0, offerCount).map((candidate, index) => {
      const projection = projectedUserRole(candidate.team.id);
      const yearsCap = age >= 35 ? 1 : (age >= 32 ? 2 : (age <= 26 ? 5 : 4));
      const years = clamp(yearsCap - Math.floor(index / 2) - (waitRound ? 1 : 0), 1, 5);
      const annualSalary = Math.max(1, Math.round((state.finalOVR - 67) * 1.5 + candidate.need * 0.11 + (candidate.team.id === state.career.currentTeam ? 1 : 0)));
      return {
        teamId: candidate.team.id,
        years,
        annualSalary,
        projection,
        ...candidate.context,
        isCurrentTeam: candidate.team.id === state.career.currentTeam
      };
    });
  }

  function leagueRoleProfile(player, roster, rank, minutes) {
    const creatorAverage = roster.slice(0, 3).reduce((sum, teammate) => sum + teammate.ovr, 0) / Math.max(1, Math.min(3, roster.length));
    const archetypeUsage = { creator: 3.5, slasher: 2.8, sniper: 1.8, wing: 1.2, pointbig: 1.4, big: 0.3, twoway: -0.5, anchor: -1.8 }[player.archetype] || 0;
    const userOffense = player.isUser
      ? (state.attrs.threePT + state.attrs.MID + state.attrs.FIN + state.attrs.DNK + state.attrs.HAN + state.attrs.PAS) / 6
      : player.ovr;
    const usage = Math.round(clamp(19 + (player.ovr - creatorAverage) * 0.4 + archetypeUsage + (userOffense - player.ovr) * 0.12, 9, 38) * 10) / 10;
    return { minutes, usage, rotationRank: rank + 1 };
  }

  function assignLeagueRotations(league, userPenalty = 0) {
    DATA.TEAMS.forEach(team => {
      const roster = league.players
        .filter(player => player.active && player.teamId === team.id)
        .sort((left, right) => right.ovr - left.ovr || String(left.id).localeCompare(String(right.id)))
        .slice(0, 15);
      const allocation = SIM.allocateRotation(roster);
      const user = roster.find(player => player.isUser);
      if (user && userPenalty > 0) {
        const original = allocation[user.id] || 0;
        const reduced = Math.max(6, original - userPenalty);
        let available = original - reduced;
        allocation[user.id] = reduced;
        roster.filter(player => !player.isUser).forEach(player => {
          if (available <= 0) return;
          const room = Math.max(0, 38 - allocation[player.id]);
          const addition = Math.min(room, available);
          allocation[player.id] += addition;
          available -= addition;
        });
      }
      roster.forEach((player, rank) => {
        player.seasonRole = leagueRoleProfile(player, roster, rank, allocation[player.id] || 0);
      });
    });
  }

  function initializeLeagueSeasonHealth(league, seasonNumber) {
    if (league.healthSeasonNumber === seasonNumber) return;
    assignLeagueRotations(league, state.career?.minutesPenaltyNextSeason || 0);
    DATA.TEAMS.forEach(team => {
      const roster = league.players
        .filter(player => player.active && player.teamId === team.id)
        .sort((left, right) => right.ovr - left.ovr);
      roster.forEach((player, rank) => {
        player.luck = clamp(player.luck ?? (45 + hashText(`health-${player.name}`) % 51), 45, 95);
        if (!Array.isArray(player.injuryHistory)) player.injuryHistory = [];
        if (!player.seasonRole) player.seasonRole = leagueRoleProfile(player, roster, rank, 0);
        player.seasonInjury = null;
        if (player.isUser) return;
        const perGameRisk = workloadInjuryRisk(player.seasonRole.minutes, player.seasonRole.usage, player.luck);
        const seasonRisk = 1 - Math.pow(1 - perGameRisk, 82);
        if (random() >= seasonRisk) return;
        const game = 1 + Math.floor(random() * 74);
        const workload = player.seasonRole.minutes + player.seasonRole.usage;
        const type = injuryTypeForWorkload(workload);
        const injury = { type, label: INJURY_LABELS[type], game, season: seasonNumber, age: player.age };
        if (type === 'light') {
          injury.duration = 3 + Math.floor(random() * 8);
          injury.penalty = 4 + Math.floor(random() * 5);
          injury.gamesPlayed = 82;
          injury.text = `${injury.label}，带伤影响 ${injury.duration} 场`;
        } else {
          injury.gamesPlayed = Math.max(0, game - 1);
          injury.seasonEnding = true;
          injury.permanentDecline = type === 'devastating' ? 7 + Math.floor(random() * 7) : 2 + Math.floor(random() * 3);
          injury.careerEnding = type === 'devastating' && random() < clamp(0.28 + Math.max(0, player.age - 30) * 0.035 + Math.max(0, 60 - player.luck) * 0.006, 0.2, 0.72);
          player.pendingInjuryDecline = Math.max(player.pendingInjuryDecline || 0, injury.permanentDecline);
          player.forcedRetirement = injury.careerEnding;
          injury.text = injury.careerEnding
            ? `${injury.label}，赛季报销并可能结束生涯`
            : `${injury.label}，赛季报销且预计永久下降 ${injury.permanentDecline} OVR`;
        }
        player.seasonInjury = injury;
        player.injuryHistory.push(injury);
      });
    });
    league.healthSeasonNumber = seasonNumber;
  }

  function leaguePlayerGameOVR(player, gameNumber) {
    if (player.isUser) {
      const injury = state.season?.injuryStatus;
      if (injury?.seasonEnding) return 62;
      return clamp(state.finalOVR - (injury?.type === 'light' ? injury.penalty : 0), 40, 99);
    }
    const injury = player.seasonInjury;
    if (!injury || gameNumber < injury.game) return player.ovr;
    if (injury.type === 'light' && gameNumber < injury.game + injury.duration) return clamp(player.ovr - injury.penalty, 50, 99);
    if (injury.seasonEnding) return 62;
    return player.ovr;
  }

  function playerAvailableForGame(player, gameNumber) {
    if (player.isUser) return !state.season?.injuryStatus?.seasonEnding;
    return !(player.seasonInjury?.seasonEnding && gameNumber >= player.seasonInjury.game);
  }

  function createLeagueState() {
    const era = DATA.getEra(state.eraKey);
    const canonicalPlayers = new Map();
    Object.values(DATA.PLAYERS).flat().forEach(player => {
      const key = canonicalLeagueName(player.name);
      const existing = canonicalPlayers.get(key);
      if (!existing || player.ovr > existing.ovr) canonicalPlayers.set(key, player);
    });
    const league = {
      eraKey: state.eraKey,
      startYear: era.startYear,
      seasonNumber: 1,
      players: [...canonicalPlayers.values()].map(createLeaguePlayer),
      awardHistory: [],
      teamRecords: {},
      retiredCount: 0
    };
    // Historical opening classes may contain prospects not already present in the era roster.
    // The current roster already includes its rookies, so a synthetic class starts in year two.
    if (league.eraKey !== 'current') addRookieClass(league, 1);
    fillLeagueRosters(league, 1);
    trimLeagueRosters(league);
    return league;
  }

  function potentialGrowthChance(potential, age) {
    const potentialFactor = clamp(((potential ?? 70) - 40) / 59, 0, 1);
    const ageFactor = age <= 21 ? 1 : (age <= 24 ? 0.82 : (age <= 27 ? 0.55 : (age <= 30 ? 0.25 : 0)));
    return clamp((0.12 + potentialFactor * 0.75) * ageFactor, 0, 0.9);
  }

  function evolveLeagueSeason(league, nextSeasonNumber) {
    let retired = 0;
    league.players.filter(player => player.active).forEach(player => {
      if (player.isUser) return;
      if (player.lastSeason && player.lastSeason.seasonNumber === league.seasonNumber) {
        if (!Array.isArray(player.seasonHistory)) player.seasonHistory = [];
        if (!player.seasonHistory.some(entry => entry.seasonNumber === player.lastSeason.seasonNumber)) {
          player.seasonHistory.push({ ...player.lastSeason });
        }
      }
      const beforeOvr = player.ovr;
      const appliedInjuryDecline = player.pendingInjuryDecline || 0;
      if (player.pendingInjuryDecline > 0) {
        player.ovr = clamp(player.ovr - player.pendingInjuryDecline, 55, 99);
        player.defense = clamp(player.defense - Math.max(1, Math.round(player.pendingInjuryDecline * 0.7)), 50, 99);
        player.pendingInjuryDecline = 0;
      }
      if (player.forcedRetirement) {
        player.active = false;
        player.exitReason = '毁灭性伤病退役';
        if (player.seasonHistory.length) {
          const history = player.seasonHistory[player.seasonHistory.length - 1];
          if (history.seasonNumber === league.seasonNumber) {
            history.offseason = {
              beforeOvr,
              afterOvr: player.ovr,
              change: player.ovr - beforeOvr,
              injuryDecline: appliedInjuryDecline,
              retired: true,
              exitReason: player.exitReason
            };
          }
        }
        retired += 1;
        return;
      }
      player.age += 1;
      player.seasons += 1;
      const growthChance = potentialGrowthChance(player.potential, player.age);
      let change = 0;
      if (player.age <= 30 && random() < growthChance) {
        const potentialFactor = clamp((player.potential - 40) / 59, 0, 1);
        if (player.age <= 22) change = 1.1 + potentialFactor * 1.9 + randomNormal() * 0.4;
        else if (player.age <= 26) change = 0.55 + potentialFactor * 1.15 + randomNormal() * 0.35;
        else change = 0.15 + potentialFactor * 0.65 + randomNormal() * 0.25;
      } else if (player.age <= 30) change = randomNormal() * 0.22 - 0.08;
      else if (player.age <= 34) change = -0.7 - (player.age - 31) * 0.25 + randomNormal() * 0.35;
      else change = -1.8 - (player.age - 35) * 0.45 + randomNormal() * 0.45;
      player.ovr = clamp(Math.round(player.ovr + change), 55, 99);
      player.simOvr = player.ovr;
      player.defense = clamp(Math.round(player.defense + change * 0.75), 50, 99);
      const retirementChance = player.age >= 40 ? 1 : (player.age >= 36 ? 0.2 + (player.age - 36) * 0.18 + Math.max(0, 78 - player.ovr) * 0.035 : 0);
      if ((player.age >= 34 && player.ovr <= 68) || random() < retirementChance) {
        player.active = false;
        player.exitReason = '退役';
        retired += 1;
      }
      if (player.seasonHistory.length) {
        const history = player.seasonHistory[player.seasonHistory.length - 1];
        if (history.seasonNumber === league.seasonNumber) {
          history.offseason = {
            beforeOvr,
            afterOvr: player.ovr,
            change: player.ovr - beforeOvr,
            injuryDecline: appliedInjuryDecline,
            retired: !player.active,
            exitReason: player.exitReason || null
          };
        }
      }
    });
    const transactions = processLeagueTransactions(league, nextSeasonNumber);
    const rookies = addRookieClass(league, nextSeasonNumber);
    fillLeagueRosters(league, nextSeasonNumber);
    trimLeagueRosters(league);
    league.seasonNumber = nextSeasonNumber;
    league.healthSeasonNumber = null;
    league.profileSeasonNumber = null;
    league.retiredCount += retired;
    return { retired, rookies, transactions };
  }

  function processLeagueTransactions(league, nextSeasonNumber) {
    if (!Array.isArray(league.transactionHistory)) league.transactionHistory = [];
    const historyStart = league.transactionHistory.length;
    const activePlayers = league.players.filter(player => player.active && !player.isUser && player.teamId);
    activePlayers.forEach(player => {
      player.contractYears = Math.max(0, (player.contractYears ?? 1) - 1);
      if (player.contractYears > 0) return;
      const fromTeamId = player.teamId;
      const shouldMove = random() < clamp(0.12 + Math.max(0, 77 - player.ovr) * 0.006, 0.1, 0.28);
      if (shouldMove) {
        const destinations = DATA.TEAMS
          .filter(team => team.id !== fromTeamId)
          .filter(team => !recentTeamTrade(league, fromTeamId, team.id, nextSeasonNumber, 2))
          .map(team => {
            const count = league.players.filter(item => item.active && item.teamId === team.id).length;
            const wins = league.teamRecords?.[team.id]?.wins ?? 41;
            const need = teamPositionNeed(league, team.id, leaguePlayerPositions(player));
            const strategyFit = player.age <= 25 && wins < 40 ? 4 : (player.ovr >= 84 && wins >= 43 ? 4 : 0);
            return { team, score: need + strategyFit - Math.max(0, count - 14) * 3 + randomNormal() * 1.5 };
          })
          .sort((left, right) => right.score - left.score)
          .slice(0, 5);
        const destination = destinations[Math.floor(random() * destinations.length)]?.team;
        if (destination) {
          player.teamId = destination.id;
          league.transactionHistory.push({ seasonNumber: nextSeasonNumber, type: '自由签约', playerId: player.id, playerName: player.name, fromTeamId, toTeamId: destination.id });
        }
      }
      player.contractYears = player.age >= 33 ? 1 + Math.floor(random() * 2) : 2 + Math.floor(random() * 3);
    });

    const tradeCount = Math.max(3, Math.floor(DATA.TEAMS.length / 6));
    const used = new Set();
    for (let index = 0; index < tradeCount; index += 1) {
      const pool = league.players.filter(player => player.active && !player.isUser && player.teamId && !used.has(player.id));
      if (pool.length < 2) break;
      const first = pool.map(player => {
        const assessment = leaguePlayerTradeAssessment(league, player, nextSeasonNumber);
        return { player, priority: assessment.chance + random() * 0.05 };
      }).sort((left, right) => right.priority - left.priority)[0].player;
      const matches = pool
        .filter(player => player.teamId !== first.teamId && !used.has(player.id))
        .map(player => {
          const assessment = leaguePlayerTradeAssessment(league, player, nextSeasonNumber);
          const protectedPlayer = assessment.chance < 0.03 && random() >= assessment.chance * 4;
          return { player, score: protectedPlayer ? -Infinity : tradePairScore(league, first, player, nextSeasonNumber) + assessment.chance * 22 + randomNormal() * 1.2 };
        })
        .filter(candidate => Number.isFinite(candidate.score))
        .sort((left, right) => right.score - left.score);
      if (!matches.length) continue;
      const second = matches[0].player;
      const firstTeam = first.teamId;
      first.teamId = second.teamId;
      second.teamId = firstTeam;
      used.add(first.id);
      used.add(second.id);
      league.transactionHistory.push({
        seasonNumber: nextSeasonNumber,
        type: '交易',
        playerId: first.id,
        playerName: first.name,
        counterpartId: second.id,
        counterpartName: second.name,
        firstValue: SIM.tradeValue(first),
        counterpartValue: SIM.tradeValue(second),
        fromTeamId: firstTeam,
        toTeamId: first.teamId
      });
    }
    return league.transactionHistory.length - historyStart;
  }

  function ensureLeagueState() {
    if (!state.career) return null;
    if (!state.career.league || !Array.isArray(state.career.league.players)) {
      state.career.league = createLeagueState();
      while (state.career.league.seasonNumber < state.career.seasonNumber) {
        evolveLeagueSeason(state.career.league, state.career.league.seasonNumber + 1);
      }
    }
    if (!state.career.league.eraKey) state.career.league.eraKey = state.eraKey || 'current';
    if (!Number.isFinite(state.career.league.startYear)) state.career.league.startYear = DATA.getEra(state.eraKey).startYear;
    if (!Array.isArray(state.career.league.awardHistory)) state.career.league.awardHistory = [];
    if (!Array.isArray(state.career.league.transactionHistory)) state.career.league.transactionHistory = [];
    if (!Number.isFinite(state.career.league.retiredCount)) state.career.league.retiredCount = 0;
    state.career.league.players.forEach(player => {
      if (!Number.isFinite(player.luck)) player.luck = 45 + hashText(`health-${player.name}`) % 51;
      if (!Array.isArray(player.injuryHistory)) player.injuryHistory = [];
      if (!Number.isFinite(player.pendingInjuryDecline)) player.pendingInjuryDecline = 0;
      if (!Number.isFinite(player.contractYears)) player.contractYears = 1 + hashText(`contract-${player.name}`) % 4;
      if (!Number.isFinite(player.sourceOvr)) player.sourceOvr = player.ovr;
      if (!Number.isFinite(player.simOvr)) player.simOvr = player.ovr;
      if (!Array.isArray(player.positions) || !player.positions.length) player.positions = [player.pos];
      if (!Array.isArray(player.seasonHistory)) player.seasonHistory = [];
      if (player.seasonInjury === undefined) player.seasonInjury = null;
      if (player.seasonRole === undefined) player.seasonRole = null;
      player.forcedRetirement = Boolean(player.forcedRetirement);
    });
    return state.career.league;
  }

  function injuryRiskForGame() {
    const profile = state.season.roleProfile;
    return workloadInjuryRisk(profile.minutes, profile.usage, state.career.luck);
  }

  function workloadInjuryRisk(minutes, usage, luck) {
    const luckRisk = (70 - luck) * 0.00004;
    const minutesRisk = Math.max(0, minutes - 26) * 0.00018;
    const usageRisk = Math.max(0, usage - 22) * 0.00012;
    return clamp(0.001 + luckRisk + minutesRisk + usageRisk, 0.0006, 0.008);
  }

  function injuryTypeForWorkload(workload, roll = random()) {
    const devastatingThreshold = 0.012 + Math.max(0, workload - 62) * 0.001;
    const severeThreshold = devastatingThreshold + 0.11 + Math.max(0, workload - 58) * 0.002;
    if (roll < devastatingThreshold) return 'devastating';
    if (roll < severeThreshold) return 'severe';
    return 'light';
  }

  function applyPermanentInjuryDecline(type) {
    const before = state.finalOVR;
    DATA.ATTRS.forEach(([key]) => {
      if (key === 'POT') return;
      let decline = type === 'devastating' ? 7 + Math.floor(random() * 6) : 1 + Math.floor(random() * 3);
      if (['ATH', 'DNK', 'STR'].includes(key)) decline += type === 'devastating' ? 3 : 1;
      if (type === 'devastating' && ['PAS', 'MID', 'CLU'].includes(key)) decline = Math.max(4, decline - 2);
      state.attrs[key] = clamp(state.attrs[key] - decline, 40, 99);
    });
    finalizePlayer();
    state.career.currentOVR = state.finalOVR;
    return { before, after: state.finalOVR, decline: before - state.finalOVR };
  }

  function triggerInjury(gameNumber, forcedType) {
    const workload = state.season.roleProfile.minutes + state.season.roleProfile.usage;
    const type = forcedType || injuryTypeForWorkload(workload);

    let status;
    if (type === 'light') {
      const gamesRemaining = 3 + Math.floor(random() * 8);
      const penalty = 4 + Math.floor(random() * 5);
      status = {
        type,
        label: INJURY_LABELS[type],
        gamesRemaining,
        penalty,
        seasonEnding: false,
        careerEnding: false,
        text: `${INJURY_LABELS[type]}：预计影响 ${gamesRemaining} 场，有效能力暂时下降 ${penalty} 点`
      };
    } else {
      const decline = applyPermanentInjuryDecline(type);
      const careerEnding = type === 'devastating' && (
        (forcedType && localDebugParam('careerEnd') === '1') ||
        random() < clamp(0.28 + Math.max(0, state.career.age - 30) * 0.035 + Math.max(0, 60 - state.career.luck) * 0.006, 0.2, 0.72)
      );
      status = {
        type,
        label: INJURY_LABELS[type],
        gamesRemaining: 82 - gameNumber + 1,
        penalty: decline.decline,
        seasonEnding: true,
        careerEnding,
        beforeOVR: decline.before,
        afterOVR: decline.after,
        text: careerEnding
          ? `${INJURY_LABELS[type]}：赛季报销，能力 ${decline.before} → ${decline.after}，医疗评估建议结束生涯`
          : `${INJURY_LABELS[type]}：赛季报销，能力永久下降 ${decline.before} → ${decline.after}`
      };
      if (careerEnding) state.career.forcedRetirement = true;
    }
    state.season.injuryStatus = status;
    const event = {
      ...status,
      game: gameNumber,
      season: state.career.seasonNumber,
      age: state.career.age
    };
    state.season.injuries.push(event);
    state.career.injuries.push(event);
    return event;
  }

  function maybeTriggerInjury(gameNumber) {
    if (state.season.injuryStatus) return null;
    const forcedType = localDebugParam('injuryOutcome');
    if (gameNumber === 1 && INJURY_LABELS[forcedType]) return triggerInjury(gameNumber, forcedType);
    if (random() >= injuryRiskForGame()) return null;
    return triggerInjury(gameNumber);
  }

  function advanceInjuryRecovery() {
    const injury = state.season.injuryStatus;
    if (injury?.type !== 'light') return;
    injury.gamesRemaining -= 1;
    if (injury.gamesRemaining <= 0) state.season.injuryStatus = null;
  }

  function postseasonEffectiveOVR() {
    const injury = state.season.injuryStatus;
    if (injury?.seasonEnding) return teamStrength(state.careerTeam);
    return clamp(state.finalOVR - (injury?.type === 'light' ? injury.penalty : 0), 40, 99);
  }

  function renderDraftDebug(eraKey, targetSeason) {
    state = freshState();
    state.eraKey = eraKey;
    DATA.setEra(eraKey);
    const league = createLeagueState();
    state.debugLeague = league;
    let lastUpdate = { retired: 0, rookies: league.players.filter(player => player.seasons === 0).length };
    while (league.seasonNumber < targetSeason) lastUpdate = evolveLeagueSeason(league, league.seasonNumber + 1);
    assignLeagueRotations(league);
    const draftYear = league.startYear + targetSeason - 1;
    const rookies = league.players.filter(player => player.active && player.seasons === 0 && player.draftYear === draftYear);
    const activeAges = league.players.filter(player => player.active).map(player => player.age);
    const audit = SIM.auditLeague(DATA.TEAMS, league.players);
    const rotationTotals = Object.fromEntries(DATA.TEAMS.map(team => [team.id, league.players
      .filter(player => player.active && player.teamId === team.id)
      .reduce((sum, player) => sum + (player.seasonRole?.minutes || 0), 0)]));
    app.innerHTML = `<section class="screen"><p class="step-label">LEAGUE DEBUG</p><h1>${eraKey} 纪元第 ${targetSeason} 季</h1><p class="subtitle">${DATA.seasonLabel(draftYear)} · ${rookies.length} 名新秀 · 累计 ${league.retiredCount} 人退役</p><div class="info-strip"><b>年龄范围</b> ${Math.min(...activeAges)}–${Math.max(...activeAges)} 岁</div><ol>${rookies.map(player => `<li>${player.draftOrder}. ${player.name} · ${player.age} 岁 · ${player.ovr}/${player.potential}</li>`).join('')}</ol><p>本次推进：${lastUpdate.retired} 人退役，${lastUpdate.rookies} 人入盟</p><pre id="league-audit">${JSON.stringify({ rosterSizes: audit.rosterSizes, duplicateIds: audit.duplicateIds, rotationTotals, activePlayers: league.players.filter(player => player.active).length, transactions: league.transactionHistory?.length || 0 })}</pre></section>`;
  }

  function simulateOneGame() {
    const game = state.season.schedule.find(item => !item.result);
    if (!game) return null;
    const injuryEvent = maybeTriggerInjury(game.game);
    const injury = state.season.injuryStatus;
    const unavailable = Boolean(injury?.seasonEnding);
    const temporaryPenalty = injury?.type === 'light' ? injury.penalty : 0;
    const effectiveOVR = clamp(state.finalOVR - temporaryPenalty, 40, 99);
    const opponentStrength = teamStrength(game.opponent);
    const teamBase = teamStrength(state.careerTeam);
    const ownBase = teamBase;
    const margin = ownBase - opponentStrength + randomNormal() * 8;
    const won = margin >= 0;
    const myScore = Math.max(84, Math.round(110 + margin / 2 + randomNormal() * 5));
    const theirScore = Math.max(82, Math.round(110 - margin / 2 + randomNormal() * 5));
    const minutes = unavailable ? 0 : Math.round(clamp(state.season.roleProfile.minutes + randomNormal() * 1.7, 4, 40) * 10) / 10;
    const effectiveAttrs = Object.fromEntries(DATA.ATTRS.map(([key]) => [
      key,
      key === 'POT' ? state.attrs[key] : clamp(state.attrs[key] - temporaryPenalty, 40, 99)
    ]));
    const statProfile = SIM.calculateStatProfile({
      attrs: effectiveAttrs,
      position: state.position,
      minutes,
      usage: state.season.roleProfile.usage,
      ovr: effectiveOVR
    });
    const { minuteScale, usageScale } = statProfile;
    const fga = unavailable ? 0 : Math.max(2, Math.round(statProfile.fga + randomNormal() * 1.8));
    const perimeterBias = { PG: 1.1, SG: 1.2, SF: 1, PF: 0.72, C: 0.48 }[state.position] || 1;
    const tpa = unavailable ? 0 : clamp(Math.round((1 + effectiveAttrs.threePT / 13) * perimeterBias * minuteScale * usageScale + randomNormal() * 1.2), 0, Math.max(0, fga - 1));
    const twoPa = fga - tpa;
    const twoPct = clamp(0.36 + (effectiveAttrs.FIN + effectiveAttrs.MID + effectiveAttrs.DNK) / 300 * 0.22, 0.4, 0.67);
    const threePct = clamp(0.24 + effectiveAttrs.threePT / 100 * 0.2, 0.25, 0.46);
    const fta = unavailable ? 0 : Math.max(0, Math.round((2 + (effectiveAttrs.FIN + effectiveAttrs.ATH) / 200 * 5) * minuteScale * usageScale + randomNormal() * 1.2));
    const ftPct = clamp(0.52 + (effectiveAttrs.MID + effectiveAttrs.CLU) / 200 * 0.32, 0.58, 0.92);
    const tpm = clamp(Math.round(tpa * threePct + randomNormal() * 0.9), 0, tpa);
    const twoPm = clamp(Math.round(twoPa * twoPct + randomNormal() * 1.1), 0, twoPa);
    const ftm = clamp(Math.round(fta * ftPct + randomNormal() * 0.7), 0, fta);
    const stats = unavailable ? { ...freshPlayerTotals() } : {
      pts: twoPm * 2 + tpm * 3 + ftm,
      reb: Math.max(0, Math.round(statProfile.reb + randomNormal() * 1.8)),
      ast: Math.max(0, Math.round(statProfile.ast + randomNormal() * 1.8)),
      stl: Math.max(0, Math.round((statProfile.stl + randomNormal() * 0.45) * 10) / 10),
      blk: Math.max(0, Math.round((statProfile.blk + randomNormal() * 0.38) * 10) / 10),
      tov: Math.max(0, Math.round((statProfile.tov + randomNormal() * 0.65) * 10) / 10),
      fgm: twoPm + tpm,
      fga,
      tpm,
      tpa,
      ftm,
      fta,
      min: minutes
    };
    game.result = {
      won,
      myScore: won ? Math.max(myScore, theirScore + 1) : Math.min(myScore, theirScore - 1),
      theirScore,
      stats,
      played: !unavailable,
      injuryEvent
    };
    if (won) state.season.wins += 1; else state.season.losses += 1;
    if (!unavailable) {
      state.season.playerGames += 1;
      Object.keys(freshPlayerTotals()).forEach(key => {
        state.season.playerTotals[key] += stats[key];
      });
    }
    advanceInjuryRecovery();
    if (state.season.wins + state.season.losses >= 82) finishRegularSeason();
    return game;
  }

  function simulateNextGame() {
    if (state.season.stage !== 'regular') return;
    const game = simulateOneGame();
    if (game) playTone(game.result.won ? 660 : 260, 0.08);
    renderSeason();
    saveGame();
  }

  function simulateAllGames() {
    if (state.season.stage !== 'regular' || state.season.isSimulating) return;
    state.season.isSimulating = true;
    renderSeason();
    runRegularSeasonAnimation();
  }

  function runRegularSeasonAnimation() {
    if (!state.season || state.season.stage !== 'regular') return;
    state.season.isSimulating = true;
    const timer = startSimulationTimer(() => {
      const game = simulateOneGame();
      updateRegularSeasonAnimation(game);
      if (!game || !state.season.schedule.some(item => !item.result)) {
        stopSimulationTimer(timer);
        state.season.isSimulating = false;
        playTone(720, 0.12);
        renderSeason();
        saveGame();
      }
    }, 42);
  }

  function updateRegularSeasonAnimation(game) {
    const completed = state.season.wins + state.season.losses;
    const progress = document.getElementById('season-sim-progress');
    const gameLabel = document.getElementById('season-sim-game');
    const record = document.getElementById('season-sim-record');
    const latest = document.getElementById('season-sim-latest');
    if (progress) progress.style.width = `${completed / 82 * 100}%`;
    if (gameLabel) gameLabel.textContent = `${completed} / 82`;
    if (record) record.textContent = `${state.season.wins}-${state.season.losses}`;
    updateSeasonDashboard();
    if (latest && game && game.result) {
      const opponent = DATA.getTeam(game.opponent);
      const healthNote = game.result.injuryEvent ? ` · ${game.result.injuryEvent.label}` : (game.result.played ? '' : ' · 我缺阵');
      latest.innerHTML = `<img src="${opponent.logo}" alt=""><span>对阵 ${opponent.name}${healthNote}</span><b class="${game.result.won ? 'win' : 'loss'}">${game.result.won ? '胜' : '负'} ${game.result.myScore}-${game.result.theirScore}</b>`;
    }
  }

  function updateSeasonDashboard() {
    const averages = seasonAverages();
    const values = {
      'season-record': `${state.season.wins}-${state.season.losses}`,
      'season-pts': averages.pts,
      'season-reb': averages.reb,
      'season-ast': averages.ast,
      'season-stl': averages.stl,
      'season-blk': averages.blk,
      'season-tov': averages.tov,
      'season-min': averages.min,
      'season-gp': state.season.playerGames || 0,
      'season-fg': `${averages.fgPct}%`,
      'season-three': `${averages.threePct}%`,
      'season-ft': `${averages.ftPct}%`
    };
    Object.entries(values).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    });
  }

  function finishRegularSeason() {
    const league = ensureLeagueState();
    assignLeagueRotations(league);
    const strengths = Object.fromEntries(DATA.TEAMS.map(team => [team.id, teamStrength(team.id)]));
    const averageStrength = Object.values(strengths).reduce((sum, value) => sum + value, 0) / DATA.TEAMS.length;
    const rawWins = Object.fromEntries(DATA.TEAMS.map(team => [
      team.id,
      clamp(Math.round(41 + (strengths[team.id] - averageStrength) * 1.65 + randomNormal() * 3.8), 12, 70)
    ]));
    league.teamRecords = SIM.normalizeTeamRecords(
      DATA.TEAMS.map(team => team.id),
      rawWins,
      { teamId: state.careerTeam, wins: state.season.wins }
    );
    league.standings = SIM.conferenceSeeds(DATA.TEAMS, league.teamRecords);
    const conference = DATA.getTeam(state.careerTeam).conference;
    const standing = league.standings[conference].find(team => team.id === state.careerTeam);
    state.season.seed = standing?.seed || 15;
    state.season.originalSeed = state.season.seed;
    state.season.conferenceStandings = league.standings[conference];
    if (state.season.seed <= 6) state.season.postSeasonStage = 'playoffs';
    else if (state.season.seed <= 10) state.season.postSeasonStage = 'playin';
    else state.season.postSeasonStage = 'ended';
    state.season.awards = buildSeasonAwards();
    state.season.stage = 'awards';
  }

  function leagueSeasonProfiles() {
    const league = ensureLeagueState();
    initializeLeagueSeasonHealth(league, state.career.seasonNumber);
    const activePlayers = league.players.filter(player => player.active && !player.isUser);
    if (league.profileSeasonNumber === state.career.seasonNumber && activePlayers.every(player => player.lastSeason?.seasonNumber === state.career.seasonNumber)) {
      return activePlayers.map(player => ({ ...player, ...player.lastSeason }));
    }
    const profiles = activePlayers.map(player => {
      const role = player.seasonRole || { minutes: 20, usage: 18 };
      const injury = player.seasonInjury;
      const games = injury?.seasonEnding ? injury.gamesPlayed : 82;
      const availability = games / 82;
      const minuteScale = role.minutes / 32;
      const usageScale = clamp(role.usage / 24, 0.5, 1.5);
      const scoringBoost = { sniper: 3.4, creator: 2.2, slasher: 3, wing: 1.4, anchor: -4, big: -1.2, twoway: -0.8, pointbig: 0.8 }[player.archetype] || 0;
      const passingBoost = { PG: 3.2, SG: 1.1, SF: 1, PF: 0.6, C: 0.9 }[player.pos] + (['creator', 'pointbig'].includes(player.archetype) ? 1.4 : 0);
      const reboundingBoost = { PG: 0, SG: 0.7, SF: 2.1, PF: 4.3, C: 6.2 }[player.pos];
      const healthScale = injury?.type === 'light' ? clamp(1 - injury.penalty * injury.duration / 3000, 0.9, 1) : 1;
      const pts = clamp((7.5 + (player.ovr - 70) * 0.58 + scoringBoost * 0.75 + Math.max(0, role.usage - 20) * 0.25 + randomNormal() * 1.5) * minuteScale * (0.78 + usageScale * 0.22) * healthScale, 2, 36);
      const ast = clamp((1 + (player.ovr - 70) * 0.08 + passingBoost + randomNormal() * 0.6) * minuteScale * (0.82 + usageScale * 0.18) * healthScale, 0.5, 12.5);
      const reb = clamp((2 + (player.ovr - 70) * 0.1 + reboundingBoost + randomNormal() * 0.8) * minuteScale * healthScale, 1, 15);
      const stocks = clamp((0.5 + (player.defense - 60) * 0.045 + (['anchor', 'twoway'].includes(player.archetype) ? 1.1 : 0) + randomNormal() * 0.35) * minuteScale * healthScale, 0.2, 5.2);
      const wins = league.teamRecords?.[player.teamId]?.wins ?? 41;
      player.lastSeason = { seasonNumber: state.career.seasonNumber, pts: Number(pts.toFixed(1)), ast: Number(ast.toFixed(1)), reb: Number(reb.toFixed(1)), stocks: Number(stocks.toFixed(1)), wins, games, minutes: role.minutes, usage: role.usage, availability, injury: injury?.label || null };
      return { ...player, ...player.lastSeason };
    });
    league.profileSeasonNumber = state.career.seasonNumber;
    return profiles;
  }

  function pickLeagueAward(profiles, awardKey, score) {
    if (!profiles.length) return null;
    const history = state.career.league.awardHistory || [];
    const recentWinners = history.slice(-2).map(entry => entry[awardKey]);
    return profiles.map(player => {
      let repeatPenalty = 0;
      if (recentWinners[recentWinners.length - 1] === player.name) repeatPenalty += 3.5;
      if (recentWinners[0] === player.name) repeatPenalty += 1.5;
      return { ...player, awardScore: score(player) * (0.55 + player.availability * 0.45) - repeatPenalty + randomNormal() * 2.2 };
    }).sort((left, right) => right.awardScore - left.awardScore)[0];
  }

  function buildSeasonAwards() {
    const averages = seasonAverages();
    const defensiveAverage = ['PDEF', 'IDEF', 'BLK', 'REB'].reduce((sum, key) => sum + state.attrs[key], 0) / 4;
    const profiles = leagueSeasonProfiles();
    const awardEligible = profiles.filter(player => player.games >= 65);
    const scoringEligible = profiles.filter(player => player.games >= 58);
    const mvpPool = awardEligible.length ? awardEligible : profiles;
    const scoringPool = scoringEligible.length ? scoringEligible : profiles;
    const mvp = pickLeagueAward(mvpPool, 'mvp', player => player.ovr * 0.72 + player.pts * 0.85 + player.ast * 0.35 + player.wins * 0.16);
    const dpoy = pickLeagueAward(mvpPool, 'dpoy', player => player.defense * 0.9 + player.stocks * 4.5 + player.reb * 0.35 + player.wins * 0.1);
    const scoring = pickLeagueAward(scoringPool, 'scoring', player => player.pts * 3 + player.ovr * 0.12);
    const rookies = profiles.filter(player => player.seasons === 0);
    const rookiePool = rookies.length ? rookies : profiles.slice().sort((left, right) => left.age - right.age).slice(0, 12);
    const rookie = pickLeagueAward(rookiePool, 'rookie', player => player.ovr * 0.8 + player.pts * 0.7 + player.ast * 0.25 + player.reb * 0.2);
    const userAvailability = clamp((state.season.playerGames || 0) / 82, 0, 1);
    const userMVPScore = (state.finalOVR * 0.72 + Number(averages.pts) * 0.85 + Number(averages.ast) * 0.35 + state.season.wins * 0.16) * (0.55 + userAvailability * 0.45);
    const userDPOYScore = (defensiveAverage * 0.9 + (Number(averages.stl) + Number(averages.blk)) * 4.5 + Number(averages.reb) * 0.35 + state.season.wins * 0.1) * (0.55 + userAvailability * 0.45);
    const userRookieScore = (state.finalOVR * 0.8 + Number(averages.pts) * 0.7 + Number(averages.ast) * 0.25 + Number(averages.reb) * 0.2) * (0.55 + userAvailability * 0.45);
    const userAwardEligible = (state.season.playerGames || 0) >= 65;
    const userMVP = userAwardEligible && userMVPScore >= mvp.awardScore;
    const userDPOY = userAwardEligible && userDPOYScore >= dpoy.awardScore;
    const userROTY = state.career.seasonNumber === 1 && userRookieScore >= rookie.awardScore;
    const userScoring = (state.season.playerGames || 0) >= 58 && Number(averages.pts) >= scoring.pts;
    let allNba = '未入选';
    if (userAwardEligible) {
      const userAllNbaScore = state.finalOVR * 0.5 + Number(averages.pts) * 0.85 + Number(averages.reb) * 0.2 + Number(averages.ast) * 0.3 + state.season.wins * 0.08;
      const allNbaRank = [...mvpPool.map(player => ({ score: player.ovr * 0.5 + player.pts * 0.85 + player.reb * 0.2 + player.ast * 0.3 + player.wins * 0.08 })), { score: userAllNbaScore, isUser: true }]
        .sort((left, right) => right.score - left.score)
        .findIndex(player => player.isUser) + 1;
      if (allNbaRank <= 5) allNba = '最佳阵容一阵';
      else if (allNbaRank <= 10) allNba = '最佳阵容二阵';
      else if (allNbaRank <= 15) allNba = '最佳阵容三阵';
    }
    const awards = [
      { label: '最有价值球员', short: 'MVP', winner: userMVP ? '我' : mvp.name, detail: userMVP ? `${averages.pts} 分 · ${state.season.wins} 胜` : `${mvp.pts} 分 · ${mvp.ast} 助攻 · ${mvp.wins} 胜`, isUser: userMVP },
      { label: '最佳防守球员', short: 'DPOY', winner: userDPOY ? '我' : dpoy.name, detail: userDPOY ? `场均 ${(Number(averages.stl) + Number(averages.blk)).toFixed(1)} 次抢断盖帽` : `${dpoy.stocks} 次抢断盖帽 · ${dpoy.reb} 篮板`, isUser: userDPOY },
      { label: '年度最佳新秀', short: 'ROTY', winner: userROTY ? '我' : rookie.name, detail: userROTY ? `${state.finalOVR} OVR · ${state.archetype.label}` : `${rookie.teamId} · ${rookie.ovr} OVR · ${rookie.pts} 分`, isUser: userROTY },
      { label: '常规赛得分王', short: 'SC', winner: userScoring ? '我' : scoring.name, detail: `场均 ${userScoring ? averages.pts : scoring.pts} 分`, isUser: userScoring },
      { label: '最佳阵容', short: 'ALL', winner: allNba === '未入选' ? '评选结果' : '我', detail: allNba, isUser: allNba !== '未入选' }
    ];
    state.career.league.awardHistory.push({
      seasonNumber: state.career.seasonNumber,
      mvp: awards[0].winner,
      dpoy: awards[1].winner,
      rookie: awards[2].winner,
      scoring: awards[3].winner
    });
    return awards;
  }

  function continuePostseason() {
    if (state.season.stage !== 'awards') return;
    state.season.stage = state.season.postSeasonStage;
    if (state.season.stage === 'ended') state.season.ended = true;
    playTone(640, 0.08);
    renderSeason();
    saveGame();
  }

  function simulatePlayIn() {
    if (state.season.stage !== 'playin' || state.season.playInSimulation) return;
    const opponent = selectPostseasonOpponent(false);
    const chance = SIM.seriesWinProbability(teamStrength(state.careerTeam), teamStrength(opponent), 0);
    state.season.playInSimulation = { opponent, quarter: 0, myScore: 0, theirScore: 0 };
    renderSeason();
    const timer = startSimulationTimer(() => {
      const sim = state.season.playInSimulation;
      sim.quarter += 1;
      sim.myScore += Math.max(17, Math.round(26 + (chance - 0.5) * 9 + randomNormal() * 4));
      sim.theirScore += Math.max(17, Math.round(26 - (chance - 0.5) * 9 + randomNormal() * 4));
      renderSeason();
      if (sim.quarter >= 4) {
        stopSimulationTimer(timer);
        const won = random() < chance;
        if (won && sim.myScore <= sim.theirScore) sim.myScore = sim.theirScore + Math.ceil(random() * 6);
        if (!won && sim.myScore >= sim.theirScore) sim.theirScore = sim.myScore + Math.ceil(random() * 6);
        const playInStep = state.season.playInStep || 1;
        state.season.series.push({ label: playInStep === 1 ? '附加赛首战' : '附加赛决胜战', opponent, won, score: `${sim.myScore}-${sim.theirScore}` });
        state.season.playInSimulation = null;
        advanceInjuryRecovery();
        const originalSeed = state.season.originalSeed || state.season.seed;
        if (playInStep === 1 && originalSeed <= 8 && won) {
          state.season.seed = 7;
          state.season.stage = 'playoffs';
        } else if (playInStep === 1 && originalSeed <= 8 && !won) {
          state.season.playInStep = 2;
          state.season.stage = 'playin';
        } else if (playInStep === 1 && originalSeed >= 9 && won) {
          state.season.playInStep = 2;
          state.season.stage = 'playin';
        } else if (playInStep === 2 && won) {
          state.season.seed = 8;
          state.season.stage = 'playoffs';
        } else {
          state.season.stage = 'ended';
        }
        state.season.ended = state.season.stage === 'ended';
        playTone(won ? 720 : 220, 0.12);
        renderSeason();
        saveGame();
      }
    }, 520);
  }

  function playoffSeedMap(conference) {
    const standings = state.career.league.standings?.[conference]
      || SIM.conferenceSeeds(DATA.TEAMS, state.career.league.teamRecords || {})[conference];
    const seedMap = Object.fromEntries(standings.filter(team => team.seed <= 8).map(team => [team.seed, team.id]));
    if (DATA.getTeam(state.careerTeam).conference !== conference || state.season.seed > 8) return seedMap;
    const currentSlot = Number(Object.keys(seedMap).find(seed => seedMap[seed] === state.careerTeam));
    if (currentSlot !== state.season.seed) {
      const displaced = seedMap[state.season.seed];
      if (currentSlot) delete seedMap[currentSlot];
      seedMap[state.season.seed] = state.careerTeam;
      if (currentSlot && displaced && displaced !== state.careerTeam) seedMap[currentSlot] = displaced;
    }
    return seedMap;
  }

  function initializePostseasonBracket() {
    if (state.season.postseasonBracket) return state.season.postseasonBracket;
    const pairings = [[1, 8], [4, 5], [2, 7], [3, 6]];
    const conferences = {};
    ['EAST', 'WEST'].forEach(conference => {
      const seeds = playoffSeedMap(conference);
      conferences[conference] = {
        rounds: [pairings.map(([left, right]) => ({
          teams: [seeds[left], seeds[right]],
          seeds: [left, right],
          winner: null,
          score: null
        }))],
        champion: null
      };
    });
    state.season.postseasonBracket = { conferences, finals: null, computerSeries: [] };
    const ownConference = DATA.getTeam(state.careerTeam).conference;
    const completed = (state.season.series || []).filter(series => ['首轮', '分区半决赛', '分区决赛'].includes(series.label));
    completed.forEach((series, round) => {
      const conferenceBracket = prepareConferenceRound(ownConference, round);
      const matchup = conferenceBracket.rounds[round]?.find(item => item.teams.includes(state.careerTeam));
      if (matchup) {
        matchup.winner = series.won ? state.careerTeam : series.opponent;
        matchup.score = series.score;
        if (round === 2) conferenceBracket.champion = matchup.winner;
      }
    });
    return state.season.postseasonBracket;
  }

  function simulateComputerSeries(matchup, round, label) {
    if (matchup.winner) return matchup.winner;
    const [left, right] = matchup.teams;
    let leftWins = 0;
    let rightWins = 0;
    const chance = SIM.seriesWinProbability(teamStrength(left), teamStrength(right), round);
    while (leftWins < 4 && rightWins < 4) {
      if (random() < chance) leftWins += 1;
      else rightWins += 1;
    }
    matchup.winner = leftWins === 4 ? left : right;
    matchup.score = `${leftWins}-${rightWins}`;
    state.season.postseasonBracket.computerSeries.push({ label, teams: [left, right], winner: matchup.winner, score: matchup.score });
    return matchup.winner;
  }

  function prepareConferenceRound(conference, round) {
    const bracket = initializePostseasonBracket().conferences[conference];
    for (let current = 0; current <= round; current += 1) {
      const matchups = bracket.rounds[current];
      matchups.forEach(matchup => {
        if (!matchup.teams.includes(state.careerTeam)) simulateComputerSeries(matchup, current, ['首轮', '分区半决赛', '分区决赛'][current]);
      });
      if (current >= round || bracket.rounds[current + 1]) continue;
      const winners = matchups.map(matchup => matchup.winner);
      if (winners.some(winner => !winner)) break;
      bracket.rounds[current + 1] = current === 0
        ? [{ teams: [winners[0], winners[1]], winner: null, score: null }, { teams: [winners[2], winners[3]], winner: null, score: null }]
        : [{ teams: [winners[0], winners[1]], winner: null, score: null }];
    }
    if (bracket.rounds[2]?.[0]?.winner) bracket.champion = bracket.rounds[2][0].winner;
    return bracket;
  }

  function resolveConferenceChampion(conference) {
    const bracket = initializePostseasonBracket().conferences[conference];
    for (let round = 0; round < 3; round += 1) {
      prepareConferenceRound(conference, round);
      bracket.rounds[round].forEach(matchup => simulateComputerSeries(matchup, round, ['首轮', '分区半决赛', '分区决赛'][round]));
    }
    bracket.champion = bracket.rounds[2][0].winner;
    return bracket.champion;
  }

  function selectPostseasonOpponent(isFinals) {
    const ownConference = DATA.getTeam(state.careerTeam).conference;
    if (state.season.stage === 'playin') {
      const standings = state.career.league.standings[ownConference];
      const originalSeed = state.season.originalSeed || state.season.seed;
      const step = state.season.playInStep || 1;
      const targetSeed = step === 1 ? ({ 7: 8, 8: 7, 9: 10, 10: 9 }[originalSeed] || 8) : (originalSeed <= 8 ? 9 : 8);
      return standings.find(team => team.seed === targetSeed)?.id;
    }
    const bracket = initializePostseasonBracket();
    if (isFinals) {
      const otherConference = ownConference === 'EAST' ? 'WEST' : 'EAST';
      const opponent = resolveConferenceChampion(otherConference);
      bracket.finals = bracket.finals || { teams: [state.careerTeam, opponent], winner: null, score: null };
      return opponent;
    }
    const conferenceBracket = prepareConferenceRound(ownConference, state.season.playoffRound);
    return conferenceBracket.rounds[state.season.playoffRound]
      .find(matchup => matchup.teams.includes(state.careerTeam))?.teams.find(teamId => teamId !== state.careerTeam);
  }

  function simulateSeries() {
    if (state.season.stage !== 'playoffs' || state.season.ended || state.season.seriesSimulation) return;
    const labels = ['首轮', '分区半决赛', '分区决赛', '总决赛'];
    const round = state.season.playoffRound;
    const opponent = selectPostseasonOpponent(round === 3);
    state.season.seriesSimulation = { label: labels[round], opponent, wins: 0, losses: 0, games: [] };
    renderSeason();
    const timer = startSimulationTimer(() => {
      const sim = state.season.seriesSimulation;
      const gameChance = SIM.seriesWinProbability(teamStrength(state.careerTeam), teamStrength(opponent), round);
      const forcedSeriesOutcome = localDebugParam('seriesOutcome');
      const wonGame = forcedSeriesOutcome === 'win' || (forcedSeriesOutcome !== 'loss' && random() < gameChance);
      advanceInjuryRecovery();
      if (wonGame) sim.wins += 1; else sim.losses += 1;
      const myScore = Math.round(101 + random() * 22 + (wonGame ? 5 : 0));
      const theirScore = Math.round(101 + random() * 22 + (wonGame ? 0 : 5));
      sim.games.push({ won: wonGame, myScore: wonGame ? Math.max(myScore, theirScore + 1) : Math.min(myScore, theirScore - 1), theirScore });
      renderSeason();
      if (sim.wins >= 4 || sim.losses >= 4) {
        stopSimulationTimer(timer);
        finalizeSeriesSimulation();
      }
    }, 520);
  }

  function finalizeSeriesSimulation() {
    const sim = state.season.seriesSimulation;
    const round = state.season.playoffRound;
    const won = sim.wins >= 4;
    const bracket = initializePostseasonBracket();
    const ownConference = DATA.getTeam(state.careerTeam).conference;
    const matchup = round === 3
      ? bracket.finals
      : bracket.conferences[ownConference].rounds[round].find(item => item.teams.includes(state.careerTeam));
    if (matchup) {
      matchup.winner = won ? state.careerTeam : sim.opponent;
      matchup.score = `${sim.wins}-${sim.losses}`;
      if (round === 2) bracket.conferences[ownConference].champion = matchup.winner;
    }
    state.season.series.push({ label: sim.label, opponent: sim.opponent, won, score: `${sim.wins}-${sim.losses}`, games: sim.games });
    state.season.seriesSimulation = null;
    if (!won) {
      state.season.stage = 'ended';
      state.season.ended = true;
      playTone(210, 0.16);
    } else if (round >= 3) {
      state.season.stage = 'champion';
      state.season.ended = true;
      state.season.champion = true;
      recordChampionship();
      playFanfare();
    } else {
      state.season.playoffRound += 1;
      playTone(760, 0.12);
    }
    renderSeason();
    saveGame();
  }

  function seasonAverages() {
    const games = Math.max(1, state.season.playerGames || 0);
    const totals = { ...freshPlayerTotals(), ...state.season.playerTotals };
    return averagesFromTotals(totals, games);
  }

  function averagesFromTotals(totals, games) {
    const gameCount = Math.max(1, games);
    const percentage = (made, attempted) => attempted > 0 ? (made / attempted * 100).toFixed(1) : '0.0';
    return {
      pts: (totals.pts / gameCount).toFixed(1),
      reb: (totals.reb / gameCount).toFixed(1),
      ast: (totals.ast / gameCount).toFixed(1),
      stl: (totals.stl / gameCount).toFixed(1),
      blk: (totals.blk / gameCount).toFixed(1),
      tov: (totals.tov / gameCount).toFixed(1),
      min: (totals.min / gameCount).toFixed(1),
      fgPct: percentage(totals.fgm, totals.fga),
      threePct: percentage(totals.tpm, totals.tpa),
      ftPct: percentage(totals.ftm, totals.fta)
    };
  }

  function careerAverages() {
    if (!state.career) return averagesFromTotals(freshPlayerTotals(), 0);
    return averagesFromTotals(state.career.totals, state.career.totalGames);
  }

  function seasonResultLabel() {
    if (state.season.champion) return '总冠军';
    const lastSeries = state.season.series[state.season.series.length - 1];
    if (lastSeries) return lastSeries.won ? `${lastSeries.label}晋级` : `${lastSeries.label}止步`;
    if (state.season.seed > 10) return '无缘季后赛';
    return '赛季结束';
  }

  function archiveCareerSeason() {
    if (!state.career || state.season.archived) return state.career.history[state.career.history.length - 1];
    const teamGames = state.season.wins + state.season.losses;
    const games = state.season.playerGames || 0;
    const totals = { ...freshPlayerTotals(), ...state.season.playerTotals };
    const averages = averagesFromTotals(totals, games);
    const earnedAwards = state.season.awards.filter(award => award.isUser).map(award => award.label);
    const entry = {
      seasonNumber: state.career.seasonNumber,
      seasonYear: state.career.startYear + state.career.seasonNumber - 1,
      age: state.career.age,
      teamId: state.careerTeam,
      ovr: state.finalOVR,
      potential: state.attrs.POT,
      games,
      teamGames,
      wins: state.season.wins,
      losses: state.season.losses,
      seed: state.season.seed,
      totals,
      averages,
      usage: state.season.roleProfile?.usage ?? 0,
      role: state.season.roleProfile?.role || '轮换球员',
      injuries: (state.season.injuries || []).map(injury => injury.label),
      awards: earnedAwards,
      champion: state.season.champion,
      postseason: seasonResultLabel()
    };
    state.career.history.push(entry);
    state.career.totalGames += games;
    Object.keys(state.career.totals).forEach(key => {
      state.career.totals[key] += totals[key] || 0;
    });
    earnedAwards.forEach(label => {
      state.career.awardCounts[label] = (state.career.awardCounts[label] || 0) + 1;
    });
    if (entry.champion) state.career.championships += 1;
    state.career.currentOVR = state.finalOVR;
    state.career.peakOVR = Math.max(state.career.peakOVR, state.finalOVR);
    const leaguePlayer = syncUserLeaguePlayer();
    if (leaguePlayer && !leaguePlayer.seasonHistory.some(season => season.seasonNumber === entry.seasonNumber)) {
      leaguePlayer.seasonHistory.push({
        seasonNumber: entry.seasonNumber,
        teamId: entry.teamId,
        games: entry.games,
        wins: entry.wins,
        pts: Number(entry.averages.pts),
        reb: Number(entry.averages.reb),
        ast: Number(entry.averages.ast),
        minutes: Number(entry.averages.min),
        injury: entry.injuries.join(' / ') || null
      });
    }
    state.season.archived = true;
    return entry;
  }

  function applyCareerDevelopment(nextAge) {
    const before = state.finalOVR;
    const growthChance = potentialGrowthChance(state.career.potential, nextAge);
    const growthTriggered = nextAge <= 30 && random() < growthChance;
    const potentialFactor = clamp((state.career.potential - 40) / 59, 0, 1);
    let baseChange = 0;
    if (growthTriggered && nextAge <= 22) baseChange = 1 + potentialFactor * 2.1;
    else if (growthTriggered && nextAge <= 26) baseChange = 0.5 + potentialFactor * 1.25;
    else if (growthTriggered && nextAge <= 30) baseChange = 0.15 + potentialFactor * 0.7;
    else if (nextAge <= 30) baseChange = -0.08;
    else if (nextAge <= 34) baseChange = -(0.75 + (nextAge - 31) * 0.35);
    else baseChange = -(1.9 + (nextAge - 35) * 0.55);

    DATA.ATTRS.forEach(([key]) => {
      if (key === 'POT') return;
      let change = baseChange + randomNormal() * 0.55;
      if (nextAge >= 31 && ['ATH', 'DNK', 'STR'].includes(key)) change -= 0.65;
      if (nextAge >= 31 && ['PAS', 'HAN', 'CLU'].includes(key)) change += 0.45;
      state.attrs[key] = clamp(Math.round(state.attrs[key] + change), 40, 99);
    });
    finalizePlayer();
    state.career.currentOVR = state.finalOVR;
    state.career.peakOVR = Math.max(state.career.peakOVR, state.finalOVR);
    const delta = state.finalOVR - before;
    return {
      before,
      after: state.finalOVR,
      delta,
      text: delta > 0
        ? `潜力兑现，能力成长 ${before} → ${state.finalOVR}`
        : (delta < 0 ? `年龄影响 ${before} → ${state.finalOVR}` : `本年未触发成长，能力维持 ${state.finalOVR}`)
    };
  }

  function tradeFitDescription(candidate) {
    const player = candidate.player;
    const samePosition = leaguePlayerPositions(player).includes(state.position);
    const positionName = DATA.POSITIONS[state.position]?.name || state.position;
    if (samePosition) return `双方以${positionName}核心完成对位调整`;
    if (candidate.targetNeed >= candidate.oldTeamNeed) return `${DATA.getTeam(player.teamId).name}需要补强${positionName}`;
    return `${DATA.getTeam(state.career.currentTeam).name}获得更符合阵容短板的球员`;
  }

  function executeUserTrade(league, oldTeamId, candidate, type) {
    const matched = candidate.player;
    const targetTeamId = matched.teamId;
    const userPlayer = syncUserLeaguePlayer();
    const userValue = SIM.tradeValue(userPlayer);
    const counterpartValue = SIM.tradeValue(matched);
    const fitDescription = tradeFitDescription(candidate);
    matched.teamId = oldTeamId;
    state.career.currentTeam = targetTeamId;
    syncUserLeaguePlayer();
    fillLeagueRosters(league, state.career.seasonNumber + 1);
    trimLeagueRosters(league);
    state.career.tradeCounterpartIds.push(matched.id);
    state.career.recentDepartures.push({ teamId: oldTeamId, season: state.career.seasonNumber });
    if (!state.career.teamsPlayed.includes(targetTeamId)) state.career.teamsPlayed.push(targetTeamId);
    state.career.teamRelationships[oldTeamId] = clamp((state.career.teamRelationships[oldTeamId] ?? 55) - (type === '申请交易' ? 15 : 5), 0, 100);
    state.career.teamRelationships[targetTeamId] = state.career.teamRelationships[targetTeamId] ?? 55;
    if (!Array.isArray(league.transactionHistory)) league.transactionHistory = [];
    league.transactionHistory.push({
      seasonNumber: state.career.seasonNumber + 1,
      type,
      playerId: 'user-player',
      playerName: '我',
      counterpartId: matched.id,
      counterpartName: matched.name,
      firstValue: userValue,
      counterpartValue,
      fromTeamId: oldTeamId,
      toTeamId: targetTeamId
    });
    const assetNote = candidate.valueDifference > 10 ? '，交易中另含选秀资产补偿价值差' : '';
    return {
      type,
      approved: true,
      teamId: targetTeamId,
      playerId: matched.id,
      playerName: matched.name,
      playerOVR: matched.ovr,
      playerAge: matched.age,
      playerPosition: leaguePlayerPositions(matched).join('/'),
      fromTeamId: oldTeamId,
      valueDifference: Math.round(candidate.valueDifference * 10) / 10,
      fitDescription,
      text: `${fitDescription}：我将加盟${DATA.getTeam(targetTeamId).name}，对方送出 ${matched.ovr} OVR、${matched.age} 岁的${matched.name}至${DATA.getTeam(oldTeamId).name}${assetNote}`
    };
  }

  function processCareerMovement(completedSeason, nextAge, requestedTrade) {
    const career = state.career;
    career.contract.yearsRemaining -= 1;
    if (requestedTrade) return { status: 'ready', movement: state.season.tradeResult };
    if (career.contract.yearsRemaining <= 0) {
      const offers = generateContractOffers(false);
      career.pendingOffseason = { type: 'free-agency', nextAge, development: null, offers, waitUsed: false };
      return { status: 'pending', type: 'free-agency' };
    }

    const assessment = userTradeAssessment(completedSeason, nextAge);
    const forcedOutcome = localDebugParam('movementOutcome');
    const traded = forcedOutcome === 'trade' || (forcedOutcome !== 'stay' && random() < assessment.chance);
    if (!traded) return { status: 'ready', movement: null, assessment };
    const candidates = userTradeCandidates(ensureLeagueState(), currentTeam);
    if (!candidates.length) return { status: 'ready', movement: null, assessment };
    const shortlist = candidates.slice(0, Math.min(5, candidates.length));
    const selected = shortlist[Math.floor(random() * shortlist.length)];
    const event = executeUserTrade(ensureLeagueState(), currentTeam, selected, '球队交易');
    event.tradeChance = Math.round(assessment.chance * 100);
    event.tradeReasons = assessment.risks.length ? assessment.risks : ['球队主动调整阵容结构'];
    event.protections = assessment.protections;
    career.transactions.push({ ...event, season: career.seasonNumber + 1, age: nextAge });
    career.pendingOffseason = { type: 'involuntary-trade', nextAge, development: null, movement: event };
    return { status: 'pending', type: 'involuntary-trade', movement: event };
  }

  function finalizeOffseason(pending) {
    const movement = pending?.movement || null;
    syncUserLeaguePlayer();
    const leagueUpdate = evolveLeagueSeason(ensureLeagueState(), state.career.seasonNumber + 1);
    state.career.seasonNumber += 1;
    state.career.age = pending.nextAge;
    state.career.pendingOffseason = null;
    state.career.lastOffseasonNote = `${pending.development.text}${movement ? ` · ${movement.text}` : ' · 球队阵容保持稳定'} · 联盟${leagueUpdate.retired}人退役，${leagueUpdate.rookies}名新秀入盟，完成${leagueUpdate.transactions}笔签约或交易`;
    closeModal();
    initializeCareerSeason();
  }

  function signContractOffer(teamId) {
    const pending = state.career?.pendingOffseason;
    if (!pending || pending.type !== 'free-agency') return;
    const offer = pending.offers.find(item => item.teamId === teamId);
    if (!offer) return;
    const oldTeamId = state.career.currentTeam;
    const previousContractNumber = state.career.contract?.number ?? ((state.career.completedContracts ?? 0) + 1);
    state.career.completedContracts = (state.career.completedContracts ?? 0) + 1;
    state.career.currentTeam = teamId;
    state.career.contract = {
      yearsRemaining: offer.years,
      totalYears: offer.years,
      annualSalary: offer.annualSalary,
      type: 'standard',
      number: previousContractNumber + 1
    };
    if (teamId !== oldTeamId) {
      state.career.recentDepartures.push({ teamId: oldTeamId, season: state.career.seasonNumber });
      if (!state.career.teamsPlayed.includes(teamId)) state.career.teamsPlayed.push(teamId);
    }
    state.career.teamRelationships[teamId] = clamp((state.career.teamRelationships[teamId] ?? 50) + (teamId === oldTeamId ? 10 : 5), 0, 100);
    const type = teamId === oldTeamId ? '续约' : '自由签约';
    const movement = {
      type,
      teamId,
      fromTeamId: oldTeamId,
      years: offer.years,
      annualSalary: offer.annualSalary,
      projectedMinutes: offer.projection.minutes,
      projectedRole: offer.projection.role,
      text: `${teamId === oldTeamId ? '与母队续约' : `签约${DATA.getTeam(teamId).name}`} ${offer.years} 年、年薪 $${offer.annualSalary}M，预计担任${offer.projection.role}`
    };
    state.career.transactions.push({ ...movement, season: state.career.seasonNumber + 1, age: pending.nextAge });
    pending.movement = movement;
    finalizeOffseason(pending);
  }

  function waitForContractMarket() {
    const pending = state.career?.pendingOffseason;
    if (!pending || pending.type !== 'free-agency' || pending.waitUsed) return;
    pending.waitUsed = true;
    pending.offers = generateContractOffers(true);
    showFreeAgencyModal();
    saveGame();
  }

  function retireWithoutContract() {
    const pending = state.career?.pendingOffseason;
    if (!pending || pending.type !== 'free-agency' || pending.offers.length || !pending.waitUsed) return;
    state.career.completed = true;
    state.career.forcedRetirement = true;
    state.career.retirementAge = pending.nextAge;
    state.career.age = pending.nextAge;
    state.career.pendingOffseason = null;
    state.season.stage = 'career-complete';
    closeModal();
    renderSeason();
    saveGame();
  }

  function confirmOffseasonMovement() {
    const pending = state.career?.pendingOffseason;
    if (!pending || pending.type !== 'involuntary-trade') return;
    finalizeOffseason(pending);
  }

  function requestTrade() {
    if (!state.career || !state.season || !['ended', 'champion'].includes(state.season.stage)) return;
    if (state.career.seasonNumber >= CAREER_SEASONS || state.season.tradeRequested || state.career.contract.yearsRemaining <= 1) return;
    archiveCareerSeason();
    const league = ensureLeagueState();
    const oldTeamId = state.career.currentTeam;
    const contractFactor = state.career.contract.yearsRemaining <= 1 ? 0.18 : (state.career.contract.yearsRemaining === 2 ? 0.08 : (state.career.contract.yearsRemaining >= 4 ? -0.08 : 0));
    const approvalChance = clamp(
      0.34 + (state.finalOVR - 80) * 0.018 + contractFactor - Math.max(0, state.season.wins - 45) * 0.004 - state.career.tradeRequestFailures * 0.035,
      0.18,
      0.82
    );
    state.season.tradeRequested = true;
    const forcedOutcome = localDebugParam('tradeOutcome');
    const approved = forcedOutcome === 'approve' || (forcedOutcome !== 'reject' && random() < approvalChance);
    if (!approved) {
      const minutesPenalty = Math.max(10, Math.round((state.season.roleProfile?.minutes || 28) * 0.4));
      state.career.tradeRequestFailures += 1;
      state.career.teamRelationships[oldTeamId] = clamp((state.career.teamRelationships[oldTeamId] ?? 55) - 25, 0, 100);
      state.career.minutesPenaltyNextSeason = Math.max(state.career.minutesPenaltyNextSeason || 0, minutesPenalty);
      const result = {
        type: '申请交易未通过',
        approved: false,
        teamId: oldTeamId,
        fromTeamId: oldTeamId,
        minutesPenalty,
        text: `管理层拒绝交易申请，并计划在下赛季将我的轮换时间压缩约 ${minutesPenalty} 分钟`
      };
      state.season.tradeResult = result;
      state.career.transactions.push({ ...result, season: state.career.seasonNumber + 1, age: state.career.age + 1 });
      renderSeason();
      saveGame();
      showMovementResultModal(result, false);
      return;
    }

    const candidates = userTradeCandidates(league, oldTeamId);
    if (!candidates.length) {
      state.season.tradeRequested = false;
      showToast('联盟暂无可匹配的交易筹码');
      return;
    }
    const shortlist = candidates.slice(0, Math.min(5, candidates.length));
    const selected = shortlist[Math.floor(random() * shortlist.length)];
    const result = executeUserTrade(league, oldTeamId, selected, '申请交易');
    state.season.tradeResult = result;
    state.career.transactions.push({ ...result, season: state.career.seasonNumber + 1, age: state.career.age + 1 });
    renderSeason();
    saveGame();
    showMovementResultModal(result, false);
  }

  function advanceCareer() {
    if (!state.career || !['ended', 'champion'].includes(state.season.stage)) return;
    if (state.career.pendingOffseason) {
      if (state.career.pendingOffseason.type === 'free-agency') showFreeAgencyModal();
      if (state.career.pendingOffseason.type === 'involuntary-trade') showMovementResultModal(state.career.pendingOffseason.movement, true);
      return;
    }
    const completedSeason = archiveCareerSeason();
    if (state.career.seasonNumber >= CAREER_SEASONS || state.career.forcedRetirement) {
      state.career.completed = true;
      state.career.retirementAge = state.career.age;
      if (state.career.seasonNumber >= CAREER_SEASONS) state.career.age = 38;
      state.season.stage = 'career-complete';
      renderSeason();
      saveGame();
      return;
    }
    const nextAge = state.career.age + 1;
    const development = applyCareerDevelopment(nextAge);
    const result = processCareerMovement(completedSeason, nextAge, state.season.tradeRequested);
    if (state.career.pendingOffseason) state.career.pendingOffseason.development = development;
    if (result.status === 'pending') {
      if (result.type === 'free-agency') showFreeAgencyModal();
      if (result.type === 'involuntary-trade') showMovementResultModal(result.movement, true);
      saveGame();
      return;
    }
    finalizeOffseason({ nextAge, development, movement: result.movement });
  }

  function careerStanding() {
    const career = state.career;
    const awards = career.awardCounts;
    const average = careerAverages();
    const totals = career.totals;
    const mvp = awards['最有价值球员'] || 0;
    const dpoy = awards['最佳防守球员'] || 0;
    const allNba = awards['最佳阵容'] || 0;
    const scoringTitles = awards['常规赛得分王'] || 0;
    const highLevelSeasons = career.history.filter(entry => entry.ovr >= 85).length;
    const legacy = SIM.calculateCareerLegacy(career);
    const dimensions = legacy.dimensions;
    const score = legacy.score;
    const tier = legacy.tier;
    const badges = [];
    if (tier.title === '历史王座候选') badges.push('王座挑战者');
    if (career.championships >= 3) badges.push('王朝缔造者');
    else if (career.championships >= 1) badges.push('冠军核心');
    if (mvp >= 3) badges.push('常规赛之王');
    if (dpoy >= 2) badges.push('防守丰碑');
    if (totals.pts >= 30000) badges.push('三万分俱乐部');
    if (totals.reb >= 15000) badges.push('篮板怪兽');
    if (totals.ast >= 10000) badges.push('组织大师');
    if (career.totalGames >= 1400) badges.push('钢铁之躯');
    if (career.teamsPlayed.length === 1) badges.push('一人一城');
    if (career.teamsPlayed.length >= 5) badges.push('联盟旅人');
    if (career.history.some(entry => entry.age >= 35 && entry.ovr >= 88)) badges.push('逆龄传奇');
    if (!career.championships && score >= 58) badges.push('无冕之王');
    if (Number(average.pts) >= 27) badges.push('得分机器');
    if (Number(average.stl) + Number(average.blk) >= 3 && Number(average.pts) >= 20) badges.push('攻防一体');
    if (!badges.length) badges.push(highLevelSeasons >= 8 ? '长青支柱' : '职业典范');
    const strongest = Object.entries(dimensions).sort((left, right) => right[1] - left[1])[0];
    const weakest = Object.entries(dimensions).sort((left, right) => left[1] - right[1])[0];
    const copy = `我的生涯历史评分为 ${score} 分。巅峰达到 ${career.peakOVR} OVR，累计 ${Math.round(totals.pts).toLocaleString()} 分、${Math.round(totals.reb).toLocaleString()} 个篮板和 ${Math.round(totals.ast).toLocaleString()} 次助攻；${career.championships} 次夺冠、${mvp} 次 MVP、${allNba} 次入选最佳阵容。${strongest[0]}是最有说服力的历史资本。`;
    const gateNotes = [];
    if (!mvp) gateNotes.push('缺少 MVP');
    if (!career.championships) gateNotes.push('缺少总冠军');
    if (allNba < 4) gateNotes.push('最佳阵容履历不足');
    const caveat = gateNotes.length
      ? `${gateNotes.join('、')}，历史档位因此受到硬性限制；当前最需要补强的是${weakest[0]}。`
      : (weakest[1] >= 70 ? '评价没有明显短板，巅峰、积累与团队成绩形成了完整闭环。' : `${weakest[0]}是历史排名中的主要争议项。`);
    return { score, rawScore: legacy.rawScore, title: tier.title, rank: tier.rank, badges: badges.slice(0, 6), dimensions, copy, caveat };
  }

  function injuryStatusHTML() {
    const status = state.season.injuryStatus;
    const seasonInjuries = state.season.injuries || [];
    if (!status && !seasonInjuries.length) return '';
    if (!status) {
      const latest = seasonInjuries[seasonInjuries.length - 1];
      return `<div class="injury-strip is-recovered"><b>已恢复</b><span>${latest.label}影响已经结束，目前可以正常出场。</span></div>`;
    }
    const tone = status.type === 'light' ? 'is-light' : (status.type === 'severe' ? 'is-severe' : 'is-devastating');
    const detail = status.type === 'light'
      ? `剩余约 ${status.gamesRemaining} 场 · 有效能力 -${status.penalty}`
      : (status.careerEnding ? '赛季报销 · 医疗建议退役' : `赛季报销 · 永久能力 -${status.penalty}`);
    return `<div class="injury-strip ${tone}"><b>${status.label}</b><span>${detail}</span></div>`;
  }

  function leagueInjuryReportHTML(completedGames) {
    const league = ensureLeagueState();
    initializeLeagueSeasonHealth(league, state.career.seasonNumber);
    const knownInjuries = league.players
      .filter(player => player.active && !player.isUser && player.seasonInjury && player.seasonInjury.game <= completedGames)
      .sort((left, right) => {
        const severity = { devastating: 3, severe: 2, light: 1 };
        return severity[right.seasonInjury.type] - severity[left.seasonInjury.type]
          || right.ovr - left.ovr;
      });
    const severeCount = knownInjuries.filter(player => player.seasonInjury.type === 'severe').length;
    const devastatingCount = knownInjuries.filter(player => player.seasonInjury.type === 'devastating').length;
    const examples = knownInjuries.slice(0, 4).map(player => {
      const injury = player.seasonInjury;
      const team = DATA.getTeam(player.teamId);
      const consequence = injury.type === 'light'
        ? `影响 ${injury.duration} 场，期间 -${injury.penalty} OVR`
        : (injury.careerEnding ? '赛季报销，面临因伤退役' : `赛季报销，永久 -${injury.permanentDecline} OVR`);
      return `<span><img src="${team.logo}" alt="">${player.name} · ${injury.label} · ${consequence}</span>`;
    }).join('');
    const summary = knownInjuries.length
      ? `已发生 ${knownInjuries.length} 起 · 重伤 ${severeCount} · 毁灭性 ${devastatingCount}`
      : (completedGames ? '目前没有公开伤情' : '赛季尚未开始');
    return `<div class="league-injury-report">
      <div><b>联盟伤病动态</b><small>${summary}</small></div>
      ${examples ? `<div class="league-injury-list">${examples}</div>` : ''}
    </div>`;
  }

  function renderSeason() {
    app.replaceChildren(cloneTemplate('season-template'));
    const container = document.getElementById('season-content');
    const team = DATA.getTeam(state.careerTeam);
    const season = state.season;
    if (season.stage === 'career-complete') {
      container.innerHTML = careerSummaryHTML();
      return;
    }
    const averages = seasonAverages();
    const completed = season.wins + season.losses;
    const roleProfile = season.roleProfile || buildSeasonRoleProfile();
    season.roleProfile = roleProfile;
    const role = roleProfile.role;
    const seasonYear = state.career.startYear + state.career.seasonNumber - 1;
    const calendarLabel = DATA.seasonLabel(seasonYear);
    let content = `
      <div class="season-hero" style="--team-primary:${team.primary}">
        <img src="${team.logo}" alt="${team.name}队标">
        <div><p>生涯第 ${state.career.seasonNumber} / ${CAREER_SEASONS} 季 · ${calendarLabel} 赛季 · ${state.career.age} 岁 · ${role}</p><h1>${team.name}</h1><p>${DATA.POSITIONS[state.position].name} · ${state.finalOVR} OVR · 潜力 ${state.attrs.POT}（成长概率）</p></div>
      </div>
      <div class="career-season-toolbar">
        <div><span>合同</span><b>${state.career.contract.yearsRemaining} 年 · $${state.career.contract.annualSalary}M</b></div>
        <div><span>生涯进度</span><b>${state.career.history.length} / ${CAREER_SEASONS} 季已完成</b></div>
        <button class="secondary-btn" type="button" data-action="career-history">查看生涯数据</button>
      </div>
      ${season.offseasonNote ? `<div class="career-event-strip"><b>休赛期动态</b><span>${season.offseasonNote}</span></div>` : ''}
      <div class="season-context-grid" aria-label="球队角色与健康负荷">
        <div><span>球队角色</span><b>${role}</b><small>轮换第 ${roleProfile.rotationRank} 位</small></div>
        <div><span>计划时间</span><b>${roleProfile.minutes} 分钟</b><small>${roleProfile.penalty ? `含管理层压缩 -${roleProfile.penalty}` : '由球队轮换决定'}</small></div>
        <div><span>球权使用率</span><b>${roleProfile.usage}%</b><small>能力与队内球权竞争</small></div>
        <div><span>健康运气</span><b>${state.career.luck}</b><small>负荷越高伤病风险越大</small></div>
      </div>
      ${injuryStatusHTML()}
      ${leagueInjuryReportHTML(completed)}
      <div class="season-dashboard">
        <div class="season-stat"><b id="season-record">${season.wins}-${season.losses}</b><span>球队战绩</span></div>
        <div class="season-stat"><b id="season-pts">${averages.pts}</b><span>场均得分</span></div>
        <div class="season-stat"><b id="season-reb">${averages.reb}</b><span>场均篮板</span></div>
        <div class="season-stat"><b id="season-ast">${averages.ast}</b><span>场均助攻</span></div>
      </div>
      <div class="season-detail-stats" aria-label="个人场均详细数据">
        <div class="season-detail-stat"><b id="season-stl">${averages.stl}</b><span>抢断</span></div>
        <div class="season-detail-stat"><b id="season-blk">${averages.blk}</b><span>盖帽</span></div>
        <div class="season-detail-stat"><b id="season-tov">${averages.tov}</b><span>失误</span></div>
        <div class="season-detail-stat"><b id="season-min">${averages.min}</b><span>分钟</span></div>
        <div class="season-detail-stat"><b id="season-gp">${season.playerGames || 0}</b><span>出场</span></div>
        <div class="season-detail-stat"><b id="season-fg">${averages.fgPct}%</b><span>投篮命中率</span></div>
        <div class="season-detail-stat"><b id="season-three">${averages.threePct}%</b><span>三分命中率</span></div>
        <div class="season-detail-stat"><b id="season-ft">${averages.ftPct}%</b><span>罚球命中率</span></div>
      </div>`;

    if (season.stage === 'regular') content += regularSeasonHTML(completed);
    if (season.stage === 'awards') content += seasonAwardsHTML();
    if (season.stage === 'playin') content += playInHTML();
    if (season.stage === 'playoffs') content += playoffsHTML();
    if (season.stage === 'ended') content += endedSeasonHTML();
    if (season.stage === 'champion') content += championHTML(team);
    container.innerHTML = content;
  }

  function careerHistoryRows() {
    return state.career.history.map(entry => {
      const team = DATA.getTeam(entry.teamId);
      return `<tr>
        <td>${entry.seasonYear ? DATA.seasonLabel(entry.seasonYear) : entry.seasonNumber}</td><td>${entry.age}</td><td><span class="career-team-cell"><img src="${team.logo}" alt="">${team.id}</span></td>
        <td>${entry.ovr}</td><td>${entry.games}</td><td>${entry.averages.min || '--'}</td><td>${entry.usage || '--'}%</td><td>${entry.wins}-${entry.losses}</td><td>${entry.averages.pts}</td><td>${entry.averages.reb}</td><td>${entry.averages.ast}</td>
        <td>${entry.averages.fgPct}%</td><td>${entry.injuries?.length ? entry.injuries.join(' / ') : '--'}</td><td>${entry.postseason}</td><td>${entry.awards.length ? entry.awards.join(' / ') : '--'}</td>
      </tr>`;
    }).join('');
  }

  function showCareerHistory() {
    if (!state.career) return;
    if (state.season && ['ended', 'champion'].includes(state.season.stage)) archiveCareerSeason();
    const averages = careerAverages();
    const totals = state.career.totals;
    modalRoot.innerHTML = `
      <section class="modal career-history-modal" role="dialog" aria-modal="true" aria-labelledby="career-history-title">
        <header class="modal-head"><h2 id="career-history-title">我的生涯数据</h2><button class="modal-close" type="button" data-action="close-modal" aria-label="关闭">×</button></header>
        <div class="modal-body">
          <div class="career-average-grid">
            <div><b>${state.career.totalGames}</b><span>总场次</span></div><div><b>${averages.pts}</b><span>场均得分</span></div>
            <div><b>${averages.reb}</b><span>场均篮板</span></div><div><b>${averages.ast}</b><span>场均助攻</span></div>
            <div><b>${Math.round(totals.pts).toLocaleString()}</b><span>总得分</span></div><div><b>${state.career.championships}</b><span>总冠军</span></div>
          </div>
          <div class="career-table-wrap">
            <table class="career-table"><thead><tr><th>赛季</th><th>年龄</th><th>球队</th><th>OVR</th><th>出场</th><th>分钟</th><th>USG</th><th>战绩</th><th>得分</th><th>篮板</th><th>助攻</th><th>FG</th><th>伤病</th><th>结果</th><th>奖项</th></tr></thead>
            <tbody>${careerHistoryRows() || '<tr><td colspan="15">首个赛季进行中，完成后生成履历</td></tr>'}</tbody></table>
          </div>
          <div class="career-transaction-list"><h3>签约与交易</h3>${state.career.transactions.map(event => `<div><b>第 ${event.season} 季 · ${event.age} 岁</b><span>${event.text}</span></div>`).join('')}</div>
          <div class="career-transaction-list"><h3>伤病记录</h3>${state.career.injuries.length ? state.career.injuries.map(injury => `<div><b>第 ${injury.season} 季 · G${injury.game}</b><span>${injury.text}</span></div>`).join('') : '<p class="simulation-note">生涯至今没有需要记录的伤病。</p>'}</div>
        </div>
      </section>`;
  }

  function careerSummaryHTML() {
    const career = state.career;
    const standing = careerStanding();
    const averages = careerAverages();
    const totals = career.totals;
    const completedSeasons = career.history.length;
    const retirementAge = career.retirementAge || career.age || 38;
    const awards = Object.entries(career.awardCounts).sort((left, right) => right[1] - left[1]);
    return `
      <section class="career-summary">
        <div class="career-summary-hero"><span>RETIREMENT · AGE ${retirementAge}</span><h1>${standing.title}</h1><p>${standing.rank} · 历史评分 ${standing.score}</p></div>
        <div class="legacy-badges">${standing.badges.map(label => `<span class="legacy-badge">${label}</span>`).join('')}</div>
        <p class="career-legacy-copy">${standing.copy}</p>
        <div class="legacy-dimensions">${Object.entries(standing.dimensions).map(([label, value]) => `<div class="legacy-dimension"><div><span>${label}</span><b>${value}</b></div><i><em style="width:${value}%"></em></i></div>`).join('')}</div>
        <p class="legacy-caveat"><b>评价依据：</b>${standing.caveat}</p>
        <div class="career-summary-grid">
          <div><b>${completedSeasons}</b><span>生涯赛季</span></div><div><b>${career.totalGames}</b><span>总场次</span></div>
          <div><b>${Math.round(totals.pts).toLocaleString()}</b><span>总得分</span></div><div><b>${Math.round(totals.reb).toLocaleString()}</b><span>总篮板</span></div>
          <div><b>${Math.round(totals.ast).toLocaleString()}</b><span>总助攻</span></div><div><b>${career.peakOVR}</b><span>巅峰 OVR</span></div>
          <div><b>${career.championships}</b><span>总冠军</span></div><div><b>${career.teamsPlayed.length}</b><span>效力球队</span></div>
        </div>
        <section class="career-retirement-panel"><h2>生涯平均</h2><div class="retirement-average-row">
          <div><b>${averages.pts}</b><span>得分</span></div><div><b>${averages.reb}</b><span>篮板</span></div><div><b>${averages.ast}</b><span>助攻</span></div>
          <div><b>${averages.stl}</b><span>抢断</span></div><div><b>${averages.blk}</b><span>盖帽</span></div><div><b>${averages.fgPct}%</b><span>命中率</span></div>
        </div></section>
        <section class="career-retirement-panel"><h2>主要荣誉</h2><div class="retirement-awards">${awards.length ? awards.map(([label, count]) => `<div><b>${count}</b><span>${label}</span></div>`).join('') : '<p>二十年稳定征战，未获得联盟主要个人奖项。</p>'}</div></section>
        <div class="season-actions"><button class="secondary-btn" type="button" data-action="career-history">查看逐季履历</button><button class="secondary-btn" type="button" data-action="honors">荣誉墙</button><button class="primary-btn" type="button" data-action="restart">开启新生涯</button></div>
      </section>`;
  }

  function regularSeasonHTML(completed) {
    if (state.season.isSimulating) return regularSeasonSimulationHTML(completed);
    const recent = state.season.schedule.filter(game => game.result).slice(-5).reverse();
    return `
      <section class="season-panel">
        <h2>常规赛 · ${completed}/82</h2>
        <div class="schedule-list">
          ${recent.length ? recent.map(gameRowHTML).join('') : '<div class="empty-state" style="min-height:120px"><p>新赛季即将开打</p><small>先模拟一场感受状态，或直接推进完整赛季</small></div>'}
        </div>
        <div class="season-actions">
          <button class="secondary-btn" type="button" data-action="next-game">模拟下一场</button>
          <button class="primary-btn" type="button" data-action="all-games">模拟完整赛季</button>
        </div>
      </section>`;
  }

  function regularSeasonSimulationHTML(completed) {
    const latest = state.season.schedule.filter(game => game.result).slice(-1)[0];
    return `
      <section class="season-panel simulation-panel">
        <div class="simulation-heading"><div><span class="live-dot"></span><b>常规赛模拟中</b></div><strong id="season-sim-game">${completed} / 82</strong></div>
        <div class="sim-progress"><i id="season-sim-progress" style="width:${completed / 82 * 100}%"></i></div>
        <div class="sim-record"><span>当前战绩</span><b id="season-sim-record">${state.season.wins}-${state.season.losses}</b></div>
        <div class="sim-latest" id="season-sim-latest">
          ${latest ? gameRowHTML(latest) : '<span>赛程载入中，准备跳球...</span>'}
        </div>
        <div class="sim-ticker"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      </section>`;
  }

  function seasonAwardsHTML() {
    const season = state.season;
    const nextLabel = season.postSeasonStage === 'playoffs'
      ? `以第 ${season.seed} 名进入季后赛`
      : (season.postSeasonStage === 'playin' ? `以第 ${season.seed} 名进入附加赛` : `第 ${season.seed} 名 · 赛季结束`);
    return `
      <section class="season-panel awards-panel">
        <div class="awards-heading"><span>REGULAR SEASON HONORS</span><h2>赛季关键奖项</h2><p>${nextLabel}</p></div>
        <div class="awards-grid">
          ${season.awards.map((award, index) => `<article class="award-card${award.isUser ? ' is-user' : ''}" style="--award-delay:${index * 90}ms"><span class="award-code">${award.short}</span><div><small>${award.label}</small><strong>${award.winner}</strong><p>${award.detail}</p></div>${award.isUser ? '<b>我的荣誉</b>' : ''}</article>`).join('')}
        </div>
        ${conferenceStandingsHTML()}
        ${debugLeagueAuditHTML()}
        <button class="primary-btn" type="button" data-action="continue-postseason">${season.postSeasonStage === 'playoffs' ? '进入季后赛' : (season.postSeasonStage === 'playin' ? '进入附加赛' : '查看赛季总结')}</button>
      </section>`;
  }

  function conferenceStandingsHTML() {
    const conference = DATA.getTeam(state.careerTeam).conference;
    const label = conference === 'EAST' ? '东部排名' : '西部排名';
    const standings = state.season.conferenceStandings || [];
    return `<div class="conference-standings"><b>${label}</b><div>${standings.slice(0, 10).map(team => (
      `<span class="${team.id === state.careerTeam ? 'is-user' : ''}"><i>${team.seed}</i>${team.id}<small>${team.wins}-${team.losses}</small></span>`
    )).join('')}</div></div>`;
  }

  function debugLeagueAuditHTML() {
    if (localDebugParam('leagueAudit') !== '1') return '';
    const league = ensureLeagueState();
    const audit = SIM.auditLeague(DATA.TEAMS, league.players, league.teamRecords);
    const active = league.players.filter(player => player.active);
    const rotationTotals = Object.fromEntries(DATA.TEAMS.map(team => [team.id, active
      .filter(player => player.teamId === team.id)
      .reduce((sum, player) => sum + (player.seasonRole?.minutes || 0), 0)]));
    const teamWinVariants = Object.fromEntries(DATA.TEAMS.map(team => [team.id, new Set(active
      .filter(player => player.teamId === team.id)
      .map(player => player.lastSeason?.wins)
      .filter(Number.isFinite)).size]));
    const trades = (league.transactionHistory || []).filter(entry => entry.type.includes('交易'));
    const teamPairCounts = {};
    trades.forEach(entry => {
      const pair = [entry.fromTeamId, entry.toTeamId].sort().join('-');
      teamPairCounts[pair] = (teamPairCounts[pair] || 0) + 1;
    });
    const valueDifferences = trades
      .filter(entry => Number.isFinite(entry.firstValue) && Number.isFinite(entry.counterpartValue))
      .map(entry => Math.abs(entry.firstValue - entry.counterpartValue));
    const recentTradePairs = trades
      .filter(entry => league.seasonNumber - entry.seasonNumber < 3)
      .map(entry => [entry.fromTeamId, entry.toTeamId].sort().join('-'));
    const recentRepeatedTeamPairs = [...new Set(recentTradePairs.filter((pair, index) => recentTradePairs.indexOf(pair) !== index))];
    return `<pre id="season-league-audit">${JSON.stringify({
      ...audit,
      rotationTotals,
      teamWinVariants,
      userPlayers: active.filter(player => player.isUser).length,
      awardHistory: league.awardHistory,
      transactionCount: league.transactionHistory?.length || 0,
      tradeCount: trades.length,
      averageTradeValueDifference: valueDifferences.length
        ? Math.round(valueDifferences.reduce((sum, value) => sum + value, 0) / valueDifferences.length * 10) / 10
        : 0,
      maxTeamPairTrades: Math.max(0, ...Object.values(teamPairCounts)),
      recentRepeatedTeamPairs,
      playersWithInjuries: league.players.filter(player => player.injuryHistory?.length).length,
      playersWithSeasonHistory: league.players.filter(player => player.seasonHistory?.length).length,
      retiredCount: league.retiredCount || 0
    })}</pre>`;
  }

  function gameRowHTML(game) {
    const opponent = DATA.getTeam(game.opponent);
    const result = game.result;
    const availability = result.played === false ? ' · 我缺阵' : (result.stats?.min ? ` · ${result.stats.min} 分钟` : '');
    return `<div class="game-row"><img src="${opponent.logo}" alt=""><span>G${game.game} · 对 ${opponent.name}${availability}</span><b class="${result.won ? 'win' : 'loss'}">${result.won ? '胜' : '负'} ${result.myScore}-${result.theirScore}</b></div>`;
  }

  function playInHTML() {
    if (state.season.playInSimulation) {
      const sim = state.season.playInSimulation;
      const opponent = DATA.getTeam(sim.opponent);
      return `
        <section class="season-panel simulation-panel">
          <div class="simulation-heading"><div><span class="live-dot"></span><b>${(state.season.playInStep || 1) === 1 && (state.season.originalSeed || state.season.seed) <= 8 ? '附加赛席位战' : '附加赛生死战'}</b></div><strong>${sim.quarter ? `第 ${sim.quarter} 节` : '准备开赛'}</strong></div>
          <div class="live-scoreboard"><div><img src="${DATA.getTeam(state.careerTeam).logo}" alt=""><span>我的球队</span><b>${sim.myScore}</b></div><em>VS</em><div><img src="${opponent.logo}" alt=""><span>${opponent.name}</span><b>${sim.theirScore}</b></div></div>
          <div class="quarter-track">${[1,2,3,4].map(quarter => `<i class="${quarter <= sim.quarter ? 'is-complete' : ''}">Q${quarter}</i>`).join('')}</div>
        </section>`;
    }
    return `
      <section class="season-panel">
        <h2>附加赛 · 第 ${state.season.seed} 名</h2>
        <p class="confirm-copy">${(state.season.playInStep || 1) === 1 && (state.season.originalSeed || state.season.seed) <= 8 ? '首战获胜直接锁定第 7 种子，失利仍有一次争夺第 8 种子的机会。' : '这是决定第 8 种子归属的生死战，负者赛季结束。'}</p>
        <button class="primary-btn" type="button" data-action="playin">模拟附加赛</button>
      </section>`;
  }

  function playoffsHTML() {
    const nextLabels = ['首轮', '分区半决赛', '分区决赛', '总决赛'];
    if (state.season.seriesSimulation) {
      const sim = state.season.seriesSimulation;
      const opponent = DATA.getTeam(sim.opponent);
      return `
        <section class="season-panel simulation-panel">
          <div class="simulation-heading"><div><span class="live-dot"></span><b>${sim.label}进行中</b></div><strong>${sim.wins}-${sim.losses}</strong></div>
          <div class="live-scoreboard series-board"><div><img src="${DATA.getTeam(state.careerTeam).logo}" alt=""><span>我的球队</span><b>${sim.wins}</b></div><em>系列赛</em><div><img src="${opponent.logo}" alt=""><span>${opponent.name}</span><b>${sim.losses}</b></div></div>
          <div class="series-games">${Array.from({length:7},(_,index) => { const game=sim.games[index]; return `<i class="${game ? (game.won ? 'is-win' : 'is-loss') : ''}">${game ? (game.won ? 'W' : 'L') : index + 1}</i>`; }).join('')}</div>
          <p class="simulation-note">七场四胜 · 每场比赛正在独立模拟</p>
        </section>`;
    }
    return `
      <section class="season-panel">
        <h2>季后赛 · ${nextLabels[state.season.playoffRound]}</h2>
        <div class="playoff-bracket">
          ${state.season.series.map(seriesRowHTML).join('')}
          <div class="series-row is-active"><div><strong>${nextLabels[state.season.playoffRound]}</strong><small>等待系列赛开始</small></div><b>0-0</b></div>
        </div>
        <button class="primary-btn" style="margin-top:14px" type="button" data-action="series">模拟本轮系列赛</button>
      </section>`;
  }

  function seriesRowHTML(series) {
    const opponent = DATA.getTeam(series.opponent);
    return `<div class="series-row ${series.won ? 'is-won' : ''}"><div><strong>${series.label} · ${opponent.name}</strong><small>${series.won ? '晋级下一轮' : '赛季结束'}</small></div><b>${series.score}</b></div>`;
  }

  function endedSeasonHTML() {
    const playoffRows = state.season.series.length ? state.season.series.map(seriesRowHTML).join('') : '';
    const reason = state.season.seed > 10 ? `常规赛第 ${state.season.seed} 名，未能进入附加赛` : '季后赛征程遗憾止步';
    return `
      <section class="season-panel">
        <h2>第 ${state.career.seasonNumber} 季落幕</h2>
        <p class="confirm-copy">${reason}。赛季数据将写入生涯履历；若发生交易或合同到期，将由我确认下一步。</p>
        ${playoffRows ? `<div class="playoff-bracket">${playoffRows}</div>` : ''}
        <div class="season-actions offseason-actions">
          <button class="secondary-btn" type="button" data-action="career-history">查看生涯数据</button>
          ${tradeButtonHTML()}
          <button class="primary-btn" type="button" data-action="advance-career">${state.career.forcedRetirement ? '因伤结束生涯' : (state.career.seasonNumber >= CAREER_SEASONS ? '结束生涯' : '进入休赛期')}</button>
        </div>
      </section>`;
  }

  function championHTML(team) {
    return `
      <section class="champion-banner">
        <img src="${team.logo}" alt="${team.name}队标">
        <h2>联盟总冠军</h2>
        <p>${team.name} · ${state.finalOVR} OVR · ${state.archetype.label}</p>
        <div class="season-actions offseason-actions">
          <button class="secondary-btn" type="button" data-action="career-history">查看生涯数据</button>
          ${tradeButtonHTML()}
          <button class="primary-btn" type="button" data-action="advance-career">${state.career.forcedRetirement ? '因伤结束生涯' : (state.career.seasonNumber >= CAREER_SEASONS ? '带着冠军退役' : '进入休赛期')}</button>
        </div>
      </section>`;
  }

  function tradeButtonHTML() {
    if (state.career.seasonNumber >= CAREER_SEASONS || state.career.forcedRetirement) return '';
    if (state.career.contract.yearsRemaining <= 1) return '<button class="trade-btn" type="button" disabled>合同到期 · 即将进入自由市场</button>';
    const result = state.season.tradeResult;
    const label = !state.season.tradeRequested ? '申请交易' : (result?.approved ? '交易申请已获批' : '交易申请被拒绝');
    return `<button class="trade-btn" type="button" data-action="request-trade" ${state.season.tradeRequested ? 'disabled' : ''}>${label}</button>`;
  }

  function movementTeamHTML(teamId, label) {
    const team = DATA.getTeam(teamId);
    return `<div class="movement-team"><span>${label}</span><img src="${team.logo}" alt=""><b>${team.name}</b></div>`;
  }

  function showMovementResultModal(result, continueOffseason) {
    if (!result) return;
    if (result.approved === false) {
      modalRoot.innerHTML = `
        <section class="modal movement-modal" role="dialog" aria-modal="true" aria-labelledby="movement-title">
          <header class="modal-head"><h2 id="movement-title">交易申请未通过</h2></header>
          <div class="modal-body">
            <div class="movement-verdict is-rejected"><b>管理层拒绝放人</b><p>${result.text}</p></div>
            <div class="movement-facts"><div><span>球队关系</span><b>大幅下降</b></div><div><span>下赛季处罚</span><b>-${result.minutesPenalty} 分钟</b></div></div>
            <button class="primary-btn" type="button" data-action="acknowledge-movement">我知道了</button>
          </div>
        </section>`;
      return;
    }
    const projection = projectedUserRole(result.teamId);
    const reasons = result.tradeReasons || [result.fitDescription || '双方根据阵容需求完成交易'];
    const oldTeamId = result.fromTeamId;
    modalRoot.innerHTML = `
      <section class="modal movement-modal" role="dialog" aria-modal="true" aria-labelledby="movement-title">
        <header class="modal-head"><h2 id="movement-title">${result.type === '申请交易' ? '交易申请获批' : '球队正式通知：我被交易'}</h2></header>
        <div class="modal-body">
          <div class="movement-route">${movementTeamHTML(oldTeamId, '离开')}<i>→</i>${movementTeamHTML(result.teamId, '加盟')}</div>
          <div class="movement-verdict"><b>${reasons.join(' · ')}</b><p>${result.text}</p></div>
          <div class="movement-facts">
            <div><span>交易筹码</span><b>${result.playerName} · ${result.playerOVR} OVR</b></div>
            <div><span>交易价值差</span><b>${result.valueDifference}</b></div>
            <div><span>预计角色</span><b>${projection.role}</b></div>
            <div><span>预计时间</span><b>${projection.minutes} 分钟</b></div>
          </div>
          ${result.protections?.length ? `<p class="movement-protection">球队权衡过：${result.protections.join('、')}，但阵容调整动机更强。</p>` : ''}
          <button class="primary-btn" type="button" data-action="${continueOffseason ? 'confirm-offseason-movement' : 'acknowledge-movement'}">${continueOffseason ? '确认并前往新球队' : '确认交易结果'}</button>
        </div>
      </section>`;
  }

  function offerRosterHTML(offer) {
    return offer.roster.map(player => `<span><b>${player.name}</b><small>${player.positions.join('/')} · ${player.ovr} OVR · ${player.age} 岁</small></span>`).join('');
  }

  function contractOfferHTML(offer) {
    const team = DATA.getTeam(offer.teamId);
    const competition = offer.projection.competitors.length
      ? offer.projection.competitors.map(player => `${player.name} ${player.ovr}`).join('、')
      : '同位置暂无主要竞争者';
    return `<article class="contract-offer${offer.isCurrentTeam ? ' is-current' : ''}">
      <header><img src="${team.logo}" alt=""><div><span>${offer.isCurrentTeam ? '母队续约报价' : offer.phase}</span><h3>${team.name}</h3><p>上赛季${team.conference === 'EAST' ? '东部' : '西部'}第 ${offer.rank} · ${offer.wins}-${offer.losses}</p></div><strong>${offer.years} 年<br><small>$${offer.annualSalary}M / 年</small></strong></header>
      <div class="offer-role-grid"><div><span>预计角色</span><b>${offer.projection.role}</b></div><div><span>预计时间</span><b>${offer.projection.minutes} 分钟</b></div><div><span>预计球权</span><b>${offer.projection.usage}%</b></div><div><span>轮换顺位</span><b>第 ${offer.projection.rotationRank} 位</b></div></div>
      <p class="offer-competition"><b>位置竞争：</b>${competition}</p>
      <details><summary>查看主要球员名单</summary><div class="offer-roster">${offerRosterHTML(offer)}</div></details>
      <button class="primary-btn" type="button" data-action="choose-contract" data-team="${offer.teamId}">接受${offer.isCurrentTeam ? '续约' : '报价'}</button>
    </article>`;
  }

  function showFreeAgencyModal() {
    const pending = state.career?.pendingOffseason;
    if (!pending || pending.type !== 'free-agency') return;
    const offers = pending.offers || [];
    const noOffers = !offers.length;
    modalRoot.innerHTML = `
      <section class="modal free-agency-modal" role="dialog" aria-modal="true" aria-labelledby="free-agency-title">
        <header class="modal-head"><div><span class="modal-kicker">FREE AGENCY</span><h2 id="free-agency-title">自由市场合同报价</h2></div><b class="offer-count">${offers.length} 份</b></header>
        <div class="modal-body">
          ${offers.length ? `<p class="market-intro">合同到期。请根据阵容、球队竞争力和预计上场时间选择下一站，确认后将直接进入新赛季。</p><div class="contract-offer-list">${offers.map(contractOfferHTML).join('')}</div>` : `
            <div class="no-offer-state"><b>目前没有球队提供合同</b><p>${pending.waitUsed ? '第二轮市场评估仍无人报价，我的联盟生涯将提前结束。' : '可以等待市场完成补强后重新评估一次，但合同年限和薪资通常会下降。'}</p></div>
            <button class="${pending.waitUsed ? 'danger-btn' : 'primary-btn'}" type="button" data-action="${pending.waitUsed ? 'retire-no-offers' : 'wait-contract-market'}">${pending.waitUsed ? '确认提前退役' : '等待市场'}</button>`}
        </div>
      </section>`;
  }

  function recordChampionship() {
    const honors = loadHonors();
    const teamRecords = honors[state.careerTeam] || [];
    const averages = seasonAverages();
    teamRecords.push({
      date: new Date().toISOString(),
      ovr: state.finalOVR,
      position: state.position,
      archetype: state.archetype.label,
      record: `${state.season.wins}-${state.season.losses}`,
      averages
    });
    honors[state.careerTeam] = teamRecords;
    localStorage.setItem(HONOR_KEY, JSON.stringify(honors));
  }

  function renderHonors() {
    app.replaceChildren(cloneTemplate('honors-template'));
    const honors = loadHonors();
    const wonCount = Object.keys(honors).filter(teamId => honors[teamId].length).length;
    document.getElementById('honor-summary').innerHTML = `<b>${wonCount}</b><span>/ 30 支球队已征服</span>`;
    document.getElementById('honor-grid').innerHTML = DATA.TEAMS.map(team => {
      const records = honors[team.id] || [];
      return `<button class="honor-team${records.length ? ' is-won' : ''}" type="button" data-honor="${team.id}" ${records.length ? '' : 'disabled'}><img src="${team.logo}" alt=""><span>${team.id}</span>${records.length ? `<i>★</i>` : ''}</button>`;
    }).join('');
  }

  function showHonorDetail(teamId) {
    const team = DATA.getTeam(teamId);
    const records = loadHonors()[teamId] || [];
    modalRoot.innerHTML = `
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="honor-title">
        <header class="modal-head"><h2 id="honor-title">${team.name}</h2><button class="modal-close" type="button" data-action="close-modal" aria-label="关闭">×</button></header>
        <div class="modal-body">
          ${records.map((record, index) => `<div class="confirm-player"><img src="${team.logo}" alt="" style="width:46px;height:46px;object-fit:contain"><div><strong>第 ${index + 1} 次夺冠 · ${record.ovr} OVR</strong><div>${record.position} · ${record.archetype} · ${record.record}</div><small>${record.averages.pts} 分 / ${record.averages.reb} 篮板 / ${record.averages.ast} 助攻</small></div></div>`).join('')}
        </div>
      </section>`;
  }

  const HELP_PAGES = [
    ['建球员', '14 项属性', '选择位置后随机抽取球队，从该队球员中选一人，再点击属性槽夺取一项能力。球员可拥有多个现实适配位置；相距一至四档时，普通属性依次衰减 3%、8%、14%、30%，潜力不衰减。潜力表示年轻阶段每年触发能力提升的概率，不代表巅峰总评。'],
    ['赛季', '82 场征程', '球队根据我的能力、队内竞争和球权分配决定上场时间与使用率，两者会共同影响场均数据。联盟所有球员使用同一套伤病概率：高负荷会提高风险；轻伤暂时降低能力，重伤和毁灭性伤病会造成永久影响或提前退役。'],
    ['季后赛', '七场四胜', '常规赛前六名直通季后赛，七至十名参加附加赛。季后赛包含首轮、分区半决赛、分区决赛和总决赛，能力越强，晋级概率越高。'],
    ['结算', '独一无二', '赛季结束后可以申请交易，但管理层可能拒绝；被拒后，下赛季轮换时间会明显下降。球队也会根据年龄、潜力、队史贡献、换队历史与阵容方向决定是否交易我。合同到期后可能收到 0 至 3 份报价，可比较球队名单、上季排名与预计上场时间后选择。'],
    ['荣誉墙', '征服联盟', '每带领一支球队夺冠，荣誉墙就会点亮对应队标。点击已点亮的球队，可查看历次冠军建模、赛季战绩和场均表现。']
  ];

  function showHelp(activeIndex) {
    const index = Number(activeIndex) || 0;
    const page = HELP_PAGES[index];
    modalRoot.innerHTML = `
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <header class="modal-head"><h2 id="help-title">玩法说明</h2><button class="modal-close" type="button" data-action="close-modal" aria-label="关闭">×</button></header>
        <div class="modal-body">
          <nav class="help-tabs">${HELP_PAGES.map((item, pageIndex) => `<button class="${pageIndex === index ? 'is-active' : ''}" type="button" data-help-page="${pageIndex}">${item[0]}</button>`).join('')}</nav>
          <article class="help-copy"><h3>${page[1]}</h3><p>${page[2]}</p></article>
        </div>
      </section>`;
  }

  function closeModal() {
    modalRoot.replaceChildren();
  }

  function loadHonors() {
    try {
      return JSON.parse(localStorage.getItem(HONOR_KEY)) || {};
    } catch (error) {
      return {};
    }
  }

  function saveGame() {
    if (debugCareerMode) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, schemaVersion: SAVE_SCHEMA_VERSION, selectedPlayer: state.selectedPlayer ? { name: state.selectedPlayer.name, teamId: state.selectedPlayer.teamId } : null }));
      LEGACY_SAVE_KEYS.forEach(key => localStorage.removeItem(key));
    } catch (error) {
      showToast('当前浏览器无法保存进度');
    }
  }

  function loadStoredGame() {
    try {
      const current = localStorage.getItem(SAVE_KEY);
      if (current) return JSON.parse(current);
      for (const key of LEGACY_SAVE_KEYS) {
        const legacy = localStorage.getItem(key);
        if (legacy) return { ...JSON.parse(legacy), schemaVersion: 3 };
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  function hydrateSeasonTotals() {
    if (!state.season) return;
    const savedTotals = state.season.playerTotals || {};
    const games = state.season.wins + state.season.losses;
    const needsBackfill = games > 0 && savedTotals.stl == null;
    const needsMinutesBackfill = games > 0 && savedTotals.min == null;
    const totals = { ...freshPlayerTotals(), ...savedTotals };
    if (needsBackfill) {
      const fgaPerGame = 11 + state.finalOVR / 14;
      const tpaPerGame = 2 + state.attrs.threePT / 14;
      const ftaPerGame = 2 + (state.attrs.FIN + state.attrs.ATH) / 45;
      const fgPct = clamp(0.36 + (state.attrs.FIN + state.attrs.MID + state.attrs.DNK) / 300 * 0.18, 0.4, 0.62);
      const threePct = clamp(0.24 + state.attrs.threePT / 100 * 0.2, 0.25, 0.46);
      const ftPct = clamp(0.52 + (state.attrs.MID + state.attrs.CLU) / 200 * 0.32, 0.58, 0.92);
      totals.stl = games * (0.45 + state.attrs.PDEF / 95);
      totals.blk = games * (0.15 + state.attrs.BLK / 85);
      totals.tov = games * (1.4 + state.attrs.HAN / 100);
      totals.fga = Math.round(games * fgaPerGame);
      totals.fgm = Math.round(totals.fga * fgPct);
      totals.tpa = Math.round(games * tpaPerGame);
      totals.tpm = Math.round(totals.tpa * threePct);
      totals.fta = Math.round(games * ftaPerGame);
      totals.ftm = Math.round(totals.fta * ftPct);
    }
    if (needsMinutesBackfill) totals.min = games * (state.season.roleProfile?.minutes || 30);
    state.season.playerTotals = totals;
    if (!Number.isFinite(state.season.playerGames)) {
      const completedGames = (state.season.schedule || []).filter(game => game.result);
      state.season.playerGames = completedGames.length
        ? completedGames.filter(game => game.result.played !== false).length
        : games;
    }
  }

  function continueGame() {
    const saved = loadStoredGame();
    if (!saved || (!saved.resumeScreen && saved.screen === 'home')) return;
    state = { ...freshState(), ...saved, sound: state.sound };
    state.schemaVersion = SAVE_SCHEMA_VERSION;
    state.eraKey = saved.eraKey || saved.career?.eraKey || 'current';
    DATA.setEra(state.eraKey);
    if (state.career && !Number.isFinite(state.career.startYear)) state.career.startYear = DATA.getEra(state.eraKey).startYear;
    if (state.position && Object.keys(state.attrs || {}).length) state.archetype = findArchetype();
    if (state.season) hydrateSeasonTotals();
    if (state.career) {
      if (!Number.isFinite(state.career.rngState) || state.career.rngState === 0) state.career.rngState = hashText(`${state.eraKey}-${state.career.startYear}-${state.career.currentTeam}-${state.finalOVR}`);
      state.career.potential = clamp(state.career.potential ?? state.attrs.POT ?? 70, 40, 99);
      const signedContracts = (state.career.transactions || []).filter(event => ['续约', '自由签约'].includes(event.type)).length;
      if (!Number.isFinite(state.career.completedContracts)) state.career.completedContracts = signedContracts;
      if (!state.career.contract.type) state.career.contract.type = state.career.completedContracts === 0 ? 'rookie' : 'standard';
      if (!Number.isFinite(state.career.contract.number)) state.career.contract.number = state.career.completedContracts + 1;
      if (!Array.isArray(state.career.teamsPlayed)) state.career.teamsPlayed = [state.career.currentTeam];
      if (!Number.isFinite(state.career.luck)) state.career.luck = 45 + hashText(`${state.position}-${state.career.currentTeam}-${state.finalOVR}`) % 51;
      state.career.totals = { ...freshPlayerTotals(), ...(state.career.totals || {}) };
      if (!Array.isArray(state.career.injuries)) state.career.injuries = [];
      if (!Number.isFinite(state.career.tradeRequestFailures)) state.career.tradeRequestFailures = 0;
      if (!Array.isArray(state.career.tradeCounterpartIds)) state.career.tradeCounterpartIds = [];
      if (!Array.isArray(state.career.recentDepartures)) state.career.recentDepartures = [];
      if (!state.career.teamRelationships || typeof state.career.teamRelationships !== 'object') state.career.teamRelationships = {};
      state.career.teamsPlayed.forEach(teamId => {
        if (!Number.isFinite(state.career.teamRelationships[teamId])) state.career.teamRelationships[teamId] = teamId === state.career.currentTeam ? 65 : 50;
      });
      if (!state.career.pendingOffseason || !['free-agency', 'involuntary-trade'].includes(state.career.pendingOffseason.type)) state.career.pendingOffseason = null;
      if (!Number.isFinite(state.career.minutesPenaltyNextSeason)) state.career.minutesPenaltyNextSeason = 0;
      state.career.forcedRetirement = Boolean(state.career.forcedRetirement);
      const league = ensureLeagueState();
      if (state.eraKey === 'current') {
        const currentPlayers = Object.values(DATA.PLAYERS).flat();
        const initialSeasonOffset = Math.max(0, state.career.seasonNumber - 1);
        league.players.forEach(player => {
          if (!String(player.id).startsWith('base-')) return;
          const source = currentPlayers.find(item => canonicalLeagueName(item.name) === canonicalLeagueName(player.name));
          if (Number.isFinite(source?.age)) player.age = source.age + initialSeasonOffset;
          if (Number.isFinite(source?.rookieYear)) player.rookieYear = source.rookieYear;
        });
      }
      league.players.forEach(player => { player.potential = clamp(player.potential ?? 70, 40, 99); });
      syncUserLeaguePlayer();
      fillLeagueRosters(league, state.career.seasonNumber);
      trimLeagueRosters(league);
      const hasSavedAwards = Array.isArray(state.season?.awards) && state.season.awards.length;
      const hasLegacyAwards = hasSavedAwards && (state.season.awards.some(award => award.winner === '本届最佳新秀') || league.awardHistory.length === 0);
      if (hasLegacyAwards) state.season.awards = buildSeasonAwards();
    }
    if (saved.selectedPlayer && saved.selectedPlayer.teamId) {
      state.selectedPlayer = DATA.PLAYERS[saved.selectedPlayer.teamId]?.find(player => player.name === saved.selectedPlayer.name) || null;
    }
    if (state.season) {
      state.season.tradeRequested = Boolean(state.season.tradeRequested);
      if (!Array.isArray(state.season.injuries)) state.season.injuries = [];
      if (!state.season.roleProfile) state.season.roleProfile = buildSeasonRoleProfile();
      if (state.season.injuryStatus === undefined) state.season.injuryStatus = null;
      state.season.isSimulating = false;
      state.season.playInSimulation = null;
      state.season.seriesSimulation = null;
    }
    showScreen(saved.resumeScreen || saved.screen);
    if (state.career?.pendingOffseason?.type === 'free-agency') showFreeAgencyModal();
    if (state.career?.pendingOffseason?.type === 'involuntary-trade') showMovementResultModal(state.career.pendingOffseason.movement, true);
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    toastTimer = window.setTimeout(() => toastEl.classList.remove('is-visible'), 2200);
  }

  function playTone(frequency, duration, type) {
    if (!state.sound) return;
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = type || 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.05, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    } catch (error) {
      state.sound = false;
    }
  }

  function playFanfare() {
    [520, 660, 780, 1040].forEach((tone, index) => window.setTimeout(() => playTone(tone, 0.18), index * 130));
  }

  function navigateBack() {
    if (state.screen === 'era') showScreen('home');
    else if (state.screen === 'position') showScreen(state.eraKey === 'current' ? 'home' : 'era');
    else if (state.screen === 'build') showScreen('position');
    else if (state.screen === 'reveal') showScreen('build');
    else if (state.screen === 'career') showScreen('reveal');
    else if (state.screen === 'season') showScreen('reveal');
    else showScreen('home');
  }

  function handleAction(action, element) {
    if (action === 'start') startGame('current');
    if (action === 'era-mode') showScreen('era');
    if (action === 'help') showHelp(0);
    if (action === 'honors') showScreen('honors');
    if (action === 'continue') continueGame();
    if (action === 'reroll') rerollPlayers();
    if (action === 'close-modal') closeModal();
    if (action === 'confirm-lock') confirmLock(element.dataset.attribute);
    if (action === 'career') showScreen('career');
    if (action === 'restart') startGame(state.eraKey || 'current');
    if (action === 'next-game') simulateNextGame();
    if (action === 'all-games') simulateAllGames();
    if (action === 'continue-postseason') continuePostseason();
    if (action === 'playin') simulatePlayIn();
    if (action === 'series') simulateSeries();
    if (action === 'career-history') showCareerHistory();
    if (action === 'request-trade') requestTrade();
    if (action === 'advance-career') advanceCareer();
    if (action === 'acknowledge-movement') closeModal();
    if (action === 'confirm-offseason-movement') confirmOffseasonMovement();
    if (action === 'choose-contract') signContractOffer(element.dataset.team);
    if (action === 'wait-contract-market') waitForContractMarket();
    if (action === 'retire-no-offers') retireWithoutContract();
  }

  document.addEventListener('click', event => {
    const actionEl = event.target.closest('[data-action]');
    if (actionEl) {
      handleAction(actionEl.dataset.action, actionEl);
      return;
    }
    const positionEl = event.target.closest('[data-position]');
    if (positionEl) selectPosition(positionEl.dataset.position);
    const eraEl = event.target.closest('[data-era]');
    if (eraEl) startGame(eraEl.dataset.era);
    const playerEl = event.target.closest('[data-player]');
    if (playerEl) selectPlayer(playerEl.dataset.player);
    const attributeEl = event.target.closest('[data-attribute]');
    if (attributeEl && attributeEl.classList.contains('attribute-slot')) requestLock(attributeEl.dataset.attribute);
    const helpPageEl = event.target.closest('[data-help-page]');
    if (helpPageEl) showHelp(helpPageEl.dataset.helpPage);
    const honorEl = event.target.closest('[data-honor]');
    if (honorEl && !honorEl.disabled) showHonorDetail(honorEl.dataset.honor);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && modalRoot.childElementCount) closeModal();
  });

  homeBtn.addEventListener('click', () => showScreen('home'));
  backBtn.addEventListener('click', navigateBack);
  soundBtn.addEventListener('click', () => {
    state.sound = !state.sound;
    soundBtn.classList.toggle('is-muted', !state.sound);
    soundBtn.setAttribute('aria-label', state.sound ? '关闭音效' : '开启音效');
    if (state.sound) playTone(560, 0.06);
  });

  app.addEventListener('click', event => {
    if (event.target.id === 'confirm-position') confirmPosition();
    if (event.target.id === 'spin-team') spinTeam();
    if (event.target.id === 'career-spin') spinCareerTeam();
  });

  const debugParams = new URLSearchParams(window.location.search);
  const debugSeason = Number(debugParams.get('careerTest'));
  const awardDebugSeason = Number(debugParams.get('awardTest'));
  const playoffDebug = debugParams.get('playoffTest') === '1';
  const archetypeDebug = debugParams.get('archetypeTest');
  const eraDebug = debugParams.get('eraTest');
  const draftDebug = debugParams.get('draftTest');
  const draftDebugSeason = Number(debugParams.get('season'));
  const injuryDebug = debugParams.get('injuryOutcome');
  const tradeDebug = debugParams.get('tradeTest') === '1';
  const legacyDebug = debugParams.get('legacyTest') === '1';
  const offseasonDebug = debugParams.get('offseasonTest');
  const isLocalDebug = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  if (isLocalDebug) {
    window.__GAME_DEBUG__ = {
      state: () => state,
      audit: () => {
        const league = state.career?.league || state.debugLeague;
        if (!league) return null;
        const audit = SIM.auditLeague(DATA.TEAMS, league.players, league.teamRecords);
        const rotationTotals = Object.fromEntries(DATA.TEAMS.map(team => [
          team.id,
          league.players.filter(player => player.active && player.teamId === team.id)
            .reduce((sum, player) => sum + (player.seasonRole?.minutes || 0), 0)
        ]));
        return {
          ...audit,
          activePlayers: league.players.filter(player => player.active).length,
          userPlayers: league.players.filter(player => player.active && player.isUser).length,
          rotationTotals,
          transactionCount: league.transactionHistory?.length || 0,
          retiredCount: league.retiredCount || 0,
          bracket: state.season?.postseasonBracket || null
        };
      }
    };
  }
  if (isLocalDebug && ['2003', '2009'].includes(draftDebug) && draftDebugSeason >= 1 && draftDebugSeason <= CAREER_SEASONS) {
    debugCareerMode = true;
    renderDraftDebug(draftDebug, draftDebugSeason);
  } else if (isLocalDebug && ['2003', '2009'].includes(eraDebug)) {
    debugCareerMode = true;
    startGame(eraDebug);
  } else if (isLocalDebug && POSITION_ARCHETYPES[archetypeDebug]) {
    debugCareerMode = true;
    activateArchetypeDebugState(archetypeDebug);
    renderReveal();
  } else if (isLocalDebug && awardDebugSeason >= 1 && awardDebugSeason <= CAREER_SEASONS) {
    debugCareerMode = true;
    activateAwardDebugState(awardDebugSeason);
    renderSeason();
  } else if (isLocalDebug && playoffDebug) {
    debugCareerMode = true;
    activatePlayoffDebugState();
    renderSeason();
  } else if (isLocalDebug && INJURY_LABELS[injuryDebug]) {
    debugCareerMode = true;
    activateInjuryDebugState(injuryDebug);
    renderSeason();
  } else if (isLocalDebug && [1, 15, 20].includes(debugSeason)) {
    debugCareerMode = true;
    state = buildDebugCareerState(debugSeason);
    renderSeason();
    if (tradeDebug) {
      state.career.contract.yearsRemaining = 2;
      requestTrade();
    }
    if (['freeagency', 'trade'].includes(offseasonDebug)) {
      state.career.contract.yearsRemaining = offseasonDebug === 'freeagency' ? 1 : 2;
      advanceCareer();
    }
    if (legacyDebug && debugSeason === 20) advanceCareer();
  } else {
    renderHome();
  }
}());
