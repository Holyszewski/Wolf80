; Bagels for the PMI-80, version 0.1.1: a port of Bagels by Jim Butterfield
; (The First Book of KIM, Hayden 1977/78) from the KIM-1.
;
; SPDX-License-Identifier: GPL-3.0-or-later
; Copyright (C) 2026 Matěj "Wolf" Holyszewski
; Game design: Jim Butterfield, The First Book of KIM, Hayden 1977/78.
; Written anew for the Wolf80 project with the help of AI.
;
; Guess four letters A-F, with repetitions, in ten attempts. No editing.
; Sound: scored guess H (1 kHz, 30 ms), win HH (40 ms gap), solution L (500 Hz).
; Multiplex continues during tones with g off; the gap restores the full display.
; Positions 2-5: letters; 6: blank; 7-8: exact / misplaced; 0: attempts left.
; A key after a result advances; A-F also supplies the next guess's first letter.
; Changes: title, spaced layout, attempt counter, new-game timing seed, own I/O.
; Fix: the last position of the revealed solution is blank, not a stale score.
; Intel 8080 / project TASM syntax. Both factory and PMI-80 C monitors supported.
; RAM: program 1C00h-1F80h, variables 1F81h-1FABh.
; Stack: 1FACh-1FBFh (SP=1FC0h, descending; deepest call path uses 14 bytes).
; Start: EX 1C00 =. End: RE. Manual entry bytes follow END.
;
; Versions:
; 0.1.1  append the Wolf2026v011 image signature
; 0.1.0  first version

        ORG 1C00h
STACK_TOP EQU 1FC0h
STACK_BOTTOM EQU 1FACh
; Measured frame timing includes POLL and the main loop; see the test.
DWELL   EQU 21
TITLE_FRAMES EQU 444
RESULT_FRAMES EQU 710

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
        CALL RESULT_SOUND
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
        CALL SOUND_LOW
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
SHIFT:  MOV A,M
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

; Turn-based feedback: a win replaces H with HH; loss sounds only on reveal.
RESULT_SOUND:
        CALL SOUND_HIGH
        LDA EXACT
        CPI 4
        RNZ
        MVI D,0
        MVI B,80
SOUND_GAP:
        CALL SOUND_SLOT
        MOV A,C
        XRI 00h         ; the tone loop's timing, with PA7 unchanged at zero
        MOV C,A
        DCR B
        JNZ SOUND_GAP
        JMP SOUND_HIGH
SOUND_PREP:
        LXI H,DISPLAY
        LXI D,4000h
        MVI C,0
        RET
; High: 60 half-periods of 558 T; low: 30 half-periods of 1105 T.
; SOUND_SLOT follows the selected demo method 5, without its debug COLUMN store.
SOUND_HIGH:
        MVI B,60
        CALL SOUND_PREP
SOUND_H_LOOP:
        CALL SOUND_SLOT
        MOV A,C
        XRI 80h
        MOV C,A
        DCR B
        JNZ SOUND_H_LOOP
SOUND_END:
        MVI A,7Fh
SOUND_PA_END:
        OUT 0F8h
        RET
SOUND_LOW:
        MVI B,30
        CALL SOUND_PREP
SOUND_L_LOOP:
        CALL SOUND_SLOT
        CALL SOUND_SLOT
        PUSH H          ; 21 T padding: two scanned slots per low half-period
        POP H
        MOV A,C
        XRI 80h
        MOV C,A
        DCR B
        JNZ SOUND_L_LOOP
        JMP SOUND_END
; Constant timing at the column-eight wrap. Deselect before changing segments.
SOUND_SLOT:
        XRA A
        OUT 0FAh
        MOV A,M
        ORA D
        ORA C
