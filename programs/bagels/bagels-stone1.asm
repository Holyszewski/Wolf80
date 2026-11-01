; Bagels for the Stone 1, version 0.1.1: a port of Bagels by Jim Butterfield
; (The First Book of KIM, Hayden 1977/78) from the KIM-1.
;
; SPDX-License-Identifier: GPL-3.0-or-later
; Copyright (C) 2026 Matěj "Wolf" Holyszewski
; Game design: Jim Butterfield, The First Book of KIM, Hayden 1977/78.
; Written anew for the Wolf80 project with the help of AI.
;
; Guess four letters A-F, with repetitions, in ten attempts. No editing or sound.
; Positions 2-5: letters; 6: blank; 7-8: exact / misplaced; 0: attempts left.
; A key after a result advances; A-F also supplies the next guess's first letter.
; Changes: title, spaced layout, attempt counter, new-game timing seed, own I/O.
; Fix: the last position of the revealed solution is blank, not a stale score.
; Intel 8080 / project TASM syntax. Both Stone 1 and STONE-PMI monitors supported.
; RAM: program 1800h-1B00h, variables 1B01h-1B2Bh.
; Stack: 1FA0h-1FBFh (SP=1FC0h, descending).
; Start: EX 1800 =. End: RE. Manual entry bytes follow END.
;
; Versions:
; 0.1.1  append the Wolf2026v011 image signature
; 0.1.0  first version

        ORG 1800h
STACK_TOP EQU 1FC0h
STACK_BOTTOM EQU 1FA0h
; Measured frame timing includes POLL and the main loop; see the test.
DWELL   EQU 54
TITLE_FRAMES EQU 444
RESULT_FRAMES EQU 715

START:  DI
        LXI SP,STACK_TOP
        MVI A,8Ah
        OUT 0FBh
        MVI A,7Fh
        OUT 0F8h
        LXI H,VARS
        MVI B,VARS_END-VARS
        XRA A
INIT:   MOV M,A
        INX H
        DCR B
        JNZ INIT
        DCR A
        DCR A
        STA LAST_RAW
        CALL CLEAR
        LXI H,TITLE
        LXI D,DISPLAY+2
        MVI B,6
COPY_TITLE:
        MOV A,M
        STAX D
        INX H
        INX D
        DCR B
        JNZ COPY_TITLE
; A monitor's still-held launch key cannot skip the title or enter a letter.
        CALL RELEASE
        LXI D,TITLE_FRAMES
TITLE_LOOP:
        CALL POLL
        CPI 0FFh
        JNZ TITLE_DONE
        DCX D
        MOV A,D
        ORA E
        JNZ TITLE_LOOP
TITLE_DONE:
        CALL RELEASE
        CALL NEW_GAME
MAIN:   CALL POLL
        CPI 0FFh
        JZ MAIN
        MOV C,A
        LDA STATE
        ORA A
        JZ LETTER
        CPI 2
        JZ RESTART
        LDA EXACT
        CPI 4
        JZ RESTART
        LDA COUNT
        ORA A
        JZ REVEAL
        CALL NEW_GUESS
        JMP LETTER
RESTART:
        CALL NEW_GAME
LETTER: MOV A,C
        CPI 0Ah
        JC MAIN
        CPI 10h
        JNC MAIN
        LDA PENDING
        ORA A
        CNZ MAKE_SECRET
        LDA POINTER
        MOV E,A
        MVI D,0
        LXI H,GUESS
        DAD D
        MOV M,C
        PUSH D
        MOV A,C
        CALL GLYPH
        POP D
        LXI H,DISPLAY+2
        DAD D
        MOV M,A
        LDA POINTER
        INR A
        STA POINTER
        CPI 4
        JNZ MAIN
        CALL SCORE
        MVI A,1
        STA STATE
        CALL LOCK
        JMP MAIN
REVEAL: LXI H,SECRET
        LXI D,DISPLAY+2
        MVI B,4
REVEAL_LOOP:
        PUSH H
        MOV A,M
        CALL GLYPH
        STAX D
        POP H
        INX H
        INX D
        DCR B
        JNZ REVEAL_LOOP
        MVI A,1Ch
        STA DISPLAY+7
        MVI A,7Fh
        STA DISPLAY+8
        MVI A,2
        STA STATE
        CALL LOCK
        JMP MAIN

NEW_GAME:
        MVI A,1
        STA PENDING
        MVI A,10
        STA COUNT
