; SFMT80 for the PMI-80, version 1.0.0: the panel, the monitor, the 4-bit virtual machine and the
; seven built-in programs of the Science Fair Microcomputer Trainer (Radio Shack 28-260) in the two
; 1 KiB EPROMs of the board, 0000h-07FFh. It takes the place of the PMI-80's monitor.
;
; SPDX-License-Identifier: GPL-3.0-or-later
; Copyright (C) 2026 Matěj "Wolf" Holyszewski
; Created with the help of AI (Claude by Anthropic).
;
; Written anew for the 8080 after the behaviour of the original; it holds no part of the
; trainer's own ROM.
;
; Use: program sfmt80-pmi80-0000.bin into the EPROM of the monitor's socket and
; sfmt80-pmi80-0400.bin into the one of the second socket (or the .hex, both in one). After
; power on or RE the right digit shows F. Keys: 0-F as they are, = RESET, S RUN, L INCR,
; M ADRS SET. Display from the left: LEDs 6-0 as the bottom segments of seven digits, one dark
; digit, the hexadecimal digit. Sound on MG OUT of the tape connector K3 (pin 3, ground pin 2).
; Step by step, and what differs from the original: README.md in this folder.
;
; Board and monitor: PMI-80, 8080 at 10 MHz / 9; no monitor, this is one. The timing constants
; below are for that clock: another clock or a Z80 changes every pitch and length. Only
; documented 8080 instructions. Interrupts stay disabled.
;
; Memory: EPROMs 0000h-07FEh (07FFh is empty, FFh). RAM 1C00h-1C7Fh the trainer's memory 00-7F,
; one nibble a byte; 1C80h-1C9Bh variables; 1F00h-1F20h the display, the picture of the keys
; and the warm start mark; stack below 1F00h (SP = 1F00h), up to 20 bytes deep.
;
; Size techniques: one-byte calls (RST 1-7) of the most used routines, waits with their length
; inline after the call, one-byte jump tables, the registers of the virtual machine reached
; through HL, one tone engine for all tones, the state of the games in registers.
;
; The timing constants, for 10 MHz / 9: the times of the original turned into states of this
; clock, with the fixed overhead of the code measured in the emulator.
;
; Versions:
; 1.0.0  first published version
CHUNK    EQU 247
DOVH     EQU 163
LEDBIT   EQU 8
RELPOLLS EQU 2
KSCAN    EQU 2426
VMWAIT   EQU 1989
VMW2     EQU 490
TIMN     EQU 3
TIMSTEP  EQU 34579
TIMFST   EQU 33367
SPRE     EQU 3198
RESTW    EQU 45959
RESTN    EQU 7
SHPOST   EQU 44523
SHPN     EQU 4
KBH      EQU 8
KBL      EQU 15
KBN      EQU 16
SWLADD   EQU 1
SWPRE    EQU 1712
RUNIT    EQU 18337
MELGAP   EQU 2713
GGAP     EQU 36926
GGAPN    EQU 3
GPAUSE   EQU 48225
GPAUSEN  EQU 23
RGAP     EQU 47839
RGAPN    EQU 23
RSTEP    EQU 4518
RGAPP    EQU 198
TBH      EQU 43
TBL      EQU 43
TBN      EQU 15
TICKW    EQU 276
TSEC     EQU 47802
TSECN    EQU 23
MHALF    EQU 17920

MEM     EQU 1C00h       ; SFMT memory 00-7F, one nibble per byte
VARS    EQU 1C80h       ; same page: H stays 1Ch
VPC     EQU VARS+0      ; address / virtual PC (bit 7 is ignored)
PREV    EQU VARS+1      ; digit shown before DISP (high nibble for ADRS SET)
DISP    EQU VARS+2      ; digit the monitor shows
ENTR    EQU VARS+3      ; not 0: a digit was keyed since the address changed
MODE    EQU VARS+4      ; RUN mode: bit 1 address LEDs, bit 2 step
RLAT    EQU VARS+5      ; LED latch, bit n = LED n (bit 3 is also R7)
LASTK   EQU VARS+6      ; key + 1 seen by the previous poll, 0 none
UPCNT   EQU VARS+7      ; polls left before a release counts
GSEED   EQU VARS+9      ; generator of the games
GA      EQU VARS+10     ; game variables
GB      EQU VARS+11
GC      EQU VARS+12
GD      EQU VARS+13
GE      EQU VARS+14
SEQ     EQU VARS+16     ; 12 notes to guess
STACK   EQU 1F00h

REGA    EQU MEM+6Fh
REGY    EQU MEM+6Eh     ; = REGA - 1
FLAGM   EQU MEM+6Dh     ; flag f: 2 or 0 (bit 1, as on the SFMT)
REGB    EQU MEM+6Ch
REGZ    EQU MEM+6Bh

KPAGE   EQU 1F00h
COLBUF  EQU KPAGE+00h   ; 9 bytes: PA value of every position (MG bits clear)
SAVD    EQU KPAGE+09h   ; the digit while it is dark
COL     EQU KPAGE+0Ah   ; position shown now, 8..0
MGMASK  EQU KPAGE+0Bh   ; = COL + 1. 00h at rest, C0h during a speaker phase
BUD     EQU KPAGE+0Ch   ; 2 bytes: overrun of the previous DELAY
KEYIMG  EQU KPAGE+10h   ; 9 bytes: PC as read while the position was shown
SIG     EQU KPAGE+20h   ; warm start signature

