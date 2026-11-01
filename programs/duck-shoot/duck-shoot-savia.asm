; Duck Shoot for the Savia-84, version 0.1.3: a port of Duck Shoot
; from the Acorn System 1 manual (Acorn Computers, 1979).
;
; SPDX-License-Identifier: GPL-3.0-or-later
; Copyright (C) 2026 Matěj "Wolf" Holyszewski
; Game design: Acorn System 1 manual (Acorn Computers, 1979).
; Written anew for the Wolf80 project with the help of AI.
;
; Shoot with 0 (left) through 7 (right); = / dA restarts the series. RE ends it.
; One duck flies left, wrapping around; misses leave the game unchanged.
; Added: scrolling title, rounds modulo 100, 10% acceleration from 320 ms down to 40 ms.
; The first duck is at position 6, as in the original; no randomness is used.
; Target: Savia-84 factory monitor. Intel 8080 syntax for asm8080.js; no monitor calls.
; RAM: code/tables 1800h..1AF0h; state 1AF1h..1AFDh,
; signature 1AFEh..1B09h; base screen 1B0Ah..1B12h,
; shot timers 1B13h..1B1Bh; scan buffer 1B1Ch..1B24h,
; stack reserved 1FA0h..1FBFh; SP = 1FC0h. Exact ranges and manual-entry bytes: duck-shoot-hotovo.md.
; Start: Ex 1800 dA. End: RE. Release the launch key before playing.
;
; Added: independent 100 ms bottom-segment shot indicators, without pausing flight.
; Versions:
; 0.1.3  the first duck moves every 320 ms, as on the Acorn System 1
; 0.1.2  append the Wolf2026v012 signature before uninitialized buffers
; 0.1.1  show each shot for 100 ms with independent display overlays
; 0.1.0  first version

PA      EQU 0F8h
PC      EQU 0FAh
CWR     EQU 0FBh
FRAME_DELAY EQU 37
        ORG 1800h
START:  DI
        LXI SP,1FC0h
        MVI A,88h
        OUT CWR
        XRA A
        STA LOCK
        STA OFFSET
        CALL CLEARS
        CALL CLEAR
RELEASE: CALL FRAME
        LDA ANYKEY
        ORA A
        JNZ RELEASE
TITLELOOP: CALL CLEAR
        LDA OFFSET
        MOV E,A
        MVI D,0
        LXI H,TITLE
        DAD D
        LXI D,SCREEN+2
        MVI B,7
COPY:   MOV A,M
        STAX D
        INX H
        INX D
        DCR B
        JNZ COPY
        LXI H,250
        LDA OFFSET
        ORA A
        JNZ LASTWIN
        LXI H,1500
LASTWIN: CPI 3
        JNZ TITLEWAIT
        LXI H,1000
TITLEWAIT: CALL WAIT
        LDA OFFSET
        INR A
        STA OFFSET
        CPI 4
        JNZ TITLELOOP
        CALL CLEAR
        LXI H,400
        CALL WAIT
NEW:    CALL CLEARS
        XRA A
        STA STATE
        STA SCORE
        STA RESTART
        LXI H,320
        SHLD SPEED
        SHLD TIMER
        MVI A,6
        STA POS
        CALL DUCK
MAIN:   CALL FRAME
        LDA RESTART
        ORA A
        JNZ NEW
        LDA KEY
        CPI 90h
        JZ NEW
        CPI 8
        JNC TICK
        MOV B,A
        LDA STATE
        ORA A
        JNZ TICK
        LDA POS
        CMP B
        JNZ MISS
        MVI A,1
        STA STATE
        CALL DEAD
        LXI H,1000
        SHLD TIMER
        JMP MAIN
MISS:   JMP TICK
TICK:   LXI D,-4
        LHLD TIMER
        DAD D
        SHLD TIMER
        JNC EXPIRE
        MOV A,H
        ORA L
        JNZ MAIN
EXPIRE: LDA STATE
        ORA A
        JZ MOVE
        DCR A
        JZ ROUND
; A fresh duck follows the one-second round number.
        LHLD SPEED
        LXI D,9
        DAD D
        MVI B,0
DIV10:  MOV A,H
        ORA A
        JNZ SUB10
        MOV A,L
        CPI 10
        JC QUOTIENT
SUB10:  LXI D,-10
        DAD D
        INR B
        JMP DIV10
QUOTIENT: LHLD SPEED
        MOV A,L
        SUB B
        MOV L,A
        MOV A,H
        SBI 0
        MOV H,A
        ORA A
        JNZ FAST
        MOV A,L
        CPI 40
        JNC FAST
        MVI L,40
FAST:   SHLD SPEED
        SHLD TIMER
        XRA A
        STA STATE
        MVI A,6
        STA POS
        CALL DUCK
        JMP MAIN
MOVE:   LHLD TIMER
        XCHG
        LHLD SPEED
        DAD D           ; preserve the sub-frame remainder
        SHLD TIMER
        LDA POS
        DCR A
        ANI 7
        STA POS
        CALL DUCK
        JMP MAIN
ROUND:  MVI A,2
        STA STATE
        LDA SCORE
        ADI 1
        DAA
        STA SCORE
        CALL CLEAR
        LDA SCORE
        ANI 0Fh
        CALL DIGIT
        STA SCREEN+8
        LDA SCORE
        RRC
        RRC
        RRC
        RRC
        ANI 0Fh
        CALL DIGIT
        STA SCREEN+7
        LXI H,1000
        SHLD TIMER
        JMP MAIN
DIGIT:  MOV E,A
        MVI D,0
        LXI H,DIGITS
        DAD D
        MOV A,M
        RET