NEW_GUESS:
        CALL CLEAR
        XRA A
        STA STATE
        STA POINTER
        LDA COUNT
        DCR A
        STA COUNT
        CALL GLYPH
        STA DISPLAY
        RET
CLEAR:  LXI H,DISPLAY
        MVI B,9
        MVI A,7Fh
CLEAR_LOOP:
        MOV M,A
        INX H
        DCR B
        JNZ CLEAR_LOOP
        RET

; Seed only when the new game's first letter arrives, including its waiting time.
; RND4 is made nonzero and RND5 bit 7 is cleared: neither all-00 nor all-FF.
MAKE_SECRET:
        PUSH B
        LHLD TICKS
        LDA RND+4
        ADD L
        INR A
        ORI 1
        STA RND+4
        LDA RND+5
        XRA H
        ANI 7Fh
        STA RND+5
        LXI H,SECRET+3
        MVI B,4
SECRET_LOOP:
        PUSH H
        PUSH B
        CALL RANDOM
        POP B
        POP H
        MOV M,A
        DCX H
        DCR B
        JNZ SECRET_LOOP
        XRA A
        STA PENDING
        POP B
        RET
; Butterfield's two ADCs, including carry between sums, followed by modulo 6.
; RND[0] and RND[1] both receive the new byte. No timing mix in this routine.
RANDOM: LDA RND+1
        MOV B,A
        LDA RND+4
        STC
        ADC B
        MOV B,A
        LDA RND+5
        ADC B
        STA RND
        LXI H,RND+4
        LXI D,RND+5
        MVI B,5
SHIFT:  MOV C,M
        MOV A,C
        STAX D
        DCX H
        DCX D
        DCR B
        JNZ SHIFT
        LDA RND
        MVI B,0C0h
MODULO: CMP B
        JC MOD_NEXT
        SUB B
MOD_NEXT:
        MOV C,A
        MOV A,B
        ORA A
        RAR
        MOV B,A
        MOV A,C
        CPI 6
        JNC MODULO
        ADI 0Ah
        RET

; Match exact positions first, then consume each remaining secret letter once.
SCORE:  XRA A
        STA EXACT
        STA MISPLACED
        LXI H,SECRET
        LXI D,WORK_SECRET
        MVI B,8
SCORE_COPY:
        MOV A,M
        STAX D
        INX H
        INX D
        DCR B
        JNZ SCORE_COPY
        LXI H,WORK_SECRET
        LXI D,WORK_GUESS
        MVI B,4
EXACT_LOOP:
        MOV C,M
        LDAX D
        CMP C
        JNZ EXACT_NEXT
        MVI A,0FFh
        MOV M,A
        STAX D
        LDA EXACT
        INR A
        STA EXACT
EXACT_NEXT:
        INX H
        INX D
        DCR B
        JNZ EXACT_LOOP
        LXI H,WORK_GUESS
        MVI B,4
MATCH_LOOP:
        MOV A,M
        CPI 0FFh
        JZ MATCH_NEXT
        MOV C,A
        PUSH H
        PUSH B
        LXI H,WORK_SECRET
        MVI B,4
FIND:   MOV A,C
        CMP M
        JZ FOUND
        INX H
        DCR B
        JNZ FIND
        JMP FIND_DONE
FOUND:  MVI M,0FFh
        LDA MISPLACED
        INR A
        STA MISPLACED
FIND_DONE:
        POP B
        POP H
MATCH_NEXT:
        INX H
        DCR B
        JNZ MATCH_LOOP
        LDA EXACT
        CALL GLYPH
        STA DISPLAY+7
        LDA MISPLACED
        CALL GLYPH
        STA DISPLAY+8
        RET
GLYPH:  LXI H,FONT
        ADD L
        MOV L,A
        MVI A,0
        ADC H
        MOV H,A
        MOV A,M
        RET

; Ignore all presses during the lock, then require a debounced release.
LOCK:   LXI D,RESULT_FRAMES
LOCK_LOOP:
        CALL POLL
        DCX D
        MOV A,D
        ORA E
        JNZ LOCK_LOOP
RELEASE:
        CALL POLL
        LDA RAW
        CPI 0FFh
        JNZ RELEASE
        LDA ARMED
        ORA A
        JZ RELEASE
        RET

; One frame per poll. Three identical samples debounce both edges. ARMED
; prevents repeats, and changing directly between held keys is not a release.
; BC, DE and HL survive; A = a new key code, or FFh.
POLL:   PUSH B
        PUSH D
        PUSH H
        CALL SCAN
        STA RAW
        MOV B,A
        LDA LAST_RAW
        CMP B
        JZ SAME_RAW
        MOV A,B
        STA LAST_RAW
        MVI A,3
        STA SAMPLES
