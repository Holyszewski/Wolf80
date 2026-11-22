; Clock for a 1 KiB EPROM in the second socket of the PMI-80 (0400h-07FFh), version 0.2.0:
; hours, minutes and seconds as HH-MM-SS, with a correction for the board's own crystal, an
; alarm and a stopwatch. It asks for the time and for the correction on its own display.
;
; SPDX-License-Identifier: GPL-3.0-or-later
; Copyright (C) 2026 Matěj "Wolf" Holyszewski
; Written with the help of AI.
;
; Use: program clock-eprom-pmi80.bin (or .hex) into the EPROM, put it into the second socket
; and start it with EX 0400 =. Then:
;   CAS        ("čas", time) for a second, then the time to set, HH-MM-SS. Type the digits
;              from the left; the place being typed alternates with an underscore and goes
;              round after the last one. = confirms. A time that cannot be (25-00-00) shows
;              Err and is asked for again.
;   XX-XX-CAL  the correction: the one used last, or the one in the EPROM. = confirms it, or
;              type four digits first.
;   StArt =    the clock stands and starts on the press of =.
; While the clock runs:
;   B          the alarm ("budík"): HH-MM-bUd. Type its time as above; = sets it and turns
;              the alarm on, B turns it off. While it is on, the top right segment of the last
;              digit is lit. At its time the clock beeps on MG OUT (K3) for a minute, or
;              until a key is pressed. Its time is not checked: one that cannot be never comes.
;   S          the stopwatch ("stopky"), MM-SS and hundredths: = starts and stops it, 0 clears
;              it, S returns to the clock. It goes on while the clock is shown.
; RE stops the program. The time, the correction and the alarm stay in RAM while the board is
; on: the next EX 0400 = offers the time at which the clock was stopped. After power on it
; offers 00-00-00 and the correction of the EPROM.
;
; The correction is 50.00 plus the seconds a day an uncorrected clock gains on the board
; (minus those it loses), 00.00 to 99.99 in steps of 0.01 s a day; 50.00 corrects nothing.
; The one in the EPROM is the two bytes at 0403h-0404h (bytes 3 and 4 of the .bin), in BCD as
; it reads: 50 00 here. How to work it out: README.md in this folder.
;
; Board and monitor: PMI-80, 8080 at 10 MHz / 9. Any monitor: nothing of it is called, it only
; starts the program. Only documented 8080 instructions. Another clock or a Z80 changes the
; length of the second.
; RAM: 1F00h-1F2Bh (the display, variables, the time at 1F22h-1F24h); stack below 1FC0h.
;
; Timing at 10 MHz / 9: a second is 1 110 468 states, plus 1286 states (1/100 s a day) in
; those seconds in which the correction, added to a running fraction (both BCD), passes 99.99:
; with 50.00 every other second, 1 111 111 states on average. A second is 100 rounds of the
; main loop (LOOP), each exactly as long as the others whatever the keys, the time and what is
; shown: the scan of the display and of the keys, the stopwatch and the picture have no
; conditional jumps, and every path through the handling of a key (HANDLE) ends in a wait
; that makes it as long as the longest.

PA      EQU 0F8h
PC      EQU 0FAh
CWR     EQU 0FBh

