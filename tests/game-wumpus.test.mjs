// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
// Exercise the assembled game through each board's actual monitor and I/O.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assemble } from '../src/asm/asm8080.js';
import { BOARD_PROFILES } from '../src/board/profiles.js';
import { startProgram } from '../src/machine/programs.js';
import { litMasks } from '../src/machine/display.js';

const root = new URL('../', import.meta.url);
const roms = Object.fromEntries(Object.entries({
  savia84: 'savia84/savia84_monitor.bin',
  stonepmi: 'stone1/stone_pmi.bin',
}).map(([id, path]) => [id, fs.readFileSync(new URL('roms/' + path, root))]));
const map = [
  [2, 5, 8, 11], [2, 3, 4, 14], [0, 1, 3, 5], [1, 2, 4, 6],
  [1, 3, 7, 15], [0, 2, 6, 8], [3, 5, 7, 9], [4, 6, 10, 15],
  [0, 5, 9, 11], [6, 8, 10, 12], [7, 9, 15, 13], [0, 8, 12, 14],
  [9, 11, 13, 14], [10, 12, 14, 15], [1, 11, 12, 13], [4, 7, 10, 13],
];
const messages = {
  ROOM_TEXT: ' YOU ARE IN \x01 - TUNNELS LEAD TO \x02\x03\x04\x05 ',
  BUMP: ' OOPS - BUMPED A WUMPUS  ', MISSED: ' MISSED - ONLY \x06 CANS LEFT ',
  LOSE_TEXT: ' YOU LOSE ', ROOM_QUERY: ' ROOM? ', WUMPUS_CLOSE: ' WUMPUS CLOSE',
  PIT_CLOSE: ' PIT CLOSE', BATS_CLOSE: ' BATS CLOSE ', EATEN_TEXT: ' HA HA WUMPUS GOT YOU ',
  BAT_SNATCH: ' SUPERBAT SNATCH ', PIT_TEXT: ' YYIIEEE FELL IN PIT ',
  GAS_TEXT: ' GAS IN ROOM ', EMPTY_TEXT: ' OUT OF GAS ',
  HUG_TEXT: '     GREAT- YOU GET A HUG FROM WUMPUS ',
};
const expectedFont = {
  ' ': 0x7f, '-': 0x3f, '?': 0x2c,
  '0': 0x40, '1': 0x79, '2': 0x24, '3': 0x30, '4': 0x19, '5': 0x12,
  '6': 0x02, '7': 0x78, '8': 0x00, '9': 0x10,
  A: 0x08, B: 0x03, C: 0x46, D: 0x21, E: 0x06, F: 0x0e, G: 0x42,
  H: 0x09, I: 0x7b, L: 0x47, M: 0x48, N: 0x2b, O: 0x23, P: 0x0c,
  R: 0x2f, S: 0x12, T: 0x07, U: 0x41, W: 0x15, Y: 0x11,
};

function setup(board, fw) {
  const profile = BOARD_PROFILES[board];
  const suffix = board === 'savia84' ? 'savia' : 'stone1';
  const data = fs.readFileSync(new URL(`programs/wumpus/wumpus-${suffix}.asm`, root));
  const asm = assemble(data.toString('utf8'));
  assert.deepEqual(asm.errors, []);
  const s = asm.symbols;
  assert.equal(s.START, 0x1800);
  assert.ok(s.CODE_END <= s.FONT, `code end ${s.CODE_END.toString(16)}`);
  assert.equal(s.FONT & 255, 0);
  assert.ok(s.FONT_END <= s.VARS && s.VARS_END <= 0x1f80);
  assert.match(data.toString('utf8'), /version 0\.1\.2:/);
  const lastBlock = [...asm.blocks].sort((a, b) => a.addr - b.addr).at(-1);
  assert.equal(lastBlock.addr + lastBlock.bytes.length, s.IMAGE_END);
  assert.equal(s.SIGNATURE, s.IMAGE_END - 12);
  assert.deepEqual([...lastBlock.bytes.slice(-12)], [...Buffer.from('Wolf2026v012')]);
  for (const block of asm.blocks) {
    assert.ok(block.addr >= 0x1800 && block.addr + block.bytes.length <= s.VARS);
  }
  assert.equal(s.STACK_TOP, 0x1fc0);
  const m = fw.create(roms);
  const at = ms => Math.round(ms * profile.clockHz / 1000);
  const run = ms => { m.run(at(ms)); assert.equal(m.cpu.halted, false); };
  const read = name => m.read(s[name]);
  const put = (name, value) => m.write(s[name], value);
  const bytes = (name, n) => Array.from({ length: n }, (_, i) => m.read(s[name] + i));
  let active = false, minSp = s.STACK_TOP;
  const pointers = [];
  const write = m.cpu.bus.write;
  m.cpu.bus.write = (addr, value) => {
    if (!active && m.cpu.pc >= s.START && m.cpu.pc < s.CODE_END) active = true;
    if (active) {
      assert.ok((addr >= s.VARS && addr < s.VARS_END) || (addr >= 0x1f80 && addr < s.STACK_TOP),
        `write outside game variables/stack: ${addr.toString(16)}`);
      minSp = Math.min(minSp, m.cpu.sp);
    }
    write(addr, value);
    if (active && addr === s.POINTER + 1) pointers.push({ ptr: pointer(), cycles: m.cycles });
  };
  const output = m.cpu.bus.output;
  m.cpu.bus.output = (port, value) => {
    if (active && (port & 255) === 0xf8) assert.equal(value & 128, 0, 'PA7 must remain low');
    output(port, value);
  };
  const pointer = () => m.read(s.POINTER) | (m.read(s.POINTER + 1) << 8);
  startProgram(m, { id: 'wumpus', board, format: 'asm', start: '1800' }, data, {
    bootStates: at(profile.bootMs), holdStates: at(fw.holdMs), runKeys: fw.runKeys,
  });
  assert.ok(active);
  assert.deepEqual(bytes('MAP', 64), map.flat());
  for (const [symbol, text] of Object.entries(messages)) {
    assert.deepEqual(bytes(symbol, text.length + 1), [...Buffer.from(text), 0]);
  }
  for (const [char, mask] of Object.entries(expectedFont)) {
    assert.equal(m.read(s.FONT + (char.charCodeAt(0) & 63)), mask, char);
  }
  const until = (condition, maxMs = 30000) => {
    const begin = m.cycles;
    while (!condition() && m.cycles - begin < at(maxMs)) run(1);
    assert.ok(condition(), `timeout at PC ${m.cpu.pc.toString(16)}, phase ${read('PHASE')}`);
  };
  const tap = (key, hold = 20) => { m.pressKey(key); run(hold); m.releaseKey(key); run(10); };
  const ready = phase => until(() => read('PHASE') === phase && read('WAITING') === 1 && read('ARMED') === 1);
  const screen = () => {
    m.display.takeFrame(m.cycles); run(20);
    return litMasks(m.display.takeFrame(m.cycles), 9);
  };
  // All game decisions still run on the CPU. Only the requested fixed layout is injected.
  const layout = ([player, wumpus, pit1, pit2, bat1, bat2], gas = [255, 255, 255]) => {
    [player, wumpus, pit1, pit2, bat1, bat2, ...gas].forEach((v, i) => m.write(s.PLAYER + i, v));
    map[player].forEach((v, i) => m.write(s.ADJ + i, v));
    put('CANS', 3);
  };
  const begin = () => { tap('A'); ready(1); };
  const seen = (symbol, from = 0) => pointers.slice(from).some(p => p.ptr === s[symbol]);
  const fastUntil = condition => {
    m.pressKey('R'); until(condition, 15000); m.releaseKey('R'); run(10);
  };
  const call = name => {
    const returnPc = m.cpu.pc, returnSp = m.cpu.sp;
    m.cpu.sp -= 2;
    m.write(m.cpu.sp, returnPc & 255); m.write(m.cpu.sp + 1, returnPc >> 8);
    m.cpu.pc = s[name];
    let steps = 0;
    do { m.cpu.step(); assert.ok(++steps < 100000); } while (m.cpu.pc !== returnPc);
    assert.equal(m.cpu.sp, returnSp);
    return m.cpu.a;
  };
  return { m, s, asm, run, read, put, bytes, pointers, pointer, until, tap, ready,
    screen, layout, begin, seen, fastUntil, call, minSp: () => minSp };
}

