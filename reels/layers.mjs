#!/usr/bin/env node
/* ROCH Reels · static layers for compose.py — HTML on the project's palette, rendered headless into transparent PNGs.
   node reels/layers.mjs reels/beats/<slug>.json --lang=ru
   → reels/work/<slug>/layers-<lang>/ : bg, phone-under, bezel, glare, scrim, hook (+ word boxes), cap-N (+ word boxes), end-*.
   Words are rendered in place and their boxes saved, so compose.py can move every word on its own (kinetic captions). */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/homebrew/lib/node_modules/playwright');

const HERE = path.dirname(new URL(import.meta.url).pathname);
const A = { _: [] }; process.argv.slice(2).forEach((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); if (m) A[m[1]] = m[2] === undefined ? true : m[2]; else A._.push(a); });
const SPEC = JSON.parse(fs.readFileSync(A._[0], 'utf8')), LANG = A.lang || 'ru';
const LY = JSON.parse(fs.readFileSync(path.join(HERE, 'lib', 'layout.json'), 'utf8'));
const OUT = path.join(HERE, 'work', SPEC.slug, 'layers-' + LANG); fs.mkdirSync(OUT, { recursive: true });
const { W, H, SW, SH, SX, SY, SR, BZ, PAD, CAP_Y, CAP_W, LIME, BG } = LY;
const C = SPEC.color || '#FF4F8B';
const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const rgba = (h, a) => `rgba(${rgb(h).join(',')},${a})`;
const F = 'file://' + encodeURI(path.join(HERE, 'fonts')) + '/';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const T = (k) => SPEC[k + '_' + LANG] != null ? SPEC[k + '_' + LANG] : SPEC[k + '_ru'];

const css = `<meta charset="utf-8"><style>
@font-face{font-family:Unb;src:url(${F}unbounded-cyrillic.woff2) format('woff2');font-weight:200 900;unicode-range:U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}
@font-face{font-family:Unb;src:url(${F}unbounded-latin.woff2) format('woff2');font-weight:200 900}
@font-face{font-family:Int;src:url(${F}inter-var-cyrillic.woff2) format('woff2');font-weight:100 900;unicode-range:U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}
@font-face{font-family:Int;src:url(${F}inter-var-latin.woff2) format('woff2');font-weight:100 900}
html,body{margin:0;background:transparent}*{box-sizing:border-box}
.f{width:${W}px;height:${H}px;position:relative;overflow:hidden;color:#fff;font-family:Int,-apple-system,sans-serif;-webkit-font-smoothing:antialiased}
.w{display:inline-block;white-space:pre}
.acc{color:${C}}
</style>`;

/* «*слово*» in a caption → accent colour. Words become spans so their boxes can be measured. */
const words = (s, cls = '') => s.split(/(\s+)/).filter(Boolean).reduce((o, tok) => { if (/^\s+$/.test(tok)) return o + ' '; return o + `<span class="w ${cls}">${esc(tok)}</span>`; }, '');
const capHTML = (s) => { const parts = s.split(/(\*[^*]+\*)/); return parts.map((p) => /^\*.*\*$/.test(p) ? words(p.slice(1, -1), 'acc') : words(p)).join(''); };
const rr = (x, y, w, h, r) => `M${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h - r}A${r},${r} 0 0 1 ${x + w - r},${y + h}H${x + r}A${r},${r} 0 0 1 ${x},${y + h - r}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}Z`;

