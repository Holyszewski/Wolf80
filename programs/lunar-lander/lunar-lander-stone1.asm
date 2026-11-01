; Lunar Lander for the Stone 1 (own monitor or STONE-PMI), version 0.1.1: a port of Lunar Lander by Jim Butterfield
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
; No sound, no randomness. Ceiling 8000 ft is preserved. Simulation step ~9.1 ms.
; RAM: program 1800h..1ADAh; variables 1F90h..1FACh; stack 1FB0h..1FC7h.
; Intel 8080 / project TASM-compatible syntax, no monitor calls or Z80 extensions.
; Start: Ex 1800 =. End: RE. Manual-entry bytes are listed at the end.
;
; Versions:
; 0.1.1  append Wolf2026v011 binary signature
; 0.1.0  first version

        ORG 1800h
START:  DI
        LXI SP,1FC8h
        MVI A,8Ah
        OUT 0FBh
        XRA A
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
        LDA TPOS
        INR A
        STA TPOS
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
NEW:    LXI SP,1FC8h
        LXI H,INITIAL
        LXI D,ALT
        MVI B,14
INIT:   MOV A,M
        STAX D
        INX H
        INX D
        DCR B
        JNZ INIT
LOOP:   CALL PHYSICS
        CALL RENDER
        CALL SCAN
        CALL KEY
        CALL SCAN
        CALL KEY
        ; 40-state trim for the 2 MHz Z80
        NOP
        NOP
        NOP
        NOP
        NOP
        NOP
        NOP
        NOP
        NOP
        NOP
        JMP LOOP

; Little-endian packed BCD: altitude/fuel in hundredths, velocity signed mod 10^6.
; DAA follows addition only: decimal subtraction uses a ten's complement.
PHYSICS: LDA DOWN
        ORA A
        RZ
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
        ANI 80h
        MVI A,0
        JZ SIGNED
        MVI A,99h
SIGNED: STA DELTA+2
        LHLD VEL+1
        SHLD DELTA
        LXI H,ALT
        LXI D,DELTA
        MVI B,3
        ORA A
ADD3:   LDAX D
        ADC M
        DAA
        MOV M,A
        INX H
        INX D
        DCR B
        JNZ ADD3
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
        RC
; A borrow empties the tank; exactly zero still burns until the next step.
        XRA A
        STA THR
        STA FUEL
        STA FUEL+1
        STA FUEL+2
        JMP THRSET
COAST:  MVI B,7       ; match the normal fuel arithmetic with the engine off
COAST_LOOP: DCR B
        JNZ COAST_LOOP
        NOP
        NOP
        NOP
        RET
LAND:   XRA A
        STA DOWN
        STA THR
        STA ACC
        STA ASIGN
        STA ALT
        STA ALT+1
        STA ALT+2
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
        JNC ACCPOS
        JMP ACCSAVE
ACCPOS: MVI A,99h
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
        LXI H,BUFFER+2
        LDA MODE
        ORA A
        JZ TANK
        LDA DOWN
        ORA A
        JZ RESULT
        LDA ALT+2
        CALL PAIR
        LDA ALT+1
        CALL PAIR
        JMP RATE
TANK:   MVI M,0Eh
        INX H
        LDA FUEL+2
        CALL DIGIT
        LDA FUEL+1
        CALL PAIR
        MVI B,9         ; compensate the shorter three-digit fuel renderer
FUEL_WAIT: DCR B
        JNZ FUEL_WAIT
        NOP
        NOP
        JMP RATE
RESULT: LXI D,DEAD
        LDA VEL+2
        CPI 99h
        JNZ MESSAGE
        LDA VEL+1
        CPI 95h
        JC MESSAGE
        LXI D,SAFE
MESSAGE: MVI B,4
MCOPY:  LDAX D
        MOV M,A
        INX H
        INX D
        DCR B
        JNZ MCOPY
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

