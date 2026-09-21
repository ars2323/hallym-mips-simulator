/* QtSpim-Edu: reading an assembly file, with the file's labels kept.

   The core's read_assembly_file() (CPU/spim-utils.cpp) ends by dropping the
   file's local labels from the symbol table (flush_local_labels()), and the
   table cannot be walked from outside (ARCHITECTURE 3.7).  Most labels a
   student writes are local ("msg:", "loop:"), so after a load there is no
   way left to learn where they are.

   eduReadAssemblyFile() is read_assembly_file() again, call for call, with
   one read-only step added in front of flush_local_labels(): print_symbols()
   into a string.  Nothing the simulator sees differs: same calls, same
   order, same arguments, and print_symbols() only reads.

   Depends on the core's headers and QtCore only, so the test suite can link
   it against the core without the GUI (tests/edu_oracle).
*/

#ifndef EDU_LOADER_H
#define EDU_LOADER_H

#include <QString>

// While this points at a string, the front end's write_output() appends
// what the core writes to message_out to it instead of showing it.
// (QtSpim/spim_support.cpp; the test suite's stub does the same.)
extern QString* eduOutputCapture;

// As read_assembly_file(name).  *symbolListing receives print_symbols()'s
// text as of the end of the file, local labels included; it is left empty
// if the file could not be opened.
bool eduReadAssemblyFile(char* name, QString* symbolListing);

#endif  // EDU_LOADER_H
