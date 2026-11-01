; SPDX-License-Identifier: GPL-3.0-or-later
; Copyright (C) 2026 Matěj "Wolf" Holyszewski
; Ship, Captain, Crew, version 0.1.0. Original implementation of the traditional dice game.
; PMI-80, factory or PMI-80 C monitor. Intel 8080 / Wolf80 assembler syntax, no Z80 extensions.
; Start 1C00h; own I/O, no monitor calls. Reset exits.
; 1-9 players, 1-8 rounds. = roll, S bank, A round, F setup.
; Player, banked dice and cumulative score blink; roll counter and free dice stay steady.
; Versions:
; 0.1.0  first numbered version; cumulative scores, qualified cargo animations, roll counter
; Earlier development builds were unversioned.
; RAM: code START..CODE_END-1, variables VARS..VARS_END-1.
; Stack reserved 1FF0h..1FFFh, SP=2000h. Manual bytes follow END.
        ORG 1C00h
STACK_TOP EQU 2000h
DWELL EQU 21
START:  DI
        LXI SP,STACK_TOP
        MVI A,8Ah
        OUT 0FBh
        LXI H,VARS
        MVI B,VARS_END-VARS
        XRA A
INIT:   MOV M,A
        INX H
        DCR B
        JNZ INIT
        CALL CLEAR
        LXI H,SHIP
        CALL PROMPT
        CALL DELAY
        CALL SELECT
MAIN:   CALL POLL
        CALL HANDLE
        JMP MAIN
HANDLE:
        CPI 0Fh
        JZ SELECT
        MOV C,A
        LDA STATE
        ORA A
        JZ CHOOSE
        CPI 4
        JZ CHOOSE
        CPI 3
        JZ RESULTS_KEY
        MOV A,C
        CPI 0Ah
        JZ INFO
        CPI 10h
        JZ ROLL
        CPI 14h
        RNZ
        LDA BANKED
        CPI 3
        RNZ
        JMP FINISH
CHOOSE: MOV A,C
        ORA A
        RZ
        CPI 10
        RNC
        MOV B,A
        LDA STATE
        ORA A
        JNZ SET_ROUNDS
        MOV A,B
        STA PLAYERS
        CALL CONFIRM
        MVI A,4
        STA STATE
        LXI H,ROUND_PROMPT
        JMP PROMPT
SET_ROUNDS:
        MOV A,B
        CPI 9
        RNC
        STA ROUNDS
        CALL CONFIRM
NEW_ROUND:
        LDA ROUNDS
        STA ROUNDS_LEFT
        LXI H,SCORES
        MVI B,9
        XRA A
RESET_SCORES:
        MOV M,A
        INX H
        DCR B
        JNZ RESET_SCORES
ROUND_START:
        MVI A,1
        STA PLAYER
        XRA A
        STA BEST
        JMP TURN
RESULTS_KEY:
        MOV A,C
        CPI 10h
        JZ NEW_ROUND
        RET
RESULTS:
        MVI A,3
        STA STATE
        LXI H,END_TEXT
        CALL PROMPT
        LDA WINNER
        CALL GLYPH
        STA DISPLAY+4
        LDA BEST
        CALL DECIMAL
        JMP UNTAG
INFO:   LDA ROUNDS_LEFT
        MOV B,A
        LDA ROUNDS
        SUB B
        INR A
        CALL GLYPH
        STA DISPLAY+8
        MVI A,0AFh
        STA DISPLAY+7
        CALL DELAY
REDRAW: JMP DRAW
CONFIRM:
        CALL GLYPH
        STA DISPLAY+8
        JMP DELAY
SELECT: XRA A
        STA STATE
        CALL CLEAR
        LXI H,TITLE
        JMP PROMPT
PROMPT:
        LXI D,DISPLAY
        MVI B,7
TITLE_COPY:
        MOV A,M
        STAX D
        INX H
        INX D
        DCR B
        JNZ TITLE_COPY
        MVI A,7Fh
        STA DISPLAY+7
        STA DISPLAY+8
        RET
