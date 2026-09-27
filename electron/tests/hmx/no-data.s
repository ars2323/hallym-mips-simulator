# No .data at all: the image has no .data section.
        .text
        .globl main
main:   li    $t0, 5
        addi  $t0, $t0, 37
        li    $v0, 10
        syscall