for (const board of ['savia84', 'stone1']) for (const fw of BOARD_PROFILES[board].firmware) {
  const label = `${board}/${fw.id}`;
  test(`${label}: title, invalid keys, warnings, pits, throw cancellation, win and restart`, t => {
    const h = setup(board, fw);
    const { m, s, run, read, bytes, tap, ready, until, layout, pointers, seen, fastUntil } = h;
    assert.equal(read('PHASE'), 0, 'the monitor launch key must not dismiss the title');
    assert.deepEqual(h.screen(), [0, 0, 0x6a, 0x3e, 0x37, 0x73, 0x3e, 0x6d, 0]);
    // Hiding Savia output 1 cannot remove any game information.
    assert.equal(bytes('DISPLAY', 10)[1], 0x7f);
    h.begin();
    assert.equal(new Set(bytes('PLAYER', 6)).size, 6);
    assert.deepEqual(bytes('GAS', 3), [255, 255, 255]);
    layout([0, 15, 3, 4, 5, 6]);
    const invalidFrom = pointers.length;
    tap('7');
    assert.equal(read('PLAYER'), 0, 'invalid hex cannot teleport the player');
    fastUntil(() => read('WAITING') === 1);
    assert.ok(seen('ROOM_TEXT', invalidFrom));
    const commandFrom = pointers.length;
    tap('M');
    fastUntil(() => read('WAITING') === 1);
    assert.equal(read('PLAYER'), 0, 'invalid command cannot corrupt the cave');
    assert.ok(seen('ROOM_TEXT', commandFrom));
    assert.deepEqual(bytes('DISPLAY', 10), [0x7f, 0x7f, 0x7f, 0x24, 0x12, 0, 0x03, 0x7f, 0x7f, 0x7f]);
    // Move 0 -> 2. Cave 5 is adjacent to 2 and contains bats.
    const warningFrom = pointers.length;
    tap('2');
    fastUntil(() => read('WAITING') === 1);
    assert.equal(read('PLAYER'), 2);
    assert.ok(seen('BATS_CLOSE', warningFrom));
    assert.ok(seen('PIT_CLOSE', warningFrom));
    // Aiming may be cancelled; a held throw key cannot cancel itself.
    tap('=', 800);
    ready(2);
    assert.equal(read('CANS'), 3);
    tap('=');
    fastUntil(() => read('PHASE') === 1 && read('WAITING') === 1);
    assert.equal(read('CANS'), 3);
    assert.deepEqual(bytes('GAS', 3), [255, 255, 255]);
    layout([0, 2, 3, 4, 6, 7]);
    tap('='); ready(2);
    const winFrom = pointers.length;
    tap('2'); until(() => read('PHASE') === 4);
    assert.ok(seen('HUG_TEXT', winFrom));
    const oldLayout = bytes('PLAYER', 6);
    tap('='); fastUntil(() => read('PHASE') === 1 && read('WAITING') === 1);
    assert.equal(read('CANS'), 3);
    assert.equal(new Set(bytes('PLAYER', 6)).size, 6);
    assert.notDeepEqual(bytes('PLAYER', 6), oldLayout);
    assert.deepEqual(bytes('GAS', 3), [255, 255, 255]);
    // Stepping into a pit displays the reason, then repeats YOU LOSE.
    layout([0, 15, 2, 4, 6, 7]);
    const pitFrom = pointers.length;
    tap('2'); until(() => read('PHASE') === 3);
    fastUntil(() => seen('LOSE_TEXT', pitFrom));
    assert.ok(seen('PIT_TEXT', pitFrom));
    const repeatFrom = pointers.length;
    fastUntil(() => seen('LOSE_TEXT', repeatFrom));
    tap('='); fastUntil(() => read('PHASE') === 1 && read('WAITING') === 1);
    assert.equal(read('CANS'), 3);
    assert.ok(h.minSp() >= 0x1f80);
    assert.ok(m.cpu.pc >= s.START && m.cpu.pc < s.CODE_END);
    t.diagnostic(`code/data ${s.CODE_END - s.START} B + font ${s.FONT_END - s.FONT} B; variables ${s.VARS_END - s.VARS} B; deepest stack ${s.STACK_TOP - h.minSp()} B`);
    run(20);
  });

  test(`${label}: scroll states, 252 ms steps, fivefold acceleration and RNG`, t => {
    const h = setup(board, fw);
    const { m, s, tap, until, pointers, run, put, read, bytes, call } = h;
    tap('A');
    until(() => pointers.length >= 5);
    // Select adjacent pointer updates within one message; message transitions are excluded.
    const durations = [];
    for (let i = 1; i < pointers.length; i++) {
      if (pointers[i].ptr === pointers[i - 1].ptr + 1 &&
          !Object.keys(messages).some(name => s[name] === pointers[i - 1].ptr)) {
        durations.push((pointers[i].cycles - pointers[i - 1].cycles) / 2000);
      }
    }
    assert.ok(durations.length >= 3);
    for (const ms of durations) assert.ok(Math.abs(ms - 252) <= 252 * 0.05, `normal step ${ms} ms`);
    m.pressKey('R');
    const from = pointers.length;
    until(() => pointers.length >= from + 5);
    m.releaseKey('R'); run(10);
    const fast = [];
    for (let i = from + 1; i < pointers.length; i++) if (pointers[i].ptr === pointers[i - 1].ptr + 1 &&
        !Object.keys(messages).some(name => s[name] === pointers[i - 1].ptr)) {
      fast.push((pointers[i].cycles - pointers[i - 1].cycles) / 2000);
    }
    assert.ok(fast.length >= 3);
    for (const ms of fast) assert.ok(Math.abs(ms - 50.4) <= 50.4 * 0.05, `fast step ${ms} ms`);
    h.fastUntil(() => read('WAITING') === 1);
    const player = read('PLAYER');
    m.pressKey('R'); run(1500); m.releaseKey('R'); run(10);
    h.fastUntil(() => read('WAITING') === 1);
    assert.equal(read('PLAYER'), player);
    // Independent reference for chained ADC carries, including overflowing intermediate sums.
    let state = [0x83, 0x11, 0x7a, 0xf1, 0xe3];
    state.forEach((v, i) => m.write(s.RNG + i, v));
    for (let n = 0; n < 40; n++) {
      const first = state[0] + state[3] + 1;
      const second = (first & 255) + state[4] + (first >> 8);
      state = [second & 255, ...state.slice(0, 4)];
      assert.equal(call('RANDOM'), state[0]);
      assert.deepEqual(bytes('RNG', 5), state);
    }
    const seeds = [];
    for (const tick of [0, 1, 100, 257]) {
      for (let i = 0; i < 5; i++) m.write(s.RNG + i, 255);
      put('TICK', tick & 255); m.write(s.TICK + 1, tick >> 8);
      call('SEED');
      assert.notDeepEqual(bytes('RNG', 5), [255, 255, 255, 255, 255]);
      seeds.push(bytes('RNG', 5));
    }
    assert.notDeepEqual(seeds[1], seeds[2]);
    t.diagnostic(`normal ${durations.map(v => v.toFixed(3)).join(', ')} ms; held ${fast.map(v => v.toFixed(3)).join(', ')} ms`);
  });

  test(`${label}: every message holds its first window for 1.5 s, or 0.3 s with a held key`, t => {
    const h = setup(board, fw);
    const { m, s, put, pointers, pointer, run, until, bytes, layout } = h;
    layout([0, 15, 3, 4, 6, 7]);
    const measured = [[], []];
    for (const held of [false, true]) for (const name of Object.keys(messages)) {
      const ending = ['LOSE_TEXT', 'EATEN_TEXT', 'PIT_TEXT', 'GAS_TEXT', 'EMPTY_TEXT'].includes(name);
      put('PHASE', name === 'HUG_TEXT' ? 4 : ending ? 3 : 1);
      m.cpu.sp = s.STACK_TOP - 2;
      m.write(m.cpu.sp, s.WAIT_LOOP & 255);
      m.write(m.cpu.sp + 1, s.WAIT_LOOP >> 8);
      m.cpu.h = s[name] >> 8; m.cpu.l = s[name] & 255;
      m.cpu.pc = s.SHOW;
      const from = pointers.length;
      if (held) m.pressKey('R');
      run(5);
      assert.equal(pointer(), s[name], name);
      const first = bytes('DISPLAY', 10);
      if (name === 'WUMPUS_CLOSE') {
        assert.equal(first[3], 0x15, 'message W uses active-low f,b,g,d');
        assert.equal(h.screen()[3], 0x6a, 'message W reaches the physical display');
      }
      run(held ? 275 : 1395);
      assert.equal(pointer(), s[name], `${name}: first window must remain in place`);
      assert.deepEqual(bytes('DISPLAY', 10), first, `${name}: first window must remain lit`);
      until(() => pointers.length >= from + 2, 300);
      const ms = (pointers[from + 1].cycles - pointers[from].cycles) / 2000;
      const target = held ? 300 : 1500;
      assert.equal(pointers[from + 1].ptr, s[name] + 1);
      assert.ok(Math.abs(ms - target) <= target * 0.05, `${name}: first window ${ms} ms`);
      measured[Number(held)].push(ms);
      m.releaseKey('R');
      run(10);
    }
    t.diagnostic(`first windows ${Math.min(...measured[0]).toFixed(3)}-${Math.max(...measured[0]).toFixed(3)} ms; held ${Math.min(...measured[1]).toFixed(3)}-${Math.max(...measured[1]).toFixed(3)} ms`);
  });

  test(`${label}: every last window pauses before returning, including held-key acceleration`, t => {
    const h = setup(board, fw);
    const { m, s, put, pointers, pointer, run, until, bytes, layout } = h;
    layout([0, 15, 3, 4, 6, 7]);
    const measured = [[], []];
    for (const held of [false, true]) for (const [name, text] of Object.entries(messages)) {
      const ending = ['LOSE_TEXT', 'EATEN_TEXT', 'PIT_TEXT', 'GAS_TEXT', 'EMPTY_TEXT'].includes(name);
      put('PHASE', name === 'HUG_TEXT' ? 4 : ending ? 3 : 1);
      m.cpu.sp = s.STACK_TOP - 2;
      m.write(m.cpu.sp, s.WAIT_KEY & 255); m.write(m.cpu.sp + 1, s.WAIT_KEY >> 8);
      m.cpu.h = s[name] >> 8; m.cpu.l = s[name] & 255;
      m.cpu.pc = s.SHOW;
      const last = s[name] + text.length - 6;
      m.pressKey('R');
      until(() => pointer() === last);
      const begin = pointers.at(-1).cycles;
      if (!held) m.releaseKey('R');
      run(5);
      const finalWindow = bytes('DISPLAY', 10);
      run(held ? 270 : 1380);
      assert.equal(pointer(), last, name);
      assert.equal(m.read(s.WAITING), 0, `${name}: SHOW must still be holding its last window`);
      assert.deepEqual(bytes('DISPLAY', 10), finalWindow);
      until(() => m.read(s.WAITING) === 1, 300);
      const ms = (m.cycles - begin) / 2000;
      const target = held ? 300 : 1500;
      assert.ok(Math.abs(ms - target) <= target * 0.05, `${name}: last window ${ms} ms`);
      measured[Number(held)].push(ms);
      m.releaseKey('R'); run(10);
      if (name === 'ROOM_TEXT') {
        run(1700);
        assert.equal(m.read(s.WAITING), 1, 'location keeps waiting for a fresh key');
        assert.deepEqual(bytes('DISPLAY', 10), finalWindow);
      }
    }
    t.diagnostic(`last windows ${Math.min(...measured[0]).toFixed(3)}-${Math.max(...measured[0]).toFixed(3)} ms; held ${Math.min(...measured[1]).toFixed(3)}-${Math.max(...measured[1]).toFixed(3)} ms`);
  });

  test(`${label}: gas, third miss, bat transport and hazard priority`, () => {
    const h = setup(board, fw);
    const { m, s, read, put, bytes, tap, ready, until, layout, seen, pointers, fastUntil, call } = h;
    h.begin();
    layout([0, 15, 3, 4, 6, 7], [2, 255, 255]);
    let from = pointers.length;
    tap('2'); until(() => read('PHASE') === 3);
    assert.ok(seen('GAS_TEXT', from));
    tap('='); fastUntil(() => read('PHASE') === 1 && read('WAITING') === 1);
    // The final miss ends immediately, before Wumpus gets another move.
    layout([0, 15, 3, 4, 6, 7]); put('CANS', 1);
    tap('='); ready(2);
    from = pointers.length;
    tap('2'); until(() => read('PHASE') === 3);
    assert.equal(read('CANS'), 0);
    assert.equal(read('GAS'), 2);
    assert.equal(read('WUMPUS'), 15);
    assert.ok(seen('EMPTY_TEXT', from));
    tap('='); fastUntil(() => read('PHASE') === 1 && read('WAITING') === 1);
    // The first miss consumes one can and always moves Wumpus along one of its tunnels.
    layout([0, 15, 3, 4, 6, 7]);
    tap('='); ready(2);
    from = pointers.length;
    tap('2');
    fastUntil(() => read('PHASE') === 1 && read('WAITING') === 1);
    assert.equal(read('CANS'), 2);
    assert.equal(bytes('GAS', 3)[2], 2);
    assert.ok(map[15].includes(read('WUMPUS')));
    assert.ok(seen('MISSED', from));
    // Bat relocation rejects all old locations, including the cave just entered.
    layout([0, 15, 3, 4, 2, 7]);
    from = pointers.length;
    tap('2');
    fastUntil(() => read('WAITING') === 1);
    assert.ok(seen('BAT_SNATCH', from));
    assert.ok(![2, 15, 3, 4, 7].includes(read('PLAYER')));
    assert.deepEqual(bytes('WUMPUS', 5), [15, 3, 4, 2, 7]);
    // Two bats next to the same cave must generate two warnings in reverse neighbour order.
    layout([8, 5, 3, 4, 2, 5]);
    from = pointers.length;
    tap('0');
    fastUntil(() => read('WAITING') === 1);
    assert.equal(pointers.slice(from).filter(p => p.ptr === s.BATS_CLOSE).length, 2);
    assert.ok(!seen('WUMPUS_CLOSE', from), 'a bat hides Wumpus in the warning sequence');
    // Supply an overlapping room directly to HAZARD, using the actual CPU.
    put('WUMPUS', 5); put('PIT1', 5); put('BAT1', 5); put('BAT2', 7);
    m.cpu.a = 5;
    assert.equal(call('HAZARD'), 4, 'bats hide both a pit and Wumpus');
    put('BAT1', 6);
    m.cpu.a = 5;
    assert.equal(call('HAZARD'), 2, 'a pit hides Wumpus');
    // Direction is precisely TICK & 3; moving never leaves Wumpus in its old cave.
    for (let cave = 0; cave < 16; cave++) for (let direction = 0; direction < 4; direction++) {
      put('WUMPUS', cave); put('TICK', 0x80 + direction);
      call('MOVE_WUMPUS');
      assert.equal(read('WUMPUS'), map[cave][direction]);
    }
    assert.equal(m.cpu.halted, false);
    assert.ok(h.minSp() >= 0x1f80);
  });

  test(`${label}: bump stay/escape branches and bats may land safely in gas`, () => {
    const h = setup(board, fw);
    const { m, s, read, bytes, tap, ready, until, layout, seen, pointers, fastUntil } = h;
    // Stop exactly before the random decision, after all scrolling and key seeding.
    const decision = (symbol, rng) => {
      m.pressKey('R');
      let steps = 0;
      while (m.cpu.pc !== s[symbol]) { m.cpu.step(); assert.ok(++steps < 2000000); }
      rng.forEach((v, i) => m.write(s.RNG + i, v));
      m.releaseKey('R');
    };
    h.begin();
    layout([0, 2, 3, 4, 6, 7]);
    let from = pointers.length;
    tap('2');
    assert.ok(seen('BUMP', from));
    decision('RANDOM', [0, 0, 0, 0, 0]); // Next random nibble is 1: stay and eat.
    until(() => read('PHASE') === 3);
    assert.equal(read('WUMPUS'), 2);
    assert.ok(seen('EATEN_TEXT', from));
    h.run(10); // Let the released acceleration key rearm the keyboard.
    tap('='); fastUntil(() => read('PHASE') === 1 && read('WAITING') === 1);
    layout([0, 2, 3, 4, 6, 7]);
    from = pointers.length;
    tap('2');
    decision('RANDOM', [4, 0, 0, 0, 0]); // Next nibble is 5: escape to a neighbour.
    fastUntil(() => read('WAITING') === 1);
    assert.equal(read('PHASE'), 1);
    assert.equal(read('PLAYER'), 2);
    assert.ok(map[2].includes(read('WUMPUS')));
    assert.ok(!seen('EATEN_TEXT', from));
    ready(1);
    layout([0, 15, 3, 4, 2, 7], [1, 255, 255]);
    from = pointers.length;
    tap('2');
    decision('RELOCATE', [0, 0, 0, 0, 0]); // Relocation chooses cave 1, with gas.
    fastUntil(() => read('WAITING') === 1);
    assert.equal(read('PHASE'), 1);
    assert.equal(read('PLAYER'), 1);
    assert.equal(bytes('GAS', 3)[0], 1);
    assert.ok(seen('BAT_SNATCH', from));
    assert.ok(!seen('GAS_TEXT', from));
    assert.equal(m.cpu.halted, false);
  });
}