// the phone lives on its own canvas (PW×PH), screen at (PAD+BZ, PAD+BZ) — compose.py moves and scales it as one piece
const PW = SW + 2 * BZ + 2 * PAD, PH = SH + 2 * BZ + 2 * PAD, ox = PAD, oy = PAD, sx = PAD + BZ, sy = PAD + BZ;
const pages = {};
const [r0, g0, b0] = rgb(C);
// dark aurora tinted with the project colour; bigger than the frame so compose can drift it slowly
pages.bg = [1240, 2200, `<div style="width:1240px;height:2200px;position:relative;overflow:hidden;background:${BG}">
  <div style="position:absolute;left:-260px;top:-180px;width:1100px;height:900px;border-radius:50%;background:radial-gradient(closest-side,${rgba(C, .42)},${rgba(C, 0)});filter:blur(40px)"></div>
  <div style="position:absolute;right:-300px;top:520px;width:1000px;height:1000px;border-radius:50%;background:radial-gradient(closest-side,rgba(${Math.round(r0 * .55)},${Math.round(g0 * .35)},${Math.min(255, Math.round(b0 * 1.1 + 40))},.38),rgba(0,0,0,0));filter:blur(50px)"></div>
  <div style="position:absolute;left:-200px;bottom:-260px;width:1200px;height:900px;border-radius:50%;background:radial-gradient(closest-side,${rgba(C, .30)},${rgba(C, 0)});filter:blur(60px)"></div>
  <div style="position:absolute;left:380px;top:1180px;width:700px;height:520px;border-radius:50%;background:radial-gradient(closest-side,${rgba(LIME, .07)},${rgba(LIME, 0)});filter:blur(40px)"></div>
  <div style="position:absolute;inset:0;background:radial-gradient(120% 70% at 50% 45%,rgba(0,0,0,0) 0%,rgba(0,0,0,.35) 70%,rgba(0,0,0,.62) 100%)"></div>
  <svg width="1240" height="2200" style="position:absolute;inset:0;opacity:.07;mix-blend-mode:screen"><filter id="n"><feTurbulence baseFrequency=".85" numOctaves="2" seed="5"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg></div>`, true];
// body + long soft shadow + a faint glow of the brand colour around the phone
pages['phone-under'] = [PW, PH, `<div style="width:${PW}px;height:${PH}px;position:relative"><div style="position:absolute;left:${ox}px;top:${oy}px;width:${SW + 2 * BZ}px;height:${SH + 2 * BZ}px;border-radius:${SR + BZ}px;background:#08080A;
  box-shadow:0 70px 120px -30px rgba(0,0,0,.85),0 24px 50px -16px rgba(0,0,0,.6),0 0 140px -20px ${rgba(C, .35)}"></div></div>`];
// the frame is a RING (SVG even-odd: outer minus screen) — a filled frame would paint over the screen (РОЛИК, LEARNINGS 24.10)
pages.bezel = [PW, PH, `<svg width="${PW}" height="${PH}"><defs>
  <linearGradient id="m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4A4A52"/><stop offset=".18" stop-color="#141417"/><stop offset=".55" stop-color="#0E0E11"/><stop offset=".85" stop-color="#1D1D22"/><stop offset="1" stop-color="#55555E"/></linearGradient></defs>
  <path fill="url(#m)" fill-rule="evenodd" d="${rr(ox, oy, SW + 2 * BZ, SH + 2 * BZ, SR + BZ)} ${rr(sx, sy, SW, SH, SR)}"/>
  <path fill="none" stroke="rgba(255,255,255,.28)" stroke-width="1.6" d="${rr(ox + .8, oy + .8, SW + 2 * BZ - 1.6, SH + 2 * BZ - 1.6, SR + BZ - .8)}"/>
  <path fill="none" stroke="#020203" stroke-width="3" d="${rr(sx - 1.5, sy - 1.5, SW + 3, SH + 3, SR + 1.5)}"/></svg>`];
// soft reflection over the glass: a diagonal sheen, low enough not to wash the UI
pages.glare = [PW, PH, `<svg width="${PW}" height="${PH}"><defs><clipPath id="s"><path d="${rr(sx, sy, SW, SH, SR)}"/></clipPath>
  <linearGradient id="g" x1="0" y1="0" x2="1" y2=".62"><stop offset="0" stop-color="#fff" stop-opacity=".11"/><stop offset=".28" stop-color="#fff" stop-opacity=".035"/><stop offset=".42" stop-color="#fff" stop-opacity="0"/>
  <stop offset=".70" stop-color="#fff" stop-opacity="0"/><stop offset=".78" stop-color="#fff" stop-opacity=".03"/><stop offset=".86" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
  <rect x="${sx}" y="${sy}" width="${SW}" height="${SH}" fill="url(#g)" clip-path="url(#s)"/></svg>`];
