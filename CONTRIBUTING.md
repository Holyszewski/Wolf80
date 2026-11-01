# Contributing to Wolf80

Bug reports, ideas and pull requests are welcome, and so are facts about the real boards: a
measurement, a photo, a ROM dump or a page of documentation that the emulator could be checked
against.

## Contributor License Agreement

Before a pull request can be merged, you need to agree to the
[Contributor License Agreement](CLA.md) once. You keep the copyright to your work. The CLA allows
the author to publish the project, with your contribution, under other terms besides the GPL, for
example a commercial license. Versions already published under the GPL stay under the GPL.

To agree, add this comment to your pull request:

> I have read the Wolf80 CLA (version 1.0) and I agree to it.

## Pull requests

- Keep code, comments, documentation and commit messages in English.
- Plain ES modules, no third-party packages, Node.js 20 or newer.
- Run the tests of the part you changed (`node --test tests/<file>.test.mjs`), or all of them with
  `npm test`; after a change to the user interface, build it with `node tools/build.mjs` and try it
  (`node tools/serve.mjs 8780`, then http://127.0.0.1:8780/).
- New source files start with the same two lines as the existing ones: the
  `SPDX-License-Identifier: GPL-3.0-or-later` line and the copyright line.
- Mention any code or data you took from elsewhere, with its source and license.
- A ROM image or a program by another author goes to `roms/` or `programs/` with a note on its
  author and origin (see the README in each folder) and is not covered by the project license.

## Translations

The user interface is English with a Czech switch. All its texts live in `src/ui/i18n.js`, in an
`en` and a `cs` catalogue; English is the fallback. `tests/i18n.test.mjs` checks that both
catalogues have the same keys and that every key the page uses exists.
