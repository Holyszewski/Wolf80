; Lunar Lander for the PMI-80 (factory or PMI-80 C), version 0.1.1: a port of Lunar Lander by Jim Butterfield
; (The First Book of KIM, Hayden 1977/78) from the KIM-1.
;
; SPDX-License-Identifier: GPL-3.0-or-later
; Copyright (C) 2026 Matěj "Wolf" Holyszewski
; Game design: Jim Butterfield, The First Book of KIM, 1977/78. Written anew for the Wolf80 project with the help of AI.
;
; Land at a descent rate of 1..5. Keys 0..9: thrust (0 shuts down permanently).
; F: fuel; A..E: altitude/result; =: new flight; other control keys ignored.
; Position 0: thrust; 2..5: altitude/fuel/result; 6: blank; 7..8: rate modulo 100.
; Deviations: scrolling title, extra thrust digit, gap, release-gated keys, local I/O.
; Fix: ascending rates >=100 use sign extension, not the velocity's high byte.
; Sound on K3: SAFE = HH, crash = L, fuel exhaustion = H (30 ms; HH gap 40 ms).
; Multiplex continues without segment g during each tone. No randomness; ceiling 8000 ft.
; RAM: program 1C00h..1FAAh; variables 1FABh..1FC7h; stack 1FC8h..1FD3h.
; Intel 8080 / project TASM-compatible syntax, no monitor calls or Z80 extensions.
; Start: EX 1C00 =. End: RE. Manual-entry bytes are listed at the end.
;
; Versions:
; 0.1.1  version update; signature omitted because user RAM is full
; 0.1.0  first version

        ORG 1C00h
START:  DI
        LXI SP,1FD4h
        MVI A,8Ah
        OUT 0FBh
        CALL SOUND_RESET
        STA HELD
        LXI H,BUFFER
        MVI B,9
        MVI A,7Fh
CLEAR:  MOV M,A
        INX H
        DCR B
        JNZ CLEAR
; The monitor's final =/dA is not a title-skip or a new-flight key.
RELEASE: CALL SCAN
        LDA RAWKEY
        ORA A
        JNZ RELEASE
        XRA A
        STA TPOS
TITLE:  LDA TPOS
        MOV E,A
        MVI D,0
        LXI H,TEXT
        DAD D
        LXI D,BUFFER+2
        MVI B,7
TCOPY:  MOV A,M
        STAX D
        INX H
        INX D
        DCR B
        JNZ TCOPY
        LXI D,SHORT_WAIT
        LDA TPOS
        ORA A
        JNZ TNEXT
        LXI D,FIRST_WAIT
TNEXT:  CPI 5
        JNZ TWAIT
        LXI D,LAST_WAIT
TWAIT:  CALL WAIT
        ORA A
        JNZ NEW
        LXI H,TPOS
        INR M
        MOV A,M
        CPI 6
        JC TITLE
        LXI H,BUFFER+2
        MVI B,7
        MVI A,7Fh
TBLANK: MOV M,A
        INX H
        DCR B
        JNZ TBLANK
        LXI D,BLANK_WAIT
        CALL WAIT
; A skipped title starts the flight, but its key remains gated until release.
NEW:    LXI SP,1FD4h
        CALL SOUND_RESET
        LXI H,INITIAL
        LXI D,ALT
        MVI B,14
INIT:   MOV A,M
        STAX D
        INX H
        INX D
        DCR B
        JNZ INIT
LOOP:   XRA A
        STA RAWKEY
        CALL PHYSICS
        CALL RENDER
        MVI B,2
        CALL SCANN
        CALL KEY
        CALL SCAN
        CALL KEY
        MOV A,A         ; final five-state trim
        JMP LOOP

; Little-endian packed BCD: altitude/fuel in hundredths, velocity signed mod 10^6.
; DAA follows addition only: decimal subtraction uses a ten's complement.
PHYSICS: LDA DOWN
        ORA A
        JZ GROUNDED
        LXI H,VEL
        LDA ACC
        ADD M
        DAA
        MOV M,A
        INX H
        LDA ASIGN
        ADC M
        DAA
        MOV M,A
        INX H
        LDA ASIGN
        ADC M
        DAA
        MOV M,A
        MVI B,7
        MOV A,A
        NOP
        CALL SLOT
        LDA VEL+2
        ANI 80h
        MVI D,0
        JZ SIGNED
        MVI D,99h