SCREEN  EQU 1F00h       ; 9 bytes: the PA value of each digit (7Fh dark)
; cleared at the start:
LOCK    EQU 1F09h       ; not 0: a key is down, or was a moment ago
CURSOR  EQU 1F0Ah       ; the digit being typed, from 0
EDITM   EQU 1F0Bh       ; FFh: digits are being typed, the underscore shows where (CURSOR + 1)
BLINK   EQU 1F0Ch       ; counts rounds: the underscore and the beeps (EDITM + 1)
STOG    EQU 1F11h       ; 80h while it beeps: PA7 turns over with every digit
SMASK   EQU 1F12h       ; 40h while it beeps: PA6 high (segment g dark), the other input of the gate
RINGS   EQU 1F13h       ; seconds the alarm still rings
VIEW    EQU 1F14h       ; what is shown, an offset into VIEWS (RINGS + 1)
TICKS   EQU 1F15h       ; rounds left in the second
SWMIN   EQU 1F16h       ; the stopwatch: minutes, seconds, hundredths in BCD
SWHH    EQU 1F18h
SWRUN   EQU 1F19h       ; 1: the stopwatch runs (SWHH + 1)
FRAC    EQU 1F1Ah       ; 2 bytes: the running fraction, BCD
; kept from one start to the next:
MARK    EQU 1F20h       ; 2 bytes, 5Ah A5h: what follows was left by this program
TIME    EQU 1F22h       ; hours, minutes, seconds in BCD
CAL     EQU 1F25h       ; the correction in use, 2 bytes BCD, and CDh, shown as "CA"
ALARM   EQU 1F28h       ; the alarm: hours, minutes, and ABh, shown as "bU"
ALON    EQU 1F2Bh       ; 1: the alarm is on
STACK   EQU 1FC0h

KEY_EQ  EQU 10h
KEY_S   EQU 12h
KEY_B   EQU 0Bh
V_CLOCK EQU 0           ; the views
V_ALARM EQU 4
V_SW    EQU 8
V_CAL   EQU 12
DELAY   EQU 54          ; how long a digit is lit in a round
FRAMES  EQU 100         ; rounds in a second
FINE    EQU 137         ; the rest of the second, rounds of 15 states

        ORG 0400h
START:  JMP INIT
; The correction of the EPROM, in BCD as it reads (0403h-0404h).
CORR:   DB 50h,00h
; The digits 0-9 as PA values (a segment is lit by 0); A-D are the letters b, U, C, A.
DIGITS: DB 40h,79h,24h,30h,19h,12h,02h,78h,00h,10h
        DB 03h,41h,46h,08h,7Fh,7Fh
LIMITS: DB 24h,60h,60h
; The keys by row (PC4, PC5, PC6) and column: 0-F the digits, 10h =, 11h EX, 12h S, 13h L,
; 14h BR, 15h M, 16h R, 1Fh no key there.
KEYTAB: DB 1Fh,12h,13h,1Fh,14h,15h,1Fh,1Fh,10h
        DB 02h,06h,0Ah,16h,0Fh,0Eh,0Bh,07h,03h
        DB 00h,04h,08h,11h,0Dh,0Ch,09h,05h,01h
; The views: the three BCD bytes shown, the last digit (with bit 7: the sign of the alarm
; is shown in it), the number of digits to type.
VIEWS:  DW TIME                 ; the clock
        DB 0FFh,6
        DW ALARM                ; the alarm, HH-MM-bUd
        DB 21h,4                ; "d"
        DW SWMIN                ; the stopwatch
        DB 0FFh,6
        DW CAL                  ; the correction, XX-XX-CAL
        DB 47h,4                ; "L"
TCAS:   DB 46h,08h,12h,7Fh,7Fh,7Fh,7Fh,7Fh,7Fh  ; CAS
TERR:   DB 06h,2Fh,2Fh,7Fh,7Fh,7Fh,7Fh,7Fh,7Fh  ; Err
TSTART: DB 12h,07h,08h,2Fh,07h,7Fh,37h,7Fh,7Fh  ; StArt =

INIT:   DI
        LXI SP,STACK
        MVI A,8Ah               ; PA out, PB in, PC0-3 out, PC4-7 in
        OUT CWR
        LXI H,LOCK              ; the working variables: 0
        MVI B,MARK-LOCK
        XRA A
        CALL FILL
        MVI A,5                 ; the key that started the program is still down
        STA LOCK
        LHLD MARK               ; was the rest left here by this program?
        LXI D,-0A55Ah
        DAD D
        MOV A,H
        ORA L
        JZ INIT1
        LXI H,TIME              ; no: 00-00-00, the correction of the EPROM, no alarm
        MVI B,ALON+1-TIME
        XRA A
        CALL FILL
        LHLD CORR
        SHLD CAL
        LXI H,0A55Ah
        SHLD MARK
