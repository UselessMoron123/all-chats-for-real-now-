// Offline replay against Firefox "Web Page, complete" HTML saves and independent
// JSON exports. Neither the HTML (which can contain session tokens) nor the
// exported contents are committed or printed. Usage:
//   node tests/dom-replay.mjs /tmp/arena-pages /tmp/older-chats/chats
// The first directory contains just the top-level .htm pages, recursively;
// the second contains sorted chat.json files from the older chats branch.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const [pagesRoot, exportsRoot] = process.argv.slice(2);
if (!pagesRoot || !exportsRoot) {
  console.error('usage: node tests/dom-replay.mjs <saved-pages-directory> <older-chats-directory>');
  process.exit(2);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'Arena.ai - LMSYS Arena Chat Exporter-2.4.2.user.js'), 'utf8');
function* files(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else yield full;
  }
}
const expected = new Map();
for (const file of files(exportsRoot)) {
  if (!file.endsWith('/chat.json')) continue;
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (record.agent) expected.set(record.agent.id, record.agent);
}
let tested = 0;
let failures = 0;
for (const file of files(pagesRoot)) {
  if (!file.toLowerCase().endsWith('.htm') || file.includes('_files/')) continue;
  const html = fs.readFileSync(file, 'utf8');
  // Decode Flight pushes without executing any scripts from the saved page.
  const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)/g)]
    .map((match) => JSON.parse(match[1]));
  const row = chunks.flatMap((chunk) => chunk.split('\n'))
    .find((line) => /^[0-9a-f]+:\{/.test(line) && line.includes('"triggerAddress"') && line.includes('"messages"'));
  if (!row) continue; // Regular /c/ chat: it does not contain an agent transcript.
  const id = JSON.parse(row.slice(row.indexOf(':') + 1)).triggerAddress;
  if (!expected.has(id)) {
    console.log(`SKIP  ${path.basename(path.dirname(file))}: no independent JSON export`);
    continue;
  }
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://arena.ai/search', runScripts: 'outside-only', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
  });
  const { window } = dom;
  const downloads = [];
  window.fetch = async () => ({ ok: true, text: async () => html });
  window.URL.createObjectURL = (blob) => { downloads.push(blob); return 'blob:captured'; };
  window.URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = () => {};
  const BlobClass = window.Blob;
  window.Blob = class CapturingBlob extends BlobClass {
    constructor(parts, options) { super(parts, options); this.parts = parts; }
  };
  try {
    await new Promise((resolve) => window.document.readyState === 'loading'
      ? window.addEventListener('DOMContentLoaded', resolve, { once: true }) : resolve());
    window.eval(source);
    await window.__arenaChatExport(id, 'json', 'agentic');
    const exported = JSON.parse(downloads[0].parts.join('')).agent;
    const reference = expected.get(id);
    const sameMessages = JSON.stringify(exported.messages) === JSON.stringify(reference.messages);
    const samePagination = JSON.stringify(exported.pagination) === JSON.stringify(reference.pagination);
    const noToken = !Object.hasOwn(exported.session || {}, 'publicAccessToken');
    const ok = sameMessages && samePagination && noToken;
    ++tested;
    if (!ok) ++failures;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  messages=${exported.messages.length}  ` +
      `messageParts=${sameMessages ? 'match' : 'DIFFER'}  pagination=${samePagination ? 'match' : 'DIFFER'}  tokenRedacted=${noToken}`);
  } catch (error) {
    ++tested; ++failures;
    console.log(`FAIL  ${id}  ${error.message}`);
  } finally {
    window.close();
  }
}
console.log(`${tested - failures}/${tested} agent DOM pages match independent JSON exports`);
process.exit(tested && !failures ? 0 : 1);
