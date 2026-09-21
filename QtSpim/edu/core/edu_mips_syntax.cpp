/* See edu_mips_syntax.h. */

#include "edu/core/edu_mips_syntax.h"

#include <QHash>

#include "edu/core/edu_registers.h"

namespace edu {

namespace {

struct Keyword {
  const char* name;
  int type;  // op.h's ASM_DIR, PSEUDO_OP, ..._TYPE_INST
};

// CPU/op.h is a list of OP(name, token, type, opcode) lines preceded by the
// #defines of the types.  The token and opcode arguments are dropped
// unevaluated, so none of the parser's symbols are needed.
#define OP(NAME, OPCODE, TYPE, R_OPCODE) {NAME, TYPE},
const Keyword kKeywords[] = {
#include "../../../CPU/op.h"
};
#undef OP

const QHash<QString, int>& keywordTypes() {
  static QHash<QString, int> types;
  if (types.isEmpty()) {
    for (unsigned i = 0; i < sizeof(kKeywords) / sizeof(kKeywords[0]); i += 1) {
      types.insert(QString::fromLatin1(kKeywords[i].name), kKeywords[i].type);
    }
  }
  return types;
}

// CPU/scanner.l: identifiers are [a-zA-Z_.][a-zA-Z0-9_.]*
bool isNameStart(QChar c) {
  return c.isLetter() ? c.unicode() < 128 : (c == '_' || c == '.');
}
bool isNameChar(QChar c) {
  return isNameStart(c) || (c >= '0' && c <= '9');
}

bool isRegisterWord(const QString& word) {  // word starts with '$'
  RegisterRef reg;
  if (findRegister(word, &reg) && reg.kind == RegisterRef::General) {
    return true;
  }
  // $f0 .. $f31
  if (word.size() >= 3 && word.at(1) == 'f') {
    bool ok = false;
    const int n = word.mid(2).toInt(&ok, 10);
    return ok && n >= 0 && n <= 31 && word.at(2).isDigit();
  }
  return false;
}

void add(QList<SyntaxToken>* tokens, int start, int end,
         SyntaxToken::Kind kind) {
  SyntaxToken token;
  token.start = start;
  token.length = end - start;
  token.kind = kind;
  tokens->append(token);
}

}  // namespace

int mipsKeywordCount() { return keywordTypes().size(); }

bool isMipsDirective(const QString& word) {
  const QHash<QString, int>& types = keywordTypes();
  QHash<QString, int>::const_iterator it = types.constFind(word);
  return it != types.constEnd() && it.value() == ASM_DIR;
}

bool isMipsInstruction(const QString& word) {
  const QHash<QString, int>& types = keywordTypes();
  QHash<QString, int>::const_iterator it = types.constFind(word);
  return it != types.constEnd() && it.value() != ASM_DIR;
}

QList<SyntaxToken> tokenizeMipsLine(const QString& line) {
  QList<SyntaxToken> tokens;
  const int n = line.size();
  bool onlyLabelsSoFar = true;  // a "name:" is a definition only up front
  int i = 0;

  while (i < n) {
    const QChar c = line.at(i);

    if (c == '#') {
      add(&tokens, i, n, SyntaxToken::Comment);
      break;
    }

    if (c == '"' || c == '\'') {
      int j = i + 1;
      while (j < n && line.at(j) != c) {
        j += (line.at(j) == '\\' && j + 1 < n) ? 2 : 1;
      }
      j = qMin(n, j + 1);  // the closing quote, if there is one
      add(&tokens, i, j, SyntaxToken::String);
      onlyLabelsSoFar = false;
      i = j;
      continue;
    }

    if (c == '$') {
      int j = i + 1;
      while (j < n && (isNameChar(line.at(j)) || line.at(j) == '$')) {
        j += 1;
      }
      add(&tokens, i, j,
          isRegisterWord(line.mid(i, j - i)) ? SyntaxToken::Register
                                             : SyntaxToken::Identifier);
      onlyLabelsSoFar = false;
      i = j;
      continue;
    }

    const bool digit = c >= '0' && c <= '9';
    const bool sign = (c == '-' || c == '+') && i + 1 < n &&
                      line.at(i + 1) >= '0' && line.at(i + 1) <= '9';
    if (digit || sign) {
      int j = i + 1;
      while (j < n && (isNameChar(line.at(j)) ||
                       ((line.at(j) == '-' || line.at(j) == '+') &&
                        (line.at(j - 1) == 'e' || line.at(j - 1) == 'E') &&
                        !line.mid(i, j - i).contains('x', Qt::CaseInsensitive)))) {
        j += 1;
      }
      add(&tokens, i, j, SyntaxToken::Number);
      onlyLabelsSoFar = false;
      i = j;
      continue;
    }

    if (isNameStart(c)) {
      int j = i + 1;
      while (j < n && isNameChar(line.at(j))) {
        j += 1;
      }
      const QString word = line.mid(i, j - i);
      int k = j;
      while (k < n && (line.at(k) == ' ' || line.at(k) == '\t')) {
        k += 1;
      }
      if (onlyLabelsSoFar && k < n && line.at(k) == ':') {
        add(&tokens, i, k + 1, SyntaxToken::LabelDefinition);
        i = k + 1;
        continue;
      }
      onlyLabelsSoFar = false;
      if (isMipsDirective(word)) {
        add(&tokens, i, j, SyntaxToken::Directive);
      } else if (isMipsInstruction(word)) {
        add(&tokens, i, j, SyntaxToken::Instruction);
      } else {
        add(&tokens, i, j, SyntaxToken::Identifier);
      }
      i = j;
      continue;
    }

    if (!c.isSpace()) {
      onlyLabelsSoFar = false;  // punctuation
    }
    i += 1;
  }
  return tokens;
}

}  // namespace edu
