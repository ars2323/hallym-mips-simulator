/* The executable image (src/core/hmx.ts) of a program, read from a
   simulator right after assembling it: every value is the core's, nothing
   is assumed.

   - text     the user text segment's words, from its first to its last
              instruction: the start-up code (__start, from the exception
              handler's file) included; the kernel's text is not.  A word
              with no instruction (a gap left by .text <addr>) is 0.
   - data     the user data segment: from where the assembler put the first
              datum to where the next would go (a trailing .space included),
              widened to any other byte that is not zero (data put below or
              above by .data <addr>).  The kernel's data is not.  None when
              that is empty.
   - entry    main's address; without the exception handler a program may
              bring only its own __start, which is then the entry.
   - regs     $sp and $gp as assembling left them.
   - endian   the order the word at $sp (argc) has in memory.
   - symbols  the program's own labels, global or not, in user text or data:
              not the handler's (__start, __eoth and its kernel labels; they
              are found by assembling the handler with an empty program).

   It assembles twice (the handler alone, then the program): the process it
   is given must be one nothing else uses meanwhile -- the app's second
   process (src/main/main.ts), never the machine on screen. */

import { parseSymbolListing } from '../core/symbols.ts';
import type { MachineImage } from '../core/hmx.ts';
import type { CallName, Calls } from './protocol.ts';

export type Call = <M extends CallName>(method: M, ...args: Calls[M][0]) => Promise<Calls[M][1]>;
type AssembleOptions = Calls['assemble'][0][1];

// Why there is no image; the message is for the student.
export class ImageError extends Error {}

export async function readImage(call: Call, source: string, options: AssembleOptions): Promise<MachineImage> {
  // The handler alone (a program of one empty line: the scanner needs a byte).
  const alone = await call('assemble', '\n', options);
  const handlerNames = new Set(parseSymbolListing(alone.symbols).map((s) => s.name));
  handlerNames.delete('main'); // declared by the loader for every program, defined by the program

  const r = await call('assemble', source, options);
  if (!r.ok) throw new ImageError('어셈블 오류가 있어 실행 이미지를 만들 수 없습니다');
  const seg = await call('segments');
  const regs = await call('registers');
  const sp = regs.general[29];

  const [argc] = await call('readWords', sp, 1);
  const inMemory = [...(await call('readBytes', sp, 4))];
  const le = [argc & 0xff, (argc >>> 8) & 0xff, (argc >>> 16) & 0xff, argc >>> 24];
  const little = inMemory.every((b, i) => b === le[i]), big = inMemory.every((b, i) => b === le[3 - i]);
  if (little === big) throw new Error(`the byte order cannot be told from ${inMemory}`);

  const userText = (await call('textSegment')).filter((w) => w.addr >= seg.textBot && w.addr < seg.textTop);
  if (userText.length === 0) throw new ImageError('명령이 없어 실행 이미지를 만들 수 없습니다');
  const textAddr = userText[0].addr;
  const words = new Array<number>((userText[userText.length - 1].addr - textAddr) / 4 + 1).fill(0);
  for (const w of userText) words[(w.addr - textAddr) / 4] = w.word >>> 0;

  const segment = await call('readBytes', seg.dataBot, seg.dataTop - seg.dataBot);
  let lo = r.data.start, hi = r.data.end;
  const first = segment.findIndex((b) => b !== 0);
  if (first >= 0) {
    let last = segment.length - 1;
    while (segment[last] === 0) last--;
    lo = Math.min(lo, seg.dataBot + (first & ~3));
    hi = Math.max(hi, seg.dataBot + ((last + 4) & ~3));
  }
  const data = hi > lo ? { addr: lo, bytes: segment.slice(lo - seg.dataBot, hi - seg.dataBot) } : null;

  const listed = parseSymbolListing(r.symbols).filter((s) => s.address !== 0);
  const own = listed.filter((s) => !handlerNames.has(s.name) &&
    ((s.address >= seg.textBot && s.address < seg.textTop) || (s.address >= seg.dataBot && s.address < seg.dataTop)));
  const symbols = own.map((s) => ({ name: s.name, addr: s.address >>> 0 }))
    .sort((a, b) => a.addr - b.addr || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const main = own.find((s) => s.name === 'main') ?? own.find((s) => s.name === '__start');
  if (!main) throw new ImageError('main 레이블이 없어 실행 이미지를 만들 수 없습니다');

  return {
    endian: little ? 'little' : 'big',
    entry: main.address >>> 0,
    regs: [{ name: '$sp', value: sp }, { name: '$gp', value: regs.general[28] }],
    symbols,
    text: { addr: textAddr, words },
    data,
  };
}