test('board variants differ only in digit selection, with equal instruction timing', () => {
  const load = suffix => assemble(fs.readFileSync(new URL(`programs/wumpus/wumpus-${suffix}.asm`, root), 'utf8'));
  const a = load('savia'), b = load('stone1');
  assert.deepEqual(a.errors, []); assert.deepEqual(b.errors, []);
  assert.deepEqual(a.symbols, b.symbols);
  const aa = a.blocks.flatMap(block => [...block.bytes]), bb = b.blocks.flatMap(block => [...block.bytes]);
  const differences = aa.flatMap((v, i) => v === bb[i] ? [] : [i]);
  assert.equal(differences.length, 1);
  assert.equal(aa[differences[0]], 0); assert.equal(bb[differences[0]], 0x2f);
});

// ---------------------------------------------------------------------------------------------
// The PMI-80 version: factory monitor only. It shows its texts through the monitor's DISP routine
// (the ROM's character table is its font) and so has no display or key code of its own.
// ---------------------------------------------------------------------------------------------
const pmiRom = fs.readFileSync(new URL('roms/pmi80/pmi80_monitor.bin', root));
const pmiProfile = BOARD_PROFILES.pmi80;
const pmiFw = pmiProfile.firmware[0];
// What each character looks like on the factory monitor's display (PA, 0 = lit); 9 shows without
// its tail and U without the upper left segment, as in the ROM's table.
const pmiGlyph = {
  ' ': 0x7f, '-': 0x3f, '?': 0x2c,
  '0': 0x40, '1': 0x79, '2': 0x24, '3': 0x30, '4': 0x19, '5': 0x12,
  '6': 0x02, '7': 0x78, '8': 0x00, '9': 0x18,
  A: 0x08, B: 0x03, C: 0x46, D: 0x21, E: 0x06, F: 0x0e, G: 0x42,
  H: 0x09, I: 0x7b, L: 0x47, M: 0x48, N: 0x2b, O: 0x23, P: 0x0c,
  R: 0x2f, S: 0x12, T: 0x07, U: 0x61, W: 0x63, Y: 0x11,
};
const pmiMessages = {
  ROOM_TEXT: ' YOU ARE IN 0 - TUNNELS LEAD TO 0000 ',
  BUMP: ' OOPS - BUMPED A WUMPUS  ', MISSED: ' MISSED - ONLY 0 CANS LEFT ',
  LOSE_TEXT: ' YOU LOSE ', QUERY: ' ROOM?   ', WUMPUS_CLOSE: ' WUMPUS CLOSE',
  PIT_CLOSE: ' PIT CLOSE', BATS_CLOSE: ' BATS CLOSE ', EAT_TEXT: ' HA HA WUMPUS GOT YOU ',
  SNATCH: ' SUPERBAT SNATCH ', PIT_TEXT: ' YYIIEEE FELL IN PIT ',
  GAS_TEXT: ' GAS IN ROOM ', EMPTY_TEXT: ' OUT OF GAS ',
  HUG_TEXT: '     GREAT- YOU GET A HUG FROM WUMPUS ', TITLE: ' WUMPUS  ',
};
// Butterfield's generator, written independently of the assembler source.
const pmiNext = st => {
  const t = st[0] + st[3] + 1;
  const n = (t + st[4] + (t >> 8)) & 255;
  return { value: n, state: [n, st[0], st[1], st[2], st[3]] };
};

