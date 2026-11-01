; Multi-Maze for the Savia-84, version 0.2.0: a port of Multi-Maze by Jim Butterfield
; (The First Book of KIM, Hayden, 1977/78, pp. 88-90) from the KIM-1.
;
; SPDX-License-Identifier: GPL-3.0-or-later
; Copyright (C) 2026 Matěj "Wolf" Holyszewski
; Game design: Jim Butterfield, Multi-Maze, The First Book of KIM (Hayden, 1977/78,
; pp. 88-90), KIM-1. The book released its programs "without copyright restrictions", so the
; maze and patch data are kept as published, while the code is written anew for the Wolf80
; project with the help of AI.
;
; Find the way out of the maze. You are the blinking segment in the middle of the display;
; lit segments are walls: a = the row above you, g = your row, d = the row below you, one
; digit per maze column. 9 or 8 up, 1 or 2 down, 4 left, 6 right (one step per key press);
; dA starts a new maze: eight random wall changes make one of 256 variants of the original.
; -S switches to generated mazes for good (until the next start): dA or -S then builds a new
; random maze of 7 x 8 cells with exactly one way out. RE ends it.
; Deviations from the original:
; - -S and the generated mazes, which the original does not have;
; - on the Savia 8 also moves up and 2 also down (the cross of its calculator-like keypad);
; - a scrolling title MULtI-MAZE is shown first and waits for a key, which mixes the random
;   number, so the first maze is random too (the original builds it from the length of GO);
; - seven digits (positions 2-8) with the player in the middle (position 5), three columns
;   on each side, instead of six digits with the player third;
; - the original ends in "open space" and lets you walk on into program memory: here the
;   open space is shown for one second, then OUt and the number of moves (at most 999) stay;
;   only dA starts a new maze after that.
; Target: Savia-84 factory monitor. Intel 8080 syntax for asm8080.js; no monitor calls.
; RAM: image 1800h-1B61h (866 bytes), the maze being played 1F73h-1FA0h (46 bytes),
; variables 1FA1h-1FB3h (19 bytes), stack 1FB4h-1FBFh (12 bytes, SP = 1FC0h at start).
; Start: Ex 1800 dA. End: RE.
;
; Versions:
; 0.1.0  first version
; 0.1.1  the same game, the code rewritten in 268 bytes less
; 0.2.0  S switches to generated mazes

PA      EQU 0F8h
PC      EQU 0FAh
CWR     EQU 0FBh

; Timing at 2 MHz (Z80 running 8080 instructions): a display frame is nine digit slots plus
; the bookkeeping after them, about 5.5 ms. Times are counted in frames.
BLINK_FRAMES EQU 14             ; 77 ms
HOLD_FRAMES EQU 180             ; open space 1.0 s
DWELL   EQU 72                  ; lit time of a digit in a frame, in 14-state loops
KEY_NEW EQU 60h                 ; the code of dA, see KEYS
KEY_GEN EQU 62h                 ; the code of -S

; RAM. The maze being played is a copy of COLS..MAZE (46 bytes, within one page).
; The 8080 LHLD PX gives L = column and H = row; SHLD MOVES+1 clears the hundreds and STATE
; together; LHLD SEED takes the frame counter RND as the high byte; the start sets STATE,
; SEED, HIST and ORIGINAL with two SHLD.
STACK_TOP EQU 1FC0h
STACK_LOW EQU STACK_TOP-12
VARS    EQU STACK_LOW-19
WORK    EQU VARS-46             ; columns -2 to 20 of the maze being played
PX      EQU VARS                ; player column + 2 (start 3, exit 17)
PY      EQU PX+1                ; player row 0-15 (start 6)
MOVES   EQU PY+1                ; moves in BCD: tens and units, then hundreds
STATE   EQU MOVES+2             ; 0 playing, 1 open space, 2 static (title, OUt)
SEED    EQU STATE+1             ; the generator's random number, with RND
RND     EQU SEED+1              ; counts frames; never cleared, so RAM leftovers mix it too
HIST    EQU RND+1               ; key down in the last frames, bit 0 = this frame
ORIGINAL EQU HIST+1             ; nonzero: the original maze; 0: generated mazes
DISPLAY EQU ORIGINAL+1          ; lit segments of digits 0-8 (bit 0 = a ... bit 6 = g)
BLCNT   EQU DISPLAY+9
VARS_END EQU BLCNT+1

        ORG 1800h
