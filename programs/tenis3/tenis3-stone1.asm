; TENIS3 for the Stone 1 with its own monitor: a port of the version in Nostalcomp's STONE-PMI
; EPROM (2019).
;
; Not the work of this project and not covered by its license. TENIS is a game for the PMI-80
; from a Slovak microelectronics application sheet (author not named), transcribed by
; Nostalcomp; TENIS3 is Nostalcomp's version, here from the STONE-PMI EPROM (0660h-0797h), with
; the STONE-PMI routines it calls (CLEAR 00ABh, DISP 0140h) and the tables they use.
; Disassembled and moved into RAM by the Wolf80 project, in the same way as for the Savia-84; see
; programs/README.md. The Stone 1 selects the digit inverted, as STONE-PMI expects, so DISP is
; unchanged.
;
; Hit the ball with a key when it reaches you. RAM: program 1800h-1A24h, variables and display
; 1CBDh-1CD0h, text 1FEFh-1FF7h, stack below 1FD9h. Start: EX 1800 =. End: RE.

        ORG 1800h
START:  LXI SP,1FD9h
        LXI H,1FEFh
        SHLD 1FFCh      ; the display pointer, as the monitor leaves it

; ---- TENIS3 (STONE-PMI 0660h-0738h) ----
TENIS3: LXI H,L074D
        CALL UKAZTX
        LXI D,1CBDh
        LXI H,L0739
        MVI B,14h
L066E:  MOV A,M
        STAX D
        INX H
        INX D
        DCR B
        MOV A,B
        XRI 00h
        JNZ L066E
L0679:  MVI A,00h
        STA 1CBEh
        MVI A,0FFh
        STA 1CBFh
        STA 1CD0h
L0686:  LXI H,1CD0h
        LDA 1CBDh
L068C:  DCR M
        DCR A
        JNZ L068C
        LXI H,1CC7h
        SHLD 1FFCh
        MVI A,08h
        CALL CLEAR
        MVI A,35h
        STA 1CCFh
        MVI A,1Bh
        STA 1CCBh
        LDA 1CBFh
        INR A
        CPI 0Ah
        JNZ L06B8
        LDA 1CBEh
        INR A
        STA 1CBEh
        MVI A,00h
L06B8:  STA 1CBFh
L06BB:  LDA 1CD0h
        MOV B,A
L06BF:  CALL DISP
        DCR B
        JZ L06CC
        JNC L06BF
        CALL L0789
L06CC:  MOV A,B
        CPI 00h
        JZ L06DD
        LDA 1CCFh
        CPI 08h
        JZ L0686
        JMP L0722
L06DD:  LDA 1CCFh
        CPI 08h
        JZ L0722
        INX H
        MOV A,L
        CPI 0C8h
        JZ L0706
        CPI 0CBh
        JZ L070D
        CPI 0CCh
        JZ L0714
        CPI 0CFh
        JZ L071B
        MVI A,11h
        MVI D,19h
L06FF:  MOV M,A
        DCX H
        MOV M,D
        INX H
        JMP L06BB
L0706:  MVI A,11h
        MVI D,13h
        JMP L06FF
L070D:  MVI A,59h
        MVI D,19h
        JMP L06FF
L0714:  MVI A,11h
        MVI D,1Bh
        JMP L06FF
L071B:  MVI A,08h
        MVI D,19h
        JMP L06FF
L0722:  LXI H,1CBEh
        SHLD 1FFCh
        LXI B,0404h
L072B:  CALL DISP
        DCR B
        JNZ L072B
        DCR C
        JNZ L072B
        JMP L0679

; ---- initial values, copied to 1CBDh-1CD0h (STONE-PMI 0739h-074Ch) ----
L0739:  DB 09h,00h,00h,19h,0Bh,11h,0Dh,11h
        DB 15h,19h,0FFh,0FFh,0FFh,0FFh,0FFh,0FFh
        DB 0FFh,0FFh,0FFh,0FFh

; ---- text TENIS 3 (STONE-PMI 074Dh-0755h) ----
L074D:  DB 19h,10h,0Eh,1Bh,01h,05h,19h,03h
        DB 19h

; ---- UKAZTEXT and a key routine (STONE-PMI 0756h-0797h) ----
UKAZTX: PUSH B
        PUSH D
        LXI D,1FEFh
        MVI B,09h
        MVI C,00h
L075F:  MOV A,M
        STAX D
        INX H
        INX D
        DCR B
        JNZ L075F
L0767:  PUSH B
        CALL DISP
        POP B
        NOP
        NOP
        NOP
        NOP
        NOP
        NOP
        DCR C
        JNZ L0767
        LXI D,1FEFh
        MVI B,09h
L077B:  MVI A,19h
        STAX D
        INX D
        DCR B
        JNZ L077B
        CALL DISP
        POP D
        POP B
        RET
L0789:  RRC
        MOV C,A
L078B:  CALL DISP
        JC L078B
        CALL DISP
        MOV A,C
        CPI 90h
        RET

; ---- CLEAR of the monitor (STONE-PMI 00ABh-00BAh) ----
CLEAR:  LXI D,0008h
L00AE:  LHLD 1FFCh
        DAD D
        MVI M,19h
        DCR E
        JNZ L00AE
        DCX H
        MOV M,A
        RET

; ---- DISP of the monitor (STONE-PMI 0140h-0196h) ----
DISP:   PUSH H
        PUSH B
        PUSH D
        LXI D,0000h
        MOV B,D
        MOV A,D
        STA 1FFEh
L014B:  MVI A,7Fh
        OUT 0F8h
        NOP
        MOV A,E
        CMA
        OUT 0FAh
        NOP
        LHLD 1FFCh
        DAD D
        MOV C,M
        LXI H,SEGS
        DAD B
        MOV A,M
        OUT 0F8h
        NOP
        LDA 1FFEh
        ORA A
        JNZ L0188
        MVI C,09h
        LXI H,KEYS-9
        IN 0FAh
        NOP
        ANI 70h
        RLC
        RLC
        JNC L0182
        RLC
        JNC L0181
        RLC
        JC L0188
        DAD B
L0181:  DAD B
L0182:  DAD B
        DAD D
        MOV A,M
        STA 1FFEh
L0188:  INR E
        MVI A,09h
        CMP E
        JNZ L014B
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

; ---- character segments, codes 00h-28h, and the ROM bytes after them (TENIS3 shows codes up to 59h) (STONE-PMI 01BEh-021Fh) ----
SEGS:   DB 40h,79h,24h,30h,19h,12h,02h,78h
        DB 00h,10h,08h,03h,46h,21h,06h,0Eh
        DB 07h,23h,2Fh,0Ch,47h,63h,48h,71h
        DB 37h,7Fh,09h,2Bh,0Bh,2Ch,5Dh,3Fh
        DB 42h,61h,7Bh,11h,77h,1Ch,41h,0Fh
        DB 7Dh,05h,10h,11h,1Bh,0Eh,1Fh,13h
        DB 16h,01h,0Eh,12h,12h,18h,0Ah,0Dh
        DB 12h,0Eh,05h,0Eh,12h,12h,18h,19h
        DB 0Dh,0Ah,10h,0Ah,1Eh,19h,0Eh,12h
        DB 12h,11h,12h,19h,1Eh,92h,72h,00h
        DB 91h,29h,02h,97h,5Ah,02h,9Ah,7Eh
        DB 02h,94h,4Ch,03h,93h,8Ch,03h,49h
        DB 18h,7Eh
