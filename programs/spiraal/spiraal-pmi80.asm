; Spiraal for the PMI-80, version 0.1.1: a port of Spiraal by A. W. den Hartog
; (De 6502 Kenner 25, KIM Gebruikers Club Nederland, February 1983) from the KIM-1.
;
; SPDX-License-Identifier: GPL-3.0-or-later
; Copyright (C) 2026 Matěj "Wolf" Holyszewski
; Game design: A. W. den Hartog, De 6502 Kenner 25, 1983.
; Written anew for the Wolf80 project with the help of AI.
;
; Left: 0; right: 3. React after the spiral finishes, as late as possible.
; Early or missing reactions award the opponent a point; scores wrap at 99.
; Title on positions 2-8; spiral and LL  RR score on positions 2-7.
; Release the launch key, then press any key. = restarts the match.
; Changes: continuous display, title/start interlock, blank separator, independent keys.
; Changes: 13 logical 512-us ticks per reaction quantum; PMI-80 event sounds.
; Cooperative audio edges can jitter during the fastest drawing updates.
; Target: PMI-80, Intel 8080 at 10 MHz / 9, factory or PMI-80 C monitor.
; Intel 8080 syntax for src/asm/asm8080.js; no monitor calls or Z80 extensions.
; RAM: program 1C00h-1F00h; variables 1F30h-1F52h; stack 1F60h-1F7Fh.
; Start: EX 1C00 =. End: RE.
;
; Versions:
; 0.1.1  append the Wolf2026v011 binary signature
; 0.1.0  first version

        ORG 1C00h
START:  DI
        LXI SP,1F80h
        MVI A,8Ah
        OUT 0FBh
        XRA A
        LXI H,VARS
        MVI B,VARS_END-VARS
INIT:   MOV M,A
        INX H
        DCR B
        JNZ INIT
        CALL CLEAR
        LXI H,TITLE
        LXI D,DISPLAY+2
        MVI B,7
TCOPY:  MOV A,M
        STAX D
        INX H
        INX D
        DCR B
        JNZ TCOPY
TITLE_WAIT: LXI H,2930
        CALL WAIT
RELEASE: LXI H,9
        CALL WAIT
        LDA ANYKEY
        ORA A
        JNZ RELEASE
READY:  LXI H,9
        CALL WAIT
        LDA ANYKEY
        ORA A
        JZ READY
NEW_GAME: LXI SP,1F80h
        MVI A,1
        STA STARTED
        STA LOCK
        STA EQLOCK
        XRA A
        STA SCORE_L
        STA SCORE_R
        STA TONE_LEFT
        STA TONE_PHASE
        STA TONE_MASK
        MVI A,0FFh
        STA PLAYER
        STA SPEED
NEXT:   CALL CLEAR
        LDA PLAYER
        XRI 0FFh
        STA PLAYER
        ORA A
        MVI A,0
        JZ FIRST
        MVI A,19
FIRST:  STA SEGMENT
        MVI A,20
        STA REMAIN
DRAW:   LDA SPEED
        MOV L,A
        MVI H,0
        DAD H
        MOV A,L
        CPI 8
        JNC DRAW_WAIT
        MOV A,H
        ORA A
        JNZ DRAW_WAIT
        MVI L,8
DRAW_WAIT: CALL DRAW_DELAY
ADD_SEGMENT: LDA SEGMENT
        MOV E,A
        MVI D,0
        LXI H,PATH_DIGIT
        DAD D
        MOV C,M
        LXI H,PATH_MASK
        DAD D
        MOV A,M
        MVI B,0
        LXI H,DISPLAY
        DAD B
        ORA M
        MOV M,A
        LDA REMAIN
        DCR A
        STA REMAIN
        JZ EARLY
        LDA PLAYER
        ORA A
        LDA SEGMENT
        JNZ BACKWARD
        INR A
        JMP ADVANCE
BACKWARD: DCR A
ADVANCE: STA SEGMENT
        JMP DRAW
; The completed spiral must not be refreshed until after this test.
EARLY:  CALL OWN
        JNZ LOSS
