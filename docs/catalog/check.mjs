#!/usr/bin/env node
// Страж единого каталога ROCH: сверяет цены и обещания в коде продуктов с docs/catalog/services.json.
// Только чтение. Код выхода 1 — есть ошибки (error), предупреждения (warn) не валят.
//   node docs/catalog/check.mjs            — отчёт
//   node docs/catalog/check.mjs --json     — отчёт машиной
// Корни репозиториев можно переопределить: ROCH_ART, ROCH_AI, ROCH_MOTION, ROCH_AUDIT.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CATALOG = JSON.parse(readFileSync(join(HERE, 'services.json'), 'utf8'));
const H = homedir();
const AS_JSON = process.argv.includes('--json');

const ROOTS = {
  'roch-art': process.env.ROCH_ART || join(HERE, '..', '..'),
  'roch-ai': process.env.ROCH_AI || join(H, 'code', 'roch-ai'),
  'motion': process.env.ROCH_MOTION || join(H, 'code', 'agents', '04_ROCH', 'движение'),
  'roch-audit-live': join(process.env.ROCH_AUDIT || join(H, 'code', 'roch-audit'), 'api'),
};

// Что считается «живым» текстом продукта: то, что видит клиент или модель.
const TEXT = new Set(['.html', '.js', '.mjs', '.ts', '.tsx', '.json', '.txt', '.md', '.xml']);
const SKIP_DIRS = new Set(['.git', 'node_modules', '.next', '.vercel', 'dist', 'build', 'coverage', '.turbo']);
const SCOPE = {
  // roch-art: всё, что уходит в деплой (без путей из .vercelignore)
  'roch-art': { ignore: vercelIgnore(ROOTS['roch-art']), skipExt: [] },
  // roch-ai: исходники приложения; документация и миграции — не клиентский текст
  'roch-ai': { only: ['app', 'lib', 'components', 'public'], skipExt: ['.md'], skipFiles: ['package-lock.json'] },
  'roch-audit-live': { skipExt: ['.md'] },
};

function vercelIgnore(root) {
  const f = join(root, '.vercelignore');
  if (!existsSync(f)) return [];
  return readFileSync(f, 'utf8').split('\n').map(s => s.trim())
    .filter(s => s && !s.startsWith('#')).map(s => s.replace(/^\//, '').replace(/\/$/, ''));
}

// Подмножество синтаксиса .vercelignore, которое встречается у нас: каталог (docs) и маска по расширению (*.md)
function ignored(rel, ig) {
  if (ig.startsWith('*.')) return rel.endsWith(ig.slice(1));
  return rel === ig || rel.startsWith(ig + '/');
}

function walk(repo) {
  const root = ROOTS[repo];
  if (!root || !existsSync(root)) return null;
  const sc = SCOPE[repo] || {};
  const out = [];
  const starts = sc.only ? sc.only.map(d => join(root, d)).filter(existsSync) : [root];
  const stack = [...starts];
  while (stack.length) {
    const p = stack.pop();
    const rel = relative(root, p);
    if (sc.ignore && sc.ignore.some(ig => ignored(rel, ig))) continue;
    const st = statSync(p);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(p.split('/').pop())) continue;
      for (const n of readdirSync(p)) stack.push(join(p, n));
    } else if (st.isFile()) {
      const ext = extname(p).toLowerCase();
      if (!TEXT.has(ext) || (sc.skipExt || []).includes(ext)) continue;
      if ((sc.skipFiles || []).includes(p.split('/').pop())) continue;
      if (st.size > 3_000_000) continue; // сборки и дампы — не источник текста
      out.push({ abs: p, rel });
    }
  }
  return out;
}

