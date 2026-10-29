#!/usr/bin/env node
/* ROCH Reels · recorder. Records a LIVE web app (TMA prototype) by the beats of reels/beats/<slug>.json.
   Raw system Chrome (headless=new, --use-angle=metal: ~50 fps here; swiftshader gives 5–7) + CDP screencast;
   every frame keeps its own timestamp (clock.json), every beat and step is marked on that same clock (markers.json).

   node reels/record.mjs reels/beats/<slug>.json [--takes=2] [--take=N] [--dsf=2] [--shots] [--no-frames] [--max-load=24]

   → reels/work/<slug>/take-N/{full.mp4, clock.json, markers.json, frames/*.jpg, shots/*.png}
   → reels/work/<slug>/best.json (with 2+ takes: the smoothest take per beat, by the worst frame gap inside the beat)

   Beat file (the only per-project input) — see reels/README.md. Per beat: either a single action
   {do, target, value, hold_ms} or {pre:[steps cut out of the film], steps:[steps that are the film]}.
   Step kinds: tap · type · key · scroll · wait · eval. Targets: 'text:Start of label' or a CSS selector. */
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const A = { _: [] }; process.argv.slice(2).forEach((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); if (m) A[m[1]] = m[2] === undefined ? true : m[2]; else A._.push(a); });
if (!A._[0]) { console.error('usage: node reels/record.mjs reels/beats/<slug>.json [--takes=2]'); process.exit(2); }
const SPEC = JSON.parse(fs.readFileSync(A._[0], 'utf8'));
/* EN-дубль (Роч 28.10: «интерфейсы на английском»): интерфейс переводится словарём beats/<slug>.en.json только на время
   записи, само приложение остаётся русским. Ключ — русская строка (пробелы схлопнуты), "re:<регулярка>" — для строк с числами */
const LANG = A.lang === 'en' ? 'en' : 'ru';
const DICT = LANG === 'en' ? JSON.parse(fs.readFileSync(A.dict || A._[0].replace(/\.json$/, '.en.json'), 'utf8')) : null;
const LOCALE = LANG === 'en' ? 'en-US' : (SPEC.locale || 'ru-RU');
const VP = Object.assign({ w: 390, h: 844, dsf: 2 }, SPEC.viewport || {});
const VW = VP.w, VH = VP.h, DSF = +(A.dsf || VP.dsf);
const WORK = LANG === 'en' ? path.join(HERE, 'work', SPEC.slug, 'en') : path.join(HERE, 'work', SPEC.slug);
const STUB = fs.readFileSync(path.join(HERE, 'lib', 'tg-stub.js'), 'utf8');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now() / 1000;

/* runs in the page, not in node: text nodes and attributes are translated as the app renders them; the original Russian text is
   kept per node, so `text:<русская подпись>` targets keep working in the EN take; strings with no translation go to __reelMiss */
