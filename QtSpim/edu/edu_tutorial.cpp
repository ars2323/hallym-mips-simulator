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
#include <QResizeEvent>
#include <QTimer>
#include <QToolBar>
#include <QVBoxLayout>

#include "edu/core/edu_registers.h"
#include "edu/edu_data_model.h"
#include "edu/edu_data_view.h"
#include "edu/edu_editor_dock.h"
#include "edu/edu_inspector.h"
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

// A cell of an item view, scrolled into sight first.
QRect cellRect(QAbstractItemView* view, const QModelIndex& index,
               QWidget* window) {
  if (view == 0 || !index.isValid() || !view->isVisible()) {
    return QRect();
  }
  view->scrollTo(index, QAbstractItemView::EnsureVisible);
  const QRect r = view->visualRect(index);
  if (r.isEmpty()) {
    return QRect();
  }
  return r.translated(view->viewport()->mapTo(window, QPoint(0, 0)));
}

QRect rowRect(QAbstractItemView* view, const QModelIndex& first,
              const QModelIndex& last, QWidget* window) {
  const QRect a = cellRect(view, first, window);
  const QRect b = cellRect(view, last, window);
  if (a.isEmpty()) {
    return QRect();
  }
  return b.isEmpty() ? a : a.united(b);
}

QWidget* buttonFor(QToolBar* bar, QAction* action) {
  return (bar == 0 || action == 0) ? 0 : bar->widgetForAction(action);
}

}  // namespace

