# tutorial.s -- the program the first-run tour opens.
#
# It is deliberately small but has one of everything the tour points at: a
# few .data labels, an array, a counted loop with a branch, arithmetic that
# changes several registers, and two syscalls.  The tour runs a dozen
# instructions before it starts, so the register panel, the data panel and
# the stack markers all have something to show.
#
# 한림 MIPS 시뮬레이터 안내 투어가 여는 예제입니다. 자유롭게 고쳐 보세요.

        .data
msg:    .asciiz "Sum of the array: "
nums:   .word 3, 1, 4, 1, 5, 9, 2, 6   # the array the loop adds up
count:  .word 8                        # how many words
total:  .word 0                        # where the answer is stored

        .text
        .globl main

main:
        la      $t0, nums              # $t0 walks along the array
        lw      $t1, count             # $t1 = how many are left
        li      $t2, 0                 # $t2 = running total
        li      $t3, 0                 # $t3 = index

loop:
        beq     $t3, $t1, done         # all of them added?
        lw      $t4, 0($t0)            # read one word
        add     $t2, $t2, $t4          # add it to the total
        addi    $t0, $t0, 4            # next word
        addi    $t3, $t3, 1            # count it
        j       loop

done:
        sw      $t2, total             # keep the answer in memory

        li      $v0, 4                 # print_str
        la      $a0, msg
        syscall

        li      $v0, 1                 # print_int
        move    $a0, $t2
        syscall

        li      $v0, 10                # exit
        syscall