const cache = {};
const filesOf = repo => (repo in cache ? cache[repo] : (cache[repo] = walk(repo)));
const read = abs => readFileSync(abs, 'utf8');
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;
const snippet = (text, idx) => text.slice(Math.max(0, idx - 30), idx + 60).replace(/\s+/g, ' ').trim();
// Совпадение внутри комментария клиент не видит — это не расхождение, а история.
const inComment = (text, idx) => {
  const line = text.slice(text.lastIndexOf('\n', idx - 1) + 1, idx);
  if (/(^|[^:"'])\/\//.test(line)) return true;
  return line.lastIndexOf('/*') > line.lastIndexOf('*/');
};

const findings = [];
const skipped = new Set();
const add = (f) => findings.push(f);

// 1) Закреплённые цены: значение в источнике продукта должно совпасть с каталогом
for (const pin of CATALOG.pins) {
  const root = ROOTS[pin.repo];
  const abs = root && join(root, pin.file);
  if (!abs || !existsSync(abs)) { skipped.add(`${pin.repo}/${pin.file}`); continue; }
  const text = read(abs);
  if (pin.contains) {
    if (!text.includes(pin.contains)) add({ severity: 'error', id: pin.id, where: `${pin.repo}/${pin.file}`, msg: `нет «${pin.contains}» — цена каталога пропала со страницы` });
    continue;
  }
  const m = new RegExp(pin.regex, 's').exec(text);
  if (!m) add({ severity: 'error', id: pin.id, where: `${pin.repo}/${pin.file}`, msg: 'шаблон не найден — код поменялся, обновите pin в services.json' });
  else if (m[1] !== pin.expect) add({ severity: 'error', id: pin.id, where: `${pin.repo}/${pin.file}:${lineOf(text, m.index)}`, msg: `в коде ${m[1]}, в каталоге ${pin.expect}` });
}

// 2) Снятые цены и обещания: не должны встречаться в живом тексте
for (const r of CATALOG.retired) {
  const re = new RegExp(r.regex, 'g');
  for (const repo of r.repos) {
    const files = filesOf(repo);
    if (!files) { skipped.add(repo); continue; }
    for (const f of files) {
      const text = read(f.abs);
      for (const m of text.matchAll(re)) {
        if (inComment(text, m.index)) continue;
        if ((r.allow || []).some(a => a.file === f.rel && snippet(text, m.index).includes(a.text))) continue;
        add({ severity: r.severity, id: r.id, decision: r.decision, where: `${repo}/${f.rel}:${lineOf(text, m.index)}`, msg: `${r.reason} — «${snippet(text, m.index)}»` });
      }
    }
  }
}

// 3) Проверки, которые сверяют продукты между собой
const motionSize = (() => {
  const p = join(ROOTS.motion, 'skill', 'fx', 'passports.json');
  if (!existsSync(p)) return null;
  const j = JSON.parse(read(p));
  return Object.keys(j.fx || {}).length || null;
})();

for (const d of CATALOG.dynamic_checks) {
  if (d.rule === 'markdown_in_deploy') {
    const files = filesOf('roch-art');
    if (!files) { skipped.add('roch-art'); continue; }
    for (const f of files) if (extname(f.rel) === '.md') add({ severity: d.severity, id: d.id, decision: d.decision, where: `roch-art/${f.rel}`, msg: d.reason });
  } else if (d.rule === 'events_allowlist') {
    const sAbs = join(ROOTS['roch-art'], 'index.html');
    const rAbs = join(ROOTS['roch-audit-live'], 'vibe-track.ts');
    if (!existsSync(sAbs) || !existsSync(rAbs)) { skipped.add('events'); continue; }
    const sent = new Set([...read(sAbs).matchAll(/track\(['"]([a-z_]+)['"]/g)].map(m => m[1]));
    const block = (read(rAbs).match(/const EVENTS[^{]*\{([\s\S]*?)\};/) || [])[1] || '';
    const allowed = new Set([...block.matchAll(/^\s*([a-z_]+)\s*:/gm)].map(m => m[1]));
    for (const e of sent) if (!allowed.has(e)) add({ severity: d.severity, id: d.id, where: 'roch-art/index.html → roch-audit/api/vibe-track.ts', msg: `событие «${e}» отправляется, но приёмник его отбрасывает (${d.reason})` });
  } else if (d.compare_with === 'motion_catalog_size') {
    if (!motionSize) { skipped.add('motion catalog'); continue; }
    const re = new RegExp(d.regex, 'g');
    for (const repo of d.repos) {
      const files = filesOf(repo);
      if (!files) { skipped.add(repo); continue; }
      for (const f of files) {
        const text = read(f.abs);
        for (const m of text.matchAll(re)) {
          if (Number(m[1]) !== motionSize) add({ severity: d.severity, id: d.id, where: `${repo}/${f.rel}:${lineOf(text, m.index)}`, msg: `на сайте ${m[1]}, в каталоге ${motionSize} — «${snippet(text, m.index)}»` });
        }
      }
    }
  }
}

// Отчёт
const errors = findings.filter(f => f.severity === 'error');
const warns = findings.filter(f => f.severity === 'warn');
if (AS_JSON) {
  console.log(JSON.stringify({ catalog: CATALOG.version, motionSize, errors, warns, skipped: [...skipped] }, null, 2));
} else {
  console.log(`Каталог ${CATALOG.version} · механик Motion: ${motionSize ?? '—'} · ошибок ${errors.length} · предупреждений ${warns.length}`);
  const byId = {};
  for (const f of findings) (byId[`${f.severity === 'error' ? '✗' : '!'} ${f.id}${f.decision ? ` [${f.decision}]` : ''}`] ||= []).push(f);
  for (const [k, list] of Object.entries(byId)) {
    console.log(`\n${k}`);
    for (const f of list) console.log(`  ${f.where}\n    ${f.msg}`);
  }
  if (skipped.size) console.log(`\nПропущено (нет на диске): ${[...skipped].join(', ')}`);
}
process.exit(errors.length ? 1 : 0);