WINDOW: LXI H,13
        CALL REACTION_WAIT
        LDA SPEED
        DCR A
        STA SPEED
        JZ LOSS
        CALL OWN
        JZ WINDOW
        MVI A,1
        STA LOCK
        MVI A,80h
        STA TONE_STEP
        XRA A
        STA TONE_PHASE
        MVI A,40h
        STA TONE_MASK
        MVI A,60
        STA TONE_LEFT
        JMP NEXT
LOSS:   MVI A,1
        STA LOCK
        LDA PLAYER
        ORA A
        LXI H,SCORE_R
        JZ POINT
        LXI H,SCORE_L
POINT:  MOV A,M
        ADI 1
        DAA
        MOV M,A
        CALL CLEAR
        LXI H,DISPLAY+2
        LDA SCORE_L
        CALL DECIMAL
        LXI H,DISPLAY+6
        LDA SCORE_R
        CALL DECIMAL
        MVI A,40h
        STA TONE_STEP
        XRA A
        STA TONE_PHASE
        MVI A,40h
        STA TONE_MASK
        MVI A,60
        STA TONE_LEFT
SCORE_WAIT: LXI H,3063
        CALL WAIT
        MVI A,0FFh
        STA SPEED
        JMP NEXT

; Packed BCD, standard monitor digit shapes (including 0 and 7).
DECIMAL: MOV C,A
        RRC
        RRC
        RRC
        RRC
        CALL DIGIT
        MOV M,A
        INX H
        MOV A,C
        CALL DIGIT
        MOV M,A
        RET
DIGIT:  PUSH H
        ANI 0Fh
        MOV E,A
        MVI D,0
        LXI H,DIGITS
        DAD D
        MOV A,M
        POP H
        RET
CLEAR:  LXI H,DISPLAY
        MVI B,9
        XRA A
CL:     MOV M,A
        INX H
        DCR B
        JNZ CL
        RET
; A reaction is consumed once; release of all keys rearms both players.
OWN:    LDA LOCK
        ORA A
        JZ OWN_READY
        XRA A
        RET
OWN_READY: LDA PLAYER
        ORA A
        LDA ROWS
        JZ LEFT_KEY
        LDA ROWS+8
        ANI 20h
        RET
LEFT_KEY: ANI 40h
        RET

; Debit CPU work between waits, in units of 1/125 of a 500-us slot.
; 118 units = 472 us (8080); H/L advance by 80h/40h per scan slot.
REACTION_WAIT: MVI A,118
        JMP DEBIT_WAIT
DRAW_DELAY: MVI A,118
DEBIT_WAIT: MOV B,A
        LDA FRACTION
        SUB B
        JNC DEBIT_READY
        ADI 128
        DCX H
        MOV C,A
; The same elapsed slot is debited from an already running tone.
        LDA TONE_LEFT
        CPI 60
        JZ TONE_DEBIT_DONE
        CPI 2
        JC TONE_DEBIT_DONE
        DCR A
        STA TONE_LEFT
TONE_DEBIT_DONE: MOV A,C
DEBIT_READY: STA FRACTION
        JMP WAIT

; Convert 512-us logical ticks to 500-us slots: N + floor(3*N/125).
; Carry the division remainder across calls, avoiding cumulative rounding drift.
; Drawing: max(2*S,8) ticks; reaction: 13; score: 3063; title: 2930.
WAIT:   PUSH H
        DAD H
        POP D
        DAD D
        LDA FRACTION
        MOV C,A
        MVI B,0
        DAD B
CONVERT: MOV A,H
        ORA A
        JNZ SUB125
        MOV A,L
        CPI 125
        JC CONVERTED
SUB125: LXI B,0FF83h
        DAD B
        INX D
        JMP CONVERT
CONVERTED: MOV A,L
        STA FRACTION
        LDA COLUMN
        MOV C,A
        LDA SUMKEY
        MOV B,A
