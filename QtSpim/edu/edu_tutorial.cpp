/* See edu_tutorial.h. */

#include "edu/edu_tutorial.h"

#include <QAbstractButton>
#include <QAbstractItemView>
#include <QAction>
#include <QApplication>
#include <QBrush>
#include <QDockWidget>
#include <QEvent>
#include <QFrame>
#include <QHBoxLayout>
#include <QHeaderView>
#include <QKeyEvent>
#include <QLabel>
#include <QLocale>
#include <QPainter>
#include <QPainterPath>
#include <QPushButton>
#include <QCloseEvent>
#include <QResizeEvent>
#include <QTimer>
#include <QTabBar>
#include <QToolBar>
#include <QVBoxLayout>

#include "edu/core/edu_registers.h"
#include "edu/edu_bottom_panel.h"
#include "edu/edu_data_model.h"
#include "edu/edu_data_view.h"
#include "edu/edu_editor_dock.h"
#include "edu/edu_instruction_inspector.h"
#include "edu/edu_register_model.h"
#include "edu/edu_register_view.h"
#include "edu/edu_text_model.h"
#include "edu/edu_text_view.h"
#include "edu/theme/edu_theme.h"
#include "edu/theme/tokens.h"
#include "spimview.h"
#include "ui_spimview.h"

namespace {

using namespace edu::theme;

const int kCardWidth = 360;
const int kMargin = 16;
const int kGap = 22;
const int kArrow = 10;
const int kDim = 115;  // black at 45 %
const int kMinSpot = 12;

QString hex(QRgb rgb) { return QColor(rgb).name(QColor::HexRgb); }

// A header section, in the coordinates of the window.
QRect sectionRect(QHeaderView* header, int section, QWidget* window) {
  if (header == 0 || !header->isVisible()) {
    return QRect();
  }
  const int x = header->sectionViewportPosition(section);
  const int width = header->sectionSize(section);
  if (width <= 0) {
    return QRect();
  }
  const QPoint origin = header->mapTo(window, QPoint(0, 0));
  return QRect(origin.x() + x, origin.y(), width, header->height());
}

// A cell of an item view, scrolled into sight first -- sideways as well as
// down: a table scrolled right (a register panel in binary, say) would
// otherwise be lit where the cell used to be (N).  What comes back never
// reaches outside the panel it is in.
QRect cellRect(QAbstractItemView* view, const QModelIndex& index,
               QWidget* window) {
  if (view == 0 || !index.isValid() || !view->isVisible()) {
    return QRect();
  }
  view->scrollTo(index, QAbstractItemView::EnsureVisible);
  QApplication::processEvents(QEventLoop::ExcludeUserInputEvents);
  const QRect r = view->visualRect(index);
  if (r.isEmpty()) {
    return QRect();
  }
  const QPoint origin = view->viewport()->mapTo(window, QPoint(0, 0));
  const QRect viewport(origin, view->viewport()->size());
  const QRect cell = r.translated(origin).intersected(viewport);
  // A sliver of a cell is worse than nothing: it points at the wrong
  // thing with great confidence.
  return cell.width() < 8 || cell.height() < 6 ? QRect() : cell;
}

// From one cell to another on the same row.  Both ends are scrolled into
// sight before either is measured, and the result stays inside the panel.
QRect rowRect(QAbstractItemView* view, const QModelIndex& first,
              const QModelIndex& last, QWidget* window) {
  const QRect b = cellRect(view, last, window);
  const QRect a = cellRect(view, first, window);
  if (a.isEmpty()) {
    return b;
  }
  if (b.isEmpty()) {
    return a;
  }
  const QPoint origin = view->viewport()->mapTo(window, QPoint(0, 0));
  const QRect viewport(origin, view->viewport()->size());
  return a.united(b).intersected(viewport);
}

QWidget* buttonFor(QToolBar* bar, QAction* action) {
  return (bar == 0 || action == 0) ? 0 : bar->widgetForAction(action);
}

}  // namespace