// By default the title is dismissed after waiting `wait` ms with the key `key`; { title: true }
// leaves the program on the title.
function pmiSetup({ title = false, wait = 500, key = 'A' } = {}) {
  const data = fs.readFileSync(new URL('programs/wumpus/wumpus-pmi80.asm', root));
  const asm = assemble(data.toString('utf8'));
  assert.deepEqual(asm.errors, []);
  const s = asm.symbols;
  const m = pmiFw.create({ pmi80: pmiRom });
  const at = ms => Math.round(ms * pmiProfile.clockHz / 1000);
  const run = ms => { m.run(at(ms)); assert.equal(m.cpu.halted, false); };
  const read = name => m.read(s[name]);
  const put = (name, value) => m.write(s[name], value);
  const bytes = (name, n) => Array.from({ length: n }, (_, i) => m.read(s[name] + i));
  let active = false, minSp = s.STACK_TOP, lastPc = 0;
  const writes = new Set();
  const pointers = [];
  const pointer = () => m.read(0x1ffc) | (m.read(0x1ffd) << 8);
  const bus = m.cpu.bus.write;
  m.cpu.bus.write = (addr, value) => {
    const pc = m.cpu.pc;
    if (!active && pc >= s.START && pc < s.IMAGE_END) active = true;
    if (active) {
      const stack = addr >= s.VARS_END && addr < s.STACK_TOP;
      const own = (addr >= s.VARS && addr < s.VARS_END) || addr === 0x1ffc || addr === 0x1ffd
        || addr === s.CAVE || addr === s.LEFT_N || (addr >= s.ADJ && addr < s.ADJ + 4);
      if (pc < 0x400) assert.ok(stack || addr === 0x1ffe, `monitor wrote ${addr.toString(16)}`);
      else assert.ok(stack || own, `game wrote ${addr.toString(16)}`);
      writes.add(addr);
      minSp = Math.min(minSp, m.cpu.sp);
    }
    bus(addr, value);
    if (active && addr === 0x1ffd) pointers.push({ ptr: pointer(), cycles: m.cycles });
  };
  const step = m.cpu.step.bind(m.cpu);
  m.cpu.step = () => {
    const pc = m.cpu.pc;
    if (pc >= s.START && pc < s.IMAGE_END) lastPc = pc;
    step();
  };
  startProgram(m, { id: 'wumpus-pmi80', board: 'pmi80', format: 'asm', start: '1C00' }, data, {
    bootStates: at(pmiProfile.bootMs), holdStates: at(pmiFw.holdMs), runKeys: pmiFw.runKeys,
  });
  assert.ok(active);
  const until = (condition, maxMs = 30000) => {
    const begin = m.cycles;
    while (!condition() && m.cycles - begin < at(maxMs)) run(1);
    assert.ok(condition(), `timeout at PC ${m.cpu.pc.toString(16)}`);
  };
  // True while the game waits in KEY for a key to be pressed (the first scan loop).
  const waiting = () => lastPc >= s.KEY1 && lastPc < s.KEY1 + 7;
  const ready = () => until(waiting);
  const tap = (key, hold = 30) => { m.pressKey(key); run(hold); m.releaseKey(key); run(10); };
  const screen = () => {
    m.display.takeFrame(m.cycles); run(20);
    return litMasks(m.display.takeFrame(m.cycles), 9);
  };
  const lit = text => [...text].map(c => ~pmiGlyph[c] & 0x7f);
  const layout = ([player, wumpus, pit1, pit2, bat1, bat2], gas = [255, 255, 255]) => {
    [player, wumpus, pit1, pit2, bat1, bat2, ...gas].forEach((v, i) => m.write(s.PLAYER + i, v));
    map[player].forEach((v, i) => m.write(s.ADJ + i, v));
    put('CANS', 3);
  };
  const seen = (symbol, from = 0) => pointers.slice(from).some(p => p.ptr === s[symbol]);
  // Stops exactly before the generator is called, then sets its state and carries on.
  const decision = (symbol, state) => {
    let steps = 0;
    m.cpu.step(); // a second call in a row waits for the next call of the routine
    while (m.cpu.pc !== s[symbol]) { m.cpu.step(); assert.ok(++steps < 3000000); }
    state.forEach((v, i) => m.write(s.RNG + i, v));
  };
  const call = name => {
    const returnPc = m.cpu.pc, returnSp = m.cpu.sp;
    m.cpu.sp -= 2;
    m.write(m.cpu.sp, returnPc & 255); m.write(m.cpu.sp + 1, returnPc >> 8);
    m.cpu.pc = s[name];
    let steps = 0;
    do { m.cpu.step(); assert.ok(++steps < 100000); } while (m.cpu.pc !== returnPc);
    assert.equal(m.cpu.sp, returnSp);
    return m.cpu.a;
  };
  if (!title) { ready(); run(wait); tap(key); }
  return { m, s, asm, data, at, run, read, put, bytes, pointers, pointer, until, waiting, ready,
    tap, screen, lit, layout, seen, decision, call, writes, minSp: () => minSp };
}

