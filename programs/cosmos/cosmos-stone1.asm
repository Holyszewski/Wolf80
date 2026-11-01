; COSMOS for the Stone 1 with its own monitor: a port of the version in Nostalcomp's STONE-PMI
; EPROM (2019).
;
; Not the work of this project and not covered by its license. COSMOS is a game by Jiří Šutera for
; the PMI-80; Nostalcomp changed it (it speeds up, it ends with FULL SET at the score FFh) and
; adapted it for the STONE, a Z80 at 2 MHz (STONE-PMI, 0440h-0657h). Disassembled and moved into
; RAM by the Wolf80 project, in the same way as for the Savia-84; see programs/README.md.
;
; What the port changes, nothing else:
;  - it runs from 1800h with its own copies of the STONE-PMI key and segment tables;
;  - the obstacles come from bit 0 of the bytes of the STONE-PMI ROM pages 00xxh and 02xxh, copied
;    to 1C00h and 1E00h (three ORI 1Ch choose the page);
;  - it sets its stack and the display pointer 1FFCh itself.
; The Stone 1 selects the digit inverted, as STONE-PMI expects, so the scan is unchanged.
;
; Keys: 4 or 8 up, 0 down, EX gives up; = a new game after a crash. RAM: program 1800h-1A6Ah,
; ROM copies 1C00h-1CFFh and 1E00h-1EFFh, variables 1F00h-1F02h, display 1FEFh-1FF7h, stack
; below 1FD9h. Start: EX 1800 =. End: RE.

ROMDAT  EQU 1C00h       ; the copy of page 00xxh; the copy of page 02xxh is 200h higher

        ORG 1800h
START:  LXI SP,1FD9h
        LXI H,1FEFh
        SHLD 1FFCh      ; the display pointer, as the monitor leaves it

; ---- COSMOS (STONE-PMI 0440h-05DDh) ----
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
        ORI ROMDAT>>8 ; the copies of the ROM pages: page 00 at ROMDAT, page 02 200h higher
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
        MVI A,00h
        STA 1F00h
        MOV C,A
        MVI A,00h
        STA 1F01h
L04AA:  DCR C
        JNZ L04BF
        LDA 1F00h
        MOV C,A
        CPI 6Fh
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
        ORI ROMDAT>>8
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
        ORI ROMDAT>>8
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

; ---- texts COSMOS, StArt and FuLL SEt (STONE-PMI 05DEh-05F8h) ----
L05DE:  DB 19h,0Ch,00h,05h,16h,00h,05h,19h
        DB 19h
L05E7:  DB 19h,19h,05h,10h,0Ah,12h,10h,19h
        DB 19h
L05F0:  DB 0Fh,15h,14h,14h,19h,05h,0Eh,10h
        DB 19h

; ---- display and keyboard scan of COSMOS (STONE-PMI 05F9h-0657h) ----
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

; ---- key codes (STONE-PMI 01A3h-01BDh) ----
KEYS:   DB 80h,84h,88h,91h,8Dh,8Ch,89h,85h
        DB 81h,82h,86h,8Ah,9Ah,8Fh,8Eh,8Bh
        DB 87h,83h,0FFh,94h,93h,0FFh,97h,92h
        DB 0FFh,0FFh,90h

; ---- character segments, codes 00h-28h (STONE-PMI 01BEh-01E6h) ----
SEGS:   DB 40h,79h,24h,30h,19h,12h,02h,78h
        DB 00h,10h,08h,03h,46h,21h,06h,0Eh
        DB 07h,23h,2Fh,0Ch,47h,63h,48h,71h
        DB 37h,7Fh,09h,2Bh,0Bh,2Ch,5Dh,3Fh
        DB 42h,61h,7Bh,11h,77h,1Ch,41h,0Fh
        DB 7Dh

