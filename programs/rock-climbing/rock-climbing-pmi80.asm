; Rock Climbing for the PMI-80, version 0.1.1: a port of Rock Climbing
; by Teruhisa Hishida (Chunichi Denko, 2016) from the ND8080.
;
; SPDX-License-Identifier: GPL-3.0-or-later
; Copyright (C) 2026 Matěj "Wolf" Holyszewski
; Game design: rules from Maikon Game 21 (ed. Kouichi Kishida, 1978),
; as programmed by Teruhisa Hishida for the ND8080 (Chunichi Denko, 2016).
; Written anew for the Wolf80 project with the help of AI.
;
; Two players race to 100 m. L selects climbing, S secures the current
; height; = confirms. A die showing one loses height back to the last rest.
; Player 1: marker/height at 0/1-3; player 2 at 4/5-7; position 8 is blank.
; Own multiplex, keyboard, PRNG and standard digits; no monitor calls.
; Sound on K3: climb C (1 kHz/10 ms), fall L (500 Hz/30 ms), win HH
; (1 kHz/30 ms, 40 ms normal display, 1 kHz/30 ms). During tones only
; segment g is suppressed; multiplex continues. PA7 returns low afterwards.
; The title scrolls at startup only. Falls remain visible for 0.5 s.
; Fix the original's missing winning hundreds digit: show 100-110 correctly.
; RAM: code/tables/signature 1C00h-1F44h; variables 1F45h-1F5Ch.
; Stack: 1FA0h-1FBFh (SP=1FC0h).
; Start: factory or PMI-80 C monitor, = EX 1C00 =. End: RE.
; Intel 8080 syntax for src/asm/asm8080.js; no Z80 extensions.
; Assemble for a byte listing, load the code and use the monitor command above.
;
; Versions:
; 0.1.1  append the author and version signature to the assembled image
; 0.1.0  first version

        ORG 1C00h
STACK_TOP EQU 1FC0h
; Target frame: 5 ms; waits use 20 frames per 0.1 s.
; DCR/JNZ dwell: 21 * 15 + 4 NOP states per digit at 10 MHz / 9.
SLOT_DELAY EQU 21
P1_MARK EQU BUFFER
P1_DIGITS EQU BUFFER+1
P2_MARK EQU BUFFER+4
P2_DIGITS EQU BUFFER+5

START:  DI
        LXI SP,STACK_TOP
        MVI A,8Ah
        OUT 0FBh
        MVI A,7Fh
        OUT 0F8h
        LXI H,STATE
        MVI B,END_RAM-STATE
        XRA A
INIT:   MOV M,A
        INX H
        DCR B
        JNZ INIT
        LXI H,1
        SHLD RNG
        MVI A,0FFh
        STA LAST_DIE

; Eight seven-character windows, always on positions 2-8.
TITLE_LOOP:
        CALL CLEAR
        LDA TITLE_OFFSET
        MOV E,A
        MVI D,0
        LXI H,TITLE_TEXT
        DAD D
        LXI D,BUFFER+2
        MVI B,7
TITLE_COPY:
        MOV A,M
        STAX D
        INX H
        INX D
        DCR B
        JNZ TITLE_COPY
        LXI B,50
        LDA TITLE_OFFSET
        ORA A
        JNZ TITLE_LAST
        LXI B,300
TITLE_LAST:
        CPI 7
        JNZ TITLE_WAIT
        LXI B,200
TITLE_WAIT:
        CALL WAIT
        LDA TITLE_OFFSET
        INR A
        STA TITLE_OFFSET
        CPI 8
        JNZ TITLE_LOOP
        CALL CLEAR
        LXI B,80
        CALL WAIT

NEW_GAME:
        LXI H,HEIGHTS
        MVI B,5
        XRA A
RESET_HEIGHTS:
        MOV M,A
        INX H
        DCR B
        JNZ RESET_HEIGHTS
TURN:   XRA A
        STA CHOICE
        STA BLINK
        MVI A,20
        STA TICKS
        CALL DRAW
MAIN:   CALL FRAME
        CPI 93h
        JZ CHOOSE_UP
        CPI 94h
        JZ CHOOSE_REST
        CPI 90h
        JZ CONFIRM
        LDA CHOICE
        ORA A
        JNZ MAIN
        LDA TICKS
        DCR A
        STA TICKS
        JNZ MAIN
        MVI A,20
        STA TICKS
        LDA BLINK
        XRI 1
        STA BLINK
        CALL DRAW
        JMP MAIN
CHOOSE_UP:
        MVI A,1
        JMP SELECT
CHOOSE_REST:
        MVI A,8
SELECT: STA CHOICE
        XRA A
        STA BLINK
        CALL DRAW
        JMP MAIN
