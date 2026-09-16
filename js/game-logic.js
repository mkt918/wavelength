/*
 * ウェーブレングス（協力モード）のルールエンジン。
 *
 * このファイルは DOM・localStorage・Math.random に依存しない純粋関数だけで構成する。
 * 乱数は必ず引数 `rng`（0 以上 1 未満を返す関数）で受け取る。テストでは固定 rng を渡す。
 * 状態は「新しいオブジェクトを返す」方式で、引数の state は書き換えない。
 *
 * 用語:
 *   card   … { a: {left, right}, b: {left, right} } 表裏2面を持つお題カード
 *   face   … 'a' | 'b'  出題者が選んだ面
 *   deg    … 0〜180 の角度。0 が左端、180 が右端
 *   zone   … ターゲットの5分割ゾーン。index 0..4、2 が中央
 */
(function (global) {
  'use strict';

  // ---- 設定 ------------------------------------------------------------

  const LIMITS = {
    rounds:       [3, 15],
    wedgeDeg:     [4, 14],
    centerPoints: [3, 4],
    outerPoints:  [1, 2],
  };

  const DEFAULT_SETTINGS = Object.freeze({
    rounds: 7,
    wedgeDeg: 7,
    centerPoints: 4,
    outerPoints: 2,
    bonusOnCenter: true,
    hintOnScreen: true,
  });

  // プリセットは hintOnScreen を含まない（表示の好みであってルールではない）
  const PRESET_KEYS = ['rounds', 'wedgeDeg', 'centerPoints', 'outerPoints', 'bonusOnCenter'];
  const PRESETS = Object.freeze({
    // 公式は対戦モードの配点（中央4点、外側から 2-3-4-3-2）に合わせる
    official: Object.freeze({ rounds: 7, wedgeDeg: 7,  centerPoints: 4, outerPoints: 2, bonusOnCenter: true }),
    easy:     Object.freeze({ rounds: 7, wedgeDeg: 10, centerPoints: 4, outerPoints: 2, bonusOnCenter: true }),
    hard:     Object.freeze({ rounds: 7, wedgeDeg: 5,  centerPoints: 3, outerPoints: 2, bonusOnCenter: false }),
  });

  function clampInt(value, range, fallback) {
    const min = range[0];
    const max = range[1];
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  /** 欠けた項目や範囲外の値を補正して、完全な settings を返す */
  function normalizeSettings(partial) {
    const p = partial || {};
    return {
      rounds:        clampInt(p.rounds,       LIMITS.rounds,       DEFAULT_SETTINGS.rounds),
      wedgeDeg:      clampInt(p.wedgeDeg,     LIMITS.wedgeDeg,     DEFAULT_SETTINGS.wedgeDeg),
      centerPoints:  clampInt(p.centerPoints, LIMITS.centerPoints, DEFAULT_SETTINGS.centerPoints),
      outerPoints:   clampInt(p.outerPoints,  LIMITS.outerPoints,  DEFAULT_SETTINGS.outerPoints),
      bonusOnCenter: p.bonusOnCenter === undefined ? DEFAULT_SETTINGS.bonusOnCenter : !!p.bonusOnCenter,
      hintOnScreen:  p.hintOnScreen  === undefined ? DEFAULT_SETTINGS.hintOnScreen  : !!p.hintOnScreen,
    };
  }

  /** settings にプリセットを適用した新しい settings を返す（hintOnScreen は保持） */
  function applyPreset(settings, presetName) {
    const preset = PRESETS[presetName];
    if (!preset) return normalizeSettings(settings);
    return normalizeSettings(Object.assign({}, settings, preset));
  }

  /** settings がどのプリセットと一致するか。一致しなければ null（＝カスタム） */
  function matchPreset(settings) {
    const s = normalizeSettings(settings);
    const names = Object.keys(PRESETS);
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      if (PRESET_KEYS.every((k) => PRESETS[name][k] === s[k])) return name;
    }
    return null;
  }

  // ---- ターゲットと得点 --------------------------------------------------

  /** 5ゾーンの点数。例: [2,3,3,3,2] */
  function zonePoints(settings) {
    const s = normalizeSettings(settings);
    return [s.outerPoints, 3, s.centerPoints, 3, s.outerPoints];
  }

  /** ターゲット全体の半幅（中央角度からの距離） */
  function halfTargetDeg(settings) {
    return normalizeSettings(settings).wedgeDeg * 2.5;
  }

  /** ターゲット中央が取りうる角度の範囲。5ゾーンすべてが 0〜180 に収まる */
  function targetRange(settings) {
    const h = halfTargetDeg(settings);
    return [h, 180 - h];
  }

  function randomTarget(settings, rng) {
    const range = targetRange(settings);
    return range[0] + rng() * (range[1] - range[0]);
  }

  /**
   * ダイヤル位置がどのゾーンに入っているか。0..4、外れは null。
   * 境界ちょうどは右側（大きい index）のゾーンに入れる。ただし右端ちょうどは index 4。
   */
  function zoneIndexFor(targetDeg, dialDeg, settings) {
    const wedge = normalizeSettings(settings).wedgeDeg;
    const rel = dialDeg - targetDeg + wedge * 2.5;   // 0 〜 wedge*5 なら命中
    const EPS = 1e-9;
    if (rel < -EPS || rel > wedge * 5 + EPS) return null;
    const idx = Math.floor((rel + EPS) / wedge);
    return Math.min(4, Math.max(0, idx));
  }

  function scoreFor(targetDeg, dialDeg, settings) {
    const zoneIndex = zoneIndexFor(targetDeg, dialDeg, settings);
    const points = zoneIndex === null ? 0 : zonePoints(settings)[zoneIndex];
    return { points: points, zoneIndex: zoneIndex };
  }

  function isCenterHit(result) {
    return !!result && result.zoneIndex === 2;
  }

  // ---- 山札 --------------------------------------------------------------

  /** Fisher–Yates。元配列は変更しない */
  function shuffle(array, rng) {
    const a = array.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  // ---- ゲーム状態 ------------------------------------------------------

  /**
   * state の形:
   * {
   *   settings, players: string[],
   *   slot:    card[]   これから使うカード（原作のカードスロット）
   *   reserve: card[]   ボーナス用の山札
   *   current: { card, face: 'a'|'b'|null, targetDeg, hint: '', result: null|{points, zoneIndex, dialDeg, bonus} } | null
   *   history: [{ card, face, hint, targetDeg, dialDeg, points, zoneIndex, bonus, psychic }]
   *   score:   number
   *   finished: boolean
   * }
   */
  function createGame(opts) {
    const deck = opts.deck;
    const rng = opts.rng;
    const s = normalizeSettings(opts.settings);
    if (!Array.isArray(deck) || deck.length === 0) {
      throw new Error('deck が空です');
    }
    const shuffled = shuffle(deck, rng);
    const rounds = Math.min(s.rounds, shuffled.length);
    const players = Array.isArray(opts.players)
      ? opts.players.filter((p) => typeof p === 'string' && p.trim()).map((p) => p.trim())
      : [];
    const state = {
      settings: s,
      players: players,
      slot: shuffled.slice(0, rounds),
      reserve: shuffled.slice(rounds),
      current: null,
      history: [],
      score: 0,
      finished: false,
    };
    return startRound(state, rng);
  }

  /** slot の先頭を current にする。slot が空なら finished */
  function startRound(state, rng) {
    if (state.slot.length === 0) {
      return Object.assign({}, state, { current: null, finished: true });
    }
    const card = state.slot[0];
    return Object.assign({}, state, {
      slot: state.slot.slice(1),
      current: {
        card: card,
        face: null,
        targetDeg: randomTarget(state.settings, rng),
        hint: '',
        result: null,
      },
      finished: false,
    });
  }

  function chooseFace(state, face) {
    if (!state.current) throw new Error('進行中のラウンドがありません');
    if (face !== 'a' && face !== 'b') throw new Error('face は a か b');
    return Object.assign({}, state, { current: Object.assign({}, state.current, { face: face }) });
  }

  function setHint(state, hint) {
    if (!state.current) throw new Error('進行中のラウンドがありません');
    return Object.assign({}, state, {
      current: Object.assign({}, state.current, { hint: String(hint || '').trim() }),
    });
  }

  /** 出題者の名前。players が空なら null。history の件数で順番にローテーションする */
  function currentPsychic(state) {
    if (!state.players.length) return null;
    return state.players[state.history.length % state.players.length];
  }

  /** ダイヤルを決定して得点を確定する。中央命中ならボーナスカードを slot に足す */
  function applyGuess(state, dialDeg) {
    const cur = state.current;
    if (!cur) throw new Error('進行中のラウンドがありません');
    if (cur.result) throw new Error('このラウンドはすでに決定済みです');
    const result = scoreFor(cur.targetDeg, dialDeg, state.settings);
    const canBonus = state.settings.bonusOnCenter && isCenterHit(result) && state.reserve.length > 0;
    const reserve = canBonus ? state.reserve.slice(1) : state.reserve;
    const slot = canBonus ? state.slot.concat([state.reserve[0]]) : state.slot;
    const entry = {
      card: cur.card,
      face: cur.face,
      hint: cur.hint,
      targetDeg: cur.targetDeg,
      dialDeg: dialDeg,
      points: result.points,
      zoneIndex: result.zoneIndex,
      bonus: canBonus,
      psychic: currentPsychic(state),
    };
    return Object.assign({}, state, {
      slot: slot,
      reserve: reserve,
      score: state.score + result.points,
      history: state.history.concat([entry]),
      current: Object.assign({}, cur, {
        result: { points: result.points, zoneIndex: result.zoneIndex, dialDeg: dialDeg, bonus: canBonus },
      }),
    });
  }

  function nextRound(state, rng) {
    if (!state.current || !state.current.result) throw new Error('決定前に次のラウンドへは進めません');
    return startRound(state, rng);
  }

  /** これから遊ぶ残りラウンド数（現在のラウンドを含まない） */
  function cardsRemaining(state) {
    return state.slot.length;
  }

  /** 総ラウンド数（ボーナス込み、進行中を含む） */
  function totalRounds(state) {
    const inProgress = state.current && !state.current.result ? 1 : 0;
    return state.history.length + state.slot.length + inProgress;
  }

  /** ボーナス無しの基準満点。達成度の判定に使う */
  function baseMaxScore(settings) {
    const s = normalizeSettings(settings);
    return s.rounds * s.centerPoints;
  }

  // ---- 達成度 ------------------------------------------------------------

  // 公式（7ラウンド×3点＝21点満点）の区分 0-3 / 4-6 / … / 22-24 / 25+ を、
  // 満点に対する割合に一般化する。閾値は「21点満点のときの上限点」。
  const ACHIEVEMENT_UPPER = [3, 6, 9, 12, 15, 18, 21, 24];
  const ACHIEVEMENTS = Object.freeze([
    { tier: 0, message: '電波、届いてる……？' },
    { tier: 1, message: 'チューニングからやり直そう' },
    { tier: 2, message: 'ノイズだらけ。でも、かすかに聞こえる' },
    { tier: 3, message: '可もなく不可もなく' },
    { tier: 4, message: 'いい線いってる！' },
    { tier: 5, message: '息が合ってきた' },
    { tier: 6, message: '同じ波長だ！' },
    { tier: 7, message: 'テレパシー級' },
    { tier: 8, message: 'もはや一心同体' },
  ]);

  function achievement(total, baseMax) {
    const max = Math.max(1, Number(baseMax) || 21);
    for (let i = 0; i < ACHIEVEMENT_UPPER.length; i++) {
      // total <= max * upper/21 を整数演算で判定
      if (total * 21 <= max * ACHIEVEMENT_UPPER[i]) return ACHIEVEMENTS[i];
    }
    return ACHIEVEMENTS[ACHIEVEMENTS.length - 1];
  }

  global.WavelengthLogic = {
    LIMITS: LIMITS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    PRESETS: PRESETS,
    PRESET_KEYS: PRESET_KEYS,
    normalizeSettings: normalizeSettings,
    applyPreset: applyPreset,
    matchPreset: matchPreset,
    zonePoints: zonePoints,
    halfTargetDeg: halfTargetDeg,
    targetRange: targetRange,
    randomTarget: randomTarget,
    zoneIndexFor: zoneIndexFor,
    scoreFor: scoreFor,
    isCenterHit: isCenterHit,
    shuffle: shuffle,
    createGame: createGame,
    chooseFace: chooseFace,
    setHint: setHint,
    currentPsychic: currentPsychic,
    applyGuess: applyGuess,
    nextRound: nextRound,
    cardsRemaining: cardsRemaining,
    totalRounds: totalRounds,
    baseMaxScore: baseMaxScore,
    ACHIEVEMENTS: ACHIEVEMENTS,
    achievement: achievement,
  };
})(typeof window !== 'undefined' ? window : globalThis);
