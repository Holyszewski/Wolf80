; Odd Couples for the PMI-80, version 0.1.1: a port of M. Kishida's NEC TK-80 game.
; Source: SRA Microcomputer Club, Fukkatsu! TK-80 (ASCII, 2000);
; probably first published in Maikon Game 21 (1978; uncertain).
;
; SPDX-License-Identifier: GPL-3.0-or-later
; Copyright (C) 2026 Matěj "Wolf" Holyszewski
; Game design: M. Kishida, SRA Microcomputer Club, ASCII 2000.
; Written anew for the Wolf80 project with the help of AI.
;
; Keys 1-8 reveal cards on digits 0-7. A mismatch or repeated card clears
; every revealed card immediately, preserving the board and BCD attempts.
; = starts a game; after winning, S shows the score and = starts again.
; Changes: own display/keyboard, scrolling title, full zero glyph, new keys.
; Changes: all eight winning cards stay lit for 2 s, then show 000000tt.
; Sound on K3: match H (1 kHz, 30 ms), mismatch L (500 Hz, 30 ms),
; fourth match HH (30 ms H, 40 ms gap, 30 ms H), replacing H.
; Multiplex continues; segment g is forced off only during each tone.
; No monitor calls, Z80 extensions or parity-dependent arithmetic.
; Monitors: factory PMI-80 and PMI-80 C. Syntax: Intel 8080, Wolf80/TASM.
; RAM: program 1C00h-1F2Dh, variables 1F70h-1F97h;
; stack 1FB9h-1FD8h (SP=1FD9h). Start: = EX 1C00 =. End: RE.
;
; Versions:
; 0.1.1  append the Wolf2026v011 binary signature
; 0.1.0  first version

; Approximately 5 ms per frame: dwell loop 15*N states on 8080,
; 14*N on Z80; nine slots plus scan, RNG and caller overhead.
; 300/50/200/80 frames: title first/step/last/blank; WIN_FRAMES: win.
DWELL_COUNT: EQU 19

; The HH sequence occupies about 100 ms of the two-second winning display.
WIN_FRAMES: EQU 373

        ORG 1C00h
START:  DI
        LXI SP,1FD9h
        MVI A,8Ah
        OUT 0FBh
        MVI A,7Fh
        OUT 0F8h
        LXI H,VARS
        MVI B,VARS_END-VARS
        CALL ZERO
        LXI H,365Ah
        SHLD RNG
        MVI A,0FFh
        STA RAW
        STA LOCK
        LXI H,TITLE
        SHLD TEXT
TITLE_NEXT:
        LHLD TEXT
        LXI D,DISPLAY+2
        MVI B,7
TITLE_COPY:
        MOV A,M
        STAX D
        INX H
        INX D
        DCR B
        JNZ TITLE_COPY
        LDA OFFSET
        ORA A
        LXI B,300
        JZ TITLE_WAIT
        LXI B,50
        CPI 4
        JNZ TITLE_WAIT
        LXI B,200
TITLE_WAIT:
        CALL WAIT_FRAMES
        LDA OFFSET
        INR A
        STA OFFSET
        CPI 5
        JZ TITLE_DONE
        LHLD TEXT
        INX H
        SHLD TEXT
        JMP TITLE_NEXT
TITLE_DONE:
        CALL DARK
        LXI B,80
        CALL WAIT_FRAMES
READY:  CALL FRAME
        CPI 90h
        JNZ READY
NEW_GAME:
        CALL DARK
        LXI H,BOARD
        MVI B,8
        CALL ZERO
        XRA A
        STA ATTEMPTS
        MVI A,8
        STA REMAIN
; One raw RAND7 iteration per multiplex frame, including rejected draws.
SHUFFLE:
        CALL FRAME
        LDA RANDOM
        CPI 8
        JNC SHUFFLE
        MOV E,A
        MVI D,0
        LXI H,BOARD
        DAD D
        MOV A,M
        ORA A
        JNZ SHUFFLE
        PUSH H
        LDA REMAIN
        DCR A
        STA REMAIN
        MOV E,A
        LXI H,SYMBOLS
        DAD D
        MOV A,M
        POP H
        MOV M,A
        LDA REMAIN
        ORA A
        JNZ SHUFFLE