// The tour.  The card shows the section and the position: "Registers · 6 / 18".
const EduTutorial::Step EduTutorial::kStepData[] = {
    {EduTutorial::Welcome, "시작", "Start",
     "한림 MIPS 시뮬레이터에 오신 것을 환영합니다",
     "표준 QtSpim과 시뮬레이션 결과는 같고, 화면과 편집 기능이 다릅니다. "
     "무엇이 다른지 화면 위에서 차례대로 짚어 드립니다. 예제 프로그램을 "
     "열어 두었으니 그대로 보시면 됩니다.",
     "Welcome to Hallym MIPS Simulator",
     "Programs assemble and run exactly as in the standard QtSpim; what "
     "changed is the screen and the editing. This tour points at each of "
     "those changes in place. A sample program is already open."},

    {EduTutorial::ToolbarFile, "툴바", "Tool bar",
     "파일 버튼",
     "왼쪽부터 파일 열기, 다시 읽기, 로그 저장, 인쇄입니다. 버튼에 마우스를 "
     "올리면 이름과 단축키가 나옵니다.",
     "The file buttons",
     "From the left: open a file, load it again, save the log, print. "
     "Hovering a button names it and gives its shortcut."},

    {EduTutorial::ToolbarAssemble, "툴바", "Tool bar",
     "Assemble 버튼",
     "에디터의 파일을 저장하고 곧바로 어셈블합니다. Ctrl+S, F3과 같은 "
     "동작입니다. 표준 QtSpim에서는 다른 편집기로 저장한 뒤 File > Load "
     "File을 따로 눌러야 합니다.",
     "The Assemble button",
     "It saves the editor's file and assembles it in one step; Ctrl+S and F3 "
     "do the same. In the standard QtSpim you save in another editor and "
     "then use File > Load File yourself."},

    {EduTutorial::ToolbarRun, "툴바", "Tool bar",
     "실행 버튼",
     "Run(F5), Pause, Stop, Single Step(F10)입니다. 아래에 보이는 것이 "
     "Single Step 버튼의 툴팁입니다.",
     "The run buttons",
     "Run (F5), Pause, Stop and Single Step (F10). What you see below is the "
     "tool tip of the Single Step button."},

    {EduTutorial::RegisterGroups, "레지스터", "Registers",
     "용도별 8개 그룹",
     "레지스터를 Special, Arguments, Temporaries처럼 쓰임새로 묶었습니다. "
     "그룹 이름에 마우스를 올리면 그 그룹이 어떤 용도인지 나옵니다. 표준 "
     "QtSpim은 R0부터 R31까지 한 줄로 늘어놓습니다.",
     "Eight groups by role",
     "The registers are grouped by what they are for: Special, Arguments, "
     "Temporaries and so on. Hovering a group name says what it is used "
     "for. The standard QtSpim lists R0 to R31 in one flat column."},

    {EduTutorial::RegisterColumns, "레지스터", "Registers",
     "16진수와 10진수를 한 번에",
     "Hex 열과 Decimal 열이 나란히 있습니다. 표준 QtSpim은 메뉴에서 고른 "
     "진법 하나만 보여 주어서, 두 값을 함께 보려면 진법을 오가야 합니다.",
     "Hexadecimal and decimal together",
     "The Hex and the Decimal column sit side by side. The standard QtSpim "
     "shows one base at a time, the one picked in its menu, so you switch "
     "back and forth to see both."},

    {EduTutorial::RegisterChanged, "레지스터", "Registers",
     "이번 실행으로 바뀐 값",
     "방금 실행한 명령들이 바꾼 레지스터는 청록색 굵은 글씨입니다. 기준이 "
     "실행을 시작한 시점이라, 한 번 실행할 때마다 무엇이 움직였는지 바로 "
     "보입니다.",
     "What this run changed",
     "A register the instructions just executed have changed is written in "
     "bold teal. The comparison is against the moment the run started, so "
     "each step shows exactly what moved."},

    {EduTutorial::InspectorBits, "인스펙터", "Inspector",
     "고른 것의 비트를 본다",
     "레지스터를 고르면 16진수·10진수와 함께 32비트 2진수가 비트 번호 "
     "눈금과 같이 나옵니다. 명령어나 메모리 워드를 골라도 같은 자리에 "
     "나옵니다. 표준 QtSpim에는 없는 패널입니다.",
     "The bits of whatever is selected",
     "Select a register and its 32 bits appear here under a scale of bit "
     "numbers, next to the hexadecimal and the decimal value. Instructions "
     "and memory words fill the same panel. The standard QtSpim has no such "
     "panel."},

    {EduTutorial::TextColumns, "Text", "Text",
     "기계어와 형식이 따로 있는 열",
     "Code 열은 32비트 기계어, Type 열은 명령어 형식입니다. 표준 QtSpim은 "
     "이 모두를 한 줄의 글로 늘어놓아 눈으로 자리를 맞춰야 합니다.",
     "Columns for the word and the format",
     "The Code column is the 32-bit machine word and the Type column is the "
     "instruction format. The standard QtSpim runs all of this together in "
     "one line of text that you line up by eye."},

    {EduTutorial::TextBadge, "Text", "Text",
     "R · I · J 형식 배지",
     "명령어마다 형식을 배지로 붙였습니다. R은 레지스터끼리, I는 상수가 "
     "붙는 명령, J는 점프입니다. 부동소수점은 FR·FI, 코프로세서 0은 "
     "CP0입니다.",
     "The R / I / J badges",
     "Every instruction carries its format as a badge: R for register to "
     "register, I where a constant is packed in, J for jumps; FR and FI for "
     "floating point and CP0 for coprocessor 0."},

    {EduTutorial::TextFields, "Text", "Text",
     "명령어를 고르면 필드가 분해된다",
     "명령어 행을 고르면 인스펙터가 그 32비트를 opcode·rs·rt·immediate "
     "(또는 rd·shamt·funct)로 잘라 보여 주고, 레지스터 이름과 분기·점프 "
     "목적지까지 계산합니다. 표준 QtSpim은 16진수 한 덩어리로만 "
     "보여 줍니다.",
     "Select an instruction and its fields open up",
     "Pick an instruction row and the inspector cuts its 32 bits into "
     "opcode, rs, rt and immediate (or rd, shamt and funct), names the "
     "registers and works out where a branch or a jump goes. The standard "
     "QtSpim shows the word as hexadecimal and nothing else."},

    {EduTutorial::TextPcAndBreakpoints, "Text", "Text",
     "지금 실행할 명령과 브레이크포인트",
     "옅은 파란 행에 왼쪽 막대가 붙은 것이 지금 PC가 가리키는 명령입니다. "
     "맨 왼쪽 BP 칸을 누르면 그 줄에 브레이크포인트가 걸리고 빨간 점이 "
     "생깁니다.",
     "The next instruction, and breakpoints",
     "The row in pale blue with a bar down its left edge is where the "
     "program counter is. Clicking the BP cell at the left of a row sets a "
     "breakpoint there and leaves a red dot."},

    {EduTutorial::DataHeader, "Data", "Data",
     "주소가 고정된 표",
     "Address 열과 +0·+4·+8·+C 열 제목이 자리에 고정되어 있어 어느 워드를 "
     "보고 있는지 셀 수 있습니다. ASCII 열에는 같은 바이트가 글자로 "
     "나옵니다.",
     "A table with the addresses pinned",
     "The Address column and the +0, +4, +8, +C headings stay in place, so "
     "you can tell which word you are looking at. The ASCII column shows the "
     "same bytes as characters."},

    {EduTutorial::DataLabels, "Data", "Data",
     "Labels 열: 이름이 어느 주소에 있는가",
     "소스에서 선언한 msg, nums 같은 이름이 그 주소의 행에 나옵니다. 표준 "
     "QtSpim은 주소와 값만 보여 주어서, 어느 라벨이 어디인지는 직접 세어야 "
     "합니다.",
     "The Labels column: where a name lives",
     "Names declared in the source, msg or nums, appear on the row of their "
     "address. The standard QtSpim shows addresses and values only, so you "
     "count the offsets yourself."},

    {EduTutorial::DataStack, "Data", "Data",
     "$sp가 가리키는 자리",
     "스택 구역에서 $sp·$fp·$gp가 가리키는 워드에 표시가 붙고, 한 명령씩 "
     "실행하면 따라 움직입니다. 위의 $sp 버튼을 누르면 언제든 그 자리로 "
     "갑니다.",
     "Where $sp points",
     "In the stack the word $sp, $fp or $gp points at is marked, and the "
     "marks follow as you step. The $sp button above jumps to it at any "
     "time."},

    {EduTutorial::DataEnvironment, "Data", "Data",
     "환경변수는 접어 두었습니다",
     "스택 맨 위의 환경변수와 경로는 한 줄로 접혀 있습니다. 표준 QtSpim은 "
     "이것으로 화면을 채우고, 스크린샷에 PC 사용자 이름까지 들어갑니다. "
     "눌러서 펼칠 수 있습니다.",
     "The environment is folded away",
     "The environment strings and paths at the top of the stack are folded "
     "into one line. In the standard QtSpim they fill the panel, and put "
     "your user name into every screenshot. Click the line to unfold it."},

    {EduTutorial::EditorPanel, "에디터", "Editor",
     "에디터가 들어 있습니다",
     "코드를 여기서 쓰고 Ctrl+S를 누르면 저장과 어셈블이 함께 일어납니다. "
     "에러가 있으면 아래 목록에 뜨고, 항목을 누르면 그 줄로 갑니다. 표준 "
     "QtSpim에는 에디터가 없어 다른 프로그램이 필요합니다.",
     "There is an editor",
     "Write the code here and Ctrl+S saves and assembles in one step. "
     "Errors appear in a list below; click one to jump to its line. The "
     "standard QtSpim has no editor, so you need another program."},

    {EduTutorial::Finish, "마무리", "Finish",
     "준비되었습니다",
     "Window > Layout으로 에디터와 Text를 나란히 놓을 수 있고, Ctrl+L로 "
     "아래 메시지 창을 접을 수 있습니다. 안내문은 Help > User Guide, 이 "
     "투어는 Help > Tutorial입니다. 예제가 열려 있으니 그대로 고쳐 보거나 "
     "Simulator > Reinitialize로 비우고 시작하세요.",
     "You are ready",
     "Window > Layout puts the editor and the text panel side by side, and "
     "Ctrl+L folds the message pane away. The written guide is Help > User "
     "Guide and this tour is Help > Tutorial. The sample is still open: "
     "change it, or clear everything with Simulator > Reinitialize."},
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

  QFont titleFont = uiFont();
  titleFont.setPixelSize(kTitlePixelSize);
  titleFont.setWeight(QFont::Bold);
  title_->setFont(titleFont);
  QFont bodyFont = uiFont();
  bodyFont.setPixelSize(kUiPixelSize);
  body_->setFont(bodyFont);
  QFont smallFont = uiFont();
  smallFont.setPixelSize(kFontSmall);
  progress_->setFont(smallFont);
  language_->setFont(smallFont);

  card_->setStyleSheet(
      QString("QFrame#EduTutorialCard { background: %1; border: 1px solid %2;"
              " border-radius: 8px; }"
              "QLabel#EduTutorialTitle { color: %3; background: %1; }"
              "QLabel#EduTutorialBody { color: %4; background: %1; }"
              "QLabel#EduTutorialProgress { color: %5; background: %1; }"
              "QPushButton#EduTutorialLanguage { color: %5; border: none;"
              " padding: 2px 4px; background: %1; }"
              "QPushButton#EduTutorialLanguage:hover { color: %3; }"
              "QPushButton { background: %1; color: %3; border: 1px solid %2;"
              " border-radius: 4px; padding: 5px 14px; font-weight: 600; }"
              "QPushButton:hover { background: %6; }"
              "QPushButton#EduTutorialNext { background: %7; color: %1;"
              " border-color: %7; }"
              "QPushButton#EduTutorialNext:hover { background: %3;"
              " border-color: %3; }")
          .arg(hex(kWhite), hex(kBorder), hex(kNavy), hex(kText), hex(kText2),
               hex(kHover), hex(kBlue)));

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

  // A panel can be dragged, or a tab raised, while the tour is up.
  connect(follow_, SIGNAL(timeout()), this, SLOT(reposition()));
  window_->installEventFilter(this);
}

