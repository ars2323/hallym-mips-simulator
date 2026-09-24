# tutorial.s -- Hallym MIPS 의 튜토리얼이 여는 예제입니다.
# tutorial.s -- the program the first-run tutorial opens.
#
# 배열의 합을 함수로 구합니다. 스택 프레임, 루프, 분기, 점프, 메모리
# 쓰기, syscall이 한 파일에 모두 들어 있습니다. 자유롭게 고쳐 보세요.
#
# A function adds up an array: a stack frame, a loop, a branch, a jump, a
# write back into .data and three syscalls, all in one short file.

        .data
prompt: .asciiz "Array sum: "       # 출력할 문자열 / the string to print
newline:.asciiz "\n"
nums:   .word   7, 11, 5, 23, 9     # 더할 배열 / the array to add up
count:  .word   5                   # 원소 개수 / how many of them
total:  .word   0                   # 한 번 돌 때마다 갱신 / updated every turn
flag:   .byte   1                   # 바이트 하나 / one byte
tag:    .half   -3                  # 하프워드 하나 / one halfword

        .text
        .globl  main

main:
        li      $s0, 42             # 함수가 지켜 줘야 할 값 / the callee must keep this
        lb      $t4, flag           # 바이트 읽기 / read one byte
        lh      $t5, tag            # 하프워드 읽기 / read one halfword
        la      $a0, nums           # 첫 번째 인자: 배열 / first argument
        lw      $a1, count          # 두 번째 인자: 개수 / second argument
        jal     sum_array           # 함수 호출 / call the function
        move    $s1, $v0            # 결과 보관 / keep the answer

        li      $v0, 4              # print_str
        la      $a0, prompt
        syscall
        li      $v0, 1              # print_int
        move    $a0, $s1
        syscall
        li      $v0, 4
        la      $a0, newline
        syscall
        li      $v0, 10             # exit
        syscall

# sum_array($a0 = 배열 주소, $a1 = 개수) -> $v0 = 합
# sum_array(address, count) -> the sum, in $v0
sum_array:
        # 스택은 8바이트 단위로 맞춥니다 / keep the stack 8-byte aligned
        addiu   $sp, $sp, -16       # 스택 프레임 만들기 / make a stack frame
        sw      $ra, 12($sp)        # 돌아갈 주소 저장 / save the return address
        sw      $s0, 8($sp)         # 부른 쪽의 $s0 저장 / save the caller's $s0
                                    # 0($sp), 4($sp): 지역 변수 자리 / room for locals
        move    $s0, $zero          # 누계 / the running total
        li      $t0, 0              # 인덱스 / the index

sum_loop:
        beq     $t0, $a1, sum_done  # 다 더했으면 끝 / done?
        sll     $t1, $t0, 2         # 인덱스 * 4 / index * 4
        addu    $t2, $a0, $t1       # 원소의 주소 / where that element is
        lw      $t3, 0($t2)         # 원소 읽기 / read it
        addu    $s0, $s0, $t3       # 누계에 더하기 / add it to the total
        sw      $s0, total          # 누계를 메모리에 / keep the total in memory
        addiu   $t0, $t0, 1         # 다음 인덱스 / next index
        j       sum_loop            # 루프 / around again

sum_done:
        move    $v0, $s0            # 합을 반환값으로 / the answer
        lw      $s0, 8($sp)         # $s0 복원 / restore the caller's $s0
        lw      $ra, 12($sp)        # $ra 복원 / restore the return address
        addiu   $sp, $sp, 16        # 프레임 반납 / drop the frame
        jr      $ra                 # 돌아가기 / return