CLEAR_SERIES:
        CALL DARK
        LXI H,SEEN
        MVI B,8
        CALL ZERO
        MVI A,4
        STA PAIRS
NEXT_PAIR:
        XRA A
        STA SECOND
        LDA ATTEMPTS
        ADI 1
        DAA
        STA ATTEMPTS
PLAY:   CALL FRAME
        CPI 81h
        JC PLAY
        CPI 89h
        JNC PLAY
        SUI 81h
        MOV E,A
        MVI D,0
        LXI H,SEEN
        DAD D
        MOV A,M
        ORA A
        JNZ BAD_PAIR
        MVI M,1
        LXI H,BOARD
        DAD D
        MOV C,M
        LXI H,POSITIONS
        DAD D
        MOV E,M
        LXI H,DISPLAY
        DAD D
        MOV M,C
        LDA SECOND
        ORA A
        JNZ COMPARE
        MOV A,C
        STA FIRST
        MVI A,1
        STA SECOND
        JMP PLAY
BAD_PAIR:
        CALL DARK      ; clear cards before the low beep starts
        CALL BEEP_LOW
        JMP CLEAR_SERIES
COMPARE:
        LDA FIRST
        CMP C
        JNZ BAD_PAIR
        LDA PAIRS
        DCR A
        STA PAIRS
        JZ WON
        CALL BEEP_HIGH
        JMP NEXT_PAIR
WON:    CALL BEEP_DOUBLE
        LXI B,WIN_FRAMES
WIN_WAIT:
        PUSH B
        CALL FRAME
        POP B
        CPI 90h
        JZ NEW_GAME
        CPI 94h
        JZ SCORE
        DCX B
        MOV A,B
        ORA C
        JNZ WIN_WAIT
SCORE:  LXI H,DISPLAY
        MVI B,9
        CALL ZERO
        LXI H,POSITIONS
        MVI B,8
SCORE_ZERO:
        MOV E,M
        MVI D,0
        PUSH H
        LXI H,DISPLAY
        DAD D
        MVI M,3Fh
        POP H
        INX H
        DCR B
        JNZ SCORE_ZERO
        LDA ATTEMPTS
        ANI 0Fh
        CALL DIGIT
        MOV C,A
        LDA POSITIONS+7
        MOV E,A
        LXI H,DISPLAY
        DAD D
        MOV M,C
        LDA ATTEMPTS
        RRC
        RRC
        RRC
        RRC
        ANI 0Fh
        CALL DIGIT
        MOV C,A
        LDA POSITIONS+6
        MOV E,A
        LXI H,DISPLAY
        DAD D
        MOV M,C
SCORE_WAIT:
        CALL FRAME
        CPI 90h
        JZ NEW_GAME
        CPI 94h
        JZ SCORE
        JMP SCORE_WAIT
DIGIT:  LXI H,DIGITS
        MOV E,A
        MVI D,0
        DAD D
        MOV A,M
        RET
DARK:   LXI H,DISPLAY
        MVI B,9
ZERO:   MVI M,0
        INX H
        DCR B
        JNZ ZERO
        RET
WAIT_FRAMES:
        PUSH B
        CALL FRAME
        POP B
        DCX B
        MOV A,B
        ORA C
        JNZ WAIT_FRAMES
        RET
; Scan all nine columns, taking the first key: PC6, then PC5, then PC4.
; Blank PA before every selection and after every dwell, always PA7=0.
FRAME:  LXI H,DISPLAY
        MVI E,0
        MVI C,0FFh
SLOT:   MVI A,7Fh
        OUT 0F8h
        MOV A,E
        CMA
        ANI 0Fh
        OUT 0FAh
        MOV A,M
        CMA
        ANI 7Fh
        OUT 0F8h
        MVI B,DWELL_COUNT
DWELL:  DCR B
        JNZ DWELL
        MVI A,7Fh
        OUT 0F8h
        IN 0FAh
        MOV B,A
        PUSH H
        LXI H,KEYS
        MVI D,0
        DAD D
        MOV A,B
        ANI 40h
        JNZ ROW_TWO
        MOV A,C
        CPI 0FFh
        JNZ ROW_TWO
        MOV C,M
ROW_TWO:
        LXI D,9
        DAD D
        MOV A,B
        ANI 20h
        JNZ ROW_THREE
        MOV A,C
        CPI 0FFh
        JNZ ROW_THREE
        MOV C,M
