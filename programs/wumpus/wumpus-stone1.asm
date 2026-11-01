; Wumpus for the Stone 1, version 0.1.2: a port of Wumpus by Stan Ockers
; (The First Book of KIM, Hayden, 1977/78) from the KIM-1.
;
; SPDX-License-Identifier: GPL-3.0-or-later
; Copyright (C) 2026 Matěj "Wolf" Holyszewski
; Game design: Stan Ockers after Gregory Yob's Hunt the Wumpus, The First Book of KIM,
; Hayden 1977/78. Written anew for the Wolf80 project with the help of AI.
;
; Sixteen caves, two pits, two bats and three cans of mood-change gas.
; Hex keys move/aim; = throws, cancels aiming, or restarts after the ending.
; WUMPUS waits for a fresh key. English text uses digits 2-7 only (8/9-digit panels).
; Changes: own I/O, 252 ms scrolling, hold any key for 5x speed, TICK seed mixing.
; Changes: added title, restart and throw cancellation; invalid keys cannot move you.
; Preserved: hidden Wumpus, bat transport into gas, and "ONLY 1 CANS LEFT".
; RAM: code/tables 1800h-1D10h, font/signature 1E00h-1E4Bh; variables 1F00h-1F27h.
; Stack: 1F80h-1FBFh, SP=1FC0h. No monitor calls; Stone 1 and STONE-PMI supported.
; Intel 8080 / project TASM syntax, no Z80 extensions. Start: EX 1800 =. End: Reset.
; Manual entry: assemble this source; load every addressed byte from the listing at 1800h
; and 1E00h (hex bytes, no relocation). Entry bytes: F3 31 C0 1F 3E 88 D3 FB.
;
; Versions:
; 0.1.2  hold last windows too; W uses f,b,g,d; append Wolf2026v012 signature
; 0.1.1  hold the first window of every message for 1.5 seconds (5x faster with a key)
; 0.1.0  first version

STACK_TOP EQU 1FC0h
; At Z80/2 MHz: 150 scans plus rendering = 246.99 ms (252 ms +/-5%).
; A held key subtracts five units per scan: 30 scans, about 51.2 ms.
SCROLL_FRAMES EQU 150
; 910 scans give about 1.497 s; held keys reduce this to 182 scans.
FIRST_FRAMES EQU 910
        ORG 1800h
START:  DI
        LXI SP,STACK_TOP
        MVI A,88h
        OUT 0FBh
        XRA A
        STA PHASE
        STA ARMED
        STA WAITING
        STA TICK
        STA TICK+1
        MVI A,0FFh
        STA PREV
        LXI H,DISPLAY
        MVI B,10
BLANK:  MVI M,7Fh
        INX H
        DCR B
        JNZ BLANK
        LXI H,TITLE
        CALL RENDER
        CALL WAIT_KEY
        CALL RELEASE

; A fresh layout is drawn backwards, with all six positions mutually distinct.
NEW_GAME:
        LXI SP,STACK_TOP
        MVI A,1
        STA PHASE
        MVI A,3
        STA CANS
        LXI H,PLAYER
        MVI B,9
CLEAR:  MVI M,0FFh
        INX H
        DCR B
        JNZ CLEAR
        MVI C,5
DRAW:   CALL RANDOM
        ANI 0Fh
        MOV D,A
        LXI H,PLAYER
        MVI B,6
UNIQUE: CMP M
        JZ DRAW
        INX H
        DCR B
        JNZ UNIQUE
        LXI H,PLAYER
        MVI B,0
        DAD B
        MOV M,D
        DCR C
        JP DRAW

; Warn for each neighbour, last to first. The highest hazard index wins.
TURN:   LDA PLAYER
        CALL NEIGHBOURS
        LXI D,ADJ
        MVI B,4
COPY_ADJ:
        MOV A,M
        STAX D
        INX H
        INX D
        DCR B
        JNZ COPY_ADJ
        MVI A,3
        STA WARN_INDEX
WARN:   LDA WARN_INDEX
        MOV C,A
        MVI B,0
        LXI H,ADJ
        DAD B
        MOV A,M
        CALL HAZARD
        ORA A
        JZ NEXT_WARN
        LXI H,WUMPUS_CLOSE
        CPI 2
        JC WARN_SHOW
        LXI H,PIT_CLOSE
        CPI 4
        JC WARN_SHOW
        LXI H,BATS_CLOSE