SIGNED: LXI H,ALT
        LDA VEL+1
        ADD M
        DAA
        MOV M,A
        INX H
        LDA VEL+2
        ADC M
        DAA
        MOV M,A
        INX H
        MOV A,D
        ADC M
        DAA
        MOV M,A
        MVI B,6
        CALL SLOT
        LDA ALT+2
        CPI 80h
        JNC LAND
        LDA THR
        ORA A
        JZ COAST
        MOV B,A
        MVI A,99h
        SUB B
        ADI 1
        DAA
        LXI H,FUEL
        ADD M
        DAA
        MOV M,A
        INX H
        MVI A,99h
        ADC M
        DAA
        MOV M,A
        INX H
        MVI A,99h
        ADC M
        DAA
        MOV M,A
        JNC EMPTY
        MVI B,9
        JMP SLOT
EMPTY:
; A borrow empties the tank; exactly zero still burns until the next step.
        XRA A
        MOV M,A
        DCX H
        MOV M,A
        DCX H
        MOV M,A
        STA THR
        CALL BEEP_H
        CALL THRSET
        MVI B,1
        CALL SLOT
        MVI B,12        ; charge the exhaustion event to the following idle budget
        RET
COAST:  MVI A,8       ; split the coast wait around the output to bound tone jitter
COAST_WAIT: DCR A
        JNZ COAST_WAIT
        MVI B,9
        JMP SLOT
GROUNDED: MVI B,3
        JMP IDLE_SLOTS
LAND:   XRA A
        STA DOWN
        STA THR
        STA ACC
        STA ASIGN
        STA ALT
        STA ALT+1
        STA ALT+2
        CALL SAFE_TEST
        JC CRASH_SOUND
        CALL BEEP_HH
        JMP LAND_SLOT
CRASH_SOUND: CALL BEEP_L
LAND_SLOT: MVI B,4
        JMP SLOT

SAFE_TEST: LDA VEL+2
        CPI 99h
        RC
        LDA VEL+1
        CPI 95h
        RET
KEY:    ORA A
        RZ
        CPI 90h
        JZ NEW
        RNC
        ANI 0Fh
        CPI 10
        JNC MODEKEY
        MOV B,A
        LDA THR
        ORA A
        RZ
        MOV A,B
        STA THR
THRSET: LDA THR
        ADI 95h
        DAA
        STA ACC
        MVI A,0
        JC ACCSAVE
        MVI A,99h
ACCSAVE: STA ASIGN
        RET
MODEKEY: CPI 15
        MVI A,1
        JNZ SETMODE
        XRA A
SETMODE: STA MODE
        RET

RENDER: LXI H,BUFFER
        LDA THR
        CALL DIGIT
        MVI A,13
        SUB B
        MOV B,A
        CALL SLOT
        LXI H,BUFFER+2
        LDA MODE
        ORA A
        JZ TANK
        LDA DOWN
        ORA A
        JZ RESULT
        LDA ALT+2
        CALL PAIR
        PUSH H
        MVI B,1
        CALL SLOT
        POP H
        LDA ALT+1
        CALL PAIR
        MVI B,1
        JMP VALUE_SLOT
TANK:   MVI M,0Eh
        INX H
        LDA FUEL+2
        CALL DIGIT
        PUSH H
        MVI B,10
        CALL SLOT
        POP H
        LDA FUEL+1
        CALL PAIR
        MVI B,2
        JMP VALUE_SLOT
RESULT: LXI D,DEAD
        CALL SAFE_TEST
        JC MESSAGE
        LXI D,SAFE
MESSAGE: MVI B,2
        CALL MCOPY
        PUSH H
        PUSH D
        MVI B,1
        CALL SLOT
        POP D
        POP H
        MVI B,2
        CALL MCOPY
        MVI B,6
        NOP
        NOP
VALUE_SLOT: CALL SLOT
        JMP RATE
MCOPY:  LDAX D
        MOV M,A
        INX H
        INX D
        DCR B
        JNZ MCOPY
        RET
RATE:   LDA VEL+1
        MOV B,A
        LDA VEL+2
        ANI 80h
        MOV A,B
        JZ POSRATE
        MVI A,99h
        SUB B
        ADI 1
        DAA
