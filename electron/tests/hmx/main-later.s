# main is not the first thing in .text: a function comes before it, so
# entry is main's address, not the text's first word after the start-up code.
        .text
square: mul   $v0, $a0, $a0
        jr    $ra

        .globl main
main:   li    $a0, 12
        jal   square
        move  $s0, $v0          # 144
        li    $v0, 10
        syscall