// The tutorial.  The card shows the section and the position: "Registers · 6 / 18".
const EduTutorial::Step EduTutorial::kStepData[] = {
    {EduTutorial::Welcome, "시작", "Start",
     "한림 MIPS 시뮬레이터입니다",
     "MIPS 어셈블리 프로그램을 작성하고, 한 줄씩 실행하며, 레지스터와 메모리가 어떻게 변하는지 보는 프로그램입니다. 예제 "
     "samples/tutorial.s를 열어 함수 안까지 실행해 두었습니다. 화면을 한 곳씩 짚어 가며 어디에 무엇이 있는지 알려 "
     "드립니다.",
     "This is the Hallym MIPS Simulator",
     "You write MIPS assembly here, run it an instruction at a time, and watch "
     "what happens to the registers and to memory. The example "
     "samples/tutorial.s is open and has been run into the middle of a function. "
     "This tutorial points at each part of the screen and says what it is for."},

    {EduTutorial::ToolbarFile, "툴바", "Tool bar",
     "파일 버튼",
     "왼쪽부터 파일 열기(Ctrl+O), 로그 저장, 인쇄입니다. 파일을 열면 시뮬레이터를 비운 뒤 그 프로그램만 올립니다. 버튼에 마우스를 올리면 이름과 단축키가 나옵니다.",
     "The file buttons",
     "From the left: open a file (Ctrl+O), save the log, print. Opening a file "
     "clears the simulator and loads that program on its own. Hovering a "
     "button names it and gives its shortcut."},

    {EduTutorial::ToolbarAssemble, "툴바", "Tool bar",
     "Assemble: 저장하고 어셈블",
     "에디터의 파일을 저장하고 곧바로 어셈블합니다. 키보드로는 Ctrl+S 또는 F3입니다. 어셈블에 성공하면 기계어가 Text 패널에 "
     "나타나고, 실패하면 에디터 아래에 오류 목록이 열립니다.",
     "Assemble: save and build",
     "It saves the file in the editor and assembles it at once; Ctrl+S and F3 do "
     "the same. If it succeeds the machine code appears in the Text panel; if it "
     "fails, the list of errors opens under the editor."},

    {EduTutorial::ToolbarRun, "툴바", "Tool bar",
     "실행 버튼",
     "Run(F5)은 끝까지 또는 다음 브레이크포인트까지, Single Step(F10)은 한 명령만 실행합니다. Pause와 Stop으로 "
     "멈춥니다. 아래에 보이는 것이 Single Step 버튼의 툴팁입니다.",
     "The run buttons",
     "Run (F5) goes to the end or to the next breakpoint, Single Step (F10) runs "
     "one instruction. Pause and Stop halt a program. What you see below is the "
     "tool tip of the Single Step button."},

    {EduTutorial::RegisterGroups, "레지스터", "Registers",
     "레지스터: 두 개의 탭, 여덟 개의 그룹",
     "왼쪽 열이 레지스터입니다. Int Regs 탭이 정수, FP Regs 탭이 부동소수점 레지스터입니다. 정수 레지스터는 Special, "
     "Arguments, Temporaries처럼 쓰임새로 묶여 있고, 그룹 이름에 마우스를 올리면 그 그룹의 용도가 나옵니다.",
     "Registers: two tabs, eight groups",
     "The left column holds the registers: integer ones under the Int Regs tab, "
     "floating point under FP Regs. The integer registers are grouped by what "
     "they are for -- Special, Arguments, Temporaries and so on -- and hovering "
     "a group name says what that group is used for."},

    {EduTutorial::RegisterColumns, "레지스터", "Registers",
     "같은 값을 16진수와 10진수로",
     "밝힌 줄이 스택 포인터 $sp입니다. 지금은 16진수와 10진수로 보고 있습니다. Registers 메뉴에서 2진수로도 바꿀 수 있고, 그때도 이름과 번호 열은 자리에 남습니다. 값을 바꾸려면 그 줄을 두 번 누르세요.",
     "The same value in hexadecimal and decimal",
     "The row lit up is the stack pointer, $sp, shown here in hexadecimal and "
     "in decimal. The Registers menu can switch to binary as well, and the "
     "name and number columns stay put when it does. Double-click a row to "
     "change a register's value."},

    {EduTutorial::RegisterChanged, "레지스터", "Registers",
     "이번 실행으로 바뀐 값",
     "청록색 굵은 글씨는 방금 실행한 부분이 바꾼 레지스터입니다. $sp는 함수가 스택 프레임을 잡으면서 16 줄었고, $t 레지스터들은 "
     "배열을 도는 동안 바뀌었습니다. 한 번 실행할 때마다 무엇이 움직였는지 바로 보입니다.",
     "What this run changed",
     "Teal and bold marks a register that the run just changed. $sp went down by "
     "sixteen when the function made its stack frame, and the $t registers moved "
     "as the loop walked the array. Every run marks what it touched."},

    {EduTutorial::EditorPanel, "에디터", "Editor",
     "가운데 위: 에디터",
     "소스를 여기서 씁니다. 지금은 튜토리얼의 예제가 읽기 전용으로 들어 있고, 튜토리얼이 끝나면 이 자리에 새 파일과 파일 열기 버튼이 나옵니다. Ctrl+S로 저장과 어셈블을 함께 하고, 어셈블 오류는 아래 목록에 모여 클릭하면 그 줄로 갑니다. Ctrl+휠이나 Ctrl+=로 글자 크기를 바꿉니다.",
     "Top middle: the editor",
     "This is where you write your program. The tutorial's example is in it now, "
     "read-only; when the tutorial ends, a New file and an Open file button take "
     "its place. Ctrl+S saves and assembles in one step, assembler errors "
     "gather in a list below and clicking one jumps to its line, and "
     "Ctrl+wheel or Ctrl+= changes the text size."},

    {EduTutorial::ConsoleTab, "콘솔", "Console",
     "가운데 아래: Console 탭",
     "프로그램이 출력하는 곳입니다. 예제를 끝까지 실행하면 여기에 Array sum: 55가 찍힙니다. read_int나 "
     "read_string처럼 입력을 기다리는 syscall을 만나면 이 탭이 저절로 앞으로 나오고, 그때 타이핑한 내용이 프로그램으로 "
     "들어갑니다.",
     "Bottom middle: the Console tab",
     "This is where your program's output appears; run the example to the end "
     "and Array sum: 55 shows up here. When the program reaches a syscall that "
     "waits for input, such as read_int or read_string, this tab comes forward "
     "by itself and what you type goes into the program."},

    {EduTutorial::MessagesTab, "콘솔", "Console",
     "Messages 탭: 시뮬레이터의 기록",
     "무엇을 불러왔는지, 어셈블이나 실행에서 어떤 오류가 났는지가 여기에 쌓입니다. 오류가 나면 이 탭이 저절로 앞으로 나오고, 다른 탭을 "
     "보고 있을 때 새 메시지가 오면 탭에 점이 붙습니다. Ctrl+L로 이 패널 전체를 접었다 펼 수 있습니다.",
     "The Messages tab: the simulator's log",
     "What was loaded, and every assembler or run-time error, collects here. An "
     "error brings this tab forward by itself, and a message that arrives while "
     "you are on another tab puts a dot on it. Ctrl+L folds the whole panel away "
     "and back."},

    {EduTutorial::TextColumns, "Text", "Text",
     "오른쪽 위: Text 패널",
     "어셈블된 프로그램이 명령어 한 줄에 한 행씩 놓입니다. 밝힌 칸은 함수를 부르는 jal 명령의 기계어(Code)와 "
     "형식(Type)입니다. 오른쪽 Source 열은 그 명령이 나온 소스 줄입니다.",
     "Top right: the Text panel",
     "The assembled program, one row per instruction. The cells lit up are the "
     "machine word and the format of the jal that calls the function, and the "
     "Source column on the right is the line of your file it came from."},

    {EduTutorial::TextBadge, "Text", "Text",
     "R·I·J 형식 배지",
     "명령마다 형식을 배지로 붙였습니다. 밝힌 것은 차례로 jal(J 형식), beq(I 형식), 레지스터끼리 더하는 R 형식입니다. "
     "배지에 마우스를 올리면 그 형식이 무엇인지 나옵니다.",
     "The R / I / J badges",
     "Every instruction carries its format as a badge. Lit up here: the jal (a "
     "J), the beq (an I) and a register-to-register add (an R). Hovering a badge "
     "says what that format means."},

    {EduTutorial::TextPcAndBreakpoints, "Text", "Text",
     "다음에 실행할 줄과 브레이크포인트",
     "파란 막대가 붙은 줄이 지금 PC가 가리키는 명령, 곧 다음에 실행될 루프의 beq입니다. 맨 왼쪽 BP 칸을 누르면 그 명령에 "
     "브레이크포인트가 걸리고 Run이 거기서 멈춥니다. 밝힌 BP 칸은 루프를 되돌리는 j 명령의 것입니다.",
     "The next instruction, and breakpoints",
     "The row with the blue bar is where the program counter is: the beq at the "
     "top of the loop, which runs next. Clicking a cell in the BP column sets a "
     "breakpoint there and Run stops on it; the cell lit up belongs to the j "
     "that closes the loop."},

    {EduTutorial::InspectorBits, "인스펙터", "Inspector",
     "오른쪽 아래: Instruction Inspector",
     "Text 패널에서 고른 명령을 32비트로 펼쳐 보여 줍니다. 왼쪽이 MSB(31번 비트), 오른쪽이 LSB(0번 비트)이고, 색이 "
     "다른 묶음이 각각 하나의 필드입니다. 아래에는 필드마다 비트 범위와 2진수, 값, 뜻이 있고, 분기나 점프면 목적지 계산식까지 "
     "나옵니다.",
     "Bottom right: the Instruction Inspector",
     "It spreads the instruction selected in the Text panel over its thirty-two "
     "bits: MSB (bit 31) on the left, LSB (bit 0) on the right, and each "
     "coloured group is one field. Under the grid every field gives its bit "
     "range, its bits, its value and what that value means, and for a branch or "
     "a jump the sum that produced its destination."},

    {EduTutorial::DataWords, "Data", "Data",
     "Data 탭: 주소와 네 개의 워드",
     "Text 옆의 Data 탭이 메모리입니다. 한 줄이 16바이트이고, 왼쪽이 그 줄의 시작 주소, +0부터 +C까지가 네 개의 "
     "워드입니다. 밝힌 줄은 예제의 배열 nums로, 값이 7, 11, 5, 23입니다.",
     "The Data tab: an address and four words",
     "The Data tab beside Text is memory. Each row is sixteen bytes: the address "
     "it starts at on the left, then the words at +0 to +C. The row lit up is "
     "the example's array nums, holding 7, 11, 5 and 23."},

    {EduTutorial::DataLabels, "Data", "Data",
     "Labels 열과 값이 바뀌는 곳",
     "Labels 열은 소스에서 그 주소에 붙인 이름을 보여 줍니다. total은 루프가 한 번 돌 때마다 sw로 갱신하는 자리이고, "
     "지금은 두 번 더한 값 18이 들어 있습니다. 셀에 마우스를 올리면 주소와 값을 16진수와 10진수로 함께 보여 줍니다.",
     "The Labels column, and a value being written",
     "The Labels column gives the names your source put at those addresses. "
     "total is where the sw inside the loop writes each time round, and right "
     "now it holds 18, the first two elements. Hovering a cell shows its address "
     "and its value in hexadecimal and decimal."},

    {EduTutorial::DataString, "Data", "Data",
     "문자열과 ASCII 열",
     "prompt는 .asciiz 문자열입니다. 워드 열은 바이트를 16진수로, ASCII 열은 같은 바이트를 글자로 보여 주어 문자열이 "
     "메모리에 어떻게 놓이는지 한눈에 보입니다. 출력할 수 없는 바이트는 점으로 나옵니다.",
     "A string, and the ASCII column",
     "prompt is an .asciiz string. The word columns show the bytes in "
     "hexadecimal and the ASCII column shows those same bytes as characters, so "
     "you can see how a string sits in memory. A byte that does not print shows "
     "as a dot."},

    {EduTutorial::DataStack, "Data", "Data",
     "스택과 $sp가 가리키는 곳",
     "함수가 프레임을 잡아 $sp가 16바이트 내려왔습니다. 밝힌 네 워드가 그 프레임이고, 위쪽 두 워드에 돌아갈 주소 $ra와 부른 "
     "쪽의 $s0 값 42가 저장되어 있습니다. 위쪽 $sp 단추를 누르면 언제든 이 자리로 옵니다.",
     "The stack, and where $sp points",
     "The function made a frame, so $sp has come down by sixteen bytes. The four "
     "words lit up are that frame: the upper two hold the return address and the "
     "caller's $s0, 42. The $sp button above jumps here at any time."},

    {EduTutorial::DataEnvironment, "Data", "Data",
     "환경변수 영역은 접어 둔다",
     "스택 위쪽의 프로그램 인자와 환경변수 영역은 수천 바이트라서 접어 두었습니다. 눌러서 펼칠 수 있고, 커널 영역도 같은 방식입니다.",
     "The environment is folded away",
     "The program arguments and the environment above the stack run to thousands "
     "of bytes, so they start folded up. Click to unfold them; the kernel areas "
     "work the same way."},

    {EduTutorial::Finish, "마무리", "Finish",
     "준비되었습니다",
     "창이 좁으면 Window > Layout에서 에디터·Text·Data를 한자리에 모을 수 있고, "
     "Window > 화면 배치 초기화는 처음 배치로 되돌립니다. 안내문은 Help > User Guide, "
     "이 튜토리얼은 Help > Tutorial입니다. 끝내면 예제는 닫히고 "
     "[새 파일] / [파일 열기] 시작 화면으로 돌아갑니다 — 예제가 사라진 것이 아니라 "
     "여러분의 파일을 쓸 차례입니다.",
     "You are ready",
     "If the window is narrow, Window > Layout can put the editor, Text and "
     "Data in one place, and Window > Reset Layout brings the first "
     "arrangement back. The written guide is Help > User Guide and this "
     "tutorial is Help > Tutorial. When you finish, the example closes and "
     "the [New file] / [Open file] screen comes back -- the example has not "
     "been lost, it is your turn to write one."},
};