POSRATE: LXI H,BUFFER+7
        CALL PAIR
        MVI B,12
        JMP SLOT
PAIR:   MOV B,A
        RRC
        RRC
        RRC
        RRC
        CALL DIGIT
        MOV A,B
DIGIT:  PUSH H
        ANI 0Fh
        MOV E,A
        MVI D,0
        LXI H,SEGS
        DAD D
        MOV A,M
        POP H
        MOV M,A
        INX H
        RET

; One slot is shared by computation, multiplex and sound; no separate beep loop.
; Seven work slots and eleven idle slots form one 18-slot (~9.1 ms) step.
; C holds the multiplex column across the 8080 calculation routines.
; Idle budgets include the preceding work; the wrap leaves room for frame/physics work.
SCAN:   XRA A
        STA RAWKEY
        MVI B,9
SCANN:  CALL IDLE_SLOTS
        DAD H
        DAD H
        LDA HELD
        ORA A
        LDA RAWKEY
        STA HELD
        RZ
        XRA A
        RET
IDLE_SLOTS: PUSH D
        MOV D,B
SCAN_LOOP: PUSH D
        MVI B,15
        CALL SLOT
        POP D
        DCR D
        JNZ SCAN_LOOP
        DAD H
        DAD H
        POP D
        RET

; Rotate 55h for H (one toggle/slot), 33h for L (one toggle/two slots).
; The zero-shape idle path has exactly the same time as a steady tone.
SLOT:   LXI H,SSHAPE
        MOV A,M
        RRC
        MOV M,A
        ANI 80h
        INX H
        ORA M
        MOV D,A
        INX H
        MOV A,M
        ORA A
        JZ SOUND_IDLE
        DCR M
        JNZ SOUND_READY
        LXI H,SSEQ
        DCR M
        MOV A,M
        ADD A
        ADD M
        ADI LOW(ENVELOPES)
        MOV L,A
        MVI H,HIGH(ENVELOPES)
        MOV A,M
        STA SLEFT
        INX H
        MOV A,M
        STA SSHAPE
        INX H
        MOV A,M
        STA SMASK
        MOV A,B
        SUI 10          ; subtract the envelope transition work from this slot's wait
        MOV B,A
        JMP SOUND_READY
SOUND_IDLE: DAD H
        DAD H
SOUND_READY:
        XRA A
        OUT 0FAh       ; deselect before changing segments, retaining the tone phase
        MVI H,HIGH(BUFFER)
        MOV A,C
        ADI LOW(BUFFER)
        MOV L,A
        MOV A,M
        ORA D
        OUT 0F8h
        MOV A,C
        CMA
        OUT 0FAh
        IN 0FAh
        ANI 70h
        CPI 70h
        JZ COLNEXT
        MVI D,0
        ANI 40h
        JZ FOUND
        MVI D,9
        IN 0FAh
        ANI 20h
        JZ FOUND
        MVI D,18
FOUND:  MOV A,D
        ADD C
        MOV E,A
        MVI D,0
        LXI H,KEYS
        DAD D
        MOV A,M
        STA RAWKEY
COLNEXT: INR C
        MOV A,C
        SUI 9
        JNZ SLOT_DELAY
        MOV C,A
        MVI B,1
SLOT_DELAY: DCR B
        JNZ SLOT_DELAY
        RET

SOUND_RESET: XRA A
        MOV C,A
        STA SSHAPE
        STA SMASK
        STA SLEFT
        RET
BEEP_H: MVI A,1
        JMP HIGH_BEEP
BEEP_HH: MVI A,3
HIGH_BEEP: MVI D,55h
        JMP BEEP
BEEP_L: MVI D,33h
        MVI A,1
BEEP:   STA SSEQ
        MVI A,60
        STA SLEFT
        MOV A,D
        STA SSHAPE
        MVI A,40h
        STA SMASK
        RET
WAIT:   CALL SCAN
        ORA A
        RNZ
        DCX D
        MOV A,D
        ORA E
        JNZ WAIT
        RET