TURN:   MVI A,1
        STA STATE
        MVI A,3
        STA LEFT
        XRA A
        STA BANKED
        STA SCORE
        LXI H,DICE
        MVI B,5
TURN_CLEAR:
        MOV M,A
        INX H
        DCR B
        JNZ TURN_CLEAR
        JMP DRAW
; Every unbanked die is rerolled, including both cargo dice.
ROLL:   LHLD TICKS
        LDA RNG
        XRA L
        ORI 1
SEED_OK:
        STA RNG
        LDA BANKED
        MOV E,A
        MVI D,0
        LXI H,DICE
        DAD D
        MVI A,5
        SUB E
        MOV B,A
ROLL_LOOP:
        CALL DIE
        MOV M,A
        INX H
        DCR B
        JNZ ROLL_LOOP
        CALL QUALIFY
        LDA LEFT
        DCR A
        STA LEFT
        JZ FINISH
        JMP REDRAW
; Move the required 6, then 5, then 4 into the banked prefix.
; Search the entire unbanked suffix, not just dice in display order.
QUALIFY:
        LDA BANKED
        CPI 3
        JZ CARGO
        MOV E,A
        MVI D,0
        LXI H,DICE
        DAD D
        PUSH H
        MVI A,5
        SUB E
        MOV B,A
        INR A
        MOV C,A
SEARCH: MOV A,M
        CMP C
        JZ FOUND
        INX H
        DCR B
        JNZ SEARCH
        POP H
        XRA A
        STA SCORE
        RET
FOUND:  POP D
        LDAX D
        MOV M,A
        MOV A,C
        STAX D
        LDA BANKED
        INR A
        STA BANKED
        JMP QUALIFY
CARGO:  LXI H,DICE+3
        MOV A,M
        INX H
        ADD M
        STA SCORE
        RET
FINISH: CALL DRAW_STEADY
        LXI H,DISPLAY+5
; SCORE is zero until QUALIFY has banked all three required dice.
; A failed turn must not label the two rightmost dice as cargo.
        LDA SCORE
        ORA A
        CNZ ANIMATE
        LDA PLAYER
        DCR A
        CALL SCORE_PTR
        LDA SCORE
        ADD M
        MOV M,A
        MOV B,A
        LDA BEST
        CMP B
        JC NEW_BEST
        JNZ ADDED
        XRA A
        STA WINNER
        JMP ADDED
NEW_BEST:
        MOV A,B
        STA BEST
        LDA PLAYER
        STA WINNER
ADDED:  CALL DRAW_STEADY
        LXI H,DISPLAY+7
        CALL ANIMATE
ADVANCE:
        LDA PLAYERS
        MOV B,A
        LDA PLAYER
        CMP B
        JZ NEXT_ROUND
        INR A
        STA PLAYER
        JMP TURN
NEXT_ROUND:
        LDA ROUNDS_LEFT
        DCR A
        STA ROUNDS_LEFT
        JZ RESULTS
        JMP ROUND_START
DRAW:   LDA PLAYER
        CALL GLYPH
        STA DISPLAY
        LDA LEFT
        ADI 10
        CALL GLYPH
        STA DISPLAY+1
        LXI D,DICE
        LXI B,DISPLAY+2
DRAW_DIE:
        LDAX D
        ORA A
        MVI A,3Fh
        JZ DIE_GLYPH
        LDAX D
        CALL GLYPH
DIE_GLYPH:
        ANI 7Fh
        STAX B
        INX D
        INX B
        MOV A,C
        CPI (DISPLAY+7) & 0FFh
        JNZ DRAW_DIE
        LDA BANKED
        MOV B,A
        LXI H,DISPLAY+2
        CALL TAG
        LDA PLAYER
        DCR A
        CALL SCORE_PTR
        MOV A,M
        JMP DECIMAL
; Decimal score, never hexadecimal A/B/C.
DECIMAL:
        MVI B,0