WAIT_LOOP: CALL SLOT
        LDA STARTED
        ORA A
        JZ TITLE_TICK
        LDA ROWS+8
        ANI 10h
        JZ EQ_UP
        LDA EQLOCK
        ORA A
        JZ NEW_GAME
        JMP RELEASE_CHECK
EQ_UP:  STA EQLOCK
        NOP
        LXI H,0
        JMP RELEASE_CHECK
TITLE_TICK: MVI A,4
TITLE_PAD: DCR A
        JNZ TITLE_PAD
RELEASE_CHECK: LDA ANYKEY
        ORA A
        JNZ LOCK_HELD
        ORI 0
        STA LOCK
        JMP STILL_DOWN
LOCK_HELD: LDA LOCK
        STA LOCK
        NOP
STILL_DOWN: DCX D
        MOV A,D
        ORA E
        JNZ WAIT_LOOP
        MOV A,C
        STA COLUMN
        MOV A,B
        STA SUMKEY
        RET

; Nine equally serviced columns cover every key and the seven-character title.
; PC is disconnected before PA changes: no ghost digits or K3 spikes.
; The wrap and non-wrap paths have equal instruction timing.
SLOT:   XRA A
        OUT 0FAh
        LDA TONE_LEFT
        ORA A
        JZ SOUND_OFF
        DCR A
        STA TONE_LEFT
        LDA TONE_PHASE
        MOV H,A
        LDA TONE_STEP
        ADD H
        STA TONE_PHASE
        JMP SOUND_DONE
SOUND_OFF: STA TONE_MASK
        STA TONE_PHASE
        LXI H,0
        LXI H,0
        LXI H,0
        LXI H,0
        LXI H,0
SOUND_DONE:
        MVI H,HIGH(DISPLAY)
        MOV A,C
        ADI LOW(DISPLAY)
        MOV L,A
        MOV A,M
        CMA
        ANI 7Fh
        MOV L,A
        LDA TONE_MASK
        ORA L
        MOV L,A
        LDA TONE_PHASE
        ORA L
        OUT 0F8h
        MOV A,C
        CMA
        OUT 0FAh
        MOV A,C
        ADI LOW(ROWS)
        MOV L,A
        IN 0FAh
        CMA
        ANI 70h
        MOV M,A
        ORA B
        MOV B,A
        INR C
        MOV A,C
        CPI 9
        JC SLOT_NOWRAP
        MOV A,B
        STA ANYKEY
        MVI B,0
        MVI C,0
        JMP SLOT_END
SLOT_NOWRAP: LXI H,0
        LXI H,0
        LXI H,0
        MVI A,0
        MOV A,A
SLOT_END: RET

TITLE:  DB 6Dh,73h,06h,50h,77h,77h,38h
DIGITS: DB 3Fh,06h,5Bh,4Fh,66h,6Dh,7Dh,07h,7Fh,6Fh
PATH_DIGIT: DB 7,6,5,4,3,2,2,2,3,4,5,6,7,7,7,6,5,4,3,2
PATH_MASK: DB 1,1,1,1,1,1,20h,40h,40h,40h,40h,40h,40h,4,8,8,8,8,8,8
; Final initialized bytes identify the author, year and program version.
SIGNATURE: DB 'Wolf2026','v011'
CODE_END:

VARS    EQU 1F30h
DISPLAY EQU VARS
ROWS    EQU DISPLAY+9
COLUMN  EQU ROWS+9
FRACTION EQU COLUMN+1
LOCK    EQU FRACTION+1
EQLOCK  EQU LOCK+1
PLAYER  EQU EQLOCK+1
SPEED   EQU PLAYER+1
SEGMENT EQU SPEED+1
REMAIN  EQU SEGMENT+1
SCORE_L EQU REMAIN+1
SCORE_R EQU SCORE_L+1
TONE_LEFT EQU SCORE_R+1
TONE_PHASE EQU TONE_LEFT+1
TONE_MASK EQU TONE_PHASE+1
TONE_STEP EQU TONE_MASK+1
SUMKEY EQU TONE_STEP+1
ANYKEY EQU SUMKEY+1
STARTED EQU ANYKEY+1
VARS_END EQU STARTED+1
        END
