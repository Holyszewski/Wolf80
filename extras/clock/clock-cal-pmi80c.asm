; Calibrated clock for the PMI-80 with the PMI-80 C monitor, version 0.1.0: hours, minutes and
; seconds as HH-MM-SS, with a correction for the board's own crystal (93 bytes).
;
; SPDX-License-Identifier: GPL-3.0-or-later
; Copyright (C) 2026 Matěj "Wolf" Holyszewski
; Written with the help of AI.
;
; Use: type the program in from 1C00 (M 1C00 =, then each byte and =). Write the start time
; in BCD, as it reads: 1D00 = hours (00-23), 1D01 = minutes, 1D02 = seconds; 14:30:00 is
; 14, 30, 00. Then RE, = and EX 1C00 =. RE stops it; the time stays at 1D00-1D02.
; Do not press keys while it runs (RE excepted): a key held down shortens the monitor's DISP
; and the clock gains for as long as it is held.
; Start it with EX: the EX command blanks the display, which keeps the rightmost digit dark.
;
; The correction is the last two bytes of the program, 1C5B-1C5C, in BCD as it reads. As
; typed in, 50 00, it does nothing: the clock runs exactly as clock-pmi80c.asm. Otherwise it
; is 50.00 plus the seconds a day that clock gains on the board (minus the seconds it loses),
; 00.00 to 99.99: a board on which it gains 20.81 s a day takes 70 81, one on which it loses
; 4.5 s takes 45 50. If this clock still gains or loses, add the seconds it gains a day
; (subtract those it loses). One step is 0.01 s a day; the range is -50 to +49.99 s a day
; (about +-580 ppm). Measure over several days with the board in its usual place: the
; crystal's frequency moves a little with its temperature. How to work the correction out,
; step by step and with examples: README.md in this folder.
;
; Needs the PMI-80 C monitor (Nostalcomp's); use clock-cal-pmi80.asm with the factory monitor.
; Timing at 10 MHz / 9: a second is 1 110 468 states, plus 1286 states (1/100 s a day)
; in those seconds in which the correction, added to a running fraction at 1D03-1D04 (in
; BCD), passes 99.99; with 50.00 every other second, 1 111 111 states on average. One round
; of the main loop is 1668 states plus 450 rounds of the wait loop of 2464 states (DISP
; without a key, CALL included, takes 2435). The increment has no conditional jumps, so the
; seconds that carry into minutes, hours or a new day are as long as the others.
; RAM: image 1C00h-1C5Ch, the time 1D00h-1D02h, the fraction 1D03h-1D04h (cleared at the
; start); 1FEEh (the monitor's breakpoint byte, harmless unless a breakpoint is set)
; receives a dash that is not shown; stack as the monitor left it (SP 1FD9h, 8 bytes used).
;
; Versions:
; 0.1.0  first version

HEX2    EQU 00C6h       ; monitor: A -> the codes of its two hex digits at (BC), BC+2
DISP    EQU 0140h       ; monitor: one scan of the display through the pointer 1FFCh (1FEFh)
DASH    EQU 1Fh         ; the monitor's character code of a dash
TIME    EQU 1D00h       ; hours, minutes, seconds in BCD
FRAC    EQU 1D03h       ; the fraction of the correction, in BCD
FINE0   EQU 50          ; rounds of the fine delay in every second, trimming it

        ORG 1C00h
; The limits of hours, minutes and seconds, 100h below the time they belong to. As
; instructions (INR H, MOV H,B, MOV H,B) they do no harm at the start.
LIMITS: DB 24h,60h,60h
        LXI H,0
        SHLD FRAC       ; the fraction from 00.00

; The time into the display buffer as -HH-MM-SS from 1FEEh: positions 0-7 show HH-MM-SS, the
; leading dash falls on 1FEEh, before the buffer.
LOOP:   LXI H,TIME
        LXI B,1FEEh
UNPACK: MVI A,DASH
        STAX B
        INX B
        MOV A,M
        CALL HEX2
        INX H
        MOV A,A         ; +5 states (15 in all), trimming the second
        MOV A,L
        CPI 3
        JNZ UNPACK

; One second of display: 450 scans.
        LXI D,450
WAIT:   CALL DISP
        MOV A,A         ; +5
        DCX D
        MOV A,D
        ORA E
        JNZ WAIT        ; ends with E = 0: add one second

; The correction into the fraction, in BCD; when the fraction passes 99.99, this second is
; 1286 states longer.
        LXI B,CORR+1    ; the low bytes
        INX H           ; 1D04h
        LDAX B
        ADD M
        DAA
        MOV M,A
        DCX B           ; the high bytes
        DCX H           ; 1D03h, as the increment wants it
        LDAX B
        ADC M
        DAA
        MOV M,A         ; CY = past 99.99
        MVI A,FINE0
        JNC FINE
        MVI A,FINE0+85  ; 7 + 4 + 85 rounds of 15 = 1286 states more
        NOP
FINE:   DCR A
        JNZ FINE

; Seconds, minutes, hours: add E+1 (1 or 0) in BCD, compare with the limit; at the limit the
; field becomes 00 and the next one gets 1.
INC:    DCX H
        MOV A,E         ; E = 00h: add 1; E = FFh: add nothing
        INR A
        ADD M
        DAA
        MOV M,A
        DCR H           ; the limit, 100h lower
        CMP M           ; CY = below the limit
        INR H
        SBB A           ; FFh below the limit, 00h at it
        MOV E,A         ; the carry into the next field
        ANA M
        MOV M,A         ; 00 at the limit
        MOV A,L
        ORA A
        JNZ INC         ; until the hours (1D00h) are done
        JMP LOOP

; The correction: 50.00 plus the seconds a day the plain clock gains on this board.
CORR:   DB 50h,00h
