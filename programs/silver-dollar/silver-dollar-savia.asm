; Silver Dollar for the Savia-84, version 0.1.2: a port of Silver Dollar Game
; from the MK14 Manual (Science of Cambridge, 1978), probably by David Johnson-Davies.
;
; SPDX-License-Identifier: GPL-3.0-or-later
; Copyright (C) 2026 Matěj "Wolf" Holyszewski
; Game design: MK14 Manual (Science of Cambridge, 1978), program probably by
; David Johnson-Davies. Written anew for the Wolf80 project with the help of AI.
;
; Keys 1-5 slide one coin right per press; dA completes the turn; Ex restarts.
; Coins cannot jump or change within a turn. Track: indices 0, 2-8, index 1 dark.
; Odd squares use e/f, even squares b/c, with d underneath.
; A push that packs all five coins wins immediately, without confirmation.
; Changes: scrolling title, alternating loss/position screens, EX restart,
; random winning starts after the original first game, silent operation.
; Target monitors: factory Savia. No monitor calls or Z80 instructions.
; Intel 8080 syntax for src/asm/asm8080.js; no parity-dependent arithmetic.
; RAM: code/data 1800h-1B20h; variables 1F90h-1FA8h (25 bytes);
; stack reserved 1FB9h-1FD8h, SP=1FD9h (tested low-water mark 1FCFh).
; Manual-entry bytes: silver-dollar-hotovo.md.
; Start: Ex 1800 dA. End: RE. CPU/display checks are emulator tests only.
;
; Versions:
; 0.1.2  append the Wolf2026v012 signature to the assembled image
; 0.1.1  announce a packed final position immediately after the player push
; 0.1.0  first version

        ORG 1800h
START:  DI
        LXI SP,1FD9h
        MVI A,88h
        OUT 0FBh
        MVI A,7Fh
        OUT 0F8h
        LXI H,VARS
        MVI B,VARS_END-VARS
        CALL ZERO
        MVI A,1
        STA LOCK
TITLE_NEXT:
        LDA OFFSET
        MOV E,A
        MVI D,0
        LXI H,TITLE
        DAD D
        LXI D,DISPLAY+2
        MVI B,7
        CALL COPY
        LDA OFFSET
        MVI B,24
        ORA A
        JNZ TITLE_LAST
        MVI B,143
TITLE_LAST:
        CPI 6
        JNZ TITLE_WAIT
        MVI B,95
TITLE_WAIT:
        CALL WAIT
        LXI H,OFFSET
        INR M
        MOV A,M
        CPI 7
        JNZ TITLE_NEXT
TITLE_DONE:
        CALL DARK
        MVI B,38
        CALL WAIT
READY:  CALL FRAME
        LDA LOCK
        ORA A
        JNZ READY
NEW_GAME:
        LXI SP,1FD9h
        XRA A
        STA SELECTED
        STA RESULT
        LDA PLAYED
        ORA A
        JNZ RANDOM_GAME
        INR A
        STA PLAYED
        LXI H,INITIAL
        LXI D,P
        MVI B,6
        CALL COPY
        JMP REDRAW
; Accept a 16-bit bitboard with five coins, nonzero nim sum, unlike INITIAL.
RANDOM_GAME:
        CALL RNG_NEXT
        XCHG
        LXI H,P+1
        MVI B,16
        MVI C,0
RANDOM_BIT:
        MOV A,D
        ORA A
        RAR
        MOV D,A
        MOV A,E
        RAR
        MOV E,A
        JNC RANDOM_SKIP
        MOV A,L
        CPI LOW(P+6)
        JZ RANDOM_GAME
        MOV M,C
        INX H
RANDOM_SKIP:
        INR C
        DCR B
        JNZ RANDOM_BIT
        MOV A,L
        CPI LOW(P+6)
        JNZ RANDOM_GAME
        CALL NIM
        MOV A,C
        ORA A
        JZ RANDOM_GAME
        LXI H,P+1
        LXI D,INITIAL+1
        MVI B,5
RANDOM_COMPARE:
        LDAX D
        CMP M
        JNZ RANDOM_ACCEPT
        INX H
        INX D
        DCR B
        JNZ RANDOM_COMPARE
        JMP RANDOM_GAME
