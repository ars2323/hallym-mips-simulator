/* See edu_register_view.h. */

#include "edu/edu_register_view.h"

#include <QAction>
#include <QContextMenuEvent>
#include <QHeaderView>
#include <QMenu>
#include <QMessageBox>

#include "edu/core/edu_format.h"
#include "edu/edu_register_model.h"
#include "spimview.h"
#include "ui_spimview.h"

EduRegisterView::EduRegisterView(QWidget* parent)
    : QTreeView(parent), model_(0), changeValueAction_(new QAction(this)) {
  changeValueAction_->setObjectName("action_ChangeValue");
  changeValueAction_->setText("Change Register Contents");
  connect(changeValueAction_, SIGNAL(triggered(bool)), this,
          SLOT(changeValueOfCurrent()));

  setUniformRowHeights(true);
  setAllColumnsShowFocus(true);
  setSelectionBehavior(QAbstractItemView::SelectRows);
  setSelectionMode(QAbstractItemView::SingleSelection);
  setEditTriggers(QAbstractItemView::NoEditTriggers);
  setExpandsOnDoubleClick(true);
  setIndentation(12);

  connect(this, SIGNAL(doubleClicked(QModelIndex)), this,
          SLOT(onDoubleClicked(QModelIndex)));
}

void EduRegisterView::setRegisterModel(EduRegisterModel* model) {
  model_ = model;
  setModel(model);
  expandAll();  // groups start open; the user may fold them

  header()->setStretchLastSection(true);
  header()->setSectionResizeMode(QHeaderView::ResizeToContents);
  header()->setSectionsMovable(false);

  connect(selectionModel(),
          SIGNAL(currentRowChanged(QModelIndex, QModelIndex)), this,
          SLOT(onCurrentChanged()));
}

bool EduRegisterView::currentRegister(edu::RegisterRef* reg) const {
  return model_ != 0 && model_->registerAt(currentIndex(), reg);
}

void EduRegisterView::selectRegister(const edu::RegisterRef& reg) {
  if (model_ == 0) {
    return;
  }
  const QModelIndex index = model_->indexOf(reg);
  if (index.isValid()) {
    expand(index.parent());
    setCurrentIndex(index);
    scrollTo(index);
  }
}

void EduRegisterView::onCurrentChanged() { emit registerSelectionChanged(); }

void EduRegisterView::contextMenuEvent(QContextMenuEvent* event) {
  const QModelIndex index = indexAt(event->pos());
  if (index.isValid()) {
    setCurrentIndex(index);
  }

  // Same entries, in the same order, as upstream's register context menu
  // (minus the text-edit Copy/Select All, which have no meaning here).
  QMenu menu(this);
  menu.addAction(Window->ui->action_Reg_DisplayBinary);
  menu.addAction(Window->ui->action_Reg_DisplayDecimal);
  menu.addAction(Window->ui->action_Reg_DisplayHex);
  menu.addSeparator();
  edu::RegisterRef reg;
  changeValueAction_->setEnabled(currentRegister(&reg));
  menu.addAction(changeValueAction_);
  menu.exec(event->globalPos());
}

void EduRegisterView::onDoubleClicked(const QModelIndex& index) {
  edu::RegisterRef reg;
  if (model_ != 0 && model_->registerAt(index, &reg)) {
    changeValue(reg);
  }
}

void EduRegisterView::changeValueOfCurrent() {
  edu::RegisterRef reg;
  if (currentRegister(&reg)) {
    changeValue(reg);
  }
}

void EduRegisterView::changeValue(const edu::RegisterRef& reg) {
  // Upstream's dialog and prompt text ("New value for R8" / "... for PC").
  int base = Window->RegDisplayBase();
  const QString text = promptForNewValue(
      "New value for " + edu::registerPromptName(reg), &base);
  if (text.isEmpty()) {
    return;  // cancelled (upstream went on to complain about a bad value)
  }

  quint32 value = 0;
  if (!edu::parseValue32(text, base, &value)) {
    QMessageBox box;
    box.setText(QString("Bad ") + (base == 16 ? "hex" : "decimal") +
                " register value: " + text);
    box.exec();
    return;
  }

  model_->writeRegister(reg, value);
  // As upstream: both register windows are redrawn after an edit.
  Window->DisplayIntRegisters();
  Window->DisplayFPRegisters();
}

// Window > Integer Registers follows the panel's visibility, as upstream's
// regTextEdit did for both register windows.
void EduRegisterView::hideEvent(QHideEvent* event) {
  if (Window != NULL) {
    Window->ui->action_Win_IntRegisters->setChecked(false);
  }
  QTreeView::hideEvent(event);
}

void EduRegisterView::showEvent(QShowEvent* event) {
  if (Window != NULL) {
    Window->ui->action_Win_IntRegisters->setChecked(true);
  }
  QTreeView::showEvent(event);
}