function reelI18n(D) {
  var N = {}, R = [], orig = new WeakMap(), miss = new Set(), CY = /[А-Яа-яЁё]/, AT = ['placeholder', 'title', 'aria-label', 'alt', 'data-placeholder'];
  var norm = function(v){ return String(v).replace(/\s+/g, ' ').trim(); };
  Object.keys(D).forEach(function(k){ if(k.indexOf('re:') === 0) R.push([new RegExp(k.slice(3), 'g'), D[k]]); else N[norm(k)] = D[k]; });
  var tr = function(v){
    var k = norm(v); if(!k || !CY.test(k)) return null;
    var m = String(v).match(/^(\s*)[\s\S]*?(\s*)$/);
    if(N[k] != null) return m[1] + N[k] + m[2];
    var o = k, hit = false;
    R.forEach(function(r){ var w = o.replace(r[0], r[1]); if(w !== o){ hit = true; o = w; } });
    if(!hit || CY.test(o)) miss.add(k);
    return hit ? m[1] + o + m[2] : null;
  };
  var doText = function(n){
    var v = n.nodeValue, p = n.parentNode;
    if(!v || !CY.test(v) || (p && /^(SCRIPT|STYLE|TEXTAREA|NOSCRIPT)$/.test(p.nodeName))) return;
    var t = tr(v); if(t == null || t === v) return;
    orig.set(n, v); n.nodeValue = t;
  };
  var doEl = function(e){
    if(!e.getAttribute) return;
    AT.forEach(function(a){ var v = e.getAttribute(a); if(v && CY.test(v)){ var t = tr(v); if(t != null && t !== v) e.setAttribute(a, t); } });
    if(e.tagName === 'INPUT' && /^(button|submit)$/i.test(e.type) && CY.test(e.value)){ var t2 = tr(e.value); if(t2) e.value = t2; }
  };
  var walk = function(root){
    if(root.nodeType === 3){ doText(root); return; }
    if(root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if(root.nodeType === 1) doEl(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT), n;
    while((n = w.nextNode())){ if(n.nodeType === 3) doText(n); else doEl(n); }
  };
  window.__reelMiss = miss;
  window.__reelOrigText = function(el){
    var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), n, s = '';
    while((n = w.nextNode())) s += orig.has(n) ? orig.get(n) : n.nodeValue;
    return norm(s);
  };
  var mo = new MutationObserver(function(ms){ ms.forEach(function(m){
    if(m.type === 'characterData') doText(m.target); else if(m.type === 'attributes') doEl(m.target); else m.addedNodes.forEach(walk);
  }); });
  var start = function(){ walk(document.documentElement); mo.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: AT.concat(['value']) }); };
  if(document.documentElement) start(); else document.addEventListener('readystatechange', start, { once: true });
}

/* the machine's load decides the film: at load 40+ clips stretch and taps miss (РОЛИК, грабли) */
async function waitLoad() {
  const max = +(A['max-load'] || 24);
  for (let i = 0; i < 60; i++) {
    const l = os.loadavg()[0];
    if (l <= max) { console.log('load', l.toFixed(1)); return; }
    if (i === 0) console.log('load', l.toFixed(1), '> ' + max + ' — waiting (up to 5 min)…');
    await sleep(5000);
  }
  console.log('load still high:', os.loadavg()[0].toFixed(1), '— recording anyway, check best.json');
}