INIT1:  MVI A,0CDh              ; the letters behind the correction and the alarm
        STA CAL+2
        MVI A,0ABh
        STA ALARM+2
        CALL VALID              ; and can the time be?
        JC INIT2
        LXI H,0
        SHLD TIME
        SHLD TIME+1
INIT2:  LXI H,TCAS
; The time
ASK:    CALL LABEL
        XRA A                   ; V_CLOCK
        CALL EDIT
        CALL VALID
        LXI H,TERR
        JNC ASK
; The correction
        MVI A,V_CAL
        CALL EDIT
; The prompt: = starts the clock
        LXI H,TSTART
        CALL SHOW
WAIT:   CALL GETKEY
        CPI KEY_EQ
        JNZ WAIT
        MVI A,FRAMES
        STA TICKS

; ---------------------------------------------------------------------------
; The clock: a hundred rounds a second, each the same length.
LOOP:   CALL SCAN               ; the display and the keys
        CALL KEY
        CALL HANDLE             ; what the key does
        CALL SWTICK             ; the stopwatch
        CALL RENDER             ; the picture for the next round
        LXI H,TICKS
        DCR M
        JNZ LOOP
; A second has passed: the correction into the fraction, the rest of the second, one second
; more, the alarm. The same length every time.
SECOND: MVI M,FRAMES
        LXI B,CAL+1             ; the correction into the fraction, low bytes
        LXI H,FRAC+1
        LDAX B
        ADD M
        DAA
        MOV M,A
        DCX B                   ; the high bytes
        DCX H
        LDAX B
        ADC M
        DAA
        MOV M,A                 ; CY = past 99.99
        MVI A,FINE
        JNC SEC1
        MVI A,FINE+85           ; 7 + 4 + 85 rounds of 15 = 1286 states more
        NOP
SEC1:   DCR A
        JNZ SEC1
        NOP                     ; 13 states: trimming the second to the state
        NOP                     ; 13 states: trimming the second to the state
        MOV A,A                 ; 13 states: trimming the second to the state
        LXI H,TIME+2            ; seconds, minutes, hours: add 1 or 0 in BCD
        LXI B,LIMITS+2          ; and compare with the limit; at the limit the
        MVI E,0                 ; field becomes 00 and the next one gets 1
SEC2:   MOV A,E                 ; E = 00h: add 1; E = FFh: add nothing
        INR A
        ADD M
        DAA
        MOV M,A
        LDAX B
        MOV D,A
        MOV A,M
        CMP D                   ; CY = below the limit
        SBB A                   ; FFh below the limit, 00h at it
        MOV E,A
        ANA M
        MOV M,A                 ; 00 at the limit
        DCX B
        DCX H
        MOV A,L
        CPI LOW(TIME)-1
        JNZ SEC2                ; until the hours are done
        LXI H,RINGS             ; a second less of ringing, if it rings
        MOV A,M
        ADI 0FFh
        SBB A                   ; FFh: it rings
        ADD M
        MOV M,A
        PUSH H
        LHLD TIME               ; the alarm: its hour and minute, the second 00
        XCHG
        LHLD ALARM
        MOV A,L
        XRA E
        MOV B,A
        MOV A,H
        XRA D
        ORA B
        MOV B,A
        LDA TIME+2
        ORA B                   ; 0: now
        ADI 0FFh
        SBB A
        CMA
        MOV B,A                 ; FFh: now
        LDA ALON
        CMA
        INR A                   ; FFh: the alarm is on
        ANA B
        MOV B,A
        POP H
        ANI 60                  ; then a minute of ringing
        MOV C,A
        MOV A,B
        CMA
        ANA M
        ORA C
        MOV M,A
        JMP LOOP

; One scan: every digit lit for DELAY, the keys of its column read. Returns B = the rows
; (bits 4-6) and the column of the key that is down, 0 if none. PA7 turns over with every
; digit while STOG is 80h: the beep. No conditional jumps but the loops.
SCAN:   LXI H,SCREEN            ; L is the digit too
        LDA SMASK
        MOV C,A
        MVI B,0
        MVI D,DELAY
