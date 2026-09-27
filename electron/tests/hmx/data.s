# .data used through la and lw: sums an array of words and prints a string.
        .data
msg:    .asciiz "sum = "
        .align 2
nums:   .word 3, 5, 7, -1
count:  .word 4
        .text
        .globl main
main:   la    $s0, nums
        lw    $s1, count
        li    $t0, 0
next:   lw    $t1, 0($s0)
        add   $t0, $t0, $t1
        addi  $s0, $s0, 4
        addi  $s1, $s1, -1
        bnez  $s1, next
        la    $a0, msg
        li    $v0, 4
        syscall
        move  $a0, $t0
        li    $v0, 1
        syscall
        li    $v0, 10
        syscall