SAME_RAW:
        LDA SAMPLES
        ORA A
        JZ NO_EVENT
        DCR A
        STA SAMPLES
        JNZ NO_EVENT
        MOV A,B
        CPI 0FFh
        JNZ PRESSED
        MVI A,1
        STA ARMED
        JMP NO_EVENT
PRESSED:
        LDA ARMED
        ORA A
        JZ NO_EVENT
        XRA A
        STA ARMED
        MOV A,B
        JMP POLL_DONE
NO_EVENT:
        MVI A,0FFh
POLL_DONE:
        POP H
        POP D
        POP B
        RET

; Active-low segment bytes always have PA7=0. Blank before changing columns.
SCAN:   LHLD TICKS
        INX H
        SHLD TICKS
        LXI H,DISPLAY
        MVI B,0
        MVI C,0FFh
COLUMN: MVI A,7Fh
        OUT 0F8h
        MOV A,B
        CMA
        ANI 0Fh
        OUT 0FAh
        MOV A,M
        OUT 0F8h
        MVI D,DWELL
DWELL_LOOP:
        DCR D
        JNZ DWELL_LOOP
        MOV A,C
        CPI 0FFh
        JNZ COLUMN_NEXT
        IN 0FAh
        MOV E,A
        ANI 40h
        MOV A,B
        JZ KEY_FOUND
        MOV A,E
        ANI 20h
        MOV A,B
        JZ KEY_ROW1
        MOV A,E
        ANI 10h
        JNZ COLUMN_NEXT
        MOV A,B
        ADI 9
KEY_ROW1:
        ADI 9
KEY_FOUND:
        PUSH H
        MOV E,A
        MVI D,0
        LXI H,KEYS
        DAD D
        MOV C,M
        POP H
COLUMN_NEXT:
        INX H
        INR B
        MOV A,B
        CPI 9
        JNZ COLUMN
        MVI A,7Fh
        OUT 0F8h
        MOV A,C
        RET

FONT:   DB 40h,79h,24h,30h,19h,12h,02h,78h,00h,10h
        DB 08h,03h,46h,21h,06h,0Eh
TITLE:  DB 03h,08h,42h,06h,47h,12h
KEYS:   DB 0,4,8,11h,0Dh,0Ch,9,5,1
        DB 2,6,0Ah,1Ah,0Fh,0Eh,0Bh,7,3
        DB 0FFh,14h,13h,0FFh,17h,12h,0FFh,0FFh,10h
; Final emitted bytes; runtime variables follow without stored initial values.
IMAGE_SIGNATURE: DB 'Wolf2026','v011'
CODE_END:
VARS:
SECRET: DS 4
GUESS:  DS 4
WORK_SECRET: DS 4
WORK_GUESS: DS 4
RND:    DS 6
TICKS:  DS 2
DISPLAY: DS 9
EXACT:  DS 1
MISPLACED: DS 1
POINTER: DS 1
COUNT:  DS 1
STATE:  DS 1
PENDING: DS 1
RAW:    DS 1
LAST_RAW: DS 1
SAMPLES: DS 1
ARMED:  DS 1
VARS_END:
        END

