/*
 * 画面の状態機械と DOM 制御。ルールは game-logic.js、描画は dial.js に任せる。
 *
 * 画面: setup → handoff-psychic → psychic → handoff-team → team → reveal → (次のラウンド | result)
 * 進行中のゲームは localStorage に保存し、リロードしても同じ画面に戻る。
 */
(function () {
  'use strict';

  const L = window.WavelengthLogic;
  const DECK = window.WAVELENGTH_PROMPTS || [];
  const rng = Math.random;

  const KEYS = {
    settings: 'wavelength.settings',
    players: 'wavelength.players',
    best: 'wavelength.best',
    game: 'wavelength.game',
  };

  const PRESET_LABEL = { official: '公式', easy: 'かんたん', hard: 'むずかしい' };
  const ZONE_LABEL = { 2: '中央ヒット！', 1: '中央のとなり', 3: '中央のとなり', 0: '外側ゾーン', 4: '外側ゾーン' };

  // ---- localStorage（失敗しても動く） ----------------------------------
  function load(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 無視 */ }
  }
  function remove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* 無視 */ }
  }

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const slot = (name) => document.querySelector('[data-slot="' + name + '"]');

  // ---- アプリ状態 ----------------------------------------------------------
  const app = {
    screen: 'setup',
    settings: L.normalizeSettings(load(KEYS.settings)),
    players: Array.isArray(load(KEYS.players)) ? load(KEYS.players) : [],
    game: null,
    dialDeg: 90,
  };

  function zoneSettings(settings) {
    return { wedgeDeg: settings.wedgeDeg, zonePoints: L.zonePoints(settings) };
  }

  // ---- ダイヤル ----------------------------------------------------------------
  const dials = {
    preview: window.Dial.create($('#dialPreview'), { interactive: false }),
    psychic: window.Dial.create($('#dialPsychic'), { interactive: false }),
    team: window.Dial.create($('#dialTeam'), {
      interactive: true,
      ariaLabel: 'ダイヤルの位置。左端が0度、右端が180度。矢印キーでも動かせます。',
      onChange: (deg) => {
        app.dialDeg = deg;
        $('#tRange').value = String(deg);
        persistGame();
      },
    }),
    reveal: window.Dial.create($('#dialReveal'), { interactive: false }),
  };
  dials.preview.setNeedleVisible(false);
  dials.psychic.setNeedleVisible(false);

  // ---- 画面切替 ------------------------------------------------------------
  const renderers = {};

  function show(screen) {
    app.screen = screen;
    $$('.screen').forEach((sec) => { sec.hidden = sec.dataset.screen !== screen; });
    document.body.dataset.screen = screen;
    if (renderers[screen]) renderers[screen]();
    window.scrollTo(0, 0);
    persistGame();
  }

  function persistGame() {
    if (app.game && !app.game.finished && app.screen !== 'setup') {
      save(KEYS.game, { screen: app.screen, game: app.game, dialDeg: app.dialDeg });
    } else {
      remove(KEYS.game);
    }
  }

  function roundLabel(game) {
    // 決定後（公開画面）は現在のラウンドがすでに history に入っている
    const decided = game.current && game.current.result;
    const n = decided ? game.history.length : game.history.length + 1;
    return 'ラウンド ' + n + ' / ' + L.totalRounds(game);
  }

  function faceOf(game) {
    const cur = game.current;
    return cur && cur.face ? cur.card[cur.face] : null;
  }

  function setEnds(prefix, face) {
    slot(prefix + 'Left').textContent = face ? face.left : '';
    slot(prefix + 'Right').textContent = face ? face.right : '';
  }

  // ---- setup --------------------------------------------------------------
  function settingsSummary(s) {
    const pts = L.zonePoints(s).join('-');
    return s.rounds + 'ラウンド ・ ゾーン ' + s.wedgeDeg + '° ・ ' + pts + '点 ・ ' +
      (s.bonusOnCenter ? '中央でカード追加' : 'カード追加なし') + ' ・ ' +
      (s.hintOnScreen ? 'ヒント表示' : 'ヒントは口頭');
  }

  renderers.setup = function renderSetup() {
    const s = app.settings;
    $('#players').value = app.players.join('\n');

    const preset = L.matchPreset(s);
    $('#presetBadge').textContent = preset ? PRESET_LABEL[preset] : 'カスタム';
    $('#presetBadge').classList.toggle('badge--custom', !preset);
    $$('[data-preset]').forEach((b) => b.classList.toggle('is-active', b.dataset.preset === preset));

    $('#rounds').value = String(s.rounds);
    $('#roundsValue').textContent = String(s.rounds);
    $('#wedgeDeg').value = String(s.wedgeDeg);
    $('#wedgeDegValue').textContent = s.wedgeDeg + '°';
    $$('[data-setting="centerPoints"]').forEach((b) => b.classList.toggle('is-active', Number(b.dataset.value) === s.centerPoints));
    $$('[data-setting="outerPoints"]').forEach((b) => b.classList.toggle('is-active', Number(b.dataset.value) === s.outerPoints));
    $('#bonusOnCenter').checked = s.bonusOnCenter;
    $('#hintOnScreen').checked = s.hintOnScreen;

    dials.preview.setTarget(90, zoneSettings(s));
    $('#settingsSummary').textContent = settingsSummary(s);

    const best = load(KEYS.best);
    const bestLine = $('#bestLine');
    if (best && typeof best.score === 'number') {
      bestLine.textContent = 'ベストスコア ' + best.score + ' 点（' + best.baseMax + ' 点満点のとき）';
      bestLine.hidden = false;
    } else {
      bestLine.hidden = true;
    }
  };

  function updateSettings(patch) {
    app.settings = L.normalizeSettings(Object.assign({}, app.settings, patch));
    save(KEYS.settings, app.settings);
    renderers.setup();
  }

  $$('[data-preset]').forEach((b) => {
    b.addEventListener('click', () => {
      app.settings = L.applyPreset(app.settings, b.dataset.preset);
      save(KEYS.settings, app.settings);
      renderers.setup();
    });
  });
  $$('input[type="range"][data-setting]').forEach((input) => {
    input.addEventListener('input', () => {
      const patch = {};
      patch[input.dataset.setting] = Number(input.value);
      updateSettings(patch);
    });
  });
  $$('button[data-setting]').forEach((b) => {
    b.addEventListener('click', () => {
      const patch = {};
      patch[b.dataset.setting] = Number(b.dataset.value);
      updateSettings(patch);
    });
  });
  $$('input[type="checkbox"][data-setting]').forEach((input) => {
    input.addEventListener('change', () => {
      const patch = {};
      patch[input.dataset.setting] = input.checked;
      updateSettings(patch);
    });
  });
  $('#players').addEventListener('input', (ev) => {
    app.players = ev.target.value.split('\n').map((p) => p.trim()).filter(Boolean);
    save(KEYS.players, app.players);
  });

  function startGame() {
    if (DECK.length === 0) {
      alert('お題カードがありません（data/prompts.js を確認してください）');
      return;
    }
    app.game = L.createGame({ deck: DECK, settings: app.settings, rng: rng, players: app.players });
    app.dialDeg = 90;
    show('handoff-psychic');
  }
  $('#startBtn').addEventListener('click', startGame);

  // ---- handoff-psychic -------------------------------------------------
  renderers['handoff-psychic'] = function () {
    const g = app.game;
    $('#hpRound').textContent = roundLabel(g);
    const who = L.currentPsychic(g);
    $('#hpWho').textContent = who ? who + ' さん' : '出題者';
  };

  // ---- psychic -------------------------------------------------------------
  renderers.psychic = function () {
    const g = app.game;
    const cur = g.current;
    $('#pRound').textContent = roundLabel(g);
    slot('aLeft').textContent = cur.card.a.left;
    slot('aRight').textContent = cur.card.a.right;
    slot('bLeft').textContent = cur.card.b.left;
    slot('bRight').textContent = cur.card.b.right;
    $$('[data-face]').forEach((b) => b.classList.toggle('is-active', b.dataset.face === cur.face));

    const hasFace = !!cur.face;
    $('#pTargetCard').hidden = !hasFace;
    if (hasFace) {
      setEnds('p', faceOf(g));
      dials.psychic.setTarget(cur.targetDeg, zoneSettings(g.settings));
    }
    $('#pHintField').hidden = !g.settings.hintOnScreen;
    $('#pHintOral').hidden = g.settings.hintOnScreen;
    $('#pHint').value = cur.hint || '';
  };

  $$('[data-face]').forEach((b) => {
    b.addEventListener('click', () => {
      app.game = L.chooseFace(app.game, b.dataset.face);
      renderers.psychic();
      persistGame();
      const card = $('#pTargetCard');
      if (card && !card.hidden) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  $('#pHint').addEventListener('input', (ev) => {
    app.game = L.setHint(app.game, ev.target.value);
    persistGame();
  });
  $('#pDoneBtn').addEventListener('click', () => {
    app.game = L.setHint(app.game, $('#pHint').value);
    app.dialDeg = 90;
    show('handoff-team');
  });

  // ---- handoff-team ----------------------------------------------------
  renderers['handoff-team'] = function () {
    $('#htRound').textContent = roundLabel(app.game);
  };

  // ---- team ----------------------------------------------------------------
  renderers.team = function () {
    const g = app.game;
    $('#tRound').textContent = roundLabel(g);
    setEnds('t', faceOf(g));
    const showHint = g.settings.hintOnScreen && g.current.hint;
    $('#tHintBox').hidden = !showHint;
    $('#tHint').textContent = g.current.hint || '';
    dials.team.setTarget(null);
    dials.team.setAngle(app.dialDeg, true);
    $('#tRange').value = String(app.dialDeg);
  };

  $('#tRange').addEventListener('input', (ev) => {
    app.dialDeg = Number(ev.target.value);
    dials.team.setAngle(app.dialDeg, true);
    persistGame();
  });
  $$('[data-nudge]').forEach((b) => {
    b.addEventListener('click', () => {
      dials.team.setAngle(app.dialDeg + Number(b.dataset.nudge));
    });
  });
  $('#tDecideBtn').addEventListener('click', () => {
    app.game = L.applyGuess(app.game, app.dialDeg);
    show('reveal');
  });

  // ---- reveal ------------------------------------------------------------
  renderers.reveal = function () {
    const g = app.game;
    const cur = g.current;
    const res = cur.result;
    $('#rRound').textContent = roundLabel(g);
    setEnds('r', faceOf(g));
    dials.reveal.setTarget(cur.targetDeg, zoneSettings(g.settings));
    dials.reveal.setAngle(res.dialDeg, true);
    dials.reveal.highlightZone(res.zoneIndex);

    $('#rPoints').textContent = String(res.points);
    $('#rLabel').textContent = res.zoneIndex === null ? 'はずれ……' : ZONE_LABEL[res.zoneIndex];
    $('#rBonus').hidden = !res.bonus;
    $('#rHint').textContent = cur.hint ? cur.hint : (g.settings.hintOnScreen ? '（未入力）' : '（口頭で伝えた）');
    $('#rTotal').textContent = g.score + ' 点';
    $('#rLeft').textContent = L.cardsRemaining(g) + ' 枚';
    $('#rNextBtn').textContent = L.cardsRemaining(g) === 0 ? '結果を見る' : '次のラウンドへ';
  };

  $('#rNextBtn').addEventListener('click', () => {
    app.game = L.nextRound(app.game, rng);
    if (app.game.finished) {
      finishGame();
    } else {
      show('handoff-psychic');
    }
  });

  // ---- result ------------------------------------------------------------
  function finishGame() {
    const g = app.game;
    const baseMax = L.baseMaxScore(g.settings);
    const best = load(KEYS.best);
    if (!best || g.score > best.score) {
      save(KEYS.best, { score: g.score, baseMax: baseMax, date: new Date().toISOString().slice(0, 10) });
    }
    show('result');
  }

  renderers.result = function () {
    const g = app.game;
    const baseMax = L.baseMaxScore(g.settings);
    const ach = L.achievement(g.score, baseMax);
    $('#fScore').textContent = String(g.score);
    $('#fMax').textContent = String(baseMax);
    $('#fMessage').textContent = ach.message;
    const bonusRounds = g.history.filter((h) => h.bonus).length;
    $('#fSub').textContent = g.history.length + ' ラウンド' +
      (bonusRounds ? '（ボーナス ' + bonusRounds + ' 回）' : '') +
      ' ・ ' + settingsSummary(g.settings);

    const list = $('#fHistory');
    list.innerHTML = '';
    g.history.forEach((h) => {
      const li = document.createElement('li');
      li.className = 'history__item';
      const face = h.card[h.face];
      const who = h.psychic ? h.psychic + ' ・ ' : '';
      li.innerHTML =
        '<span class="history__prompt"></span>' +
        '<span class="history__meta"></span>' +
        '<span class="history__points"></span>';
      li.querySelector('.history__prompt').textContent = face.left + ' ⟷ ' + face.right;
      const hintText = h.hint ? h.hint : (g.settings.hintOnScreen ? '（未入力）' : '（口頭で伝えた）');
      li.querySelector('.history__meta').textContent = who + 'ヒント: ' + hintText;
      li.querySelector('.history__points').textContent = h.points + '点' + (h.bonus ? ' +1枚' : '');
      li.classList.toggle('history__item--zero', h.points === 0);
      li.classList.toggle('history__item--center', h.zoneIndex === 2);
      list.appendChild(li);
    });
  };

  $('#fAgainBtn').addEventListener('click', startGame);
  $('#fSetupBtn').addEventListener('click', () => {
    app.game = null;
    show('setup');
  });

  // ---- 手渡し画面の「続ける」・中断 ----------------------------------------
  $$('[data-next]').forEach((b) => {
    b.addEventListener('click', () => show(b.dataset.next));
  });
  $$('[data-quit]').forEach((b) => {
    b.addEventListener('click', () => {
      if (confirm('ゲームを中断して最初の画面に戻りますか？')) {
        app.game = null;
        show('setup');
      }
    });
  });

  // ---- 起動 ----------------------------------------------------------------
  (function boot() {
    const saved = load(KEYS.game);
    if (saved && saved.game && !saved.game.finished && saved.game.current) {
      app.game = saved.game;
      app.game.settings = L.normalizeSettings(app.game.settings);
      app.dialDeg = typeof saved.dialDeg === 'number' ? saved.dialDeg : 90;
      show(saved.screen || 'handoff-psychic');
      return;
    }
    show('setup');
  })();
})();