test('pmi80 factory: assembles, fits, keeps the original map, texts and signature', () => {
  const src = fs.readFileSync(new URL('programs/wumpus/wumpus-pmi80.asm', root), 'utf8');
  const asm = assemble(src);
  assert.deepEqual(asm.errors, []);
  const s = asm.symbols;
  assert.match(src, /version 0\.1\.0:/);
  assert.equal(s.START, 0x1c00);
  assert.ok(s.IMAGE_END <= s.VARS, `image end ${s.IMAGE_END.toString(16)}`);
  assert.ok(s.VARS_END < s.STACK_TOP - 16, 'room for the stack above the variables');
  assert.equal(s.STACK_TOP, 0x1fd9);
  const block = [...asm.blocks].sort((a, b) => a.addr - b.addr).at(-1);
  assert.equal(block.addr + block.bytes.length, s.IMAGE_END);
  assert.deepEqual([...block.bytes.slice(-12)], [...Buffer.from('Wolf2026v010')]);
  assert.equal(s.SIGNATURE, s.IMAGE_END - 12);
  const image = new Uint8Array(0x10000);
  for (const b of asm.blocks) image.set(b.bytes, b.addr);
  assert.deepEqual([...image.subarray(s.MAP, s.MAP + 64)], map.flat());
  for (const [symbol, text] of Object.entries(pmiMessages)) {
    assert.ok(text.length >= 9, `${symbol} must fill the nine-character window`);
    const codes = [...image.subarray(s[symbol], s[symbol] + text.length + 1)];
    assert.equal(codes.at(-1), 0xff, `${symbol} terminator`);
    [...text].forEach((c, i) => assert.equal(pmiRom[0x1be + codes[i]], pmiGlyph[c], `${symbol}[${i}] ${c}`));
  }
  assert.equal(s.ADJ - s.ROOM_TEXT, 32);
  assert.equal(s.CAVE - s.ROOM_TEXT, 12);
  assert.equal(s.LEFT_N - s.MISSED, 15);
  // Only DISP of the monitor is called; no I/O instruction and no font of its own.
  assert.equal(s.DISP, 0x0140);
  assert.ok(!/\bOUT\b|\bIN\b/.test(src.replace(/;.*$/gm, '')), 'no port access in the game');
});

