/* See edu_register_model.h. */

#include "edu/edu_register_model.h"

#include "edu/theme/tokens.h"

#include <QBrush>
#include <QFont>

#include "edu/core/edu_format.h"

// The simulator core's registers.  spimview.h is the one header that pulls
// the core headers in (they have no include guards; docs/ARCHITECTURE.md
// §3.9), so it is included rather than CPU/reg.h directly.
#include "spimview.h"

EduRegisterModel::EduRegisterModel(QObject* parent)
    : QAbstractItemModel(parent),
      groups_(edu::registerGroups()),
      base_(16),
      changedColor_(Qt::red),
      colorChanges_(true),
      snapshotHeld_(false) {
  rows_.resize(groups_.size());
  for (int g = 0; g < groups_.size(); g += 1) {
    const QList<edu::RegisterRef>& registers = groups_.at(g).registers;
    for (int r = 0; r < registers.size(); r += 1) {
      Row row;
      row.reg = registers.at(r);
      row.value = 0;
      row.snapshot = 0;
      rows_[g].append(row);
    }
  }
}

// Group rows have internalId 0; a register row carries its group's
// position + 1, which is all parent() needs.
QModelIndex EduRegisterModel::index(int row, int column,
                                    const QModelIndex& parent) const {
  if (column < 0 || column >= ColumnCount || row < 0) {
    return QModelIndex();
  }
  if (!parent.isValid()) {
    return row < groups_.size() ? createIndex(row, column, groupId())
                                : QModelIndex();
  }
  if (parent.internalId() != groupId() || parent.row() >= rows_.size() ||
      row >= rows_.at(parent.row()).size()) {
    return QModelIndex();
  }
  return createIndex(row, column, quintptr(parent.row() + 1));
}

QModelIndex EduRegisterModel::parent(const QModelIndex& child) const {
  if (!child.isValid() || child.internalId() == groupId()) {
    return QModelIndex();
  }
  return createIndex(int(child.internalId()) - 1, 0, groupId());
}

int EduRegisterModel::rowCount(const QModelIndex& parent) const {
  if (!parent.isValid()) {
    return groups_.size();
  }
  if (parent.internalId() == groupId() && parent.column() == 0) {
    return rows_.at(parent.row()).size();
  }
  return 0;
}

int EduRegisterModel::columnCount(const QModelIndex&) const {
  return ColumnCount;
}

const EduRegisterModel::Row* EduRegisterModel::rowFor(
    const QModelIndex& index) const {
  if (!index.isValid() || index.internalId() == groupId()) {
    return 0;
  }
  const int group = int(index.internalId()) - 1;
  if (group < 0 || group >= rows_.size() || index.row() >= rows_.at(group).size()) {
    return 0;
  }
  return &rows_.at(group).at(index.row());
}

bool EduRegisterModel::registerAt(const QModelIndex& index,
                                  edu::RegisterRef* reg) const {
  const Row* row = rowFor(index);
  if (row == 0) {
    return false;
  }
  *reg = row->reg;
  return true;
}

QModelIndex EduRegisterModel::indexOf(const edu::RegisterRef& reg) const {
  for (int g = 0; g < rows_.size(); g += 1) {
    for (int r = 0; r < rows_.at(g).size(); r += 1) {
      if (rows_.at(g).at(r).reg == reg) {
        return createIndex(r, 0, quintptr(g + 1));
      }
    }
  }
  return QModelIndex();
}

QVariant EduRegisterModel::data(const QModelIndex& index, int role) const {
  if (!index.isValid()) {
    return QVariant();
  }


  if (index.internalId() == groupId()) {
    const edu::RegisterGroup& group = groups_.at(index.row());
    if (role == Qt::DisplayRole && index.column() == NameColumn) {
      return group.title;
    }
    if (role == Qt::ToolTipRole) {
      return group.description;
    }
    if (role == Qt::ForegroundRole) {
      return QBrush(QColor(edu::theme::kNavy));
    }
    return QVariant();
  }

  const Row* row = rowFor(index);
  if (row == 0) {
    return QVariant();
  }

  switch (role) {
    case Qt::DisplayRole:
      switch (index.column()) {
        case NameColumn:
          return edu::registerName(row->reg);
        case NumberColumn:
          return edu::registerNumberLabel(row->reg);
        case BaseColumn:
          return edu::inBase32(row->value, base_);
        case DecimalColumn:
          return edu::signedDec32(row->value);
      }
      break;

    case Qt::TextAlignmentRole:
      if (index.column() == DecimalColumn) {
        return int(Qt::AlignRight | Qt::AlignVCenter);
      }
      break;

    case Qt::ForegroundRole:
      if (colorChanges_ && row->value != row->snapshot) {
        return QBrush(changedColor_);
      }
      break;

    // A changed value is marked with colour and a tint behind it, never
    // with weight: D2Coding has no bold face, so Windows fakes one by
    // smearing the glyphs wider, and the column stops lining up (E).
    case Qt::BackgroundRole:
      if (colorChanges_ && row->value != row->snapshot &&
          index.column() != NameColumn && index.column() != NumberColumn) {
        return QBrush(QColor(edu::theme::kTealTint));
      }
      break;

    case Qt::ToolTipRole: {
      QString tip = edu::registerName(row->reg);
      if (row->reg.kind == edu::RegisterRef::General) {
        tip += QString("  (R%1, \"%2\" in the simulator's own listings)")
                   .arg(row->reg.number)
                   .arg(edu::generalRegisterCoreName(row->reg.number));
      }
      tip += QString("\n%1 = %2 = %3 unsigned")
                 .arg(edu::hex32(row->value), edu::signedDec32(row->value),
                      edu::unsignedDec32(row->value));
      return tip;
    }
  }
  return QVariant();
}

