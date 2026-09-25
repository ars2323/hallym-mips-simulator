# A file that stops assembling half way (PLAN decision ".data labels", check
# b): the parser gives up at the first syntax error, so everything after
# "oops" is never seen, while the label on the broken line IS recorded.
	.data
before:	.word 1, 2, 3
	.text
	.globl main
main:	addi $t0, $zero, 1
first:	addi $t0, $t0, 1
broken:	addi $t0, $t0, )	# syntax error here
after:	addi $t0, $t0, 1
	jr $ra
	.data
never:	.word 4