; Refresh all nine columns, even the absent second digit of an eight-digit Savia.
; SCAN preserves BC/DE/HL and returns one new key, zero until full release.
SCAN:   PUSH B
        PUSH D
        PUSH H
        XRA A
        STA RAWKEY
        MVI C,0
        LXI H,BUFFER
COLUMN: MVI A,7Fh
        OUT 0F8h
        MOV A,C
        CMA
        OUT 0FAh
        MOV A,M
        OUT 0F8h
        NOP             ; eight states per column: 9.1 ms step calibration
        NOP
        MVI B,DWELL
DWELL_LOOP: DCR B
        JNZ DWELL_LOOP
        IN 0FAh
        ANI 70h
        CPI 70h
        JZ COLNEXT
        MVI E,0
        ANI 40h
        JZ FOUND
        MVI E,9
        IN 0FAh
        ANI 20h
        JZ FOUND
        MVI E,18
FOUND:  PUSH H
        MOV A,E
        ADD C
        MOV E,A
        MVI D,0
        LXI H,KEYS
        DAD D
        MOV A,M
        STA RAWKEY
        POP H
COLNEXT: INX H
        INR C
        MOV A,C
        CPI 9
        JC COLUMN
        MVI A,7Fh
        OUT 0F8h
        LDA RAWKEY
        MOV B,A
        LDA HELD
        ORA A
        MOV A,B
        STA HELD
        JZ SCANRET
        XRA A
SCANRET: POP H
        POP D
        POP B
        RET
WAIT:   CALL SCAN
        ORA A
        RNZ
        DCX D
        MOV A,D
        ORA E
        JNZ WAIT
        RET

DWELL       EQU 54
FIRST_WAIT  EQU 363
SHORT_WAIT  EQU 60
LAST_WAIT   EQU 242
BLANK_WAIT  EQU 97
SEGS:   DB 40h,79h,24h,30h,19h,12h,02h,78h,00h,10h
TEXT:   DB 47h,41h,2Bh,08h,2Fh,7Fh,47h,08h,2Bh,21h,06h,2Fh
SAFE:   DB 12h,08h,0Eh,06h
DEAD:   DB 21h,06h,08h,21h
KEYS:   DB 80h,84h,88h,91h,8Dh,8Ch,89h,85h,81h
        DB 82h,86h,8Ah,9Ah,8Fh,8Eh,8Bh,87h,83h
        DB 00h,94h,93h,00h,97h,92h,00h,00h,90h
INITIAL: DB 00h,01h,45h,00h,81h,99h,97h,99h,02h,00h,00h,08h,01h,01h
SIGNATURE: DB 'Wolf2026','v011'
CODE_END:
ALT     EQU 1F90h
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
        END