const int EduTutorial::kStepCount =
    int(sizeof(EduTutorial::kStepData) / sizeof(EduTutorial::kStepData[0]));

bool EduTutorial::systemIsKorean() {
  return QLocale::system().language() == QLocale::Korean;
}

EduTutorial::EduTutorial(SpimView* window)
    : QWidget(0, Qt::Tool | Qt::FramelessWindowHint |
                     Qt::WindowStaysOnTopHint | Qt::NoDropShadowWindowHint),
      window_(window),
      current_(0),
      korean_(systemIsKorean()),
      programLoaded_(false),
      running_(false),
      side_(edu::CardCentre),
      card_(new QFrame(this)),
      title_(new QLabel(card_)),
      body_(new QLabel(card_)),
      progress_(new QLabel(card_)),
      language_(new QPushButton(card_)),
      skip_(new QPushButton(card_)),
      back_(new QPushButton(card_)),
      next_(new QPushButton(card_)),
      follow_(new QTimer(this)) {
  setObjectName("EduTutorial");
  setFocusPolicy(Qt::StrongFocus);
  // Over the window, never in front of it in the task bar, and never
  // stealing the focus from what the student is typing into.
  setAttribute(Qt::WA_TranslucentBackground);
  setAttribute(Qt::WA_ShowWithoutActivating);
  // Pressing a button on the card must not take the focus from the main
  // window: a window manager that honours this keeps the whole question of
  // "who is active" away from the tutorial.
  setAttribute(Qt::WA_X11DoNotAcceptFocus);
  hide();

  card_->setObjectName("EduTutorialCard");
  card_->setFixedWidth(kCardWidth);
  // Opaque whatever the platform makes of the overlay underneath: the dim is
  // painted around the card, and the card fills its own background.
  card_->setAutoFillBackground(true);
  QPalette cardPalette = card_->palette();
  cardPalette.setColor(QPalette::Window, color(kWhite));
  cardPalette.setColor(QPalette::Base, color(kWhite));
  card_->setPalette(cardPalette);

  title_->setObjectName("EduTutorialTitle");
  title_->setWordWrap(true);
  body_->setObjectName("EduTutorialBody");
  body_->setWordWrap(true);
  progress_->setObjectName("EduTutorialProgress");
  language_->setObjectName("EduTutorialLanguage");
  language_->setFlat(true);
  language_->setCursor(Qt::PointingHandCursor);
  skip_->setObjectName("EduTutorialSkip");
  back_->setObjectName("EduTutorialBack");
  next_->setObjectName("EduTutorialNext");
  next_->setDefault(true);
  QAbstractButton* const buttons[] = {language_, skip_, back_, next_};
  for (unsigned i = 0; i < sizeof(buttons) / sizeof(buttons[0]); i += 1) {
    buttons[i]->setFocusPolicy(Qt::NoFocus);
  }

  // The card's own text is the main thing on the screen while the tutorial is
  // up, so none of it is set in a grey: the body is the same weight and
  // darkness as the text in the editor beside it.
  QFont titleFont = uiFont();
  titleFont.setPixelSize(kCardTitleSize);
  titleFont.setWeight(QFont::Bold);
  title_->setFont(titleFont);
  QFont bodyFont = uiFont();
  bodyFont.setPixelSize(kCardBodySize);
  bodyFont.setWeight(QFont::DemiBold);
  body_->setFont(bodyFont);
  QFont smallFont = uiFont();
  smallFont.setPixelSize(kFontSmall);
  smallFont.setWeight(QFont::DemiBold);
  progress_->setFont(smallFont);
  language_->setFont(smallFont);

  card_->setStyleSheet(
      QString("QFrame#EduTutorialCard { background: %1; border: 1px solid %2;"
              " border-radius: 8px; }"
              "QLabel#EduTutorialTitle { color: %3; background: %1; }"
              "QLabel#EduTutorialBody { color: %4; background: %1; }"
              "QLabel#EduTutorialProgress { color: %5; background: %1; }"
              "QPushButton#EduTutorialLanguage { color: %7; border: none;"
              " padding: 2px 4px; background: %1; font-weight: 600; }"
              "QPushButton#EduTutorialLanguage:hover { color: %3; }"
              "QPushButton { background: %1; color: %3; border: 1px solid %2;"
              " border-radius: 4px; padding: 5px 14px; font-weight: 600; }"
              "QPushButton:hover { background: %6; }"
              "QPushButton#EduTutorialNext { background: %7; color: %1;"
              " border-color: %7; font-weight: 600; }"
              "QPushButton#EduTutorialNext:hover { background: %3;"
              " border-color: %3; }")
          .arg(hex(kWhite), hex(kBorder), hex(kNavy), hex(kTextLog),
               hex(kText2), hex(kHover), hex(kBlue)));

  QHBoxLayout* head = new QHBoxLayout;
  head->setContentsMargins(0, 0, 0, 0);
  head->setSpacing(kSpace2);
  head->addWidget(title_, 1);
  head->addWidget(language_, 0, Qt::AlignTop);

  QHBoxLayout* foot = new QHBoxLayout;
  foot->setContentsMargins(0, 0, 0, 0);
  foot->setSpacing(kSpace2);
  foot->addWidget(progress_);
  foot->addStretch(1);
  foot->addWidget(skip_);
  foot->addWidget(back_);
  foot->addWidget(next_);

  QVBoxLayout* layout = new QVBoxLayout(card_);
  layout->setContentsMargins(kSpace4, kSpace4, kSpace4, kSpace4);
  layout->setSpacing(kSpace3);
  layout->addLayout(head);
  layout->addWidget(body_);
  layout->addLayout(foot);

  connect(skip_, SIGNAL(clicked()), this, SLOT(finish()));
  connect(back_, SIGNAL(clicked()), this, SLOT(back()));
  connect(next_, SIGNAL(clicked()), this, SLOT(next()));
  connect(language_, SIGNAL(clicked()), this, SLOT(toggleLanguage()));

  // A panel can be dragged, or a tab raised, while the tutorial is up.
  connect(follow_, SIGNAL(timeout()), this, SLOT(reposition()));
  connect(qApp, SIGNAL(applicationStateChanged(Qt::ApplicationState)), this,
          SLOT(updateForActivation()));
  window_->installEventFilter(this);
}