START:  DI
        LXI SP,STACK_TOP
        MVI A,88h
        OUT CWR
        LXI H,0202h
        SHLD STATE              ; static
        SHLD HIST               ; a key held counts after its release; the original maze
        LXI H,0
        SHLD DISPLAY            ; digits 0 and 1 stay dark
        LXI H,COLS
        LXI D,WORK
        MVI B,46
SCOPY:  MOV A,M                 ; the published maze to the one being played
        STAX D
        INX H
        INX D
        DCR B
        JNZ SCOPY

; The title scrolls through positions 2-8 and repeats until a key is pressed; the waiting
; time mixes the random number. TTAB gives each window's text and its time.
TITLE:  LXI B,TTAB
TWIN:   LDAX B
        INX B
        MOV E,A
        MVI D,HIGH(TEXT)
        CALL COPY7
        LDAX B
        INX B
        MOV L,A
        MVI H,0
        DAD H                   ; pairs of frames to frames
TWAIT:  PUSH B
        CALL WAITKEY
        POP B
        JZ NEWGAME
        MOV A,C
        CPI LOW(TTAB+10)
        JNZ TWIN
        JMP TITLE

; A new maze. -S switches to generated mazes for good. The original: the random byte
; decides which of the eight patches are applied (patch x if bit x is set); patches are
; cumulative, as in the original.
NEWGEN: LXI H,ORIGINAL
        MVI M,0
NEWGAME: LXI SP,STACK_TOP
        LDA ORIGINAL
        ORA A
        JZ GENERATE
        LDA RND
PATCHES: MOV C,A
        LXI H,PLACE
        MVI D,HIGH(WORK)
PNEXT:  MOV A,C
        RRC
        MOV C,A
        JNC PSKIP
        PUSH H
        MOV A,M
        ADI LOW(WORK+4)
        MOV E,A                 ; DE = the maze byte PLACE[x]
        MOV A,L
        ADI 8
        MOV L,A
        LDAX D
        XRA M                   ; POINT1[x]
        STAX D
        INX D
        INX D
        MOV A,L
        ADI 8
        MOV L,A
        LDAX D
        XRA M                   ; POINT2[x]
        STAX D
        POP H
PSKIP:  INX H
        MOV A,L
        CPI LOW(POINT1)
        JNZ PNEXT
SETUP:  LXI H,0603h
        SHLD PX                 ; column 3 (k = 1), row 6
        LXI H,0
        SHLD MOVES
        SHLD MOVES+1            ; and STATE = 0, playing
        CALL SHOW
MAIN:   CALL STEP
        JMP MAIN

; One frame and, for a new key, one step. A wall stops it.
STEP:   CALL FRAME
        RNZ
        LXI H,KEYS
KSEARCH: MOV A,M
        ORA A
        RZ                      ; not a move key
        INX H
        MOV E,M
        INX H
        MOV D,M
        INX H
        CMP B
        JNZ KSEARCH
        LHLD PX
        DAD D                   ; the target square
        MOV A,H
        CPI 16
        RNC                     ; above or below the maze
        MOV C,A
        PUSH H
        MOV A,L
        CALL COLPAT
        POP H
        ANI 40h
        RNZ                     ; a wall
        SHLD PX
        MOV B,L
        LHLD MOVES              ; count the move, at most 999
        MOV A,L
        ADI 1
        DAA
        MOV L,A
        MOV A,H
        ACI 0
        MOV H,A
        CPI 10
        JNC CAPPED
        SHLD MOVES
CAPPED: MOV A,B
        CPI 17
        JC SHOW                 ; column 15, behind the exit, is the open space
WIN:    LXI H,STATE
        INR M                   ; 1: open space
        CALL SHOW
        LXI H,HOLD_FRAMES
WHOLD:  CALL WAITKEY            ; = starts a new maze, other keys do nothing
        JZ WHOLD
        LXI H,STATE
        INR M                   ; 2: static
        CALL SHOWOUT
ENDL:   CALL FRAME
        JMP ENDL

