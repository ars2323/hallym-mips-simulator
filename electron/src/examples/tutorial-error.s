# 튜토리얼 예제: 어딘가 한 줄이 틀렸습니다 (읽기 전용)
        .text
main:   li      $t0, 8
        srll    $t1, $t0, 1     # 오른쪽으로 1비트 옮기기
        li      $v0, 10
        syscall
