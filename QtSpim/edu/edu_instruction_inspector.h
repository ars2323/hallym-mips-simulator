/* Hallym MIPS Simulator -- the Instruction Inspector.

   One instruction, drawn rather than listed: the word as thirty-two boxes
   grouped into its fields, MSB on the left and LSB on the right, and under
   it one line per field with its bit range, its bits, its value and what
   that value means.  A branch or a jump also gets the sum that produced its
   destination.

   It follows the Text panel only.  A register's bits are in the register
   panel itself (Registers > Binary), and what a word of memory holds is in
   the tool tip of its cell, so nothing was lost by narrowing this to
   instructions -- and everything here is now about one thing.

   The drawing is all in paintEvent(): the grid folds to two rows of sixteen
   bits when the panel is too narrow for one, and the field lines are laid
   out from the same measurements.  text() gives the same content as plain
   text for the screenshot harness and the tests.
*/

#ifndef EDU_INSTRUCTION_INSPECTOR_H
#define EDU_INSTRUCTION_INSPECTOR_H

#include <QDockWidget>
#include <QFont>
#include <QString>
#include <QStringList>

#include "edu/core/edu_decoder.h"

class QWidget;

class EduInstructionInspector : public QDockWidget {
  Q_OBJECT

 public:
  explicit EduInstructionInspector(QWidget* parent = 0);

  // What the Text panel has selected.  `disassembly` is the core's own text
  // for the instruction, `destinationLabel` the label its source named.
  void showInstruction(const edu::DecodedInstruction& decoded, quint32 address,
                       const QString& disassembly,
                       const QString& destinationLabel,
                       edu::BranchConvention convention);
  void showNothing();

  void setPanelFont(const QFont& font);

  bool hasInstruction() const { return hasInstruction_; }

  // Everything on show, as lines of text: the harness and the tests read
  // this instead of the pixels.
  QString text() const;

 private:
  friend class EduInstructionCanvas;

  QWidget* canvas_;
  bool hasInstruction_;
  edu::DecodedInstruction decoded_;
  quint32 address_;
  QString disassembly_;
  QString destinationLabel_;
  edu::BranchConvention convention_;
  QFont codeFont_;

  // What one field line says: filled from the decoded instruction.
  struct FieldLine {
    QString name;
    QString range;    // "31-26"
    QString bits;     // "000010"
    QString value;    // "2"
    QString meaning;  // "$sp", "addu", "shift by 2"
  };
  QList<FieldLine> fieldLines() const;
  QString destinationLine() const;  // empty unless branch or jump
  QStringList noteLines() const;
};

#endif  // EDU_INSTRUCTION_INSPECTOR_H
