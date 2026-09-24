        .data
result: .word   0
        .text
        .globl  main
main:
        li   $t0, 0xF0F0F0F0
        li   $t1, 0x00FF00FF
        and  $t2, $t0, $t1
        or   $t3, $t0, $t1
        xor  $t4, $t0, $t1
        nor  $t5, $t0, $t1

        li   $t6, 0x80000001
        sll  $t7, $t6, 1
        srll $s0, $t6, 1
        sra  $s1, $t6, 1

        sw   $t2, result
        lw   $a0, result
        li   $v0, 1
        syscall

        li   $v0, 10
        syscall