SOUND_PA_SAMPLE:
        OUT 0F8h
        MOV A,E
        CMA
        OUT 0FAh
        MVI A,25
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
SOUND_CODE_END:

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
; 1C00: F3 31 C0 1F 3E 8A D3 FB 3E 7F D3 F8 21 81 1F 06
; 1C10: 2B AF 77 23 05 C2 12 1C 3D 3D 32 A9 1F CD 0B 1D
; 1C20: 21 54 1F 11 9B 1F 06 06 7E 12 23 13 05 C2 28 1C
; 1C30: CD 11 1E 11 BC 01 CD 24 1E FE FF C2 44 1C 1B 7A
; 1C40: B3 C2 36 1C CD 11 1E CD E9 1C CD 24 1E FE FF CA
; 1C50: 4A 1C 4F 3A A6 1F B7 CA 77 1C FE 02 CA 74 1C 3A
; 1C60: A2 1F FE 04 CA 74 1C 3A A5 1F B7 CA BC 1C CD F3
; 1C70: 1C C3 77 1C CD E9 1C 79 FE 0A DA 4A 1C FE 10 D2
; 1C80: 4A 1C 3A A7 1F B7 C4 19 1D 3A A4 1F 5F 16 00 21
; 1C90: 85 1F 19 71 D5 79 CD FA 1D D1 21 9B 1F 19 77 3A
; 1CA0: A4 1F 3C 32 A4 1F FE 04 C2 4A 1C CD 81 1D 3E 01
; 1CB0: 32 A6 1F CD C9 1E CD 05 1E C3 4A 1C 21 81 1F 11
; 1CC0: 9B 1F 06 04 E5 7E CD FA 1D 12 E1 23 13 05 C2 C4
; 1CD0: 1C 3E 1C 32 A0 1F 3E 7F 32 A1 1F 3E 02 32 A6 1F
; 1CE0: CD 02 1F CD 05 1E C3 4A 1C 3E 01 32 A7 1F 3E 0A
; 1CF0: 32 A5 1F CD 0B 1D AF 32 A6 1F 32 A4 1F 3A A5 1F
; 1D00: 3D 32 A5 1F CD FA 1D 32 99 1F C9 21 99 1F 06 09
; 1D10: 3E 7F 77 23 05 C2 12 1D C9 C5 2A 97 1F 3A 95 1F
; 1D20: 85 3C F6 01 32 95 1F 3A 96 1F AC E6 7F 32 96 1F
; 1D30: 21 84 1F 06 04 E5 C5 CD 48 1D C1 E1 77 2B 05 C2
; 1D40: 35 1D AF 32 A7 1F C1 C9 3A 92 1F 47 3A 95 1F 37
; 1D50: 88 47 3A 96 1F 88 32 91 1F 21 95 1F 11 96 1F 06
; 1D60: 05 7E 12 2B 1B 05 C2 61 1D 3A 91 1F 06 C0 B8 DA
; 1D70: 73 1D 90 4F 78 B7 1F 47 79 FE 06 D2 6E 1D C6 0A
; 1D80: C9 AF 32 A2 1F 32 A3 1F 21 81 1F 11 89 1F 06 08
; 1D90: 7E 12 23 13 05 C2 90 1D 21 89 1F 11 8D 1F 06 04
; 1DA0: 4E 1A B9 C2 B1 1D 3E FF 77 12 3A A2 1F 3C 32 A2
; 1DB0: 1F 23 13 05 C2 A0 1D 21 8D 1F 06 04 7E FE FF CA
; 1DC0: E2 1D 4F E5 C5 21 89 1F 06 04 79 BE CA D7 1D 23
; 1DD0: 05 C2 CA 1D C3 E0 1D 36 FF 3A A3 1F 3C 32 A3 1F
; 1DE0: C1 E1 23 05 C2 BC 1D 3A A2 1F CD FA 1D 32 A0 1F
; 1DF0: 3A A3 1F CD FA 1D 32 A1 1F C9 21 44 1F 85 6F 3E
; 1E00: 00 8C 67 7E C9 11 C6 02 CD 24 1E 1B 7A B3 C2 08
; 1E10: 1E CD 24 1E 3A A8 1F FE FF C2 11 1E 3A AB 1F B7
; 1E20: CA 11 1E C9 C5 D5 E5 CD 6F 1E 32 A8 1F 47 3A A9
; 1E30: 1F B8 CA 3E 1E 78 32 A9 1F 3E 03 32 AA 1F 3A AA
; 1E40: 1F B7 CA 69 1E 3D 32 AA 1F C2 69 1E 78 FE FF C2
; 1E50: 5A 1E 3E 01 32 AB 1F C3 69 1E 3A AB 1F B7 CA 69
; 1E60: 1E AF 32 AB 1F 78 C3 6B 1E 3E FF E1 D1 C1 C9 2A
; 1E70: 97 1F 23 22 97 1F 21 99 1F 06 00 0E FF 3E 7F D3
; 1E80: F8 78 2F E6 0F D3 FA 7E D3 F8 16 15 15 C2 8C 1E
; 1E90: 79 FE FF C2 BB 1E DB FA 5F E6 40 78 CA B1 1E 7B
; 1EA0: E6 20 78 CA AF 1E 7B E6 10 C2 BB 1E 78 C6 09 C6
; 1EB0: 09 E5 5F 16 00 21 5A 1F 19 4E E1 23 04 78 FE 09
; 1EC0: C2 7D 1E 3E 7F D3 F8 79 C9 CD ED 1E 3A A2 1F FE
; 1ED0: 04 C0 16 00 06 50 CD 1A 1F 79 EE 00 4F 05 C2 D6
; 1EE0: 1E C3 ED 1E 21 99 1F 11 00 40 0E 00 C9 06 3C CD
; 1EF0: E4 1E CD 1A 1F 79 EE 80 4F 05 C2 F2 1E 3E 7F D3
; 1F00: F8 C9 06 1E CD E4 1E CD 1A 1F CD 1A 1F E5 E1 79
; 1F10: EE 80 4F 05 C2 07 1F C3 FD 1E AF D3 FA 7E B2 B1
; 1F20: D3 F8 7B 2F D3 FA 3E 19 3D C2 28 1F 23 1C 7B FE
; 1F30: 09 C2 3C 1F 21 99 1F 1E 00 C3 43 1F 3E 00 00 00
; 1F40: 00 00 00 C9 40 79 24 30 19 12 02 78 00 10 08 03
; 1F50: 46 21 06 0E 03 08 42 06 47 12 00 04 08 11 0D 0C
; 1F60: 09 05 01 02 06 0A 1A 0F 0E 0B 07 03 FF 14 13 FF
; 1F70: 17 12 FF FF 10 57 6F 6C 66 32 30 32 36 76 30 31
; 1F80: 31