CONFIRM:
        LDA CHOICE
        ORA A
        JZ MAIN
        CPI 8
        JZ REST
        CALL DIE
        CPI 1
        JZ FALL
        MOV C,A
        CALL DIE
        CPI 1
        JZ FALL
        ADD C
        MOV C,A
        CALL PLAYER
        MOV A,M
        ADD C
        MOV M,A
        CPI 100
        JNC WIN
        CALL DRAW
        MVI B,20
        MVI A,23
        CALL TONE
        JMP TURN
REST:   CALL PLAYER
        MOV A,M
        INX H
        INX H
        MOV M,A
        JMP SWITCH
FALL:   CALL PLAYER
        INX H
        INX H
        MOV A,M
        DCX H
        DCX H
        MOV M,A
        CALL DRAW
        MVI B,30
        MVI A,60
        CALL TONE
; The low tone occupies six 5 ms frames of the existing half-second pause.
        LXI B,94
        CALL WAIT
SWITCH: LDA ACTIVE
        XRI 1
        STA ACTIVE
        JMP TURN

; Ten full-display off/on cycles, then two seconds steady, then a new game.
WIN:    CALL DRAW
        MVI B,60
        MVI A,23
        CALL TONE
        LXI B,8
        CALL WAIT
        MVI B,60
        MVI A,23
        CALL TONE
        MVI D,10
WIN_LOOP:
        CALL CLEAR
        LXI B,20
        CALL WAIT
        CALL DRAW
        LXI B,20
        CALL WAIT
        DCR D
        JNZ WIN_LOOP
        LXI B,400
        CALL WAIT
        JMP NEW_GAME

PLAYER: LDA ACTIVE
        MOV E,A
        MVI D,0
        LXI H,HEIGHTS
        DAD D
        RET

; Heights are binary internally; decimal conversion preserves the hundreds.
DRAW:   PUSH B
        PUSH D
        PUSH H
        CALL CLEAR
        LDA HEIGHTS
        LXI D,P1_DIGITS
        CALL NUMBER
        LDA HEIGHTS+1
        LXI D,P2_DIGITS
        CALL NUMBER
        LXI H,P1_MARK
        LXI D,P1_DIGITS
        LDA ACTIVE
        ORA A
        JZ DRAW_ACTIVE
        LXI H,P2_MARK
        LXI D,P2_DIGITS
DRAW_ACTIVE:
        LDA CHOICE
        MOV M,A
        ORA A
        JNZ DRAW_DONE
        LDA BLINK
        ORA A
        JZ DRAW_DONE
        XRA A
        STAX D
        INX D
        STAX D
        INX D
        STAX D
DRAW_DONE:
        POP H
        POP D
        POP B
        RET
NUMBER: MVI B,0
        CPI 100
        JC HUNDREDS
        SUI 100
        INR B
HUNDREDS:
        MOV C,A
        MOV A,B
        CALL PUT_DIGIT
        MOV A,C
        MVI B,0
TENS:   CPI 10
        JC TENS_DONE
        SUI 10
        INR B
        JMP TENS
TENS_DONE:
        MOV C,A
        MOV A,B
        CALL PUT_DIGIT
        MOV A,C
PUT_DIGIT:
        PUSH B
        MOV C,A
        MVI B,0
        LXI H,DIGITS
        DAD B
        MOV A,M
        STAX D
        INX D
        POP B
        RET
CLEAR:  PUSH B
        PUSH H
        LXI H,BUFFER
        MVI B,9
        XRA A
CLEAR_LOOP:
        MOV M,A
        INX H
        DCR B
        JNZ CLEAR_LOOP
        POP H
        POP B
        RET

; A nonzero 16-bit maximal LFSR (x^16+x^5+x^3+x^2+1).
; Four shifts per sample avoid correlated adjacent three-bit die faces.
; Every display frame mixes the time spent waiting for a human key.
RANDOM: PUSH B
        MVI B,4
        LHLD RNG
RANDOM_SHIFT:
        DAD H
        JNC RANDOM_SAVE
        MOV A,L
        XRI 2Dh
        MOV L,A
RANDOM_SAVE:
        DCR B
        JNZ RANDOM_SHIFT
        SHLD RNG
        MOV A,H
        XRA L
        POP B
        RET
; Reject 6/7 and the last accepted face; a one aborts before the second roll.
DIE:    CALL RANDOM
        ANI 7
        CPI 6
        JNC DIE
        MOV B,A
        LDA LAST_DIE
        CMP B
        JZ DIE
        MOV A,B
        STA LAST_DIE
        INR A
        RET