void EduTutorial::setProgramLoaded(bool loaded) { programLoaded_ = loaded; }

QString EduTutorial::titleText() const { return title_->text(); }

QString EduTutorial::bodyText() const { return bodyPlain_; }

void EduTutorial::setKorean(bool korean) {
  if (korean_ == korean || steps_.isEmpty()) {
    korean_ = korean;
    return;
  }
  korean_ = korean;
  showStep(current_);
}

QRect EduTutorial::cardRect() const { return card_->geometry(); }

QString EduTutorial::stepName(int index) const {
  if (index < 0 || index >= steps_.size()) {
    return QString();
  }
  return QString::fromUtf8(steps_.at(index).sectionEn) + "/" +
         QString::fromUtf8(steps_.at(index).titleEn);
}

//
// What each step lights up
//

QRect EduTutorial::rectOf(QWidget* widget) const {
  if (widget == 0 || !widget->isVisible()) {
    return QRect();
  }
  const QRect inWindow(widget->mapTo(window_, QPoint(0, 0)), widget->size());
  // Grow first, then clip: an empty rectangle grown by two pixels would be a
  // four-pixel box in the corner, which is not a panel.
  const QRect spot = inWindow.adjusted(-2, -2, 2, 2).intersected(rect());
  return (spot.width() < kMinSpot || spot.height() < kMinSpot) ? QRect() : spot;
}

bool EduTutorial::dockIsOpen(const char* name) const {
  QDockWidget* dock = window_->findChild<QDockWidget*>(name);
  return dock != 0 && (dock->toggleViewAction() == 0 ||
                       dock->toggleViewAction()->isChecked());
}

void EduTutorial::raiseDock(const char* name) const {
  QDockWidget* dock = window_->findChild<QDockWidget*>(name);
  if (dock == 0) {
    return;
  }
  if (!dock->isVisible() || dock->visibleRegion().isEmpty()) {
    // Qt parks a tab that is not current off-screen, so its geometry is only
    // right once the raise has been through the event loop; show() is what
    // makes it the current tab, raise() alone does not.
    dock->show();
    dock->raise();
    QApplication::processEvents(QEventLoop::ExcludeUserInputEvents);
  }
}

//
// Finding what to point at.  Every target is found by label, by address or
// by mnemonic -- never by row number, so editing the example moves the
// spotlight with it instead of lighting up the wrong thing.  A step that
// cannot find its target says so and is left out.
//

bool EduTutorial::labelAddress(const char* name, quint32* address) const {
  EduDataModel* model = window_->eduDataModel;
  return model != 0 &&
         model->labels().find(QString::fromLatin1(name), address);
}

int EduTutorial::textRowOfAddress(quint32 address) const {
  EduTextModel* model = window_->eduTextModel;
  return model == 0 ? -1 : model->rowOfAddress(address);
}

// The first instruction whose text starts with this mnemonic and, when one
// is given, names that label: "jal" mentioning "sum_array" is the example's
// own call, not the start-up code's call to main.  "j" does not match
// "jal": the space is part of the comparison.
int EduTutorial::textRowOfMnemonic(const QString& mnemonic,
                                   const QString& mentioning) const {
  EduTextModel* model = window_->eduTextModel;
  if (model == 0) {
    return -1;
  }
  for (int r = 0; r < model->rowCount(); r += 1) {
    const QModelIndex index = model->index(r, EduTextModel::InstructionColumn);
    if (index.data(EduTextModel::RowKindRole).toInt() !=
        int(EduTextModel::InstructionRow)) {
      continue;
    }
    const QString text = index.data(Qt::DisplayRole).toString().trimmed();
    if (text != mnemonic && !text.startsWith(mnemonic + " ")) {
      continue;
    }
    if (mentioning.isEmpty() || text.contains(mentioning)) {
      return r;
    }
  }
  return -1;
}

QRect EduTutorial::textCell(int row, int column) const {
  EduTextModel* model = window_->eduTextModel;
  if (model == 0 || row < 0) {
    return QRect();
  }
  return cellRect(window_->ui->TextSegView, model->index(row, column), window_);
}

QRect EduTutorial::textRowRect(int row, int firstColumn,
                               int lastColumn) const {
  EduTextModel* model = window_->eduTextModel;
  if (model == 0 || row < 0) {
    return QRect();
  }
  return rowRect(window_->ui->TextSegView, model->index(row, firstColumn),
                 model->index(row, lastColumn), window_);
}

// The word at that address, unfolding the segment it is in first.
QRect EduTutorial::dataCellAt(quint32 address) const {
  EduDataModel* model = window_->eduDataModel;
  if (model == 0 || window_->ui->DataSegPanel == 0) {
    return QRect();
  }
  const QModelIndex index = model->reveal(address);
  if (!index.isValid()) {
    return QRect();
  }
  return cellRect(window_->ui->DataSegPanel->view(), index, window_);
}

QRect EduTutorial::dataLabelCellAt(quint32 address) const {
  EduDataModel* model = window_->eduDataModel;
  if (model == 0 || window_->ui->DataSegPanel == 0) {
    return QRect();
  }
  const QModelIndex word = model->reveal(address);
  if (!word.isValid()) {
    return QRect();
  }
  return cellRect(window_->ui->DataSegPanel->view(),
                  model->index(word.row(), EduDataModel::LabelColumn), window_);
}