async function take(n) {
  const OUT = path.join(WORK, 'take-' + n);
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
  const port = 9300 + Math.floor(Math.random() * 600), udir = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-'));
  const ch = spawn(CHROME, ['--headless=new', '--hide-scrollbars', '--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required', '--lang=' + LOCALE, '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port}`, `--user-data-dir=${udir}`, `--force-device-scale-factor=${DSF}`, `--window-size=${VW},${VH}`, 'about:blank'], { stdio: 'ignore' });
  const bye = () => { try { ch.kill('SIGKILL'); } catch (e) {} };
  process.on('exit', bye);
  let target = null;
  for (let i = 0; i < 160 && !target; i++) { await sleep(150); try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); target = l.find((t) => t.type === 'page'); } catch (e) {} }
  if (!target) throw new Error('Chrome did not start');
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pend = {}, frames = []; let rec = false; const errs = [];
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; return; }
    if (m.method === 'Page.screencastFrame') { send('Page.screencastFrameAck', { sessionId: m.params.sessionId }); if (rec) frames.push({ t: m.params.metadata.timestamp, data: m.params.data }); }
    else if (m.method === 'Fetch.requestPaused') {   // telegram-web-app.js → our stub (no Telegram outside Telegram)
      send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/javascript' }], body: Buffer.from(STUB).toString('base64') });
    } else if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text);
  });
  const ev = async (expr, arg) => {
    const r = await send('Runtime.evaluate', { expression: `(async(ARG)=>{ ${expr} })(${JSON.stringify(arg === undefined ? null : arg)})`, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 500));
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: DSF, mobile: true });
  try { await send('Emulation.setLocaleOverride', { locale: LOCALE }); } catch (e) {}
  await send('Page.enable'); await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*telegram-web-app.js*', requestStage: 'Request' }] });
  const P = Object.assign({}, SPEC.prep || {}, LANG === 'en' ? SPEC.prep_en || {} : {});
  /* fresh profile per take = clean storage; then the prep values, once, before the app's own scripts */
  const seedStore = `(function(){try{if(sessionStorage.getItem('__reel_seed'))return;sessionStorage.setItem('__reel_seed','1');localStorage.clear();
    var L=${JSON.stringify(P.localStorage || {})},S=${JSON.stringify(P.sessionStorage || {})};
    Object.keys(L).forEach(function(k){localStorage.setItem(k,typeof L[k]==='string'?L[k]:JSON.stringify(L[k]));});
    Object.keys(S).forEach(function(k){sessionStorage.setItem(k,typeof S[k]==='string'?S[k]:JSON.stringify(S[k]));});}catch(e){}})();`;
  await send('Page.addScriptToEvaluateOnNewDocument', { source: STUB + '\n' + seedStore + (DICT ? '\n(' + reelI18n.toString() + ')(' + JSON.stringify(DICT) + ');' : '') });
  const url = SPEC.url + (P.query ? (SPEC.url.includes('?') ? '&' : '?') + P.query.replace(/^\?/, '') : '');
  await send('Page.navigate', { url });
  const wf = P.waitFor || 'document.readyState==="complete"';
  const wfExpr = /^[.#\[a-z]/i.test(wf) && !/[()=&|!]/.test(wf) ? `!!document.querySelector(${JSON.stringify(wf)})` : wf;
  let ok = false; for (let i = 0; i < 120 && !ok; i++) { await sleep(250); ok = await ev(`try{return !!(${wfExpr});}catch(e){return false;}`).catch(() => false); }
  if (!ok) throw new Error('waitFor never became true: ' + wf);
  if (P.css) await ev(`var s=document.createElement('style');s.id='__reel_css';s.textContent=ARG;document.head.appendChild(s);return 1`, P.css);
  if (P.eval) await ev(P.eval);
  /* helpers inside the page: find a target by text or CSS, scroll only its nearest scroll container (never the page) */
  await ev(`window.__reel={
    vis:function(e){var r=e.getBoundingClientRect();if(!(r.width>0&&r.height>0))return false;var cs=getComputedStyle(e);return cs.visibility!=='hidden'&&cs.display!=='none'&&+cs.opacity>0.05;},
    top:function(e){var r=e.getBoundingClientRect(),x=Math.min(innerWidth-2,Math.max(1,r.left+r.width/2)),y=Math.min(innerHeight-2,Math.max(1,r.top+r.height/2)),h=document.elementFromPoint(x,y);return !!h&&(h===e||e.contains(h)||h.contains(e));},
    all:function(t){var L;if(t.indexOf('text:')===0){var tx=t.slice(5).trim();L=[].slice.call(document.querySelectorAll('button,a,label,input,textarea,[role=button],[data-act],[onclick],span,div,b,p,h1,h2,h3,h4,em,small,li,i'))
        .filter(function(x){if(x.children.length>=8)return false;if((x.textContent||'').replace(/\\s+/g,' ').trim().indexOf(tx)===0)return true;var o=window.__reelOrigText?__reelOrigText(x):'';return !!o&&o.indexOf(tx)===0;});}
      else L=[].slice.call(document.querySelectorAll(t));return L.filter(this.vis);},
    pick:function(t,nth){var L=this.all(t);if(!L.length)return null;if(nth!=null)return L[nth]||null;var self=this,on=L.filter(function(e){var r=e.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight&&self.top(e);});
      var c=on.length?on:L;return c.reduce(function(a,b){return a.contains(b)?b:(b.contains(a)?a:a);});},
    sc:function(e){for(var p=e.parentElement;p;p=p.parentElement){var cs=getComputedStyle(p);if(/(auto|scroll)/.test(cs.overflowY+cs.overflowX)&&(p.scrollHeight>p.clientHeight+2||p.scrollWidth>p.clientWidth+2))return p;}return null;},
    smooth:function(el,dx,dy,ms){return new Promise(function(res){var x0=el.scrollLeft,y0=el.scrollTop,t0=performance.now();(function s(){var k=Math.min(1,(performance.now()-t0)/ms),e=k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2;el.scrollLeft=x0+dx*e;el.scrollTop=y0+dy*e;if(k<1)requestAnimationFrame(s);else res();})();});},
    rect:function(e,ox,oy){var r=e.getBoundingClientRect();return {x:r.left+r.width*(ox==null?.5:ox),y:r.top+r.height*(oy==null?.5:oy),w:r.width,h:r.height,l:r.left,t:r.top};},
    find:async function(t,o){o=o||{};var e=null;for(var i=0;i<10&&!e;i++){e=this.pick(t,o.nth);if(!e)await new Promise(function(r){setTimeout(r,200);});}
      if(!e)return null;var r=e.getBoundingClientRect(),m=o.margin||90;
      if(r.top<m||r.bottom>innerHeight-m){var s=this.sc(e);if(s){var dy=r.top+r.height/2-innerHeight*(o.at||.46);await this.smooth(s,0,dy,o.scroll_ms||520);await new Promise(function(r){setTimeout(r,140);});}}
      return this.rect(e,o.ox,o.oy);}
  };return 1`);
  // warm every image on the page: a half-loaded photo on screen reads as a bug
  await ev(`await Promise.all([].slice.call(document.images).map(function(i){return i.complete?1:new Promise(function(r){i.onload=i.onerror=r;setTimeout(r,4000);});}));return 1`);
  await sleep(P.settle_ms || 1200);

  const M = { beats: [], taps: [], swipes: [] };
  const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1, pointerType: 'mouse' });
  async function find(t, s) { const q = await ev(`return await __reel.find(ARG[0],ARG[1])`, [t, { nth: s.nth, ox: s.ox, oy: s.oy, at: s.at }]); if (!q) throw new Error('no target: ' + t); return q; }
  async function step(s, film) {
    /* EN-дубль: набираемый текст и код шага — свои (value_en); цель по тексту находится и по русской подписи */
    if (LANG === 'en' && (s.value_en !== undefined || s.target_en)) s = Object.assign({}, s, s.value_en !== undefined ? { value: s.value_en } : {}, s.target_en ? { target: s.target_en } : {});
    const st = { do: s.do, a: now(), speed: s.speed || 1 };
    if (s.do === 'tap') {
      const q = s.x != null ? { x: s.x, y: s.y } : await find(s.target, s);
      st.a = now();
      await mouse('mouseMoved', q.x, q.y); await sleep(40);
      if (film && s.ring !== false) M.taps.push({ t: now(), x: +q.x.toFixed(1), y: +q.y.toFixed(1) });
      await mouse('mousePressed', q.x, q.y); await sleep(s.press_ms || 70); await mouse('mouseReleased', q.x, q.y);
    } else if (s.do === 'type') {
      if (s.target) { const q = await find(s.target, s); await mouse('mouseMoved', q.x, q.y); await mouse('mousePressed', q.x, q.y); await sleep(50); await mouse('mouseReleased', q.x, q.y); if (film && s.ring) M.taps.push({ t: now(), x: q.x, y: q.y }); await sleep(120); }
      st.a = now();
      for (const c of [...String(s.value)]) { await send('Input.insertText', { text: c }); await sleep(s.ms || 55); }
    } else if (s.do === 'key') {
      const k = s.value || 'Enter', code = { Enter: 13, Escape: 27, Tab: 9, Backspace: 8 }[k] || 0;
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, text: k === 'Enter' ? '\r' : undefined });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
    } else if (s.do === 'scroll') {
      // value: dy in css px (or {dx,dy}); target: the element whose nearest scroll container moves (or the container itself)
      const v = typeof s.value === 'object' ? s.value : { dx: 0, dy: +s.value || 0 };
      const r = await ev(`var e=__reel.pick(ARG[0]);if(!e)return null;var c=(e.scrollHeight>e.clientHeight+2||e.scrollWidth>e.clientWidth+2)&&/(auto|scroll)/.test(getComputedStyle(e).overflowY+getComputedStyle(e).overflowX)?e:__reel.sc(e);if(!c)return null;
        var r=c.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+Math.min(r.height/2,innerHeight*.55-r.top),ok:1}`, [s.target || 'body']);
      if (!r) throw new Error('nothing to scroll: ' + s.target);
      if (film && s.finger !== false) M.swipes.push({ t0: now(), t1: now() + (s.ms || 700) / 1000, x0: r.x + (v.dx ? 90 : 0), y0: r.y + (v.dy ? 120 : 0), x1: r.x - (v.dx ? 90 : 0), y1: r.y - (v.dy ? 120 : 0) });
      st.a = now();
      await ev(`var e=__reel.pick(ARG[0]);var c=(e.scrollHeight>e.clientHeight+2||e.scrollWidth>e.clientWidth+2)&&/(auto|scroll)/.test(getComputedStyle(e).overflowY+getComputedStyle(e).overflowX)?e:__reel.sc(e);await __reel.smooth(c,ARG[1],ARG[2],ARG[3]);return 1`, [s.target || 'body', v.dx || 0, v.dy || 0, s.ms || 700]);
    } else if (s.do === 'eval') {
      st.a = now(); await ev(s.value);
    } else if (s.do !== 'wait') throw new Error('unknown step: ' + s.do);
    await sleep(s.hold_ms == null ? (s.do === 'wait' ? 1000 : 400) : s.hold_ms);
    st.b = now(); return st;
  }

  await send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: VW * DSF, maxHeight: VH * DSF, everyNthFrame: 1 });
  rec = true; await sleep(300);
  for (let i = 0; i < SPEC.beats.length; i++) {
    const B = SPEC.beats[i], bid = B.id || 'b' + (i + 1);
    const pre = B.pre || [], steps = B.steps || [B];
    for (const s of pre) await step(s, false);
    const bm = { id: bid, steps: [] };
    for (const s of steps) bm.steps.push(await step(s, true));
    bm.in = bm.steps[0].a; bm.out = bm.steps[bm.steps.length - 1].b;
    M.beats.push(bm);
    const shot = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, 'shots', String(i + 1).padStart(2, '0') + '-' + bid + '.png'), Buffer.from(shot.result.data, 'base64'));
    console.log('  beat', bid, ((bm.out - bm.in)).toFixed(2) + ' s');
  }
  await sleep(400); rec = false; await send('Page.stopScreencast');
  if (DICT) {
    const miss = (await ev(`return window.__reelMiss ? Array.from(__reelMiss) : []`)) || [];
    fs.writeFileSync(path.join(OUT, 'untranslated.json'), JSON.stringify(miss, null, 1));
    if (miss.length) console.log('  untranslated strings:', miss.length, '→', path.join(OUT, 'untranslated.json'));
  }

  /* frames → full.mp4 at 60 fps (VFR timestamps kept as durations, so mp4 time == source clock from frame 0) */
  if (!frames.length) throw new Error('no frames');
  frames.sort((a, b) => a.t - b.t);
  const t0 = frames[0].t, FD = path.join(OUT, 'frames'); fs.mkdirSync(FD, { recursive: true });
  let list = '';
  frames.forEach((f, i) => { const fn = path.join(FD, `f${String(i).padStart(5, '0')}.jpg`); fs.writeFileSync(fn, Buffer.from(f.data, 'base64')); const d = i + 1 < frames.length ? frames[i + 1].t - f.t : 1 / 30; list += `file '${fn}'\nduration ${Math.max(0.001, d).toFixed(5)}\n`; });
  list += `file '${path.join(FD, `f${String(frames.length - 1).padStart(5, '0')}.jpg`)}'\n`;
  fs.writeFileSync(path.join(OUT, 'list.txt'), list);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'list.txt'), '-vf', 'fps=60,format=yuv420p', '-c:v', 'libx264', '-preset', 'fast', '-crf', '14', path.join(OUT, 'full.mp4')]);
  fs.rmSync(path.join(OUT, 'list.txt'));
  if (A['no-frames']) fs.rmSync(FD, { recursive: true, force: true });
  const rel = (t) => +(t - t0).toFixed(4);
  const dur = frames[frames.length - 1].t - t0;
  const out = { slug: SPEC.slug, vw: VW, vh: VH, dsf: DSF, frames: frames.length, dur: +dur.toFixed(3), fps: +(frames.length / dur).toFixed(1), load: +os.loadavg()[0].toFixed(1),
    beats: M.beats.map((b) => ({ id: b.id, in: rel(b.in), out: rel(b.out), steps: b.steps.map((s) => ({ do: s.do, a: rel(s.a), b: rel(s.b), speed: s.speed })) })),
    taps: M.taps.map((t) => ({ t: rel(t.t), x: t.x, y: t.y })), swipes: M.swipes.map((s) => ({ t0: rel(s.t0), t1: rel(s.t1), x0: s.x0, y0: s.y0, x1: s.x1, y1: s.y1 })), errors: errs.slice(0, 10) };
  fs.writeFileSync(path.join(OUT, 'clock.json'), JSON.stringify(frames.map((f) => rel(f.t))));
  fs.writeFileSync(path.join(OUT, 'markers.json'), JSON.stringify(out, null, 1));
  console.log(`take ${n}: ${frames.length} frames · ${dur.toFixed(1)} s · ${out.fps} fps · load ${out.load}` + (errs.length ? ' · page errors: ' + errs.length : ''));
  ws.close(); bye(); try { fs.rmSync(udir, { recursive: true, force: true }); } catch (e) {}
  return out;
}

