# The SPIM core (../CPU, untouched) plus a thin N-API front end.
#
# Mirrors the Qt build's tests/spim_core.pri (hallym-mips-simulator): the same
# nine sources, the same bison/flex invocations and the same per-platform
# flags.  If the core's build changes there, this has to follow.  The parser
# and scanner are generated into the build directory, never into CPU/.
#
# Linux only for now.  The msvc block carries the flags spim_core.pri found
# necessary, but win_bison/win_flex have not been wired up or tried.
{
  "variables": {
    "cpu_dir": "../CPU",
    "gen_dir": "<(SHARED_INTERMEDIATE_DIR)/spim"
  },
  "targets": [
    {
      "target_name": "spim",
      "sources": [
        "src/addon.cc",
        "<(cpu_dir)/data.cpp",
        "<(cpu_dir)/display-utils.cpp",
        "<(cpu_dir)/inst.cpp",
        "<(cpu_dir)/mem.cpp",
        "<(cpu_dir)/run.cpp",
        "<(cpu_dir)/spim-utils.cpp",
        "<(cpu_dir)/string-stream.cpp",
        "<(cpu_dir)/sym-tbl.cpp",
        "<(cpu_dir)/syscall.cpp"
      ],
      # CPU/ is searched for "quoted" includes only.  As a -I directory its
      # syscall.h would shadow the system <syscall.h>, which libstdc++'s C++20
      # <atomic> (pulled in by napi.h) includes.  The core's own sources find
      # their headers next to themselves; this is for addon.cc and the
      # generated parser and scanner.
      "include_dirs": [
        "<(gen_dir)",
        "<!(node -p \"require('node-addon-api').include_dir\")"
      ],
      "cflags_cc": [
        "-iquote<!(node -p \"require('path').resolve('../CPU')\")"
      ],
      "defines": ["NAPI_VERSION=8", "NAPI_DISABLE_CPP_EXCEPTIONS"],
      "actions": [
        {
          "action_name": "bison_parser",
          "inputs": ["<(cpu_dir)/parser.y"],
          "outputs": ["<(gen_dir)/parser_yacc.cpp", "<(gen_dir)/parser_yacc.h"],
          "action": ["bison", "-p", "yy",
                     "--defines=<(gen_dir)/parser_yacc.h",
                     "--output=<(gen_dir)/parser_yacc.cpp",
                     "<(cpu_dir)/parser.y"],
          "process_outputs_as_sources": 1,
          "message": "bison parser.y"
        },
        {
          "action_name": "flex_scanner",
          "inputs": ["<(cpu_dir)/scanner.l"],
          "outputs": ["<(gen_dir)/lex.scanner.cpp"],
          "action": ["flex", "-I", "-8", "-Pyy",
                     "--outfile=<(gen_dir)/lex.scanner.cpp",
                     "<(cpu_dir)/scanner.l"],
          "process_outputs_as_sources": 1,
          "message": "flex scanner.l"
        }
      ],
      "conditions": [
        ["OS=='linux'", {
          # The core passes string literals as char* throughout.
          "cflags_cc": ["-Wno-write-strings"]
        }],
        ["OS=='win'", {
          "defines": ["_CRT_SECURE_NO_WARNINGS"],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "AdditionalOptions": ["/utf-8", "/Zc:strictStrings-"]
            }
          }
        }]
      ]
    }
  ]
}