; Draws the window: positions 2-8 show the columns PX+3 down to PX-3. The player's own
; square is free, so the blinking starts dark.
SHOW:   MVI A,BLINK_FRAMES
        STA BLCNT
        LDA PX
        ADI 3
        MOV B,A
        LXI D,DISPLAY+2
DNEXT:  LDA PY
        MOV C,A
        MOV A,B
        CALL COLPAT
        STAX D
        INX D
        DCR B
        MOV A,E
        CPI LOW(DISPLAY+9)
        JNZ DNEXT
        RET

; The segments of column A (= column + 2) around row C: a = the row above, g = the row,
; d = the row below. The column word is widened to 18 bits, a wall above row 0 and below
; row 15, and shifted left until the three rows are the low bits of A.
COLPAT: ADD A
        ADI LOW(WORK)
        MOV L,A
        MVI H,HIGH(WORK)
        MOV A,M
        INX H
        MOV L,M
        MOV H,A                 ; HL = the column word
        DAD H                   ; carry = row 0
        MVI A,2
        ACI 0                   ; A = the wall above, row 0
        INR L                   ; the wall below
        INR C
CSHIFT: DAD H
        RAL
        DCR C
        JNZ CSHIFT
        ANI 7
        ADI LOW(TAB1)
        MOV L,A
        MVI H,HIGH(TAB1)
        MOV A,M
        RET

; OUt on positions 2-4, position 5 dark, the moves on 6-8 without leading zeros.
SHOWOUT: LXI D,OUTTXT
        CALL COPY7
        LXI D,DISPLAY+6
        LHLD MOVES
        MVI C,0
        MOV A,H
        CALL DIGIT              ; hundreds
        MOV A,L
        RRC
        RRC
        RRC
        RRC
        CALL DIGIT              ; tens
        INR C                   ; the units always
        MOV A,L
DIGIT:  ANI 0Fh
        MOV B,A
        ORA C
        MOV C,A                 ; nonzero from the first digit shown
        JZ DSTORE
        PUSH H
        MOV A,B
        ADI LOW(DIGITS)
        MOV L,A
        MVI H,HIGH(DIGITS)
        MOV A,M
        POP H
DSTORE: STAX D
        INX D
        RET

; Copies seven segment bytes from DE to positions 2-8.
COPY7:  LXI H,DISPLAY+2
CNEXT:  LDAX D
        MOV M,A
        INX D
        INX H
        MOV A,L
        CPI LOW(DISPLAY+9)
        JNZ CNEXT
        RET

; Waits HL frames. Returns Z for a key (= has already started a new maze), NZ when the
; time is over.
WAITKEY: PUSH H
        CALL FRAME
        POP H
        RZ
        DCX H
        MOV A,H
        ORA L
        JNZ WAITKEY
        INR A
        RET

; One display frame: nine digit slots, then the blinking, the random number and the keys.
; A key counts once, when it goes down after three frames without a key; dA starts a new
; maze at once and -S switches to generated ones. Returns Z and B = the key's code for a new
; key, NZ for none.
FRAME:  LXI D,0                 ; D: no extra PA bits, E: digit 0
        MOV B,D                 ; no key seen
        MVI C,DWELL
FSLOT:  CALL SLOT
        CPI 70h
        JZ FNEXT
        ORA E                   ; the pressed row and the next digit's number
        MOV B,A
FNEXT:  MOV A,E
        ORA A
        JNZ FSLOT
        LDA STATE
        CPI 2
        JNC NOBLINK
        LXI H,BLCNT
        DCR M
        JNZ NOBLINK
        MVI M,BLINK_FRAMES
        MVI L,LOW(DISPLAY+5)
        MOV A,M
        XRI 40h
        MOV M,A
NOBLINK: LXI H,RND
        INR M
        INX H                   ; HIST
        MOV A,B
        ADI 0FFh                ; carry = a key is down
        MOV A,M
        RAL
        MOV M,A
        ANI 0Fh
        CPI 1                   ; down now, up in the three frames before
        RNZ
        MOV A,B
        CPI KEY_NEW
        JZ NEWGAME
        CPI KEY_GEN
        JZ NEWGEN
        XRA A
        RET

