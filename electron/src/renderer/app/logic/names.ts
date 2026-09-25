/* A file's name in a given width of the title bar, counted in columns of
   the mono font: Hangul (and other wide characters) take two.  Too long,
   it loses the end of its stem, not its extension: "hw03_2021….s".  The
   whole name goes into the label's tooltip (app.ts). */

const wide = (c: string) => /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(c);
export const columns = (s: string): number => [...s].reduce((n, c) => n + (wide(c) ? 2 : 1), 0);

export function shortName(name: string, cols: number): string {
  if (columns(name) <= cols) return name;
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 && name.length - dot <= 5 ? name.slice(dot) : '';
  const room = cols - 1 - columns(ext); // "…" takes one
  let head = '';
  for (const c of name.slice(0, name.length - ext.length)) {
    if (columns(head + c) > room) break;
    head += c;
  }
  return `${head}…${ext}`;
}
