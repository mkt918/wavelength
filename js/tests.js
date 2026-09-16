/*
 * game-logic.js の自己検証。
 * ブラウザでは tests.html から、コマンドラインでは `node js/tests.js` で走る。
 */
(function (global) {
  'use strict';

  if (typeof require === 'function' && !global.WavelengthLogic) {
    require('./game-logic.js');
  }
  const L = global.WavelengthLogic;

  // ---- 最小テストハーネス ------------------------------------------------
  const results = [];
  function test(name, fn) {
    try {
      fn();
      results.push({ name: name, ok: true });
    } catch (e) {
      results.push({ name: name, ok: false, detail: e && e.message ? e.message : String(e) });
    }
  }
  function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
  }
  function assertEqual(actual, expected, msg) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) throw new Error((msg ? msg + ': ' : '') + 'expected ' + b + ' but got ' + a);
  }
  function assertThrows(fn, msg) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    if (!threw) throw new Error(msg || 'expected to throw');
  }

  /** 決定的な擬似乱数（mulberry32） */
  function seeded(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  const constRng = (v) => () => v;

  function makeDeck(n) {
    const deck = [];
    for (let i = 0; i < n; i++) {
      deck.push({ a: { left: 'L' + i + 'a', right: 'R' + i + 'a' }, b: { left: 'L' + i + 'b', right: 'R' + i + 'b' } });
    }
    return deck;
  }

  const OFFICIAL = L.normalizeSettings(L.PRESETS.official);

  // ---- settings ------------------------------------------------------------

  test('normalizeSettings: 空なら既定値', () => {
    assertEqual(L.normalizeSettings({}), L.DEFAULT_SETTINGS);
    assertEqual(L.normalizeSettings(undefined), L.DEFAULT_SETTINGS);
  });

  test('normalizeSettings: 範囲外はクランプ、不正値は既定値', () => {
    const s = L.normalizeSettings({ rounds: 99, wedgeDeg: 1, centerPoints: 'x', outerPoints: 0, bonusOnCenter: 0 });
    assertEqual(s.rounds, 15);
    assertEqual(s.wedgeDeg, 4);
    assertEqual(s.centerPoints, 3);
    assertEqual(s.outerPoints, 1);
    assertEqual(s.bonusOnCenter, false);
    assertEqual(s.hintOnScreen, true);
  });

  test('normalizeSettings: 小数は四捨五入', () => {
    assertEqual(L.normalizeSettings({ wedgeDeg: 7.6 }).wedgeDeg, 8);
  });

  test('matchPreset: 各プリセットを識別、変更でカスタム', () => {
    assertEqual(L.matchPreset(L.PRESETS.official), 'official');
    assertEqual(L.matchPreset(L.PRESETS.easy), 'easy');
    assertEqual(L.matchPreset(L.PRESETS.hard), 'hard');
    assertEqual(L.matchPreset(Object.assign({}, L.PRESETS.official, { wedgeDeg: 8 })), null);
    // hintOnScreen はプリセット判定に関係しない
    assertEqual(L.matchPreset(Object.assign({}, L.PRESETS.official, { hintOnScreen: false })), 'official');
  });

  test('applyPreset: hintOnScreen を保持したままプリセット適用', () => {
    const s = L.applyPreset({ hintOnScreen: false, wedgeDeg: 12 }, 'hard');
    assertEqual(s.wedgeDeg, 5);
    assertEqual(s.bonusOnCenter, false);
    assertEqual(s.hintOnScreen, false);
    assertEqual(L.matchPreset(s), 'hard');
  });

  test('zonePoints: 公式は 2-3-3-3-2、かんたんは 2-3-4-3-2', () => {
    assertEqual(L.zonePoints(L.PRESETS.official), [2, 3, 3, 3, 2]);
    assertEqual(L.zonePoints(L.PRESETS.easy), [2, 3, 4, 3, 2]);
    assertEqual(L.zonePoints({ outerPoints: 1 }), [1, 3, 3, 3, 1]);
  });

  // ---- ターゲット --------------------------------------------------------

  test('targetRange: 5ゾーンが 0〜180 に収まる範囲', () => {
    assertEqual(L.targetRange({ wedgeDeg: 7 }), [17.5, 162.5]);
    assertEqual(L.targetRange({ wedgeDeg: 14 }), [35, 145]);
  });

  test('randomTarget: 1000回すべて範囲内', () => {
    const rng = seeded(1);
    for (const wedge of [4, 7, 14]) {
      const s = { wedgeDeg: wedge };
      const h = wedge * 2.5;
      for (let i = 0; i < 1000; i++) {
        const t = L.randomTarget(s, rng);
        assert(t - h >= 0 && t + h <= 180, 'wedge=' + wedge + ' target=' + t);
      }
    }
  });

  test('randomTarget: rng=0 で左端、rng≈1 で右端', () => {
    assertEqual(L.randomTarget({ wedgeDeg: 7 }, constRng(0)), 17.5);
    const t = L.randomTarget({ wedgeDeg: 7 }, constRng(0.999999));
    assert(t < 162.5 && t > 162.4, String(t));
  });

  // ---- 得点 ----------------------------------------------------------------

  test('scoreFor: 中央ちょうどは中央ゾーン', () => {
    assertEqual(L.scoreFor(90, 90, OFFICIAL), { points: 3, zoneIndex: 2 });
    assertEqual(L.scoreFor(90, 90, L.PRESETS.easy), { points: 4, zoneIndex: 2 });
  });

  test('scoreFor: 各ゾーンの中央付近', () => {
    // wedge=7: ゾーン境界は target ± 3.5, ±10.5, ±17.5
    assertEqual(L.scoreFor(90, 90 - 14, OFFICIAL).zoneIndex, 0);
    assertEqual(L.scoreFor(90, 90 - 7,  OFFICIAL).zoneIndex, 1);
    assertEqual(L.scoreFor(90, 90,      OFFICIAL).zoneIndex, 2);
    assertEqual(L.scoreFor(90, 90 + 7,  OFFICIAL).zoneIndex, 3);
    assertEqual(L.scoreFor(90, 90 + 14, OFFICIAL).zoneIndex, 4);
    assertEqual(L.scoreFor(90, 90 - 14, OFFICIAL).points, 2);
    assertEqual(L.scoreFor(90, 90 - 7,  OFFICIAL).points, 3);
  });

  test('scoreFor: 境界ちょうどは右側ゾーン、両端は命中', () => {
    assertEqual(L.scoreFor(90, 90 - 3.5, OFFICIAL).zoneIndex, 2, '中央左境界');
    assertEqual(L.scoreFor(90, 90 + 3.5, OFFICIAL).zoneIndex, 3, '中央右境界');
    assertEqual(L.scoreFor(90, 90 - 17.5, OFFICIAL).zoneIndex, 0, '左端');
    assertEqual(L.scoreFor(90, 90 + 17.5, OFFICIAL).zoneIndex, 4, '右端');
  });

  test('scoreFor: ゾーン外は 0 点・null', () => {
    assertEqual(L.scoreFor(90, 90 - 17.6, OFFICIAL), { points: 0, zoneIndex: null });
    assertEqual(L.scoreFor(90, 90 + 17.6, OFFICIAL), { points: 0, zoneIndex: null });
    assertEqual(L.scoreFor(90, 0, OFFICIAL).points, 0);
    assertEqual(L.scoreFor(90, 180, OFFICIAL).points, 0);
  });

  test('scoreFor: ターゲットが端にあるときダイヤル 0 / 180', () => {
    assertEqual(L.scoreFor(17.5, 0, OFFICIAL).zoneIndex, 0);
    assertEqual(L.scoreFor(162.5, 180, OFFICIAL).zoneIndex, 4);
  });

  test('scoreFor: wedgeDeg を変えるとゾーン幅が変わる', () => {
    assertEqual(L.scoreFor(90, 90 + 20, { wedgeDeg: 10 }).zoneIndex, 4);
    assertEqual(L.scoreFor(90, 90 + 20, { wedgeDeg: 7 }).zoneIndex, null);
  });

  test('isCenterHit', () => {
    assert(L.isCenterHit({ zoneIndex: 2 }));
    assert(!L.isCenterHit({ zoneIndex: 1 }));
    assert(!L.isCenterHit({ zoneIndex: null }));
    assert(!L.isCenterHit(null));
  });

  // ---- shuffle ---------------------------------------------------------------

  test('shuffle: 固定 rng で決定的、要素を保存、元配列を壊さない', () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = L.shuffle(src, seeded(42));
    const b = L.shuffle(src, seeded(42));
    assertEqual(a, b);
    assertEqual(a.slice().sort(), src.slice());
    assertEqual(src, [1, 2, 3, 4, 5, 6, 7, 8]);
    assert(JSON.stringify(a) !== JSON.stringify(src), 'シャッフルされていない');
  });

  // ---- ゲーム進行 ---------------------------------------------------------

  test('createGame: 7枚をスロットに、残りは予備', () => {
    const g = L.createGame({ deck: makeDeck(20), settings: OFFICIAL, rng: seeded(3) });
    assert(g.current && g.current.card, 'current が無い');
    assertEqual(g.slot.length, 6);
    assertEqual(g.reserve.length, 13);
    assertEqual(g.score, 0);
    assertEqual(g.finished, false);
    assertEqual(L.cardsRemaining(g), 6);
    assertEqual(L.totalRounds(g), 7);
    assertEqual(g.current.face, null);
    assertEqual(g.current.hint, '');
    const range = L.targetRange(OFFICIAL);
    assert(g.current.targetDeg >= range[0] && g.current.targetDeg <= range[1]);
  });

  test('createGame: デッキがラウンド数より少なければその枚数で', () => {
    const g = L.createGame({ deck: makeDeck(4), settings: OFFICIAL, rng: seeded(3) });
    assertEqual(L.totalRounds(g), 4);
    assertEqual(g.reserve.length, 0);
  });

  test('createGame: 空デッキは例外', () => {
    assertThrows(() => L.createGame({ deck: [], settings: OFFICIAL, rng: seeded(1) }));
  });

  test('createGame: プレイヤー名は trim して空を除外', () => {
    const g = L.createGame({ deck: makeDeck(10), settings: OFFICIAL, rng: seeded(3), players: [' A ', '', 'B', '  '] });
    assertEqual(g.players, ['A', 'B']);
  });

  test('chooseFace / setHint: current を更新し、元 state を変えない', () => {
    const g0 = L.createGame({ deck: makeDeck(10), settings: OFFICIAL, rng: seeded(3) });
    const g1 = L.chooseFace(g0, 'b');
    const g2 = L.setHint(g1, '  カレー  ');
    assertEqual(g0.current.face, null);
    assertEqual(g1.current.face, 'b');
    assertEqual(g2.current.hint, 'カレー');
    assertThrows(() => L.chooseFace(g0, 'c'));
  });

  test('applyGuess: 中央命中で得点 + ボーナスカード追加', () => {
    const g0 = L.createGame({ deck: makeDeck(20), settings: OFFICIAL, rng: seeded(3) });
    const g1 = L.applyGuess(g0, g0.current.targetDeg);
    assertEqual(g1.score, 3);
    assertEqual(g1.current.result.points, 3);
    assertEqual(g1.current.result.zoneIndex, 2);
    assertEqual(g1.current.result.bonus, true);
    assertEqual(g1.slot.length, 7, 'slot に 1 枚追加される');
    assertEqual(g1.reserve.length, 12);
    assertEqual(g1.history.length, 1);
    assertEqual(g1.history[0].bonus, true);
    // 元 state は不変
    assertEqual(g0.score, 0);
    assertEqual(g0.slot.length, 6);
    assertEqual(g0.history.length, 0);
  });

  test('applyGuess: 非命中は 0 点でカード枚数不変', () => {
    const g0 = L.createGame({ deck: makeDeck(20), settings: OFFICIAL, rng: seeded(3) });
    const far = g0.current.targetDeg > 90 ? 0 : 180;
    const g1 = L.applyGuess(g0, far);
    assertEqual(g1.score, 0);
    assertEqual(g1.current.result.zoneIndex, null);
    assertEqual(g1.current.result.bonus, false);
    assertEqual(g1.slot.length, 6);
    assertEqual(g1.reserve.length, 13);
  });

  test('applyGuess: 隣接ゾーンは 3 点でボーナス無し', () => {
    const g0 = L.createGame({ deck: makeDeck(20), settings: OFFICIAL, rng: seeded(3) });
    const g1 = L.applyGuess(g0, g0.current.targetDeg + 7);
    assertEqual(g1.score, 3);
    assertEqual(g1.current.result.bonus, false);
    assertEqual(g1.slot.length, 6);
  });

  test('applyGuess: bonusOnCenter=false なら中央命中でも追加しない', () => {
    const s = L.applyPreset(OFFICIAL, 'hard');
    const g0 = L.createGame({ deck: makeDeck(20), settings: s, rng: seeded(3) });
    const g1 = L.applyGuess(g0, g0.current.targetDeg);
    assertEqual(g1.score, 3);
    assertEqual(g1.current.result.bonus, false);
    assertEqual(g1.slot.length, 6);
  });

  test('applyGuess: 予備が無ければ中央命中でも追加しない', () => {
    const g0 = L.createGame({ deck: makeDeck(7), settings: OFFICIAL, rng: seeded(3) });
    assertEqual(g0.reserve.length, 0);
    const g1 = L.applyGuess(g0, g0.current.targetDeg);
    assertEqual(g1.current.result.bonus, false);
    assertEqual(g1.slot.length, 6);
  });

  test('applyGuess: 二重決定は例外', () => {
    const g0 = L.createGame({ deck: makeDeck(10), settings: OFFICIAL, rng: seeded(3) });
    const g1 = L.applyGuess(g0, 90);
    assertThrows(() => L.applyGuess(g1, 90));
  });

  test('nextRound: 決定前は例外、決定後は次カードへ', () => {
    const g0 = L.createGame({ deck: makeDeck(10), settings: OFFICIAL, rng: seeded(3) });
    assertThrows(() => L.nextRound(g0, seeded(1)));
    const g1 = L.applyGuess(g0, 0);
    const g2 = L.nextRound(g1, seeded(1));
    assertEqual(g2.slot.length, 5);
    assertEqual(g2.current.result, null);
    assertEqual(g2.current.face, null);
    assert(g2.current.card !== g1.current.card, '同じカードが続いた');
  });

  test('通しプレイ: 全外しで 7 ラウンド後に finished', () => {
    let g = L.createGame({ deck: makeDeck(20), settings: OFFICIAL, rng: seeded(5) });
    let rounds = 0;
    while (!g.finished) {
      const far = g.current.targetDeg > 90 ? 0 : 180;
      g = L.applyGuess(g, far);
      rounds++;
      g = L.nextRound(g, seeded(rounds));
    }
    assertEqual(rounds, 7);
    assertEqual(g.score, 0);
    assertEqual(g.current, null);
    assertEqual(g.history.length, 7);
    assertEqual(L.totalRounds(g), 7);
  });

  test('通しプレイ: 全中央命中で 7 + ボーナスが予備の限りで続く', () => {
    // 予備 3 枚 → 7 + 3 = 10 ラウンド、得点 30
    let g = L.createGame({ deck: makeDeck(10), settings: OFFICIAL, rng: seeded(5) });
    let rounds = 0;
    while (!g.finished) {
      g = L.applyGuess(g, g.current.targetDeg);
      rounds++;
      g = L.nextRound(g, seeded(rounds));
    }
    assertEqual(rounds, 10);
    assertEqual(g.score, 30);
    assertEqual(g.history.filter((h) => h.bonus).length, 3);
    assertEqual(L.totalRounds(g), 10);
  });

  test('currentPsychic: 名前をラウンドごとにローテーション', () => {
    let g = L.createGame({ deck: makeDeck(10), settings: OFFICIAL, rng: seeded(3), players: ['A', 'B', 'C'] });
    assertEqual(L.currentPsychic(g), 'A');
    g = L.nextRound(L.applyGuess(g, 0), seeded(1));
    assertEqual(L.currentPsychic(g), 'B');
    g = L.nextRound(L.applyGuess(g, 0), seeded(1));
    assertEqual(L.currentPsychic(g), 'C');
    g = L.nextRound(L.applyGuess(g, 0), seeded(1));
    assertEqual(L.currentPsychic(g), 'A');
    assertEqual(g.history[1].psychic, 'B');
  });

  test('currentPsychic: 名前なしは null', () => {
    const g = L.createGame({ deck: makeDeck(10), settings: OFFICIAL, rng: seeded(3) });
    assertEqual(L.currentPsychic(g), null);
  });

  // ---- 達成度 ----------------------------------------------------------------

  test('baseMaxScore', () => {
    assertEqual(L.baseMaxScore(OFFICIAL), 21);
    assertEqual(L.baseMaxScore(L.PRESETS.easy), 28);
    assertEqual(L.baseMaxScore({ rounds: 10, centerPoints: 4 }), 40);
  });

  test('achievement: 公式 21 点満点で公式区分と一致', () => {
    const tiers = (n) => L.achievement(n, 21).tier;
    assertEqual([tiers(0), tiers(3)], [0, 0]);
    assertEqual([tiers(4), tiers(6)], [1, 1]);
    assertEqual([tiers(7), tiers(9)], [2, 2]);
    assertEqual([tiers(10), tiers(12)], [3, 3]);
    assertEqual([tiers(13), tiers(15)], [4, 4]);
    assertEqual([tiers(16), tiers(18)], [5, 5]);
    assertEqual([tiers(19), tiers(21)], [6, 6]);
    assertEqual([tiers(22), tiers(24)], [7, 7]);
    assertEqual([tiers(25), tiers(40)], [8, 8]);
  });

  test('achievement: 満点が変わっても割合で判定', () => {
    // 42 点満点なら閾値は 2 倍
    assertEqual(L.achievement(6, 42).tier, 0);
    assertEqual(L.achievement(7, 42).tier, 1);
    assertEqual(L.achievement(42, 42).tier, 6);
    assertEqual(L.achievement(50, 42).tier, 8);
    assert(typeof L.achievement(0, 21).message === 'string');
  });

  // ---- 出力 --------------------------------------------------------------

  global.WavelengthTestResults = results;
  if (typeof module !== 'undefined' && module.exports) {
    const failed = results.filter((r) => !r.ok);
    results.forEach((r) => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '\n      ' + r.detail)));
    console.log('\n' + (results.length - failed.length) + ' / ' + results.length + ' passed');
    if (failed.length) process.exitCode = 1;
  }
})(typeof window !== 'undefined' ? window : globalThis);