// darkening behind the caption, above the phone when the camera pushes in
pages.scrim = [W, 480, `<div style="width:${W}px;height:480px;background:linear-gradient(180deg,rgba(5,6,8,.9) 0%,rgba(5,6,8,.84) 52%,rgba(5,6,8,.4) 76%,rgba(5,6,8,0) 100%)"></div>`];

const fitText = async (page, html, sel, maxW, maxLines, sizes) => {
  for (const fs_ of sizes) {
    await setHTML(html.replace(/__FS__/g, fs_));
    await page.evaluate(() => document.fonts.ready);
    const lines = await page.evaluate((s) => { const ws = [...document.querySelectorAll(s + ' .w')]; return new Set(ws.map((w) => Math.round(w.getBoundingClientRect().top))).size; }, sel);
    if (lines <= maxLines) return fs_;
  }
  return sizes[sizes.length - 1];
};
const boxes = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s + ' .w')].map((w) => { const r = w.getBoundingClientRect(); return [Math.floor(r.left) - 10, Math.floor(r.top) - 14, Math.ceil(r.width) + 20, Math.ceil(r.height) + 30]; }), sel);
/* every word alone (the others hidden) → its own PNG: crops of the whole line would drag a neighbour's descender along */
const wordShots = async (sel, bx, prefix) => { for (let k = 0; k < bx.length; k++) {
  await page.evaluate(([s, k]) => document.querySelectorAll(s + ' .w').forEach((w, j) => { w.style.visibility = j === k ? 'visible' : 'hidden'; }), [sel, k]);
  const [x, y, w, h] = bx[k]; await page.screenshot({ path: path.join(OUT, `${prefix}-w${k}.png`), omitBackground: true, clip: { x: Math.max(0, x), y: Math.max(0, y), width: w, height: h } }); }
  await page.evaluate((s) => document.querySelectorAll(s + ' .w').forEach((w) => { w.style.visibility = 'visible'; }), sel); };

/* fonts are file:// — they only load into a file:// page (setContent = about:blank, where they silently fall back to a serif) */
const TMPH = path.join(OUT, '_tmp.html');
const setHTML = async (html) => { fs.writeFileSync(TMPH, css + html); await page.goto('file://' + TMPH); await page.evaluate(() => document.fonts.ready);
  const ok = await page.evaluate(() => document.fonts.check('800 40px Unb', 'Мама') && document.fonts.check('800 40px Int', 'Мама'));
  if (!ok) await page.evaluate(() => Promise.all([document.fonts.load('800 40px Unb', 'Мама'), document.fonts.load('800 40px Int', 'Мама'), document.fonts.load('600 40px Int', 'Мама')])); };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
const shot = async (html, name, w, h, opaque) => {
  await page.setViewportSize({ width: w, height: h }); await setHTML(html); await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.complete ? 1 : new Promise((r) => { i.onload = i.onerror = r; }))));
  await page.waitForTimeout(80); await page.screenshot({ path: path.join(OUT, name + '.png'), omitBackground: !opaque, clip: { x: 0, y: 0, width: w, height: h } });
};
for (const [k, [w, h, html, opaque]] of Object.entries(pages)) await shot(html, k, w, h, opaque);

