# .space leaves a large gap between two words, and more at the end: the
# image writes each gap as one "zero" line, and the data ends where the
# assembler stopped (after the last .space).
        .data
first:  .word 0x11111111
buffer: .space 4096
last:   .word 0x22222222
tail:   .space 64
        .text
        .globl main
main:   la    $t0, buffer
        li    $t1, 0x7f
        sb    $t1, 0($t0)
        lw    $t2, last
        li    $v0, 10
        syscall