test('pmi80 factory: the title waits for any key and the waiting time makes the layout', () => {
  const places = h => h.bytes('PLAYER', 6);
  const play = (wait, key = 'A') => {
    const h = pmiSetup({ title: true });
    h.ready();
    assert.equal(h.pointer(), h.s.TITLE);
    assert.deepEqual(h.screen(), h.lit(' WUMPUS  '));
    h.run(wait);
    assert.equal(h.pointer(), h.s.TITLE, 'the title stays until a key');
    h.tap(key);
    h.ready();
    assert.equal(new Set(places(h)).size, 6);
    assert.equal(h.read('CANS'), 3);
    assert.deepEqual(h.bytes('ADJ', 4), map[h.read('PLAYER')], 'the key started the game, it did not move');
    return places(h);
  };
  const a = play(300), b = play(700), c = play(1300);
  assert.notDeepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.notDeepEqual(b, c);
  assert.deepEqual(play(300), a, 'the same waiting time gives the same layout');
  // Any key starts it, a function key as well as a hex one.
  assert.equal(new Set(play(300, 'EX')).size, 6);
  assert.equal(new Set(play(300, '7')).size, 6);
});

test('pmi80 factory: start, 252 ms scrolling in a nine-character window, warnings, move', t => {
  const h = pmiSetup();
  const { m, s, read, tap, ready, layout, pointers, screen } = h;
  ready();
  assert.equal(new Set(h.bytes('PLAYER', 6)).size, 6);
  h.bytes('PLAYER', 6).forEach(v => assert.ok(v >= 0 && v < 16));
  assert.deepEqual(h.bytes('GAS', 3), [255, 255, 255]);
  assert.equal(read('CANS'), 3);
  // The last window of a message stays and is shown by the monitor's own DISP.
  const lastWindow = m.read(0x1ffc) | (m.read(0x1ffd) << 8);
  assert.ok(lastWindow > 0x1c00 && lastWindow < s.IMAGE_END);
  // Player 2, warnings after the move to cave 0: bats in 11, a pit in 8, the Wumpus in 5.
  layout([2, 5, 8, 13, 11, 14]);
  const from = pointers.length;
  tap('0');
  ready();
  assert.equal(read('PLAYER'), 0);
  const order = pointers.slice(from).map(p => p.ptr).filter((p, i, a) => i === 0 || a[i - 1] !== p);
  const starts = order.filter(p => [s.BATS_CLOSE, s.PIT_CLOSE, s.WUMPUS_CLOSE, s.ROOM_TEXT].includes(p));
  assert.deepEqual(starts, [s.BATS_CLOSE, s.PIT_CLOSE, s.WUMPUS_CLOSE, s.ROOM_TEXT]);
  assert.deepEqual(h.bytes('CAVE', 1), [0]);
  assert.deepEqual(h.bytes('ADJ', 4), [2, 5, 8, 11]);
  // The ROOM_TEXT scroll: 28 steps of 252 ms; the last window stays on the display.
  const room = pointers.slice(from).filter(p => p.ptr >= s.ROOM_TEXT && p.ptr <= s.ROOM_TEXT + 28);
  assert.deepEqual(room.map(p => p.ptr), Array.from({ length: 29 }, (_, i) => s.ROOM_TEXT + i).slice(0, room.length));
  assert.equal(room.length, 29);
  for (let i = 1; i < room.length; i++) {
    const ms = (room[i].cycles - room[i - 1].cycles) / pmiProfile.clockHz * 1000;
    assert.ok(ms > 252 * 0.95 && ms < 252 * 1.05, `step ${i}: ${ms.toFixed(1)} ms`);
  }
  assert.equal(h.pointer(), s.ROOM_TEXT + 28);
  assert.deepEqual(screen(), h.lit(' TO 258B '));
  assert.ok(h.minSp() >= s.VARS_END);
  t.diagnostic(`image ${s.IMAGE_END - s.START} B, variables ${s.VARS_END - s.VARS} B, deepest stack ${s.STACK_TOP - h.minSp()} B`);
});

