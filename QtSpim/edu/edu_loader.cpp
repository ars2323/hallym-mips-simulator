/* See edu_loader.h. */

#include "edu/edu_loader.h"

#include <stdio.h>

// The core's headers have no include guards; this file includes each once
// and must not include spimview.h.
#include "../CPU/spim.h"
#include "../CPU/string-stream.h"
#include "../CPU/spim-utils.h"
#include "../CPU/inst.h"
#include "../CPU/reg.h"
#include "../CPU/mem.h"
#include "../CPU/sym-tbl.h"
#include "../CPU/scanner.h"
#include "../CPU/parser.h"
#include "../CPU/data.h"

// EDU: mirrors read_assembly_file() in CPU/spim-utils.cpp, line for line.
// The right-hand comments are that function's lines.  If upstream ever
// changes it, this has to follow; tests/edu_oracle/tst_loader.cpp compares
// the two on every file in Tests/.
bool eduReadAssemblyFile(char* name, QString* symbolListing) {
  symbolListing->clear();
  FILE* file = fopen(name, "rt");             // FILE *file = fopen(name, "rt");
                                              //
  if (file == NULL) {                         // if (file == NULL) {
    char format[] = "Cannot open file: `%s'\n";
    error(format, name);                      //   error("Cannot open file: `%s'\n", name);
    return false;                             //   return false;
  } else {                                    // } else {
    initialize_scanner(file);                 //   initialize_scanner(file);
    initialize_parser(name);                  //   initialize_parser(name);
                                              //
    while (!yyparse())                        //   while (!yyparse())
      ;                                       //     ;
                                              //
    fclose(file);                             //   fclose(file);

    // The one addition.  print_symbols() walks the table and writes each
    // label through write_output(); it changes nothing.
    eduOutputCapture = symbolListing;
    print_symbols();
    eduOutputCapture = NULL;

    flush_local_labels(!parse_error_occurred);  // flush_local_labels(!parse_error_occurred);
    end_of_assembly_file();                   //   end_of_assembly_file();
    return true;                              //   return true;
  }                                           // }
}