; Manual entry: enter these bytes at the addresses shown, then use the start command above.
; 1800: F3 31 C8 1F 3E 8A D3 FB AF 32 AB 1F 21 A1 1F 06
; 1810: 09 3E 7F 77 23 05 C2 13 18 CD 13 1A 3A AA 1F B7
; 1820: C2 19 18 AF 32 AC 1F 3A AC 1F 5F 16 00 21 92 1A
; 1830: 19 11 A3 1F 06 07 7E 12 23 13 05 C2 36 18 11 3C
; 1840: 00 3A AC 1F B7 C2 4B 18 11 6B 01 FE 05 C2 53 18
; 1850: 11 F2 00 CD 7C 1A B7 C2 79 18 3A AC 1F 3C 32 AC
; 1860: 1F FE 06 DA 27 18 21 A3 1F 06 07 3E 7F 77 23 05
; 1870: C2 6D 18 11 61 00 CD 7C 1A 31 C8 1F 21 C1 1A 11
; 1880: 90 1F 06 0E 7E 12 23 13 05 C2 84 18 CD AB 18 CD
; 1890: 82 19 CD 13 1A CD 46 19 CD 13 1A CD 46 19 00 00
; 18A0: 00 00 00 00 00 00 00 00 C3 8C 18 3A 9D 1F B7 C8
; 18B0: 21 93 1F 3A 96 1F 86 27 77 23 3A 97 1F 8E 27 77
; 18C0: 23 3A 97 1F 8E 27 77 E6 80 3E 00 CA D0 18 3E 99
; 18D0: 32 A0 1F 2A 94 1F 22 9E 1F 21 90 1F 11 9E 1F 06
; 18E0: 03 B7 1A 8E 27 77 23 13 05 C2 E2 18 3A 92 1F FE
; 18F0: 80 D2 2F 19 3A 98 1F B7 CA 25 19 47 3E 99 90 C6
; 1900: 01 27 21 99 1F 86 27 77 23 3E 99 8E 27 77 23 3E
; 1910: 99 8E 27 77 D8 AF 32 98 1F 32 99 1F 32 9A 1F 32
; 1920: 9B 1F C3 5F 19 06 07 05 C2 27 19 00 00 00 C9 AF
; 1930: 32 9D 1F 32 98 1F 32 96 1F 32 97 1F 32 90 1F 32
; 1940: 91 1F 32 92 1F C9 B7 C8 FE 90 CA 79 18 D0 E6 0F
; 1950: FE 0A D2 76 19 47 3A 98 1F B7 C8 78 32 98 1F 3A
; 1960: 98 1F C6 95 27 32 96 1F 3E 00 D2 70 19 C3 72 19
; 1970: 3E 99 32 97 1F C9 FE 0F 3E 01 C2 7E 19 AF 32 9C
; 1980: 1F C9 21 A1 1F 3A 98 1F CD 04 1A 21 A3 1F 3A 9C
; 1990: 1F B7 CA AB 19 3A 9D 1F B7 CA C5 19 3A 92 1F CD
; 19A0: FB 19 3A 91 1F CD FB 19 C3 E5 19 36 0E 23 3A 9B
; 19B0: 1F CD 04 1A 3A 9A 1F CD FB 19 06 09 05 C2 BC 19
; 19C0: 00 00 C3 E5 19 11 A2 1A 3A 95 1F FE 99 C2 DB 19
; 19D0: 3A 94 1F FE 95 DA DB 19 11 9E 1A 06 04 1A 77 23
; 19E0: 13 05 C2 DD 19 3A 94 1F 47 3A 95 1F E6 80 78 CA
; 19F0: F8 19 3E 99 90 C6 01 27 21 A8 1F 47 0F 0F 0F 0F
; 1A00: CD 04 1A 78 E5 E6 0F 5F 16 00 21 88 1A 19 7E E1
; 1A10: 77 23 C9 C5 D5 E5 AF 32 AA 1F 0E 00 21 A1 1F 3E
; 1A20: 7F D3 F8 79 2F D3 FA 7E D3 F8 00 00 06 36 05 C2
; 1A30: 2E 1A DB FA E6 70 FE 70 CA 5C 1A 1E 00 E6 40 CA
; 1A40: 4D 1A 1E 09 DB FA E6 20 CA 4D 1A 1E 12 E5 7B 81
; 1A50: 5F 16 00 21 A6 1A 19 7E 32 AA 1F E1 23 0C 79 FE
; 1A60: 09 DA 1F 1A 3E 7F D3 F8 3A AA 1F 47 3A AB 1F B7
; 1A70: 78 32 AB 1F CA 78 1A AF E1 D1 C1 C9 CD 13 1A B7
; 1A80: C0 1B 7A B3 C2 7C 1A C9 40 79 24 30 19 12 02 78
; 1A90: 00 10 47 41 2B 08 2F 7F 47 08 2B 21 06 2F 12 08
; 1AA0: 0E 06 21 06 08 21 80 84 88 91 8D 8C 89 85 81 82
; 1AB0: 86 8A 9A 8F 8E 8B 87 83 00 94 93 00 97 92 00 00
; 1AC0: 90 00 01 45 00 81 99 97 99 02 00 00 08 01 01 57
; 1AD0: 6F 6C 66 32 30 32 36 76 30 31 31