; BC frames. FRAME preserves BC/DE/HL, so waits keep scanning and debouncing.
WAIT:   CALL FRAME
        DCX B
        MOV A,B
        ORA C
        JNZ WAIT
        RET

; Method 5 from the maintainer's beep demo. B half-periods, A dwell count.
; Each slot selects a new digit, forces PA6 high and toggles PA7. All slots
; take the same time, including the column-eight wrap: 553 states high,
; 1108 states low, including the loop's CALL and branch (10 MHz / 9).
TONE:   STA SOUND_DELAY
        PUSH B
        PUSH D
        PUSH H
        LXI H,BUFFER
        MVI E,0
        MVI D,40h
        MVI C,0
SOUND:  CALL SOUND_SLOT
        MOV A,C
        XRI 80h
        MOV C,A
        DCR B
        JNZ SOUND
SOUND_END:
        MVI A,7Fh
        OUT 0F8h
        POP H
        POP D
        POP B
TONE_DONE:
        RET
SOUND_SLOT:
        XRA A
        OUT 0FAh
        MOV A,M
        CMA
        ANI 7Fh
        ORA D
        ORA C
        OUT 0F8h
        MOV A,E
        CMA
        OUT 0FAh
        NOP
        NOP
        LDA SOUND_DELAY
SOUND_DWELL:
        DCR A
        JNZ SOUND_DWELL
        INX H
        INR E
        MOV A,E
        CPI 9
        JNZ SOUND_NOWRAP
        LXI H,BUFFER
        MVI E,0
        JMP SOUND_SLOT_END
SOUND_NOWRAP:
        MVI A,0
        NOP
        NOP
        NOP
        NOP
        NOP
SOUND_SLOT_END:
        RET

; One multiplex frame, lowest column first, PC6 before PC5 before PC4.
; Raw masks in BUFFER use 1=lit. Normal scanning keeps PA7 low.
FRAME:  PUSH B
        PUSH D
        PUSH H
        CALL RANDOM
        MVI D,0
        MVI E,0
SCAN:   MVI A,7Fh
        OUT 0F8h
        MOV A,E
        CMA
        ANI 0Fh
        OUT 0FAh
        MOV C,E
        MVI B,0
        LXI H,BUFFER
        DAD B
        MOV A,M
        CMA
        ANI 7Fh
        OUT 0F8h
        MVI B,SLOT_DELAY
DWELL:  DCR B
        JNZ DWELL
        NOP
        MOV A,D
        ORA A
        JNZ NEXT_COLUMN
        LXI H,KEYS
        MVI B,0
        MVI C,9
        IN 0FAh
        ANI 70h
        RLC
        RLC
        JNC KEY_FOUND
        RLC
        JNC KEY_ROW1
        RLC
        JC NEXT_COLUMN
        DAD B
KEY_ROW1:
        DAD B
KEY_FOUND:
        MOV C,E
        DAD B
        MOV D,M
NEXT_COLUMN:
        INR E
        MOV A,E
        CPI 9
        JNZ SCAN
        MVI A,7Fh
        OUT 0F8h
; Require two equal frames, including release. A changed held key cannot repeat.
        LDA CANDIDATE
        CMP D
        MOV A,D
        STA CANDIDATE
        JNZ NO_EVENT
        ORA A
        JNZ KEY_DOWN
        MVI A,1
        STA ARMED
NO_EVENT:
        XRA A
        JMP FRAME_DONE
KEY_DOWN:
        LDA ARMED
        ORA A
        JZ NO_EVENT
        XRA A
        STA ARMED
        MOV A,D
FRAME_DONE:
        POP H
        POP D
        POP B
        RET

DIGITS: DB 3Fh,06h,5Bh,4Fh,66h,6Dh,7Dh,07h,7Fh,6Fh
TITLE_TEXT:
        DB 50h,3Fh,39h,76h,00h,39h,38h,30h,37h,37h,7Ch,30h,54h,3Dh
KEYS:   DB 80h,84h,88h,91h,8Dh,8Ch,89h,85h,81h
        DB 82h,86h,8Ah,9Ah,8Fh,8Eh,8Bh,87h,83h
        DB 00h,94h,93h,00h,97h,92h,00h,00h,90h
; Final emitted bytes; uninitialized working RAM follows the signature.
SIGNATURE: DB 'Wolf2026','v011'
STATE:
HEIGHTS: DS 2
SAFE:   DS 2
ACTIVE: DS 1
CHOICE: DS 1
BLINK:  DS 1
TICKS:  DS 1
RNG:    DS 2
LAST_DIE: DS 1
CANDIDATE: DS 1
ARMED:  DS 1
TITLE_OFFSET: DS 1
BUFFER: DS 9
SOUND_DELAY: DS 1
END_RAM:
        END START
