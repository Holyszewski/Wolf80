# Third-party files

This folder holds files by other authors that are used only locally, for testing. Except for this README, its contents are ignored by git and are not part of the project or of its license.

- `cpu-tests/`: CP/M CPU test programs for the 8080 (TST8080, 8080PRE, CPUTEST, 8080EXM), run with `node tools/cpu-exercise.mjs third_party/cpu-tests/<file>.COM`. Source: https://altairclone.com/downloads/cpu_tests/ (downloaded 2026-10-18). `tests/cpu-programs.test.mjs` runs the quick ones when they are present.

  | File | Size | SHA-256 |
  |---|---|---|
  | +README.TXT | 1192 | `76d9e7d867f905f3c4c63a1d7e9e9f5360c026d1b79f1816fb25e2dcd748ada5` |
  | TST8080.COM | 1536 | `9561c6fb6c99efe3de00eb77e4044fd102151058b39ac2d7bce10483838a08e7` |
  | TST8080.ASM | 14657 | `d9f405470a0ec9bb9368bcbef015b0bbb326c3d673ce7ddfc48ba2d978e44940` |
  | 8080PRE.COM | 1024 | `18eb3c79cba42c0718f160be6a1853cb64cdce7aa47d65780189a57bdd98c4e0` |
  | 8080PRE.MAC | 4818 | `ca1507444929978038ad4f83d18e13bcce72072df2b850932b3982c31cfc1ccc` |
  | CPUTEST.COM | 19200 | `e61a9a75348c774486c2207080ea4effbf6c2367fdace31b0731081a4144030b` |
  | 8080EXM.COM | 4608 | `6e3286e11bb1a8f47b8ee1280b4a067be813193363e3223c99b0d21912f44aeb` |
  | 8080EXM.MAC | 29411 | `806d3a069b0021e9925c0b7c26fd74a3c397ca7f618a599ab4a8396ebcd1f3f3` |

- `cpu-tests/`, Z80: the instruction exercisers ZEXDOC (documented flags) and ZEXALL (all flag bits) by Frank D. Cringle (1994, GPL-2.0-or-later), run with `node tools/cpu-exercise.mjs --z80 third_party/cpu-tests/zexdoc.com` (about 160 s each); `tests/cpu-programs.test.mjs` does not run them. Source: https://github.com/anotherlin/z80emu, folder `testfiles` (downloaded 2026-10-24 with the maintainer's consent). Both passed all 67 groups on 2026-10-24.

  | File | Size | SHA-256 |
  |---|---|---|
  | zexdoc.com | 8704 | `34923a7ed82285d3038b2d54bd64899e12173eebb61f9d07b4fc72e78af2ae8f` |
  | zexdoc.z80 | 40283 | `4f7b83d5ed1b4ce34f1b6f19b996e40588e3698db9aa2e31bece377db5b91d99` |
  | zexall.com | 8704 | `6e2da55147a04f28d303d5da6a1e6b771557ac244653590a0f24a2d39c8537e8` |
  | zexall.z80 | 40283 | `495f686b3f4418d50a110ba6ae4c6d86d715506e1eb6117040bd6f1eb4e011c5` |