ROW_THREE:
        DAD D
        MOV A,B
        ANI 10h
        JNZ KEY_DONE
        MOV A,C
        CPI 0FFh
        JNZ KEY_DONE
        MOV C,M
KEY_DONE:
        POP H
        MOV A,L
        SUI LOW(DISPLAY)
        MOV E,A
SLOT_END:
        INX H
        INR E
        MOV A,E
        CPI 9
        JNZ SLOT
        MOV A,C
        LXI H,RAW
        CMP M
        MOV M,A
        MVI A,0FFh
        STA EVENT
        JNZ FRAME_RNG
        MOV A,C
        CPI 0FFh
        JNZ KEY_DOWN
        XRA A
        STA LOCK
        JMP FRAME_RNG
KEY_DOWN:
        LDA LOCK
        ORA A
        JNZ FRAME_RNG
        INR A
        STA LOCK
        MOV A,C
        STA EVENT
; RAND7 recurrence: t=3*r; new_hi=(t_hi+old_lo) mod 256.
FRAME_RNG:
        LHLD RNG
        MOV A,H
        ORA L
        JNZ RNG_NONZERO
        LXI H,365Ah
RNG_NONZERO:
        MOV E,L
        MOV D,H
        DAD H
        DAD D
        MOV A,H
        ADD E
        MOV H,A
        SHLD RNG
        ANI 0Fh
        STA RANDOM
        LDA EVENT
        RET
; Turn-based sound, method 5 of the maintainer's beep demo.
; One scanned digit per half-period; PA6 is forced high, PA7 toggles.
; High slots: 553 states; low slots: 1108 states at 10 MHz / 9.
BEEP_LOW:
        MVI A,60
        STA TONE_DELAY
        MVI B,30
        JMP SOUND_INIT
BEEP_DOUBLE:
        CALL BEEP_HIGH
        MVI D,0
        MVI B,80
SOUND_GAP:
        CALL SOUND_SLOT
        MOV A,C
        XRI 00h
        MOV C,A
        DCR B
        JNZ SOUND_GAP
        JMP BEEP_HIGH
BEEP_HIGH:
        MVI A,23
        STA TONE_DELAY
        MVI B,60
SOUND_INIT:
        LXI H,DISPLAY
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
SOUND_RETURN:
        RET
; Constant-time wrap; PC=0 deselects all digits before PA changes.
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
        LDA TONE_DELAY
SOUND_DWELL:
        DCR A
        JNZ SOUND_DWELL
        INX H
        INR E
        MOV A,E
        CPI 9
        JNZ SOUND_NOWRAP
        LXI H,DISPLAY
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
TITLE:  DB 3Fh,5Eh,5Eh,00h,39h,5Ch,1Ch,73h,38h,79h,6Dh
SYMBOLS: DB 39h,39h,37h,37h,3Eh,3Eh,0Fh,0Fh
POSITIONS: DB 0,1,2,3,4,5,6,7
DIGITS: DB 3Fh,06h,5Bh,4Fh,66h,6Dh,7Dh,07h,7Fh,6Fh
KEYS:   DB 80h,84h,88h,91h,8Dh,8Ch,89h,85h,81h
        DB 82h,86h,8Ah,9Ah,8Fh,8Eh,8Bh,87h,83h
        DB 0FFh,94h,93h,0FFh,97h,92h,0FFh,0FFh,90h
        DB 'Wolf2026','v011'
CODE_END:
VARS:   EQU 1F70h
DISPLAY: EQU VARS
BOARD:  EQU DISPLAY+9
SEEN:   EQU BOARD+8
RNG:    EQU SEEN+8
RANDOM: EQU RNG+2
RAW:    EQU RANDOM+1
LOCK:   EQU RAW+1
EVENT:  EQU LOCK+1
OFFSET: EQU EVENT+1
TEXT:   EQU OFFSET+1
REMAIN: EQU TEXT+2
ATTEMPTS: EQU REMAIN+1
PAIRS:  EQU ATTEMPTS+1
SECOND: EQU PAIRS+1
FIRST:  EQU SECOND+1
TONE_DELAY: EQU FIRST+1
VARS_END: EQU TONE_DELAY+1
