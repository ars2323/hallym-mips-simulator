# The SPIM core (../CPU, untouched) plus a thin N-API front end.
#
# Mirrors the Qt build's tests/spim_core.pri (hallym-mips-simulator): the same
# nine sources, the same bison/flex invocations and the same per-platform
# flags.  If the core's build changes there, this has to follow.  The parser
# and scanner are generated into the build directory, never into CPU/.
#
# Built on Linux; Windows (MSVC, win_bison/win_flex from winflexbison3) is
# checked by .github/workflows/windows.yml.
#
# ONE INTERVENTION IN THE CORE'S BUILD, WINDOWS ONLY: CPU/run.cpp is compiled
# through src/run-win.cpp, which replaces CreateWaitableTimer() (see the
# OS=='win' block below).  CPU/ itself is not changed.
{
  "variables": {
    "cpu_dir": "../CPU",
    "gen_dir": "<(SHARED_INTERMEDIATE_DIR)/spim",
    "conditions": [
      # winflexbison installs the tools under these names (as the Qt build's
      # QtSpim.pro notes).
      ["OS=='win'", {"bison": "win_bison", "flex": "win_flex"},
                    {"bison": "bison", "flex": "flex"}]
    ]
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
      #
      # -iquote is a Linux-only measure (gcc/clang; cflags_cc does not reach
      # MSVC).  <syscall.h> is a Linux header that MSVC's library never
      # includes, so there is nothing for CPU/syscall.h to shadow there: the
      # msvc block below simply puts CPU/ on the ordinary include path.
      # macOS has a <syscall.h> but libc++ does not include it; untried.
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
          # "-pyy", not "-p", "yy": gyp's msvs generator takes every action
          # argument that starts with neither '/' nor '-' and has no '=' for a
          # path and rewrites it relative to the .vcxproj -- "yy" became
          # "../yy" and win_bison wrote "extern YYSTYPE ../yylval;".  flex's
          # "-Pyy" below is written the same way.  All other arguments are
          # safe: switches, "--x=..." forms whose values are $(OutDir) paths,
          # and the input file, which is meant to be rewritten.
          "action": ["<(bison)", "-pyy",
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
          "action": ["<(flex)", "-I", "-8", "-Pyy",
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
          # !!! WINDOWS ONLY: CPU/run.cpp IS COMPILED THROUGH src/run-win.cpp !!!
          # That file is a forced include in front of the core's run.cpp (which
          # it then includes, unchanged): CreateWaitableTimer() becomes one
          # UNNAMED timer made once per process.  The core calls
          # CreateWaitableTimer(NULL, TRUE, "SPIMTimer") at every run_spim()
          # and never closes it -- measured: 364-850 handles leaked a second
          # while running, 1 per step -- and the name is shared by the whole
          # session, so two simulators running at once (this one and the Qt
          # build) take the one timer from each other.  Someone reading only
          # CPU/run.cpp cannot see this: see src/run-win.cpp and
          # docs/PORTING.md 14.  gyp has no per-file /FI, hence the wrapper.
          "sources!": ["<(cpu_dir)/run.cpp"],
          "sources": ["src/run-win.cpp"],
          # MSVC has no -iquote: CPU/ goes on the ordinary include path.
          # Nothing in MSVC's library includes <syscall.h>, so CPU/syscall.h
          # shadows nothing there.
          "include_dirs": ["<(cpu_dir)"],
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