; Manual entry: address followed by up to sixteen hexadecimal bytes.
; Variables are initialized by START; no data entry is needed for DS areas.
; 1800: F3 31 C0 1F 3E 8A D3 FB 3E 7F D3 F8 21 01 1B 06
; 1810: 2B AF 77 23 05 C2 12 18 3D 3D 32 29 1B CD 05 19
; 1820: 21 D4 1A 11 1B 1B 06 06 7E 12 23 13 05 C2 28 18
; 1830: CD 0C 1A 11 BC 01 CD 1F 1A FE FF C2 44 18 1B 7A
; 1840: B3 C2 36 18 CD 0C 1A CD E3 18 CD 1F 1A FE FF CA
; 1850: 4A 18 4F 3A 26 1B B7 CA 77 18 FE 02 CA 74 18 3A
; 1860: 22 1B FE 04 CA 74 18 3A 25 1B B7 CA B9 18 CD ED
; 1870: 18 C3 77 18 CD E3 18 79 FE 0A DA 4A 18 FE 10 D2
; 1880: 4A 18 3A 27 1B B7 C4 13 19 3A 24 1B 5F 16 00 21
; 1890: 05 1B 19 71 D5 79 CD F5 19 D1 21 1B 1B 19 77 3A
; 18A0: 24 1B 3C 32 24 1B FE 04 C2 4A 18 CD 7C 19 3E 01
; 18B0: 32 26 1B CD 00 1A C3 4A 18 21 01 1B 11 1B 1B 06
; 18C0: 04 E5 7E CD F5 19 12 E1 23 13 05 C2 C1 18 3E 1C
; 18D0: 32 20 1B 3E 7F 32 21 1B 3E 02 32 26 1B CD 00 1A
; 18E0: C3 4A 18 3E 01 32 27 1B 3E 0A 32 25 1B CD 05 19
; 18F0: AF 32 26 1B 32 24 1B 3A 25 1B 3D 32 25 1B CD F5
; 1900: 19 32 19 1B C9 21 19 1B 06 09 3E 7F 77 23 05 C2
; 1910: 0C 19 C9 C5 2A 17 1B 3A 15 1B 85 3C F6 01 32 15
; 1920: 1B 3A 16 1B AC E6 7F 32 16 1B 21 04 1B 06 04 E5
; 1930: C5 CD 42 19 C1 E1 77 2B 05 C2 2F 19 AF 32 27 1B
; 1940: C1 C9 3A 12 1B 47 3A 15 1B 37 88 47 3A 16 1B 88
; 1950: 32 11 1B 21 15 1B 11 16 1B 06 05 4E 79 12 2B 1B
; 1960: 05 C2 5B 19 3A 11 1B 06 C0 B8 DA 6E 19 90 4F 78
; 1970: B7 1F 47 79 FE 06 D2 69 19 C6 0A C9 AF 32 22 1B
; 1980: 32 23 1B 21 01 1B 11 09 1B 06 08 7E 12 23 13 05
; 1990: C2 8B 19 21 09 1B 11 0D 1B 06 04 4E 1A B9 C2 AC
; 19A0: 19 3E FF 77 12 3A 22 1B 3C 32 22 1B 23 13 05 C2
; 19B0: 9B 19 21 0D 1B 06 04 7E FE FF CA DD 19 4F E5 C5
; 19C0: 21 09 1B 06 04 79 BE CA D2 19 23 05 C2 C5 19 C3
; 19D0: DB 19 36 FF 3A 23 1B 3C 32 23 1B C1 E1 23 05 C2
; 19E0: B7 19 3A 22 1B CD F5 19 32 20 1B 3A 23 1B CD F5
; 19F0: 19 32 21 1B C9 21 C4 1A 85 6F 3E 00 8C 67 7E C9
; 1A00: 11 CB 02 CD 1F 1A 1B 7A B3 C2 03 1A CD 1F 1A 3A
; 1A10: 28 1B FE FF C2 0C 1A 3A 2B 1B B7 CA 0C 1A C9 C5
; 1A20: D5 E5 CD 6A 1A 32 28 1B 47 3A 29 1B B8 CA 39 1A
; 1A30: 78 32 29 1B 3E 03 32 2A 1B 3A 2A 1B B7 CA 64 1A
; 1A40: 3D 32 2A 1B C2 64 1A 78 FE FF C2 55 1A 3E 01 32
; 1A50: 2B 1B C3 64 1A 3A 2B 1B B7 CA 64 1A AF 32 2B 1B
; 1A60: 78 C3 66 1A 3E FF E1 D1 C1 C9 2A 17 1B 23 22 17
; 1A70: 1B 21 19 1B 06 00 0E FF 3E 7F D3 F8 78 2F E6 0F
; 1A80: D3 FA 7E D3 F8 16 36 15 C2 87 1A 79 FE FF C2 B6
; 1A90: 1A DB FA 5F E6 40 78 CA AC 1A 7B E6 20 78 CA AA
; 1AA0: 1A 7B E6 10 C2 B6 1A 78 C6 09 C6 09 E5 5F 16 00
; 1AB0: 21 DA 1A 19 4E E1 23 04 78 FE 09 C2 78 1A 3E 7F
; 1AC0: D3 F8 79 C9 40 79 24 30 19 12 02 78 00 10 08 03
; 1AD0: 46 21 06 0E 03 08 42 06 47 12 00 04 08 11 0D 0C
; 1AE0: 09 05 01 02 06 0A 1A 0F 0E 0B 07 03 FF 14 13 FF
; 1AF0: 17 12 FF FF 10 57 6F 6C 66 32 30 32 36 76 30 31
; 1B00: 31