// captions: Inter 800, two lines at most, centred on CAP_Y; the font shrinks until it fits
const meta = { lang: LANG, phone: { PW, PH, ox, oy, sx, sy }, caps: [] };
await page.setViewportSize({ width: W, height: H });
for (let i = 0; i < SPEC.beats.length; i++) {
  const text = SPEC.beats[i]['cap_' + LANG] || SPEC.beats[i].cap_ru || '';
  const html = `<div class="f"><div id="c" style="position:absolute;left:${(W - CAP_W) / 2}px;width:${CAP_W}px;top:${CAP_Y}px;transform:translateY(-50%);text-align:center;font-weight:800;font-size:__FS__px;line-height:1.12;letter-spacing:-.028em;text-wrap:balance">${capHTML(text)}</div></div>`;
  const fs_ = await fitText(page, html, '#c', CAP_W, 2, [62, 58, 54, 50, 46]);
  await setHTML(html.replace(/__FS__/g, fs_)); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(60);
  const bx = (await boxes(page, '#c')).map(([x, y, w, h]) => [Math.max(0, x), Math.max(0, y), w, h]);
  await page.screenshot({ path: path.join(OUT, `cap-${i}.png`), omitBackground: true });
  await wordShots('#c', bx, `cap-${i}`);
  meta.caps.push({ text, size: fs_, words: bx });
}
// hook: the customer's idea, big (Unbounded 800, tight), in guillemets
{
  const idea = (LANG === 'ru' ? '«' : '“') + (SPEC['idea_' + LANG] || SPEC.idea_ru) + (LANG === 'ru' ? '»' : '”');
  const html = `<div class="f"><div id="h" style="position:absolute;left:60px;width:960px;top:840px;transform:translateY(-50%);text-align:center;font-family:Unb;font-weight:800;font-size:__FS__px;line-height:1.08;letter-spacing:-.045em;text-wrap:balance">${words(idea)}</div></div>`;
  const fs_ = await fitText(page, html, '#h', 960, 3, [112, 104, 96, 88, 80, 72]);
  await setHTML(html.replace(/__FS__/g, fs_)); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(60);
  meta.hook = { text: idea, size: fs_, words: (await boxes(page, '#h')).map(([x, y, w, h]) => [Math.max(0, x), Math.max(0, y), w, h]) };
  await page.screenshot({ path: path.join(OUT, 'hook.png'), omitBackground: true });
  await wordShots('#h', meta.hook.words, 'hook');
}
// end card: logo · name · niche · ROCH credit (separate layers so compose can bring them in one by one)
const credit = LANG === 'ru' ? 'Упаковано <b>ROCH 0→1</b> · roch-art.com' : 'Packaged by <b>ROCH 0→1</b> · roch-art.com';
const end = {
  'end-logo': SPEC.logo ? `<div class="f"><div style="position:absolute;left:${W / 2 - 92}px;top:520px;width:184px;height:184px;border-radius:50%;background:#0B0B0E;box-shadow:0 0 0 2px ${rgba(C, .55)},0 0 90px ${rgba(C, .45)},0 30px 60px -20px rgba(0,0,0,.8);overflow:hidden;display:grid;place-items:center">
     <img src="${SPEC.logo}" style="width:150px;height:150px;object-fit:contain"></div></div>` : '<div class="f"></div>',
  'end-name': `<div class="f"><div style="position:absolute;left:0;right:0;top:770px;text-align:center;font-family:Unb;font-weight:800;font-size:${SPEC.name.length > 9 ? 104 : 136}px;letter-spacing:-.04em;line-height:1;text-shadow:0 0 60px ${rgba(C, .45)}">${esc(SPEC.name)}</div></div>`,
  'end-niche': `<div class="f"><div style="position:absolute;left:120px;right:120px;top:${SPEC.name.length > 9 ? 920 : 950}px;text-align:center;font-weight:600;font-size:42px;line-height:1.25;letter-spacing:-.015em;color:rgba(236,240,238,.78);text-wrap:balance">${esc(T('niche'))}</div></div>`,
  'end-credit': `<div class="f"><div style="position:absolute;left:0;right:0;top:1390px;display:flex;justify-content:center"><div style="display:flex;align-items:center;gap:16px;padding:20px 34px;border-radius:99px;background:${rgba(LIME, .10)};box-shadow:inset 0 0 0 1.5px ${rgba(LIME, .38)};font-weight:600;font-size:34px;letter-spacing:-.01em;color:rgba(240,246,240,.92)">
     <i style="width:12px;height:12px;border-radius:50%;background:${LIME};box-shadow:0 0 14px ${LIME}"></i><span>${credit.replace('<b>', `<b style="color:${LIME};font-weight:800">`)}</span></div></div></div>`
};
for (const [k, html] of Object.entries(end)) await shot(html, k, W, H, false);
fs.writeFileSync(path.join(OUT, 'layers.json'), JSON.stringify(meta, null, 1));
await browser.close(); fs.rmSync(TMPH, { force: true });
console.log('layers →', OUT);