; Positions (left to right): 0..6 = LED 6..0 (segment d), 7 dark, 8 the digit.
; MG OUT is the NAND of PA6 and PA7: PA7 = 0 keeps it at rest.

; ---------------------------------------------------------------------------
        ORG 0
        DI
        MVI A,8Ah               ; PA out, PB in, PC0-3 out, PC4-7 in
        OUT 0FBh
        JMP BOOT

; RST 1  DIGIT: hex digit A (10h: dark) on the display. Uses A, HL.
DIGIT:  MVI H,HIGH(FONT)
        MOV L,A
        MOV A,M
        STA COLBUF+8
        RET

; RST 2  DIGOFF: the digit dark
DIGOFF: MVI A,10h
        RST 1
        RET
FZ:     MVI C,0                 ; flag f = 0 (register C carries it)
        RET

        ORG 18h
; RST 3  NIB: A = nibble at VPC, VPC + 1. Uses A, L (H stays 1Ch).
NIB:    LXI H,VPC
        MOV A,M
        INR M
        ANI 7Fh
        MOV L,A
        MOV A,M
        RET
; Only the LED A lit (the end of the tennis's TBALL, the rat).
TBALL1: CALL BITM
        RST 7
        RET

        ORG 28h
; RST 5  WAITI: RST 5 / DB n / DW cycles: n times DELAY(cycles). Keeps BC.
WAITI:  XTHL
        MOV A,M
        INX H
        XTHL
        JMP WAITV

        ORG 30h
; RST 6  MCELL: from a VM handler (A = register A, HL = REGA):
; D = register A, HL = M[Y] = cell 50 + Y, A = its nibble
MCELL:  MOV D,A
        DCX H
        MOV A,M
        ORI 50h
        MOV L,A
        MOV A,M
        RET

; RST 7  SETLEDS: new LED latch A. LED 3 is R7, the speaker, on the SFMT: a
; change of it ticks on MG OUT (the level returns with the next position, a
; held level would darken segment g). Uses A, B, HL.
SETLEDS:LXI H,RLAT
        MOV B,A
        XRA M
        ANI 08h
        JZ SHOWB
        MVI A,0FFh
        OUT 0F8h
SHOWB:  MOV A,B
LEDQ:   STA RLAT                ; LED latch A without the tick
        LXI H,COLBUF+6
SHOWL:  RRC
        MVI M,7Fh
        JNC SHOW1
        MVI M,7Fh-LEDBIT
SHOW1:  DCR L
        JP SHOWL
        RET

; COLSW: keys of the position being left into KEYIMG, then the next
; position. Uses A, H, L. Returns the PA value of the new position.
COLSW:  LXI H,COL               ; 10
        MOV A,M                 ; 7
        ADI LOW(KEYIMG)         ; 7
        MOV L,A                 ; 5
        IN 0FAh                 ; 10
        MOV M,A                 ; 7
        MVI L,LOW(COL)          ; 7
        DCR M                   ; 10
        JP COLSW1               ; 10
        MVI M,8                 ; (10, once in nine)
COLSW1: INR L                   ; 5
        MOV A,M                 ; 7   MGMASK
        ORI 7Fh                 ; 7
        OUT 0F8h                ; 10  dark, speaker level now
        DCR L                   ; 5
        MOV A,M                 ; 7
        CMA                     ; 4
        OUT 0FAh                ; 10  select (PMI: inverted number)
        CMA                     ; 4
        MOV L,A                 ; 5
        MOV A,M                 ; 7   COLBUF
        MVI L,LOW(MGMASK)       ; 7
        ORA M                   ; 7
        OUT 0F8h                ; 10  segments
        RET                     ; 10

; DELAY: wait HL cycles (>= DMIN), counted from the CALL to the end of the
; RET; the overrun is carried to the next call. Keeps BC. The display is
; dark after the return.
DELAY:  XCHG
        LHLD BUD
        DAD D
        LXI D,-(CHUNK+DOVH)
        DAD D
        JNC DEND
DCHUNK: PUSH H
        CALL COLSW
        POP H
        LXI D,-CHUNK
        DAD D
        JC DCHUNK
DEND:   LXI D,CHUNK
        DAD D
        LXI D,-20
DSPIN:  DAD D
        JC DSPIN
        SHLD BUD
        LDA MGMASK
        ORI 7Fh
        OUT 0F8h
        RET

; WAITV: CALL WAITV / DW cycles: A times DELAY(cycles). Keeps BC, A = 0.
WAITV:  POP H
        PUSH H
        PUSH PSW
        MOV E,M
        INX H
        MOV D,M
        XCHG
        CALL DELAY
        POP PSW
        DCR A
        JNZ WAITV
        POP H
        INX H
        INX H
        PCHL

; GETKEY: key image -> SFMT key: A = 0..F, RESET 10h, RUN 11h, INCR 12h,
; ADRS 13h, FFh none. The first key in matrix order wins. HL = the image
; byte of the key. Uses A, DE, HL.
GETKEY: LXI H,KEYIMG
        LXI D,KEYTAB            ; three keys per position: PC6, PC5, PC4
GETK1:  MOV A,M
        ORI 8Fh
        INR A
        JNZ GETK3               ; a row line is low
        INX D
        INX D
        INX D
        INR L
        MOV A,L
        CPI LOW(KEYIMG)+9
        JNZ GETK1
GETK2:  LDAX D                  ; (after the table: FFh)
        RET
GETK3:  MOV A,M
        ADD A
GETK4:  ADD A
        JNC GETK2
        INX D
        JMP GETK4

; The key click with the digit dark meanwhile.
KBEEP:  CALL DARK
        CALL KLICK
LIGHT:  LDA SAVD
        STA COLBUF+8
        RET
DARK:   LXI H,COLBUF+8
        MOV A,M
        MVI M,7Fh
        INX H
        MOV M,A
        RET
GHALT:  CALL GKEY               ; the end of a program: only RESET leaves
        JMP GHALT
P0END:

; ---------------------------------------------------------------------------
        ORG 100h
FONT: DB 64,121,36,48,25,18,2,120,0,24,8,3,70,33,6,14,127
SWTAB: DB 45,43,41,38,36,34,32,29,27,25,23,21,18,16,14,12
SUNDT: DB 4,20,23,4,19,2,5,17,8,5,14,25,6,13,13,6,13,2,7,11,8,7,10,6,8,8,16,9,8,8,10,7,10,11,5,25,12,5,19,13,5,8
OPTAB: DB LOW(OKA),LOW(OAO),LOW(OCH),LOW(OCY),LOW(OAM),LOW(OMA),LOW(OMP),LOW(OMM),LOW(OTIA),LOW(OAIA),LOW(OTIY),LOW(OAIY),LOW(OCIA),LOW(OCIY),LOW(OCAL),LOW(OJUMP)
CALTAB: DB LOW(CRSTO),LOW(CSETR),LOW(CRSTR),LOW(CINPT),LOW(CCMPL),LOW(CCHNG),LOW(CSIFT),LOW(CENDS),LOW(CERRS),LOW(CSHTS),LOW(CLONS),LOW(CSUND),LOW(CTIMR),LOW(CDSPR),LOW(CDEMM),LOW(CDEMP)
RATT: DB 249,225,175,76
TSTEPS: DB 9,17,39,24
KEYTAB: DB 0,2,255,4,6,17,8,10,18,255,255,255,13,15,255,12,14,19,9,11,255,5,7,255,1,3,16,255
GAMTAB: DW GORG,GMEL,GGUE,GRAT,GTEN,GTIM,GMOR
TABEND:

; ---------------------------------------------------------------------------
; Keys. KSTATE: one poll. CY = 0 and A = key for a new press (DE = its image
; byte), CY = 1 otherwise. A key is new after RELPOLLS polls without a key.
POLL:   RST 5
        DB 1
        DW RSTEP
KSTATE: CALL GETKEY
        XCHG
        LXI H,LASTK
        INR A
        JZ KSUP
        MOV B,M
        MOV M,A                 ; key + 1
        INX H
        MVI M,RELPOLLS
        DCR A
        INR B
        DCR B                   ; Z: no key before
        STC
        RNZ
        ORA A
        RET
KSUP:   INX H
        DCR M
        STC
        RP
        INR M
        DCX H
        MVI M,0
        RET
NEWKEY: CALL POLL               ; wait for a new press, display running
        JC NEWKEY
        RET
WAITUP: CALL POLL               ; wait until no key is down
        LDA LASTK
        ORA A
        JNZ WAITUP
        RET

; FASTN: C periods of D (high) and B (low) spin counts; the high edge is a
; plain OUT, the low edge comes with the COLSW that shows the next position.
TBOUNCE:MVI D,TBH               ; the lower tone at the edge of the court
        LXI B,TBL*256+TBN
        JMP FASTN
KLICK:  MVI D,KBH
        LXI B,KBL*256+KBN
FASTN:  CALL COLSW
        MOV E,A
FASTL:  MOV A,E
        ORI 0C0h
        OUT 0F8h
        MOV A,D
FASTH:  DCR A
        JNZ FASTH
        CALL COLSW
        MOV E,A
        MOV A,B
FASTO:  DCR A
        JNZ FASTO
        DCR C
        JNZ FASTL
        RET

; ---------------------------------------------------------------------------
BOOT:   LXI H,KPAGE+1Fh         ; display dark, no keys
BOOT1:  MVI M,7Fh
        DCR L
        JP BOOT1
        LXI H,0
        SHLD COL                ; COL, MGMASK
        ; Power on: fill the SFMT memory with F as a physical trainer shows
        ; it. RE on a running board keeps the program.
        LDA SIG
        CPI 5Ah
        JZ WARM
        MVI A,5Ah
        STA SIG
        LXI H,MEM
BOOT2:  MVI M,0Fh
        INR L
        JP BOOT2
WARM:   LXI H,VARS
WARM1:  MVI M,0
        INR L
        JNZ WARM1

; Monitor
MONRST: XRA A                   ; RESET: address 00, speaker at rest
        STA MGMASK
MONSET: LXI SP,STACK
        ANI 7Fh
        STA VPC
        MOV L,A
        MVI H,HIGH(MEM)
        MOV A,M
        MVI L,LOW(DISP)
        MOV M,A
        INR L
        MVI M,0                 ; ENTR
MONLP:  LDA VPC
        CALL LEDQ
        LDA DISP
        RST 1
        CALL NEWKEY
        PUSH PSW
        CALL KBEEP
        POP PSW
        LXI H,DISP
        CPI 10h
        JC MHEX
        JZ MONRST
        CPI 12h
        JZ MINCR
        JC MRUN
        DCX H                   ; ADRS SET: the two digits shown last
        MOV A,M
        ADD A
        ADD A
        ADD A
        ADD A
        INX H
        ORA M
        JMP MONSET
MHEX:   MOV B,M
        MOV M,A
        DCX H
        MOV M,B
        INX H
        INX H
        MOV M,H                 ; ENTR not 0
        JMP MONLP
MINCR:  MOV B,M                 ; INCR: store the keyed digit, next address
        INX H
        MOV A,M
        ORA A
        LDA VPC
        MOV L,A
        JZ MINC1
        MOV M,B
MINC1:  INR A
        JMP MONSET
MRUN:   MOV A,M                 ; the digit shown is the mode
        CPI 8
        JZ MONRST               ; 8 has no program
        JNC GAMES               ; 9-F
        STA MODE

; ---------------------------------------------------------------------------
; Virtual machine. MODE bit 1: the LEDs show the address, bit 2: step.
; Every instruction is completed to the same length (VMWAIT).
VMRUN:  RST 2                   ; RUN darkens the digit
        CALL WAITUP             ; and starts when it is released
        MVI A,2
        STA FLAGM               ; f = 1 at the start
        XRA A
        CALL LEDQ
VMNEXT: CALL ADRM
        LXI H,VMWAIT
        JZ VMNX1
        LXI H,VMWAIT+VMW2       ; with the address LEDs an instruction is longer
VMNX1:  CALL DELAY
VMEX:   LXI H,VMEND
        PUSH H
        LXI H,FLAGM
        MOV B,M                 ; B = flag before the instruction
        MVI C,2                 ; C = flag after it
        RST 3
        LXI H,OPTAB
        MVI D,HIGH(OKA)
; Jump to entry A of the one-byte table at HL, page D, with HL = REGA and
; A = register A.
TABJ:   ADD L
        MOV L,A
        MOV E,M
        PUSH D
        LXI H,REGA
        MOV A,M
        RET
VMEND:  MOV A,C
        STA FLAGM
        LDA MODE
        ANI 4
        JNZ VMSTEP
        LDA KEYIMG+8            ; RESET (= at position 8, PC4) ends the run
        ANI 10h
        JZ VMRES
        JMP VMNEXT

; Step modes: INCR the next instruction, RUN goes on running, RESET ends.
VMSTEP: CALL ADRM
        CALL NEWKEY
        SUI 10h
        JZ VMRES
        DCR A
        JZ VMSRUN
        DCR A
        JNZ VMSTEP
        CALL VMKEY
        JMP VMEX
VMSRUN: CALL VMKEY
        XRA A                   ; goes on like RUN 1, the LEDs keep the address
        STA MODE                ; without LED 3 (as the SFMT does)
        LDA RLAT
        ANI 77h
        CALL LEDQ
        JMP VMEX
VMRES:  CALL WAITUP
        CALL KBEEP
        JMP MONRST
; A control key in modes with the address LEDs clicks, when released.
VMKEY:  CALL WAITUP
        CALL ADRM
        RZ
        JMP KBEEP
; Address on the LEDs in modes 2 and 6. Z = 1: another mode.
ADRM:   LDA MODE
        ANI 2
        RZ
        LDA VPC
        JMP LEDQ

; ---------------------------------------------------------------------------
; Instructions. Entry: A = register A, HL = REGA, B = flag before, C = 2
; (the flag after: FZ clears it). All entries lie in one page.
OKA:    CALL GETKEY
        CPI 10h
        RNC
        STA REGA
        JMP FZ
OAO:    RST 1
        RET
OCH:    MVI E,LOW(REGB)
        CALL SWP
        DCX H
        MVI E,LOW(REGZ)
        JMP SWP
OCY:    MVI E,LOW(REGY)
; exchange the nibbles at HL and at E in the same page. Keeps HL.
SWP:    MOV B,M
        MOV D,L
        MOV L,E
        MOV A,M
        MOV M,B
        MOV L,D
        MOV M,A
        RET
OAM:    RST 6
        MOV M,D
        RET
OMA:    RST 6
SETA:   STA REGA
        RET
OMP:    RST 6
        ADD D
        LXI H,REGA
        JMP ADDSH
OMM:    RST 6                   ; A = M - A, f = 1 when A > M
        SUB D
        CNC FZ
        ANI 0Fh
        JMP SETA
OTIY:   DCX H
OTIA:   MOV D,L
        RST 3
        MOV L,D
        MOV M,A
        RET
OCIY:   DCX H
OCIA:   MOV D,L
        RST 3
        MOV L,D
        CMP M
        RNZ
        JMP FZ
OAIY:   DCX H
OAIA:   MOV D,L
        RST 3
        MOV L,D
        ADD M
ADDSH:  CPI 10h                 ; sum A into (HL): f = carry
        CC FZ
        ANI 0Fh
        MOV M,A
        RET
OJUMP:  RST 3
        ADD A
        ADD A
        ADD A
        ADD A
        MOV D,A
        RST 3
        ORA D
        MOV D,A
        MOV A,B
        ANI 2
        RZ
        MVI L,LOW(VPC)
        MOV M,D
        RET
OCAL:   RST 3
        MOV D,A
        MOV A,B
        ANI 2
        RZ
        MOV A,D
        LXI H,CALTAB
        MVI D,HIGH(CRSTO)
        JMP TABJ

; ---------------------------------------------------------------------------
; Common parts of the built-in programs 9-F, started by RUN with the digit
; 9-F shown. RESET returns to the monitor in all of them.
GAMES:  ADD A
        ADI LOW(GAMTAB-18)
        MOV L,A
        MVI H,HIGH(GAMTAB)
        MOV A,M
        INX H
        MOV H,M
        MOV L,A
        PCHL

; a new hex key
GHEX:   CALL GKEY
        CPI 10h
        JNC GHEX
        RET
; wait for RUN
GRUN:   CALL GKEY
        CPI 11h
        JNZ GRUN
        RET
; One step of a game's wait: CY = 1 no new key, else A = the key.
GPOLL:  CALL POLL
        RC
        CPI 10h
        JZ MONRST
        ORA A
        RET
; a new key (display running); RESET leaves the game
GKEY:   CALL NEWKEY
        CPI 10h
        RNZ
        JMP MONRST
; RESET while a program plays: the keys were scanned by the last wait
GRES:   RST 5
        DB 1
        DW KSCAN
GRESQ:  LDA KEYIMG+8
        ANI 10h
        RNZ
        JMP MONRST
; A = 0..C-1 (C <= 63), pseudo-random. The position shown now depends on the
; time since the start, so key presses steer the sequence. Uses B, HL.
RNDN:   LXI H,GSEED
        MOV A,M
        ADD A
        ADD A
        ADD M
        INR A
        MOV B,A
        LDA COL
        XRA B
        MOV M,A
        ANI 3Fh
RNDN1:  CMP C
        RC
        SUB C
        JMP RNDN1
; B = B x (M[00] + 1), at most 255. Uses A, E.
UNITS:  LDA MEM
        INR A
        MOV E,A
        XRA A
UNITS1: ADD B
        JNC UNITS2
        SBB A
UNITS2: DCR E
        JNZ UNITS1
        MOV B,A
        RET

; ---------------------------------------------------------------------------
; CAL routines; same entry as the instructions, all entries in one page.
CRSTO:  RST 2
        RET
CSETR:  CALL LEDBITY
        ORA M
        RST 7
        RET
CRSTR:  CALL LEDBITY
        CMA
        ANA M
        RST 7
        RET
CINPT:  MVI M,0                 ; nothing on the K inputs
        RET
CCMPL:  XRI 0Fh
        MOV M,A
        RET
CSIFT:  RAR
        CC FZ
        ANI 07h
        MOV M,A
        RET
CCHNG:  MVI E,69h               ; A, B, Y, Z <-> A', B', Y', Z'
        CALL SWP
        MVI L,LOW(REGB)
        MVI E,67h
        CALL SWP
        MVI L,LOW(REGY)
        MVI E,68h
        CALL SWP
        MVI L,LOW(REGZ)
        MVI E,66h
        JMP SWP
CDSPR:  LDA MEM+5Fh
        ANI 07h
        ADD A
        ADD A
        ADD A
        ADD A
        MVI L,5Eh
        ORA M
        RST 7
        RET
; DEM+ / DEM-: decimal M[Y] + A or M[Y] - A; the neighbour at Y - 1 takes the
; carry (+1) or, after a borrow, becomes 1 (manual p. 125). Y - 1 after.
CDEMP:  RST 6
        ADD D
        DAA
        CPI 10h
        JC YDOWN
        CALL YDOWN
        INR M
        MOV A,M
        ANI 0Fh
        MOV M,A
        RET
CDEMM:  RST 6
        SUB D
        JNC YDOWN
        ADI 10
        CALL YDOWN
        MVI M,1
        RET
; TIMR: (A + 1) / 10 s, the display stays lit. The first tenth is shorter
; by the time the SFMT's instruction takes less than ours.
CTIMR:  MOV B,A
        RST 5
        DB TIMN
        DW TIMFST
CTIM1:  DCR B
        RM
        RST 5
        DB TIMN
        DW TIMSTEP
        JMP CTIM1
; SUND: tone A (1-E) or a rest (0, F), the digit dark meanwhile.
CSUND:  LXI H,LIGHT
        PUSH H
        MVI B,18
; Tones. One engine: HALF switches the speaker and waits m positions and k
; spins; the table SUNDT holds h, m, k per note 1-E (h = periods of SUND / 9).
; SND: note A (0, F: a rest) of B units after the pause of the sound CALs,
; the digit dark. Keeps C.
SND:    PUSH PSW
        CALL DARK
        RST 5
        DB 1
        DW SPRE
        POP PSW
        DCR A
        CPI 14
        INR A
        JC NOTE
        RST 5
        DB RESTN
        DW RESTW
        RET
; A note of the guessing game: 21 units
GNOTE:  MVI B,21
; NOTE: note A = 1..E for B units of h half periods; 0 and F are silent.
; Keeps C.
NOTE:   DCR A
        CPI 14
        RNC
        MOV E,A
        ADD A
        ADD E
        ADI LOW(SUNDT)
        MOV L,A
        MVI H,HIGH(SUNDT)
        MOV A,M                 ; h
        INX H
        PUSH H
        MOV E,B
        MVI D,0
        LXI H,0
NOTE1:  DAD D
        DCR A
        JNZ NOTE1
        XTHL
        MOV D,M                 ; m
        INX H
        MOV E,M                 ; k
        POP H
; TONE: HL half periods of D positions and E spins.
TONE:   PUSH H
        CALL HALF
        POP H
        DCX H
        MOV A,H
        ORA L
        JNZ TONE
        STA MGMASK
        RET
HALF:   LDA MGMASK
        XRI 0C0h
        STA MGMASK
        MOV B,D
HALF1:  CALL COLSW
        DCR B
        JNZ HALF1
        MOV A,E
HALF2:  DCR A
        JNZ HALF2
        RET
; SHTS and LONS: tone E for 65 and 130 periods, then a quiet tail.
CLONS:  MVI B,20
        DB 11h                  ; LXI D: skips the next instruction
CSHTS:  MVI B,10
        MVI A,0Eh
        CALL SND
        RST 5
        DB SHPN
        DW SHPOST
        JMP LIGHT
; ENDS and ERRS: a counter runs CCDh..FFFh, one period each, in groups of
; eight (g = counter / 8 = 199h..1FFh). The half period is 48 - 2k units with
; k = g bits 4-7 (ENDS, a slow rising sweep) or bits 0-3 (ERRS, a saw).
; The digit stays lit.
CENDS:  MVI B,0
        DB 11h
CERRS:  MVI B,1
        RST 5
        DB 1
        DW SWPRE
        CALL COLSW
        MOV E,A
        MOV H,B
        MVI L,99h
SWG:    PUSH H
        MOV A,L
        DCR H
        JZ SWG1
        RRC
        RRC
        RRC
        RRC
SWG1:   ANI 0Fh
        ADI LOW(SWTAB)
        MOV L,A
        MVI H,HIGH(SWTAB)
        MOV D,M                 ; high
        MOV A,D
        ADI SWLADD              ; low = high + one unit
        MOV B,A
        MVI C,8
        CALL FASTL              ; E = the position shown
        POP H
        INR L
        JNZ SWG
        MVI C,2                 ; (the flag of the VM)
        RET

; A = LED mask of Y, HL = RLAT. Y 7-F name outputs the SFMT lacks: the
; instruction ends without effect.
LEDBITY:DCX H
        MOV A,M
        CPI 7
        JNC LBNONE
        CALL BITM
        LXI H,RLAT
        RET
LBNONE: POP H
        RET
; A = 1 << A (A = 0..7). Uses B.
BITM:   MOV B,A
        MVI A,1
        INR B
BITM1:  DCR B
        RZ
        ADD A
        JMP BITM1
; M[Y] = A, then Y = Y - 1 and HL = its cell
YDOWN:  ANI 0Fh
        MOV M,A
        MVI L,LOW(REGY)
        MOV A,M
        DCR A
        ANI 0Fh
        MOV M,A
        ORI 50h
        MOV L,A
        RET

; ---------------------------------------------------------------------------
; 9 Electronic organ: a key 1-E sounds while held.
GORG:   CALL GHEX               ; DE = the image byte of the key
        MOV B,A
        XCHG
        MOV A,M                 ; its row line(s)
        CMA
        ANI 70h
        MOV C,A
        MOV A,B
        PUSH PSW
        DCR A
        CPI 14
        JNC GORG2               ; 0 and F are silent
        PUSH H
        MOV E,A
        ADD A
        ADD E
        ADI LOW(SUNDT+1)
        MOV L,A
        MVI H,HIGH(SUNDT)
        MOV D,M
        INX H
        MOV E,M
        DCR E
        POP H
GORG1:  PUSH H
        CALL HALF
        POP H
        MOV A,M
        ANA C
        JZ GORG1
        XRA A
        STA MGMASK
GORG2:  CALL WAITUP
        POP PSW
        RST 1
        JMP GORG

; ---------------------------------------------------------------------------
; A Automatic tunes: 00 tempo, then note, length pairs from 01. F 0 plays the
; tune again (as F with any length but F on the SFMT), F F ends it; then RUN
; plays it once more. A note lasts (length + 1) x (tempo + 1) units.
GMEL:   RST 2
GMEL0:  MVI C,1                 ; C = address of the next pair
GMEL1:  RST 5
        DB 1
        DW MELGAP               ; the pause between notes
        CALL GRESQ
        MOV L,C
        MVI H,HIGH(MEM)
        MOV A,M                 ; note
        INR L
        MOV B,M                 ; length
        INR C
        INR C
        CPI 0Fh
        JNZ GMEL3
        MOV A,B
        CPI 0Fh
        JNZ GMEL0               ; F 0 (F and anything but F on the SFMT): again
        CALL GRUN               ; F F: the end; RUN plays it again
        JMP GMEL
GMEL3:  MOV D,A
        INR B
        CALL UNITS
        MOV A,D
        ORA A
        JZ GMEL4
        CALL NOTE
        JMP GMEL1
GMEL4:  MOV A,B                 ; a rest: units of silence
        CALL WAITV
        DW RUNIT
        JMP GMEL1

; ---------------------------------------------------------------------------
; B Musical guessing: listen, then key in the notes heard. Every round adds
; a note; ten rounds win. A wrong note shows the rounds completed.
; GA = round (notes - 1), GB = the digit shown, C = index.
GGUE:   MVI A,3                 ; the first note is always Do
        STA SEQ
        LXI H,0B01h             ; round 1, the digit b
        SHLD GA
GGU1:   MVI C,14                ; a new note 1-E
        CALL RNDN
        INR A
        MOV B,A
        LDA GA
        MOV C,A
        CALL SEQP
        MOV M,B
        RST 2
        MVI C,0                 ; play the sequence
GGU2:   CALL SEQP
        CALL GNOTE
        CALL GRESQ
        RST 5
        DB GGAPN
        DW GGAP
        CALL GNEXT
        JNC GGU2
        LDA GB
        RST 1
        MVI C,0                 ; the player repeats it
GGU4:   CALL GHEX
        STA GB
        MOV B,A
        CALL SEQP
        CMP B
        JNZ GGUX                ; wrong
        RST 2
        MOV A,B
        CALL GNOTE
        LDA GB
        RST 1
        CALL GNEXT
        JNC GGU4
        RST 5                   ; round done
        DB GPAUSEN
        DW GPAUSE
        LXI H,GA
        INR M
        MOV A,M
        CPI 11
        JC GGU1
        CALL CENDS              ; ten rounds: A
        JMP GGUS
GGUX:   CALL CERRS
GGUS:   LDA GA
        DCR A
        RST 1
        CALL GRUN
        JMP GGUE
; HL = SEQ + C, A = the note there
SEQP:   MOV A,C
        ADI LOW(SEQ)
        MOV L,A
        MVI H,HIGH(SEQ)
        MOV A,M
        RET
; next index; CY = 1 after the last note of the round
GNEXT:  INR C
        LDA GA
        CMP C
        RET

; ---------------------------------------------------------------------------
; C Rat bashing: after RUN choose the speed 0, 4, 8 or C (other keys are not
; taken). Hit the key of the lit LED before it goes out; ten rats. Any key
; newly pressed ends the rat, only its own gives a point and the tick of
; the tennis edge. The next rat
; comes a second after all keys are let go; the keys are polled through
; that second too, so RESET leaves at any time.
; GA = polls a rat stays, GB = rats left, GC = score, GD = the rat.
GRAT:   RST 2
GRAT0:  CALL GHEX               ; speed
        RRC
        RRC
        CPI 4                   ; (the low bits of the key are at the top now)
        JNC GRAT0
        ADI LOW(RATT)
        MOV L,A
        MVI H,HIGH(RATT)
        MOV A,M
        STA GA
        LXI H,000Ah
        SHLD GB
GRAT1:  CALL WAITUP             ; all keys up, then dark for a second
        MVI C,RGAPP
GRAT2:  CALL GPOLL
        DCR C
        JNZ GRAT2
        MVI C,7
        CALL RNDN
        STA GD
        CALL TBALL1             ; its LED
        LDA GA
        MOV C,A
GRAT5:  DCR C                   ; wait in steps, watching the keys
        JZ GRAT6
        CALL GPOLL
        JC GRAT5
        LXI H,GD                ; the key of the rat?
        CMP M
        JNZ GRAT6               ; another: the rat is gone
        DCX H                   ; GC
        INR M
        CALL TBOUNCE            ; the tick of a hit
GRAT6:  XRA A
        RST 7
        LXI H,GB
        DCR M
        JNZ GRAT1
        CALL CENDS
        LDA GC
        RST 1
        CALL GRUN
        JMP GRAT0

; ---------------------------------------------------------------------------
; D Tennis: the left player has key 0, the right one key 3. The ball flies to
; the receiver's edge. He has one swing a flight: with his key down while the
; ball is on his side of the net it turns back at the edge, the faster the
; nearer the edge it was hit; with the key down earlier the swing is wasted.
; A miss is a point for the other; seven win.
; GA = the ball's distance from the receiver's edge, GB = the receiver (0 the
; right one, at LED 0; 6 the left one), GC = scores + 11h (left in the high
; nibble), GD = step time index, GE = 20h the receiver may swing, 0 he has, 1
; he has hit.
GTEN:   RST 2
        MVI A,11h
        STA GC
        MVI A,6                 ; the left serves: the right receives
GTEN1:  XRI 6
        MOV H,A
        MVI L,6
        SHLD GA                 ; the ball at the server's edge
        CALL TBALL
GTEN2:  CALL GKEY               ; the server's key
        ADD A
        LXI H,GB
        CMP M
        JNZ GTEN2
        MVI A,3                 ; the serve's speed
        STA GD
GTFLY:  MVI A,20h               ; a flight: the receiver has his swing
        STA GE
GTMOV:  LXI H,GA                ; one step
        DCR M
        JM GTEDGE               ; past the edge
        CALL TBALL
        CALL KLICK
        LDA GD
        ADI LOW(TSTEPS)
        MOV L,A
        MVI H,HIGH(TSTEPS)
        MOV C,M
GTW:    CALL GPOLL              ; wait, watching the receiver's key
        LDA GB
        ORA A
        LDA KEYIMG+8            ; key 3: PC5 of position 8
        JZ GTW1
        LDA KEYIMG              ; key 0: PC6 of position 0
        RRC
GTW1:   CMA                     ; bit 5: his key is down
        LXI H,GE
        ANA M                   ; and he has not swung yet
        JZ GTW2
        MVI M,0                 ; the swing
        LDA GA
        CPI 3                   ; on his side?
        JNC GTW2
        INR M                   ; a hit: the speed back by the distance
        STA GD
GTW2:   DCR C
        JNZ GTW
        JMP GTMOV
GTEDGE: LDA GE
        DCR A
        JNZ GTMISS
        MVI M,6                 ; hit: it turns back and the other receives
        INX H
        MOV A,M
        XRI 6
        MOV M,A
        CALL TBOUNCE
        JMP GTFLY
GTMISS: CALL CERRS              ; a point for the other side: 10h the left
        LDA GB                  ; one, 01h the right one
        MOV B,A
        ADI 0FFh
        SBB A
        ANI 0F1h
        ADI 10h
        LXI H,GC
        ADD M
        MOV M,A
        ANI 88h                 ; seven points?
        MOV A,B                 ; the side that missed serves
        JZ GTEN1
        MOV A,M                 ; the score on the courts: left 6-4, right 2-0
        SUI 11h
        RST 7
        CALL GRUN
        JMP GTEN
TBALL:  LHLD GA                 ; only the ball's LED: the distance from the
        MOV A,H                 ; right edge, or 6 less it from the left
        SUB L
        JNC TBALL1
        CMA
        INR A
        JMP TBALL1

; ---------------------------------------------------------------------------
; E Timer: 00 minutes, 01 tens of seconds, 02 seconds. Counts down with a
; click every second; the LEDs show minutes and tens, the digit seconds.
GTIM:   LDA MEM+2
        RST 1
        LXI H,MEM               ; minutes 6-4, tens 3-0 (all four bits)
        MOV A,M
        ADD A
        ADD A
        ADD A
        ADD A
        ANI 70h
        INX H
        ORA M
        RST 7
        LXI H,MEM
        MOV A,M
        INX H
        ORA M
        INX H
        ORA M
        JZ GTIM2
        MVI A,0C0h              ; the tick
        STA MGMASK
        RST 5
        DB 1
        DW TICKW
        STA MGMASK
        RST 5                   ; one second of the original
        DB TSECN
        DW TSEC
        CALL GRESQ
        LXI H,MEM+2             ; minus one second
        DCR M
        JP GTIM
        MVI M,9
        DCX H
        DCR M
        JP GTIM
        MVI M,5
        DCX H
        DCR M
        JMP GTIM
GTIM2:  CALL CENDS
        JMP GHALT

; ---------------------------------------------------------------------------
; F Morse: 00 speed, codes from 01 (manual p. 32): 0 .. 1 .- 4 -. 5 --,
; 2/6 ./- and a character gap, 3/7 ./- and a word gap, 8/9 and C/D the gap
; first, A and B long gaps, E the end, F again.
GMOR:   RST 2
GMOR0:  MVI C,1                 ; C = address of the next code
GMOR1:  CALL GRES
        MOV L,C
        MVI H,HIGH(MEM)
        MOV A,M
        INR C
        CPI 0Eh
        JZ GHALT                ; E: the end
        JNC GMOR0               ; F: again
        LXI H,GMOR1
        PUSH H
        MOV B,A
        ANI 0Ah
        CPI 0Ah
        MOV A,B
        JZ GMORAB
        PUSH PSW
        RRC
        RRC                     ; bit 0: first symbol or gap, bit 1: gap first
        ANI 3
        CPI 2
        JC GMOR5
        CALL GMGAPC             ; 8, 9, C, D: the gap first
        POP PSW
; a dot (bit 0 of A = 0) or a dash, then the gap inside a character
GMSYM:  ANI 1
        INR A
        ADD A
        MOV B,A
        CALL UNITS
        MVI A,0Eh
        CALL NOTE
        MVI A,2
        JMP GMGAPB
GMORAB: ANI 1                   ; A: 10 half units, B: 14
        ADD A
        ADD A
        ADI 10
        JMP GMGAPB
GMOR5:  CALL GMSYM
        POP PSW
        ANI 3
        CPI 2
        JC GMSYM                ; 0, 1, 4, 5: the second symbol
; gap after bit 0 of A: character (0) or word (1)
GMGAPC: ANI 1                   ; 2, 3, 6, 7: then a gap
        ADD A
        ADD A
        ADI 5
GMGAPB: MOV B,A                 ; B half units of silence, x (speed + 1)
        CALL UNITS
        MOV A,B
        CALL WAITV
        DW MHALF
        RET
ENDROM:
ROM_END:                        ; (an EPROM program for tools/make-listings.mjs)
