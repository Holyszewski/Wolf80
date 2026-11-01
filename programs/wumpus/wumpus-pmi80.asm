; Wumpus for the PMI-80 with the factory monitor, version 0.1.0: a port of Wumpus by Stan Ockers
; (The First Book of KIM, Hayden, 1977/78) from the KIM-1, closer to the original than the
; Savia-84 / Stone 1 version.
;
; SPDX-License-Identifier: GPL-3.0-or-later
; Copyright (C) 2026 Matěj "Wolf" Holyszewski
; Game design: Stan Ockers after Gregory Yob's Hunt the Wumpus, The First Book of KIM,
; Hayden 1977/78. Written anew for the Wolf80 project with the help of AI.
;
; Sixteen caves, two pits, two bats and three cans of mood-change gas, as in the original.
; Hex keys: move to a neighbouring cave, or aim a can at one. =: throw a can (the original's PC).
; Needs the FACTORY PMI-80 monitor: the display and the keyboard are the monitor's DISP routine
; (0140h, one scan of the nine digits, about 2.4 ms, returns CY = key pressed and the key code).
; DISP reads nine character codes through the pointer at 1FFCh, so the text is shown straight
; from the program's own text, the window slides over it by moving the pointer, and the ROM's
; character table (at 01BEh) is the font: this program has no font and no multiplex of its own.
; The original's 6 digits are 9 here: the text scrolls in a 9-character window, one step per
; 252 ms, and the last window stays until the key press. Keys are ignored while it scrolls.
; Messages, cave map, random generator and rules are the original's. No sound, no
; hold at the start or end of a message, no fast scrolling, no cancelling of a throw, no restart:
; RE, then EX 1C00 =, begins a new game (the random generator survives in RAM).
; Deviations: a title (WUMPUS) that waits for any key, added for randomness: the original started
; at once, and the only chance left to the first game was the release time of the start key, which
; is nearly the same every time; now the time spent on the title is counted and stirred into the
; generator, so the layout differs from game to game; 9-character window; a key that is not a neighbouring cave changes nothing (the
; original moved you to the key's number); the wake-up direction of the Wumpus comes from the
; random generator, not from a timer; the generator is also stirred by the time spent waiting
; for keys; U is shown without its upper left segment and W as a small u (the ROM's characters).
; Preserved: hidden Wumpus, bat transport into gas, "ONLY 1 CANS LEFT", 25 % stay when bumped.
;
; Monitor use: CALL DISP only. Written directly: the display pointer 1FFCh-1FFDh (as MIKROVARHANY
; does); DISP itself writes its key variable 1FFEh. Nothing else in 1FD9h-1FFFh is touched.
; RAM: image 1C00h up to IMAGE_END, variables 1FB0h-1FBEh, stack down from 1FD8h (monitor's).
; Intel 8080 / project TASM syntax, documented instructions only.
; Start: EX 1C00 =. End: RE.
; Manual entry: assemble this source and key in the bytes of the .hex or -bytes.txt listing.
;
; Versions:
; 0.1.0  first version

DISP    EQU 0140h       ; monitor: one scan, CY = key, A = key code rotated left
VPTR    EQU 1FFCh       ; monitor: pointer to the character codes DISP shows
STACK_TOP EQU 1FD9h
STEP_SCANS EQU 104      ; 104 scans of about 2.43 ms = 252 ms per scrolling step

        ORG 1C00h
START:  LXI SP,STACK_TOP
        LXI H,TITLE     ; the title stays until a key: KEY first waits for the monitor's final =
        SHLD VPTR       ; to be released, then counts the scans until the press into the generator
        CALL KEY
        CALL RELEASE    ; the key that started the game must not count as a move
; A fresh layout is drawn backwards from the second bat to the player; all six differ.
        MVI A,3
        STA CANS
        LXI H,PLAYER
        MVI B,9
CLEAR:  MVI M,0FFh
        INX H
        DCR B
        JNZ CLEAR
        LXI H,BAT2
PLACE:  PUSH H
        CALL PICK
        POP H
        MOV M,A
        MOV A,L
        CPI LOW(PLAYER)
        DCX H
        JNZ PLACE

; Warn for each neighbour, last to first. The highest hazard index wins.
TURN:   LDA PLAYER
        CALL NEIGHBOURS
        LXI D,ADJ
        MVI B,4
COPY:   MOV A,M
        STAX D
        INX H
        INX D
        DCR B
        JNZ COPY
        LXI H,ADJ+3
WARN:   PUSH H
        MOV A,M
        CALL HAZARD
        ORA A
        JZ NEXT
        LXI H,WUMPUS_CLOSE
        CPI 2
        JC SAY
        LXI H,PIT_CLOSE
        CPI 4
        JC SAY
        LXI H,BATS_CLOSE
SAY:    CALL SHOW
NEXT:   POP H
        MOV A,L
        CPI LOW(ADJ)
        DCX H
        JNZ WARN
ROOM:   LDA PLAYER
        STA CAVE
        LXI H,ROOM_TEXT
        CALL SHOW
        CALL KEY
        CPI 10h         ; = throws a can
        JZ AIM
        CALL VALID
        JNZ ROOM        ; not a neighbour: the message scrolls again
        STA PLAYER
        LXI H,GAS
        MVI B,3
CHECK:  CMP M
        JZ GAS_LOSS
        INX H
        DCR B
        JNZ CHECK
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
        JC EATEN        ; 4 times in 16 the Wumpus stays and eats you
        CALL MOVE_WUMPUS
        JMP TURN
BATS:   LXI H,SNATCH
        CALL SHOW
        CALL PICK       ; a cave without any hazard and not the old one
        STA PLAYER
        JMP TURN

AIM:    LXI H,QUERY
        CALL SHOW
        CALL KEY
        CALL VALID
        JNZ AIM
        MOV D,A
        LDA CANS
        DCR A
        MOV C,A
        MVI B,0
        LXI H,GAS
        DAD B
        MOV M,D         ; the gassed cave
        LDA WUMPUS
        CMP D
        JZ WIN
        LDA CANS
        DCR A
        STA CANS
        STA LEFT_N
        JZ EMPTY_LOSS
        CALL MOVE_WUMPUS
        LXI H,PLAYER
        LDA WUMPUS
        CMP M
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
EATEN:  LXI H,EAT_TEXT
REASON: CALL SHOW
LOSE:   LXI H,LOSE_TEXT
        CALL SHOW
        JMP LOSE
WIN:    LXI H,HUG_TEXT
        CALL SHOW
        JMP WIN

; VALID: A unchanged, Z only when A is one of the four neighbours.
VALID:  LXI H,ADJ
        MVI B,4
VALID1: CMP M
        RZ
        INX H
        DCR B
        JNZ VALID1
        INR B
        RET
; HAZARD: A = what is in cave A, as an index: 0 nothing, 1 Wumpus, 2-3 pits, 4-5 bats.
HAZARD: MOV D,A
        LXI H,BAT2
        MVI B,5
HAZARD1: MOV A,M
        CMP D
        JZ HAZARD2
        DCX H
        DCR B
        JNZ HAZARD1
HAZARD2: MOV A,B
        RET
; NEIGHBOURS: HL = the four neighbours of cave A in the map.
NEIGHBOURS:
        ADD A
        ADD A
        MOV C,A
        MVI B,0
        LXI H,MAP
        DAD B
        RET
MOVE_WUMPUS:
        CALL RANDOM
        ANI 3
        MOV E,A
        LDA WUMPUS
        CALL NEIGHBOURS
        MVI D,0
        DAD D
        MOV A,M
        STA WUMPUS
        RET
; PICK: a random cave that differs from all six places (player, Wumpus, pits, bats).
PICK:   CALL RANDOM
        ANI 0Fh
        LXI H,PLAYER
        MVI B,6
PICK1:  CMP M
        JZ PICK
        INX H
        DCR B
        JNZ PICK1
        RET

; Butterfield's five-byte generator: new = s0 + s3 + s4 + 1 (one carry chained), shifted in at s0.
RANDOM: LXI H,RNG
        MOV A,M
        STC
        INX H
        INX H
        INX H
        ADC M
        INX H
        ADC M
        MOV B,A
        MOV E,A
        LXI H,RNG
        MVI C,5
RANDOM1: MOV D,M
        MOV M,B
        MOV B,D
        INX H
        DCR C
        JNZ RANDOM1
        MOV A,E
        RET

; SHOW: scroll the text at HL through the nine-character window, 252 ms per step. DISP reads
; the tenth code too, so every text ends with FFh, and the last window stays on the display.
SHOW:   SHLD VPTR
SHOW1:  MVI B,STEP_SCANS
SHOW2:  CALL DISP
        DCR B
        JNZ SHOW2
        LHLD VPTR
        LXI D,9
        DAD D
        MOV A,M
        INR A
        RZ              ; the terminator follows the window: it shows the end of the text
        LHLD VPTR
        INX H
        SHLD VPTR
        JMP SHOW1

; RELEASE: wait until no key is held. DE counts the scans and is added to the generator.
RELEASE: LXI D,0
RELEASE1: INX D
        CALL DISP
        JC RELEASE1
STIR:   LHLD RNG
        DAD D
        SHLD RNG
        RET
; KEY: wait for a release, then for a key seen in two scans in a row. A = 0-F, 10h for =, more
; for the other keys.
KEY:    CALL RELEASE
KEY1:   INX D
        CALL DISP
        JNC KEY1
        CALL DISP
        JNC KEY1
        CALL STIR
        RRC
        SUI 80h
        RET

MAP:    DB 2,5,8,11, 2,3,4,14, 0,1,3,5, 1,2,4,6
        DB 1,3,7,15, 0,2,6,8, 3,5,7,9, 4,6,10,15
        DB 0,5,9,11, 6,8,10,12, 7,9,15,13, 0,8,12,14
        DB 9,11,13,14, 10,12,14,15, 1,11,12,13, 4,7,10,13

; The texts are in the monitor's character codes (01BEh table), one byte per character, ended by FFh.
; Digits and A-F are their own codes. Texts are at least nine characters long.
ROOM_TEXT:
        DB 19h,23h,11h,21h,19h,0Ah,12h,0Eh      ; _YOU_ARE
        DB 19h,22h,1Bh,19h      ; _IN_
CAVE:   DB 0                   ; patched: the cave you are in
        DB 19h,1Fh,19h,10h,21h,1Bh,1Bh,0Eh      ; _-_TUNNE
        DB 14h,05h,19h,14h,0Eh,0Ah,0Dh,19h      ; LS_LEAD_
        DB 10h,11h,19h      ; TO_
ADJ:    DB 0,0,0,0            ; patched: the four neighbours (VALID compares with them)
        DB 19h,0FFh
BUMP:   DB 19h,11h,11h,13h,05h,19h,1Fh,19h      ; _OOPS_-_
        DB 0Bh,21h,16h,13h,0Eh,0Dh,19h,0Ah      ; BUMPED_A
        DB 19h,15h,21h,16h,13h,21h,05h,19h      ; _WUMPUS_
        DB 19h,0FFh      ; _
MISSED: DB 19h,16h,22h,05h,05h,0Eh,0Dh,19h      ; _MISSED_
        DB 1Fh,19h,11h,1Bh,14h,23h,19h      ; -_ONLY_
LEFT_N: DB 0                  ; patched: cans left
        DB 19h,0Ch,0Ah,1Bh,05h,19h,14h,0Eh      ; _CANS_LE
        DB 0Fh,10h,19h,0FFh      ; FT_
LOSE_TEXT:
        DB 19h,23h,11h,21h,19h,14h,11h,05h      ; _YOU_LOS
        DB 0Eh,19h,0FFh      ; E_
QUERY:  DB 19h,12h,11h,11h,16h,1Dh,19h,19h      ; _ROOM?__
        DB 19h,0FFh      ; _
WUMPUS_CLOSE:
        DB 19h,15h,21h,16h,13h,21h,05h,19h      ; _WUMPUS_
        DB 0Ch,14h,11h,05h,0Eh,0FFh      ; CLOSE
PIT_CLOSE:
        DB 19h,13h,22h,10h,19h,0Ch,14h,11h      ; _PIT_CLO
        DB 05h,0Eh,0FFh      ; SE
BATS_CLOSE:
        DB 19h,0Bh,0Ah,10h,05h,19h,0Ch,14h      ; _BATS_CL
        DB 11h,05h,0Eh,19h,0FFh      ; OSE_
EAT_TEXT:
        DB 19h,1Ah,0Ah,19h,1Ah,0Ah,19h,15h      ; _HA_HA_W
        DB 21h,16h,13h,21h,05h,19h,20h,11h      ; UMPUS_GO
        DB 10h,19h,23h,11h,21h,19h,0FFh      ; T_YOU_
SNATCH: DB 19h,05h,21h,13h,0Eh,12h,0Bh,0Ah      ; _SUPERBA
        DB 10h,19h,05h,1Bh,0Ah,10h,0Ch,1Ah      ; T_SNATCH
        DB 19h,0FFh      ; _
PIT_TEXT:
        DB 19h,23h,23h,22h,22h,0Eh,0Eh,0Eh      ; _YYIIEEE
        DB 19h,0Fh,0Eh,14h,14h,19h,22h,1Bh      ; _FELL_IN
        DB 19h,13h,22h,10h,19h,0FFh      ; _PIT_
GAS_TEXT:
        DB 19h,20h,0Ah,05h,19h,22h,1Bh,19h      ; _GAS_IN_
        DB 12h,11h,11h,16h,19h,0FFh      ; ROOM_
EMPTY_TEXT:
        DB 19h,11h,21h,10h,19h,11h,0Fh,19h      ; _OUT_OF_
        DB 20h,0Ah,05h,19h,0FFh      ; GAS_
HUG_TEXT:
        DB 19h,19h,19h,19h,19h,20h,12h,0Eh      ; _____GRE
        DB 0Ah,10h,1Fh,19h,23h,11h,21h,19h      ; AT-_YOU_
        DB 20h,0Eh,10h,19h,0Ah,19h,1Ah,21h      ; GET_A_HU
        DB 20h,19h,0Fh,12h,11h,16h,19h,15h      ; G_FROM_W
        DB 21h,16h,13h,21h,05h,19h,0FFh      ; UMPUS_
TITLE:  DB 19h,15h,21h,16h,13h,21h,05h,19h      ; _WUMPUS_ (nine characters, shown as is)
        DB 19h,0FFh
CODE_END:
SIGNATURE: DB 'Wolf2026','v010'
IMAGE_END:

; Variables are not emitted: the generator survives in RAM across a restart.
VARS    EQU 1FB0h
PLAYER  EQU VARS
WUMPUS  EQU VARS+1
PIT1    EQU VARS+2
PIT2    EQU VARS+3
BAT1    EQU VARS+4
BAT2    EQU VARS+5
GAS     EQU VARS+6
CANS    EQU VARS+9
RNG     EQU VARS+10
VARS_END EQU VARS+15
        END
