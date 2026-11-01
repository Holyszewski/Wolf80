// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// CREDITS.txt beside the EXE: who made the monitors and the programs inside it, for the user
// (tools/build-desktop.mjs). The monitors are written in the template desktop/CREDITS-desktop.txt;
// the programs come from programs/catalog.json, so a new program is credited without further work.

const BOARDS = { pmi80: 'PMI-80', savia84: 'Savia-84', stone1: 'Stone 1' };
const FIRMWARE = { factory: 'factory monitor', pmi80c: 'PMI-80 C monitor', stone1: 'Stone 1 monitor', 'stone-pmi': 'STONE-PMI monitor' };

const en = text => (typeof text === 'string' ? text : text.en);

// a name with its Czech form when that differs (the Czech UI shows it): Micro Organ (Mikrovarhany)
const programName = entry => (typeof entry.name === 'string' || entry.name.cs === entry.name.en
  ? en(entry.name) : `${entry.name.en} (${entry.name.cs})`);

function wrap(text, indent, width = 90) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && indent.length + line.length + 1 + word.length > width) { lines.push(indent + line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  return [...lines, indent + line].join('\n');
}

export function programCredits(catalog) {
  return Object.entries(BOARDS).map(([board, title]) => {
    const items = catalog.programs.filter(p => p.board === board).map(p => {
      const only = p.firmware ? ` - with the ${p.firmware.map(f => FIRMWARE[f] ?? f).join(' or ')}` : '';
      return `  ${programName(p)}${only}\n${wrap(en(p.author), '      ')}`;
    });
    return `${title}\n${items.join('\n')}`;
  }).join('\n\n');
}

export function creditsText(template, catalog, version) {
  return template.replace('{version}', version).replace('{programs}', programCredits(catalog));
}
