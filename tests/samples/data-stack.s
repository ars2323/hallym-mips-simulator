# Sample for the Data panel (PLAN R5): local and global .data labels, words,
# halves, bytes and a string, plus a stack frame that stays live for a while.
	.data
msg:	.asciiz "Hello, data!"
	.align 2
nums:	.word 1, 2, 3, -1
	.globl total
total:	.word 0
bytes:	.byte 0x41, 0x42, 0x43, 0x44
half:	.half 0x1234, 0xabcd

	.text
	.globl main
main:	addi $sp, $sp, -16
	sw $ra, 12($sp)
	sw $s0, 8($sp)
	move $fp, $sp
	la $t0, nums
	li $s0, 0
	li $t1, 4
loop:	lw $t2, 0($t0)
	add $s0, $s0, $t2
	addi $t0, $t0, 4
	addi $t1, $t1, -1
	bnez $t1, loop
	sw $s0, total
	sw $s0, 0($sp)
	lw $s0, 8($sp)
	lw $ra, 12($sp)
	addi $sp, $sp, 16
	jr $ra