; One digit slot: digit E lit with its segments (and the PA bits in D) for C loops, then
; dark. Returns A = the key rows of its column (70h: none) and E = the next digit (0 after
; 8).
SLOT:   MVI H,HIGH(DISPLAY)
        MOV A,E
        ADI LOW(DISPLAY)
        MOV L,A
        MOV A,M
        XRI 7Fh                 ; segments are active low, PA7 = 0
        ORA D
        OUT PA
        MOV A,E
        OUT PC                  ; the digit on
        INR E
        MOV A,E
        CPI 9
        SBB A
        ANA E
        MOV E,A
        MOV A,C
SDWELL: DCR A
        JNZ SDWELL
        IN PC
        ORI 0Fh
        OUT PC                  ; no digit
        ANI 70h
        RET

; A generated maze: a depth-first search with backtracking over 7 x 8 cells, at the odd
; columns 1-13 and the even rows 0-14, from the start cell; the exit is column 14, row 6.
; Column 0 and row 15 stay walls. A cell left for good is marked by clearing its corner
; (row + 1, column + 1), a wall square of the finished maze, so the way back is the open
; neighbour without the mark, and no stack is needed; the corners are walled up at the end.
; DE = the cell (D row, E column k), C = the direction (0 up, 1 down, 2 left, 3 right, as in
; KEYS), B = the directions left to try. The display is dark while it works, 0.15 s.
GENERATE:
        LXI H,WORK+4
        MVI B,30
GFILL:  MVI M,0FFh              ; columns 0-14 all wall
        INX H
        DCR B
        JNZ GFILL
        LXI D,060Eh
        CALL CARVE              ; the exit: row 6, column 14
        MVI E,1
        CALL CARVE              ; the start: row 6, column 1
GNEXT:  LHLD SEED               ; two new bits of a 16-bit random number (x^16+x^5+x^3+x^2+1),
        MVI B,2                 ; the frame counter RND in its high byte
GRAND:  DAD H
        JNC GRNEXT
        MOV A,L
        XRI 2Dh
        MOV L,A
GRNEXT: DCR B
        JNZ GRAND
        SHLD SEED
        MOV A,L
        ANI 3
        MOV C,A                 ; the first direction to try
        MVI B,4
GTRY:   PUSH D
        CALL GSTEP
        CALL GSTEP              ; the next cell that way
        MOV A,E
        DCR A
        CPI 13
        JNC GNOT                ; left or right of the maze
        MOV A,D
        CPI 15
        JNC GNOT                ; above or below it
        CALL BITAT
        ANA M
        JZ GNOT                 ; visited already
        CALL CARVE
        POP H
        XCHG                    ; DE = the old cell, HL = the new one
        PUSH H
        CALL GSTEP
        CALL CARVE              ; the wall between
        POP D
        JMP GNEXT
GNOT:   POP D
        MOV A,C
        INR A
        ANI 3
        MOV C,A
        DCR B
        JNZ GTRY
        INR D                   ; a dead end: mark the cell done
        INR E
        CALL CARVE
        DCR D
        DCR E
        MVI B,4
GBACK:  PUSH D                  ; and go back through an open wall to a cell not done
        CALL GSTEP
        CALL BITAT
        ANA M
        JNZ GBNOT               ; a wall
        CALL GSTEP
        INR D
        INR E
        CALL BITAT
        DCR D
        DCR E
        ANA M
        JZ GBNOT                ; done (or the open space behind the exit)
        POP H
        JMP GNEXT
GBNOT:  POP D
        MOV A,C
        INR A
        ANI 3
        MOV C,A
        DCR B
        JNZ GBACK
        LXI H,WORK+8            ; back at the start: wall up the corners again, the odd
        MVI B,7                 ; rows of the even columns 2-14
GWALL:  MOV A,M
        ORI 55h
        MOV M,A
        INX H
        MOV A,M
        ORI 55h
        MOV M,A
        INX H
        INX H
        INX H
        DCR B
        JNZ GWALL
        JMP SETUP

; DE += the step of direction C, taken from KEYS (low byte column, high byte row).
GSTEP:  MOV A,C
        ADD A
        ADD C
        ADI LOW(KEYS+1)
        MOV L,A
        MVI H,HIGH(KEYS)
        MOV A,M
        INX H
        MOV H,M
        MOV L,A
        DAD D
        XCHG
        RET

