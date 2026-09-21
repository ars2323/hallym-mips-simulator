/* QtSpim-Edu: labels by address (PLAN R5).

   The core's symbol table is a static hash table with no way to walk it or
   to ask "which label is at this address" (ARCHITECTURE 3.7).  Two sources
   that need no change to CPU/ fill this map instead:

     - the text print_symbols() writes, one line per label still in the
       table:  "g\tmain at 0x00400024\n"  or  "\tlocal at 0x10010000\n"
       (after a file is assembled only GLOBAL labels are left; the core
       drops a file's local labels at its end);
     - the labels that instructions refer to (EXPR(inst)->symbol), which is
       how local .data labels such as "msg" are found.  The GUI collects
       those; this file only stores them.

   QtCore only.
*/

#ifndef EDU_SYMBOLS_H
#define EDU_SYMBOLS_H

#include <QList>
#include <QMap>
#include <QString>
#include <QStringList>

namespace edu {

struct Symbol {
  QString name;
  quint32 address;
  bool global;
};

// Parses print_symbols() output.  Lines of any other shape are ignored.
QList<Symbol> parseSymbolListing(const QString& text);

class LabelMap {
 public:
  void clear();
  // Address 0 means "not defined" in the core (SYMBOL_IS_DEFINED); ignored.
  void add(const QString& name, quint32 address);

  bool isEmpty() const { return byName_.isEmpty(); }
  int size() const { return byName_.size(); }

  // Names at exactly this address, sorted.
  QStringList labelsAt(quint32 address) const;
  // (address, names) for every labelled address in [from, to), ascending.
  QList<QPair<quint32, QStringList> > labelsIn(quint32 from, quint32 to) const;
  bool find(const QString& name, quint32* address) const;

 private:
  QMap<QString, quint32> byName_;
  QMap<quint32, QStringList> byAddress_;
};

}  // namespace edu

#endif  // EDU_SYMBOLS_H