QVariant EduRegisterModel::headerData(int section, Qt::Orientation orientation,
                                      int role) const {
  if (orientation != Qt::Horizontal) {
    return QVariant();
  }
  // Every column says what it is, in both languages the students read.
  if (role == Qt::ToolTipRole) {
    switch (section) {
      case NameColumn:
        return QString::fromUtf8(
            "The name used in assembly, $t0 or $sp\n"
            "어셈블리에서 쓰는 이름 ($t0, $sp …)");
      case NumberColumn:
        return QString::fromUtf8(
            "The register number: R8 is $t0, and CP0 registers show as $12\n"
            "레지스터 번호. R8이 $t0, CP0는 $12 형식");
      case BaseColumn:
        return QString::fromUtf8(
            "The value in the base chosen in the Registers menu\n"
            "Registers 메뉴에서 고른 진법으로 본 값");
      case DecimalColumn:
        return QString::fromUtf8(
            "The same value as a signed decimal number\n"
            "같은 값을 부호 있는 10진수로");
      default:
        return QVariant();
    }
  }
  if (role != Qt::DisplayRole) {
    return QVariant();
  }
  switch (section) {
    case NameColumn:
      return QString("Name");
    case NumberColumn:
      return QString("No.");
    case BaseColumn:
      return edu::baseName(base_);
    case DecimalColumn:
      return QString("Decimal");
  }
  return QVariant();
}

quint32 EduRegisterModel::readRegister(const edu::RegisterRef& reg) {
  switch (reg.kind) {
    case edu::RegisterRef::Pc:
      return quint32(PC);
    case edu::RegisterRef::Hi:
      return quint32(HI);
    case edu::RegisterRef::Lo:
      return quint32(LO);
    case edu::RegisterRef::General:
      return quint32(R[reg.number]);
    case edu::RegisterRef::Cp0:
      return quint32(CPR[0][reg.number]);
  }
  return 0;
}

void EduRegisterModel::writeRegister(const edu::RegisterRef& reg,
                                     quint32 value) {
  switch (reg.kind) {
    case edu::RegisterRef::Pc:
      PC = mem_addr(value);
      break;
    case edu::RegisterRef::Hi:
      HI = reg_word(value);
      break;
    case edu::RegisterRef::Lo:
      LO = reg_word(value);
      break;
    case edu::RegisterRef::General:
      R[reg.number] = reg_word(value);
      break;
    case edu::RegisterRef::Cp0:
      CPR[0][reg.number] = reg_word(value);
      break;
  }

  // A value the user typed is not a change the program made.
  for (int g = 0; g < rows_.size(); g += 1) {
    for (int r = 0; r < rows_.at(g).size(); r += 1) {
      if (rows_.at(g).at(r).reg == reg) {
        rows_[g][r].snapshot = value;
      }
    }
  }
  refresh();
}

bool EduRegisterModel::isChanged(const edu::RegisterRef& reg) const {
  for (int g = 0; g < rows_.size(); g += 1) {
    for (int r = 0; r < rows_.at(g).size(); r += 1) {
      if (rows_.at(g).at(r).reg == reg) {
        return rows_.at(g).at(r).value != rows_.at(g).at(r).snapshot;
      }
    }
  }
  return false;
}

void EduRegisterModel::refresh() {
  for (int g = 0; g < rows_.size(); g += 1) {
    for (int r = 0; r < rows_.at(g).size(); r += 1) {
      rows_[g][r].value = readRegister(rows_.at(g).at(r).reg);
    }
    if (!rows_.at(g).isEmpty()) {
      // Whole rows: the colour of every cell depends on the value.
      emit dataChanged(createIndex(0, 0, quintptr(g + 1)),
                       createIndex(rows_.at(g).size() - 1, ColumnCount - 1,
                                   quintptr(g + 1)));
    }
  }
}

void EduRegisterModel::beginRunCommand() {
  if (snapshotHeld_) {
    return;
  }
  for (int g = 0; g < rows_.size(); g += 1) {
    for (int r = 0; r < rows_.at(g).size(); r += 1) {
      rows_[g][r].snapshot = readRegister(rows_.at(g).at(r).reg);
    }
  }
}

void EduRegisterModel::resetChanges() {
  beginRunCommand();
  refresh();
}

void EduRegisterModel::setBase(int base) {
  if (base != 2 && base != 10) {
    base = 16;
  }
  if (base == base_) {
    return;
  }
  base_ = base;
  emit headerDataChanged(Qt::Horizontal, BaseColumn, BaseColumn);
  refresh();
}

void EduRegisterModel::setPanelFont(const QFont& font) { panelFont_ = font; }

void EduRegisterModel::setChangedColor(const QColor& color, bool enabled) {
  changedColor_ = color;
  colorChanges_ = enabled;
  refresh();
}