DUCK:   MVI B,61h
        JMP DRAW
DEAD:   MVI B,1Ch
DRAW:   CALL CLEAR
        LDA POS
        ORA A
        JZ MAPPED
        INR A
MAPPED:         MOV E,A
        MVI D,0
        LXI H,SCREEN
        DAD D
        MOV M,B
        RET
CLEAR:  LXI H,SCREEN
        MVI E,9
        XRA A
CLS:    MOV M,A
        INX H
        DCR E
        JNZ CLS
        RET
; All waits use the same calibrated four-millisecond refresh frame.
WAIT:   SHLD TIMER
WAITLOOP: CALL FRAME
        MVI A,3
WPAD:   DCR A
        JNZ WPAD
        LXI B,0
        MVI A,0
        LXI B,0
        LHLD TIMER
        LXI D,-4
        DAD D
        SHLD TIMER
        JNC WAITEND
        MOV A,H
        ORA L
        JNZ WAITLOOP
WAITEND: RET

; Refresh is calibrated near 4 ms at 2 MHz (Z80, 8080 instructions only).
; Delay loop: DCR/JNZ = 14 states; FRAME_DELAY includes scan/loop overhead.
; Deselect before changing segments; sample keys, then deselect before decoding.
; Every digit has identical light dwell, including while a key is held.
; E is the column, H points into SHOWN, D forces g off, C is PA7.
FRAME:  MVI A,4
        CALL REFRESH
        MVI A,6
FPAD:   DCR A
        JNZ FPAD
        MVI A,FRAME_DELAY
        STA SDELAY+1
        LXI H,SHOWN
        LXI D,0
        MVI C,0
        MVI A,0FFh
        STA KEY
        STA CANDIDATE
        XRA A
        STA ANYKEY
FLOOP:  CALL SLOT
        IN PC
        MOV B,A
        MVI A,0Fh
        OUT PC
        MOV A,B
        ANI 70h
        CPI 70h
        JZ FNEXT
        MOV B,A
        MVI A,1
        STA ANYKEY
        LDA LOCK
        ORA A
        JNZ FNEXT
        LDA CANDIDATE
        CPI 0FFh
        JNZ FNEXT
        PUSH H
        PUSH D
        LXI H,KEY0
        MOV A,B
        ANI 40h
        JZ FOUND
        LXI H,KEY1
        MOV A,B
        ANI 20h
        JZ FOUND
        LXI H,KEY2
FOUND:  DAD D
        MOV A,M
        STA CANDIDATE
        POP D
        POP H
FNEXT:  INX H
        INR E
        MOV A,E
        CPI 9
        JNZ FLOOP
        LDA ANYKEY
        ORA A
        JZ UNLOCK
        LDA LOCK
        ORA A
        RNZ
        MVI A,1
        STA LOCK
        LDA CANDIDATE
        STA KEY
        CPI 8
        CC SHOT
        LDA KEY
        CPI 90h
        RNZ
        STA RESTART
        RET
UNLOCK: STA LOCK
        RET
SLOT:   MVI A,0Fh
        OUT PC
        MOV A,M
        CMA
        ANI 7Fh
        ORA D
        ORA C
        OUT PA
        MOV A,E
        OUT PC
SDELAY: MVI A,FRAME_DELAY
SW:     DCR A
        JNZ SW
        RET

; Independent per-digit millisecond lifetimes; base pixels are never changed.
SHOT:   ORA A
        JZ SHOTMAP
        INR A
SHOTMAP:         MOV E,A
        MVI D,0
        LXI H,SHOTS
        DAD D
        MVI M,104       ; first refresh consumes 4 ms before showing the shot
        RET
CLEARS: LXI H,SHOTS
        MVI B,9
        XRA A
CSHOT:  MOV M,A
        INX H
        DCR B
        JNZ CSHOT
        RET
; A is elapsed milliseconds. Both saturation paths take the same time.
REFRESH: STA AGEOP+1
        LXI H,SCREEN
        LXI B,SHOWN
        LXI D,SHOTS
RSHOT:  LDAX D
AGEOP:  SUI 0
        JNC AGEOK
        XRA A
        JMP AGED
AGEOK:  ORI 0
        ORI 0
AGED:   STAX D
        CPI 1
        SBB A
        CMA
        ANI 08h
        ORA M
        STAX B
        INX H
        INX B
        INX D
        MOV A,L
        CPI LOW(SCREEN+9)
        JNZ RSHOT
        RET

KEY0:   DB 0,4,88h,91h,8Dh,8Ch,89h,5,1
KEY1:   DB 2,6,8Ah,9Ah,8Fh,8Eh,8Bh,7,3
KEY2:   DB 0FEh,94h,93h,0FEh,97h,92h,0FEh,0FEh,90h
DIGITS: DB 3Fh,06h,5Bh,4Fh,66h,6Dh,7Dh,07h,7Fh,6Fh
TITLE:  DB 5Eh,3Eh,39h,76h,00h,6Dh,74h,3Fh,3Fh,78h
STATE:  DB 0
SCORE:  DB 0
POS:    DB 6
SPEED:  DW 320
TIMER:  DW 320
OFFSET: DB 0
LOCK:   DB 0
ANYKEY: DB 0
CANDIDATE: DB 0FFh
KEY:    DB 0FFh
RESTART: DB 0
; Last emitted bytes; all uninitialized buffers follow the signed image.
SIGNATURE: DB 'Wolf2026','v013'
IMAGE_END:
SCREEN: DS 9
SHOTS:  DS 9
SHOWN:  DS 9
DATA_END:
        END

