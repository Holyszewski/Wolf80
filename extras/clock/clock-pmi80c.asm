; Clock for the PMI-80 with the PMI-80 C monitor, version 0.1.0: hours, minutes and seconds
; as HH-MM-SS, short enough to type in by hand (61 bytes).
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
; Needs the PMI-80 C monitor (Nostalcomp's): the time comes from the length of its DISP
; routine, which is shorter than the factory one. With the factory monitor this version
; loses about 9 %; use clock-pmi80.asm there. It is clock-pmi80.asm with other trimming.
; Timing at 10 MHz / 9: one second is exactly 1 111 111 states (the clock gives 1 111 111.1,
; so the program loses 0.1 ppm, about 3 s a year; the crystal's tolerance matters far more).
; One round of the main loop is 836 states plus 445 rounds of the wait loop of 2495 states
; (DISP without a key, CALL included, takes 2435). The increment has no conditional jumps, so
; every second is equally long, the ones that carry into minutes, hours or a new day too.
; RAM: image 1C00h-1C3Ch, the time 1D00h-1D02h; 1FEEh (the monitor's breakpoint byte,
; harmless unless a breakpoint is set) receives a dash that is not shown; stack as the
; monitor left it (SP 1FD9h, 8 bytes used).
;
; Versions:
; 0.1.0  first version

HEX2    EQU 00C6h       ; monitor: A -> the codes of its two hex digits at (BC), BC+2
DISP    EQU 0140h       ; monitor: one scan of the display through the pointer 1FFCh (1FEFh)
DASH    EQU 1Fh         ; the monitor's character code of a dash
TIME    EQU 1D00h       ; hours, minutes, seconds in BCD

        ORG 1C00h
; The limits of hours, minutes and seconds, 100h below the time they belong to. As
; instructions (INR H, MOV H,B, MOV H,B) they do no harm at the start.
LIMITS: DB 24h,60h,60h

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
        MOV A,M         ; +7 states (21 in all), trimming the second
        MOV A,L
        CPI 3
        JNZ UNPACK

; One second of display: 445 scans.
        LXI D,445
WAIT:   CALL DISP
        XTHL            ; +18 states, trimming the second; the second XTHL undoes the first
        XTHL            ; +18
        DCX D
        MOV A,D
        ORA E
        JNZ WAIT        ; ends with E = 0: add one second
        NOP             ; +4

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
