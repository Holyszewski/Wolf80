; COSMOS for the PMI-80 with the factory monitor: a port of the version in Nostalcomp's second
; EPROM for PMI-80 C (2019).
;
; Not the work of this project and not covered by its license. COSMOS is a game by Jiří Šutera for
; the PMI-80; Nostalcomp changed it (it speeds up, it ends with FULL SET at the score FFh) and
; put it into the second EPROM of PMI-80 C (pmi2_c.bin, 0440h-0657h, timed for 1.111 MHz). The
; code below is that code, disassembled and moved into RAM by the Wolf80 project; see
; programs/README.md.
;
; What the port changes, nothing else:
;  - it runs from 1C00h, and its own copies of the PMI-80 C tables it read follow it: the key
;    codes (01A3h) and the character segments (01BEh);
;  - the obstacles come from bit 0 of the bytes of the ROM pages 00xxh and 02xxh: here those of
;    the factory monitor, which is in the ROM (there is no room in the 1 KiB of RAM for copies of
;    the PMI-80 C pages), so the course of the game differs from PMI-80 C's;
;  - it sets its stack and the display pointer 1FFCh itself (the PMI-80 C menu did that).
;
; Keys: 4 or 8 up, 0 down, EX gives up; = a new game after a crash. RAM: program 1C00h-1E64h,
; variables 1F00h-1F02h, display 1FEFh-1FF7h, key 1FFEh, stack below 1FD9h.
; Start: EX 1C00 =. End: RE.

        ORG 1C00h
START:  LXI SP,1FD9h
        LXI H,1FEFh
        SHLD 1FFCh      ; the display pointer, as the monitor leaves it

; ---- COSMOS (PMI-80 C 0440h-05DDh) ----
COSMOS: LHLD 1FFCh
        LXI D,L05DE
        MVI B,09h
L0448:  LDAX D
        MOV M,A
        INX H
        INX D
        DCR B
        JNZ L0448
        MVI B,00h
L0452:  CALL SCAN
        DCR B
        JNZ L0452
        MVI B,80h
L045B:  CALL SCAN
        DCR B
        JNZ L045B
        LDA 1F02h
        MOV E,A
        LDA 1F01h
        ANI 02h
        MOV D,A
L046C:  PUSH D
        LHLD 1FFCh
        LXI D,L05E7
        MVI B,09h
L0475:  LDAX D
        MOV M,A
        INX H
        INX D
        DCR B
        JNZ L0475
        MVI B,00h
L047F:  CALL SCAN
        DCR B
        JNZ L047F
        POP D
        LHLD 1FFCh
        MVI B,09h
L048C:  MVI M,80h
        INX H
        DCR B
        JNZ L048C
        MVI A,0C0h
        STA 1FEFh
        MVI A,88h
        STA 1FF4h
        MVI B,01h
        MVI A,0FAh
        STA 1F00h
        MOV C,A
        MVI A,00h
        STA 1F01h
L04AA:  DCR C
        JNZ L04BF
        LDA 1F00h
        MOV C,A
        CPI 52h
        JZ L04BC
        MOV A,C
        DCR A
        STA 1F00h
L04BC:  CALL L0518
L04BF:  CALL SCAN
        JNC L04E7
        MVI A,00h
        CMP B
        JZ L04AA
        MVI B,00h
        LDA 1FFEh
        CPI 91h
        JZ L0591
        CPI 80h
        JZ L0506
        CPI 84h
        JZ L04EC
        CPI 88h
        JZ L04EC
        JMP L04AA
L04E7:  MVI B,01h
        JMP L04AA
L04EC:  LDA 1FEFh
        CPI 81h
        JZ L04AA
        CPI 88h
        JZ L04FE
        MVI A,81h
        JMP L0500
L04FE:  MVI A,0C0h
L0500:  STA 1FEFh
        JMP L04AA
L0506:  LDA 1FEFh
        CPI 88h
        JZ L04AA
        CPI 81h
        JZ L04FE
        MVI A,88h
        JMP L0500
L0518:  LDA 1F01h
        INR A
        STA 1F01h
        CPI 0FFh
        JZ L05BD
        LDA 1F01h
        ANI 0Fh
        STA 1FF7h
        LDA 1F01h
        ANI 0F0h
        RRC
        RRC
        RRC
        RRC
        STA 1FF6h
        LXI H,1FEFh
        MOV A,M
        INX H
        ANA M
        ANI 7Fh
        JNZ L0591
        INX H
