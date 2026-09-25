/* Labels by address.  A port of the Qt build's QtSpim/edu/core/
   edu_symbols.{h,cpp}.

   The core's symbol table is a static hash table with no way to walk it or
   to ask "which label is at this address", and its lookup creates an entry
   for a name it does not know (CPU/sym-tbl.cpp lookup_label), so it cannot
   be queried either.  What it can do is print itself: print_symbols()
   writes one line per label still in the table,

       "g\tmain at 0x00400024\n"  or  "\tlocal at 0x10010000\n"

   and the addon captures that listing while a file's local labels are still
   there (native/src/addon.cc, readAssemblyBytes).
*/

export interface Symbol {
  name: string;
  address: number;
  global: boolean;
}

// Parses print_symbols() output.  Lines of any other shape are ignored.
export function parseSymbolListing(text: string): Symbol[] {
  const symbols: Symbol[] = [];
  for (let line of text.split('\n')) {
    if (line.endsWith('\r')) line = line.slice(0, -1);
    // "%s%s at 0x%08x\n" with "g\t" or "\t" in front (CPU/sym-tbl.cpp).
    const m = /^(g?)\t(\S+) at 0x([0-9a-fA-F]{8})$/.exec(line);
    if (m) symbols.push({ name: m[2], address: parseInt(m[3], 16), global: m[1] !== '' });
  }
  return symbols;
}

/* A two-way map, built by its owner and passed to pure functions; nothing
   here keeps state of its own. */
export class LabelMap {
  private readonly byName = new Map<string, number>();
  private readonly byAddress = new Map<number, string[]>();

  clear(): void {
    this.byName.clear();
    this.byAddress.clear();
  }

  // Address 0 means "not defined" in the core (SYMBOL_IS_DEFINED); ignored.
  add(name: string, address: number): void {
    if (name === '' || address === 0) return;
    const old = this.byName.get(name);
    if (old !== undefined) {
      if (old === address) return;
      // Redefined (another file, a reload): the newer address wins.
      const rest = this.byAddress.get(old)!.filter((n) => n !== name);
      if (rest.length === 0) this.byAddress.delete(old);
      else this.byAddress.set(old, rest);
    }
    this.byName.set(name, address);
    const names = [...(this.byAddress.get(address) ?? []), name];
    this.byAddress.set(address, names.sort());
  }

  get isEmpty(): boolean { return this.byName.size === 0; }
  get size(): number { return this.byName.size; }

  // Names at exactly this address, sorted.
  labelsAt(address: number): string[] {
    return [...(this.byAddress.get(address) ?? [])];
  }

  // [address, names] for every labelled address in [from, to), ascending.
  labelsIn(from: number, to: number): [number, string[]][] {
    return [...this.byAddress.entries()]
      .filter(([a]) => a >= from && a < to)
      .sort(([a], [b]) => a - b)
      .map(([a, names]) => [a, [...names]]);
  }

  find(name: string): number | undefined {
    return this.byName.get(name);
  }
}
