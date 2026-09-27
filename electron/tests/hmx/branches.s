# Branches and jumps: beq, bne, j, jal and jr.  Adds 1..5 in a loop, then
# calls a function that doubles the sum.
        .text
        .globl main
main:   li    $t0, 0            # sum
        li    $t1, 1            # i
        li    $t2, 6
loop:   beq   $t1, $t2, done
        add   $t0, $t0, $t1
        addi  $t1, $t1, 1
        j     loop
done:   move  $a0, $t0
        jal   double
        move  $s0, $v0          # 30
        li    $v0, 10
        syscall

double: add   $v0, $a0, $a0
        jr    $ra