WARN_SHOW:
        CALL SHOW
NEXT_WARN:
        LDA WARN_INDEX
        DCR A
        STA WARN_INDEX
        JP WARN
ROOM:   MVI A,1
        STA PHASE
        LXI H,ROOM_TEXT
        CALL SHOW
        CALL WAIT_KEY
        CPI 10h
        JZ AIM
        CALL VALID
        JNZ ROOM
        STA PLAYER
        MOV D,A
        LXI H,GAS
        MVI B,3
CHECK_GAS:
        CMP M
        JZ GAS_LOSS
        INX H
        DCR B
        JNZ CHECK_GAS
        CALL HAZARD
        ORA A
        JZ TURN
        CPI 4
        JNC BATS
        CPI 2
        JNC PIT_LOSS
        LXI H,BUMP
        CALL SHOW
        CALL RANDOM
        ANI 0Fh
        CPI 4
        JC EATEN
        CALL MOVE_WUMPUS
        JMP TURN
BATS:   LXI H,BAT_SNATCH
        CALL SHOW
RELOCATE:
        CALL RANDOM
        ANI 0Fh
        MOV D,A
        LXI H,PLAYER
        MVI B,6
BAT_UNIQUE:
        CMP M
        JZ RELOCATE
        INX H
        DCR B
        JNZ BAT_UNIQUE
        STA PLAYER
        JMP TURN

AIM:    MVI A,2
        STA PHASE
        LXI H,ROOM_QUERY
        CALL SHOW
        CALL WAIT_KEY
        CPI 10h
        JZ ROOM
        CALL VALID
        JNZ AIM
        MOV D,A
        LDA CANS
        DCR A
        MOV C,A
        MVI B,0
        LXI H,GAS
        DAD B
        MOV M,D
        LDA WUMPUS
        CMP D
        JZ WIN
        LDA CANS
        DCR A
        STA CANS
        JZ EMPTY_LOSS
        CALL MOVE_WUMPUS
        LDA PLAYER
        MOV D,A
        LDA WUMPUS
        CMP D
        JZ EATEN
        LXI H,MISSED
        CALL SHOW
        JMP TURN

GAS_LOSS:
        LXI H,GAS_TEXT
        JMP REASON
PIT_LOSS:
        LXI H,PIT_TEXT
        JMP REASON
EMPTY_LOSS:
        LXI H,EMPTY_TEXT
        JMP REASON
EATEN:  LXI H,EATEN_TEXT
REASON: MVI A,3
        STA PHASE
        CALL SHOW
LOSE:   LXI H,LOSE_TEXT
        CALL SHOW
        JMP LOSE
WIN:    MVI A,4
        STA PHASE
HUG:    LXI H,HUG_TEXT
        CALL SHOW
        JMP HUG

; VALID returns the unchanged key in A, Z only for a neighbouring hex cave.
VALID:  LXI H,ADJ
        MVI B,4
VALID_LOOP:
        CMP M
        RZ
        INX H
        DCR B
        JNZ VALID_LOOP
        INR B
        RET
HAZARD: MOV D,A
        LXI H,BAT2
        MVI B,5
HAZARD_LOOP:
        MOV A,M
        CMP D
        JZ HAZARD_FOUND
        DCX H
        DCR B
        JNZ HAZARD_LOOP
HAZARD_FOUND:
        MOV A,B
        RET
NEIGHBOURS:
        ADD A
        ADD A
        MOV C,A
        MVI B,0
        LXI H,MAP
        DAD B
        RET
MOVE_WUMPUS:
        LDA WUMPUS
        CALL NEIGHBOURS
        LDA TICK
        ANI 3
        MOV C,A
        DAD B
        MOV A,M
        STA WUMPUS
        RET

; Butterfield's five-byte recurrence: chained carry starts at one.
; The new byte shifts into state[0], the oldest byte falls out.
RANDOM: LDA RNG+4
        MOV B,A
        LDA RNG+3
        MOV D,A
        LDA RNG
        STC
        ADC D
        ADC B
        MOV D,A
        LXI H,RNG+3
        MVI B,4
SHIFT:  MOV A,M
        INX H
        MOV M,A
        DCX H
        DCX H
        DCR B
        JNZ SHIFT
        MOV A,D
        STA RNG
        RET
SEED:   LDA TICK
        MOV B,A
        LDA TICK+1
        ADD B
        MOV B,A
        LDA RNG
        ADD B
        STA RNG