RANDOM_ACCEPT:
        LXI H,P
        MVI M,0FFh
REDRAW: CALL DRAW
        LDA P+5
        CPI 4
        JZ PLAYER_WON
HUMAN:  CALL FRAME
        ORA A
        JZ HUMAN
        CPI 7
        JZ NEW_GAME
        CPI 6
        JZ MACHINE
        JNC HUMAN
        MOV E,A
        LDA SELECTED
        ORA A
        JZ CHOOSE
        CMP E
        JNZ BAD_MOVE
CHOOSE: MVI D,0
        LXI H,P
        DAD D
        CALL GAP
        ORA A
        JZ BAD_MOVE
        MOV A,E
        STA SELECTED
        DCR M
        JMP REDRAW
BAD_MOVE:
        JMP HUMAN
MACHINE:
        LDA SELECTED
        ORA A
        JZ HUMAN
        CALL NIM
        MOV A,C
        ORA A
        JZ NOGO
        LXI H,P+1
SOLVE:  CALL GAP
        MOV E,A
        XRA C
        CMP E
        JC SOLVED
        INX H
        INX H
        JMP SOLVE
SOLVED: SUB E
        ADD M
        MOV M,A
        JMP MACHINE_DONE
NOGO:   LXI H,P+5
        MVI B,5
NOGO_NEXT:
        CALL GAP
        ORA A
        JNZ NOGO_MOVE
        DCX H
        DCR B
        JNZ NOGO_NEXT
PLAYER_WON:
        MVI A,1
        STA RESULT
        JMP END_MESSAGE
NOGO_MOVE:
        DCR M
MACHINE_DONE:
        XRA A
        STA SELECTED
        CALL DRAW
        LDA P+5
        CPI 4
        JZ PLAYER_LOST
        JMP HUMAN
PLAYER_LOST:
        MVI A,2
        STA RESULT
END_MESSAGE:
        CALL SHOW_RESULT
        MVI B,143
        CALL END_WAIT
        CALL DRAW
        MVI B,95
        CALL END_WAIT
        JMP END_MESSAGE
END_WAIT:
        PUSH B
        CALL FRAME
        POP B
        ORA A
        JNZ NEW_GAME
        DCR B
        JNZ END_WAIT
        RET
SHOW_RESULT:
        LDA RESULT
        DCR A
        LXI H,I_LOSE
        JZ END_COPY
        LXI H,YOU_LOSE
END_COPY:
        LXI D,DISPLAY
        MVI B,9
        JMP COPY
; HL addresses a coin; return its free gap, preserving HL and BC/DE.
GAP:    MOV A,M
        DCX H
        SUB M
        DCR A
        INX H
        RET
NIM:    LXI H,P+1
        MVI B,3
        MVI C,0
NIM_NEXT:
        CALL GAP
        XRA C
        MOV C,A
        INX H
        INX H
        DCR B
        JNZ NIM_NEXT
        RET
; Digit 8-(square/2), except the leftmost track digit is 0 on the Savia.
DRAW:   LXI H,DISPLAY
        MVI B,9
DRAW_CLEAR:
        MVI M,08h
        INX H
        DCR B
        JNZ DRAW_CLEAR
        XRA A
        STA DISPLAY+1
        LXI H,P+1
        MVI B,5
DRAW_COIN:
        MOV A,M
        RRC
        MVI C,06h
        JNC DRAW_EVEN
        MVI C,30h
DRAW_EVEN:
        ANI 7Fh
        MOV E,A
        MVI A,8
        SUB E
        CPI 1
        JNZ DRAW_INDEX
        DCR A
DRAW_INDEX:
        MOV E,A
        MVI D,0
        PUSH H
        LXI H,DISPLAY
        DAD D
        MOV A,M
        ORA C
        MOV M,A
        POP H
        INX H
        DCR B
        JNZ DRAW_COIN
        RET
DARK:   LXI H,DISPLAY
        MVI B,9
ZERO:   MVI M,0
        INX H
        DCR B
        JNZ ZERO
        RET
COPY:   MOV A,M
        STAX D
        INX H
        INX D
        DCR B
        JNZ COPY
        RET
