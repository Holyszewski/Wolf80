; Duck Shoot (MK14) for the Savia-84, version 0.1.3: a new port of the
; MK14 manual game (Science of Cambridge, 1978), attributed to David
; Johnson-Davies by the specification; attribution not independently verified.
;
; SPDX-License-Identifier: GPL-3.0-or-later
; Copyright (C) 2026 Matěj "Wolf" Holyszewski
; Game design: MK14 manual (Science of Cambridge, 1978), David Johnson-Davies
; (attribution uncertain). Written anew for the Wolf80 project with the help of AI.
;
; Keys 0..7 toggle a duck: hit removes it, miss adds it. One shot per move.
; Positions run from 0 at the left to 7 at the right, reversing MK14 numbering.
; Ducks fly left and wrap every 87 ms, as on the MK14 (SC/MP II microcycle = 4
; crystal periods); no score, acceleration or game over.
; Added: scrolling dUCH ShOOt title (H replaces K) and a release interlock.
; Target: factory Savia-84, 2 MHz, eight or nine digits. No monitor calls or randomness.
; Intel 8080 syntax, asm8080.js. Start: Ex 1800 dA. End: RE.
; RAM: code/tables 1800h..1A0Ah, screen 1A23h..1A2Bh.
; Variables: 1A0Bh..1A16h; shot counters 1F90h..1F98h.
; Signature: 1A17h..1A22h (Wolf2026v013).
; Stack: 1FA0h..1FBFh, initial SP=1FC0h.
; Verification and timing report: zadani/porty-her/duck-shoot-mk14-hotovo.md.
;
; Every fresh 0..7 press adds segment d at its fixed target for 100 ms.
; Indicators are independent; even a shot blocked by the move limit flashes.
;
; Versions:
; 0.1.3  ducks move every 87 ms, as on the MK14 (SC/MP II microcycle = 4 crystal periods)
; 0.1.2  append the Wolf2026v012 signature before uninitialized storage
; 0.1.1  add a 100 ms shot indicator without pausing flight
; 0.1.0  first version

PA      EQU 0F8h
PC      EQU 0FAh
CWR     EQU 0FBh
FRAME_DELAY EQU 114
        ORG 1800h
START:  DI
        LXI SP,1FC0h
        MVI A,88h
        OUT CWR
        XRA A
        STA LOCK
        STA OFFSET
        STA SHOT
        LXI H,FLASH
        MVI B,9
FCLEAR: MOV M,A
        INX H
        DCR B
        JNZ FCLEAR
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
NEW:    MVI A,80h
        STA DUCKS
        LXI H,172
        SHLD TIMER
        CALL DRAW
MAIN:   CALL FRAME
        LXI D,-18
        CALL CLOCK
        LDA KEY
        CPI 8
        JNC MAIN
        MOV B,A
        ORA A
        JZ TARGET
        INR A
TARGET: ADI 90h
        MOV L,A
        MVI H,1Fh
        MVI M,200
        LDA SHOT
        ORA A
        JNZ MAIN
        MVI A,1
        STA SHOT
        MOV C,A
        INR B
BIT:    MOV A,C
        RLC
        DCR B
        JZ BITDONE
        MOV C,A
        JMP BIT
BITDONE: RRC
        MOV B,A
        LDA DUCKS
        ANA B
        STA HIT
        LDA DUCKS
        XRA B
        STA DUCKS
        CALL DRAW
        JMP MAIN

; DE is a negative count of half milliseconds. Keep the fractional remainder.
; The normal frame accounts for eighteen half-millisecond units.
CLOCK:  LHLD TIMER
        DAD D
        SHLD TIMER
        JNC MOVE
        MOV A,H
        ORA L
        RNZ
MOVE:   LXI D,172        ; 87 ms in half milliseconds, trimmed for redraw/dispatch overhead
        DAD D
        SHLD TIMER
        LDA DUCKS
        RRC
        STA DUCKS
        XRA A
        STA SHOT
        CALL DRAW
        RET
DRAW:   CALL CLEAR
        LDA DUCKS
        MOV C,A
        LXI H,SCREEN
        MVI B,8
DRAWLOOP: MOV A,C
        RRC
        MOV C,A
        MVI A,0
        JNC DRAWNEXT
        MVI A,61h
DRAWNEXT: MOV M,A
        MOV A,B
        CPI 8
        JNZ DRAWCONT
        INX H
DRAWCONT: INX H
        DCR B
        JNZ DRAWLOOP
        RET
CLEAR:  LXI H,SCREEN
        MVI E,9
        XRA A
CLS:    MOV M,A
        INX H
        DCR E
        JNZ CLS
        RET
WAIT:   SHLD TITLETIME
WAITLOOP: CALL FRAME
        LHLD TITLETIME
        LXI D,-9
        DAD D
        SHLD TITLETIME
        JC WAITLOOP
        RET

; All matrix columns, including controls, participate in the release interlock.
FRAME:  LXI H,SCREEN
        LXI D,0
        MVI C,0
        MVI A,0FFh
        STA KEY
        STA CANDIDATE
        XRA A
        STA ANYKEY
FLOOP:  CALL SLOT
        IN PC
        ANI 70h
        CPI 70h
        JZ FNEXT
        MOV B,A
        MVI A,1
        STA ANYKEY
        LDA CANDIDATE
        CPI 0FFh
        JNZ FNEXT
        PUSH H
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
        RET
UNLOCK: STA LOCK
        RET
SLOT:   MVI A,0Fh
        OUT PC
        MOV A,M
        CMA
        ANI 7Fh
        CALL MARK18
        ORA D
        ORA C
        OUT PA
        MOV A,E
        OUT PC
        MVI A,FRAME_DELAY
SW:     DCR A
        JNZ SW
        MVI A,0
        NOP
        NOP
        NOP
        RET

; Per-digit half-millisecond countdowns, sampled once per full scan.
; Preserve the pixel and registers: overlay d only while the counter remains live.
MARK18: PUSH B
        MVI B,18
        JMP MARK
MARK:   PUSH H
        PUSH PSW
        MVI H,1Fh
        MOV A,E
        ORI 90h
        MOV L,A
        MOV A,M
        SUB B
        JNC MCOUNT
        XRA A
MCOUNT: MOV M,A
        ORA A
        JZ MOFF
        POP PSW
        ANI 77h
        JMP MDONE
MOFF:   POP PSW
        NOP
        NOP
        NOP
        NOP
MDONE:  POP H
        POP B
        RET
KEY0:   DB 0,4,88h,91h,8Dh,8Ch,89h,5,1
KEY1:   DB 2,6,8Ah,9Ah,8Fh,8Eh,8Bh,7,3
KEY2:   DB 0FEh,94h,93h,0FEh,97h,92h,0FEh,0FEh,90h
TITLE:  DB 5Eh,3Eh,39h,76h,00h,6Dh,74h,3Fh,3Fh,78h
CODE_END:
DUCKS:  DB 80h
TIMER:  DW 172
TITLETIME: DW 0
OFFSET: DB 0
LOCK:   DB 0
ANYKEY: DB 0
CANDIDATE: DB 0FFh
KEY:    DB 0FFh
SHOT:   DB 0
HIT:    DB 0
; Final emitted bytes; only uninitialized storage follows.
SIGNATURE: DB 'Wolf2026','v013'
IMAGE_END:
SCREEN: DS 9
VARIABLE_END:
        ORG 1F90h
FLASH:  DS 9
DATA_END:
        END