; All-FF is a fixed point; escape it even if the tick sum happens to wrap to zero.
        LXI H,RNG
        MVI B,5
SEED_CHECK:
        MOV A,M
        CPI 0FFh
        RNZ
        INX H
        DCR B
        JNZ SEED_CHECK
        XRA A
        STA RNG
        RET

; The last six text characters remain visible. Markers 1..6 insert cave/can digits.
SHOW:   SHLD POINTER
        XRA A
        STA WAITING
        CALL RENDER
        LXI B,FIRST_FRAMES
        JMP SHOW_DELAY
SHOW_FRAME:
        LHLD POINTER
        CALL RENDER
        LXI B,SCROLL_FRAMES
        MOV A,M       ; RENDER leaves HL just beyond the six-character window
        ORA A
        JNZ SHOW_DELAY
        LXI B,FIRST_FRAMES ; the last window gets the same pause as the first
SHOW_DELAY:
        CALL SCAN
        LDA PHASE
        CPI 3
        JC NO_RESTART
        LDA EVENT
        CPI 10h
        JZ NEW_GAME
NO_RESTART:
        LDA RAWKEY
        CPI 0FFh
        MVI A,1
        JZ COUNT_FRAME
        MVI A,5
COUNT_FRAME:
        MOV D,A
        MOV A,C
        SUB D
        MOV C,A
        MOV A,B
        SBI 0
        MOV B,A
        JC STEP_TEXT
        ORA C
        JNZ SHOW_DELAY
STEP_TEXT:
        LHLD POINTER
        LXI D,6
        DAD D
        MOV A,M
        ORA A
        RZ
        LHLD POINTER
        INX H
        SHLD POINTER
        JMP SHOW_FRAME
RENDER: LXI D,DISPLAY+2
        MVI B,6
RENDER_LOOP:
        MOV A,M
        INX H
        CPI 7
        JNC CHARACTER
        PUSH H
        PUSH B
        CPI 6
        JZ CAN_DIGIT
        DCR A
        JZ PLAYER_DIGIT
        DCR A
        MOV C,A
        MVI B,0
        LXI H,ADJ
        DAD B
        MOV A,M
        JMP HEX_DIGIT
PLAYER_DIGIT:
        LDA PLAYER
        JMP HEX_DIGIT
CAN_DIGIT:
        LDA CANS
HEX_DIGIT:
        MOV C,A
        MVI B,0
        LXI H,HEX
        DAD B
        MOV A,M
        POP B
        POP H
CHARACTER:
        PUSH H
        ANI 3Fh
        MOV L,A
        MVI H,HIGH(FONT)
        MOV A,M
        STAX D
        INX D
        POP H
        DCR B
        JNZ RENDER_LOOP
        RET

WAIT_KEY:
        XRA A
        STA ARMED
        INR A
        STA WAITING
WAIT_LOOP:
        CALL SCAN
        LDA EVENT
        CPI 0FFh
        JZ WAIT_LOOP
        RET
RELEASE:
        CALL SCAN
        LDA RAWKEY
        CPI 0FFh
        JNZ RELEASE
        RET

; One ten-column scan, with blanking before every column change (no ghosting).
; PC6, PC5, PC4 priority, two consecutive equal samples and release gating.
SCAN:   PUSH B
        PUSH D
        PUSH H
        MVI A,0FFh
        STA RAWKEY
        STA EVENT
        LXI D,0
COLUMN: MVI A,7Fh
        OUT 0F8h
        MOV A,E
        CMA             ; Savia uses NOP here: identical Z80 timing
        OUT 0FAh
        LXI H,DISPLAY
        DAD D
        MOV A,M
        OUT 0F8h
        MVI B,6
DWELL:  DCR B
        JNZ DWELL
        MOV A,E
        CPI 9
        JNC NEXT_COLUMN
        MVI B,0
        MVI C,9
        LXI H,KEYS
        IN 0FAh
        ANI 70h
        RLC
        RLC
        JNC KEY_FOUND
        RLC
        JNC ROW_TWO
        RLC
        JC NEXT_COLUMN
        DAD B
ROW_TWO:
        DAD B
KEY_FOUND:
        DAD D
        LDA RAWKEY
        CPI 0FFh
        JNZ NEXT_COLUMN
        MOV A,M
        STA RAWKEY