FIRST_WAIT  EQU 346
SHORT_WAIT  EQU 58
LAST_WAIT   EQU 231
BLANK_WAIT  EQU 92
ENVELOPES: DB 0,0,0,60,55h,40h,80,0,0
SEGS:   DB 40h,79h,24h,30h,19h,12h,02h,78h,00h,10h
TEXT:   DB 47h,41h,2Bh,08h,2Fh,7Fh,47h,08h,2Bh,21h,06h,2Fh
SAFE:   DB 12h,08h,0Eh,06h
DEAD:   DB 21h,06h,08h,21h
KEYS:   DB 80h,84h,88h,91h,8Dh,8Ch,89h,85h,81h
        DB 82h,86h,8Ah,9Ah,8Fh,8Eh,8Bh,87h,83h
        DB 00h,94h,93h,00h,97h,92h,00h,00h,90h
INITIAL: DB 00h,01h,45h,00h,81h,99h,97h,99h,02h,00h,00h,08h,01h,01h
; No signature: code, variables and stack fill all 980 user bytes; even 8 do not fit.
SIGNATURE:
CODE_END:
ALT     EQU 1FABh
VEL     EQU ALT+3
ACC     EQU ALT+6
ASIGN   EQU ALT+7
THR     EQU ALT+8
FUEL    EQU ALT+9
MODE    EQU ALT+12
DOWN    EQU ALT+13
DELTA   EQU ALT+14
BUFFER  EQU ALT+17
RAWKEY  EQU ALT+26
HELD    EQU ALT+27
TPOS    EQU ALT+28
; The old altitude scratch bytes are now the sound state; altitude adds directly.
; SSEQ shares the title position, which is no longer used after NEW.
SSHAPE  EQU DELTA
SMASK   EQU DELTA+1
SLEFT   EQU DELTA+2
SSEQ    EQU TPOS
VAR_END EQU ALT+29
STACK_BOTTOM EQU 1FC8h
STACK_TOP EQU 1FD4h
        END

