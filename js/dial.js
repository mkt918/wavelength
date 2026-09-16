/*
 * 半円ダイヤルの SVG 描画と操作。
 *
 * 角度は game-logic と同じ 0〜180（0 = 左端、90 = 真上、180 = 右端）。
 * ゲームルールは一切持たない。ゾーンの幅と点数は呼び出し側が settings で渡す。
 *
 * 使い方:
 *   const dial = Dial.create(containerEl, { interactive: true, onChange: (deg) => {} });
 *   dial.setAngle(90);
 *   dial.setTarget(120, settings);   // ゾーンを表示。null で非表示
 *   dial.highlightZone(2);           // 公開時に命中ゾーンを強調
 */
(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const VB_W = 400;
  const VB_H = 232;
  const CX = 200;
  const CY = 206;
  const R = 186;          // 外周
  const R_INNER = 30;     // ハブ
  const R_HANDLE = 22;    // 針先のつまみ

  function el(name, attrs, parent) {
    const node = document.createElementNS(NS, name);
    if (attrs) {
      Object.keys(attrs).forEach((k) => node.setAttribute(k, attrs[k]));
    }
    if (parent) parent.appendChild(node);
    return node;
  }

  /** 角度 → 外周上の座標（半径 r） */
  function point(deg, r) {
    const rad = (deg * Math.PI) / 180;
    return { x: CX - r * Math.cos(rad), y: CY - r * Math.sin(rad) };
  }

  /** ハブから外周までの扇形パス */
  function wedgePath(a1, a2, rOuter, rInner) {
    const p1 = point(a1, rOuter);
    const p2 = point(a2, rOuter);
    const q1 = point(a2, rInner);
    const q2 = point(a1, rInner);
    return [
      'M', p1.x, p1.y,
      'A', rOuter, rOuter, 0, 0, 1, p2.x, p2.y,
      'L', q1.x, q1.y,
      'A', rInner, rInner, 0, 0, 0, q2.x, q2.y,
      'Z',
    ].join(' ');
  }

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function create(container, opts) {
    const options = Object.assign(
      { interactive: false, onChange: null, zonePoints: [2, 3, 3, 3, 2], ariaLabel: 'ダイヤル' },
      opts || {}
    );
    let angle = 90;
    let interactive = !!options.interactive;
    let targetDeg = null;
    let wedge = 7;
    let zonePoints = options.zonePoints;
    let highlighted = null;

    const svg = el('svg', {
      viewBox: '0 0 ' + VB_W + ' ' + VB_H,
      class: 'dial__svg',
      role: 'img',
      'aria-label': options.ariaLabel,
    }, null);

    // 背景の半円
    el('path', { class: 'dial__bg', d: wedgePath(0, 180, R, R_INNER) }, svg);

    // 目盛り
    const ticks = el('g', { class: 'dial__ticks' }, svg);
    for (let d = 0; d <= 180; d += 10) {
      const major = d % 30 === 0;
      const p1 = point(d, R);
      const p2 = point(d, R - (major ? 14 : 7));
      el('line', {
        class: major ? 'dial__tick dial__tick--major' : 'dial__tick',
        x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
      }, ticks);
    }

    // ターゲットゾーン（5枚）
    const zones = el('g', { class: 'dial__zones' }, svg);
    const zonePaths = [];
    const zoneLabels = [];
    for (let i = 0; i < 5; i++) {
      zonePaths.push(el('path', { class: 'dial__zone', 'data-zone': String(i) }, zones));
    }
    for (let i = 0; i < 5; i++) {
      zoneLabels.push(el('text', { class: 'dial__zonelabel', 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, zones));
    }
    zones.setAttribute('visibility', 'hidden');

    // 針
    const needle = el('g', { class: 'dial__needle' }, svg);
    el('line', { class: 'dial__needleline', x1: CX, y1: CY, x2: CX, y2: CY - R + 6 }, needle);
    el('circle', { class: 'dial__handle', cx: CX, cy: CY - R + 6, r: R_HANDLE }, needle);
    el('circle', { class: 'dial__hub', cx: CX, cy: CY, r: R_INNER - 6 }, svg);

    container.innerHTML = '';
    container.appendChild(svg);

    function renderNeedle() {
      needle.setAttribute('transform', 'rotate(' + (angle - 90) + ' ' + CX + ' ' + CY + ')');
      // 操作可能なときは常に現在値をスクリーンリーダーに伝える（silent な更新でも）
      if (interactive) svg.setAttribute('aria-valuenow', String(Math.round(angle)));
    }

    function renderZones() {
      if (targetDeg === null) {
        zones.setAttribute('visibility', 'hidden');
        return;
      }
      zones.removeAttribute('visibility');
      const start = targetDeg - wedge * 2.5;
      for (let i = 0; i < 5; i++) {
        const a1 = start + wedge * i;
        const a2 = a1 + wedge;
        zonePaths[i].setAttribute('d', wedgePath(a1, a2, R - 2, R_INNER + 4));
        zonePaths[i].classList.toggle('dial__zone--center', i === 2);
        zonePaths[i].classList.toggle('dial__zone--near', i === 1 || i === 3);
        zonePaths[i].classList.toggle('dial__zone--outer', i === 0 || i === 4);
        zonePaths[i].classList.toggle('dial__zone--hit', highlighted === i);
        zonePaths[i].classList.toggle('dial__zone--dim', highlighted !== null && highlighted !== i);
        const mid = point(a1 + wedge / 2, R * 0.66);
        zoneLabels[i].setAttribute('x', mid.x);
        zoneLabels[i].setAttribute('y', mid.y);
        zoneLabels[i].textContent = String(zonePoints[i]);
        zoneLabels[i].classList.toggle('dial__zonelabel--center', i === 2);
        // 幅が狭いときは数字を隠す（重なるため）
        zoneLabels[i].setAttribute('visibility', wedge >= 6 ? 'visible' : 'hidden');
      }
    }

    function setAngle(deg, silent) {
      const next = clamp(Number(deg), 0, 180);
      if (!Number.isFinite(next)) return;
      angle = next;
      renderNeedle();
      if (!silent && typeof options.onChange === 'function') options.onChange(angle);
    }

    // ---- ポインタ操作 ----
    let dragging = false;
    const pt = svg.createSVGPoint();

    function angleFromEvent(ev) {
      pt.x = ev.clientX;
      pt.y = ev.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return angle;
      const p = pt.matrixTransform(ctm.inverse());
      const dx = p.x - CX;
      const dy = CY - p.y;   // 上向きを正に
      if (dy < 0) return dx < 0 ? 0 : 180;
      const math = (Math.atan2(dy, dx) * 180) / Math.PI;   // 右 0 → 上 90 → 左 180
      return clamp(180 - math, 0, 180);
    }

    svg.addEventListener('pointerdown', (ev) => {
      if (!interactive) return;
      dragging = true;
      svg.setPointerCapture(ev.pointerId);
      svg.classList.add('dial__svg--dragging');
      setAngle(angleFromEvent(ev));
      ev.preventDefault();
    });
    svg.addEventListener('pointermove', (ev) => {
      if (!dragging) return;
      setAngle(angleFromEvent(ev));
      ev.preventDefault();
    });
    function endDrag(ev) {
      if (!dragging) return;
      dragging = false;
      svg.classList.remove('dial__svg--dragging');
      try { svg.releasePointerCapture(ev.pointerId); } catch (e) { /* 既に解放済み */ }
    }
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);

    // キーボード操作（フォーカス可能なとき）
    svg.addEventListener('keydown', (ev) => {
      if (!interactive) return;
      const step = ev.shiftKey ? 5 : 1;
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') { setAngle(angle - step); ev.preventDefault(); }
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') { setAngle(angle + step); ev.preventDefault(); }
    });

    function setInteractive(flag) {
      interactive = !!flag;
      svg.classList.toggle('dial__svg--interactive', interactive);
      if (interactive) {
        svg.setAttribute('tabindex', '0');
        svg.setAttribute('role', 'slider');
        svg.setAttribute('aria-valuemin', '0');
        svg.setAttribute('aria-valuemax', '180');
      } else {
        svg.removeAttribute('tabindex');
        svg.setAttribute('role', 'img');
      }
    }

    function setTarget(deg, settings) {
      targetDeg = deg === null || deg === undefined ? null : Number(deg);
      if (settings) {
        wedge = Number(settings.wedgeDeg) || wedge;
        if (Array.isArray(settings.zonePoints)) zonePoints = settings.zonePoints;
      }
      renderZones();
    }

    function highlightZone(idx) {
      highlighted = idx === null || idx === undefined ? null : idx;
      renderZones();
    }

    function setNeedleVisible(flag) {
      needle.setAttribute('visibility', flag ? 'visible' : 'hidden');
    }

    setInteractive(interactive);
    renderNeedle();
    renderZones();

    return {
      el: svg,
      setAngle: setAngle,
      getAngle: () => angle,
      setInteractive: setInteractive,
      setTarget: setTarget,
      highlightZone: highlightZone,
      setNeedleVisible: setNeedleVisible,
    };
  }

  global.Dial = { create: create };
})(window);