L0544:  MOV A,M
        DCX H
        MOV M,A
        INX H
        INX H
        MOV A,L
        CPI 0F5h
        CNZ L0544
        INX D
        MOV A,D
        ANI 02h
        MOV D,A
        LDAX D
        RRC
        JC L056F
        LDA 1FF3h
        CPI 88h
        CZ L058B
        CPI 81h
        CZ L0588
        CPI 0E3h
        CZ L0585
        STA 1FF4h
        RET
L056F:  LDA 1FF3h
        CPI 81h
        CZ L058E
        CPI 88h
        CZ L0585
        CPI 0DCh
        CZ L0588
        STA 1FF4h
        RET
L0585:  MVI A,81h
        RET
L0588:  MVI A,88h
        RET
L058B:  MVI A,0DCh
        RET
L058E:  MVI A,0E3h
        RET
L0591:  LXI H,0B9EDh
        SHLD 1FEFh
        LXI H,0D0BFh
        SHLD 1FF1h
        LXI H,80F9h
        SHLD 1FF3h
L05A3:  CALL SCAN
        JNC L05A3
        LDA 1FFEh
        CPI 90h
        JNZ L05A3
        LDA 1F01h
        MOV E,A
        INR D
        MOV A,D
        ANI 02h
        MOV D,A
        JMP L046C
L05BD:  LHLD 1FFCh
        LXI D,L05F0
        MVI B,09h
L05C5:  LDAX D
        MOV M,A
        INX H
        INX D
        DCR B
        JNZ L05C5
L05CD:  CALL SCAN
        JNC L05CD
        LDA 1FFEh
        CPI 90h
        JNZ L05CD
        JMP COSMOS

; ---- texts COSMOS, StArt and FuLL SEt (PMI-80 C 05DEh-05F8h) ----
L05DE:  DB 19h,0Ch,00h,05h,16h,00h,05h,19h
        DB 19h
L05E7:  DB 19h,19h,05h,10h,0Ah,12h,10h,19h
        DB 19h
L05F0:  DB 0Fh,15h,14h,14h,19h,05h,0Eh,10h
        DB 19h

; ---- display and keyboard scan of COSMOS (PMI-80 C 05F9h-0657h) ----
SCAN:   PUSH H
        PUSH B
        PUSH D
        LXI D,0000h
        MOV B,D
        MOV A,D
        STA 1FFEh
L0604:  MVI A,7Fh
        OUT 0F8h
        NOP
        MOV A,E
        CMA
        OUT 0FAh
        NOP
        LHLD 1FFCh
        DAD D
        MOV A,M
        ORA A
        JP L061B
        CMA
        JMP L0621
L061B:  MOV C,A
        LXI H,SEGS
        DAD B
        MOV A,M
L0621:  OUT 0F8h
        NOP
        LDA 1FFEh
        ORA A
        JNZ L0649
        MVI C,09h
        LXI H,KEYS
        IN 0FAh
        NOP
        ANI 70h
        RLC
        RLC
        JNC L0644
        RLC
        JNC L0643
        RLC
        JC L0649
        DAD B
L0643:  DAD B
L0644:  DAD D
        MOV A,M
        STA 1FFEh
L0649:  INR E
        MVI A,0Ah
        CMP E
        JNZ L0604
        LDA 1FFEh
        RLC
        POP D
        POP B
        POP H
        RET

; ---- key codes (PMI-80 C 01A3h-01BDh) ----
KEYS:   DB 80h,84h,88h,91h,8Dh,8Ch,89h,85h
        DB 81h,82h,86h,8Ah,9Ah,8Fh,8Eh,8Bh
        DB 87h,83h,0FFh,94h,93h,0FFh,97h,92h
        DB 0FFh,0FFh,90h

; ---- character segments, codes 00h-28h (PMI-80 C 01BEh-01E6h) ----
SEGS:   DB 40h,79h,24h,30h,19h,12h,02h,78h
        DB 00h,10h,08h,03h,46h,21h,06h,0Eh
        DB 07h,23h,2Fh,0Ch,47h,63h,48h,71h
        DB 37h,7Fh,09h,2Bh,0Bh,2Ch,5Dh,3Fh
        DB 42h,61h,7Bh,11h,77h,1Ch,41h,0Fh
        DB 7Dh
