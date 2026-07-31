/*
    Christian Larsen, 2026
    "RPG structure"
    scripts/generate-docs.js

    Generates a personal, offline-only HTML reference of the project's structure (every function,
    class, method, interface, type, and top-level constant, exported or not, with its JSDoc) into
    docs-private/ — a folder .gitignore keeps out of the repo entirely. Re-run any time after
    changing the source to refresh it: `npm run docs:generate`.
*/

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const SRC_DIR = path.join(__dirname, '..', 'src');
const OUT_DIR = path.join(__dirname, '..', 'docs-private');
const OUT_FILE = path.join(OUT_DIR, 'index.html');

/** Recursively collects every .ts file under `dir`. */
function collectTsFiles(dir) {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...collectTsFiles(full));
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
            results.push(full);
        };
    };
    return results;
};

/** Extracts a node's leading /** ... *\/ JSDoc comment, stripped of the `*`-prefix on each line. */
function getJsDoc(sourceFile, node) {
    const ranges = ts.getLeadingCommentRanges(sourceFile.text, node.getFullStart()) || [];
    if (ranges.length === 0) return '';

    const last = ranges[ranges.length - 1];
    const raw = sourceFile.text.slice(last.pos, last.end);
    if (!raw.startsWith('/**')) return '';

    return raw
        .replace(/^\/\*\*/, '')
        .replace(/\*\/$/, '')
        .split('\n')
        .map(line => line.replace(/^\s*\* ?/, ''))
        .join('\n')
        .trim();
};

/** The very first block comment in the file (the "Christian Larsen, 2026 ..." banner), if any. */
function getFileBanner(sourceFile) {
    const ranges = ts.getLeadingCommentRanges(sourceFile.text, 0) || [];
    if (ranges.length === 0) return '';
    const raw = sourceFile.text.slice(ranges[0].pos, ranges[0].end);
    return raw.replace(/^\/\*/, '').replace(/\*\/$/, '').trim();
};

/** Raw source text of `node`, from its start up to (not including) `stopNode`'s start — i.e. the
 * signature without the body — falling back to the node's own full text when there's no body. */
