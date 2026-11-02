// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// User interface: the work area (reference sheet, opcode table, debugger), the computer with its
// display and keyboard, and the side panel. The emulation runs in real time from
// requestAnimationFrame; the ROMs and the demo programs come from globalThis.WOLF80_ASSETS. What
// differs between the boards comes from their profiles (src/board/profiles.js) and BOARD_UI.

import { BOARD_PROFILES, programFits } from '../board/profiles.js';
import { PMI80_TAPE_MAX_BLOCKS, pmi80TapeBlocks, pmi80TapeWav } from '../board/pmi80-tape.js';
import { I8080_OPCODES, disassemble } from '../core/i8080-disasm.js';
import { Z80_OPCODES, Z80_MAIN_OPCODES, disassembleZ80 } from '../core/z80-disasm.js';
import { Glow } from '../machine/display.js';
import { blockRanges, parseIntelHex, parsePlainHex, toIntelHex } from '../machine/memfile.js';
import { startProgram } from '../machine/programs.js';
import { AudioOut } from './audio.js';
import { uiText } from './i18n.js';

// Labels of the keys of the PMI-80 layout on each board (the key names are the PMI-80's), the
// labels above the keys (the register pairs of the R command), and the texts that differ.
const PMI_LABEL_ABOVE = { D: 'DE', 8: 'SP', 9: 'HL', A: 'AF', B: 'BC' };
const BOARD_UI = {
  pmi80: {
    labels: {}, labelAbove: PMI_LABEL_ABOVE, monitors: { factory: 'board.pmiMonitor', pmi80c: 'board.pmiCMonitor' }, clock: 'board.pmiClock',
    soundOut: 'K3', soundTip: 'sound.tip', keysHelp: 'keys.helpHtml', runText: 'prog.runPmi', file: 'pmi80',
  },
  savia84: {
    labels: { RE: 'Reset', EX: 'Ex', R: 'Reg', BR: 'Br', M: 'Ad', S: '–S', '=': 'dA', I: '' },
    labelAbove: {}, monitors: { factory: 'board.saviaMonitor' }, clock: 'board.saviaClock',
    soundOut: 'PA7', soundTip: 'sound.tipSavia', keysHelp: 'keys.helpSaviaHtml', runText: 'prog.runSavia', file: 'savia84',
  },
  stone1: {
    // the register pairs above the keys belong to the R command of the PMI-80 monitor, so only to STONE-PMI
    labels: {}, labelAbove: {}, labelAboveFw: { 'stone-pmi': PMI_LABEL_ABOVE }, monitors: { stone1: 'board.stone1Monitor', 'stone-pmi': 'board.stoneMonitor' },
    clock: 'board.stoneClock', soundOut: 'PA7', soundTip: 'sound.tipStone', keysHelp: 'keys.helpHtml', runText: 'prog.runPmi', file: 'stone1',
  },
};

