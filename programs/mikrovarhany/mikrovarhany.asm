; SPDX-License-Identifier: GPL-3.0-or-later
; Copyright (C) 2026 Matěj "Wolf" Holyszewski
;
; MIKROVARHANY - a one-voice micro organ for the PMI-80 with the factory monitor.
; Target: PMI-80, MHB8080A at 10 MHz / 9 = 1.111 MHz, factory monitor (uses DISP 0140h).
; Syntax: Intel 8080, documented instructions only.
; RAM: program, variable and tables 1C00h-1D10h (273 bytes); stack from 1FD9h down (the monitor's).
; Start: EX 1C00 =. End: RE.
;
; Keys 0-F play while held. The = key switches between two scales:
;   " uArHAnY "  C major from c1 (key 0) to d3 (key F), the default,
;   " PuLtony "  semitones from c1 (key 0) to dis2 (key F).
; The display shows the scale's name when nothing plays and stays dark during a tone.
;
; Sound comes from the tape output: MG OUT on K3 is NAND(PA6, PA7) (gate IO11, pin 8), so an
; amplifier or a tape recorder with monitoring must be connected to K3, as for the tape
; programs in J. Vlach's book. Writing FFh and 7Fh to port A toggles MG OUT while PA0-PA6 stay
; 1, so no segment lights up. The key is checked once per period by reading only its own
; column, which stays selected during the tone.
;
; One period takes 68 + 15 * (n1 + n2) states: 22 + 15 * n1 with MG OUT low and
; 46 + 15 * n2 with MG OUT high (counted from OUT to OUT). Tuning errors are at most 13 cents
; in the major scale and 7 cents in the semitone scale.

DISP    EQU 0140h       ; monitor: one display and keyboard scan, CY = key, A = code rotated left
VPTR    EQU 1FFCh       ; monitor: pointer to the nine character codes shown by DISP
PA      EQU 0F8h        ; 8255 port A: segments (0 = lit), PA6 and PA7 also drive MG OUT
PC      EQU 0FAh        ; 8255 port C: PC0-3 digit / key column, PC4-6 key rows (0 = pressed)

        ORG 1C00h
START:  LXI SP,1FD9h
        LXI H,MAJOR
        SHLD TABLE      ; the note table in use
        LXI H,TMAJOR
        SHLD VPTR
WAITUP: CALL DISP       ; first wait until no key is held: PMI-80 C starts the program on the
        JC WAITUP       ; press of =, which would otherwise switch the scale at once
SHOW:   SHLD VPTR       ; the text DISP shows
IDLE:   CALL DISP       ; show the text and wait for a key
        JNC IDLE
        RRC             ; key code 80h-9Ah
        CPI 90h
        JZ SWITCH       ; = switches the scale
        JNC IDLE        ; other non-hex keys do nothing
        ANI 0Fh
        ADD A
        ADD A           ; four bytes per note
        MOV E,A
        MVI D,0
        LHLD TABLE
        DAD D
        MOV A,M         ; select the key's column (and its digit, which stays dark)
        OUT PC
        INX H
        MOV E,M         ; row bit of the key
        INX H
        MOV C,M         ; n1
        INX H
        MOV D,M         ; n2
TONE:   MVI A,0FFh      ; PA6 = PA7 = 1: MG OUT low
        OUT PA
        MOV B,C
WAIT1:  DCR B
        JNZ WAIT1
        MVI A,7Fh       ; PA7 = 0: MG OUT high
        OUT PA
        MOV B,D
WAIT2:  DCR B
        JNZ WAIT2
        IN PC
        ANA E           ; 0 = the key is still pressed
        JZ TONE
        JMP IDLE

SWITCH: LHLD TABLE      ; the two tables differ in the low byte of their address
        MOV A,L
        CPI LOW(MAJOR)
        LXI H,SEMI      ; LXI does not change the flags
        LXI D,TSEMI
        JZ SET
        LXI H,MAJOR
        LXI D,TMAJOR
SET:    SHLD TABLE
        XCHG
        SHLD VPTR
REL:    CALL DISP       ; wait until = is released, showing the new name
        JC REL
        JMP IDLE

TABLE:  DW MAJOR

; " uArHAnY " and " PuLtony " in the monitor's character codes; DISP also reads a tenth code.
TMAJOR: DB 19h,15h,0Ah,12h,1Ah,0Ah,1Bh,23h,19h,19h
TSEMI:  DB 19h,13h,15h,14h,10h,11h,1Bh,23h,19h,19h

; Per key 0-F: column select for PC0-3 (the PMI-80 sends the inverted column), row bit, n1, n2.
MAJOR:  DB 0Fh,40h,140,139      ; 0  c1  261.63 Hz -> 261.25 Hz  -2.5 c
        DB 07h,40h,125,123      ; 1  d1  293.66 Hz -> 293.32 Hz  -2.0 c
        DB 0Fh,20h,111,109      ; 2  e1  329.63 Hz -> 329.90 Hz  +1.4 c
        DB 07h,20h,105,103      ; 3  f1  349.23 Hz -> 348.53 Hz  -3.5 c
        DB 0Eh,40h,93,91        ; 4  g1  392.00 Hz -> 392.90 Hz  +4.0 c
        DB 08h,40h,83,81        ; 5  a1  440.00 Hz -> 439.52 Hz  -1.9 c
        DB 0Eh,20h,73,72        ; 6  h1  493.88 Hz -> 495.37 Hz  +5.2 c
        DB 08h,20h,69,68        ; 7  c2  523.25 Hz -> 523.37 Hz  +0.4 c
        DB 0Dh,40h,62,60        ; 8  d2  587.33 Hz -> 585.41 Hz  -5.7 c
        DB 09h,40h,55,53        ; 9  e2  659.26 Hz -> 658.24 Hz  -2.7 c
        DB 0Dh,20h,52,50        ; A  f2  698.46 Hz -> 695.31 Hz  -7.8 c
        DB 09h,20h,46,44        ; B  g2  783.99 Hz -> 783.58 Hz  -0.9 c
        DB 0Ah,40h,41,39        ; C  a2  880.00 Hz -> 876.27 Hz  -7.4 c
        DB 0Bh,40h,36,34        ; D  h2  987.77 Hz -> 993.84 Hz +10.6 c
        DB 0Ah,20h,34,32        ; E  c3 1046.50 Hz -> 1050.20 Hz +6.1 c
        DB 0Bh,20h,30,29        ; F  d3 1174.66 Hz -> 1165.91 Hz -12.9 c

SEMI:   DB 0Fh,40h,140,139      ; 0  c1    261.63 Hz -> 261.25 Hz -2.5 c
        DB 07h,40h,132,131      ; 1  cis1  277.18 Hz -> 276.88 Hz -1.9 c
        DB 0Fh,20h,125,123      ; 2  d1    293.66 Hz -> 293.32 Hz -2.0 c
        DB 07h,20h,118,116      ; 3  dis1  311.13 Hz -> 310.54 Hz -3.3 c
        DB 0Eh,40h,111,109      ; 4  e1    329.63 Hz -> 329.90 Hz +1.4 c
        DB 08h,40h,105,103      ; 5  f1    349.23 Hz -> 348.53 Hz -3.5 c
        DB 0Eh,20h,99,97        ; 6  fis1  369.99 Hz -> 369.39 Hz -2.9 c
        DB 08h,20h,93,91        ; 7  g1    392.00 Hz -> 392.90 Hz +4.0 c
        DB 0Dh,40h,88,86        ; 8  gis1  415.30 Hz -> 414.90 Hz -1.7 c
        DB 09h,40h,83,81        ; 9  a1    440.00 Hz -> 439.52 Hz -1.9 c
        DB 0Dh,20h,78,76        ; A  ais1  466.16 Hz -> 467.25 Hz +4.0 c
        DB 09h,20h,73,72        ; B  h1    493.88 Hz -> 495.37 Hz +5.2 c
        DB 0Ah,40h,69,68        ; C  c2    523.25 Hz -> 523.37 Hz +0.4 c
        DB 0Bh,40h,65,64        ; D  cis2  554.37 Hz -> 554.72 Hz +1.1 c
        DB 0Ah,20h,62,60        ; E  d2    587.33 Hz -> 585.41 Hz -5.7 c
        DB 0Bh,20h,58,57        ; F  dis2  622.25 Hz -> 619.69 Hz -7.1 c
        END
