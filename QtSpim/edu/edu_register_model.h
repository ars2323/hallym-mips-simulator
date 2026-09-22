/* QtSpim-Edu: the integer registers as an item model (PLAN R1, R2).

   Two levels: the groups of edu::registerGroups() and, under each, its
   registers.  Columns: name ($t0), number (R8), the value in the base chosen
   in the Registers menu, and the value as signed decimal.

   Change highlighting follows the stage-1 checkpoint decision: a register is
   "changed" when its value differs from the snapshot taken when the last
   run command (Step, Run, Continue...) started.  Reinitialize, Load and
   Clear Registers take a fresh snapshot, so nothing is highlighted after
   them, and a value the user typed in is folded into the snapshot, so edits
   are never highlighted.  (Upstream compared with the previous repaint,
   which after a Run highlights nothing useful.)

   The model never formats numbers itself: see edu/core/edu_format.h.
*/

#ifndef EDU_REGISTER_MODEL_H
#define EDU_REGISTER_MODEL_H

#include <QAbstractItemModel>
#include <QColor>
#include <QFont>
#include <QList>
#include <QVector>

#include "edu/core/edu_registers.h"

class EduRegisterModel : public QAbstractItemModel {
  Q_OBJECT

 public:
  enum Column { NameColumn, NumberColumn, BaseColumn, DecimalColumn, ColumnCount };

  explicit EduRegisterModel(QObject* parent = 0);

  // QAbstractItemModel
  QModelIndex index(int row, int column,
                    const QModelIndex& parent = QModelIndex()) const;
  QModelIndex parent(const QModelIndex& child) const;
  int rowCount(const QModelIndex& parent = QModelIndex()) const;
  int columnCount(const QModelIndex& parent = QModelIndex()) const;
  QVariant data(const QModelIndex& index, int role = Qt::DisplayRole) const;
  QVariant headerData(int section, Qt::Orientation orientation,
                      int role = Qt::DisplayRole) const;

  // True for a register row (as opposed to a group row); *reg receives it.
  bool registerAt(const QModelIndex& index, edu::RegisterRef* reg) const;
  QModelIndex indexOf(const edu::RegisterRef& reg) const;

  // Current value in the simulator.
  static quint32 readRegister(const edu::RegisterRef& reg);
  // Writes the simulator's register; the new value counts as the user's and
  // is therefore not highlighted.
  void writeRegister(const edu::RegisterRef& reg, quint32 value);

  bool isChanged(const edu::RegisterRef& reg) const;

  // Re-reads every register from the simulator and repaints what differs.
  void refresh();

  // Snapshot handling; see the comment at the top.
  void beginRunCommand();

  // While the snapshot is held, beginRunCommand() keeps the baseline it
  // already has.  The tour walks the example with many single steps but
  // wants what they changed marked as one run, the way a student's Run
  // command marks it.
  void setSnapshotHeld(bool held) { snapshotHeld_ = held; }
  void resetChanges();

  void setBase(int base);
  int base() const { return base_; }
  void setChangedColor(const QColor& color, bool enabled);
  // The view's font; bold variants of it mark group rows and changed values.
  void setPanelFont(const QFont& font);

 private:
  struct Row {
    edu::RegisterRef reg;
    quint32 value;
    quint32 snapshot;
  };

  const Row* rowFor(const QModelIndex& index) const;
  static quintptr groupId() { return quintptr(0); }

  QList<edu::RegisterGroup> groups_;
  QVector<QVector<Row> > rows_;  // [group][register]
  int base_;
  QFont panelFont_;
  QColor changedColor_;
  bool colorChanges_;
  bool snapshotHeld_;
};

#endif  // EDU_REGISTER_MODEL_H