function startApp() {
  const assets = globalThis.WOLF80_ASSETS;
  const fromBase64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const ROMS = Object.fromEntries(Object.entries(assets.roms).map(([id, data]) => [id, fromBase64(data)]));
  const PROGRAMS = assets.programs.map(p => ({ ...p, bytes: fromBase64(p.data) }));
  const MAX_FRAME_MS = 100;                       // longer gaps are not caught up
  const $ = id => document.getElementById(id);
  const license = $('licenseGpl');           // embedded by tools/build.mjs
  if (license) $('licGplText').textContent = license.textContent.trim();
  // the download of the offline version is offered only on the web, not in the offline HTML or the EXE
  if (/^https?:$/.test(location.protocol) && !globalThis.wolf80Host) $('offlineRow').hidden = false;
  const h4 = v => v.toString(16).toUpperCase().padStart(4, '0');
  const h2 = v => v.toString(16).toUpperCase().padStart(2, '0');

  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else e.setAttribute(k, v);
    }
    for (const c of [].concat(children)) e.append(c);
    return e;
  }

  // ---------- language ----------
  // The choice made with the switch is remembered per browser; before any choice, a browser set to
  // Czech or Slovak gets Czech and any other English. Elements name their texts with data-i18n*
  // attributes (src/ui/i18n.js), applyLang() fills them in.
  let lang = /^(cs|sk)\b/i.test(navigator.languages?.[0] ?? navigator.language ?? '') ? 'cs' : 'en';
  try { const stored = localStorage.getItem('wolf80-lang'); if (stored === 'cs' || stored === 'en') lang = stored; } catch { /* storage blocked */ }
  const t = (key, params) => uiText(lang, key, params);
  const VERSION = document.querySelector('meta[name="wolf80-version"]')?.content ?? '';

  // ---------- board, machine and real-time loop ----------
  // The board chosen last is remembered per browser; ?board=savia84 in the address picks one
  // for this visit only (for checks).
  const store = (key, value) => { try { localStorage.setItem(key, value); } catch { /* storage blocked */ } };
  const stored = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const fromQuery = new URLSearchParams(location.search).get('board');
  let boardId = BOARD_PROFILES[fromQuery] ? fromQuery : BOARD_PROFILES[stored('wolf80-board')] ? stored('wolf80-board') : 'pmi80';
  let profile = BOARD_PROFILES[boardId];
  let ui = BOARD_UI[boardId];
  // the firmware chosen last for each board, remembered per browser; the first one by default
  const pickFirmware = () => profile.firmware.find(f => f.id === stored(`wolf80-firmware-${boardId}`)) ?? profile.firmware[0];
  let firmware = pickFirmware();
  let statesPerMs = profile.clockHz / 1000;
  // shortest key press the firmware sees: 50 ms, or longer for a debouncing firmware
  const minHold = () => Math.round(Math.max(50, firmware.holdMs) * statesPerMs);
  let MIN_HOLD = minHold();
  // Savia-84 options: eight digits as in the book unless nine are chosen, the keys as on the board
  let eightDigits = stored('wolf80-savia-digits') !== '9';
  let keyLayout = stored('wolf80-savia-layout') === 'board' ? 'board' : 'pmi';

  const audio = new AudioOut(profile.clockHz);
  let machine = firmware.create(ROMS);
  let running = true;
  let lastNow = performance.now();
  const heldSince = new Map();      // key -> machine time of the press
  const pendingRelease = new Map(); // key -> machine time when the release takes effect

  function advance(states) {
    const end = machine.cycles + states;
    for (;;) {
      let next = end, key = null;
      for (const [k, t] of pendingRelease) if (t < next) { next = t; key = k; }
      if (next > machine.cycles) machine.run(next - machine.cycles);
      if (key === null) break;
      machine.releaseKey(key);
      pendingRelease.delete(key);
    }
  }

  function press(name) {
    if (heldSince.has(name)) return;
    pendingRelease.delete(name);
    machine.pressKey(name);
    heldSince.set(name, machine.cycles);
    keyEl(name)?.classList.add('down');
  }

  function release(name) {
    if (!heldSince.has(name)) return;
    const at = heldSince.get(name) + MIN_HOLD;
    heldSince.delete(name);
    keyEl(name)?.classList.remove('down');
    if (at <= machine.cycles) machine.releaseKey(name);
    else pendingRelease.set(name, at);
  }

  function releaseAll() {
    for (const k of [...heldSince.keys()]) release(k);
  }

  function newMachine() {
    releaseAll();
    pendingRelease.clear();
    machine = firmware.create(ROMS);
    glow.reset(); // the new machine's first frame shows its true brightness at once
    audio.reset();
  }

  // A hidden page (minimised window, another tab) gets no animation frames, and its timers are
  // throttled to about once a second. By default the emulation keeps running, ticked by a
  // worker (its timer is not throttled) with sound; set PAUSE_WHEN_HIDDEN to stop it instead.
  const PAUSE_WHEN_HIDDEN = false;
  const MAX_HIDDEN_MS = 2000;
  const HIDDEN_TICK_MS = 40;
  const HIDDEN_AUDIO_AHEAD_S = 0.3; // a deeper sound queue rides out a late tick

  function frame(now) {
    const dt = Math.min(now - lastNow, MAX_FRAME_MS);
    lastNow = now;
    if (running) advance(Math.round(dt * statesPerMs));
    audio.push(machine.takeAudio()); // every frame, so edges never pile up while muted
    renderDisplay();
    if (now - lastSlow > 120) {
      lastSlow = now;
      renderStatus();
      if (activeTab === 'ladeni') renderDebug();
    }
    requestAnimationFrame(frame);
  }
  let lastSlow = 0;

  function hiddenTick() {
    if (!document.hidden) return; // visible: requestAnimationFrame drives the machine
    const now = performance.now();
    const dt = Math.min(now - lastNow, MAX_HIDDEN_MS);
    lastNow = now;
    if (running) advance(Math.round(dt * statesPerMs));
    audio.push(machine.takeAudio(), HIDDEN_AUDIO_AHEAD_S);
  }

  if (!PAUSE_WHEN_HIDDEN) {
    let ticker = null;
    try { // a worker's timer is exempt from the background throttling of page timers
      const src = `setInterval(() => postMessage(0), ${HIDDEN_TICK_MS});`;
      ticker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      ticker.onmessage = hiddenTick;
    } catch { /* no workers (e.g. a restrictive file:// policy) */ }
    if (!ticker) setInterval(hiddenTick, HIDDEN_TICK_MS);
  }

  // ---------- display ----------
  // One digit: 60 x 100 units, segments a-g, slanted like the real digits.
  const SEGMENTS = [
    '14,5 46,5 50,9 44,15 16,15 10,9',   // a
    '51,11 55,15 55,46 51,50 45,44 45,17', // b
    '51,52 55,56 55,87 51,91 45,85 45,58', // c
    '10,93 16,87 44,87 50,93 46,97 14,97', // d
    '9,52 15,58 15,85 9,91 5,87 5,56',    // e
    '9,11 15,17 15,44 9,50 5,46 5,15',    // f
    '10,51 16,46 44,46 50,51 44,56 16,56', // g
  ];
  const NS = 'http://www.w3.org/2000/svg';
  const DIGITS = 9; // every board has nine digit positions
  const segEls = [];
  const digitEls = [];
  for (let d = 0; d < DIGITS; d++) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 64 100');
    svg.setAttribute('overflow', 'visible'); // let the glow spread past the digit's box
    const skew = 'translate(8 0) skewX(-6)';
    const off = document.createElementNS(NS, 'g');
    const on = document.createElementNS(NS, 'g');
    off.setAttribute('transform', skew);
    on.setAttribute('transform', skew);
    on.setAttribute('class', 'lit');
    const lits = [];
    for (const pts of SEGMENTS) {
      const ghost = document.createElementNS(NS, 'polygon');
      ghost.setAttribute('points', pts);
      ghost.setAttribute('class', 'ghost');
      const lit = document.createElementNS(NS, 'polygon');
      lit.setAttribute('points', pts);
      lit.setAttribute('class', 'seg');
      lit.style.opacity = '0';
      off.append(ghost);
      on.append(lit);
      lits.push(lit);
    }
    svg.append(off, on);
    $('display').append(svg);
    segEls.push(lits);
    digitEls.push(svg);
  }
  // The Savia-84 built as in the book has no digit on output 1 of its 74145; the other eight
  // close up in the middle of the same frame.
  function showDigits() {
    digitEls.forEach((svg, d) => { svg.style.display = d === profile.missingDigit && eightDigits ? 'none' : ''; });
  }
  // Lit share smoothed over 30 ms of simulated time, like the eye (and SFMT's GLOW_MS), so
  // software PWM does not beat against the screen's frame rate.
  const GLOW_MS = 30;
  let glow = new Glow(DIGITS * 8, GLOW_MS * statesPerMs);
  // A digit of the factory monitor is lit about 5.9 % of the time; REF is the share that
  // counts as full brightness, so brighter-than-usual digits (longer on-time) still show.
  const REF = 0.09;
  function renderDisplay() {
    const f = machine.display.takeFrame(machine.cycles);
    if (f.duration <= 0) return; // paused: the picture is held
    const level = glow.update(f, machine.cycles);
    for (let d = 0; d < DIGITS; d++) {
      for (let s = 0; s < 7; s++) {
        const o = Math.sqrt(Math.min(1, level[d * 8 + s] / REF));
        segEls[d][s].style.opacity = (o < 0.02 ? 0 : o).toFixed(3);
      }
    }
  }

  // ---------- layout and fitting the computer into the window ----------
  // Three layouts, chosen by the window size (like SFMT, not by detecting a phone):
  //  - wide: work area | computer | side panel; the page never scrolls, only the panels do;
  //  - compact (narrower than 900 px or lower than 500 px): the side panel becomes the first tab
  //    of the work area ("Controls") and the whole page scrolls, either
  //    - stack (portrait): the computer on top, the work area under it, or
  //    - beside (landscape): the computer on the left, the work area on the right.
  const COMPACT = matchMedia('(max-width: 899px), (max-height: 499px)');
  const PORTRAIT = matchMedia('(orientation: portrait)');
  let layout = '';
  let lastTab = 'tahak'; // the tab to return to when the Controls tab disappears
  function setLayout() {
    const next = !COMPACT.matches ? 'wide' : PORTRAIT.matches ? 'stack' : 'beside';
    if (next === layout) return;
    const was = layout;
    layout = next;
    const root = document.documentElement;
    root.classList.toggle('compact', next !== 'wide');
    root.classList.toggle('stack', next === 'stack');
    root.classList.toggle('beside', next === 'beside');
    if (next === 'wide') {
      $('stage').after($('side'));
      if (activeTab === 'ovladani') showTab(lastTab);
    } else if (was === 'wide' || !was) {
      $('tab-ovladani').append($('side'));
    }
  }

  // The height of the window with the browser's toolbars shown (100svh), so that a phone hiding
  // its address bar while scrolling does not resize the computer under the finger.
  const viewProbe = el('div', { class: 'view-probe', 'aria-hidden': 'true' });
  document.body.append(viewProbe);
  const viewHeight = () => viewProbe.offsetHeight || innerHeight;

  // The case is drawn at a fixed design size and scaled as a whole, at most 1.2x:
  //  - wide: as large as the window height allows, but never so wide that the work area gets
  //    narrower than WORK_MIN or the page would need a horizontal scroll bar;
  //  - stack: the whole computer fits the window width and height;
  //  - beside: the whole computer fits the window height; when that would make the keys too
  //    small (a phone on its side), only the part from the display down fits it, and the
  //    computer sticks to the top of the window with the display at the top edge once the page
  //    is scrolled down to it. (Fitting only down to the keyboard would make it larger, but at
  //    the end of a short page the case's bottom edge would push the display out of view.)
  const WORK_MIN = 320;
  const BESIDE_MIN = 0.6;
  function fitCase() {
    setLayout();
    // offsetWidth/offsetHeight/offsetTop ignore the scale, so the case is measured as it stands:
    // switching the transform off for a moment would let the full-size case overflow a phone's
    // page, and the browser would throw the scroll position back to the top
    const stage = $('stage'), box = $('case');
    const w = box.offsetWidth, h = box.offsetHeight + box.offsetTop;
    const app = $('app');
    const cs = getComputedStyle(app);
    const gap = parseFloat(cs.columnGap) || 0;
    const padH = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const innerW = app.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    let s, top = '';
    if (layout === 'wide') {
      s = Math.min((app.clientHeight - padH) / h, (innerW - $('side').offsetWidth - 2 * gap - WORK_MIN) / w);
    } else if (layout === 'stack') {
      s = Math.min((viewHeight() - padH) / h, innerW / w);
    } else {
      const availH = viewHeight() - padH, availW = (innerW - gap - WORK_MIN) / w;
      s = Math.min(availH / h, availW);
      if (s < BESIDE_MIN) {
        const gapTop = parseFloat(cs.paddingTop) / 2;
        const from = $('display').offsetTop + box.clientTop; // from the top edge of the case
        s = Math.min((viewHeight() - gapTop - parseFloat(cs.paddingBottom)) / (box.offsetHeight - from), availW);
        top = `${Math.round(gapTop - box.offsetTop - from * s)}px`;
      }
    }
    s = Math.max(0.3, Math.min(1.2, s));
    box.style.transform = `scale(${s})`;
    stage.style.width = `${Math.floor(w * s)}px`;
    stage.style.height = `${Math.floor(h * s)}px`;
    stage.style.top = top;
  }
  window.addEventListener('resize', fitCase);

  // ---------- keyboard on screen ----------
  // The PMI-80 layout on every board, with the board's labels; the Savia-84 can also have the
  // arrangement of its own board. A key the board does not have stays as a blank cap.
  const FN = new Set(['RE', 'I', 'EX', 'R', 'BR', 'M', 'L', 'S', '=']);
  const keyEls = new Map();
  const keyEl = name => keyEls.get(name);
  function buildKeyboard() {
    const kb = $('keyboard');
    kb.replaceChildren();
    keyEls.clear();
    const own = keyLayout === 'board' && profile.layouts.board;
    kb.classList.toggle('board-layout', !!own);
    for (const row of own || profile.layouts.pmi) {
      for (const name of row) {
        const label = ui.labels[name] ?? name;
        if (profile.noKeys.includes(name)) {
          kb.append(el('div', { class: 'kcell' }, [el('span', { class: 'lab' }), el('span', { class: 'key fn blank', 'aria-hidden': 'true' })]));
          continue;
        }
        const b = el('button', { type: 'button', class: 'key' + (FN.has(name) ? ' fn' : '') + (label.length > 3 ? ' long' : ''), text: label, 'aria-label': label });
        b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); press(name); });
        b.addEventListener('pointerup', () => release(name));
        b.addEventListener('pointercancel', () => release(name));
        b.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') e.stopPropagation(); });
        keyEls.set(name, b);
        const above = ui.labelAboveFw?.[firmware.id] ?? ui.labelAbove;
        kb.append(el('div', { class: 'kcell' }, [el('span', { class: 'lab', text: own ? '' : above[name] || '' }), b]));
      }
    }
    if (own) drawPlainFrame(); else drawKeyboardFrame();
  }

  // Outline of the grey keyboard panel after the real one (it comes from a calculator): sharp top
  // corners, five notches on each side with their own pitch of about 1.2 key rows (the first above
  // the top row, the last at the lower part of the bottom row), rounded bottom corners and a
  // square tab at the bottom from the middle of key 1 to the middle of key 3. Measured on photos.
  function drawKeyboardFrame() {
    const kb = $('keyboard');
    const W = kb.offsetWidth - 1, H = kb.offsetHeight - 1; // the 2 px stroke stays inside
    const top0 = keyEl('RE').offsetTop, pitch = keyEl('C').offsetTop - top0;
    const mid = name => keyEl(name).offsetLeft + keyEl(name).offsetWidth / 2;
    const NOTCH_DEPTH = 5, NOTCH_HALF = 6, R = 12, TAB = 9;
    const ys = [0, 1, 2, 3, 4].map(i => Math.round(top0 + pitch * (1.2 * i - 0.23)));
    let d = `M1,1 H${W}`;
    for (const y of ys) d += ` V${y - NOTCH_HALF} H${W - NOTCH_DEPTH} V${y + NOTCH_HALF} H${W}`;
    d += ` V${H - R} A${R},${R} 0 0 1 ${W - R},${H} H${mid('3')} V${H + TAB} H${mid('1')} V${H} H${1 + R} A${R},${R} 0 0 1 1,${H - R}`;
    for (const y of [...ys].reverse()) d += ` V${y + NOTCH_HALF} H${1 + NOTCH_DEPTH} V${y - NOTCH_HALF} H1`;
    framePath(kb, W, H, d + ' Z');
  }

  // The Savia's own arrangement sits on a plain panel with rounded corners.
  function drawPlainFrame() {
    const kb = $('keyboard');
    const W = kb.offsetWidth - 1, H = kb.offsetHeight - 1, R = 10;
    framePath(kb, W, H, `M${1 + R},1 H${W - R} A${R},${R} 0 0 1 ${W},${1 + R} V${H - R} A${R},${R} 0 0 1 ${W - R},${H}` +
      ` H${1 + R} A${R},${R} 0 0 1 1,${H - R} V${1 + R} A${R},${R} 0 0 1 ${1 + R},1 Z`);
  }

  function framePath(kb, W, H, d) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'kbd-frame');
    svg.setAttribute('width', W + 1);
    svg.setAttribute('height', H + 1);
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
    kb.prepend(svg);
  }

  // ---------- PC keyboard ----------
  const PC_KEYS = { Enter: '=', '=': '=', m: 'M', x: 'EX', r: 'R', p: 'BR', l: 'L', s: 'S', i: 'I', Escape: 'RE' };
  function mapKey(e) {
    if (/^[0-9]$/.test(e.key)) return e.key;
    if (/^[a-fA-F]$/.test(e.key)) return e.key.toUpperCase();
    const k = PC_KEYS[e.key] || PC_KEYS[e.key.toLowerCase()] || null;
    return profile.noKeys.includes(k) ? null : k;
  }
  const typing = e => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  // Enter and Space on a button or summary reached with Tab activate it; after a mouse click
  // they stay the computer's keys, so Enter is still = after a program button. (:focus-visible
  // cannot tell: the browser turns it on with the very key press.)
  let tabbed = false;
  window.addEventListener('pointerdown', () => { tabbed = false; }, true);
  window.addEventListener('keydown', e => { if (e.key === 'Tab') tabbed = true; }, true);
  const activating = e => tabbed && (e.key === 'Enter' || e.key === ' ') && !!e.target.closest?.('button, summary');
  window.addEventListener('keydown', e => {
    if (typing(e) || activating(e) || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === ' ' && !running) { e.preventDefault(); step(); return; }
    const k = mapKey(e);
    if (!k) return;
    e.preventDefault();
    if (!e.repeat) press(k);
  });
  window.addEventListener('keyup', e => { const k = mapKey(e); if (k) release(k); });
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAll();
    if (PAUSE_WHEN_HIDDEN || !document.hidden) { lastNow = performance.now(); audio.reset(); } // else the ticker keeps its own clock and the sound flows on
  });

  // ---------- sound ----------
  // On by default, remembered per browser. Browsers start audio only after a user gesture, so
  // every click or key press tries again until the audio context runs.
  let wantSound = true;
  try { wantSound = localStorage.getItem('wolf80-sound') !== 'off'; } catch { /* storage blocked */ }
  function showSound() {
    $('soundBtn').textContent = t(wantSound ? 'sound.on' : 'sound.off', { out: ui.soundOut });
    $('soundBtn').title = t(ui.soundTip);
    $('soundBtn').classList.toggle('on', wantSound);
    $('soundBtn').setAttribute('aria-pressed', String(wantSound));
  }
  async function startSound() {
    try { await audio.enable(); if (!wantSound) audio.disable(); } catch { /* no Web Audio */ }
  }
  const gesture = () => { if (wantSound && !audio.running) startSound(); };
  window.addEventListener('pointerdown', gesture, true);
  window.addEventListener('keydown', gesture, true);
  $('soundBtn').addEventListener('click', async () => {
    wantSound = !wantSound;
    try { localStorage.setItem('wolf80-sound', wantSound ? 'on' : 'off'); } catch { /* storage blocked */ }
    showSound();
    if (wantSound) await startSound(); else audio.disable();
  });
  showSound();

  // ---------- side panel ----------
  function setRunning(on) {
    running = on;
    lastNow = performance.now();
    showRun();
    $('stepBtn').disabled = on;
    renderStatus();
    if (activeTab === 'ladeni') renderDebug();
  }
  function showRun() {
    $('runBtn').textContent = t(running ? 'run.pause' : 'run.run');
    $('runBtn').classList.toggle('primary', running);
  }
  function step() {
    if (running) return;
    machine.cpu.step();
    renderStatus();
    if (activeTab === 'ladeni') renderDebug();
  }
  // short highlight after any click or keyboard activation of a panel button
  $('app').addEventListener('click', e => {
    const b = e.target.closest('.btn');
    if (!b) return;
    b.classList.remove('flash');
    void b.offsetWidth; // restart the animation
    b.classList.add('flash');
  });
  $('app').addEventListener('animationend', e => e.target.classList.remove('flash'));
  $('runBtn').addEventListener('click', () => setRunning(!running));
  $('stepBtn').addEventListener('click', step);
  $('powerBtn').addEventListener('click', () => { newMachine(); setRunning(true); });
  $('stepBtn').disabled = true;

  const dis = (read, addr) => (profile.cpu === 'z80' ? disassembleZ80 : disassemble)(read, addr);
  function renderStatus() {
    const c = machine.cpu;
    const d = dis(a => machine.read(a), c.pc);
    $('status').textContent = `${t(running ? 'status.running' : 'status.paused')} · PC ${h4(c.pc)}  ${d.text}` +
      (c.halted ? ' · HLT' : '') + (machine.resetHeld ? ' · RESET' : '');
  }

  // "O počítači" follows the selected board
  function showBoardInfo() {
    for (const d of document.querySelectorAll('#aboutPc [data-board]')) d.hidden = d.dataset.board !== boardId;
  }

  // Only the programs for the selected board and monitor are offered. A name or an author is a
  // text or { cs, en } (programs/catalog.json); an empty line in the help starts a paragraph, and
  // a program may carry its own version.
  const loc = v => (typeof v === 'string' ? v : v[lang] ?? v.en);
  // A key of the emulated computer is written <kbd>=</kbd> in the help, with the label it has on
  // the board (dA, –S, Reset on the Savia-84). It is drawn as a small keycap in the colours of the
  // real one, so that it cannot be taken for a key of the PC keyboard, which the tooltip names.
  // Only that tag is recognised, everything else stays plain text (never innerHTML).
  const PC_NAME = { '=': 'Enter / =', EX: 'X', BR: 'P', RE: 'Esc' };
  function miniKey(label) {
    const name = [...keyEls.keys()].find(n => (ui.labels[n] ?? n) === label);
    if (!name) return el('kbd', { text: label });
    const pc = PC_NAME[name] ?? name;
    return el('kbd', { class: 'mkey' + (FN.has(name) ? ' fn' : ''), text: label, ...(pc === label ? {} : { title: t('keys.pcTip', { key: pc }) }) });
  }
  const richText = s => s.split(/(<kbd>.*?<\/kbd>)/).map(part => {
    const m = /^<kbd>(.*)<\/kbd>$/.exec(part);
    return m ? miniKey(m[1]) : part;
  });
  let guided = null; // the program whose help is shown
  function renderGuide() {
    const p = guided;
    if (!p) { $('programGuide').replaceChildren(); return; }
    const version = p.version ? ` · ${t('prog.version', { v: p.version })}` : '';
    $('programGuide').replaceChildren(
      el('b', { text: loc(p.name) }), `${version} · ${t('prog.startTip', { addr: p.start })} · ${loc(p.author)}`,
      ...loc(p.help).split(/\n\s*\n/).map(text => el('p', {}, richText(text))));
  }
  let programBtns = [];
  function buildPrograms() {
    guided = null;
    renderGuide();
    programBtns = [];
    $('programs').replaceChildren();
    for (const p of PROGRAMS.filter(x => programFits(x, boardId, firmware.id))) {
      const b = el('button', { type: 'button', class: 'btn', text: loc(p.name), title: t('prog.startTip', { addr: p.start }) });
      programBtns.push([b, p]);
      b.addEventListener('click', () => {
        newMachine();
        startProgram(machine, p, p.bytes, {
          bootStates: Math.round(profile.bootMs * statesPerMs), holdStates: Math.round(firmware.holdMs * statesPerMs), runKeys: firmware.runKeys,
        });
        for (const x of $('programs').children) x.classList.toggle('sel', x === b);
        guided = p;
        renderGuide();
        setRunning(true);
      });
      $('programs').append(b);
    }
    if (!programBtns.length) $('programs').append(el('p', { class: 'small', 'data-i18n': 'prog.none', text: t('prog.none') }));
  }

  // memory files
  const parseAddr = id => {
    const v = $(id).value.trim();
    if (!/^[0-9A-Fa-f]{1,4}$/.test(v)) throw new Error(t('mem.badAddr', { value: v }));
    return parseInt(v, 16);
  };
  const say = msg => { $('memMsg').textContent = msg; };
  const sayError = err => say(t('mem.error', { msg: err.message }));
  function writeBlocks(blocks) {
    let n = 0;
    for (const { addr, bytes } of blocks) bytes.forEach((v, i) => { machine.write((addr + i) & 0xffff, v); n++; });
    const where = blockRanges(blocks).map(r => `${h4(r.from)}–${h4(r.to)}`).join(', ');
    say(t('mem.written', { n, where, ram: `${h4(profile.ram[0])}–${h4(profile.ram[1])}` }));
  }
  $('loadFile').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', async () => {
    const f = $('fileInput').files[0];
    $('fileInput').value = '';
    if (!f) return;
    try {
      const data = new Uint8Array(await f.arrayBuffer());
      const text = new TextDecoder().decode(data.slice(0, 64));
      if (/\.(hex|ihx)$/i.test(f.name) || text.trimStart().startsWith(':')) {
        writeBlocks(parseIntelHex(new TextDecoder().decode(data)));
      } else {
        writeBlocks([{ addr: parseAddr('loadAddr'), bytes: data }]);
      }
    } catch (err) { sayError(err); }
  });
  $('writeHex').addEventListener('click', () => {
    try { writeBlocks([{ addr: parseAddr('loadAddr'), bytes: parsePlainHex($('hexText').value) }]); } catch (err) { sayError(err); }
  });
  function exportRange() {
    const from = parseAddr('expFrom'), to = parseAddr('expTo');
    if (to < from) throw new Error(t('mem.endBeforeStart'));
    return { from, bytes: Uint8Array.from({ length: to - from + 1 }, (_, i) => machine.read(from + i)) };
  }
  // Desktop app (WebView2): the host shows the native "Save as" dialog, see desktop/wolf80_desktop.cpp.
  // Message "save\n<id>\n<1 text|0 base64>\n<name>\n<payload>", reply "saved\n<id>\nok|cancel|error\n<path|reason>".
  const hostSaves = new Map();
  let hostSaveId = 0;
  function hostWebView() {
    const wv = globalThis.wolf80Host && globalThis.chrome && globalThis.chrome.webview;
    if (wv && !wv.wolf80Listening) {
      wv.wolf80Listening = true;
      wv.addEventListener('message', e => {
        const [kind, id, status, ...rest] = String(e.data).split('\n');
        const done = kind === 'saved' && hostSaves.get(id);
        if (!done) return;
        hostSaves.delete(id);
        done({ status, detail: rest.join('\n') });
      });
    }
    return wv || null;
  }
  // note: a message shown with the result (the desktop app reports the saved path first)
  function download(name, data, type, note = '') {
    const wv = hostWebView();
    if (!wv) {
      if (note) say(note);
      const a = el('a', { download: name, href: URL.createObjectURL(new Blob([data], { type })) });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      return;
    }
    const isText = typeof data === 'string';
    const id = String(++hostSaveId);
    hostSaves.set(id, ({ status, detail }) => {
      if (status === 'ok') return say(`${t('mem.saved', { path: detail })} ${note}`.trim());
      if (status === 'cancel') return say(t('mem.saveCancelled'));
      const code = /^dialog (\d+)/.exec(detail);
      say(t('mem.saveFailed', { err: code ? t('mem.hostDialog', { code: code[1] }) : t('mem.hostWrite') }));
    });
    let payload = data;
    if (!isText) {
      let bin = '';
      for (let i = 0; i < data.length; i += 0x8000) bin += String.fromCharCode(...data.subarray(i, i + 0x8000));
      payload = btoa(bin);
    }
    wv.postMessage(['save', id, isText ? 1 : 0, name, payload].join('\n'));
  }
  $('expHex').addEventListener('click', () => {
    try { const r = exportRange(); download(`${ui.file}-${h4(r.from)}.hex`, toIntelHex(r.from, r.bytes), 'text/plain'); } catch (err) { sayError(err); }
  });
  $('expBin').addEventListener('click', () => {
    try { const r = exportRange(); download(`${ui.file}-${h4(r.from)}.bin`, r.bytes, 'application/octet-stream'); } catch (err) { sayError(err); }
  });
  // A tape recording as the factory monitor's SAVE makes it, whatever monitor runs (pmi80-tape.js);
  // offered only on the PMI-80 (profile.tape).
  $('expWav').addEventListener('click', () => {
    try {
      const from = parseAddr('expFrom'), to = parseAddr('expTo');
      if (to < from) throw new Error(t('mem.endBeforeStart'));
      const v = $('expNumber').value.trim();
      if (!/^[0-9A-Fa-f]{1,2}$/.test(v)) throw new Error(t('mem.badNumber', { value: v }));
      const blocks = pmi80TapeBlocks(from, to, parseInt(v, 16));
      if (blocks.length > PMI80_TAPE_MAX_BLOCKS) throw new Error(t('mem.wavTooLong', { max: PMI80_TAPE_MAX_BLOCKS }));
      for (const b of blocks) b.bytes = Uint8Array.from({ length: b.length }, (_, i) => machine.read(b.addr + i));
      const { wav, seconds } = pmi80TapeWav(blocks);
      const steps = blocks.map(b => t('mem.wavStep', { addr: h4(b.addr), number: h2(b.number) })).join(t('mem.wavThen'));
      const name = `pmi80-${blocks.map(b => `L${h4(b.addr)}-${h2(b.number)}`).join('_')}.wav`; // what to type at LOAD
      download(name, wav, 'audio/wav', t('mem.wavDone', { seconds: Math.round(seconds), steps }));
    } catch (err) { sayError(err); }
  });

  // ---------- work area tabs ----------
  let activeTab = 'tahak';
  function showTab(name) {
    activeTab = name;
    if (name !== 'ovladani') lastTab = name;
    for (const x of document.querySelectorAll('.tab')) x.setAttribute('aria-selected', String(x.dataset.tab === name));
    for (const b of document.querySelectorAll('.tab-body')) b.hidden = b.id !== `tab-${name}`;
    if (name === 'ladeni') renderDebug();
  }
  for (const tab of document.querySelectorAll('.tab')) tab.addEventListener('click', () => showTab(tab.dataset.tab));

  // rows: [first column, text key]; a first column that is itself a key ("tahak.…") is translated
  const tr = key => (key.startsWith('tahak.') ? { 'data-i18n': key } : { text: key });
  const table = rows => el('table', { class: 'ref' }, rows.map(([k, v]) =>
    el('tr', {}, [el('td', { class: 'k', ...tr(k) }), el('td', { 'data-i18n': v })])));
  const h3 = key => el('h3', { 'data-i18n': key });
  // the cheat sheet of each board's monitor: [heading, rows] sections and a closing note
  const PMI_SCRATCH = [
    ['1FD9', 'tahak.stack'],
    ['1FE6–1FEB', 'tahak.intr'],
    ['1FEC–1FED', 'tahak.bpAddr'],
    ['1FEE', 'tahak.bpByte'],
    ['1FEF–1FF7', 'tahak.codes'],
    ['1FF8–1FF9', 'tahak.inAdr'],
    ['1FFA', 'tahak.inData'],
    ['1FFC–1FFD', 'tahak.textPtr'],
    ['1FFE', 'tahak.keyCode'],
  ];
  const TAHAK = {
    pmi80: [[
      ['tahak.commands', [
        ['RE', 'tahak.reTxt'],
        ['tahak.mKey', 'tahak.mTxt'],
        ['tahak.exKey', 'tahak.exTxt'],
        ['R', 'tahak.rTxt'],
        ['tahak.brKey', 'tahak.brTxt'],
        ['I', 'tahak.iTxt'],
        ['L / S', 'tahak.lsTxt'],
      ]],
      ['tahak.services', [
        ['00AB CLEAR', 'tahak.clear'],
        ['00BB OUTAD', 'tahak.outad'],
        ['00D7 MODAD', 'tahak.modad'],
        ['00F2 OUTDA', 'tahak.outda'],
        ['00FB MODDA', 'tahak.modda'],
        ['0116 OUTKE', 'tahak.outke'],
        ['0140 DISP', 'tahak.disp'],
        ['02D4 TOUT', 'tahak.tout'],
        ['0300 TIN', 'tahak.tin'],
      ]],
      ['tahak.scratch', PMI_SCRATCH],
      ['tahak.map', [
        ['0000–03FF', 'tahak.mapRom'],
        ['0400–07FF', 'tahak.mapRom2'],
        ['1C00–1FFF', 'tahak.mapRam'],
        ['2000–3FFF', 'tahak.mapMirror'],
        ['F8 F9 FA FB', 'tahak.mapPorts'],
      ]],
    ], 'tahak.note'],
    savia84: [[
      ['tahak.commands', [
        ['Reset', 'tahak.sReset'],
        ['tahak.sAdKey', 'tahak.sAd'],
        ['tahak.sExKey', 'tahak.sEx'],
        ['tahak.sBrKey', 'tahak.sBr'],
        ['Reg', 'tahak.sReg'],
        ['L / –S', 'tahak.sLS'],
      ]],
      ['tahak.services', [
        ['014F', 'tahak.s014f'],
        ['0160', 'tahak.s0160'],
        ['0179', 'tahak.s0179'],
        ['0188', 'tahak.s0188'],
        ['0196', 'tahak.s0196'],
        ['0199', 'tahak.s0199'],
        ['01FD', 'tahak.s01fd'],
        ['0200', 'tahak.s0200'],
        ['03C1 / 03E5', 'tahak.sTables'],
      ]],
      ['tahak.scratch', [
        ['1FD9', 'tahak.sStack'],
        ['1FE2–1FE7', 'tahak.sBp'],
        ['1FE8–1FF3', 'tahak.sRegs'],
        ['1FF4–1FF6', 'tahak.sWork'],
        ['1FF7–1FFF', 'tahak.codes'],
      ]],
      ['tahak.map', [
        ['0000–03FF', 'tahak.mapRom'],
        ['0400–17FF', 'tahak.sMapEmpty'],
        ['1800–1FFF', 'tahak.sMapRam'],
        ['8000–FFFF', 'tahak.sMapMirror'],
        ['F8 F9 FA FB', 'tahak.sMapPorts'],
      ]],
    ], 'tahak.noteSavia'],
    stone1: [[
      ['tahak.commands', [
        ['RE', 'tahak.oRe'],
        ['tahak.mKey', 'tahak.oM'],
        ['tahak.exKey', 'tahak.oEx'],
        ['R', 'tahak.oR'],
        ['tahak.brKey', 'tahak.oBr'],
        ['I', 'tahak.oI'],
      ]],
      ['tahak.services', [
        ['0098 CLEAR', 'tahak.clear'],
        ['00A7 MODAD', 'tahak.oModad'],
        ['00B9 MODDA', 'tahak.oModda'],
        ['00D1 OUTAD', 'tahak.oOutad'],
        ['00DC OUTDA', 'tahak.oOutda'],
        ['00DF OUTHEX', 'tahak.oOuthex'],
        ['00F0 GETC', 'tahak.oGetc'],
        ['00FF MPX', 'tahak.oMpx'],
      ]],
      ['tahak.scratch', [
        ['1FC8–1FDF', 'tahak.oStack'],
        ['1FE0–1FEB', 'tahak.oRegs'],
        ['1FEC–1FEE', 'tahak.oBp'],
        ['1FEF–1FF1', 'tahak.oVector'],
        ['1FF2–1FF3', 'tahak.textPtr'],
        ['1FF4–1FFC', 'tahak.codes'],
        ['1FFD–1FFF', 'tahak.oKeys'],
      ]],
      ['tahak.map', [
        ['0000–07FF', 'tahak.oMapRom'],
        ['1800–1FFF', 'tahak.oMapRam'],
        ['F8 F9 FA FB', 'tahak.oMapPorts'],
      ]],
    ], 'tahak.noteStone1'],
    pmi80c: [[
      ['tahak.commands', [
        ['RE', 'tahak.cRe'],
        ['tahak.mKey', 'tahak.mTxt'],
        ['tahak.exKey', 'tahak.exTxt'],
        ['R', 'tahak.rTxt'],
        ['tahak.brKey', 'tahak.brTxt'],
        ['I', 'tahak.iTxt'],
        ['L', 'tahak.tL'],
        ['S', 'tahak.tS'],
      ]],
      ['tahak.services', [
        ['00AB CLEAR', 'tahak.clear'],
        ['00BB OUTAD', 'tahak.outad'],
        ['00D7 MODAD', 'tahak.modad'],
        ['00F2 OUTDA', 'tahak.outda'],
        ['00FB MODDA', 'tahak.modda'],
        ['0116 OUTKE', 'tahak.tOutke'],
        ['0140 DISP', 'tahak.disp'],
        ['0440 / 0660', 'tahak.tGames'],
      ]],
      ['tahak.scratch', PMI_SCRATCH],
      ['tahak.map', [
        ['0000–03FF', 'tahak.mapRom'],
        ['0400–07FF', 'tahak.cMapGames'],
        ['1C00–1FFF', 'tahak.mapRam'],
        ['2000–3FFF', 'tahak.mapMirror'],
        ['F8 F9 FA FB', 'tahak.mapPorts'],
      ]],
    ], 'tahak.notePmiC'],
    'stone-pmi': [[
      ['tahak.commands', [
        ['RE', 'tahak.tRe'],
        ['tahak.mKey', 'tahak.mTxt'],
        ['tahak.exKey', 'tahak.exTxt'],
        ['R', 'tahak.rTxt'],
        ['tahak.brKey', 'tahak.brTxt'],
        ['I', 'tahak.tI'],
        ['L', 'tahak.tL'],
        ['S', 'tahak.tS'],
      ]],
      ['tahak.services', [
        ['00AB CLEAR', 'tahak.clear'],
        ['00BB OUTAD', 'tahak.outad'],
        ['00D7 MODAD', 'tahak.modad'],
        ['00F2 OUTDA', 'tahak.outda'],
        ['00FB MODDA', 'tahak.modda'],
        ['0116 OUTKE', 'tahak.tOutke'],
        ['0140 DISP', 'tahak.disp'],
        ['0440 / 0660', 'tahak.tGames'],
      ]],
      ['tahak.scratch', PMI_SCRATCH],
      ['tahak.map', [
        ['0000–03FF', 'tahak.mapRom'],
        ['0400–07FF', 'tahak.tMapGames'],
        ['1800–1FFF', 'tahak.oMapRam'],
        ['F8 F9 FA FB', 'tahak.oMapPorts'],
      ]],
    ], 'tahak.noteStone'],
  };
  function buildTahak() {
    const [sections, note] = TAHAK[firmware.id] ?? TAHAK[boardId];
    $('tab-tahak').replaceChildren(...sections.flatMap(([head, rows]) => [h3(head), table(rows)]),
      el('p', { class: 'note', 'data-i18n': note }));
    translate($('tab-tahak'));
  }

  // opcode reference: a list "code, instruction, bytes, states", sorted by code or by name, or
  // the classic 16 x 16 grid; 8080 or Z80 after the board's processor
  let opsView = 'code';
  const opsFind = el('input', { class: 'find', spellcheck: 'false', 'data-i18n-aria': 'ops.findAria' });
  const opsBody = el('div');
  const opsTitle = el('h3');
  const opsNote = el('p', { class: 'note' });
  const viewBtns = [['code', 'ops.byCode'], ['name', 'ops.byName'], ['grid', 'ops.grid']].map(([v, label]) => {
    const b = el('button', { type: 'button', class: 'btn small' + (v === opsView ? ' primary' : ''), 'data-i18n': label });
    b.addEventListener('click', () => { opsView = v; for (const x of viewBtns) x.classList.toggle('primary', x === b); renderOps(); });
    return b;
  });
  opsFind.addEventListener('input', renderOps);
  // the code of an entry as text: "3E" (8080, unprefixed Z80) or "DD 21" (Z80 with a prefix)
  const opCode = o => o.code ?? h2(o.op);
  function opMatches(o, q) {
    if (!q) return true;
    return o.text.toUpperCase().includes(q) || opCode(o).replace(/ /g, '').startsWith(q.replace(/ /g, ''));
  }
  function showOpsTexts() {
    const z80 = profile.cpu === 'z80';
    opsTitle.textContent = t(z80 ? 'ops.titleZ80' : 'ops.title');
    opsNote.textContent = t(z80 ? 'ops.noteZ80' : 'ops.note');
    opsFind.placeholder = t(z80 ? 'ops.findZ80' : 'ops.find');
  }
  function renderOps() {
    const q = opsFind.value.trim().toUpperCase();
    const z80 = profile.cpu === 'z80';
    if (opsView === 'grid') {
      const main = z80 ? Z80_MAIN_OPCODES : I8080_OPCODES;
      const grid = el('div', { class: 'ops' }, [el('div', { class: 'h' })]);
      for (let lo = 0; lo < 16; lo++) grid.append(el('div', { class: 'h', text: `x${lo.toString(16).toUpperCase()}` }));
      for (let hi = 0; hi < 16; hi++) {
        grid.append(el('div', { class: 'h', text: `${hi.toString(16).toUpperCase()}x` }));
        for (let lo = 0; lo < 16; lo++) {
          const o = main[hi * 16 + lo];
          const cls = 'c' + (o.length > 1 ? ` l${o.length}` : '') + (o.undocumented ? ' undoc' : '') + (opMatches(o, q) ? '' : ' dim');
          grid.append(el('div', { class: cls, text: o.text, title: o.states ? `${h2(o.op)} · ${o.length} B · ${o.states} T` : h2(o.op) }));
        }
      }
      opsBody.replaceChildren(grid);
      return;
    }
    let list = (z80 ? Z80_OPCODES : I8080_OPCODES).filter(o => opMatches(o, q));
    if (opsView === 'name') {
      list = list.filter(o => !o.undocumented).sort((a, b) => a.text.localeCompare(b.text, 'en') || opCode(a).localeCompare(opCode(b)));
    }
    opsBody.replaceChildren(el('div', { class: 'oplist' + (z80 ? ' z80' : '') }, list.map(o => el('div', { class: 'op' + (o.undocumented ? ' undoc' : '') }, [
      el('b', { text: opCode(o) }), el('span', { text: o.text }),
      el('span', { class: 'n', text: `${o.length} B` }), el('span', { class: 'n', text: `${o.states} T` }),
    ]))));
  }
  $('tab-instrukce').append(
    opsTitle,
    el('div', { class: 'ops-tools' }, [...viewBtns, opsFind]),
    opsNote,
    opsBody,
  );

  // debugger
  let memStart = profile.ram[0];
  const dbg = {
    regs: el('div', { class: 'regs' }), flags: el('div', { class: 'flags' }),
    ppi: el('div', { class: 'regs' }), dis: el('div', { class: 'dis' }), mem: el('div', { class: 'mem' }),
    addr: el('input', { value: h4(memStart), maxlength: '4', spellcheck: 'false', 'data-i18n-aria': 'dbg.addr' }),
  };
  dbg.addr.addEventListener('change', () => {
    const v = dbg.addr.value.trim();
    if (/^[0-9A-Fa-f]{1,4}$/.test(v)) { memStart = parseInt(v, 16) & 0xfff0; renderDebug(); }
  });
  dbg.mem.addEventListener('wheel', e => {
    e.preventDefault();
    memStart = (memStart + (e.deltaY > 0 ? 16 : -16) * 4) & 0xffff;
    renderDebug();
  }, { passive: false });
  // buttons that move the view: by a kilobyte, or to the start of ROM or RAM (the legend chips)
  const memJump = (cls, key, tip, to) => {
    const b = el('button', { type: 'button', class: cls, 'data-i18n': key, ...(tip ? { 'data-i18n-title': tip } : {}) });
    b.addEventListener('click', () => { memStart = to(memStart) & 0xfff0; renderDebug(); });
    return b;
  };
  const ramChip = memJump('mem-key ram', 'dbg.ram', null, () => profile.ram[0]);
  $('tab-ladeni').append(
    h3('dbg.regs'), dbg.regs, dbg.flags,
    h3('dbg.ppi'), dbg.ppi,
    h3('dbg.dis'), dbg.dis,
    h3('dbg.mem'),
    el('div', { class: 'mem-head' }, [el('span', { 'data-i18n': 'dbg.addr' }), dbg.addr,
      memJump('btn small', 'dbg.memPrev', 'dbg.memPrevTip', a => a - 0x400), memJump('btn small', 'dbg.memNext', 'dbg.memNextTip', a => a + 0x400),
      el('span', { class: 'note', 'data-i18n': 'dbg.memNote' }),
      el('span', { class: 'mem-keys' }, [memJump('mem-key rom', 'dbg.rom', 'dbg.romTip', () => 0x0000), ramChip])]),
    dbg.mem,
    el('p', { class: 'note', 'data-i18n': 'dbg.later' }),
  );
  const pairCells = pairs => pairs.flatMap(([k, v]) => [el('span', { class: 'k', text: k }), el('span', { class: 'v', text: v })]);
  function renderDebug() {
    const c = machine.cpu;
    if (profile.cpu === 'z80') {
      dbg.regs.replaceChildren(...pairCells([['A', h2(c.a)], ['F', h2(c.f)], ['BC', h4(c.bc)], ['DE', h4(c.de)], ['HL', h4(c.hl)],
        ['IX', h4(c.ix)], ['IY', h4(c.iy)], ['SP', h4(c.sp)], ['PC', h4(c.pc)],
        ["AF'", h4((c.a2 << 8) | c.f2)], ["BC'", h4((c.b2 << 8) | c.c2)], ["DE'", h4((c.d2 << 8) | c.e2)], ["HL'", h4((c.h2 << 8) | c.l2)],
        ['I', h2(c.i)], ['R', h2(c.r)], ['IM', String(c.im)], ['IFF', `${c.iff1 ? 1 : 0}${c.iff2 ? 1 : 0}`], [t('dbg.states'), String(c.cycles)]]));
      dbg.flags.replaceChildren(...[['S', 0x80], ['Z', 0x40], ['Y', 0x20], ['H', 0x10], ['X', 0x08], ['P/V', 0x04], ['N', 0x02], ['C', 0x01]]
        .map(([k, bit]) => el('span', { class: c.f & bit ? 'on' : '', text: k })), el('span', { class: c.halted ? 'on' : '', text: 'HALT' }));
    } else {
      dbg.regs.replaceChildren(...pairCells([['A', h2(c.a)], ['F', h2(c.f)], ['B', h2(c.b)], ['C', h2(c.c)], ['D', h2(c.d)], ['E', h2(c.e)],
        ['H', h2(c.h)], ['L', h2(c.l)], ['SP', h4(c.sp)], ['PC', h4(c.pc)], ['INTE', c.inte ? '1' : '0'], [t('dbg.states'), String(c.cycles)]]));
      dbg.flags.replaceChildren(...[['S', c.fS], ['Z', c.fZ], ['AC', c.fAC], ['P', c.fP], ['CY', c.fCY], ['HLT', c.halted]]
        .map(([k, on]) => el('span', { class: on ? 'on' : '', text: k })));
    }
    const p = machine.ppi;
    dbg.ppi.replaceChildren(...pairCells([['CW', h2(p.control)], ['PA', h2(p.outputA())], ['PB', h2(p.read(1))], ['PC', h2(p.read(2))],
      [t('dbg.digit'), String(machine.selectedColumn())], ['', '']]));
    const lines = [];
    let a = c.pc;
    for (let i = 0; i < 10; i++) {
      const d = dis(x => machine.read(x), a);
      lines.push(el('div', { class: 'ln' + (i === 0 ? ' pc' : '') }, [
        el('span', { class: 'a', text: h4(d.addr) }), el('span', { text: d.bytes.map(h2).join(' ') }), el('span', { text: d.text })]));
      a = (a + d.length) & 0xffff;
    }
    dbg.dis.replaceChildren(...lines);
    // ROM, RAM and unpopulated areas start and end on whole kilobytes, so a row of 16 bytes always
    // lies in one of them and gets its background as a whole
    const rows = [];
    for (let r = 0; r < 16; r++) {
      const base = (memStart + r * 16) & 0xffff;
      const cells = [];
      for (let i = 0; i < 16; i++) {
        const x = (base + i) & 0xffff;
        let cls = 'b';
        if (x === c.pc) cls += ' pc';
        if (x === c.sp) cls += ' sp';
        cells.push(el('span', { class: cls, text: h2(machine.read(x)) }));
      }
      rows.push(el('div', { class: 'row' }, [el('span', { class: 'a', text: h4(base) }), el('span', { class: 'bytes ' + machine.region(base) }, cells)]));
    }
    dbg.mem.replaceChildren(...rows);
    if (document.activeElement !== dbg.addr) dbg.addr.value = h4(memStart);
  }

  // The board's name above the display keeps the height of PMI-80; a longer name is narrowed
  // so that the header stays one line and the computer keeps its size.
  function fitBrand() {
    const mark = $('brandMark'), brand = mark.parentElement;
    mark.style.transform = '';
    mark.style.width = '';
    const over = brand.scrollWidth - brand.clientWidth;
    if (over <= 0) return;
    const w = mark.offsetWidth;
    mark.style.width = `${w - over}px`;
    mark.style.transform = `scaleX(${((w - over) / w).toFixed(3)})`;
  }

  // ---------- board selection ----------
  // Choosing another board is like switching on another computer: a new machine with fresh RAM.
  function boardTexts() {
    const name = profile.name;
    $('case').setAttribute('aria-label', t('case.aria', { name }));
    $('clockVal').textContent = t(ui.clock);
    for (const o of $('romSel').options) o.textContent = t(ui.monitors[o.value]);
    $('progHelp').textContent = t('prog.help', { keys: t(ui.runText) });
    $('loadHelp').textContent = t('mem.loadHelp', { keys: t(ui.runText) });
    $('keysHelp').innerHTML = t(ui.keysHelp);
    ramChip.title = t('dbg.ramTip', { addr: h4(profile.ram[0]) });
    for (const [b, p] of programBtns) { b.textContent = loc(p.name); b.title = t('prog.startTip', { addr: p.start }); }
    showOpsTexts();
    showSound();
  }
  function setBoard(id) {
    boardId = BOARD_PROFILES[id] ? id : 'pmi80';
    profile = BOARD_PROFILES[boardId];
    ui = BOARD_UI[boardId];
    firmware = pickFirmware();
    statesPerMs = profile.clockHz / 1000;
    MIN_HOLD = minHold();
    audio.clockHz = profile.clockHz;
    glow = new Glow(DIGITS * 8, GLOW_MS * statesPerMs);
    $('boardSel').value = boardId;
    $('romSel').replaceChildren(...profile.firmware.map(f => el('option', { value: f.id })));
    $('romSel').value = firmware.id;
    $('romSel').disabled = profile.firmware.length < 2;
    $('brandMark').textContent = profile.name.toUpperCase();
    fitBrand();
    for (const e of document.querySelectorAll('.savia-only')) e.hidden = boardId !== 'savia84';
    $('wavRow').hidden = !profile.tape;
    $('wavHelp').hidden = !profile.tape;
    for (const id of ['loadAddr', 'expFrom']) $(id).value = h4(profile.ram[0]);
    $('expTo').value = h4(profile.ram[1]);
    memStart = profile.ram[0];
    newMachine();
    buildKeyboard();
    showDigits();
    buildTahak();
    renderOps();
    buildPrograms();
    showBoardInfo();
    boardTexts();
    renderStatus();
    if (activeTab === 'ladeni') renderDebug();
  }
  $('boardSel').addEventListener('change', () => {
    store('wolf80-board', $('boardSel').value);
    setBoard($('boardSel').value);
    setRunning(true);
    fitCase();
  });
  // another firmware of the same board: the machine starts again with it
  $('romSel').addEventListener('change', () => {
    store(`wolf80-firmware-${boardId}`, $('romSel').value);
    setBoard(boardId);
    setRunning(true);
  });
  $('nineDigits').checked = !eightDigits;
  $('nineDigits').addEventListener('change', () => {
    eightDigits = !$('nineDigits').checked;
    store('wolf80-savia-digits', eightDigits ? '8' : '9');
    showDigits();
  });
  $('layoutSel').value = keyLayout;
  $('layoutSel').addEventListener('change', () => {
    keyLayout = $('layoutSel').value === 'board' ? 'board' : 'pmi';
    store('wolf80-savia-layout', keyLayout);
    releaseAll();
    buildKeyboard();
    fitCase();
  });

  // ---------- source references ----------
  // The catalogue texts cite sources as "[1, 2]" and end with an <ol class="refs"> of them. The list
  // is taken out of the page, each citation becomes a superscript joined to the preceding word, and
  // each number in it a hoverable (or focusable) mark whose tooltip is the source; a non-numeric
  // part such as "p. 132" stays as plain text.
  const refTip = el('div', { class: 'ref-tip', role: 'tooltip' });
  refTip.hidden = true;
  document.body.appendChild(refTip);
  function showRefTip(target) {
    refTip.textContent = target.dataset.src;
    refTip.hidden = false;
    const r = target.getBoundingClientRect();
    const w = refTip.offsetWidth, h = refTip.offsetHeight;
    const x = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8));
    const y = r.top - h - 6 >= 8 ? r.top - h - 6 : r.bottom + 6;
    refTip.style.left = x + 'px';
    refTip.style.top = y + 'px';
  }
  function linkRefs(root) {
    const list = root.querySelector('ol.refs');
    if (!list) return;
    const sources = [...list.children].map(li => li.textContent.trim());
    list.remove();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (/\[\d/.test(n.nodeValue)) nodes.push(n);
    for (const node of nodes) {
      const frag = document.createDocumentFragment();
      let last = 0;
      for (const m of node.nodeValue.matchAll(/\s*\[(\d+(?:, [^\]]+)?)\]/g)) {
        const sup = el('sup', { class: 'cite' });
        m[1].split(', ').forEach((part, i) => {
          if (i) sup.append(', ');
          const src = /^\d+$/.test(part) ? sources[Number(part) - 1] : undefined;
          if (!src) { sup.append(part); return; }
          sup.append(el('span', { class: 'ref', tabindex: '0', 'data-src': src, 'aria-label': `${part}: ${src}`, text: part }));
        });
        frag.append(node.nodeValue.slice(last, m.index), sup);
        last = m.index + m[0].length;
      }
      frag.append(node.nodeValue.slice(last));
      node.replaceWith(frag);
    }
  }
  for (const ev of ['mouseover', 'focusin']) {
    document.addEventListener(ev, e => { const r = e.target.closest?.('.ref[data-src]'); if (r) showRefTip(r); });
  }
  for (const ev of ['mouseout', 'focusout']) {
    document.addEventListener(ev, e => { if (e.target.closest?.('.ref[data-src]')) refTip.hidden = true; });
  }

  // ---------- language switch ----------
  // Fills in the texts named by data-i18n* attributes inside root (the whole page by default).
  function translate(root = document) {
    for (const e of root.querySelectorAll('[data-i18n]')) e.textContent = t(e.dataset.i18n);
    for (const e of root.querySelectorAll('[data-i18n-html]')) e.innerHTML = t(e.dataset.i18nHtml, { version: VERSION });
    for (const e of root.querySelectorAll('.about')) linkRefs(e);
    for (const e of root.querySelectorAll('[data-i18n-title]')) e.title = t(e.dataset.i18nTitle);
    for (const e of root.querySelectorAll('[data-i18n-placeholder]')) e.placeholder = t(e.dataset.i18nPlaceholder);
    for (const e of root.querySelectorAll('[data-i18n-aria]')) e.setAttribute('aria-label', t(e.dataset.i18nAria));
  }
  function applyLang() {
    document.documentElement.lang = lang;
    translate();
    for (const b of document.querySelectorAll('[data-lang]')) {
      b.classList.toggle('primary', b.dataset.lang === lang);
      b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
    }
    boardTexts();
    showRun();
    renderGuide();
    renderStatus();
    if (activeTab === 'ladeni') renderDebug();
  }
  for (const b of document.querySelectorAll('[data-lang]')) {
    b.addEventListener('click', () => {
      lang = b.dataset.lang;
      try { localStorage.setItem('wolf80-lang', lang); } catch { /* storage blocked */ }
      applyLang();
      fitCase();
    });
  }
  setBoard(boardId);
  applyLang();

  // ---------- light and dark theme ----------
  // Light, dark or the system's setting, dark by default, remembered per browser (the
  // maintainer's decision, 2026-10-21). Only the page around the computer changes; the inline
  // script in index.html sets a light theme before the first paint, so it does not flash dark.
  const THEMES = ['light', 'dark', 'system'];
  const SYSTEM_LIGHT = matchMedia('(prefers-color-scheme: light)');
  let themePick = 'dark';
  try { const v = localStorage.getItem('wolf80-theme'); if (THEMES.includes(v)) themePick = v; } catch { /* storage blocked */ }
  function applyTheme() {
    const theme = themePick === 'system' ? (SYSTEM_LIGHT.matches ? 'light' : 'dark') : themePick;
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="color-scheme"]').content = `only ${theme}`;
    for (const b of document.querySelectorAll('[data-theme-pick]')) {
      b.classList.toggle('primary', b.dataset.themePick === themePick);
      b.setAttribute('aria-pressed', String(b.dataset.themePick === themePick));
    }
  }
  for (const b of document.querySelectorAll('[data-theme-pick]')) {
    b.addEventListener('click', () => {
      themePick = b.dataset.themePick;
      try { localStorage.setItem('wolf80-theme', themePick); } catch { /* storage blocked */ }
      applyTheme();
    });
  }
  SYSTEM_LIGHT.addEventListener('change', () => { if (themePick === 'system') applyTheme(); });
  applyTheme();

  fitCase();
  globalThis.wolf80 = { get machine() { return machine; }, audio }; // for inspection in the console
  const fromHash = location.hash.slice(1);
  if (document.querySelector(`.tab[data-tab="${CSS.escape(fromHash)}"]`) && (fromHash !== 'ovladani' || layout !== 'wide')) showTab(fromHash);
  else if (layout !== 'wide') showTab('ovladani');
  renderStatus();
  requestAnimationFrame(frame);
}

startApp();
