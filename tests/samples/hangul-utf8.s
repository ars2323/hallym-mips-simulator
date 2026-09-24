# 한글 주석이 있는 짧은 프로그램.  hangul-utf8.s 는 UTF-8 에 LF,
# hangul-cp949.s 는 같은 내용을 옛 메모장처럼 CP949 에 CRLF 로 저장한 것.
	.data
greeting:	.asciiz "안녕하세요, MIPS!\n"	# 문자열 자체도 한글
	.text
	.globl main
main:	li $v0, 4		# 출력
	la $a0, greeting
	syscall
	jr $ra			# 돌아가기
