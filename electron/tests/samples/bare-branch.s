# Bare Machine sample for the screenshot harness: real delayed branches, so
# offsets are encoded from PC+4.  Run with: -bare -noexception
	.text
	.globl main
main:	addi $8 $0 3
loop:	addi $8 $8 -1
	bne $8 $0 loop
	addu $0 $0 $0		# delay slot
	beq $0 $0 done
	addu $0 $0 $0		# delay slot
	addi $9 $0 1
done:	addi $2 $0 10		# syscall 10 (exit)
	syscall
