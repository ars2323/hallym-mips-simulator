/* See edu_symbols.h. */

#include "edu/core/edu_symbols.h"

#include <QRegExp>

namespace edu {

QList<Symbol> parseSymbolListing(const QString& text) {
  QList<Symbol> symbols;
  // "%s%s at 0x%08x\n" with "g\t" or "\t" in front (CPU/sym-tbl.cpp).
  QRegExp line("^(g?)\\t(\\S+) at 0x([0-9a-fA-F]{8})$");
  const QStringList lines = text.split('\n');
  for (int i = 0; i < lines.size(); i += 1) {
    QString candidate = lines.at(i);
    if (candidate.endsWith('\r')) {
      candidate.chop(1);
    }
    if (line.exactMatch(candidate)) {
      Symbol symbol;
      symbol.global = !line.cap(1).isEmpty();
      symbol.name = line.cap(2);
      symbol.address = line.cap(3).toUInt(0, 16);
      symbols << symbol;
    }
  }
  return symbols;
}

void LabelMap::clear() {
  byName_.clear();
  byAddress_.clear();
}

void LabelMap::add(const QString& name, quint32 address) {
  if (name.isEmpty() || address == 0) {
    return;
  }
  if (byName_.contains(name)) {
    if (byName_.value(name) == address) {
      return;
    }
    // Redefined (another file, a reload): the newer address wins.
    QStringList& old = byAddress_[byName_.value(name)];
    old.removeAll(name);
    if (old.isEmpty()) {
      byAddress_.remove(byName_.value(name));
    }
  }
  byName_.insert(name, address);
  QStringList& names = byAddress_[address];
  names << name;
  names.sort();
}

QStringList LabelMap::labelsAt(quint32 address) const {
  return byAddress_.value(address);
}

QList<QPair<quint32, QStringList> > LabelMap::labelsIn(quint32 from,
                                                       quint32 to) const {
  QList<QPair<quint32, QStringList> > result;
  for (QMap<quint32, QStringList>::const_iterator it =
           byAddress_.lowerBound(from);
       it != byAddress_.constEnd() && it.key() < to; ++it) {
    result << qMakePair(it.key(), it.value());
  }
  return result;
}

bool LabelMap::find(const QString& name, quint32* address) const {
  QMap<QString, quint32>::const_iterator it = byName_.constFind(name);
  if (it == byName_.constEnd()) {
    return false;
  }
  *address = it.value();
  return true;
}

}  // namespace edu
