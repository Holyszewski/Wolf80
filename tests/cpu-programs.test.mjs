// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// Runs the quick third-party CP/M CPU test programs when they are present locally in
// third_party/cpu-tests/ (they are not in the repository; see third_party/README.md).
// The long 8080EXM is run by hand: node tools/cpu-exercise.mjs third_party/cpu-tests/8080EXM.COM
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runCom } from '../tools/cpu-exercise.mjs';

const dir = fileURLToPath(new URL('../third_party/cpu-tests/', import.meta.url));

const PROGRAMS = [
  { file: 'TST8080.COM', expect: 'CPU IS OPERATIONAL' },
  { file: '8080PRE.COM', expect: '8080 Preliminary tests complete' },
  { file: 'CPUTEST.COM', expect: 'CPU TESTS OK', also: 'CPU IS 8080/8085' },
];

for (const p of PROGRAMS) {
  const path = dir + p.file;
  test(p.file, { skip: !fs.existsSync(path) && 'not present in third_party/cpu-tests' }, () => {
    const r = runCom(fs.readFileSync(path), { maxStates: 1e9 });
    assert.ok(r.text.includes(p.expect), r.text);
    if (p.also) assert.ok(r.text.includes(p.also), r.text);
    assert.equal(r.pc, 0, 'the program should end by jumping to 0000');
  });
}