SCAN1:  XRA A
        OUT PC                  ; no digit selected while the segments change
        LDA STOG
        XRA C
        MOV C,A
        ORA M
        OUT PA
        MOV A,L
        CMA
        OUT PC                  ; the PMI-80 selects by the inverted number
        MOV A,D
SCAN2:  DCR A
        JNZ SCAN2
        IN PC
        CMA
        ANI 70h
        MOV E,A                 ; the rows of this column
        ADI 0FFh
        SBB A                   ; FFh: a key
        ANA L
        ORA E
        ORA B
        MOV B,A
        INR L
        MOV A,L
        CPI 9
        JNZ SCAN1
        XRA A
        OUT PC                  ; no digit selected: the last one is not lit longer
        RET
; From B of SCAN: A = the key pressed since the last scan with no key down (see KEYTAB), FFh
; otherwise. A key counts as let go only after five scans without it: its contacts may
; bounce. No conditional jumps.
KEY:    MOV A,B
        ADI 0FFh
        SBB A
        MOV D,A                 ; FFh: a key is down
        LXI H,LOCK
        MOV A,M
        ADI 0FFh
        SBB A
        MOV E,A                 ; FFh: one was down a moment ago
        MOV A,M                 ; LOCK: 5 with a key down, otherwise one less down to 0
        ADD E
        XRI 5
        MOV C,A
        MOV A,D
        CMA
        ANA C
        XRI 5
        MOV M,A
        MOV A,E
        CMA
        ANA D
        MOV E,A                 ; FFh: a new press
        MOV A,B                 ; the row 0-2, times nine, plus the column
        RLC
        RLC
        RLC
        ANI 3
        MOV C,A
        ADD A
        ADD A
        ADD A
        ADD C
        MOV C,A
        MOV A,B
        ANI 0Fh
        ADD C
        ADI LOW(KEYTAB)
        MOV L,A
        MVI H,HIGH(KEYTAB)
        MOV C,M
        MOV A,E
        CMA
        ORA C
        RET
; What the key A does. Every path ends at an exit below.
HANDLE: CPI 0FFh
        JZ XNONE
        MOV B,A
        LXI H,RINGS
        MOV A,M
        ORA A
        JNZ XQUIET              ; it rings: any key ends that
        INX H                   ; VIEW
        MOV A,M
        ORA A
        JZ HCLOCK
        CPI V_ALARM
        JZ HALARM
        MOV A,B                 ; the stopwatch
        CPI KEY_EQ
        JZ XSWGO
        ORA A
        JZ XSWZERO
        CPI KEY_S
        JZ XBACK
        JMP XSWNO
HCLOCK: MOV A,B                 ; the clock
        CPI KEY_B
        JZ XTOAL
        CPI KEY_S
        JZ XTOSW
        JMP XCLNO
HALARM: MOV A,B                 ; the alarm
        CPI 10
        JC XDIGIT
        CPI KEY_EQ
        JZ XALSET
        CPI KEY_B
        JZ XALOFF
        JMP XALNO
; exits begin: the waits are set by measurement, so that every path through HANDLE takes
; the same number of states
XNONE:  MOV A,M                 ; 7 states: trimming the path
        MVI A,36
        JMP HWAIT
XQUIET: MVI M,0
        MOV A,M                 ; 21 states: trimming the path
        MOV A,M                 ; 21 states: trimming the path
        MOV A,M                 ; 21 states: trimming the path
        MVI A,32
        JMP HWAIT
XSWGO:  LXI H,SWRUN
        MOV A,M
        XRI 1
        MOV M,A
        MOV A,A                 ; 10 states: trimming the path
        MOV A,A                 ; 10 states: trimming the path
        MVI A,27
        JMP HWAIT
XSWZERO:LXI H,0
        SHLD SWMIN
        SHLD SWHH
        MVI A,26
        JMP HWAIT