; Clears the square in row D, column E of the maze being played.
CARVE:  CALL BITAT
        CMA
        ANA M
        MOV M,A
        RET
; HL = the byte of the square in row D, column E, A = its bit.
BITAT:  MOV A,D
        ANI 7
        INR A
        MOV L,A
        MVI A,1
BSHIFT: RRC
        DCR L
        JNZ BSHIFT
        PUSH PSW
        MOV A,D
        CPI 8
        CMC
        MOV A,E
        RAL                     ; 2 * column + (row > 7)
        ADI LOW(WORK+4)
        MOV L,A
        MVI H,HIGH(WORK)
        POP PSW
        RET

; The tables below are read with 8-bit address arithmetic: each one, and TEXT together
; with the zeros at MAZE+32, must lie within one 256-byte page (the test checks it), as must
; WORK in RAM.
; Title windows: the low byte of the text's address and the time in pairs of frames
; (1.5 s, 250 ms, 250 ms, 1.0 s, then 0.4 s dark from the unused end of the maze).
TTAB:   DB LOW(TEXT),136,LOW(TEXT+1),23,LOW(TEXT+2),23,LOW(TEXT+3),90,LOW(MAZE+32),36
OUTTXT: DB 3Fh,3Eh,78h,00h
; Segments for the three squares (a above, g here, d below): index a*4 + g*2 + d.
TAB1:   DB 00h,08h,40h,48h,01h,09h,41h,49h
DIGITS: DB 3Fh,06h,5Bh,4Fh,66h,6Dh,7Dh,07h,7Fh,6Fh
; Move keys: the code, then the change of the word PY:PX. A code is the key's row as read
; on port C (70h less PC6 40h, PC5 20h or PC4 10h) plus the number of the digit after its
; column: 9 = 37h, 1 = 30h, 4 = 32h, 6 = 52h, 8 = 33h, 2 = 51h (and dA = 60h, -S = 62h).
; 0 ends the list.
; The generator takes its steps from the first four entries.
KEYS:   DB 37h,00h,0FFh         ; 9 up: row - 1
        DB 30h,00h,01h          ; 1 down: row + 1
        DB 32h,01h,00h          ; 4 left: column + 1
        DB 52h,0FFh,0FFh        ; 6 right: column - 1
        DB 33h,00h,0FFh         ; 8 up
        DB 51h,00h,01h          ; 2 down
        DB 0

; The maze as published: a column is a 16-bit word, high byte first, bit 15 = row 0 at the
; top, 1 = wall. Column k is at MAZE + 2k and column k+1 lies to its LEFT. The player
; starts in column 1, row 6; column 15 (open space) is the exit. The four bytes before MAZE
; are columns -2 and -1, which the player sees at the start but cannot reach. The game
; plays a copy of these 46 bytes in RAM (WORK), so the published maze stays as it is.
COLS:   DB 40h,0DAh,02h,08h
MAZE:   DB 0FFh,0FFh,04h,00h,0F5h,7Fh,15h,00h,41h,0FEh,5Fh,04h,51h,7Dh,5Dh,04h
        DB 51h,0B6h,54h,14h,0F7h,0D5h,04h,54h,7Fh,5Eh,01h,00h,0FDh,0FFh,00h,00h
        DB 00h,00h,00h,00h,00h,00h,00h,00h,00h,00h
; The eight patches: MAZE[PLACE[x]] ^= POINT1[x] and MAZE[PLACE[x]+2] ^= POINT2[x].
PLACE:  DB 05h,0Bh,10h,10h,14h,18h,17h,10h
POINT1: DB 01h,04h,80h,10h,80h,02h,40h,40h
POINT2: DB 02h,02h,40h,01h,10h,04h,80h,10h
; MULtI-MAZE: M = a,b,d,f; t = d,e,f,g; I = e,f; Z = a,b,d,e,g (as 2).
TEXT:   DB 2Bh,3Eh,38h,78h,30h,40h,2Bh,77h,5Bh,79h
; Last bytes of the image; WORK and the variables follow.
SIGNATURE: DB 'Wolf2026','v020'
CODE_END:
        END