function signatureText(sourceFile, node, stopNode) {
    const start = node.getStart(sourceFile);
    const end = stopNode ? stopNode.getStart(sourceFile) : node.getEnd();
    let text = sourceFile.text.slice(start, end).trim();
    text = text.replace(/\s*\{?\s*$/, '');
    return text;
};

/** Line number (1-based) a node starts on, for a "where is this" reference. */
function lineOf(sourceFile, node) {
    return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
};

function isExported(node) {
    return !!(ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export);
};

const MAX_CONST_PREVIEW = 1200;

/** Extracts every top-level (and, for classes, member-level) declaration worth documenting. */
function extractSymbols(sourceFile) {
    const symbols = [];

    function extractClassMembers(node) {
        const members = [];
        node.members.forEach((member) => {
            const name = member.name ? member.name.getText(sourceFile) : '(constructor)';
            const doc = getJsDoc(sourceFile, member);
            const line = lineOf(sourceFile, member);

            if (ts.isConstructorDeclaration(member)) {
                members.push({ kind: 'constructor', name: 'constructor', doc, line, signature: signatureText(sourceFile, member, member.body) });
            } else if (ts.isMethodDeclaration(member)) {
                members.push({ kind: 'method', name, doc, line, signature: signatureText(sourceFile, member, member.body) });
            } else if (ts.isPropertyDeclaration(member)) {
                members.push({ kind: 'property', name, doc, line, signature: signatureText(sourceFile, member, undefined).replace(/;$/, '') });
            } else if (ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) {
                const prefix = ts.isGetAccessorDeclaration(member) ? 'get ' : 'set ';
                members.push({ kind: 'accessor', name: prefix + name, doc, line, signature: signatureText(sourceFile, member, member.body) });
            };
        });
        return members;
    };

    ts.forEachChild(sourceFile, (node) => {
        if (ts.isFunctionDeclaration(node) && node.name) {
            symbols.push({
                kind: 'function',
                name: node.name.getText(sourceFile),
                exported: isExported(node),
                doc: getJsDoc(sourceFile, node),
                line: lineOf(sourceFile, node),
                signature: signatureText(sourceFile, node, node.body)
            });
        } else if (ts.isClassDeclaration(node) && node.name) {
            symbols.push({
                kind: 'class',
                name: node.name.getText(sourceFile),
                exported: isExported(node),
                doc: getJsDoc(sourceFile, node),
                line: lineOf(sourceFile, node),
                signature: node.getText(sourceFile).split('{')[0].trim(),
                members: extractClassMembers(node)
            });
        } else if (ts.isInterfaceDeclaration(node)) {
            symbols.push({
                kind: 'interface', name: node.name.getText(sourceFile), exported: isExported(node),
                doc: getJsDoc(sourceFile, node), line: lineOf(sourceFile, node), signature: node.getText(sourceFile)
            });
        } else if (ts.isTypeAliasDeclaration(node)) {
            symbols.push({
                kind: 'type', name: node.name.getText(sourceFile), exported: isExported(node),
                doc: getJsDoc(sourceFile, node), line: lineOf(sourceFile, node), signature: node.getText(sourceFile)
            });
        } else if (ts.isEnumDeclaration(node)) {
            symbols.push({
                kind: 'enum', name: node.name.getText(sourceFile), exported: isExported(node),
                doc: getJsDoc(sourceFile, node), line: lineOf(sourceFile, node), signature: node.getText(sourceFile)
            });
        } else if (ts.isVariableStatement(node)) {
            const exported = isExported(node);
            for (const decl of node.declarationList.declarations) {
                if (!decl.name || !ts.isIdentifier(decl.name)) continue;
                const name = decl.name.getText(sourceFile);
                const init = decl.initializer;

                if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
                    symbols.push({
                        kind: 'function', name, exported,
                        doc: getJsDoc(sourceFile, node), line: lineOf(sourceFile, node),
                        signature: signatureText(sourceFile, node, init.body)
                    });
                } else {
                    let full = node.getText(sourceFile);
                    if (full.length > MAX_CONST_PREVIEW) {
                        full = full.slice(0, MAX_CONST_PREVIEW) + '\n  /* … truncated … */';
                    };
                    symbols.push({
                        kind: 'const', name, exported,
                        doc: getJsDoc(sourceFile, node), line: lineOf(sourceFile, node), signature: full
                    });
                };
            };
        };
    });

    return symbols;
};

function buildFileEntry(filePath) {
    const relPath = path.relative(SRC_DIR, filePath).split(path.sep).join('/');
    const text = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

    return {
        path: relPath,
        dir: path.dirname(relPath) === '.' ? '' : path.dirname(relPath),
        banner: getFileBanner(sourceFile),
        symbols: extractSymbols(sourceFile)
    };
};

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
};

function render(files) {
    const totalSymbols = files.reduce((sum, f) => sum + f.symbols.length +
        f.symbols.reduce((s2, sym) => s2 + (sym.members ? sym.members.length : 0), 0), 0);

    const dataJson = JSON.stringify(files)
        .replace(/</g, '\\u003c')
        .replace(/-->/g, '--\\>');

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>dspf-edit — Personal Reference</title>
<style>
${CSS}
</style>
</head>
<body>
<div id="app">
  <nav id="sidebar">
    <div id="sidebarHeader">
      <div id="title">dspf-edit reference</div>
      <div id="subtitle">${files.length} files · ${totalSymbols} symbols · generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')}</div>
      <input id="search" type="text" placeholder="Search functions, classes, types…" autocomplete="off">
    </div>
    <div id="tree"></div>
  </nav>
  <main id="content">
    <div id="welcome">
      <h1>dspf-edit — Personal Reference</h1>
      <p>Local-only reference generated from the project's own JSDoc comments (every function, method,
      class, interface, type, and top-level constant — exported or not). Not part of the repo:
      regenerate any time with <code>npm run docs:generate</code>.</p>
      <p>Pick a file on the left, or search above.</p>
    </div>
  </main>