XBACK:  MVI M,V_CLOCK
        MVI A,27
        JMP HWAIT
XSWNO:  MVI A,27
        JMP HWAIT
XTOAL:  MVI M,V_ALARM
        LXI H,0FF00h            ; from the first digit
        SHLD CURSOR
        MOV A,M                 ; 7 states: trimming the path
        MVI A,28
        JMP HWAIT
XTOSW:  MVI M,V_SW
        NOP                     ; 16 states: trimming the path
        MOV A,A                 ; 16 states: trimming the path
        MOV A,M                 ; 16 states: trimming the path
        MVI A,28
        JMP HWAIT
XCLNO:  NOP                     ; 16 states: trimming the path
        MOV A,A                 ; 16 states: trimming the path
        MOV A,M                 ; 16 states: trimming the path
        MVI A,28
        JMP HWAIT
XDIGIT: CALL PUTDIG
        NOP                     ; 13 states: trimming the path
        NOP                     ; 13 states: trimming the path
        MOV A,A                 ; 13 states: trimming the path
        MVI A,8
        JMP HWAIT
XALSET: MVI M,V_CLOCK           ; = turns the alarm on
        MVI A,1
        STA ALON
        XRA A
        STA EDITM
        MOV A,M                 ; 7 states: trimming the path
        MVI A,25
        JMP HWAIT
XALOFF: MVI M,V_CLOCK           ; B turns it off
        XRA A
        STA ALON
        STA EDITM
        MOV A,A                 ; 12 states: trimming the path
        MOV A,M                 ; 12 states: trimming the path
        MVI A,24
        JMP HWAIT
XALNO:  MOV A,M                 ; 7 states: trimming the path
        MVI A,27
; exits end
HWAIT:  DCR A
        JNZ HWAIT
        RET
; The digit B to the place of the cursor in the bytes of what is shown; the cursor moves on,
; and round after the last digit. No conditional jumps.
PUTDIG: LDA VIEW
        ADI LOW(VIEWS)
        MOV L,A
        MVI H,HIGH(VIEWS)
        MOV E,M
        INX H
        MOV D,M                 ; DE = the bytes
        INX H
        INX H
        MOV C,M                 ; C = how many digits
        LXI H,CURSOR
        MOV A,M
        PUSH PSW
        INR A
        MOV M,A
        SUB C
        ADI 0FFh
        SBB A                   ; 00h after the last digit
        ANA M
        MOV M,A
        POP PSW                 ; the place typed
        MOV C,A
        ORA A
        RAR
        ADD E
        MOV E,A                 ; DE = its byte
        MOV A,C
        RRC
        SBB A
        MOV C,A                 ; FFh: its low digit
        MOV A,B
        RLC
        RLC
        RLC
        RLC
        MOV H,A
        XRA B
        ANA C
        XRA H
        MOV H,A                 ; the digit in its half of the byte
        MOV A,C
        XRI 0Fh
        MOV L,A                 ; what stays of the byte
        LDAX D
        ANA L
        ORA H
        STAX D
        XRA A
        STA BLINK               ; the new place shows its digit first
        RET
; The stopwatch a hundredth further, if it runs. No conditional jumps.
SWTICK: LXI H,SWHH
        LDA SWRUN
        ADD M
        DAA
        MOV M,A                 ; CY: a second
        DCX H
        MVI A,0
        ADC M
        DAA
        MOV M,A
        CPI 60h
        SBB A                   ; FFh below a minute, 00h at it
        MOV E,A
        ANA M
        MOV M,A
        DCX H
        MOV A,E
        INR A
        ADD M
        DAA
        MOV M,A                 ; minutes go round at 100
        RET
