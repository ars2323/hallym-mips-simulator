QtSpim-Edu @VERSION@ for Windows
====================================

QtSpim-Edu is an educational fork of QtSpim (the MIPS32 simulator) that
changes only the user interface.  The simulator core is the unmodified
SPIM @BASE_VERSION@ core, so programs run exactly as in the standard QtSpim.

Running
-------
  1. Unzip this folder anywhere (for example C:\mips\QtSpimEdu).
  2. Double-click QtSpimEdu.exe.  Nothing is installed; delete the
     folder to remove the program.
  3. Try it: File > Load File > helloworld.s, then Simulator > Run.

  If Windows SmartScreen shows "Windows protected your PC", click
  "More info" and then "Run anyway": the program is not code-signed.

Help
----
  Help > View Help opens the QtSpim manual in a separate window
  (assistant.exe, shipped in this folder).

Coexistence with the standard QtSpim
------------------------------------
  This program uses its own settings and a different executable name, so
  it can be installed and used side by side with the standard QtSpim.

Korean / non-ASCII folder names
-------------------------------
  On a Windows whose system language does not cover the characters in a
  file's path (for example a Korean user name on an English Windows), the
  simulator cannot open the file.  The program tells you so before loading
  and suggests moving the file; it does not crash or silently fail.

Licences
--------
  SPIM is Copyright (c) 1990-2023 James R. Larus, distributed under a BSD
  licence (README-SPIM.txt).  QtSpim-Edu is not affiliated with or
  endorsed by the SPIM project.  The Qt libraries in this folder are
  distributed under the GNU LGPL v3 / v2.1
  (https://www.gnu.org/licenses/lgpl-3.0.html).


QtSpim-Edu @VERSION@ (Windows) — 한국어 안내
==========================================

QtSpim-Edu는 MIPS32 시뮬레이터 QtSpim의 교육용 수정판으로, 화면(GUI)만
바꾸었습니다.  시뮬레이터 코어는 원본 SPIM @BASE_VERSION@ 그대로이므로
프로그램 실행 결과는 표준 QtSpim과 완전히 같습니다.

실행
----
  1. 이 폴더를 원하는 곳에 풉니다 (예: C:\mips\QtSpimEdu).
  2. QtSpimEdu.exe를 더블클릭합니다.  설치 과정은 없으며, 지우려면 폴더를
     삭제하면 됩니다.
  3. 확인: File > Load File > helloworld.s, 그다음 Simulator > Run.

  "Windows의 PC 보호" 창이 뜨면 "추가 정보" → "실행"을 누르세요.
  (코드 서명이 되어 있지 않아서 나오는 안내입니다.)

도움말
------
  Help > View Help 메뉴가 QtSpim 설명서를 별도 창(assistant.exe, 이 폴더에
  포함)으로 엽니다.

표준 QtSpim과 함께 쓰기
----------------------
  설정 저장 위치와 실행 파일 이름이 표준 QtSpim과 다르므로 두 프로그램을
  같은 PC에 나란히 두고 써도 됩니다.

한글 폴더 이름
--------------
  Windows의 시스템 언어가 파일 경로의 문자를 지원하지 않으면(예: 영문
  Windows의 한글 사용자 이름) 시뮬레이터가 파일을 열지 못합니다.  이 경우
  프로그램이 파일을 읽기 전에 그 사실을 알려 주고 파일을 옮기라고 안내합니다.
