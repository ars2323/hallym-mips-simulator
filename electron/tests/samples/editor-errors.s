# Sample for the editor's error list (PLAN R4): two assembler errors that do
# not stop the parser, then a syntax error, which does.
	.data
msg:	.asciiz "안녕하세요\n"	# 한글 주석 (UTF-8)

	.text
	.globl main
main:	li $v0, 4
	la $a0, msg
	syscall
	addi $t0, $zero, 70000		# immediate out of range
	sll $t1, $t0, 40		# shift distance out of range
	addi $t2, $t2, )		# syntax error
	jr $ra
