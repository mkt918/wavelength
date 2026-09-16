/*
 * 結果発表の演出（効果音・バイブレーション）。
 *
 * 外部音源ファイルは使わない。Web Audio API でその場に短い音を合成するので、
 * 完全オフライン・追加アセット無しで動く。iOS/Android のブラウザ自動再生制限を
 * 避けるため、AudioContext はユーザー操作（ボタンタップ）の中で初めて作る。
 *
 * すべての音・振動は必ず enabled フラグを見てから鳴らす。無効時は一切何もしない。
 */
(function (global) {
  'use strict';

  let ctx = null;
  let enabled = true;

  function ensureContext() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { ctx = null; }
    return ctx;
  }

  /** ユーザー操作の直後に呼ぶ。サスペンド状態のブラウザを起こしておく（次回の再生を確実にする） */
  function unlock() {
    const c = ensureContext();
    if (c && c.state === 'suspended') {
      c.resume().catch(() => {});
    }
  }

  /**
   * 1音を鳴らす。
   * freq: 周波数(Hz)、start: 開始オフセット(秒)、dur: 長さ(秒)、type: 波形、gain: 音量(0-1)
   */
  function tone(c, freq, start, dur, type, gain) {
    const osc = c.createOscillator();
    const amp = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const t0 = c.currentTime + start;
    const peak = gain === undefined ? 0.16 : gain;
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function playNotes(notes) {
    if (!enabled) return;
    const c = ensureContext();
    if (!c) return;
    if (c.state === 'suspended') c.resume().catch(() => {});
    notes.forEach((n) => tone(c, n.freq, n.start, n.dur, n.type, n.gain));
  }

  function vibrate(pattern) {
    if (!enabled) return;
    if (!('vibrate' in navigator)) return;
    try { navigator.vibrate(pattern); } catch (e) { /* 無視 */ }
  }

  // 音階（Hz）。明るい長調のアルペジオでまとめ、はずれ時も気まずくならない程度に留める。
  const NOTE = { C5: 523.25, E5: 659.25, G5: 783.99, A5: 880.0, C6: 1046.5, A4: 440.0, E4: 329.63, C4: 261.63, A3: 220.0 };

  /**
   * 1ラウンドの結果発表に合わせて鳴らす。
   * result: { points, zoneIndex, bonus }
   */
  function playReveal(result) {
    const zone = result.zoneIndex;
    if (zone === 2) {
      // 中央ヒット — 明るい3音の上昇アルペジオ
      playNotes([
        { freq: NOTE.C5, start: 0, dur: 0.16, gain: 0.18 },
        { freq: NOTE.E5, start: 0.09, dur: 0.16, gain: 0.18 },
        { freq: NOTE.G5, start: 0.18, dur: 0.22, gain: 0.2 },
      ]);
      if (result.bonus) {
        // ボーナス（カード追加）はさらに1音重ねる
        playNotes([{ freq: NOTE.C6, start: 0.3, dur: 0.26, gain: 0.18 }]);
        vibrate([30, 40, 30, 40, 70]);
      } else {
        vibrate([30, 40, 60]);
      }
    } else if (zone === 1 || zone === 3) {
      // 中央のとなり — 2音
      playNotes([
        { freq: NOTE.A4, start: 0, dur: 0.14, gain: 0.16 },
        { freq: NOTE.C5, start: 0.08, dur: 0.18, gain: 0.16 },
      ]);
      vibrate([25, 30, 40]);
    } else if (zone === 0 || zone === 4) {
      // 外側ゾーン — 控えめな単音
      playNotes([{ freq: NOTE.E4, start: 0, dur: 0.16, gain: 0.14 }]);
      vibrate(25);
    } else {
      // はずれ — きつくならない程度の短い下降2音のみ。振動は付けない
      playNotes([
        { freq: NOTE.C4, start: 0, dur: 0.13, gain: 0.11 },
        { freq: NOTE.A3, start: 0.09, dur: 0.16, gain: 0.1 },
      ]);
    }
  }

  /** ゲーム終了時。点数に関わらず前向きな短いファンファーレにする（低得点でも気まずくしない） */
  function playFinish() {
    playNotes([
      { freq: NOTE.C5, start: 0, dur: 0.14, gain: 0.16 },
      { freq: NOTE.E5, start: 0.1, dur: 0.14, gain: 0.16 },
      { freq: NOTE.G5, start: 0.2, dur: 0.14, gain: 0.16 },
      { freq: NOTE.C6, start: 0.3, dur: 0.32, gain: 0.2 },
    ]);
    vibrate([40, 50, 40, 50, 90]);
  }

  function setEnabled(flag) { enabled = !!flag; }
  function isEnabled() { return enabled; }

  global.WavelengthFX = { unlock, playReveal, playFinish, setEnabled, isEnabled };
})(window);