TENS:
        CPI 10
        JC ONES
        SUI 10
        INR B
        JMP TENS
ONES:   CALL GLYPH
        STA DISPLAY+8
        MOV A,B
        CALL GLYPH
        STA DISPLAY+7
        RET
SCORE_PTR:
        LXI H,SCORES
INDEX_ADDR:
        ADD L
        MOV L,A
        RET
; Maximal 8-bit LFSR, rejecting 253..255: 252 equiprobable states / 6.
; Timing of the player's roll perturbs the nonzero state (not cryptographic).
DIE:    LDA RNG
        ORA A
        RAR
        JNC RANDOM_STORE
        XRI 0B8h
RANDOM_STORE:
        STA RNG
        CPI 253
        JNC DIE
MOD6:   CPI 7
        RC
        SUI 6
        JMP MOD6
CLEAR:  MVI C,7Fh
        JMP WHOLE
GLYPH:  LXI H,FONT
        ADD L
        MOV L,A
        MOV A,M
        RET
; High bit is a display-only blink flag, never sent to PA7.
TAG:    MOV A,B
        ORA A
        RZ
        MVI C,80h
        JMP MASK
DRAW_STEADY:
        CALL DRAW
UNTAG:  MVI C,0
WHOLE:  LXI H,DISPLAY
        MVI B,9
MASK:   MOV A,M
        ANI 7Fh
        ORA C
        MOV M,A
        INX H
        DCR B
        JNZ MASK
        RET
ANIMATE:
        MVI B,2
        CALL TAG
DELAY:  XRA A
        STA TICKS
        MVI A,80h
        STA RATE
        LXI D,384
DELAY_LOOP:
        CALL POLL
        DCX D
        MOV A,D
        ORA E
        JNZ DELAY_LOOP
        MVI A,40h
        STA RATE
        XRA A
        STA ARMED
        MVI A,0FEh
        STA LAST_RAW
        RET
POLL:   PUSH D
        CALL SCAN
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
        INR A
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
        POP D
        RET

; Active-low segment bytes always have PA7=0. Blank before changing columns.
SCAN:   LXI H,RNG
        INR M
        LDA TICKS
        INR A
        STA TICKS
        LXI H,DISPLAY
        MVI B,0
        MVI C,0FFh
COLUMN: MVI A,7Fh
        OUT 0F8h
        MOV A,B
        CMA
        ANI 0Fh
        OUT 0FAh
        CALL VISIBLE
        OUT 0F8h
        MVI D,DWELL
DWELL_LOOP:
        DCR D
        JNZ DWELL_LOOP
        MOV A,C
        INR A
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

; Bit 7 in the buffer marks a digit for blinking; PA7 always stays low.
VISIBLE:
        MOV A,M
        ORA A
        JP STEADY
        LDA TICKS
        MOV E,A
        LDA RATE
        ANA E
        MVI A,7Fh
        RNZ
STEADY: MOV A,M
        ANI 7Fh
        RET

FONT:   DB 0C0h,0F9h,0A4h,0B0h,99h,92h,82h,0F8h,80h,90h
; LEFT=0/1/2/3: a+g+d / g+d / d / blank. Never blink.
ROLL_MARKS: DB 36h,37h,77h,7Fh
TITLE:  DB 0Ch,47h,08h,11h,06h,2Fh,12h
SHIP:   DB 7Fh,7Fh,12h,09h,79h,0Ch,7Fh
END_TEXT: DB 06h,2Bh,21h,7Fh,7Fh,7Fh,7Fh
ROUND_PROMPT: DB 2Fh,23h,63h,2Bh,21h,12h,7Fh
KEYS:   DB 0,4,8,11h,0Dh,0Ch,9,5,1
        DB 2,6,0Ah,1Ah,0Fh,0Eh,0Bh,7,3
        DB 0FFh,14h,13h,0FFh,17h,12h,0FFh,0FFh,10h