; Manual entry: enter these bytes at the addresses shown, then use the start command above.
; 1C00: F3 31 D4 1F 3E 8A D3 FB CD 21 1F 32 C6 1F 21 BC
; 1C10: 1F 06 09 3E 7F 77 23 05 C2 15 1C CD 78 1E 3A C5
; 1C20: 1F B7 C2 1B 1C AF 32 C7 1F 3A C7 1F 5F 16 00 21
; 1C30: 6E 1F 19 11 BE 1F 06 07 7E 12 23 13 05 C2 38 1C
; 1C40: 11 3A 00 3A C7 1F B7 C2 4D 1C 11 5A 01 FE 05 C2
; 1C50: 55 1C 11 E7 00 CD 4F 1F B7 C2 79 1C 21 C7 1F 34
; 1C60: 7E FE 06 DA 29 1C 21 BE 1F 06 07 3E 7F 77 23 05
; 1C70: C2 6D 1C 11 5C 00 CD 4F 1F 31 D4 1F CD 21 1F 21
; 1C80: 9D 1F 11 AB 1F 06 0E 7E 12 23 13 05 C2 87 1C AF
; 1C90: 32 C5 1F CD AB 1C CD BC 1D 06 02 CD 7E 1E CD 83
; 1CA0: 1D CD 78 1E CD 83 1D 7F C3 8F 1C 3A B8 1F B7 CA
; 1CB0: 48 1D 21 AE 1F 3A B1 1F 86 27 77 23 3A B2 1F 8E
; 1CC0: 27 77 23 3A B2 1F 8E 27 77 06 07 7F 00 CD A1 1E
; 1CD0: 3A B0 1F E6 80 16 00 CA DC 1C 16 99 21 AB 1F 3A
; 1CE0: AF 1F 86 27 77 23 3A B0 1F 8E 27 77 23 7A 8E 27
; 1CF0: 77 06 06 CD A1 1E 3A AD 1F FE 80 D2 4D 1D 3A B3
; 1D00: 1F B7 CA 3D 1D 47 3E 99 90 C6 01 27 21 B4 1F 86
; 1D10: 27 77 23 3E 99 8E 27 77 23 3E 99 8E 27 77 D2 26
; 1D20: 1D 06 09 C3 A1 1E AF 77 2B 77 2B 77 32 B3 1F CD
; 1D30: 2D 1F CD 9C 1D 06 01 CD A1 1E 06 0C C9 3E 08 3D
; 1D40: C2 3F 1D 06 09 C3 A1 1E 06 03 C3 90 1E AF 32 B8
; 1D50: 1F 32 B3 1F 32 B1 1F 32 B2 1F 32 AB 1F 32 AC 1F
; 1D60: 32 AD 1F CD 77 1D DA 6F 1D CD 32 1F C3 72 1D CD
; 1D70: 39 1F 06 04 C3 A1 1E 3A B0 1F FE 99 D8 3A AF 1F
; 1D80: FE 95 C9 B7 C8 FE 90 CA 79 1C D0 E6 0F FE 0A D2
; 1D90: B0 1D 47 3A B3 1F B7 C8 78 32 B3 1F 3A B3 1F C6
; 1DA0: 95 27 32 B1 1F 3E 00 DA AC 1D 3E 99 32 B2 1F C9
; 1DB0: FE 0F 3E 01 C2 B8 1D AF 32 B7 1F C9 21 BC 1F 3A
; 1DC0: B3 1F CD 69 1E 3E 0D 90 47 CD A1 1E 21 BE 1F 3A
; 1DD0: B7 1F B7 CA F5 1D 3A B8 1F B7 CA 10 1E 3A AD 1F
; 1DE0: CD 60 1E E5 06 01 CD A1 1E E1 3A AC 1F CD 60 1E
; 1DF0: 06 01 C3 33 1E 36 0E 23 3A B6 1F CD 69 1E E5 06
; 1E00: 0A CD A1 1E E1 3A B5 1F CD 60 1E 06 02 C3 33 1E
; 1E10: 11 7E 1F CD 77 1D DA 1C 1E 11 7A 1F 06 02 CD 39
; 1E20: 1E E5 D5 06 01 CD A1 1E D1 E1 06 02 CD 39 1E 06
; 1E30: 06 00 00 CD A1 1E C3 42 1E 1A 77 23 13 05 C2 39
; 1E40: 1E C9 3A AF 1F 47 3A B0 1F E6 80 78 CA 55 1E 3E
; 1E50: 99 90 C6 01 27 21 C3 1F CD 60 1E 06 0C C3 A1 1E
; 1E60: 47 0F 0F 0F 0F CD 69 1E 78 E5 E6 0F 5F 16 00 21
; 1E70: 64 1F 19 7E E1 77 23 C9 AF 32 C5 1F 06 09 CD 90
; 1E80: 1E 29 29 3A C6 1F B7 3A C5 1F 32 C6 1F C8 AF C9
; 1E90: D5 50 D5 06 0F CD A1 1E D1 15 C2 92 1E 29 29 D1
; 1EA0: C9 21 B9 1F 7E 0F 77 E6 80 23 B6 57 23 7E B7 CA
; 1EB0: D7 1E 35 C2 D9 1E 21 C7 1F 35 7E 87 86 C6 5B 6F
; 1EC0: 26 1F 7E 32 BB 1F 23 7E 32 B9 1F 23 7E 32 BA 1F
; 1ED0: 78 D6 0A 47 C3 D9 1E 29 29 AF D3 FA 26 1F 79 C6
; 1EE0: BC 6F 7E B2 D3 F8 79 2F D3 FA DB FA E6 70 FE 70
; 1EF0: CA 12 1F 16 00 E6 40 CA 05 1F 16 09 DB FA E6 20
; 1F00: CA 05 1F 16 12 7A 81 5F 16 00 21 82 1F 19 7E 32
; 1F10: C5 1F 0C 79 D6 09 C2 1C 1F 4F 06 01 05 C2 1C 1F
; 1F20: C9 AF 4F 32 B9 1F 32 BA 1F 32 BB 1F C9 3E 01 C3
; 1F30: 34 1F 3E 03 16 55 C3 3D 1F 16 33 3E 01 32 C7 1F
; 1F40: 3E 3C 32 BB 1F 7A 32 B9 1F 3E 40 32 BA 1F C9 CD
; 1F50: 78 1E B7 C0 1B 7A B3 C2 4F 1F C9 00 00 00 3C 55
; 1F60: 40 50 00 00 40 79 24 30 19 12 02 78 00 10 47 41
; 1F70: 2B 08 2F 7F 47 08 2B 21 06 2F 12 08 0E 06 21 06
; 1F80: 08 21 80 84 88 91 8D 8C 89 85 81 82 86 8A 9A 8F
; 1F90: 8E 8B 87 83 00 94 93 00 97 92 00 00 90 00 01 45
; 1FA0: 00 81 99 97 99 02 00 00 08 01 01