// The value of one register, as its own row: the hexadecimal and the
// decimal cell together.
QRect EduTutorial::registerRowRect(const char* name) const {
  EduRegisterModel* model = window_->eduRegisterModel;
  edu::RegisterRef reg;
  if (model == 0 || !edu::findRegister(name, &reg)) {
    return QRect();
  }
  const QModelIndex index = model->indexOf(reg);
  if (!index.isValid()) {
    return QRect();
  }
  window_->ui->IntRegView->expand(index.parent());
  return rowRect(window_->ui->IntRegView,
                 model->index(index.row(), EduRegisterModel::NameColumn,
                              index.parent()),
                 model->index(index.row(), EduRegisterModel::DecimalColumn,
                              index.parent()),
                 window_);
}

// One tab of a dock or of the bottom panel, by the name on it.
QRect EduTutorial::tabBarRect(const QString& title) const {
  const QList<QTabBar*> bars = window_->findChildren<QTabBar*>();
  for (int b = 0; b < bars.size(); b += 1) {
    QTabBar* bar = bars.at(b);
    if (!bar->isVisible()) {
      continue;
    }
    for (int t = 0; t < bar->count(); t += 1) {
      if (!bar->tabText(t).startsWith(title)) {
        continue;
      }
      const QRect tab = bar->tabRect(t);
      if (tab.isEmpty()) {
        return QRect();
      }
      return tab.translated(bar->mapTo(window_, QPoint(0, 0)))
          .adjusted(-2, -2, 2, 2)
          .intersected(rect());
    }
  }
  return QRect();
}

