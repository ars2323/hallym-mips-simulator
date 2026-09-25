/* Every link and picture in the repository's documents points at something
   that is there, and every picture is used.

     node tools/check-doc-links.ts            the working tree (git's tracked files)
     node tools/check-doc-links.ts --online <ref>
                                              the published documents: the README, the user guide,
                                              docs/compare and docs/edutech, as GitHub serves them at
                                              <ref>, and every web link in them

   Offline:
   - broken: a Markdown link or picture ([..](x), ![..](x), <img src="x">) in
     a tracked .md file of this project whose file is not there, or whose
     #anchor is not a heading of that file (GitHub's anchors);
   - orphan: a picture (.png .jpg .jpeg .gif .svg .webp) tracked under docs/
     or electron/docs/ that no tracked text file names (by its path or, in
     the same folder, its name: the screens README lists its files by name).
   SPIM's own files (CPU/, Documentation/, Tests/, spim/, xspim/, PCSpim/,
   README, ChangeLog) are upstream's and left out.

   Prints what it found and exits 1 if anything is broken or orphaned. */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const repo = path.join(import.meta.dirname, '..', '..');
const REPO = 'ars2323/hallym-mips-simulator';
const UPSTREAM = /^(CPU|Documentation|Tests|spim|xspim|PCSpim)\/|^(README|ChangeLog)$/;
const PICTURE = /\.(png|jpe?g|gif|svg|webp)$/i;
const TEXT = /\.(md|ts|js|ps1|sh|py|yml|yaml|html|css|txt|pro|qrc|nsh|json)$/i;

const tracked = execFileSync('git', ['-C', repo, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
  .filter((f) => !UPSTREAM.test(f) && !f.startsWith('slides/'));

// GitHub's heading anchors: lower case, punctuation dropped, spaces to hyphens, repeats numbered.
function anchors(md: string): Set<string> {
  const seen = new Map<string, number>();
  const out = new Set<string>();
  let fence = false;
  for (const line of md.split('\n')) {
    if (/^\s*```/.test(line)) fence = !fence;
    const m = !fence && /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const text = m[1].replace(/`/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, '');
    const base = text.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.add(n ? `${base}-${n}` : base);
  }
  return out;
}

// The links of a Markdown file (code blocks and inline code left out).
function links(md: string): string[] {
  const text = md.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const out: string[] = [];
  for (const m of text.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) out.push(m[1]);
  for (const m of text.matchAll(/<img[^>]+src="([^"]+)"/g)) out.push(m[1]);
  for (const m of text.matchAll(/^\s*\[[^\]]+\]:\s*(\S+)/gm)) out.push(m[1]);
  return out;
}

const web = (t: string) => /^[a-z]+:/i.test(t);

async function offline(): Promise<number> {
  const broken: string[] = [];
  const mdFiles = tracked.filter((f) => f.endsWith('.md'));
  const anchorCache = new Map<string, Set<string>>();
  const anchorsOf = (f: string) => {
    if (!anchorCache.has(f)) anchorCache.set(f, anchors(readFileSync(path.join(repo, f), 'utf8')));
    return anchorCache.get(f)!;
  };
  let count = 0;
  for (const f of mdFiles) {
    for (const target of links(readFileSync(path.join(repo, f), 'utf8'))) {
      if (web(target)) continue;
      count += 1;
      const [p, hash] = target.split('#');
      const resolved = p ? path.posix.normalize(path.posix.join(path.posix.dirname(f), decodeURIComponent(p))) : f;
      const abs = path.join(repo, resolved);
      if (!existsSync(abs)) { broken.push(`${f}: ${target} -- no such file`); continue; }
      if (hash && resolved.endsWith('.md') && !anchorsOf(resolved).has(decodeURIComponent(hash))) {
        broken.push(`${f}: ${target} -- no heading #${decodeURIComponent(hash)} in ${resolved}`);
      }
    }
  }
  // Pictures nobody names.
  const pictures = tracked.filter((f) => PICTURE.test(f) && (f.startsWith('docs/') || f.startsWith('electron/docs/')));
  const texts = tracked.filter((f) => TEXT.test(f) && existsSync(path.join(repo, f)) && statSync(path.join(repo, f)).size < 2_000_000)
    .map((f) => ({ f, text: readFileSync(path.join(repo, f), 'utf8') }));
  const orphans = pictures.filter((pic) => {
    const name = path.posix.basename(pic);
    const dir = path.posix.dirname(pic);
    return !texts.some(({ f, text }) => {
      if (text.includes(pic)) return true;
      const rel = path.posix.relative(path.posix.dirname(f), pic);
      if (text.includes(rel)) return true;
      return (path.posix.dirname(f) === dir || f === `${dir}/README.md`) && text.includes(name);
    });
  });
  console.log(`links to files in ${mdFiles.length} documents: ${count}; broken: ${broken.length}`);
  for (const b of broken) console.log(`  BROKEN  ${b}`);
  console.log(`pictures under docs/ and electron/docs/: ${pictures.length}; orphans: ${orphans.length}`);
  for (const o of orphans) console.log(`  ORPHAN  ${o}`);
  return broken.length + orphans.length;
}

async function online(ref: string): Promise<number> {
  const docs = tracked.filter((f) => f === 'README.md' || /^docs\/(usage|compare|edutech)\/[^/]+\.md$/.test(f));
  const bad: string[] = [];
  const seen = new Map<string, number>();
  const get = async (url: string) => {
    if (!seen.has(url)) {
      let status = 0;
      for (let i = 0; i < 3 && (status === 0 || status >= 500 || status === 429); i += 1) {
        status = await fetch(url, { redirect: 'follow' }).then((r) => r.status, () => 0);
        if (status === 0 || status >= 500 || status === 429) await new Promise((r) => setTimeout(r, 2000));
      }
      seen.set(url, status);
    }
    return seen.get(url)!;
  };
  for (const f of docs) {
    for (const target of links(readFileSync(path.join(repo, f), 'utf8'))) {
      let url: string;
      if (web(target)) url = target;
      else {
        const [p] = target.split('#');
        const resolved = p ? path.posix.normalize(path.posix.join(path.posix.dirname(f), decodeURIComponent(p))) : f;
        const isDir = existsSync(path.join(repo, resolved)) && statSync(path.join(repo, resolved)).isDirectory();
        url = isDir ? `https://github.com/${REPO}/tree/${ref}/${encodeURI(resolved)}`
          : `https://raw.githubusercontent.com/${REPO}/${ref}/${encodeURI(resolved)}`;
      }
      const status = await get(url);
      if (status < 200 || status >= 400) bad.push(`${f}: ${target} -> ${url} (${status || 'no answer'})`);
    }
  }
  console.log(`links in ${docs.length} published documents, ${seen.size} distinct addresses at ${ref}; failing: ${bad.length}`);
  for (const b of bad) console.log(`  FAIL  ${b}`);
  return bad.length;
}

const i = process.argv.indexOf('--online');
const failures = i >= 0 ? await online(process.argv[i + 1] ?? 'main') : await offline();
process.exit(failures ? 1 : 0);
