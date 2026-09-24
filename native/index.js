// JS side of the addon.  Everything that touches a path happens here, in
// Node; C++ only ever receives text.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const core = createRequire(import.meta.url)('./build/Release/spim.node');

// The default exception handler, as QtSpim loads it (QtSpim/exception.qrc
// embeds ../CPU/exceptions.s).
const handlerSource = readFileSync(new URL('../CPU/exceptions.s', import.meta.url), 'utf8');

export const assemble = (source) => core.assemble(source, handlerSource);
export const { textSegment, registers, disassemble, step } = core;