bool EduTutorial::collectSpots(StepId id, QList<QRect>* spots, QString* tip,
                               QRect* tipAnchor) {
  Ui::SpimView* ui = window_->ui;
  spots->clear();
  tip->clear();
  *tipAnchor = QRect();

  switch (id) {
    case Welcome:
    case Finish:
      return true;

    case ToolbarFile:
    case ToolbarAssemble:
    case ToolbarRun: {
      QAction* file[] = {ui->action_File_Reload, ui->action_File_SaveLog,
                         ui->action_File_Print, ui->action_File_Print};
      QAction* run[] = {ui->action_Sim_Run, ui->action_Sim_Pause,
                        ui->action_Sim_Stop, ui->action_Sim_SingleStep};
      QRect united;
      if (id == ToolbarAssemble) {
        united = rectOf(buttonFor(
            ui->toolBar, window_->findChild<QAction*>("action_Edu_Assemble")));
      } else {
        QAction** group = (id == ToolbarFile) ? file : run;
        for (int i = 0; i < 4; i += 1) {
          const QRect one = rectOf(buttonFor(ui->toolBar, group[i]));
          united = united.isEmpty() ? one : united.united(one);
        }
      }
      if (united.isEmpty()) {
        return false;
      }
      *spots << united;
      if (id == ToolbarRun) {  // show the tool tip instead of describing it
        const QRect one =
            rectOf(buttonFor(ui->toolBar, ui->action_Sim_SingleStep));
        if (!one.isEmpty()) {
          *tip = ui->action_Sim_SingleStep->toolTip();
          *tipAnchor = one;
        }
      }
      return true;
    }

    case RegisterGroups: {
      raiseDock("IntRegDockWidget");
      const QRect tabs = tabBarRect("Int Regs");
      EduRegisterModel* model = window_->eduRegisterModel;
      if (model == 0) {
        return false;
      }
      QModelIndex group;
      for (int g = 0; g < model->rowCount(); g += 1) {
        const QModelIndex candidate = model->index(g, 0);
        if (candidate.data(Qt::DisplayRole).toString().startsWith("Temp")) {
          group = candidate;
          break;
        }
      }
      if (!group.isValid()) {
        return false;
      }
      const QRect r = rowRect(
          ui->IntRegView, group,
          model->index(group.row(), EduRegisterModel::DecimalColumn), window_);
      if (r.isEmpty()) {
        return false;
      }
      *spots << r;
      if (!tabs.isEmpty()) {
        *spots << tabs;
      }
      *tip = group.data(Qt::ToolTipRole).toString();
      *tipAnchor = r;
      return true;
    }

    // The two columns, on a register that has a value worth reading: the
    // stack pointer, which the example's function has moved.
    case RegisterColumns: {
      raiseDock("IntRegDockWidget");
      const QRect row = registerRowRect("sp");
      if (row.isEmpty()) {
        return false;
      }
      *spots << row;
      QHeaderView* header = ui->IntRegView->header();
      const QRect base =
          sectionRect(header, EduRegisterModel::BaseColumn, window_);
      const QRect dec =
          sectionRect(header, EduRegisterModel::DecimalColumn, window_);
      if (!base.isEmpty()) {
        *spots << base.intersected(rect());
      }
      if (!dec.isEmpty()) {
        *spots << dec.intersected(rect());
      }
      return true;
    }

    // The registers the run actually changed: $sp, moved by the stack
    // frame, and the first temporary the loop touched.
    case RegisterChanged: {
      raiseDock("IntRegDockWidget");
      EduRegisterModel* model = window_->eduRegisterModel;
      if (model == 0) {
        return false;
      }
      const char* const wanted[] = {"sp", "t0", "t1", "t2", "t3", "s0", "v0"};
      for (unsigned i = 0; i < sizeof(wanted) / sizeof(wanted[0]); i += 1) {
        edu::RegisterRef reg;
        if (!edu::findRegister(wanted[i], &reg) || !model->isChanged(reg)) {
          continue;
        }
        const QRect row = registerRowRect(wanted[i]);
        if (!row.isEmpty()) {
          *spots << row;
        }
        if (spots->size() == 2) {
          break;
        }
      }
      return !spots->isEmpty();
    }

    // The bottom panel: what the program printed, and the simulator's log.
    case ConsoleTab:
    case MessagesTab: {
      if (window_->eduBottom == 0 || window_->eduBottom->isHidden()) {
        return false;
      }
      if (id == ConsoleTab) {
        window_->eduBottom->showConsole(false);
      } else {
        window_->eduBottom->showMessages();
      }
      QApplication::processEvents(QEventLoop::ExcludeUserInputEvents);
      const QRect panel = rectOf(window_->eduBottom);
      if (panel.isEmpty()) {
        return false;
      }
      *spots << panel;
      const QRect tab = tabBarRect(id == ConsoleTab ? "Console" : "Messages");
      if (!tab.isEmpty()) {
        *spots << tab;
      }
      return true;
    }

    // The inspector, with the instruction the program counter is on
    // actually selected, so what it shows belongs to what is lit up.
    case InspectorBits: {
      if (!dockIsOpen("InspectorDockWidget")) {
        return false;
      }
      QRect row;
      EduTextModel* model = window_->eduTextModel;
      if (model != 0 && dockIsOpen("TextSegDockWidget")) {
        raiseDock("TextSegDockWidget");
        const int r = textRowOfAddress(model->currentPc());
        if (r >= 0) {
          ui->TextSegView->setCurrentIndex(
              model->index(r, EduTextModel::InstructionColumn));
          QApplication::processEvents(QEventLoop::ExcludeUserInputEvents);
          row = textRowRect(r, EduTextModel::BpColumn,
                            EduTextModel::InstructionColumn);
        }
      }
      raiseDock("InspectorDockWidget");
      const QRect inspector = rectOf(window_->eduInspector);
      if (inspector.isEmpty()) {
        return false;
      }
      *spots << inspector;
      if (!row.isEmpty()) {
        *spots << row;
      }
      return true;
    }

    case TextColumns:
    case TextBadge:
    case TextPcAndBreakpoints: {
      if (!programLoaded_ || !dockIsOpen("TextSegDockWidget")) {
        return false;
      }
      raiseDock("TextSegDockWidget");
      EduTextView* view = ui->TextSegView;
      EduTextModel* model = window_->eduTextModel;
      QHeaderView* header = view->horizontalHeader();
      // The example's own call, with the start-up code's "jal main" as a
      // fallback if the example was changed.
      int call = textRowOfMnemonic("jal", "sum_array");
      if (call < 0) {
        call = textRowOfMnemonic("jal");
      }

      if (id == TextColumns) {
        const QRect code = textCell(call, EduTextModel::CodeColumn);
        const QRect type = textCell(call, EduTextModel::TypeColumn);
        if (code.isEmpty() || type.isEmpty()) {
          return false;
        }
        *spots << code.adjusted(-2, -1, 2, 1) << type.adjusted(-3, -1, 3, 1);
        const QRect codeHead =
            sectionRect(header, EduTextModel::CodeColumn, window_);
        const QRect typeHead =
            sectionRect(header, EduTextModel::TypeColumn, window_);
        if (!codeHead.isEmpty()) {
          *spots << codeHead.intersected(rect());
        }
        if (!typeHead.isEmpty()) {
          *spots << typeHead.intersected(rect());
        }
        return true;
      }

      if (id == TextBadge) {
        const int rows[] = {call, textRowOfMnemonic("beq"),
                            textRowOfMnemonic("addu")};
        for (unsigned i = 0; i < sizeof(rows) / sizeof(rows[0]); i += 1) {
          const QRect badge = textCell(rows[i], EduTextModel::TypeColumn);
          if (!badge.isEmpty()) {
            *spots << badge.adjusted(-3, -1, 3, 1);
          }
        }
        if (spots->isEmpty()) {
          return false;
        }
        if (call >= 0) {
          const QModelIndex badge =
              model->index(call, EduTextModel::TypeColumn);
          *tip = badge.data(Qt::ToolTipRole).toString();
          *tipAnchor = spots->first();
        }
        return true;
      }

      // Where the program counter is, and one real breakpoint cell: the
      // one belonging to the jump that closes the loop.
      const int pc = textRowOfAddress(model->currentPc());
      const QRect line =
          textRowRect(pc, EduTextModel::BpColumn, EduTextModel::SourceColumn);
      if (line.isEmpty()) {
        return false;
      }
      *spots << line;
      const QRect bp = textCell(textRowOfMnemonic("j"), EduTextModel::BpColumn);
      if (!bp.isEmpty()) {
        *spots << bp.adjusted(-2, -1, 2, 1);
      }
      return true;
    }

    case DataWords:
    case DataLabels:
    case DataString:
    case DataStack:
    case DataEnvironment: {
      if (!programLoaded_ || !dockIsOpen("DataSegDockWidget")) {
        return false;
      }
      raiseDock("DataSegDockWidget");
      EduDataView* view = ui->DataSegPanel->view();
      EduDataModel* model = window_->eduDataModel;

      // The array: the address the row starts at and its four words.
      if (id == DataWords) {
        quint32 nums = 0;
        if (!labelAddress("nums", &nums)) {
          return false;
        }
        const QModelIndex word = model->reveal(nums);
        if (!word.isValid()) {
          return false;
        }
        const QRect address = cellRect(
            view, model->index(word.row(), EduDataModel::AddressColumn),
            window_);
        QRect words;
        for (int c = EduDataModel::Word0Column; c <= EduDataModel::Word3Column;
             c += 1) {
          const QRect cell =
              cellRect(view, model->index(word.row(), c), window_);
          words = words.isEmpty() ? cell : words.united(cell);
        }
        if (address.isEmpty() && words.isEmpty()) {
          return false;
        }
        if (!address.isEmpty()) {
          *spots << address.adjusted(-2, -1, 2, 1);
        }
        if (!words.isEmpty()) {
          *spots << words.adjusted(-2, -1, 2, 1);
        }
        return true;
      }

      // The names in the Labels column, and the word the loop keeps
      // writing to.
      if (id == DataLabels) {
        quint32 total = 0;
        quint32 nums = 0;
        if (!labelAddress("total", &total)) {
          return false;
        }
        const QRect totalLabel = dataLabelCellAt(total);
        const QRect totalWord = dataCellAt(total);
        if (totalLabel.isEmpty() && totalWord.isEmpty()) {
          return false;
        }
        if (!totalWord.isEmpty()) {
          *spots << totalWord.adjusted(-2, -1, 2, 1);
        }
        if (!totalLabel.isEmpty()) {
          *spots << totalLabel.adjusted(-2, -1, 2, 1);
        }
        if (labelAddress("nums", &nums)) {
          const QRect numsLabel = dataLabelCellAt(nums);
          if (!numsLabel.isEmpty() && numsLabel != totalLabel) {
            *spots << numsLabel.adjusted(-2, -1, 2, 1);
          }
        }
        return true;
      }

      // The string, as bytes and as characters.
      if (id == DataString) {
        quint32 prompt = 0;
        if (!labelAddress("prompt", &prompt)) {
          return false;
        }
        const QModelIndex word = model->reveal(prompt);
        if (!word.isValid()) {
          return false;
        }
        const QRect ascii = cellRect(
            view, model->index(word.row(), EduDataModel::AsciiColumn), window_);
        QRect words;
        for (int c = EduDataModel::Word0Column; c <= EduDataModel::Word3Column;
             c += 1) {
          const QRect cell =
              cellRect(view, model->index(word.row(), c), window_);
          words = words.isEmpty() ? cell : words.united(cell);
        }
        if (ascii.isEmpty() && words.isEmpty()) {
          return false;
        }
        if (!words.isEmpty()) {
          *spots << words.adjusted(-2, -1, 2, 1);
        }
        if (!ascii.isEmpty()) {
          *spots << ascii.adjusted(-2, -1, 2, 1);
        }
        return true;
      }

      // The frame the function made: the row $sp points at, and the two
      // words saved in it.
      if (id == DataStack) {
        edu::RegisterRef sp;
        if (!edu::findRegister("sp", &sp)) {
          return false;
        }
        const quint32 pointer = EduRegisterModel::readRegister(sp);
        ui->DataSegPanel->goTo("$sp");
        QApplication::processEvents(QEventLoop::ExcludeUserInputEvents);
        const QRect marker = dataLabelCellAt(pointer);
        // The frame itself, from $sp up: four words for the example's
        // sixteen-byte frame, wherever inside it the saved values sit.  A
        // frame straddles two rows of sixteen bytes as often as not, and
        // one rectangle around both would cover words outside it, so each
        // row is lit on its own.
        QList<QRect> frame;
        int lastRow = -1;
        for (int offset = 0; offset < 16; offset += 4) {
          const quint32 address = pointer + quint32(offset);
          const QModelIndex word = model->reveal(address);
          const QRect cell = dataCellAt(address);
          if (!word.isValid() || cell.isEmpty()) {
            continue;
          }
          if (word.row() == lastRow && !frame.isEmpty()) {
            frame.last() = frame.last().united(cell);
          } else {
            frame << cell;
            lastRow = word.row();
          }
        }
        if (marker.isEmpty() && frame.isEmpty()) {
          return false;
        }
        for (int i = 0; i < frame.size(); i += 1) {
          *spots << frame.at(i).adjusted(-2, -1, 2, 1);
        }
        if (!marker.isEmpty()) {
          *spots << marker.adjusted(-2, -1, 2, 1);
        }
        const QRect button =
            rectOf(window_->findChild<QWidget*>("DataGoToSpButton"));
        if (!button.isEmpty()) {
          *spots << button;
        }
        return true;
      }

      for (int r = 0; r < model->rowCount(); r += 1) {
        const QModelIndex fold = model->index(r, EduDataModel::AddressColumn);
        if (fold.data(EduDataModel::RowKindRole).toInt() !=
            int(EduDataModel::EnvironmentFold)) {
          continue;
        }
        const QRect line = rowRect(
            view, fold, model->index(r, EduDataModel::LabelColumn), window_);
        if (!line.isEmpty()) {
          *spots << line;
          return true;
        }
      }
      return false;
    }

    case EditorPanel: {
      if (!dockIsOpen("EditorDockWidget")) {
        return false;
      }
      raiseDock("EditorDockWidget");
      const QRect r = rectOf(window_->eduEditor);
      if (r.isEmpty()) {
        return false;
      }
      *spots << r;
      return true;
    }
  }
  return false;
}

