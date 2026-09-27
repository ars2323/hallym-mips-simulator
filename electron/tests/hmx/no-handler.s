# assemble: no exception handler
# Settings > 고급 > Exception handler: None.  There is no start-up code, so
# the program brings its own __start, which is the entry (it has no main).
        .globl __start
__start:
        li    $t0, 9
        li    $v0, 10
        syscall
