; SPDX-License-Identifier: GPL-3.0-or-later
; Copyright (C) 2026 Matěj "Wolf" Holyszewski
; Ship, Captain, Crew, version 0.1.0. Original implementation of the traditional dice game.
; Stone 1, Stone or STONE-PMI monitor. Intel 8080 / Wolf80 assembler syntax, no Z80 extensions.
; Start 1800h; own I/O, no monitor calls. Reset exits.
; 1-9 players, 1-8 rounds. = roll, S bank, A round, F setup.
; Player, banked dice and cumulative score blink; roll counter and free dice stay steady.
; Versions:
; 0.1.0  first numbered version; cumulative scores, qualified cargo animations, roll counter
; Earlier development builds were unversioned.
; RAM: code START..CODE_END-1, variables VARS..VARS_END-1.
; Stack reserved 1FF0h..1FFFh, SP=2000h. Manual bytes follow END.
        ORG 1800h
STACK_TOP EQU 2000h
DWELL EQU 55
START:  DI
        LXI SP,STACK_TOP
        MVI A,88h
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
; The program's signature: Wolf, the year it was made and its version.
SIGNATURE: DB 'Wolf2026','v010'
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
; 1800: F3 31 00 20 3E 88 D3 FB 21 D3 1B 06 27 AF 77 23
; 1810: 05 C2 0E 18 CD 7A 1A 21 97 1B CD F6 18 CD A8 1A
; 1820: CD E9 18 CD CC 1A CD 2C 18 C3 23 18 FE 0F CA E9
; 1830: 18 4F 3A ED 1B B7 CA 5A 18 FE 04 CA 5A 18 FE 03
; 1840: CA A2 18 79 FE 0A CA C6 18 FE 10 CA 2B 19 FE 14
; 1850: C0 3A F3 1B FE 03 C0 C3 9D 19 79 B7 C8 FE 0A D0
; 1860: 47 3A ED 1B B7 C2 7A 18 78 32 EE 1B CD E0 18 3E
; 1870: 04 32 ED 1B 21 A5 1B C3 F6 18 78 FE 09 D0 32 EF
; 1880: 1B CD E0 18 3A EF 1B 32 F0 1B 21 E1 1B 06 09 AF
; 1890: 77 23 05 C2 90 18 3E 01 32 F1 1B AF 32 F5 1B C3
; 18A0: 0C 19 79 FE 10 CA 84 18 C9 3E 03 32 ED 1B 21 9E
; 18B0: 1B CD F6 18 3A F6 1B CD 7F 1A 32 D7 1B 3A F5 1B
; 18C0: CD 3F 1A C3 91 1A 3A F0 1B 47 3A EF 1B 90 3C CD
; 18D0: 7F 1A 32 DB 1B 3E AF 32 DA 1B CD A8 1A C3 FA 19
; 18E0: CD 7F 1A 32 DB 1B C3 A8 1A AF 32 ED 1B CD 7A 1A
; 18F0: 21 90 1B C3 F6 18 11 D3 1B 06 07 7E 12 23 13 05
; 1900: C2 FB 18 3E 7F 32 DA 1B 32 DB 1B C9 3E 01 32 ED
; 1910: 1B 3E 03 32 F2 1B AF 32 F3 1B 32 F4 1B 21 DC 1B
; 1920: 06 05 77 23 05 C2 22 19 C3 FA 19 2A EA 1B 3A EC
; 1930: 1B AD F6 01 32 EC 1B 3A F3 1B 5F 16 00 21 DC 1B
; 1940: 19 3E 05 93 47 CD 60 1A 77 23 05 C2 45 19 CD 5E
; 1950: 19 3A F2 1B 3D 32 F2 1B CA 9D 19 C3 DD 18 3A F3
; 1960: 1B FE 03 CA 93 19 5F 16 00 21 DC 1B 19 E5 3E 05
; 1970: 93 47 3C 4F 7E B9 CA 84 19 23 05 C2 74 19 E1 AF
; 1980: 32 F4 1B C9 D1 1A 77 79 12 3A F3 1B 3C 32 F3 1B
; 1990: C3 5E 19 21 DF 1B 7E 23 86 32 F4 1B C9 CD 8E 1A
; 19A0: 21 D8 1B 3A F4 1B B7 C4 A3 1A 3A F1 1B 3D CD 5A
; 19B0: 1A 3A F4 1B 86 77 47 3A F5 1B B8 DA C8 19 C2 D2
; 19C0: 19 AF 32 F6 1B C3 D2 19 78 32 F5 1B 3A F1 1B 32
; 19D0: F6 1B CD 8E 1A 21 DA 1B CD A3 1A 3A EE 1B 47 3A
; 19E0: F1 1B B8 CA ED 19 3C 32 F1 1B C3 0C 19 3A F0 1B
; 19F0: 3D 32 F0 1B CA A9 18 C3 96 18 3A F1 1B CD 7F 1A
; 1A00: 32 D3 1B 3A F2 1B C6 0A CD 7F 1A 32 D4 1B 11 DC
; 1A10: 1B 01 D5 1B 1A B7 3E 3F CA 1F 1A 1A CD 7F 1A E6
; 1A20: 7F 02 13 03 79 FE DA C2 14 1A 3A F3 1B 47 21 D5
; 1A30: 1B CD 86 1A 3A F1 1B 3D CD 5A 1A 7E C3 3F 1A 06
; 1A40: 00 FE 0A DA 4C 1A D6 0A 04 C3 41 1A CD 7F 1A 32
; 1A50: DB 1B 78 CD 7F 1A 32 DA 1B C9 21 E1 1B 85 6F C9
; 1A60: 3A EC 1B B7 1F D2 6A 1A EE B8 32 EC 1B FE FD D2
; 1A70: 60 1A FE 07 D8 D6 06 C3 72 1A 0E 7F C3 93 1A 21
; 1A80: 82 1B 85 6F 7E C9 78 B7 C8 0E 80 C3 98 1A CD FA
; 1A90: 19 0E 00 21 D3 1B 06 09 7E E6 7F B1 77 23 05 C2
; 1AA0: 98 1A C9 06 02 CD 86 1A AF 32 EA 1B 3E 80 32 EB
; 1AB0: 1B 11 80 01 CD CC 1A 1B 7A B3 C2 B4 1A 3E 40 32
; 1AC0: EB 1B AF 32 F9 1B 3E FE 32 F7 1B C9 D5 CD 0F 1B
; 1AD0: 47 3A F7 1B B8 CA E1 1A 78 32 F7 1B 3E 03 32 F8
; 1AE0: 1B 3A F8 1B B7 CA 0B 1B 3D 32 F8 1B C2 0B 1B 78
; 1AF0: 3C C2 FC 1A 3E 01 32 F9 1B C3 0B 1B 3A F9 1B B7
; 1B00: CA 0B 1B AF 32 F9 1B 78 C3 0D 1B 3E FF D1 C9 21
; 1B10: EC 1B 34 3A EA 1B 3C 32 EA 1B 21 D3 1B 06 00 0E
; 1B20: FF 3E 7F D3 F8 78 2F E6 0F D3 FA CD 6E 1B D3 F8
; 1B30: 16 37 15 C2 32 1B 79 3C C2 60 1B DB FA 5F E6 40
; 1B40: 78 CA 56 1B 7B E6 20 78 CA 54 1B 7B E6 10 C2 60
; 1B50: 1B 78 C6 09 C6 09 E5 5F 16 00 21 AC 1B 19 4E E1
; 1B60: 23 04 78 FE 09 C2 21 1B 3E 7F D3 F8 79 C9 7E B7
; 1B70: F2 7E 1B 3A EA 1B 5F 3A EB 1B A3 3E 7F C0 7E E6
; 1B80: 7F C9 C0 F9 A4 B0 99 92 82 F8 80 90 36 37 77 7F
; 1B90: 0C 47 08 11 06 2F 12 7F 7F 12 09 79 0C 7F 06 2B
; 1BA0: 21 7F 7F 7F 7F 2F 23 63 2B 21 12 7F 00 04 08 11
; 1BB0: 0D 0C 09 05 01 02 06 0A 1A 0F 0E 0B 07 03 FF 14
; 1BC0: 13 FF 17 12 FF FF 10 57 6F 6C 66 32 30 32 36 76
; 1BD0: 30 31 30