//
// Running the tutorial
//

void EduTutorial::buildSteps() {
  steps_.clear();
  skipped_.clear();
  QList<QRect> spots;
  QString tip;
  QRect anchor;
  for (int i = 0; i < kStepCount; i += 1) {
    const Step& step = kStepData[i];
    if (collectSpots(step.id, &spots, &tip, &anchor)) {
      steps_ << step;
      continue;
    }
    // Nothing to point at -- a closed panel, or an example without the
    // label this step is about.  Left out, and said out loud: a silently
    // shorter tutorial is how a broken spotlight would hide.
    const QString name = QString::fromUtf8(step.sectionEn) + "/" +
                         QString::fromUtf8(step.titleEn);
    skipped_ << name;
    qWarning("tutorial: nothing to point at for %s", qPrintable(name));
  }
}

// The overlay is its own window, so it has to be told where the main window
// is -- in global coordinates, which is what the spots are measured against
// once the two origins are the same.
void EduTutorial::followWindow() {
  const QRect wanted(window_->mapToGlobal(QPoint(0, 0)), window_->size());
  if (geometry() != wanted) {
    setGeometry(wanted);
  }
}

void EduTutorial::start(int step) {
  followWindow();
  show();
  raise();
  // The keys are answered even though this window never takes the focus.
  qApp->installEventFilter(this);
  buildSteps();
  if (steps_.isEmpty()) {
    hide();
    return;
  }
  running_ = true;
  follow_->start(250);
  showStep(qBound(0, step, steps_.size() - 1));
}

void EduTutorial::showStep(int index) {
  current_ = qBound(0, index, steps_.size() - 1);
  const Step& step = steps_.at(current_);

  title_->setText(korean_ ? QString::fromUtf8(step.titleKo)
                          : QString::fromUtf8(step.titleEn));
  const QString body =
      korean_ ? QString::fromUtf8(step.bodyKo) : QString::fromUtf8(step.bodyEn);
  bodyPlain_ = body;
  // A QLabel has no line spacing of its own; rich text does.
  body_->setText(QString("<div style=\"line-height:150%;\">") +
                 body.toHtmlEscaped() + "</div>");
  progress_->setText(
      QString::fromUtf8(korean_ ? step.sectionKo : step.sectionEn) +
      QString::fromUtf8("  \xc2\xb7  ") + QString::number(current_ + 1) + " / " +
      QString::number(steps_.size()));
  language_->setText(
      korean_ ? QString("EN")
              : QString::fromUtf8("\355\225\234\352\265\255\354\226\264"));
  skip_->setText(
      korean_
          ? QString::fromUtf8("\352\261\264\353\204\210\353\233\260\352\270\260")
          : QString("Skip"));
  back_->setText(korean_ ? QString::fromUtf8("\354\235\264\354\240\204")
                         : QString("Back"));
  const bool last = (current_ == steps_.size() - 1);
  if (last) {
    next_->setText(
        korean_
            ? QString::fromUtf8("\354\213\234\354\236\221\355\225\230\352\270\260")
            : QString("Get started"));
  } else {
    next_->setText(korean_ ? QString::fromUtf8("\353\213\244\354\235\214")
                           : QString("Next"));
  }
  back_->setEnabled(current_ > 0);
  skip_->setVisible(!last);

  reposition();
}

// Where the drawn tool tip goes: under what it belongs to, or over it when
// there is no room.  The card is placed clear of it.
QRect EduTutorial::tipBubbleRect() const {
  if (tip_.isEmpty() || tipAnchor_.isEmpty()) {
    return QRect();
  }
  QFont font = uiFont();
  font.setPixelSize(kFontSmall);
  const QFontMetrics metrics(font);
  const QRect text =
      metrics.boundingRect(QRect(0, 0, 300, 400), Qt::TextWordWrap, tip_);
  QRect bubble(0, 0, text.width() + 2 * kSpace2, text.height() + 2 * kSpace1);
  bubble.moveTopLeft(QPoint(tipAnchor_.left(), tipAnchor_.bottom() + 6));
  if (bubble.bottom() > height() - kMargin) {
    bubble.moveBottom(tipAnchor_.top() - 6);
  }
  bubble.moveLeft(
      qBound(kMargin, bubble.left(), width() - kMargin - bubble.width()));
  return bubble;
}

void EduTutorial::placeCard() {
  // The card's width is fixed, so the wrapped labels decide its height.
  // QLabel::sizeHint() does not know that width yet; ask it directly.
  // A window event can reach us between show() and the first step, while
  // both labels are still empty; QLabel then answers -1 and a negative
  // fixed height is a warning and no layout at all.
  const int inner = kCardWidth - 2 * kSpace4;
  title_->setFixedHeight(qMax(
      0, title_->heightForWidth(inner - language_->sizeHint().width() - kSpace2)));
  body_->setFixedHeight(qMax(0, body_->heightForWidth(inner)));
  card_->layout()->activate();
  card_->adjustSize();

  tipBubble_ = tipBubbleRect();
  QRect spot = spots_.isEmpty() ? QRect() : spots_.first();
  if (!spot.isEmpty() && !tipBubble_.isEmpty()) {
    spot = spot.united(tipBubble_);  // the card must not cover the tool tip
  }
  const edu::CardPlacement placed =
      edu::placeTutorialCard(rect(), spot, card_->size(), kMargin, kGap);
  card_->setGeometry(placed.rect);
  side_ = placed.side;
}

void EduTutorial::reposition() {
  if (!isVisible() || steps_.isEmpty()) {
    return;
  }
  followWindow();
  QList<QRect> spots;
  QString tip;
  QRect anchor;
  if (collectSpots(steps_.at(current_).id, &spots, &tip, &anchor)) {
    spots_ = spots;
    tip_ = tip;
    tipAnchor_ = anchor;
  }
  placeCard();
  raise();
  update();
}

//
// Painting
//

