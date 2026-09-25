# The Data tab's example
# (docs/screens/data.png)
        .data
msg:    .asciiz "Hello, MIPS!"
count:  .word 3
table:  .word 0x12345678, -1, 255
        .text
main:
        la   $a0, msg
        li   $v0, 4
        syscall
        lw   $t0, count
        la   $t1, table
        lw   $t2, 4($t1)
        addi $sp, $sp, -8
        sw   $t0, 4($sp)
        li   $v0, 10
        syscall