</div>
<script>
const DATA = ${dataJson};
${JS}
</script>
</body>
</html>`;
};

const CSS = `
:root {
  --bg: #1e1e1e; --bg2: #252526; --fg: #d4d4d4; --muted: #8a8a8a; --accent: #4fc1ff;
  --border: #3a3a3a; --code-bg: #161616; --kind-fn: #dcdcaa; --kind-class: #4ec9b0;
  --kind-iface: #b8d7a3; --kind-type: #c586c0; --kind-const: #9cdcfe; --kind-method: #dcdcaa;
}
@media (prefers-color-scheme: light) {
  :root { --bg:#fff; --bg2:#f3f3f3; --fg:#1e1e1e; --muted:#666; --accent:#0066cc; --border:#ddd; --code-bg:#f6f6f6; }
}
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--fg); }
#app { display: flex; height: 100vh; }
#sidebar { width: 320px; flex-shrink: 0; background: var(--bg2); border-right: 1px solid var(--border); overflow-y: auto; display: flex; flex-direction: column; }
#sidebarHeader { padding: 14px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--bg2); z-index: 1; }
#title { font-weight: 700; font-size: 15px; }
#subtitle { font-size: 11px; color: var(--muted); margin: 4px 0 10px; }
#search { width: 100%; padding: 7px 9px; background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: 6px; font-size: 13px; }
#tree { padding: 6px; font-size: 13px; }
.dir-group { margin-bottom: 4px; }
.dir-label { padding: 6px 8px; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
.file-item { padding: 5px 10px 5px 16px; cursor: pointer; border-radius: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.file-item:hover { background: rgba(128,128,128,.15); }
.file-item.active { background: var(--accent); color: #fff; }
#content { flex: 1; overflow-y: auto; padding: 32px 44px; max-width: 980px; }
#welcome code { background: var(--code-bg); padding: 2px 6px; border-radius: 4px; }
h1 { font-size: 22px; }
h2.file-title { font-size: 20px; border-bottom: 1px solid var(--border); padding-bottom: 10px; margin-bottom: 4px; }
.banner { color: var(--muted); font-size: 12.5px; margin-bottom: 24px; white-space: pre-wrap; }
.symbol { border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; margin-bottom: 14px; background: var(--bg2); }
.symbol-header { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.kind-badge { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; padding: 2px 7px; border-radius: 10px; background: var(--code-bg); color: var(--muted); border: 1px solid var(--border); }
.symbol-name { font-weight: 700; font-size: 14.5px; font-family: "SF Mono", Menlo, monospace; }
.symbol-name.fn { color: var(--kind-fn); } .symbol-name.class { color: var(--kind-class); }
.symbol-name.interface { color: var(--kind-iface); } .symbol-name.type { color: var(--kind-type); }
.symbol-name.const { color: var(--kind-const); } .symbol-name.method { color: var(--kind-method); }
.not-exported { font-size: 10px; color: var(--muted); border: 1px solid var(--border); padding: 1px 6px; border-radius: 8px; }
.line-ref { margin-left: auto; font-size: 11px; color: var(--muted); }
pre.signature { background: var(--code-bg); border-radius: 6px; padding: 10px 12px; overflow-x: auto; font-size: 12.5px; margin: 10px 0 0; }
.doc { font-size: 13px; line-height: 1.55; margin-top: 10px; white-space: pre-wrap; }
.members { margin-top: 12px; padding-left: 16px; border-left: 2px solid var(--border); }
.member { margin-top: 12px; }
mark { background: #ffd54f; color: #000; border-radius: 2px; }
#searchResults .file-item { padding-left: 10px; }
.search-hit-name { font-family: "SF Mono", Menlo, monospace; font-size: 12px; color: var(--accent); }
`;

const JS = `
const sidebar = document.getElementById('tree');
const content = document.getElementById('content');
const search = document.getElementById('search');

function kindClass(kind) {
  if (kind === 'function') return 'fn';
  if (kind === 'class') return 'class';
  if (kind === 'interface') return 'interface';
  if (kind === 'type') return 'type';
  if (kind === 'const') return 'const';
  return 'method';
}

function renderSymbol(sym, filePath) {
  const exportedBadge = sym.exported === false ? '<span class="not-exported">module-private</span>' : '';
  let html = '<div class="symbol" id="' + filePath + '::' + sym.name + '">'
    + '<div class="symbol-header">'
    + '<span class="kind-badge">' + sym.kind + '</span>'
    + '<span class="symbol-name ' + kindClass(sym.kind) + '">' + escapeHtml(sym.name) + '</span>'
    + exportedBadge
    + '<span class="line-ref">line ' + sym.line + '</span>'
    + '</div>';
  if (sym.doc) html += '<div class="doc">' + escapeHtml(sym.doc) + '</div>';
  html += '<pre class="signature">' + escapeHtml(sym.signature) + '</pre>';
  if (sym.members && sym.members.length) {
    html += '<div class="members">';
    for (const m of sym.members) {
      html += '<div class="member">'
        + '<div class="symbol-header"><span class="kind-badge">' + m.kind + '</span>'
        + '<span class="symbol-name method">' + escapeHtml(m.name) + '</span>'
        + '<span class="line-ref">line ' + m.line + '</span></div>';
      if (m.doc) html += '<div class="doc">' + escapeHtml(m.doc) + '</div>';
      html += '<pre class="signature">' + escapeHtml(m.signature) + '</pre></div>';
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function showFile(file) {
  document.querySelectorAll('.file-item').forEach(el => el.classList.toggle('active', el.dataset.path === file.path));
  let html = '<h2 class="file-title">' + file.path + '</h2>';
  if (file.banner) html += '<div class="banner">' + escapeHtml(file.banner) + '</div>';
  if (file.symbols.length === 0) html += '<p style="color:var(--muted)">No documented top-level symbols in this file.</p>';
  for (const sym of file.symbols) html += renderSymbol(sym, file.path);
  content.innerHTML = html;
  content.scrollTop = 0;
}

function buildTree() {
  const byDir = {};
  for (const f of DATA) {
    (byDir[f.dir] = byDir[f.dir] || []).push(f);
  }
  const dirs = Object.keys(byDir).sort();
  let html = '';
  for (const dir of dirs) {
    html += '<div class="dir-group"><div class="dir-label">' + (dir || '(root)') + '</div>';
    for (const f of byDir[dir].sort((a, b) => a.path.localeCompare(b.path))) {
      const short = f.path.split('/').pop();
      html += '<div class="file-item" data-path="' + f.path + '">' + short + '</div>';
    }
    html += '</div>';
  }
  sidebar.innerHTML = html;
  sidebar.addEventListener('click', (e) => {
    const item = e.target.closest('.file-item');
    if (!item) return;
    const file = DATA.find(f => f.path === item.dataset.path);
    if (file) showFile(file);
  });
}

function runSearch(query) {
  const q = query.trim().toLowerCase();
  if (!q) { buildTree(); return; }

  const hits = [];
  for (const f of DATA) {
    for (const sym of f.symbols) {
      if (sym.name.toLowerCase().includes(q)) hits.push({ file: f, sym });
      for (const m of (sym.members || [])) {
        if (m.name.toLowerCase().includes(q)) hits.push({ file: f, sym: m, parent: sym.name });
      }
    }
  }

  let html = '<div class="dir-group"><div class="dir-label">' + hits.length + ' matches</div>';
  for (const hit of hits.slice(0, 300)) {
    const label = (hit.parent ? hit.parent + '.' : '') + hit.sym.name;
    html += '<div class="file-item" data-path="' + hit.file.path + '" data-anchor="' + hit.file.path + '::' + (hit.parent || hit.sym.name) + '">'
      + '<span class="search-hit-name">' + label + '</span> <span style="color:var(--muted)">— ' + hit.file.path + '</span></div>';
  }
  html += '</div>';
  sidebar.innerHTML = html;
  sidebar.querySelectorAll('.file-item').forEach(el => {
    el.addEventListener('click', () => {
      const file = DATA.find(f => f.path === el.dataset.path);
      if (!file) return;
      showFile(file);
      const anchor = document.getElementById(el.dataset.anchor);
      if (anchor) anchor.scrollIntoView({ block: 'start' });
    });
  });
}

search.addEventListener('input', () => runSearch(search.value));
buildTree();
if (DATA.length) showFile(DATA[0]);
`;

// MAIN

const files = collectTsFiles(SRC_DIR)
    .map(buildFileEntry)
    .sort((a, b) => a.path.localeCompare(b.path));

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, render(files), 'utf8');

const totalSymbols = files.reduce((sum, f) => sum + f.symbols.length, 0);
console.log(`Generated ${OUT_FILE}`);
console.log(`${files.length} files, ${totalSymbols} top-level symbols documented.`);