test('pmi80 factory: invalid keys change nothing, pit, gas and bats', () => {
  const h = pmiSetup();
  const { m, s, read, tap, ready, layout, pointers, seen, decision, until } = h;
  ready();
  layout([2, 15, 7, 9, 12, 14]);
  // A cave that is not a neighbour and a command key both replay the message, nothing moves.
  let from = pointers.length;
  tap('7');
  ready();
  assert.equal(read('PLAYER'), 2);
  assert.ok(seen('ROOM_TEXT', from));
  from = pointers.length;
  tap('EX');
  ready();
  assert.equal(read('PLAYER'), 2);
  assert.ok(seen('ROOM_TEXT', from));
  // A key held through the scrolling is not a new key: it counts only after it is released and
  // pressed again.
  tap('7');
  m.pressKey('3');
  h.run(9000);
  m.releaseKey('3');
  h.run(100);
  assert.equal(read('PLAYER'), 2);
  ready();
  // Walking into a gassed cave loses at once.
  layout([2, 15, 7, 9, 12, 14], [3, 255, 255]);
  from = pointers.length;
  tap('3');
  until(() => seen('LOSE_TEXT', from));
  assert.ok(seen('GAS_TEXT', from));
  assert.equal(read('PLAYER'), 3);
});

test('pmi80 factory: a pit ends the game and YOU LOSE repeats; bats carry you to a free cave', () => {
  const h = pmiSetup();
  const { m, s, read, tap, ready, layout, pointers, seen, decision, until } = h;
  ready();
  layout([2, 15, 3, 9, 12, 14]);
  let from = pointers.length;
  tap('3');
  until(() => seen('LOSE_TEXT', from));
  assert.ok(seen('PIT_TEXT', from));
  const again = pointers.length;
  until(() => pointers.slice(again).filter(p => p.ptr === s.LOSE_TEXT).length >= 2);
  assert.equal(h.waiting(), false, 'the keys are not read after the end');
  // Bats in 3 and the player in 2: the player lands in a cave that is none of the six places.
  const h2 = pmiSetup();
  h2.ready();
  h2.layout([2, 15, 7, 9, 3, 14], [4, 255, 255]);
  from = h2.pointers.length;
  h2.tap('3');
  h2.until(() => h2.seen('SNATCH', from));
  h2.decision('PICK', [0, 0, 0, 0, 0]);   // the generator gives 1; the gas cave 4 is fine, 1 is free
  h2.ready();
  assert.equal(h2.read('PLAYER'), 1);
  assert.ok(!h2.seen('GAS_TEXT', from));
  h2.layout([2, 15, 7, 9, 3, 14], [4, 255, 255]);
  from = h2.pointers.length;
  h2.tap('3');
  h2.until(() => h2.seen('SNATCH', from));
  h2.decision('PICK', [3, 0, 0, 0, 0]);   // the generator gives 4: gas does not matter to bats
  h2.until(() => h2.seen('SNATCH', from) && h2.waiting());
  assert.equal(h2.read('PLAYER'), 4);
  assert.ok(!h2.seen('GAS_TEXT', from));
  assert.ok(h2.minSp() >= h2.s.VARS_END);
});