/* worst gap between frames inside each beat (after its first 0.25 s): the smaller, the smoother.
   A still screen also leaves gaps (no change → no frame), so it is a hint, not a verdict — look at the film. */
function pick() {
  const takes = fs.readdirSync(WORK).filter((d) => /^take-\d+$/.test(d) && fs.existsSync(path.join(WORK, d, 'markers.json')));
  const best = {}, table = {};
  for (const d of takes) {
    const M = JSON.parse(fs.readFileSync(path.join(WORK, d, 'markers.json'), 'utf8')), C = JSON.parse(fs.readFileSync(path.join(WORK, d, 'clock.json'), 'utf8'));
    for (const b of M.beats) {
      const fr = C.filter((t) => t >= b.in + 0.25 && t <= b.out); let w = 9; for (let i = 1; i < fr.length; i++) w = i === 1 ? fr[1] - fr[0] : Math.max(w, fr[i] - fr[i - 1]);
      (table[b.id] = table[b.id] || []).push([w, d, fr.length / Math.max(0.1, b.out - b.in - 0.25)]);
    }
  }
  for (const [k, v] of Object.entries(table)) { v.sort((a, b) => a[0] - b[0] || b[2] - a[2]); best[k] = v[0][1]; console.log('  ' + k.padEnd(10) + v.map(([w, d, f]) => `${d} worst ${(w * 1000).toFixed(0)}ms ${f.toFixed(0)}fps`).join(' | ') + '  → ' + best[k]); }
  fs.writeFileSync(path.join(WORK, 'best.json'), JSON.stringify(best, null, 1));
}

fs.mkdirSync(WORK, { recursive: true });
const N = A.take ? [+A.take] : Array.from({ length: +(A.takes || 1) }, (_, i) => i + 1);
for (const n of N) { await waitLoad(); console.log('take', n, '→', SPEC.url); await take(n); }
pick();
process.exit(0);