WAIT:   PUSH B
        CALL FRAME
        POP B
        DCR B
        JNZ WAIT
        RET
; All 27 matrix bits are sampled every frame, including ignored keys.
; Branch-free row counting rejects multiple keys, even in the same column.
; Key codes: 1..5 coins, 6 confirm, 7 EX, 32..51 ignored, 0 none, FF multiple.
FRAME:  LXI H,DISPLAY
        MVI E,0
        MVI C,0
        MVI D,0
SLOT:   MVI A,7Fh
        OUT 0F8h
        MOV A,E
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
        CMA
        ANI 70h
        RRC
        RRC
        RRC
        RRC
        MOV B,A
        PUSH H
        MOV A,E
        ADD A
        ADD E
        MOV L,A
        MVI H,0
        PUSH D
        LXI D,KEYS
        DAD D
        POP D
        MVI E,3
ROW:    MOV A,B
        RRC
        MOV B,A
        MOV A,D
        ACI 0
        MOV D,A
        MOV A,B
        RLC
        SBB A
        ANA M
        ORA C
        MOV C,A
        INX H
        DCR E
        JNZ ROW
        POP H
        MOV A,L
        SUI LOW(DISPLAY)
        MOV E,A
        INX H
        INR E
        MOV A,E
        CPI 9
        JNZ SLOT
        MOV A,D
        CPI 2
        JC SINGLE_KEY
        MVI C,0FFh
SINGLE_KEY:
        LXI H,RAW
        MOV A,C
        CMP M
        MOV M,A
        JZ SAME_KEY
        MVI A,0
        STA STABLE
SAME_KEY:
        LXI H,STABLE
        MOV A,M
        CPI 3
        JZ NO_EVENT
        INR M
        CPI 2
        JNZ NO_EVENT
        MOV A,C
        ORA A
        JZ RELEASED
        CPI 0FFh
        JZ CHORD
        LDA LOCK
        ORA A
        JNZ NO_EVENT
        INR A
        STA LOCK
        MOV A,C
        JMP EVENT_READY
CHORD:  MVI A,1
        STA LOCK
        JMP NO_EVENT
RELEASED:
        XRA A
        STA LOCK
NO_EVENT:
        XRA A
EVENT_READY:
        PUSH PSW
        CALL RNG_NEXT
        POP PSW
        RET
; Maximal-period right-shift Galois LFSR (B400h), mixed by waiting time.
RNG_NEXT:
        LHLD RNG
        MOV A,H
        ORA L
        JNZ RNG_NONZERO
        LXI H,365Ah
RNG_NONZERO:
        MOV A,H
        ORA A
        RAR
        MOV H,A
        MOV A,L
        RAR
        MOV L,A
        JNC RNG_SAVE
        MOV A,H
        XRI 0B4h
        MOV H,A
RNG_SAVE:
        SHLD RNG
        RET
TITLE:  DB 6Dh,30h,38h,3Eh,79h,50h,00h,5Eh,3Fh,38h,38h,77h,50h
INITIAL: DB 0FFh,3,5,8,9,15
I_LOSE: DB 00h,00h,30h,00h,38h,5Ch,6Dh,79h,00h
YOU_LOSE: DB 6Eh,00h,3Fh,3Eh,00h,38h,5Ch,6Dh,79h
; Column-major, rows PC4, PC5, PC6 (unassigned switches still interlock).
KEYS:   DB 32,2,33, 34,35,4, 36,37,38, 39,40,7, 41,42,43
        DB 44,45,46, 47,48,49, 50,51,5, 6,3,1
; Final image bytes; variables below are allocated at runtime.
SIGNATURE: DB 'Wolf2026','v012'
CODE_END:
DWELL_COUNT EQU 129
VARS:   EQU 1F90h
DISPLAY: EQU VARS
P:      EQU DISPLAY+9
SELECTED: EQU P+6
PLAYED: EQU SELECTED+1
OFFSET: EQU PLAYED+1
RAW:    EQU OFFSET+1
STABLE: EQU RAW+1
LOCK:   EQU STABLE+1
RNG:    EQU LOCK+1
RESULT: EQU RNG+2
TONE_DELAY: EQU RESULT+1
VARS_END: EQU TONE_DELAY+1
        END