test('pmi80 factory: bumping the Wumpus, throwing cans, winning and losing', () => {
  const stateFor = (want) => {
    for (let a = 0; a < 256; a++) for (let b = 0; b < 256; b++) {
      if (pmiNext([a, 0, 0, 0, b]).value === want) return [a, 0, 0, 0, b];
    }
    throw new Error('no state');
  };
  // Bump: the generator value 1 (< 4) keeps the Wumpus, which eats you.
  let h = pmiSetup();
  h.ready();
  h.layout([2, 0, 7, 9, 12, 14]);
  let from = h.pointers.length;
  h.tap('0');
  h.until(() => h.seen('BUMP', from));
  h.decision('RANDOM', stateFor(1));
  h.until(() => h.seen('LOSE_TEXT', from));
  assert.ok(h.seen('EAT_TEXT', from));
  assert.equal(h.read('WUMPUS'), 0);
  // Bump: 5 (>= 4) wakes it up; the next value & 3 picks the neighbour of cave 0: 2 5 8 11 (index 3 = 11).
  h = pmiSetup();
  h.ready();
  h.layout([2, 0, 7, 9, 12, 14]);
  from = h.pointers.length;
  h.tap('0');
  h.until(() => h.seen('BUMP', from));
  h.decision('RANDOM', stateFor(5));
  h.decision('RANDOM', stateFor(3));
  h.ready();
  assert.equal(h.read('WUMPUS'), 11);
  assert.equal(h.read('PLAYER'), 0);
  assert.ok(!h.seen('EAT_TEXT', from));
  // Throws: a miss moves the Wumpus and shows ONLY n CANS LEFT; the third miss is OUT OF GAS.
  h = pmiSetup();
  h.ready();
  h.layout([0, 15, 3, 4, 6, 7]);
  h.tap('=');
  h.ready();
  assert.equal(h.pointer(), h.s.QUERY);
  assert.deepEqual(h.screen(), h.lit(' ROOM?   '));
  from = h.pointers.length;
  h.tap('2');
  h.ready();
  assert.equal(h.read('CANS'), 2);
  assert.deepEqual(h.bytes('GAS', 3), [255, 255, 2]);
  assert.ok(h.seen('MISSED', from));
  assert.equal(h.read('LEFT_N'), 2);
  assert.ok([4, 7, 10, 13].includes(h.read('WUMPUS')));
  h.tap('=');
  h.ready();
  h.tap('5');
  h.ready();
  assert.equal(h.read('CANS'), 1);
  assert.equal(h.read('LEFT_N'), 1);
  assert.deepEqual(h.bytes('GAS', 3), [255, 5, 2]);
  const target = [2, 5, 8, 11].find(c => c !== h.read('WUMPUS') && c !== 5 && c !== 2);
  from = h.pointers.length;
  h.tap('=');
  h.ready();
  h.tap(target.toString(16).toUpperCase());
  h.until(() => h.seen('LOSE_TEXT', from));
  assert.ok(h.seen('EMPTY_TEXT', from));
  assert.equal(h.read('CANS'), 0);
  // Win: a hit ends in the hug, repeated; the Wumpus is not moved.
  h = pmiSetup();
  h.ready();
  h.layout([0, 5, 3, 4, 6, 7]);
  h.tap('=');
  h.ready();
  from = h.pointers.length;
  h.tap('5');
  h.until(() => h.seen('HUG_TEXT', from));
  assert.equal(h.read('WUMPUS'), 5);
  const hug = h.pointers.length;
  h.until(() => h.pointers.slice(hug).filter(p => p.ptr === h.s.HUG_TEXT).length >= 1);
  assert.equal(h.waiting(), false);
  // A throw that makes the Wumpus walk into you (index 0 of cave 2's neighbours 0 1 3 5 is cave 0).
  h = pmiSetup();
  h.ready();
  h.layout([0, 2, 3, 4, 6, 7]);
  h.tap('=');
  h.ready();
  h.m.pressKey('5');
  h.decision('RANDOM', stateFor(4));
  h.m.releaseKey('5');
  h.until(() => h.seen('EAT_TEXT', 0));
  assert.equal(h.read('WUMPUS'), 0);
});

test('pmi80 factory: the generator is the original\'s five-byte recurrence', () => {
  const h = pmiSetup();
  h.ready();
  let st = [0x12, 0x34, 0x56, 0x78, 0x9a];
  st.forEach((v, i) => h.m.write(h.s.RNG + i, v));
  for (let i = 0; i < 40; i++) {
    const n = pmiNext(st);
    assert.equal(h.call('RANDOM'), n.value);
    st = n.state;
    assert.deepEqual(h.bytes('RNG', 5), st);
  }
  // Waiting for a key stirs the generator with the time spent, and a pick avoids all six places.
  h.layout([2, 5, 8, 13, 11, 14]);
  for (let i = 0; i < 30; i++) assert.ok(![2, 5, 8, 13, 11, 14].includes(h.call('PICK')));
  assert.ok(h.writes.has(0x1ffe), 'the monitor keeps its key variable');
  assert.ok([...h.writes].every(a => a < 0x1fd9 || a === 0x1ffc || a === 0x1ffd || a === 0x1ffe));
});