; ---- STONE-PMI ROM 0000h-00FFh, only bit 0 of each byte is used ----
        ORG ROMDAT
        DB 3Eh,8Ah,0D3h,0FBh,0F3h,0C3h,2Eh,00h,22h,0DFh,1Fh,0E1h,22h,0E2h,1Fh,21h
        DB 00h,00h,39h,22h,0E4h,1Fh,21h,0DDh,1Fh,0F9h,0C5h,0D5h,0F5h,0E1h,22h,0DDh
        DB 1Fh,2Ah,0ECh,1Fh,3Ah,0EEh,1Fh,77h,21h,20h,02h,0C3h,40h,00h,21h,0D9h
        DB 1Fh,22h,0E4h,1Fh,0C3h,3Bh,00h,0FFh,0C3h,0E6h,1Fh,0EDh,56h,21h,0E7h,01h
        DB 31h,0D9h,1Fh,22h,0FCh,1Fh,0CDh,16h,01h,21h,0EFh,1Fh,22h,0FCh,1Fh,3Eh
        DB 1Dh,0CDh,0ABh,00h,0CDh,16h,01h,21h,0Bh,02h,06h,06h,0BEh,23h,0CAh,6Dh
        DB 00h,23h,23h,05h,0C2h,5Ch,00h,21h,02h,02h,0C3h,40h,00h,4Eh,23h,66h
        DB 69h,0E9h,3Eh,16h,0CDh,0ABh,00h,0CDh,0D7h,00h,7Eh,32h,0FAh,1Fh,3Eh,18h
        DB 02h,0CDh,0FBh,00h,2Ah,0F8h,1Fh,3Ah,0FAh,1Fh,77h,23h,22h,0F8h,1Fh,0CDh
        DB 0BBh,00h,0C3h,7Ah,00h,1Eh,1Bh,00h,19h,0Fh,26h,1Bh,0Ch,1Eh,14h,00h
        DB 0Ah,0Dh,0Eh,12h,19h,05h,05h,0FFh,0FFh,3Eh,19h,11h,08h,00h,2Ah,0FCh
        DB 1Fh,19h,36h,19h,1Dh,0C2h,0AEh,00h,2Bh,77h,0C9h,01h,0F1h,1Fh,2Ah,0F8h
        DB 1Fh,7Ch,0CDh,0C6h,00h,7Dh,0D5h,57h,0Fh,0Fh,0Fh,0Fh,0E6h,0Fh,02h,03h
        DB 7Ah,0E6h,0Fh,02h,03h,0D1h,0C9h,0CDh,0BBh,00h,0CDh,16h,01h,0C8h,0D2h,97h
        DB 01h,2Ah,0F8h,1Fh,0E6h,0Fh,29h,29h,29h,29h,85h,6Fh,22h,0F8h,1Fh,0C3h
        DB 0D7h,00h,01h,0F6h,1Fh,2Ah,0FAh,1Fh,0C3h,0C5h,00h,0CDh,0F2h,00h,0CDh,16h

; ---- STONE-PMI ROM 0200h-02FFh ----
        ORG ROMDAT+200h
        DB 10h,0Ah,1Eh,19h,0Eh,12h,12h,11h,12h,19h,1Eh,92h,72h,00h,91h,29h
        DB 02h,97h,5Ah,02h,9Ah,7Eh,02h,94h,4Ch,03h,93h,8Ch,03h,49h,18h,7Eh
        DB 1Eh,0Bh,12h,1Fh,05h,10h,11h,13h,1Eh,3Eh,20h,0CDh,0ABh,00h,2Ah,0E2h
        DB 1Fh,22h,0F8h,1Fh,0CDh,0D7h,00h,2Ah,0F8h,1Fh,22h,0E2h,1Fh,3Eh,06h,0D3h
        DB 0F8h,00h,3Eh,0Fh,0D3h,0FAh,00h,21h,0D9h,1Fh,0F9h,0D1h,0C1h,0F1h,2Ah,0E4h
        DB 1Fh,0F9h,2Ah,0E2h,1Fh,0E5h,2Ah,0DFh,1Fh,0C9h,3Eh,0Bh,0CDh,0ABh,00h,2Ah
        DB 0ECh,1Fh,22h,0F8h,1Fh,0CDh,0D7h,00h,2Ah,0F8h,1Fh,22h,0ECh,1Fh,7Eh,32h
        DB 0EEh,1Fh,36h,0CFh,2Ah,0E2h,1Fh,2Bh,22h,0E2h,1Fh,0C3h,29h,02h,3Eh,12h
        DB 0CDh,0ABh,00h,0CDh,16h,01h,0D2h,67h,00h,0E6h,0Fh,01h,06h,00h,21h,2Ah
        DB 01h,0Bh,09h,0Ch,0Dh,0CAh,4Fh,00h,0BEh,0C2h,8Eh,02h,21h,2Fh,01h,0CDh
        DB 0CDh,02h,5Dh,21h,34h,01h,0CDh,0CDh,02h,63h,22h,0F6h,1Fh,0C5h,0CDh,0CAh
        DB 02h,0E5h,4Eh,23h,66h,69h,22h,0F8h,1Fh,0CDh,0D7h,00h,0D1h,7Dh,12h,13h
        DB 7Ch,12h,0C1h,0Dh,0C2h,9Ch,02h,0C3h,4Fh,00h,21h,39h,01h,06h,00h,09h
        DB 6Eh,26h,1Fh,0C9h,3Eh,00h,4Fh,06h,0Dh,0CDh,40h,01h,0D2h,0D9h,02h,0Fh
        DB 0B9h,0C2h,0D6h,02h,05h,0C2h,0D9h,02h,79h,0FEh,90h,0C1h,0C9h,0FFh,0E6h,0Fh
        DB 0FEh,00h,0C2h,0F6h,02h,3Ch,17h,17h,17h,17h,0F6h,0Fh,32h,0FAh,1Fh,22h
