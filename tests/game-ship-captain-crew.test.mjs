// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { assemble } from '../src/asm/asm8080.js';
import { BOARD_PROFILES } from '../src/board/profiles.js';
import { startProgram } from '../src/machine/programs.js';
import { Glow } from '../src/machine/display.js';

const root = new URL('../', import.meta.url);
const files = { pmi80: 'pmi80/pmi80_monitor.bin', pmi80c: 'pmi80/pmi80c_monitor.bin',
  pmi80cgames: 'pmi80/pmi80c_games.bin', savia84: 'savia84/savia84_monitor.bin',
  stonepmi: 'stone1/stone_pmi.bin' };
const roms = Object.fromEntries(Object.entries(files).map(([k, f]) => [k, fs.readFileSync(new URL('roms/' + f, root))]));
test('Ship catalog names, hashes and standalone binary/HEX exports match the sources', () => {
  const catalog = JSON.parse(fs.readFileSync(new URL('programs/catalog.json', root)));
  const entries = catalog.programs.filter(p => p.id.startsWith('ship-captain-crew-'));
  assert.equal(entries.length, 3);
  const readme = fs.readFileSync(new URL('programs/README.md', root), 'utf8');
  for (const p of entries) {
    assert.equal(p.name.cs, 'Loď, kapitán, posádka');
    assert.equal(p.version, '0.1.0');
    assert.ok(p.help.cs.includes('SHIP') && p.help.en.includes('rounds'));
    const source = fs.readFileSync(new URL('programs/' + p.file, root));
    assert.ok(source.toString().includes('version ' + p.version));
    assert.ok(readme.includes(crypto.createHash('sha256').update(source).digest('hex')));
    const a = assemble(source.toString());
    assert.deepEqual(a.errors, []);
    const bin = fs.readFileSync(new URL('programs/' + p.file.replace('.asm', '.bin'), root));
    assert.deepEqual([...bin], [...a.blocks[0].bytes]);
    // The signature ends the image where RAM allows; the PMI-80 has no room for it.
    if (p.board === 'pmi80') assert.ok(!bin.includes('Wolf'));
    else assert.equal(bin.subarray(-12).toString('latin1'), 'Wolf2026v' + p.version.replaceAll('.', ''));
    const lines = fs.readFileSync(new URL('programs/' + p.file.replace('.asm', '.hex'), root), 'utf8').trim().split(/\r?\n/);
    const payload = [];
    for (const line of lines) {
      const record = Buffer.from(line.slice(1), 'hex');
      assert.equal([...record].reduce((sum, v) => sum + v, 0) & 255, 0);
      if (record[3] === 0) payload.push(...record.subarray(4, 4 + record[0]));
    }
    assert.deepEqual(payload, [...bin]);
  }
});
function setup(board, fw) {
  const profile = BOARD_PROFILES[board];
  const suffix = board === 'savia84' ? 'savia' : board;
  const data = fs.readFileSync(new URL(`programs/ship-captain-crew/ship-captain-crew-${suffix}.asm`, root));
  const a = assemble(data.toString());
  assert.deepEqual(a.errors, []);
  const s = a.symbols;
  assert.ok(s.VARS_END <= 0x1ff0);
  const m = fw.create(roms);
  const at = ms => Math.round(ms * profile.clockHz / 1000);
  const run = ms => { m.run(at(ms)); assert.equal(m.cpu.halted, false); };
  let active = false;
  const write = m.cpu.bus.write;
  m.cpu.bus.write = (addr, value) => {
    if (m.cpu.pc >= s.START && m.cpu.pc < s.CODE_END) active = true;
    if (active) assert.ok((addr >= s.VARS && addr < s.VARS_END) || (addr >= 0x1ff0 && addr < s.STACK_TOP), `unexpected write ${addr.toString(16)}`);
    write(addr, value);
  };
  startProgram(m, { board, format: 'asm', start: s.START.toString(16) }, data,
    { bootStates: at(profile.bootMs), holdStates: at(fw.holdMs), runKeys: fw.runKeys });
  run(2500);
  const read = name => m.read(s[name]);
  const put = (name, v) => m.write(s[name], v);
  const bytes = (name, n) => Array.from({ length: n }, (_, i) => m.read(s[name] + i));
  const tap = key => { m.pressKey(key); run(60); m.releaseKey(key); run(40); };
  const call = name => {
    m.cpu.sp = s.STACK_TOP - 2;
    m.write(m.cpu.sp, s.MAIN & 255); m.write(m.cpu.sp + 1, s.MAIN >> 8);
    m.cpu.pc = s[name];
    let steps = 0;
    do { m.cpu.step(); assert.ok(++steps < 15000, name); } while (m.cpu.pc !== s.MAIN);
  };
  const dice = values => values.forEach((v, i) => m.write(s.DICE + i, v));
  const settle = () => { // Execute real code, shortening only animation dwell for bulk matches.
    let steps = 0;
    while (m.cpu.pc !== s.MAIN) {
      if (m.cpu.pc === s.DELAY_LOOP) { m.cpu.d = 0; m.cpu.e = 1; }
      m.cpu.step(); assert.ok(++steps < 20000);
    }
    run(40);
  };
  const choose = (players, rounds) => { tap(String(players)); settle(); tap(String(rounds)); settle(); };
  const masks = () => bytes('DISPLAY', 9).map(v => v & 127);
  return { m, s, read, put, bytes, masks, tap, call, dice, run, settle, choose, at };
}
for (const board of ['pmi80', 'savia84', 'stone1']) for (const fw of BOARD_PROFILES[board].firmware) {
  test(`${board}/${fw.id}: horizontal roll counter progresses 0/1/2/3 and resets per turn`, () => {
    const {choose,tap,bytes,read,settle,m,s,run}=setup(board,fw);
    choose(2,2);
    assert.equal(bytes('DISPLAY',9)[1],0x7f);
    assert.deepEqual(bytes('DICE',5),[0,0,0,0,0]);
    for(const expected of [0x77,0x37,0x36]) {
      tap('='); assert.equal(bytes('DISPLAY',9)[1],expected);
      const output=m.cpu.bus.output; let writes=0;
      m.cpu.bus.output=(p,v)=>{
        output(p,v);
        if((p&255)===0xf8 && m.cpu.pc===s.DWELL_LOOP-2 && m.cpu.b===1){
          assert.equal(v,expected);writes++;
        }
      };
      run(700);m.cpu.bus.output=output;assert.ok(writes>50,'roll counter stays steady over blink phases');
    }
    settle();assert.equal(read('PLAYER'),2);assert.equal(bytes('DISPLAY',9)[1],0x7f);
    for(let roll=0;roll<3;roll++)tap('=');
    settle();assert.equal(read('ROUNDS_LEFT'),1);assert.equal(read('PLAYER'),1);
    assert.equal(bytes('DISPLAY',9)[1],0x7f,'new round starts with no rolls');
  });
  test(`${board}/${fw.id}: early bank and round information do not count as rolls`, () => {
    for(const count of [1,2]) {
      const {choose,tap,put,call,bytes,read,settle}=setup(board,fw);
      choose(2,2);
      for(let i=0;i<count;i++)tap('=');
      const marker=count===1?0x77:0x37;
      tap('A');assert.equal(bytes('DISPLAY',9)[1],marker);settle();
      assert.equal(read('LEFT'),3-count);assert.equal(bytes('DISPLAY',9)[1],marker);
      put('BANKED',3);put('SCORE',7);call('DRAW');
      tap('S');assert.equal(bytes('DISPLAY',9)[1],marker);
      settle();assert.equal(read('PLAYER'),2);assert.equal(bytes('DISPLAY',9)[1],0x7f);
    }
  });
  test(`${board}/${fw.id}: failed turns never animate unqualified dice as cargo`, () => {
    for (let banked=0; banked<3; banked++) {
      const {choose,put,dice,m,s,settle,read,bytes}=setup(board,fw);
      choose(2,2); put('BANKED',banked); put('SCORE',0); dice([6,5,2,3,1]);
      const out=m.cpu.bus.output;
      m.cpu.bus.output=(p,v)=>{
        out(p,v);
        if((p&255)===0xf8 && m.cpu.pc===s.DWELL_LOOP-2)
          assert.equal((m.read(s.DISPLAY+5)|m.read(s.DISPLAY+6))&128,0,
            `unqualified cargo blink with ${banked} banked dice`);
      };
      m.cpu.sp=s.STACK_TOP-2;
      m.write(m.cpu.sp,s.MAIN&255); m.write(m.cpu.sp+1,s.MAIN>>8);
      m.cpu.pc=s.FINISH; settle();
      assert.equal(read('PLAYER'),2); assert.deepEqual(bytes('SCORES',2),[0,0]);
    }
  });
  test(`${board}/${fw.id}: continuous idle scan keeps player and score synchronized`, () => {
    const { choose, tap, run, m, s } = setup(board,fw);
    choose(2,2); tap('=');
    const out=m.cpu.bus.output; let frame=[], frames=0;
    m.cpu.bus.output=(p,v)=>{
      out(p,v);
      if((p&255)!==0xf8 || m.cpu.pc!==s.DWELL_LOOP-2)return;
      if(m.cpu.b===0)frame=[];
      frame[m.cpu.b]=v;
      if(m.cpu.b!==8 || frame[0]===undefined)return;
      const off=frame[0]===127;
      assert.equal(frame[7]===127,off,`score tens at frame ${frames}`);
      assert.equal(frame[8]===127,off,`score ones at frame ${frames}`);
      frames++;
    };
    run(15000); assert.ok(frames>2000);
  });
  test(`${board}/${fw.id}: prompts, limits and confirmation on the right`, () => {
    const { m, s, tap, read, bytes, masks, settle, run } = setup(board, fw);
    assert.deepEqual(Array.from({ length: 7 }, (_, i) => m.read(s.SHIP + i)), [127,127,18,9,121,12,127]);
    assert.equal(read('STATE'), 0);
    tap('0'); tap('A'); assert.equal(read('STATE'), 0);
    tap('9'); assert.equal(read('PLAYERS'), 9);
    assert.equal(bytes('DISPLAY',9)[8], 0x90, 'confirmation is tagged for blinking');
    settle(); assert.equal(read('STATE'),4);
    tap('9'); assert.equal(read('STATE'),4, 'round count must not exceed eight');
    tap('8'); assert.equal(bytes('DISPLAY',9)[8],0x80);
    settle(); assert.equal(read('STATE'),1); assert.equal(read('ROUNDS'),8);
    assert.equal(masks()[1],0x7f);
    tap('0'); tap('E'); assert.equal(read('LEFT'),3, 'old control keys do nothing');
    m.pressKey('='); run(700); m.releaseKey('='); run(40);
    assert.equal(read('LEFT'),2,'a held roll key rolls once');
  });
  test(`${board}/${fw.id}: 9 players x 8 rounds, cumulative 96 and automatic advance`, () => {
    const { choose, read, put, tap, settle, bytes, masks } = setup(board, fw);
    choose(9,8);
    for(let round=1;round<=8;round++) for(let player=1;player<=9;player++) {
      assert.equal(read('PLAYER'),player);
      assert.equal(read('ROUNDS_LEFT'),9-round);
      const total=12*(round-1);
      const font=[64,121,36,48,25,18,2,120,0,16];
      assert.deepEqual(masks().slice(7),[font[Math.floor(total/10)],font[total%10]]);
      put('BANKED',3); put('SCORE',12);
      tap('S'); settle();
    }
    assert.equal(read('STATE'),3); assert.equal(read('WINNER'),0);
    assert.equal(read('BEST'),96); assert.deepEqual(bytes('SCORES',9),Array(9).fill(96));
    assert.deepEqual(masks().slice(7),[0x10,0x02]);
    tap('='); assert.equal(read('PLAYER'),1); assert.equal(read('ROUNDS_LEFT'),8);
    assert.deepEqual(bytes('SCORES',9),Array(9).fill(0));
  });
  test(`${board}/${fw.id}: bank order and lower cargo are preserved`, () => {
    const { choose, put, dice, call, read, tap, bytes, settle } = setup(board,fw);
    choose(2,2);
    tap('S'); assert.equal(read('PLAYER'),1); assert.equal(read('LEFT'),3);
    for (const [values, banked, score] of [
      [[5,4,1,2,3],0,0], [[4,5,2,6,6],3,8], [[6,6,1,2,3],1,0], [[6,4,1,2,3],1,0],
    ]) {
      put('BANKED',0); dice(values); call('QUALIFY');
      assert.equal(read('BANKED'),banked); assert.equal(read('SCORE'),score);
    }
    put('BANKED',1); dice([6,4,3,5,2]); call('QUALIFY');
    assert.equal(read('BANKED'),3); assert.equal(read('SCORE'),5);
    dice([6,5,4,1,1]); call('QUALIFY'); assert.equal(read('SCORE'),2);
    tap('='); assert.deepEqual(bytes('DICE',3),[6,5,4]);
    put('BANKED',0); put('LEFT',1); tap('='); settle();
    assert.equal(read('PLAYER'),2, 'third roll advances without another key');
  });
  test(`${board}/${fw.id}: slow cargo/total animations, timed r display, ignored held keys`, t => {
    const { choose, put, dice, call, read, tap, bytes, run, m, at, masks } = setup(board,fw);
    choose(2,2);
    put('BANKED',3); dice([6,5,4,2,3]); call('QUALIFY'); call('DRAW');
    tap('S');
    assert.deepEqual(bytes('DISPLAY',9).map(v=>!!(v&128)),[false,false,false,false,false,true,true,false,false]);
    assert.equal(bytes('SCORES',2)[0],0, 'score is not credited before cargo animation');
    const start=m.cycles;
    while(bytes('SCORES',2)[0]===0 && m.cycles-start<at(3000))run(5);
    assert.equal(bytes('SCORES',2)[0],5); run(10);
    assert.deepEqual(masks().slice(7),[64,18]);
    assert.deepEqual(bytes('DISPLAY',9).map(v=>!!(v&128)),[false,false,false,false,false,false,false,true,true]);
    m.pressKey('='); run(2200); m.releaseKey('='); run(40);
    assert.equal(read('PLAYER'),2); assert.equal(read('LEFT'),3, 'held animation key cannot roll for next player');
    const before=masks(), infoStart=m.cycles;
    tap('A'); assert.deepEqual(masks().slice(7),[0x2f,0x79]);
    while(masks()[7]===0x2f && m.cycles-infoStart<at(2200))run(5);
    const infoMs=(m.cycles-infoStart)*1000/BOARD_PROFILES[board].clockHz;
    assert.ok(infoMs>=1400 && infoMs<=2100, `round display duration ${infoMs} ms`);
    t.diagnostic(`Round display: ${Math.round(infoMs)} ms including key debounce`);
    assert.deepEqual(masks(),before); assert.equal(read('LEFT'),3);
  });
  test(`${board}/${fw.id}: each bank size and both blink phases at real I/O pins`, () => {
    const { choose, put, dice, call, m, s } = setup(board,fw);
    choose(1,1); dice([6,5,4,2,3]);
    const out=m.cpu.bus.output; let col, trace=[];
    m.cpu.bus.output=(p,v)=>{out(p,v);if((p&255)===0xfa)col=board==='savia84'?v&15:(~v)&15;
      if((p&255)===0xf8 && m.cpu.pc===s.DWELL_LOOP-2)trace.push([col,v]);};
    for(let banked=0;banked<=3;banked++)for(const phase of [0,64]) {
      put('BANKED',banked); call('DRAW'); put('TICKS',(phase-1)&255); trace=[];call('SCAN');
      assert.equal(trace.length,9);
      for(let i=0;i<9;i++) {
        const blinking=i===0 || i>=7 || (i>=2 && i<2+banked);
        const expected=phase&&blinking?127:m.read(s.DISPLAY+i)&127;
        assert.deepEqual(trace[i],[i,expected]);
      }
    }
  });
}
test('die reduction is balanced and waiting before the first selection affects the first roll', () => {
  const fw=BOARD_PROFILES.pmi80.firmware[0];
  const h=setup('pmi80',fw);h.put('RNG',1);
  const histogram=Array(7).fill(0);
  for(let i=0;i<252;i++){h.call('DIE');histogram[h.m.cpu.a]++;}
  assert.deepEqual(histogram,[0,42,42,42,42,42,42]);
  const rolls=new Set();
  for(const wait of [0,37,93,181,323]) {
    const x=setup('pmi80',fw);x.run(wait);x.choose(1,1);x.tap('=');rolls.add(x.bytes('DICE',5).join(','));
  }
  assert.ok(rolls.size>=3, 'first-selection timing must survive later confirmation delays');
});
test('Savia visible brightness remains synchronized after UI persistence filtering', () => {
  const h=setup('savia84',BOARD_PROFILES.savia84.firmware[0]);
  h.choose(2,2); h.tap('=');
  const glow=new Glow(72,60000); // the UI's 30 ms at 2 MHz
  h.m.display.takeFrame(h.m.cycles);
  let mismatches=0, maxConsecutive=0;
  for(let i=0;i<900;i++) {
    h.run(1000/60);
    const level=glow.update(h.m.display.takeFrame(h.m.cycles),h.m.cycles);
    const brightness=d=>Math.sqrt(Math.min(1,Math.max(...level.slice(d*8,d*8+7))/0.09));
    const left=brightness(0)>0.4;
    const same=left===(brightness(7)>0.4) && left===(brightness(8)>0.4);
    mismatches=same?0:mismatches+1;maxConsecutive=Math.max(maxConsecutive,mismatches);
  }
  assert.ok(maxConsecutive<=2,`visible mismatch lasts ${maxConsecutive} video frames`);
});