; The picture: the three BCD bytes of what is shown, the last digit with the sign of the
; alarm, the underscore where digits are typed; and whether the next round beeps. No
; conditional jumps.
RENDER: LXI H,BLINK
        INR M
        MOV A,M
        ADD A
        ADD A
        ANI 80h
        MOV B,A                 ; 80h in every other third of a second
        LDA RINGS
        ADI 0FFh
        SBB A
        ANA B
        STA STOG
        RRC
        STA SMASK
        LDA VIEW
        ADI LOW(VIEWS)
        MOV L,A
        MVI H,HIGH(VIEWS)
        MOV E,M
        INX H
        MOV D,M
        INX H
        MOV A,M                 ; the last digit; where its bit 7 allows and the alarm is
        RLC                     ; on, with segment b lit
        RLC
        MOV C,A
        LDA ALON
        ADD A
        ANA C
        CMA
        ANA M
        ANI 7Fh
        STA SCREEN+8
        XCHG
        LXI D,SCREEN
        MVI B,3
        CALL DRAWB
        LHLD EDITM              ; digits being typed: an underscore in turns with the digit
        MOV A,H                 ; (H = BLINK)
        ADD A
        ADD A
        ADD A
        SBB A
        ANA L
        MOV B,A                 ; FFh: the turn of the underscore
        LDA CURSOR              ; the place of digit n: n + n / 2
        MOV C,A
        ORA A
        RAR
        ADD C
        MOV L,A
        MVI H,HIGH(SCREEN)
        MOV A,B
        CMA
        ANA M
        MOV C,A
        MOV A,B
        ANI 77h                 ; segment d
        ORA C
        MOV M,A
        RET
; B BCD bytes from HL as pairs of digits from DE on, a dash between the pairs.
DRAWB:  MOV A,M
        CALL BCD
        INX H
        DCR B
        RZ
        MVI A,3Fh               ; a dash
        STAX D
        INX D
        JMP DRAWB
; The two digits of A as segments to (DE), DE + 2. Keeps HL and B.
BCD:    PUSH PSW
        RRC
        RRC
        RRC
        RRC
        CALL BCD1
        POP PSW
BCD1:   ANI 0Fh
        PUSH H
        ADI LOW(DIGITS)
        MOV L,A
        MVI H,HIGH(DIGITS)
        MOV A,M
        POP H
        STAX D
        INX D
        RET

; ---------------------------------------------------------------------------
; Asking, before the clock runs
; B bytes from HL: A
FILL:   MOV M,A
        INX H
        DCR B
        JNZ FILL
        RET
; One scan; A = the key newly pressed, FFh none.
GETKEY: CALL SCAN
        JMP KEY
; The nine characters at HL on the screen.
SHOW:   LXI D,SCREEN
        MVI B,9
SHOW1:  MOV A,M
        STAX D
        INX H
        INX D
        DCR B
        JNZ SHOW1
        RET
; The same for a second, or until a key is pressed.
LABEL:  CALL SHOW
        MVI B,100
LABEL1: PUSH B
        CALL GETKEY
        POP B
        INR A
        RNZ
        DCR B
        JNZ LABEL1
        RET
; CY = 1: the three bytes at TIME are a time, 00-00-00 to 23-59-59.
VALID:  LXI H,TIME
        LXI D,LIMITS
        MVI B,3
VALID1: MOV A,M
        ANI 0Fh
        CPI 10
        JNC VALID2              ; a low digit above 9
        LDAX D
        MOV C,A
        MOV A,M
        CMP C
        JNC VALID2              ; the limit or more (that covers the high digit)
        INX H
        INX D
        DCR B
        JNZ VALID1
        STC
        RET
VALID2: ORA A
        RET
; Lets the digits of the view A be typed, from the first, until = is pressed. Leaves the
; clock shown.
EDIT:   STA VIEW
        LXI H,0FF00h
        SHLD CURSOR
EDIT1:  CALL RENDER
        CALL GETKEY
        CPI KEY_EQ
        JZ EDIT2
        CPI 10
        JNC EDIT1               ; no key, or not a digit
        MOV B,A
        CALL PUTDIG
        JMP EDIT1
EDIT2:  XRA A
        STA EDITM
        STA VIEW
        RET
ROM_END:
; The signature, the last bytes of the EPROM.
        ORG 07F4h
        DB 'Wolf2026','v020'
        END