void EduTutorial::paintEvent(QPaintEvent*) {
  QPainter painter(this);
  painter.setRenderHint(QPainter::Antialiasing);

  // Everything is dimmed except what the step is about -- and except the
  // card, which stays readable whatever the platform makes of the overlay
  // underneath it.
  QPainterPath dim;
  dim.addRect(rect());
  for (int i = 0; i < spots_.size(); i += 1) {
    QPainterPath hole;
    hole.addRoundedRect(spots_.at(i), 6, 6);
    dim = dim.subtracted(hole);
  }
  QPainterPath cardPath;
  cardPath.addRoundedRect(card_->geometry(), 8, 8);
  painter.fillPath(dim.subtracted(cardPath), QColor(0, 0, 0, kDim));

  painter.setBrush(Qt::NoBrush);
  for (int i = 0; i < spots_.size(); i += 1) {
    painter.setPen(QPen(QColor(kBlue), i == 0 ? 2 : 1));
    painter.drawRoundedRect(QRectF(spots_.at(i)).adjusted(1, 1, -1, -1), 6, 6);
  }

  if (!spots_.isEmpty() && side_ != edu::CardCentre) {
    const QRect card = card_->geometry();
    const QRect spot = spots_.first();
    QPolygonF head;
    if (side_ == edu::CardRight) {
      const int y =
          qBound(card.top() + 12, spot.center().y(), card.bottom() - 12);
      head << QPointF(card.left(), y - kArrow) << QPointF(card.left() - kArrow, y)
           << QPointF(card.left(), y + kArrow);
    } else if (side_ == edu::CardLeft) {
      const int y =
          qBound(card.top() + 12, spot.center().y(), card.bottom() - 12);
      head << QPointF(card.right(), y - kArrow)
           << QPointF(card.right() + kArrow, y)
           << QPointF(card.right(), y + kArrow);
    } else if (side_ == edu::CardBelow) {
      const int x =
          qBound(card.left() + 12, spot.center().x(), card.right() - 12);
      head << QPointF(x - kArrow, card.top()) << QPointF(x, card.top() - kArrow)
           << QPointF(x + kArrow, card.top());
    } else {
      const int x =
          qBound(card.left() + 12, spot.center().x(), card.right() - 12);
      head << QPointF(x - kArrow, card.bottom())
           << QPointF(x, card.bottom() + kArrow)
           << QPointF(x + kArrow, card.bottom());
    }
    painter.setPen(QPen(QColor(kBorder), 1));
    painter.setBrush(QColor(kWhite));
    painter.drawPolygon(head);
  }

  // The tool tip of what is lit, drawn rather than described.
  if (!tipBubble_.isEmpty()) {
    QFont font = uiFont();
    font.setPixelSize(kFontSmall);
    painter.setFont(font);
    const QRect bubble = tipBubble_;
    painter.setPen(Qt::NoPen);
    painter.setBrush(QColor(kNavy));
    painter.drawRoundedRect(bubble, 4, 4);
    painter.setPen(QColor(kWhite));
    painter.drawText(bubble.adjusted(kSpace2, kSpace1, -kSpace2, -kSpace1),
                     Qt::TextWordWrap, tip_);
  }
}

//
// Input
//

bool EduTutorial::handleTutorialKey(int key) {
  switch (key) {
    case Qt::Key_Escape:
      finish();
      return true;
    case Qt::Key_Right:
    case Qt::Key_Return:
    case Qt::Key_Enter:
    case Qt::Key_Space:
      next();
      return true;
    case Qt::Key_Left:
    case Qt::Key_Backspace:
      back();
      return true;
    default:
      return false;
  }
}

void EduTutorial::keyPressEvent(QKeyEvent* event) {
  if (!handleTutorialKey(event->key())) {
    QWidget::keyPressEvent(event);
  }
}

// Clicks anywhere but on the card do nothing: the tutorial is left through its
// own buttons or Escape, never by a stray click.  It does not take the
// focus either -- the keys it answers come through the application filter,
// and taking the focus from the main window is what made the tutorial fight
// the window manager over which window is active.
void EduTutorial::mousePressEvent(QMouseEvent*) {}

// The window manager can close this window (its own close button, Alt+F4).
// That has to be the end of the tutorial, not a hidden window that is still
// running: a running tutorial holds the application filter and comes back the
// next time the program is activated.
void EduTutorial::closeEvent(QCloseEvent* event) {
  finish();
  event->accept();
}

void EduTutorial::resizeEvent(QResizeEvent* event) {
  QWidget::resizeEvent(event);
  reposition();
}

bool EduTutorial::eventFilter(QObject* watched, QEvent* event) {
  if (!isVisible()) {
    return QWidget::eventFilter(watched, event);
  }

  // While the tutorial is up its keys belong to it, wherever the focus is: this
  // window never takes the focus, so without this they would be typed into
  // the editor.
  if (event->type() == QEvent::KeyPress) {
    QKeyEvent* key = static_cast<QKeyEvent*>(event);
    if (key->modifiers() == Qt::NoModifier && handleTutorialKey(key->key())) {
      return true;
    }
  }

  if (watched == window_) {
    switch (event->type()) {
      case QEvent::Resize:
      case QEvent::Move:
        reposition();
        break;
      case QEvent::WindowStateChange:
      case QEvent::Hide:
        // Minimised or put away: the overlay goes with it, and comes back
        // when the window does.
        setVisible(!window_->isMinimized() && window_->isVisible());
        break;
      case QEvent::WindowActivate:
      case QEvent::WindowDeactivate:
        // Not decided here: clicking the card activates the overlay, which
        // deactivates the main window, and hiding on that would end the
        // tutorial at the first press of Next.  Asked again once the new
        // active window is known (updateForActivation()).
        QTimer::singleShot(0, this, SLOT(updateForActivation()));
        break;
      case QEvent::Show:
        show();
        followWindow();
        break;
      default:
        break;
    }
  }
  return QWidget::eventFilter(watched, event);
}

// Whether the tutorial is on screen follows the application, not the window:
// the overlay and the main window are one program to the reader, and only
// something else coming forward should put the tutorial away.
void EduTutorial::updateForActivation() {
  if (!running_) {
    return;  // finished or never started: nothing to bring back
  }
  const bool ours = qApp->applicationState() == Qt::ApplicationActive ||
                    QApplication::activeWindow() == window_ ||
                    QApplication::activeWindow() == this;
  const bool showable = ours && !window_->isMinimized() && window_->isVisible();
  if (showable) {
    if (!isVisible()) {
      show();
    }
    followWindow();
    raise();
  } else if (isVisible()) {
    hide();
  }
}

void EduTutorial::next() {
  if (current_ + 1 >= steps_.size()) {
    finish();
    return;
  }
  showStep(current_ + 1);
}

void EduTutorial::back() {
  if (current_ > 0) {
    showStep(current_ - 1);
  }
}

void EduTutorial::toggleLanguage() {
  korean_ = !korean_;
  showStep(current_);
}

// Every way out of the tutorial comes through here: the last step's button,
// Skip, Escape, and the window manager closing the overlay.  Nothing of
// the tutorial may outlive it -- not the application event filter that takes
// the arrow keys, not the timer that follows the window and puts the
// step's panel back in front, and not the window itself.
void EduTutorial::finish() {
  running_ = false;
  follow_->stop();
  qApp->removeEventFilter(this);
  spots_.clear();
  tip_.clear();
  hide();
  // The overlay is a window of its own; with it gone, the keyboard belongs
  // to the main window again.
  if (window_ != 0 && window_->isVisible()) {
    window_->activateWindow();
  }
  emit closed();
}
