# Pseudo-instructions, each becoming one or more real instructions:
# li (small and large), la, move, blt, bgt, mul, neg, not, abs, rem.
        .data
word:   .word 0x12345678
        .text
        .globl main
main:   li    $t0, 7
        li    $t1, 0x12345678
        la    $t2, word
        move  $t3, $t0
        blt   $t0, $t1, less
        nop
less:   bgt   $t1, $t0, more
        nop
more:   mul   $t4, $t0, $t0
        neg   $t5, $t0
        not   $t6, $t0
        abs   $t7, $t5
        rem   $s0, $t1, $t0
        li    $v0, 10
        syscall
