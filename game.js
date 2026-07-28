(function () {
  'use strict';

  const DATA = window.GAME_DATA;
  const app = document.getElementById('app');
  const modalRoot = document.getElementById('modal-root');
  const toastEl = document.getElementById('toast');
  const backBtn = document.getElementById('back-btn');
  const homeBtn = document.getElementById('home-btn');
  const soundBtn = document.getElementById('sound-btn');
  const SAVE_KEY = 'build-a-player-save-v3';
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
  const ROOKIE_FIRST_NAMES = ['杰伦', '凯登', '马库斯', '德文', '特雷', '以赛亚', '卡梅伦', '安德烈', '科比', '贾马尔', '达里厄斯', '泰勒', '诺阿', '布兰登', '乔丹', '迈尔斯', '奥斯汀', '德里克', '朱利安', '阿伦'];
  const ROOKIE_LAST_NAMES = ['布朗', '约翰逊', '威廉姆斯', '戴维斯', '米切尔', '霍尔', '沃克', '刘易斯', '克拉克', '罗宾逊', '杨', '格林', '怀特', '哈里斯', '马丁', '汤普森', '安德森', '托马斯', '摩尔', '杰克逊', '贝克', '库珀', '里德', '金', '赖特', '斯科特', '亚当斯', '希尔', '卡特', '特纳'];
  const INITIAL_ROOKIES = new Set(['库珀-弗拉格', '康-克尼普尔', 'VJ-埃奇库姆', '迪伦-哈珀', '埃斯-贝利', '特雷-约翰逊', '杰里迈亚-费尔斯', '德里克-奎因', '卡特-布莱恩特']);

  let audioContext = null;
  let toastTimer = null;
  let spinTimer = null;
  let debugCareerMode = false;
  let state = freshState();

  function freshState() {
    return {
      screen: 'home',
      eraKey: 'current',
      resumeScreen: null,
      sound: true,
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
    return { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 };
  }

  function buildDebugCareerState(targetSeason) {
    const debugState = freshState();
    const source = DATA.PLAYERS.OKC[0];
    const perSeasonTotals = { pts: 2296, reb: 492, ast: 738, stl: 123, blk: 41, tov: 205, fgm: 816, fga: 1640, tpm: 205, tpa: 492, ftm: 459, fta: 533 };
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
      completed: false,
      lastOffseasonNote: '测试生涯状态'
    };
    debugState.season = {
      stage: 'ended', seasonNumber: targetSeason, age: debugState.career.age, teamId: debugState.careerTeam, ovrAtStart: debugState.finalOVR,
      schedule: [], wins: 52, losses: 30, seed: 3, playerTotals: { ...perSeasonTotals }, playoffRound: 1,
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

  function cloneTemplate(id) {
    const template = document.getElementById(id);
    return template.content.cloneNode(true);
  }

  function showScreen(name) {
    const previousScreen = state.screen;
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
      app.querySelector('.subtitle').textContent = `${era.seasonLabel} 赛季名单 · 位置只影响最终总评权重`;
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
        ? state.selectedPlayer[key]
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
      const swapIndex = Math.floor(Math.random() * (index + 1));
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
    return `
      <button class="player-card${selected ? ' is-selected' : ''}" type="button" data-player="${player.name}">
        <span class="player-avatar" style="--team-color:${team.primary}">${initials(player.name)}</span>
        <span class="player-meta"><strong>${player.name}</strong><small>${player.pos} · ${player.archetypeLabel}</small></span>
        <span class="player-ovr"><b>${player.ovr}</b><small>OVR</small></span>
      </button>`;
  }

  function initials(name) {
    return name.replace(/[·\-]/g, '').slice(-2);
  }

  function startGame(eraKey = 'current') {
    state = freshState();
    state.eraKey = eraKey;
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
    const target = pool[Math.floor(Math.random() * pool.length)];
    let ticks = 0;
    button.disabled = true;
    result.classList.add('is-spinning');
    playTone(150, 0.14, 'sawtooth');
    spinTimer = window.setInterval(() => {
      const preview = DATA.TEAMS[Math.floor(Math.random() * DATA.TEAMS.length)];
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

  function requestLock(attributeKey) {
    const player = state.selectedPlayer;
    if (!player || state.attrs[attributeKey] != null) return;
    const attr = DATA.ATTRS.find(([key]) => key === attributeKey);
    const value = player[attributeKey];
    const team = DATA.getTeam(player.teamId);
    modalRoot.innerHTML = `
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="lock-title">
        <header class="modal-head"><h2 id="lock-title">锁定${attr[1]}</h2><button class="modal-close" type="button" data-action="close-modal" aria-label="关闭">×</button></header>
        <div class="modal-body">
          <div class="confirm-player">
            <span class="player-avatar" style="--team-color:${team.primary}">${initials(player.name)}</span>
            <div><strong>${player.name}</strong><div>${player.pos} · ${team.name}</div></div>
          </div>
          <p class="confirm-copy">将他的 <b>${attr[1]}</b> 锁定为 <b style="color:${DATA.grade(value).color}">${value}</b>。属性按球员原始能力值直接使用。</p>
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
    const value = player[attributeKey];
    state.attrs[attributeKey] = value;
    state.attrSlots[attributeKey] = {
      player: player.name,
      team: player.teamId,
      value
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
    const candidates = Object.values(DATA.PLAYERS).flat().filter(player => player.pos === state.position);
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
    const target = pool[Math.floor(Math.random() * pool.length)];
    const slot = document.getElementById('career-slot');
    let ticks = 0;
    button.disabled = true;
    spinTimer = window.setInterval(() => {
      const team = pool[Math.floor(Math.random() * pool.length)];
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
        seasonNumber: 1,
        age: CAREER_START_AGE,
        currentTeam: state.careerTeam,
        currentOVR: state.finalOVR,
        peakOVR: state.finalOVR,
        potential: clamp(state.attrs.POT, 40, 99),
        contract: { yearsRemaining: 4, totalYears: 4, annualSalary: rookieSalary },
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
        completed: false,
        lastOffseasonNote: `18 岁进入联盟，开启 ${era.seasonLabel} 新秀赛季`
      };
    }
    initializeCareerSeason();
  }

  function createSeasonSchedule(teamId) {
    const opponents = DATA.TEAMS.filter(team => team.id !== teamId);
    return Array.from({ length: 82 }, (_, index) => ({
      game: index + 1,
      opponent: opponents[index % opponents.length].id,
      result: null
    }));
  }

  function initializeCareerSeason() {
    ensureLeagueState();
    state.careerTeam = state.career.currentTeam;
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
      const activeRoster = state.career.league.players
        .filter(player => player.active && player.teamId === teamId)
        .sort((left, right) => right.ovr - left.ovr)
        .slice(0, 10);
      if (activeRoster.length >= 5) return activeRoster.reduce((sum, player) => sum + player.ovr, 0) / activeRoster.length;
    }
    const roster = DATA.PLAYERS[teamId];
    return roster.reduce((sum, player) => sum + player.ovr, 0) / roster.length;
  }

  function randomNormal() {
    const u = Math.max(0.0001, Math.random());
    const v = Math.max(0.0001, Math.random());
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
      archetype: player.archetype,
      age,
      ovr: player.ovr,
      potential: clamp(player.POT ?? 70, 40, 99),
      defense: Math.round((player.PDEF + player.IDEF + player.BLK + player.REB) / 4),
      seasons,
      rookieYear: player.rookieYear,
      draftYear: initialProspect ? eraStartYear : undefined,
      draftOrder: initialProspect?.order,
      projected: Boolean(initialProspect?.projected),
      active: true
    };
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
          archetype: prospect.archetype,
          age: prospect.age,
          ovr: prospect.ovr,
          potential: prospect.potential,
          defense: clamp(Math.round((prospect.ovr + profile.values[6] + profile.values[7] + profile.values[8]) / 4), 50, 99),
          seasons: 0,
          rookieYear: draftYear,
          draftYear,
          draftOrder: prospect.order,
          projected: Boolean(prospect.projected),
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
        archetype,
        age: 19,
        ovr,
        potential,
        defense: clamp(ovr + (['anchor', 'twoway'].includes(archetype) ? 5 : -4) + talentRoll, 55, 96),
        seasons: 0,
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
        .sort((left, right) => (right.ovr + (right.seasons === 0 ? 2 : 0)) - (left.ovr + (left.seasons === 0 ? 2 : 0)));
      roster.slice(15).forEach(player => {
        player.active = false;
        player.exitReason = '离开联盟';
      });
    });
  }

  function createLeagueState() {
    const era = DATA.getEra(state.eraKey);
    const league = {
      eraKey: state.eraKey,
      startYear: era.startYear,
      seasonNumber: 1,
      players: Object.values(DATA.PLAYERS).flat().map(createLeaguePlayer),
      awardHistory: [],
      retiredCount: 0
    };
    addRookieClass(league, 1);
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
      player.age += 1;
      player.seasons += 1;
      const growthChance = potentialGrowthChance(player.potential, player.age);
      let change = 0;
      if (player.age <= 30 && Math.random() < growthChance) {
        const potentialFactor = clamp((player.potential - 40) / 59, 0, 1);
        if (player.age <= 22) change = 1.1 + potentialFactor * 1.9 + randomNormal() * 0.4;
        else if (player.age <= 26) change = 0.55 + potentialFactor * 1.15 + randomNormal() * 0.35;
        else change = 0.15 + potentialFactor * 0.65 + randomNormal() * 0.25;
      } else if (player.age <= 30) change = randomNormal() * 0.22 - 0.08;
      else if (player.age <= 34) change = -0.7 - (player.age - 31) * 0.25 + randomNormal() * 0.35;
      else change = -1.8 - (player.age - 35) * 0.45 + randomNormal() * 0.45;
      player.ovr = clamp(Math.round(player.ovr + change), 55, 99);
      player.defense = clamp(Math.round(player.defense + change * 0.75), 50, 99);
      const retirementChance = player.age >= 40 ? 1 : (player.age >= 36 ? 0.2 + (player.age - 36) * 0.18 + Math.max(0, 78 - player.ovr) * 0.035 : 0);
      if ((player.age >= 34 && player.ovr <= 68) || Math.random() < retirementChance) {
        player.active = false;
        player.exitReason = '退役';
        retired += 1;
      }
    });
    const rookies = addRookieClass(league, nextSeasonNumber);
    trimLeagueRosters(league);
    league.seasonNumber = nextSeasonNumber;
    league.retiredCount += retired;
    return { retired, rookies };
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
    if (!Number.isFinite(state.career.league.retiredCount)) state.career.league.retiredCount = 0;
    return state.career.league;
  }

  function renderDraftDebug(eraKey, targetSeason) {
    state = freshState();
    state.eraKey = eraKey;
    DATA.setEra(eraKey);
    const league = createLeagueState();
    let lastUpdate = { retired: 0, rookies: league.players.filter(player => player.seasons === 0).length };
    while (league.seasonNumber < targetSeason) lastUpdate = evolveLeagueSeason(league, league.seasonNumber + 1);
    const draftYear = league.startYear + targetSeason - 1;
    const rookies = league.players.filter(player => player.active && player.seasons === 0 && player.draftYear === draftYear);
    const activeAges = league.players.filter(player => player.active).map(player => player.age);
    app.innerHTML = `<section class="screen"><p class="step-label">LEAGUE DEBUG</p><h1>${eraKey} 纪元第 ${targetSeason} 季</h1><p class="subtitle">${DATA.seasonLabel(draftYear)} · ${rookies.length} 名新秀 · 累计 ${league.retiredCount} 人退役</p><div class="info-strip"><b>年龄范围</b> ${Math.min(...activeAges)}–${Math.max(...activeAges)} 岁</div><ol>${rookies.map(player => `<li>${player.draftOrder}. ${player.name} · ${player.age} 岁 · ${player.ovr}/${player.potential}</li>`).join('')}</ol><p>本次推进：${lastUpdate.retired} 人退役，${lastUpdate.rookies} 人入盟</p></section>`;
  }

  function simulateOneGame() {
    const game = state.season.schedule.find(item => !item.result);
    if (!game) return null;
    const opponentStrength = teamStrength(game.opponent);
    const ownBase = teamStrength(state.careerTeam) * 0.62 + state.finalOVR * 0.38;
    const margin = ownBase - opponentStrength + randomNormal() * 8;
    const won = margin >= 0;
    const myScore = Math.max(84, Math.round(110 + margin / 2 + randomNormal() * 5));
    const theirScore = Math.max(82, Math.round(110 - margin / 2 + randomNormal() * 5));
    const positionFactor = {
      PG: { fga: 17, reb: 4, ast: 9, stl: 1.5, blk: 0.3, tov: 2.8 },
      SG: { fga: 19, reb: 5, ast: 5, stl: 1.2, blk: 0.4, tov: 2.3 },
      SF: { fga: 17, reb: 7, ast: 5, stl: 1.1, blk: 0.7, tov: 2.1 },
      PF: { fga: 15, reb: 10, ast: 4, stl: 0.9, blk: 1.0, tov: 1.9 },
      C: { fga: 14, reb: 12, ast: 4, stl: 0.7, blk: 1.6, tov: 2.0 }
    }[state.position];
    const statScale = state.finalOVR / 88;
    const fga = Math.max(5, Math.round(positionFactor.fga * statScale + randomNormal() * 2));
    const tpa = clamp(Math.round(2 + state.attrs.threePT / 100 * 6 + randomNormal() * 1.2), 0, fga - 1);
    const twoPa = fga - tpa;
    const twoPct = clamp(0.36 + (state.attrs.FIN + state.attrs.MID + state.attrs.DNK) / 300 * 0.22, 0.4, 0.67);
    const threePct = clamp(0.24 + state.attrs.threePT / 100 * 0.2, 0.25, 0.46);
    const fta = Math.max(1, Math.round(2 + (state.attrs.FIN + state.attrs.ATH) / 200 * 5 + randomNormal() * 1.4));
    const ftPct = clamp(0.52 + (state.attrs.MID + state.attrs.CLU) / 200 * 0.32, 0.58, 0.92);
    const tpm = clamp(Math.round(tpa * threePct + randomNormal() * 0.9), 0, tpa);
    const twoPm = clamp(Math.round(twoPa * twoPct + randomNormal() * 1.1), 0, twoPa);
    const ftm = clamp(Math.round(fta * ftPct + randomNormal() * 0.7), 0, fta);
    const stats = {
      pts: twoPm * 2 + tpm * 3 + ftm,
      reb: Math.max(1, Math.round(positionFactor.reb * statScale + randomNormal() * 2.5)),
      ast: Math.max(1, Math.round(positionFactor.ast * statScale + randomNormal() * 2.8)),
      stl: Math.max(0, Math.round((positionFactor.stl * (0.65 + state.attrs.PDEF / 180) + randomNormal() * 0.65) * 10) / 10),
      blk: Math.max(0, Math.round((positionFactor.blk * (0.55 + state.attrs.BLK / 150) + randomNormal() * 0.55) * 10) / 10),
      tov: Math.max(0, Math.round((positionFactor.tov + randomNormal() * 0.9) * 10) / 10),
      fgm: twoPm + tpm,
      fga,
      tpm,
      tpa,
      ftm,
      fta
    };
    game.result = { won, myScore: won ? Math.max(myScore, theirScore + 1) : Math.min(myScore, theirScore - 1), theirScore, stats };
    if (won) state.season.wins += 1; else state.season.losses += 1;
    Object.keys(freshPlayerTotals()).forEach(key => {
      state.season.playerTotals[key] += stats[key];
    });
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
    const timer = window.setInterval(() => {
      const game = simulateOneGame();
      updateRegularSeasonAnimation(game);
      if (!game || !state.season.schedule.some(item => !item.result)) {
        window.clearInterval(timer);
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
      latest.innerHTML = `<img src="${opponent.logo}" alt=""><span>对阵 ${opponent.name}</span><b class="${game.result.won ? 'win' : 'loss'}">${game.result.won ? '胜' : '负'} ${game.result.myScore}-${game.result.theirScore}</b>`;
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
    const winRate = state.season.wins / 82;
    const estimatedSeed = Math.round(16 - winRate * 18 - (state.finalOVR - 85) * 0.15 + randomNormal() * 1.4);
    state.season.seed = Math.max(1, Math.min(15, estimatedSeed));
    if (state.season.seed <= 6) state.season.postSeasonStage = 'playoffs';
    else if (state.season.seed <= 10) state.season.postSeasonStage = 'playin';
    else state.season.postSeasonStage = 'ended';
    state.season.awards = buildSeasonAwards();
    state.season.stage = 'awards';
  }

  function leagueSeasonProfiles() {
    const league = ensureLeagueState();
    return league.players.filter(player => player.active).map(player => {
      const scoringBoost = { sniper: 3.4, creator: 2.2, slasher: 3, wing: 1.4, anchor: -4, big: -1.2, twoway: -0.8, pointbig: 0.8 }[player.archetype] || 0;
      const passingBoost = { PG: 4.8, SG: 1.6, SF: 1.4, PF: 0.8, C: 1.1 }[player.pos] + (['creator', 'pointbig'].includes(player.archetype) ? 2.5 : 0);
      const reboundingBoost = { PG: 0, SG: 0.7, SF: 2.1, PF: 4.3, C: 6.2 }[player.pos];
      const pts = clamp(10 + (player.ovr - 70) * 0.78 + scoringBoost + randomNormal() * 1.8, 6, 36);
      const ast = clamp(1.2 + (player.ovr - 70) * 0.12 + passingBoost + randomNormal() * 0.7, 1, 13);
      const reb = clamp(2 + (player.ovr - 70) * 0.1 + reboundingBoost + randomNormal() * 0.8, 2, 15);
      const stocks = clamp(0.5 + (player.defense - 60) * 0.045 + (['anchor', 'twoway'].includes(player.archetype) ? 1.1 : 0) + randomNormal() * 0.35, 0.4, 5.2);
      const wins = clamp(Math.round(24 + (teamStrength(player.teamId) - 72) * 1.45 + randomNormal() * 4.5), 15, 68);
      player.lastSeason = { pts: Number(pts.toFixed(1)), ast: Number(ast.toFixed(1)), reb: Number(reb.toFixed(1)), stocks: Number(stocks.toFixed(1)), wins };
      return { ...player, ...player.lastSeason };
    });
  }

  function pickLeagueAward(profiles, awardKey, score) {
    const history = state.career.league.awardHistory || [];
    const recentWinners = history.slice(-2).map(entry => entry[awardKey]);
    return profiles.map(player => {
      let repeatPenalty = 0;
      if (recentWinners[recentWinners.length - 1] === player.name) repeatPenalty += 3.5;
      if (recentWinners[0] === player.name) repeatPenalty += 1.5;
      return { ...player, awardScore: score(player) - repeatPenalty + randomNormal() * 2.2 };
    }).sort((left, right) => right.awardScore - left.awardScore)[0];
  }

  function buildSeasonAwards() {
    const averages = seasonAverages();
    const defensiveAverage = ['PDEF', 'IDEF', 'BLK', 'REB'].reduce((sum, key) => sum + state.attrs[key], 0) / 4;
    const profiles = leagueSeasonProfiles();
    const mvp = pickLeagueAward(profiles, 'mvp', player => player.ovr * 0.72 + player.pts * 0.85 + player.ast * 0.35 + player.wins * 0.16);
    const dpoy = pickLeagueAward(profiles, 'dpoy', player => player.defense * 0.9 + player.stocks * 4.5 + player.reb * 0.35 + player.wins * 0.1);
    const scoring = pickLeagueAward(profiles, 'scoring', player => player.pts * 3 + player.ovr * 0.12);
    const rookies = profiles.filter(player => player.seasons === 0);
    const rookiePool = rookies.length ? rookies : profiles.slice().sort((left, right) => left.age - right.age).slice(0, 12);
    const rookie = pickLeagueAward(rookiePool, 'rookie', player => player.ovr * 0.8 + player.pts * 0.7 + player.ast * 0.25 + player.reb * 0.2);
    const userMVPScore = state.finalOVR * 0.72 + Number(averages.pts) * 0.85 + Number(averages.ast) * 0.35 + state.season.wins * 0.16;
    const userDPOYScore = defensiveAverage * 0.9 + (Number(averages.stl) + Number(averages.blk)) * 4.5 + Number(averages.reb) * 0.35 + state.season.wins * 0.1;
    const userRookieScore = state.finalOVR * 0.8 + Number(averages.pts) * 0.7 + Number(averages.ast) * 0.25 + Number(averages.reb) * 0.2;
    const userMVP = userMVPScore >= mvp.awardScore;
    const userDPOY = userDPOYScore >= dpoy.awardScore;
    const userROTY = state.career.seasonNumber === 1 && userRookieScore >= rookie.awardScore;
    const userScoring = Number(averages.pts) >= scoring.pts;
    let allNba = '未入选';
    if (state.finalOVR >= 92) allNba = '最佳阵容一阵';
    else if (state.finalOVR >= 87) allNba = '最佳阵容二阵';
    else if (state.finalOVR >= 82) allNba = '最佳阵容三阵';
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
    const chance = Math.min(0.83, Math.max(0.38, 0.55 + (state.finalOVR - 85) * 0.025 - (state.season.seed - 7) * 0.05));
    state.season.playInSimulation = { opponent, quarter: 0, myScore: 0, theirScore: 0 };
    renderSeason();
    const timer = window.setInterval(() => {
      const sim = state.season.playInSimulation;
      sim.quarter += 1;
      sim.myScore += Math.max(17, Math.round(26 + (chance - 0.5) * 9 + randomNormal() * 4));
      sim.theirScore += Math.max(17, Math.round(26 - (chance - 0.5) * 9 + randomNormal() * 4));
      renderSeason();
      if (sim.quarter >= 4) {
        window.clearInterval(timer);
        const won = Math.random() < chance;
        if (won && sim.myScore <= sim.theirScore) sim.myScore = sim.theirScore + Math.ceil(Math.random() * 6);
        if (!won && sim.myScore >= sim.theirScore) sim.theirScore = sim.myScore + Math.ceil(Math.random() * 6);
        state.season.series.push({ label: '附加赛', opponent, won, score: `${sim.myScore}-${sim.theirScore}` });
        state.season.playInSimulation = null;
        state.season.stage = won ? 'playoffs' : 'ended';
        state.season.ended = !won;
        playTone(won ? 720 : 220, 0.12);
        renderSeason();
        saveGame();
      }
    }, 520);
  }

  function selectPostseasonOpponent(isFinals) {
    const ownConference = DATA.getTeam(state.careerTeam).conference;
    const targetConference = isFinals ? (ownConference === 'EAST' ? 'WEST' : 'EAST') : ownConference;
    const faced = new Set(state.season.series.map(series => series.opponent));
    faced.add(state.careerTeam);
    const pool = DATA.TEAMS.filter(team => team.conference === targetConference && !faced.has(team.id));
    const fallback = DATA.TEAMS.filter(team => team.conference === targetConference && team.id !== state.careerTeam);
    const candidates = pool.length ? pool : fallback;
    return candidates
      .map(team => ({ id: team.id, score: teamStrength(team.id) + randomNormal() * 4.5 }))
      .sort((left, right) => right.score - left.score)[0].id;
  }

  function simulateSeries() {
    if (state.season.stage !== 'playoffs' || state.season.ended || state.season.seriesSimulation) return;
    const labels = ['首轮', '分区半决赛', '分区决赛', '总决赛'];
    const round = state.season.playoffRound;
    const opponent = selectPostseasonOpponent(round === 3);
    const difficulty = round * 0.055;
    const chance = Math.min(0.86, Math.max(0.28, 0.58 + (state.finalOVR - 86) * 0.025 - difficulty));
    state.season.seriesSimulation = { label: labels[round], opponent, wins: 0, losses: 0, games: [] };
    renderSeason();
    const timer = window.setInterval(() => {
      const sim = state.season.seriesSimulation;
      const wonGame = Math.random() < chance;
      if (wonGame) sim.wins += 1; else sim.losses += 1;
      const myScore = Math.round(101 + Math.random() * 22 + (wonGame ? 5 : 0));
      const theirScore = Math.round(101 + Math.random() * 22 + (wonGame ? 0 : 5));
      sim.games.push({ won: wonGame, myScore: wonGame ? Math.max(myScore, theirScore + 1) : Math.min(myScore, theirScore - 1), theirScore });
      renderSeason();
      if (sim.wins >= 4 || sim.losses >= 4) {
        window.clearInterval(timer);
        finalizeSeriesSimulation();
      }
    }, 520);
  }

  function finalizeSeriesSimulation() {
    const sim = state.season.seriesSimulation;
    const round = state.season.playoffRound;
    const won = sim.wins >= 4;
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
    const games = Math.max(1, state.season.wins + state.season.losses);
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
    const games = state.season.wins + state.season.losses;
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
      wins: state.season.wins,
      losses: state.season.losses,
      seed: state.season.seed,
      totals,
      averages,
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
    state.season.archived = true;
    return entry;
  }

  function applyCareerDevelopment(nextAge) {
    const before = state.finalOVR;
    const growthChance = potentialGrowthChance(state.career.potential, nextAge);
    const growthTriggered = nextAge <= 30 && Math.random() < growthChance;
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

  function pickCareerTeam(excludedTeamId) {
    const pool = DATA.TEAMS.filter(team => team.id !== excludedTeamId);
    return pool[Math.floor(Math.random() * pool.length)].id;
  }

  function processCareerMovement(completedSeason, nextAge, requestedTrade) {
    const career = state.career;
    const currentTeam = career.currentTeam;
    career.contract.yearsRemaining -= 1;
    if (requestedTrade) {
      if (career.contract.yearsRemaining <= 0) career.contract.yearsRemaining = 1;
      return state.season.tradeResult;
    }
    let event = null;
    if (career.contract.yearsRemaining <= 0) {
      const stayChance = clamp(0.48 + (completedSeason.wins - 41) / 120 + (state.finalOVR - 82) * 0.025 - (nextAge >= 34 ? 0.12 : 0), 0.25, 0.88);
      const years = nextAge >= 35 ? 2 : (nextAge >= 31 ? 3 : 4);
      const salary = Math.max(3, Math.round((state.finalOVR - 67) * 1.55));
      if (Math.random() < stayChance) {
        career.contract = { yearsRemaining: years, totalYears: years, annualSalary: salary };
        event = { type: '续约', teamId: currentTeam, text: `与${DATA.getTeam(currentTeam).name}续约 ${years} 年` };
      } else {
        const nextTeam = pickCareerTeam(currentTeam);
        career.currentTeam = nextTeam;
        career.contract = { yearsRemaining: years, totalYears: years, annualSalary: salary };
        event = { type: '自由签约', teamId: nextTeam, text: `合同到期，签约${DATA.getTeam(nextTeam).name} ${years} 年` };
      }
    } else {
      const tradeChance = 0.1 + (completedSeason.wins < 35 ? 0.06 : 0) + (career.contract.yearsRemaining === 1 ? 0.05 : 0);
      if (Math.random() < tradeChance) {
        const nextTeam = pickCareerTeam(currentTeam);
        career.currentTeam = nextTeam;
        event = { type: '交易', teamId: nextTeam, text: `被交易至${DATA.getTeam(nextTeam).name}` };
      }
    }
    if (event) {
      career.transactions.push({ ...event, season: career.seasonNumber + 1, age: nextAge });
      if (!career.teamsPlayed.includes(career.currentTeam)) career.teamsPlayed.push(career.currentTeam);
    }
    return event;
  }

  function requestTrade() {
    if (!state.career || !state.season || !['ended', 'champion'].includes(state.season.stage)) return;
    if (state.career.seasonNumber >= CAREER_SEASONS || state.season.tradeRequested) return;
    archiveCareerSeason();
    const league = ensureLeagueState();
    const oldTeamId = state.career.currentTeam;
    const candidates = league.players
      .filter(player => player.active && player.teamId !== oldTeamId)
      .map(player => ({ player, difference: Math.abs(player.ovr - state.finalOVR) }))
      .sort((left, right) => left.difference - right.difference || right.player.ovr - left.player.ovr);
    if (!candidates.length) {
      showToast('联盟暂无可匹配的交易筹码');
      return;
    }
    const closestDifference = candidates[0].difference;
    const closeMatches = candidates.filter(item => item.difference <= Math.max(2, closestDifference)).slice(0, 10);
    const matched = closeMatches[Math.floor(Math.random() * closeMatches.length)].player;
    const targetTeamId = matched.teamId;
    matched.teamId = oldTeamId;
    state.career.currentTeam = targetTeamId;
    if (!state.career.teamsPlayed.includes(targetTeamId)) state.career.teamsPlayed.push(targetTeamId);
    const result = {
      type: '申请交易',
      teamId: targetTeamId,
      playerId: matched.id,
      playerName: matched.name,
      playerOVR: matched.ovr,
      fromTeamId: oldTeamId,
      text: `申请交易获批：我将加盟${DATA.getTeam(targetTeamId).name}，对方送出 ${matched.ovr} OVR 的${matched.name}至${DATA.getTeam(oldTeamId).name}`
    };
    state.season.tradeRequested = true;
    state.season.tradeResult = result;
    state.career.transactions.push({ ...result, season: state.career.seasonNumber + 1, age: state.career.age + 1 });
    renderSeason();
    saveGame();
    showToast(`交易达成，总评差 ${Math.abs(matched.ovr - state.finalOVR)}`);
  }

  function advanceCareer() {
    if (!state.career || !['ended', 'champion'].includes(state.season.stage)) return;
    const completedSeason = archiveCareerSeason();
    if (state.career.seasonNumber >= CAREER_SEASONS) {
      state.career.completed = true;
      state.career.age = 38;
      state.season.stage = 'career-complete';
      renderSeason();
      saveGame();
      return;
    }
    const nextAge = state.career.age + 1;
    const development = applyCareerDevelopment(nextAge);
    const movement = processCareerMovement(completedSeason, nextAge, state.season.tradeRequested);
    const leagueUpdate = evolveLeagueSeason(ensureLeagueState(), state.career.seasonNumber + 1);
    state.career.seasonNumber += 1;
    state.career.age = nextAge;
    state.career.lastOffseasonNote = `${development.text}${movement ? ` · ${movement.text}` : ' · 球队阵容保持稳定'} · 联盟${leagueUpdate.retired}人退役，${leagueUpdate.rookies}名新秀入盟`;
    initializeCareerSeason();
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
    const finalsAppearances = career.history.filter(entry => entry.champion || String(entry.postseason).includes('总决赛')).length;
    const dimensions = {
      '巅峰统治': clamp(Math.round((career.peakOVR - 72) * 3.6 + Math.min(18, Number(average.pts) * 0.55)), 0, 100),
      '个人荣誉': clamp(Math.round(mvp * 22 + dpoy * 14 + allNba * 6 + scoringTitles * 5), 0, 100),
      '赢球履历': clamp(Math.round(career.championships * 24 + finalsAppearances * 6 + career.history.filter(entry => entry.wins >= 50).length * 2), 0, 100),
      '生涯产量': clamp(Math.round(totals.pts / 360 + totals.reb / 260 + totals.ast / 210), 0, 100),
      '持久稳定': clamp(Math.round(career.totalGames / 18 + highLevelSeasons * 2.5), 0, 100)
    };
    const score = Math.round(dimensions['巅峰统治'] * 0.25 + dimensions['个人荣誉'] * 0.22 + dimensions['赢球履历'] * 0.2 + dimensions['生涯产量'] * 0.2 + dimensions['持久稳定'] * 0.13);
    const tiers = [
      [93, '篮球史最高峰', '历史前 3 讨论'], [86, '不朽传奇', '历史前 10 级别'], [78, '时代统治者', '历史前 20 级别'],
      [68, '名人堂超级巨星', '历史前 40 级别'], [58, '名人堂核心', '历史前 75 级别'], [47, '时代全明星', '时代代表球星'],
      [0, '长青职业人', '联盟重要球员']
    ];
    const tier = tiers.find(([threshold]) => score >= threshold);
    const badges = [];
    if (score >= 93 && mvp >= 3 && career.championships >= 3) badges.push('王座挑战者');
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
    if (!career.championships && score >= 65) badges.push('无冕之王');
    if (Number(average.pts) >= 27) badges.push('得分机器');
    if (Number(average.stl) + Number(average.blk) >= 3 && Number(average.pts) >= 20) badges.push('攻防一体');
    if (!badges.length) badges.push(highLevelSeasons >= 8 ? '长青支柱' : '职业典范');
    const strongest = Object.entries(dimensions).sort((left, right) => right[1] - left[1])[0];
    const weakest = Object.entries(dimensions).sort((left, right) => left[1] - right[1])[0];
    const copy = `我的生涯历史评分为 ${score} 分。巅峰达到 ${career.peakOVR} OVR，累计 ${Math.round(totals.pts).toLocaleString()} 分、${Math.round(totals.reb).toLocaleString()} 个篮板和 ${Math.round(totals.ast).toLocaleString()} 次助攻；${career.championships} 次夺冠、${mvp} 次 MVP、${allNba} 次入选最佳阵容。${strongest[0]}是最有说服力的历史资本。`;
    const caveat = weakest[1] >= 70
      ? '评价没有明显短板，巅峰、积累与团队成绩形成了完整闭环。'
      : `${weakest[0]}是历史排名中的主要争议项；若这一维度更强，排名仍有明显上升空间。`;
    return { score, title: tier[1], rank: tier[2], badges: badges.slice(0, 6), dimensions, copy, caveat };
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
    const role = state.finalOVR >= teamStrength(team.id) ? '首发核心' : '轮换尖兵';
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
        <td>${entry.ovr}</td><td>${entry.wins}-${entry.losses}</td><td>${entry.averages.pts}</td><td>${entry.averages.reb}</td><td>${entry.averages.ast}</td>
        <td>${entry.averages.fgPct}%</td><td>${entry.postseason}</td><td>${entry.awards.length ? entry.awards.join(' / ') : '--'}</td>
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
            <table class="career-table"><thead><tr><th>赛季</th><th>年龄</th><th>球队</th><th>OVR</th><th>战绩</th><th>得分</th><th>篮板</th><th>助攻</th><th>FG</th><th>结果</th><th>奖项</th></tr></thead>
            <tbody>${careerHistoryRows() || '<tr><td colspan="11">首个赛季进行中，完成后生成履历</td></tr>'}</tbody></table>
          </div>
          <div class="career-transaction-list"><h3>签约与交易</h3>${state.career.transactions.map(event => `<div><b>第 ${event.season} 季 · ${event.age} 岁</b><span>${event.text}</span></div>`).join('')}</div>
        </div>
      </section>`;
  }

  function careerSummaryHTML() {
    const career = state.career;
    const standing = careerStanding();
    const averages = careerAverages();
    const totals = career.totals;
    const awards = Object.entries(career.awardCounts).sort((left, right) => right[1] - left[1]);
    return `
      <section class="career-summary">
        <div class="career-summary-hero"><span>RETIREMENT · AGE 38</span><h1>${standing.title}</h1><p>${standing.rank} · 历史评分 ${standing.score}</p></div>
        <div class="legacy-badges">${standing.badges.map(label => `<span class="legacy-badge">${label}</span>`).join('')}</div>
        <p class="career-legacy-copy">${standing.copy}</p>
        <div class="legacy-dimensions">${Object.entries(standing.dimensions).map(([label, value]) => `<div class="legacy-dimension"><div><span>${label}</span><b>${value}</b></div><i><em style="width:${value}%"></em></i></div>`).join('')}</div>
        <p class="legacy-caveat"><b>评价依据：</b>${standing.caveat}</p>
        <div class="career-summary-grid">
          <div><b>${CAREER_SEASONS}</b><span>生涯赛季</span></div><div><b>${career.totalGames}</b><span>总场次</span></div>
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
        <button class="primary-btn" type="button" data-action="continue-postseason">${season.postSeasonStage === 'playoffs' ? '进入季后赛' : (season.postSeasonStage === 'playin' ? '进入附加赛' : '查看赛季总结')}</button>
      </section>`;
  }

  function gameRowHTML(game) {
    const opponent = DATA.getTeam(game.opponent);
    const result = game.result;
    return `<div class="game-row"><img src="${opponent.logo}" alt=""><span>G${game.game} · 对 ${opponent.name}</span><b class="${result.won ? 'win' : 'loss'}">${result.won ? '胜' : '负'} ${result.myScore}-${result.theirScore}</b></div>`;
  }

  function playInHTML() {
    if (state.season.playInSimulation) {
      const sim = state.season.playInSimulation;
      const opponent = DATA.getTeam(sim.opponent);
      return `
        <section class="season-panel simulation-panel">
          <div class="simulation-heading"><div><span class="live-dot"></span><b>附加赛生死战</b></div><strong>${sim.quarter ? `第 ${sim.quarter} 节` : '准备开赛'}</strong></div>
          <div class="live-scoreboard"><div><img src="${DATA.getTeam(state.careerTeam).logo}" alt=""><span>我的球队</span><b>${sim.myScore}</b></div><em>VS</em><div><img src="${opponent.logo}" alt=""><span>${opponent.name}</span><b>${sim.theirScore}</b></div></div>
          <div class="quarter-track">${[1,2,3,4].map(quarter => `<i class="${quarter <= sim.quarter ? 'is-complete' : ''}">Q${quarter}</i>`).join('')}</div>
        </section>`;
    }
    return `
      <section class="season-panel">
        <h2>东山再起 · 第 ${state.season.seed} 名</h2>
        <p class="confirm-copy">常规赛进入附加赛区。赢下这场生死战，才能拿到季后赛门票。</p>
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
        <p class="confirm-copy">${reason}。赛季数据将写入生涯履历，随后自动处理成长、合同与球队变动。</p>
        ${playoffRows ? `<div class="playoff-bracket">${playoffRows}</div>` : ''}
        ${tradeResultHTML()}
        <div class="season-actions offseason-actions">
          <button class="secondary-btn" type="button" data-action="career-history">查看生涯数据</button>
          ${tradeButtonHTML()}
          <button class="primary-btn" type="button" data-action="advance-career">${state.career.seasonNumber >= CAREER_SEASONS ? '结束生涯' : '进入休赛期'}</button>
        </div>
      </section>`;
  }

  function championHTML(team) {
    return `
      <section class="champion-banner">
        <img src="${team.logo}" alt="${team.name}队标">
        <h2>联盟总冠军</h2>
        <p>${team.name} · ${state.finalOVR} OVR · ${state.archetype.label}</p>
        ${tradeResultHTML()}
        <div class="season-actions offseason-actions">
          <button class="secondary-btn" type="button" data-action="career-history">查看生涯数据</button>
          ${tradeButtonHTML()}
          <button class="primary-btn" type="button" data-action="advance-career">${state.career.seasonNumber >= CAREER_SEASONS ? '带着冠军退役' : '进入休赛期'}</button>
        </div>
      </section>`;
  }

  function tradeButtonHTML() {
    if (state.career.seasonNumber >= CAREER_SEASONS) return '';
    return `<button class="trade-btn" type="button" data-action="request-trade" ${state.season.tradeRequested ? 'disabled' : ''}>${state.season.tradeRequested ? '交易已完成' : '申请交易'}</button>`;
  }

  function tradeResultHTML() {
    return state.season.tradeResult ? `<div class="trade-request-result"><b>交易达成</b><span>${state.season.tradeResult.text}</span></div>` : '';
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
    ['建球员', '14 项属性', '选择位置后随机抽取球队，从该队球员中选一人，再点击属性槽夺取一项能力。潜力表示年轻阶段每年触发能力提升的概率，不代表巅峰总评。每名球员只能使用一次，锁满十四项后自动计算总评、模板与相似球员。'],
    ['赛季', '82 场征程', '抽取生涯球队后进入常规赛。系统按球员属性、位置和球队实力模拟比赛，可单场推进，也可直接模拟完整赛季。场均数据会随属性组合变化。'],
    ['季后赛', '七场四胜', '常规赛前六名直通季后赛，七至十名参加附加赛。季后赛包含首轮、分区半决赛、分区决赛和总决赛，能力越强，晋级概率越高。'],
    ['结算', '独一无二', '完成建模后会生成能力卡，展示总评、十四项最终属性、打法模板和相似现役球员。二十年生涯、逐季数据和冠军记录保存在当前浏览器中。'],
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
      localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, selectedPlayer: state.selectedPlayer ? { name: state.selectedPlayer.name, teamId: state.selectedPlayer.teamId } : null }));
    } catch (error) {
      showToast('当前浏览器无法保存进度');
    }
  }

  function loadStoredGame() {
    try {
      return JSON.parse(localStorage.getItem(SAVE_KEY));
    } catch (error) {
      return null;
    }
  }

  function hydrateSeasonTotals() {
    if (!state.season) return;
    const savedTotals = state.season.playerTotals || {};
    const games = state.season.wins + state.season.losses;
    const needsBackfill = games > 0 && savedTotals.stl == null;
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
    state.season.playerTotals = totals;
  }

  function continueGame() {
    const saved = loadStoredGame();
    if (!saved || (!saved.resumeScreen && saved.screen === 'home')) return;
    state = { ...freshState(), ...saved, sound: state.sound };
    state.eraKey = saved.eraKey || saved.career?.eraKey || 'current';
    DATA.setEra(state.eraKey);
    if (state.career && !Number.isFinite(state.career.startYear)) state.career.startYear = DATA.getEra(state.eraKey).startYear;
    if (state.position && Object.keys(state.attrs || {}).length) state.archetype = findArchetype();
    if (state.season) hydrateSeasonTotals();
    if (state.career) {
      state.career.potential = clamp(state.career.potential ?? state.attrs.POT ?? 70, 40, 99);
      if (!Array.isArray(state.career.teamsPlayed)) state.career.teamsPlayed = [state.career.currentTeam];
      const league = ensureLeagueState();
      league.players.forEach(player => { player.potential = clamp(player.potential ?? 70, 40, 99); });
      const hasSavedAwards = Array.isArray(state.season?.awards) && state.season.awards.length;
      const hasLegacyAwards = hasSavedAwards && (state.season.awards.some(award => award.winner === '本届最佳新秀') || league.awardHistory.length === 0);
      if (hasLegacyAwards) state.season.awards = buildSeasonAwards();
    }
    if (saved.selectedPlayer && saved.selectedPlayer.teamId) {
      state.selectedPlayer = DATA.PLAYERS[saved.selectedPlayer.teamId]?.find(player => player.name === saved.selectedPlayer.name) || null;
    }
    if (state.season) {
      state.season.tradeRequested = Boolean(state.season.tradeRequested);
      state.season.isSimulating = false;
      state.season.playInSimulation = null;
      state.season.seriesSimulation = null;
    }
    showScreen(saved.resumeScreen || saved.screen);
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
  const isLocalDebug = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
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
  } else if (isLocalDebug && [1, 15, 20].includes(debugSeason)) {
    debugCareerMode = true;
    state = buildDebugCareerState(debugSeason);
    renderSeason();
  } else {
    renderHome();
  }
}());