NEXT_COLUMN:
        INR E
        MOV A,E
        CPI 10
        JNZ COLUMN
        LHLD TICK
        INX H
        SHLD TICK
        LDA RAWKEY
        CPI 0FFh
        JNZ KEY_DOWN
        STA PREV
        MVI A,1
        STA ARMED
        JMP SCAN_DONE
KEY_DOWN:
        MOV B,A
        LDA PREV
        CMP B
        MOV A,B
        STA PREV
        JNZ SCAN_DONE
        LDA ARMED
        ORA A
        JZ SCAN_DONE
        XRA A
        STA ARMED
        MOV A,B
        STA EVENT
        CALL SEED
SCAN_DONE:
        POP H
        POP D
        POP B
        RET

MAP:    DB 2,5,8,11, 2,3,4,14, 0,1,3,5, 1,2,4,6
        DB 1,3,7,15, 0,2,6,8, 3,5,7,9, 4,6,10,15
        DB 0,5,9,11, 6,8,10,12, 7,9,15,13, 0,8,12,14
        DB 9,11,13,14, 10,12,14,15, 1,11,12,13, 4,7,10,13
KEYS:   DB 0,4,8,17,13,12,9,5,1
        DB 2,6,10,17,15,14,11,7,3
        DB 0FFh,17,17,0FFh,17,17,0FFh,0FFh,16
HEX:    DB '0123456789ABCDEF'
TITLE:  DB 'WUMPUS',0
ROOM_TEXT:
        DB ' YOU ARE IN ',1,' - TUNNELS LEAD TO ',2,3,4,5,' ',0
BUMP:   DB ' OOPS - BUMPED A WUMPUS  ',0
MISSED: DB ' MISSED - ONLY ',6,' CANS LEFT ',0
LOSE_TEXT:
        DB ' YOU LOSE ',0
ROOM_QUERY:
        DB ' ROOM? ',0
WUMPUS_CLOSE:
        DB ' WUMPUS CLOSE',0
PIT_CLOSE:
        DB ' PIT CLOSE',0
BATS_CLOSE:
        DB ' BATS CLOSE ',0
EATEN_TEXT:
        DB ' HA HA WUMPUS GOT YOU ',0
BAT_SNATCH:
        DB ' SUPERBAT SNATCH ',0
PIT_TEXT:
        DB ' YYIIEEE FELL IN PIT ',0
GAS_TEXT:
        DB ' GAS IN ROOM ',0
EMPTY_TEXT:
        DB ' OUT OF GAS ',0
HUG_TEXT:
        DB '     GREAT- YOU GET A HUG FROM WUMPUS ',0
CODE_END:

; ASCII & 3Fh, active-low segments, PA7 always zero. Standard monitor digits.
        ORG 1E00h
FONT:   DB 7Fh,08h,03h,46h,21h,06h,0Eh,42h
        DB 09h,7Bh,7Fh,7Fh,47h,48h,2Bh,23h
        DB 0Ch,7Fh,2Fh,12h,07h,41h,7Fh,15h
        DB 7Fh,11h,7Fh,7Fh,7Fh,7Fh,7Fh,7Fh
        DB 7Fh,7Fh,7Fh,7Fh,7Fh,7Fh,7Fh,7Fh
        DB 7Fh,7Fh,7Fh,7Fh,7Fh,3Fh,7Fh,7Fh
        DB 40h,79h,24h,30h,19h,12h,02h,78h
        DB 00h,10h,7Fh,7Fh,7Fh,7Fh,7Fh,2Ch
FONT_END:
SIGNATURE: DB 'Wolf2026','v012'
IMAGE_END:

; Variables are not emitted: persistent RNG survives a monitor reset/reload.
VARS    EQU 1F00h
PLAYER  EQU VARS
WUMPUS  EQU VARS+1
PIT1    EQU VARS+2
PIT2    EQU VARS+3
BAT1    EQU VARS+4
BAT2    EQU VARS+5
GAS     EQU VARS+6
CANS    EQU VARS+9
ADJ     EQU VARS+10
WARN_INDEX EQU VARS+14
PHASE   EQU VARS+15
WAITING EQU VARS+16
ARMED   EQU VARS+17
PREV    EQU VARS+18
RAWKEY  EQU VARS+19
EVENT   EQU VARS+20
TICK    EQU VARS+21
RNG     EQU VARS+23
DISPLAY EQU VARS+28
POINTER EQU VARS+38
VARS_END EQU VARS+40
        END