void EduTutorial::setProgramLoaded(bool loaded) { programLoaded_ = loaded; }

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
      QAction* file[] = {ui->action_File_Load, ui->action_File_Reload,
                         ui->action_File_SaveLog, ui->action_File_Print};
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
      *tip = group.data(Qt::ToolTipRole).toString();
      *tipAnchor = r;
      return true;
    }

    case RegisterColumns: {
      raiseDock("IntRegDockWidget");
      QHeaderView* header = ui->IntRegView->header();
      const QRect base =
          sectionRect(header, EduRegisterModel::BaseColumn, window_);
      const QRect dec =
          sectionRect(header, EduRegisterModel::DecimalColumn, window_);
      if (base.isEmpty() || dec.isEmpty()) {
        return false;
      }
      *spots << base.intersected(rect()) << dec.intersected(rect());
      return true;
    }

    case RegisterChanged: {
      if (!programLoaded_) {
        return false;
      }
      raiseDock("IntRegDockWidget");
      EduRegisterModel* model = window_->eduRegisterModel;
      // The changed registers are the ones the model paints in the changed
      // colour; which they are depends on how far the program has run.
      for (int g = 0; g < model->rowCount(); g += 1) {
        const QModelIndex group = model->index(g, 0);
        for (int r = 0; r < model->rowCount(group); r += 1) {
          const QModelIndex name = model->index(r, 0, group);
          const QVariant brush = name.data(Qt::ForegroundRole);
          if (!brush.isValid() ||
              brush.value<QBrush>().color() != QColor(kTealText)) {
            continue;
          }
          ui->IntRegView->expand(group);
          const QRect row = rowRect(
              ui->IntRegView, name,
              model->index(r, EduRegisterModel::DecimalColumn, group), window_);
          if (!row.isEmpty()) {
            *spots << row;
            return true;
          }
        }
      }
      return false;
    }

    case InspectorBits: {
      if (!dockIsOpen("InspectorDockWidget")) {
        return false;
      }
      raiseDock("IntRegDockWidget");
      edu::RegisterRef reg;
      if (edu::findRegister(programLoaded_ ? "t2" : "sp", &reg)) {
        ui->IntRegView->selectRegister(reg);
        QApplication::processEvents(QEventLoop::ExcludeUserInputEvents);
      }
      raiseDock("InspectorDockWidget");
      const QRect r = rectOf(window_->eduInspector);
      if (r.isEmpty()) {
        return false;
      }
      *spots << r;
      return true;
    }

    case TextColumns:
    case TextBadge:
    case TextFields:
    case TextPcAndBreakpoints: {
      if (!programLoaded_ || !dockIsOpen("TextSegDockWidget")) {
        return false;
      }
      raiseDock("TextSegDockWidget");
      EduTextView* view = ui->TextSegView;
      EduTextModel* model = window_->eduTextModel;
      QHeaderView* header = view->horizontalHeader();

      if (id == TextColumns) {
        const QRect code =
            sectionRect(header, EduTextModel::CodeColumn, window_);
        const QRect type =
            sectionRect(header, EduTextModel::TypeColumn, window_);
        if (code.isEmpty() || type.isEmpty()) {
          return false;
        }
        *spots << code.intersected(rect()) << type.intersected(rect());
        return true;
      }

      int instruction = -1;
      int pc = -1;
      for (int r = 0; r < model->rowCount(); r += 1) {
        const QModelIndex index = model->index(r, EduTextModel::TypeColumn);
        if (index.data(EduTextModel::RowKindRole).toInt() !=
            int(EduTextModel::InstructionRow)) {
          continue;
        }
        if (instruction < 0) {
          instruction = r;
        }
        if (pc < 0 && index.data(EduTextModel::IsPcRole).toBool()) {
          pc = r;
        }
      }
      if (instruction < 0) {
        return false;
      }
      const int row = (pc >= 0) ? pc : instruction;

      if (id == TextBadge) {
        const QModelIndex badge = model->index(row, EduTextModel::TypeColumn);
        const QRect cell = cellRect(view, badge, window_);
        if (cell.isEmpty()) {
          return false;
        }
        *spots << cell.adjusted(-3, -1, 3, 1);
        *tip = badge.data(Qt::ToolTipRole).toString();
        *tipAnchor = cell;
        return true;
      }

      if (id == TextFields) {
        view->setCurrentIndex(model->index(row, EduTextModel::InstructionColumn));
        QApplication::processEvents(QEventLoop::ExcludeUserInputEvents);
        const QRect line = rowRect(
            view, model->index(row, EduTextModel::BpColumn),
            model->index(row, EduTextModel::InstructionColumn), window_);
        if (line.isEmpty()) {
          return false;
        }
        *spots << line;
        const QRect inspector = rectOf(window_->eduInspector);
        if (!inspector.isEmpty()) {
          *spots << inspector;
        }
        return true;
      }

      const QRect line =
          rowRect(view, model->index(row, EduTextModel::BpColumn),
                  model->index(row, EduTextModel::SourceColumn), window_);
      if (line.isEmpty()) {
        return false;
      }
      *spots << line;
      const QRect bp = sectionRect(header, EduTextModel::BpColumn, window_);
      if (!bp.isEmpty()) {
        *spots << bp.intersected(rect());
      }
      return true;
    }

    case DataHeader:
    case DataLabels:
    case DataStack:
    case DataEnvironment: {
      if (!programLoaded_ || !dockIsOpen("DataSegDockWidget")) {
        return false;
      }
      raiseDock("DataSegDockWidget");
      EduDataView* view = ui->DataSegPanel->view();
      EduDataModel* model = window_->eduDataModel;
      QHeaderView* header = view->horizontalHeader();

      if (id == DataHeader) {
        const QRect address =
            sectionRect(header, EduDataModel::AddressColumn, window_);
        if (address.isEmpty()) {
          return false;
        }
        *spots << address.intersected(rect());
        const QRect ascii =
            sectionRect(header, EduDataModel::AsciiColumn, window_);
        if (!ascii.isEmpty()) {
          *spots << ascii.intersected(rect());
        }
        return true;
      }

      if (id == DataLabels) {
        for (int r = 0; r < model->rowCount(); r += 1) {
          const QModelIndex label = model->index(r, EduDataModel::LabelColumn);
          const QString text = label.data(Qt::DisplayRole).toString().trimmed();
          // A name from the source ("+0 msg"), not a register's arrow
          // ("$gp -> 10008000"), which the stack step is about.
          if (text.isEmpty() || text.contains("->")) {
            continue;
          }
          const QRect cell = cellRect(view, label, window_);
          if (!cell.isEmpty()) {
            *spots << cell.adjusted(-2, -1, 2, 1);
            return true;
          }
        }
        return false;
      }

      if (id == DataStack) {
        ui->DataSegPanel->goTo("$sp");
        QApplication::processEvents(QEventLoop::ExcludeUserInputEvents);
        for (int r = 0; r < model->rowCount(); r += 1) {
          for (int c = EduDataModel::Word0Column;
               c <= EduDataModel::Word3Column; c += 1) {
            const QModelIndex cell = model->index(r, c);
            if (cell.data(EduDataModel::PointerRole).toInt() < 0) {
              continue;
            }
            const QRect marker = cellRect(view, cell, window_);
            if (marker.isEmpty()) {
              continue;
            }
            *spots << marker.adjusted(-2, -1, 2, 1);
            const QRect button =
                rectOf(window_->findChild<QWidget*>("DataGoToSpButton"));
            if (!button.isEmpty()) {
              *spots << button;
            }
            return true;
          }
        }
        return false;
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
// Running the tour
//

void EduTutorial::buildSteps() {
  steps_.clear();
  QList<QRect> spots;
  QString tip;
  QRect anchor;
  for (int i = 0; i < kStepCount; i += 1) {
    const Step& step = kStepData[i];
    if (collectSpots(step.id, &spots, &tip, &anchor)) {
      steps_ << step;
    }
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
  follow_->start(250);
  showStep(qBound(0, step, steps_.size() - 1));
}

void EduTutorial::showStep(int index) {
  current_ = qBound(0, index, steps_.size() - 1);
  const Step& step = steps_.at(current_);

  title_->setText(korean_ ? QString::fromUtf8(step.titleKo)
                          : QString::fromUtf8(step.titleEn));
  body_->setText(korean_ ? QString::fromUtf8(step.bodyKo)
                         : QString::fromUtf8(step.bodyEn));
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

bool EduTutorial::handleTourKey(int key) {
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
  if (!handleTourKey(event->key())) {
    QWidget::keyPressEvent(event);
  }
}

// Clicks anywhere but on the card do nothing: the tour is left through its
// own buttons or Escape, never by a stray click.
void EduTutorial::mousePressEvent(QMouseEvent*) { setFocus(); }

void EduTutorial::resizeEvent(QResizeEvent* event) {
  QWidget::resizeEvent(event);
  reposition();
}

bool EduTutorial::eventFilter(QObject* watched, QEvent* event) {
  if (!isVisible()) {
    return QWidget::eventFilter(watched, event);
  }

  // While the tour is up its keys belong to it, wherever the focus is: this
  // window never takes the focus, so without this they would be typed into
  // the editor.
  if (event->type() == QEvent::KeyPress) {
    QKeyEvent* key = static_cast<QKeyEvent*>(event);
    if (key->modifiers() == Qt::NoModifier && handleTourKey(key->key())) {
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
        followWindow();
        raise();
        break;
      case QEvent::WindowDeactivate:
        // Another program is in front; a window that stays on top would sit
        // over it.  It comes back when this window is used again.
        hide();
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

void EduTutorial::finish() {
  follow_->stop();
  qApp->removeEventFilter(this);
  hide();
  emit closed();
}