; No room for the Wolf2026 signature in the PMI-80 RAM: the monitor stack reaches 1FCBh.
CODE_END:
VARS:
DISPLAY: DS 9
DICE: DS 5
SCORES: DS 9
TICKS: DS 1
RATE: DS 1
RNG: DS 1
STATE: DS 1
PLAYERS: DS 1
ROUNDS: DS 1
ROUNDS_LEFT: DS 1
PLAYER: DS 1
LEFT: DS 1
BANKED: DS 1
SCORE: DS 1
BEST: DS 1
WINNER: DS 1
LAST_RAW: DS 1
SAMPLES: DS 1
ARMED: DS 1
VARS_END:
        END



; Manual entry bytes (variables are initialized at start):
; 1C00: F3 31 00 20 3E 8A D3 FB 21 C7 1F 06 27 AF 77 23
; 1C10: 05 C2 0E 1C CD 7A 1E 21 97 1F CD F6 1C CD A8 1E
; 1C20: CD E9 1C CD CC 1E CD 2C 1C C3 23 1C FE 0F CA E9
; 1C30: 1C 4F 3A E1 1F B7 CA 5A 1C FE 04 CA 5A 1C FE 03
; 1C40: CA A2 1C 79 FE 0A CA C6 1C FE 10 CA 2B 1D FE 14
; 1C50: C0 3A E7 1F FE 03 C0 C3 9D 1D 79 B7 C8 FE 0A D0
; 1C60: 47 3A E1 1F B7 C2 7A 1C 78 32 E2 1F CD E0 1C 3E
; 1C70: 04 32 E1 1F 21 A5 1F C3 F6 1C 78 FE 09 D0 32 E3
; 1C80: 1F CD E0 1C 3A E3 1F 32 E4 1F 21 D5 1F 06 09 AF
; 1C90: 77 23 05 C2 90 1C 3E 01 32 E5 1F AF 32 E9 1F C3
; 1CA0: 0C 1D 79 FE 10 CA 84 1C C9 3E 03 32 E1 1F 21 9E
; 1CB0: 1F CD F6 1C 3A EA 1F CD 7F 1E 32 CB 1F 3A E9 1F
; 1CC0: CD 3F 1E C3 91 1E 3A E4 1F 47 3A E3 1F 90 3C CD
; 1CD0: 7F 1E 32 CF 1F 3E AF 32 CE 1F CD A8 1E C3 FA 1D
; 1CE0: CD 7F 1E 32 CF 1F C3 A8 1E AF 32 E1 1F CD 7A 1E
; 1CF0: 21 90 1F C3 F6 1C 11 C7 1F 06 07 7E 12 23 13 05
; 1D00: C2 FB 1C 3E 7F 32 CE 1F 32 CF 1F C9 3E 01 32 E1
; 1D10: 1F 3E 03 32 E6 1F AF 32 E7 1F 32 E8 1F 21 D0 1F
; 1D20: 06 05 77 23 05 C2 22 1D C3 FA 1D 2A DE 1F 3A E0
; 1D30: 1F AD F6 01 32 E0 1F 3A E7 1F 5F 16 00 21 D0 1F
; 1D40: 19 3E 05 93 47 CD 60 1E 77 23 05 C2 45 1D CD 5E
; 1D50: 1D 3A E6 1F 3D 32 E6 1F CA 9D 1D C3 DD 1C 3A E7
; 1D60: 1F FE 03 CA 93 1D 5F 16 00 21 D0 1F 19 E5 3E 05
; 1D70: 93 47 3C 4F 7E B9 CA 84 1D 23 05 C2 74 1D E1 AF
; 1D80: 32 E8 1F C9 D1 1A 77 79 12 3A E7 1F 3C 32 E7 1F
; 1D90: C3 5E 1D 21 D3 1F 7E 23 86 32 E8 1F C9 CD 8E 1E
; 1DA0: 21 CC 1F 3A E8 1F B7 C4 A3 1E 3A E5 1F 3D CD 5A
; 1DB0: 1E 3A E8 1F 86 77 47 3A E9 1F B8 DA C8 1D C2 D2
; 1DC0: 1D AF 32 EA 1F C3 D2 1D 78 32 E9 1F 3A E5 1F 32
; 1DD0: EA 1F CD 8E 1E 21 CE 1F CD A3 1E 3A E2 1F 47 3A
; 1DE0: E5 1F B8 CA ED 1D 3C 32 E5 1F C3 0C 1D 3A E4 1F
; 1DF0: 3D 32 E4 1F CA A9 1C C3 96 1C 3A E5 1F CD 7F 1E
; 1E00: 32 C7 1F 3A E6 1F C6 0A CD 7F 1E 32 C8 1F 11 D0
; 1E10: 1F 01 C9 1F 1A B7 3E 3F CA 1F 1E 1A CD 7F 1E E6
; 1E20: 7F 02 13 03 79 FE CE C2 14 1E 3A E7 1F 47 21 C9
; 1E30: 1F CD 86 1E 3A E5 1F 3D CD 5A 1E 7E C3 3F 1E 06
; 1E40: 00 FE 0A DA 4C 1E D6 0A 04 C3 41 1E CD 7F 1E 32
; 1E50: CF 1F 78 CD 7F 1E 32 CE 1F C9 21 D5 1F 85 6F C9
; 1E60: 3A E0 1F B7 1F D2 6A 1E EE B8 32 E0 1F FE FD D2
; 1E70: 60 1E FE 07 D8 D6 06 C3 72 1E 0E 7F C3 93 1E 21
; 1E80: 82 1F 85 6F 7E C9 78 B7 C8 0E 80 C3 98 1E CD FA
; 1E90: 1D 0E 00 21 C7 1F 06 09 7E E6 7F B1 77 23 05 C2
; 1EA0: 98 1E C9 06 02 CD 86 1E AF 32 DE 1F 3E 80 32 DF
; 1EB0: 1F 11 80 01 CD CC 1E 1B 7A B3 C2 B4 1E 3E 40 32
; 1EC0: DF 1F AF 32 ED 1F 3E FE 32 EB 1F C9 D5 CD 0F 1F
; 1ED0: 47 3A EB 1F B8 CA E1 1E 78 32 EB 1F 3E 03 32 EC
; 1EE0: 1F 3A EC 1F B7 CA 0B 1F 3D 32 EC 1F C2 0B 1F 78
; 1EF0: 3C C2 FC 1E 3E 01 32 ED 1F C3 0B 1F 3A ED 1F B7
; 1F00: CA 0B 1F AF 32 ED 1F 78 C3 0D 1F 3E FF D1 C9 21
; 1F10: E0 1F 34 3A DE 1F 3C 32 DE 1F 21 C7 1F 06 00 0E
; 1F20: FF 3E 7F D3 F8 78 2F E6 0F D3 FA CD 6E 1F D3 F8
; 1F30: 16 15 15 C2 32 1F 79 3C C2 60 1F DB FA 5F E6 40
; 1F40: 78 CA 56 1F 7B E6 20 78 CA 54 1F 7B E6 10 C2 60
; 1F50: 1F 78 C6 09 C6 09 E5 5F 16 00 21 AC 1F 19 4E E1
; 1F60: 23 04 78 FE 09 C2 21 1F 3E 7F D3 F8 79 C9 7E B7
; 1F70: F2 7E 1F 3A DE 1F 5F 3A DF 1F A3 3E 7F C0 7E E6
; 1F80: 7F C9 C0 F9 A4 B0 99 92 82 F8 80 90 36 37 77 7F
; 1F90: 0C 47 08 11 06 2F 12 7F 7F 12 09 79 0C 7F 06 2B
; 1FA0: 21 7F 7F 7F 7F 2F 23 63 2B 21 12 7F 00 04 08 11
; 1FB0: 0D 0C 09 05 01 02 06 0A 1A 0F 0E 0B 07 03 FF 14
; 1FC0: 13 FF 17 12 FF FF 10
