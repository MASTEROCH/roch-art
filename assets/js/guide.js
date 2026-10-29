/* Гид по странице /design (Роч 29.10): LED-голова ROCH AI ведёт посетителя по главным местам страницы.
   Музейный гид, а не болтун: долетела, посмотрела на то, о чём речь, сказала одну фразу голосом Романа и замолчала.
   Палец режиссёра (тот же, что в промо AppHub Link и в роликах) показывает, куда нажать: не больше четырёх
   подсказок за визит, каждая один раз, исчезает от касания или прокрутки.
   Устройство:
   · Лицо — тот же движок, что в ROCH AI (/rochai/led-face.js), сфера /rochai/mascot/sphere.webp. Грузится, когда
     обложка доиграла сборку фото из частиц, после первой прокрутки или через 2 с после load. Не загрузился — гида нет.
   · Полёт — пружина k 170 / c 20 (как в коллекции), дугой, с наклоном по ходу; один rAF только пока голова движется.
     Голова «пришита» к странице на 85 %: на быстрой прокрутке чуть отстаёт и догоняет.
   · Место выбирается по факту вёрстки: кандидаты вокруг предмета, штраф за перекрытие кнопок (×4), текста (×2),
     медиа (×0.35) и за свой пузырь. Поэтому на телефоне голова не садится на кнопки, а на компьютере уходит в поля.
   · Фраза — один раз за визит (sessionStorage), повторный заход — только эмоция. Язык — по <html lang>, на лету.
   · Обложки страницы: на первой прокрутке фото Романа на обложке рассыпается частицами и собирает голову; в контактах
     голова влетает в кольцо и снова становится фото (и уже фото говорит последнюю фразу). Обратно — так же.
   · Тап по голове — случайная эмоция, 4–5 быстрых — раздражение, 6-й — «перезагрузка». Наведение или долгое касание
     показывает две крошечные кнопки: «тише» (localStorage) и «×» — убрать гида насовсем.
   · prefers-reduced-motion: без полётов и наклонов, голова переставляется затуханием, пузыри появляются целиком.
   ES5, без зависимостей; в design.html — одна строка подключения. */
(function () {
  'use strict';
  var W = window, D = document, HTML = D.documentElement;
  var COVER = D.getElementById('cover');
  if (!COVER || !W.requestAnimationFrame || !W.JSON || !D.querySelector || !W.MutationObserver) return;

  /* ---------- хранилища: приватное окно и запрет записи гида не ломают ---------- */
  function lsGet(k) { try { return W.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) W.localStorage.removeItem(k); else W.localStorage.setItem(k, v); } catch (e) {} }
  function ssGet(k) { try { var a = JSON.parse(W.sessionStorage.getItem(k) || '[]'); return a && a.push ? a : []; } catch (e) { return []; } }
  function ssAdd(k, v) { var a = ssGet(k); if (a.indexOf(v) < 0) { a.push(v); try { W.sessionStorage.setItem(k, JSON.stringify(a)); } catch (e) {} } return a; }
  var K_OFF = 'roch_guide_off', K_MUTE = 'roch_guide_mute', K_SAID = 'roch_guide_said', K_HINT = 'roch_guide_hints';
  if (lsGet(K_OFF) === '1') return;

  /* ---------- откуда брать лицо: на проде /rochai, локально — ?guidebase=http://127.0.0.1:8795 (только localhost) ---------- */
  var LOCAL = /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);
  var BASE = '/rochai', HAND = '/assets/guide/hand.webp';
  if (LOCAL) {
    var gm = /[?&]guidebase=([^&#]+)/.exec(location.search);
    if (gm) {
      var gb = decodeURIComponent(gm[1]).replace(/\/+$/, '');
      if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d{2,5})?(\/[\w.\-\/]*)?$/.test(gb)) BASE = gb;
    }
  }

  var mqRM = W.matchMedia ? W.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var RM = !!(mqRM && mqRM.matches);
  var FINE = !!(W.matchMedia && W.matchMedia('(hover: hover) and (pointer: fine)').matches);

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function q(s, r) { return (r || D).querySelector(s); }
  function qa(s, r) { return (r || D).querySelectorAll(s); }
  function lang() { return /^en/i.test(HTML.getAttribute('lang') || '') ? 'en' : 'ru'; }
  function now() { return W.performance && performance.now ? performance.now() : Date.now(); }

  /* ---------- реплики: голос Романа, первое лицо (тексты Роча 29.10, без правок) ---------- */
  var TX = {
    ru: {
      cover: 'Привет, я Рома. Покажу вам свои лучшие работы, это займёт пару минут.',
      gamedev: 'Начинал я в играх 2D-художником и дорос до арт-директора, а наши игры скачали 700 миллионов раз.',
      'PEONIA': 'Здесь букет можно описать словами, и приложение само его соберёт.',
      'KING Fit': 'Это тренер в телефоне: он ведёт человека через тренировки и питание весь день.',
      'EPOCH': 'Гость выбирает стол прямо на плане зала и бронирует его без звонка.',
      'Butyfly': 'Потяните шторку, и вы увидите, как клиника показывает результат до и после.',
      'BabyLand': 'Родитель собирает детский праздник за три минуты и сразу видит цену.',
      'Hotelito': 'Домик, баня и бронь в одном окне, а хозяин видит все заявки сразу.',
      'ANZH Beauty': 'Клиентка записывается к косметологу сама, без звонков и переписки.',
      more: 'Это ещё пять работ. Нажмите на любую, там экраны и живое демо.',
      motion: 'А это моя коллекция движения: триста живых механик. Откройте и потрогайте.',
      contact: 'Понравилось? Напишите мне, я отвечаю сам.',
      mute: 'Хорошо, помолчу.',
      unmute: 'Я снова с вами.',
      reboot: 'Перезагрузился. Где мы были?',
      head: 'ROCH AI, гид по странице',
      muteOn: 'Выключить подсказки гида',
      muteOff: 'Включить подсказки гида',
      close: 'Скрыть гида'
    },
    en: {
      cover: "Hi, I'm Roman. I'll show you my best work, it takes a couple of minutes.",
      gamedev: 'I started in games as a 2D artist and grew into an art director, and our games were downloaded 700 million times.',
      'PEONIA': 'Here you describe a bouquet in words, and the app puts it together.',
      'KING Fit': "It's a coach in your phone that guides you through workouts and meals all day.",
      'EPOCH': 'Guests pick a table right on the floor plan and book it without a call.',
      'Butyfly': 'Drag the slider to see how the clinic shows before and after.',
      'BabyLand': "Parents put together a kids' party in three minutes and see the price right away.",
      'Hotelito': 'Cabin, sauna and booking in one window, and the owner sees every request at once.',
      'ANZH Beauty': 'Clients book a beautician themselves, no calls and no chats.',
      more: 'Five more projects. Tap any of them to see the screens and the live demo.',
      motion: 'And this is my motion collection: three hundred live mechanics. Open it and play.',
      contact: 'Liked it? Message me, I reply myself.',
      mute: "Okay, I'll keep quiet.",
      unmute: "I'm back.",
      reboot: 'Rebooted. Where were we?',
      head: 'ROCH AI, page guide',
      muteOn: 'Mute the guide',
      muteOff: 'Unmute the guide',
      close: 'Hide the guide'
    }
  };

  /* ---------- остановки: находим по факту, разметку не трогаем ---------- */
  var PEMO = ['curious', 'excited', 'proud', 'wonder'];
  var stops = [], dirty = true, cur = null, pend = null;
  function closestAct(el) {
    while (el && el !== D.body && el.nodeType === 1) {
      if (el.tagName === 'A' || el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') return el;
      el = el.parentNode;
    }
    return null;
  }
  /* блок ROCH Motion добавлен отдельно: ищем верхний раздел, у которого в id/классе есть rmotion или motion */
  function findMotion() {
    var main = q('main') || D.body, i, el, s = qa('[id*="rmotion"],[class*="rmotion"],[id*="rMotion"],[class*="rMotion"],[id*="RMotion"],[class*="RMotion"],section');
    for (i = 0; i < s.length; i++) {
      el = s[i];
      if (el.tagName === 'SECTION' && !/motion/i.test(el.id + ' ' + (el.getAttribute('class') || ''))) continue;
      while (el.parentNode && el.parentNode !== main && el.parentNode !== D.body) el = el.parentNode;
      if (el === COVER || /^(gamedev|prods|more|contact|top|lb)$/.test(el.id || '')) continue;
      return el;
    }
    return null;
  }
  function motionCta(sec) {
    return q('#rmxGo,.rmx-go', sec) || q('a[href*="motion"],a[href*="Motion"]', sec) || q('.btn', sec) || q('a,button', sec);
  }
  function scan() {
    var L = [], sec, i, pr, nm;
    L.push({ k: 'cover', el: COVER, emo: 'hello', line: 'cover', place: '.ava', look: '.ava' });
    if ((sec = D.getElementById('gamedev'))) L.push({ k: 'gamedev', el: sec, emo: 'wow', line: 'gamedev',
      place: function (s) { var c = qa('.stats .cnum', s); return c[1] || c[0] || q('.stats', s); }, placeSm: '.sr',
      look: function (s) { var c = qa('.stats .cnum', s); return c[1] || c[0]; }, hint: '.sr-b .pb', hk: 'reel' });
    pr = qa('#prods .prod');
    for (i = 0; i < pr.length; i++) {
      nm = pr[i].getAttribute('aria-label') || ((q('h2', pr[i]) || {}).textContent || '');
      L.push({ k: 'prod:' + nm, el: pr[i], emo: PEMO[i % 4], line: nm, place: '.stage', look: '.scr', prod: true,
        hint: i === 0 ? '.acts [data-shots]' : null, hk: 'screens' });
    }
    if ((sec = D.getElementById('more'))) L.push({ k: 'more', el: sec, emo: 'curious', line: 'more', place: '.sh h2', look: '.mv', hint: '.mv', hk: 'card', cheap: '.sh p' });
    if ((sec = findMotion())) L.push({ k: 'motion', el: sec, emo: 'celebrate', line: 'motion', place: motionCta, placeSm: function (s) { return q('.rmx-ph', s) || motionCta(s); },
      look: function (s) { return q('.rmx-ph,.scr', s) || motionCta(s); }, hint: motionCta, hk: 'motion' });
    if ((sec = D.getElementById('contact'))) L.push({ k: 'contact', el: sec, emo: 'wink', then: 'love', line: 'contact', place: '.fin .ava', look: '.fin .btn.js-tg', hint: '.fin .btn.js-tg', hk: 'tg' });
    stops = L; dirty = true;
    if (cur) { var k = cur.k; cur = null; for (i = 0; i < L.length; i++) if (L[i].k === k) cur = L[i]; }
    pend = cur;
  }
  function pick(st, what) { var v = st && ((what === 'place' && SZ < 64 && st.placeSm) || st[what]); if (!v) return null; return typeof v === 'function' ? v(st.el) : q(v, st.el); }
  function text(st) { return st ? TX[lang()][st.line] || '' : ''; }

  /* ---------- размеры ---------- */
  var vw = 0, vh = 0, SZ = 72, SZB = 72, TOP = 72, BOT = 18, EDGE = 16, BW = 260, FW = 56, tiny = false;
  function metrics() {
    vw = HTML.clientWidth || W.innerWidth; vh = W.innerHeight || HTML.clientHeight;
    var sm = vw < 700;
    SZ = SZB = sm ? 56 : 72; EDGE = sm ? 8 : 18; BOT = sm ? 22 : 18; BW = sm ? Math.min(320, vw - 2 * EDGE) : 260; FW = sm ? 50 : 56;
    var tb = q('#top .top-in') || q('#top');
    TOP = tb ? Math.round(tb.getBoundingClientRect().bottom) + 10 : 72;
    tiny = vh < 440 || vw < 300;
  }
  function measure() {
    var sy = W.pageYOffset, i, r;
    for (i = 0; i < stops.length; i++) { r = stops[i].el.getBoundingClientRect(); stops[i].top = r.top + sy; stops[i].bot = r.bottom + sy; }
    dirty = false;
  }
  function activeStop() {
    if (dirty) measure();
    var mid = W.pageYOffset + vh * 0.5, i;
    for (i = 0; i < stops.length; i++) if (mid >= stops[i].top && mid < stops[i].bot) return stops[i];
    return null;
  }

  /* ---------- геометрия: прямоугольники в координатах документа (dy = scrollY) или экрана (dy = 0) ---------- */
  function box(r, dy) { return { l: r.left, t: r.top + dy, r: r.right, b: r.bottom + dy }; }
  function textBox(el, dy) {
    var r = null;
    try { var rg = D.createRange(); rg.selectNodeContents(el); r = rg.getBoundingClientRect(); } catch (e) {}
    if (!r || !r.width) r = el.getBoundingClientRect();
    return box(r, dy);
  }
  function overlap(a, b) {
    var w = Math.min(a.r, b.r) - Math.max(a.l, b.l), h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
    return w > 0 && h > 0 ? w * h : 0;
  }
  function cost(rc, av, skip) { var s = 0, i; for (i = 0; i < av.length; i++) if (!skip || av[i].el !== skip) s += overlap(rc, av[i]) * av[i].w; return s; }
  function outside(rc, V) { var a = (rc.r - rc.l) * (rc.b - rc.t); return a - overlap(rc, V); }
  /* что нельзя закрывать: кнопки и ссылки ×4, текст ×2, большие медиа ×0.35 (карточки «Ещё работ» ×1.2) */
  function avoid(sec, dy) {
    var out = [], n, i, el, r, b, cl, cheap = null;
    if (!sec) return out;
    for (i = 0; i < stops.length; i++) if (stops[i].el === sec) cheap = stops[i].cheap || null;
    n = qa('a,button', sec);
    for (i = 0; i < n.length; i++) {
      el = n[i]; r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      cl = ' ' + (el.getAttribute('class') || '') + ' ';
      b = box(r, dy); b.el = el; b.w = cl.indexOf(' mv ') >= 0 ? 1.2 : (cl.indexOf(' sr-b ') >= 0 ? 0.35 : 4); out.push(b);
    }
    /* текст: заголовки и абзацы — по строкам (Range), счётчики-табло — по своей рамке: внутри у них
       высокие ленты цифр, обрезанные overflow, и Range вернул бы их целиком */
    n = qa('h1,h2,h3,p,.cnum,.st > span,.eb,.foot,.rmx-num,.rmx-n > span,.rmx-eb', sec);
    for (i = 0; i < n.length; i++) {
      el = n[i]; if (closestAct(el)) continue;
      b = /^(H1|H2|H3|P)$/.test(el.tagName) ? textBox(el, dy) : box(el.getBoundingClientRect(), dy); if (b.r - b.l < 1) continue; b.el = el; b.w = cheap && el.matches && el.matches(cheap) ? 0.4 : /^H[12]$/.test(el.tagName) ? 4 : 2; out.push(b);   /* заголовок — опора слайда, как кнопка */
    }
    n = qa('.phone,.sr,.ava,.rmx-ph,[data-fx]', sec);
    for (i = 0; i < n.length; i++) {
      r = n[i].getBoundingClientRect(); if (!r.width) continue;
      cl = ' ' + (n[i].getAttribute('class') || '') + ' ';
      /* лицо Романа не закрываем; живые плитки механик вокруг телефона — тоже витрина */
      b = box(r, dy); b.el = n[i]; b.w = cl.indexOf(' ava ') >= 0 ? 3 : n[i].hasAttribute('data-fx') ? 1 : 0.35; out.push(b);
    }
    return out;
  }

  /* ---------- пузырь: где встать рядом с головой (hx, hy — левый верх головы) ---------- */
  /* ширина пузыря подстраивается под свободное место стороны: на телефоне до 320, на компьютере до 260 */
  function bubbleFor(hx, hy, str, V, av, hs) {
    var SZ = hs || SZB;   /* опора пузыря: голова или (в контактах) фото, в которое голова превратилась */
    var right = hx + SZ / 2 > (V.l + V.r) / 2, S = [], i, best = null, g = 8, cy = hy + SZ * 0.5 - 20;
    var wl = hx - g - V.l, wr = V.r - hx - SZ - g, wf = V.r - V.l;
    S.push(right ? { s: 'l', a: wl, c: 'tr', p: 0 } : { s: 'r', a: wr, c: 'tl', p: 0 });
    S.push(right ? { s: 'r', a: wr, c: 'tl', p: 160 } : { s: 'l', a: wl, c: 'tr', p: 160 });
    S.push({ s: 't', a: wf, c: right ? 'br' : 'bl', p: 220 });
    S.push({ s: 'b', a: wf, c: right ? 'tr' : 'tl', p: 280 });
    /* телефон: сверху/снизу можно и во всю ширину — короткая фраза встаёт одной строкой в узкую полосу */
    if (SZB < 64) { S.push({ s: 't', a: wf, c: right ? 'br' : 'bl', p: 260, full: 1 }); S.push({ s: 'b', a: wf, c: right ? 'tr' : 'tl', p: 320, full: 1 }); }
    var head = { l: hx - 4, t: hy - 4, r: hx + SZ + 4, b: hy + SZ + 4 };
    for (i = 0; i < S.length; i++) {
      var c = S[i], bw = c.full ? Math.floor(c.a) : clamp(Math.floor(c.a / 10) * 10, 150, BW), bs = bubbleSize(str, bw), x, y;
      if (c.s === 'l') { x = hx - g - bs.w; y = cy; }
      else if (c.s === 'r') { x = hx + SZ + g; y = cy; }
      else { x = right ? hx + SZ * 0.5 + 20 - bs.w : hx + SZ * 0.5 - 20; y = c.s === 't' ? hy - g - bs.h : hy + SZ + g; }
      var x2 = clamp(x, V.l, V.r - bs.w), y2 = clamp(y, V.t, V.b - bs.h);
      var rc = { l: x2 - 4, t: y2 - 4, r: x2 + bs.w + 4, b: y2 + bs.h + 4 };
      var s = cost(rc, av) + (Math.abs(x2 - x) + Math.abs(y2 - y)) * 30 + overlap(rc, head) * 40 + c.p;
      if (!best || s < best.s) best = { x: x2, y: y2, c: c.c, s: s, mw: bw };
    }
    return best;
  }

  /* ---------- место головы у остановки (в координатах документа) ---------- */
  function spotFor(st) {
    var sy = W.pageYOffset, sec = st.el, pe = pick(st, 'place') || sec;
    if (st.k === 'contact' && avaBot && q('img', avaBot)) {
      /* в контактах голова садится ровно в кольцо фото и превращается в него */
      var ar = q('img', avaBot).getBoundingClientRect(), le0 = pick(st, 'look'), lr0 = le0 ? le0.getBoundingClientRect() : ar;
      return { x: (ar.left + ar.right) / 2 - SZ / 2, y: (ar.top + ar.bottom) / 2 + sy - SZ / 2, s: 0, lx: (lr0.left + lr0.right) / 2, ly: (lr0.top + lr0.bottom) / 2 + sy };
    }
    var S = /^(H1|H2|H3|P)$/.test(pe.tagName) ? textBox(pe, sy) : box(pe.getBoundingClientRect(), sy), R = box(sec.getBoundingClientRect(), sy);
    var view = (R.b - R.t) <= vh * 1.15 ? R.t : clamp((S.t + S.b) / 2 - vh / 2, R.t, R.b - vh);
    var V = { l: EDGE, r: vw - EDGE, t: view + TOP, b: view + vh - BOT };
    var av = avoid(sec, sy), str = text(st);
    var g = SZ < 64 ? 14 : 22, h = SZ, C = [], ys = st.prod ? [0.34, 0.56, 0.78] : [0.5], i, best = null;
    for (i = 0; i < ys.length; i++) {
      var yy = S.t + (S.b - S.t) * ys[i] - h / 2;
      C.push({ x: S.r + g, y: yy }, { x: S.l - g - h, y: yy });
    }
    C.push({ x: S.r + g * 0.5, y: S.t - h * 0.75 }, { x: S.l - h - g * 0.5, y: S.t - h * 0.75 },
      { x: S.r + g * 0.5, y: S.b - h * 0.25 }, { x: S.l - h - g * 0.5, y: S.b - h * 0.25 },
      { x: (S.l + S.r - h) / 2, y: S.t - g - h }, { x: (S.l + S.r - h) / 2, y: S.b + g });
    if (SZ < 64) C.push({ x: V.r - h, y: V.t }, { x: V.l, y: V.t }, { x: V.r - h, y: V.b - h }, { x: V.l, y: V.b - h });   /* на телефоне — углы экрана */
    for (i = 0; i < C.length; i++) {
      var c = C[i], x = clamp(c.x, V.l, V.r - h), y = clamp(c.y, V.t, V.b - h);
      var hb = { l: x - 6, t: y - 6, r: x + h + 6, b: y + h + 6 };
      var s = cost(hb, av) + overlap(hb, S) * 1.5 + (Math.abs(x - c.x) + Math.abs(y - c.y)) * 20 + i * 25;
      if (str) s += bubbleFor(x, y, str, V, av).s * 0.5;
      if (!best || s < best.s) best = { x: x, y: y, s: s };
    }
    var le = pick(st, 'look'); if (le) { var lr = le.getBoundingClientRect(); best.lx = (lr.left + lr.right) / 2; best.ly = (lr.top + lr.bottom) / 2 + sy; }
    else { best.lx = (S.l + S.r) / 2; best.ly = (S.t + S.b) / 2; }
    return best;
  }

  /* ================= DOM ================= */
  var CSS = [
    '.rg{position:fixed;left:0;top:0;z-index:45;width:72px;height:72px;pointer-events:none;transform:translate3d(-300px,-300px,0);will-change:transform;opacity:0;transition:opacity .35s ease}',
    '.rg.sm{width:56px;height:56px}',
    '.rg.on{opacity:1}.rg.fade,.rg.lbo,.rg.tiny{opacity:0}.rg.lbo *,.rg.tiny *{pointer-events:none!important}',
    '.rg-h{position:absolute;inset:0;margin:0;padding:0;border:0;background:none;border-radius:50%;cursor:pointer;pointer-events:auto;color:inherit;font:inherit;-webkit-tap-highlight-color:transparent;-webkit-touch-callout:none;user-select:none;-webkit-user-select:none;transform-origin:50% 62%}',
    '.rg-h:focus-visible{outline:2px solid #D4FF4F;outline-offset:4px}',
    '.rg-fl,.rg-sq{position:absolute;inset:0;border-radius:50%}',
    '.rg-sq{transition:transform .35s cubic-bezier(.22,1,.36,1),opacity .35s ease}',
    '.rg.park .rg-sq{transform:scale(.84);opacity:.55}.rg.park .rg-h{pointer-events:none}',
    '.rg-gl{position:absolute;inset:-16%;border-radius:50%;background:radial-gradient(circle,rgba(212,255,79,.28),rgba(212,255,79,.09) 42%,transparent 70%);transition:opacity .4s ease}',
    '.rg.mute .rg-gl{opacity:.25}',
    '.rg-s{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;-webkit-user-drag:none;filter:drop-shadow(0 10px 20px rgba(0,0,0,.6))}',
    '.rg-h canvas{position:absolute;left:11%;top:11%;width:78%;height:78%;pointer-events:none;filter:drop-shadow(0 0 1.5px rgba(230,255,210,.35));opacity:0;transition:opacity .45s ease}',
    '.rg.lit .rg-h canvas{opacity:1}',
    '.rg-hl{position:absolute;inset:0;border-radius:50%;pointer-events:none;background:radial-gradient(52% 38% at 36% 20%,rgba(255,255,255,.1),transparent 60%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}',
    /* «×» и «тише» — крошечные, появляются на наведение, фокус или долгое касание */
    '.rg-c{position:absolute;top:-5px;width:22px;height:22px;margin:0;padding:0;border-radius:50%;border:1px solid rgba(255,255,255,.22);background:rgba(10,14,12,.9);color:rgba(255,255,255,.82);display:grid;place-items:center;cursor:pointer;pointer-events:auto;visibility:hidden;opacity:0;transform:scale(.6);transition:opacity .2s ease .45s,transform .25s ease .45s,visibility 0s .7s;-webkit-tap-highlight-color:transparent}',
    '.rg-x{right:-5px}.rg-m{left:-5px}',
    '.rg-c svg{width:10px;height:10px;display:block}.rg-m svg{width:12px;height:12px}',
    '.rg-m .mo{display:none}.rg.mute .rg-m .mo{display:inline}.rg.mute .rg-m{color:#D4FF4F;border-color:rgba(212,255,79,.45)}',
    '.rg-h:hover~.rg-c,.rg-c:hover,.rg-c:focus-visible,.rg-h:focus-visible~.rg-c,.rg.xon .rg-c{visibility:visible;opacity:1;transform:none;transition-delay:0s}',
    '.rg-c:focus-visible{outline:2px solid #D4FF4F;outline-offset:2px}',
    '.rg.park .rg-c,.rg.bye .rg-c{visibility:hidden;opacity:0}',
    /* перезагрузка: дрожь глитча, сон (сфера тускнеет, дыхание медленнее), темнота перед загрузкой */
    '.rg.glitchy .rg-sq{animation:rgJit .13s steps(2) 10}',
    '@keyframes rgJit{0%{transform:translate(1.6px,-.4px)}50%{transform:translate(-1.6px,.6px)}100%{transform:none}}',
    '.rg-s{transition:filter .8s ease}.rg.sleep .rg-s{filter:drop-shadow(0 10px 20px rgba(0,0,0,.6)) brightness(.62)}',
    '.rg.sleep .rg-gl{opacity:.12;animation:none}.rg.sleep .rg-fl{animation-duration:7.5s}',
    '.rg.dark .rg-h canvas{opacity:0;transition:none}',
    /* тело в фото: голова и кнопки спрятаны; выход из частиц — пружиной */
    '.rg.emb .rg-h{opacity:0;pointer-events:none}.rg.emb .rg-c{visibility:hidden!important;opacity:0!important}',
    '.rg.pop .rg-sq{animation:rgPop .62s cubic-bezier(.3,1.5,.5,1)}',
    '@keyframes rgPop{0%{transform:scale(.42);opacity:.25}55%{opacity:1}100%{transform:none}}',
    /* фото ушло в голову — кольцо пустое и тёмное, как портал (прозрачное фото открыло бы лаймовую подложку кольца) */
    '.ava.rg-gone>img{filter:brightness(0)!important}',
    '.rg-ov{position:fixed;left:0;top:0;z-index:44;pointer-events:none}',
    /* пузырь — стекло страницы, угол к голове острее */
    '.rg-b{position:absolute;left:0;top:0;width:max-content;max-width:260px;padding:10px 13px 11px;border-radius:16px;font:600 14px/1.4 var(--font,-apple-system,BlinkMacSystemFont,"SF Pro Text",Inter,sans-serif);letter-spacing:-.006em;color:rgba(255,255,255,.96);text-align:left;text-wrap:pretty;',
    'background:linear-gradient(150deg,rgba(255,255,255,.1),rgba(255,255,255,.02) 55%,rgba(255,255,255,.05)),rgba(14,20,16,.8);-webkit-backdrop-filter:blur(14px) saturate(1.2);backdrop-filter:blur(14px) saturate(1.2);',
    'box-shadow:0 18px 40px -14px rgba(0,0,0,.85),0 0 0 1px rgba(255,255,255,.13),inset 0 1px 0 rgba(255,255,255,.14);pointer-events:none;visibility:hidden;opacity:0;transform:scale(.92);transition:opacity .2s ease,transform .3s cubic-bezier(.34,1.45,.42,1),visibility 0s .3s}',
    '.rg-b.on{visibility:visible;opacity:1;transform:none;transition-delay:0s}',
    '.rg-b.c-tl{border-top-left-radius:5px;transform-origin:0 0}.rg-b.c-tr{border-top-right-radius:5px;transform-origin:100% 0}',
    '.rg-b.c-bl{border-bottom-left-radius:5px;transform-origin:0 100%}.rg-b.c-br{border-bottom-right-radius:5px;transform-origin:100% 100%}',
    '.rg-b .off{color:transparent}',
    '.rg-ms{visibility:hidden!important;opacity:0!important;left:-9999px}',
    '@media (hover:none){.rg-b{-webkit-backdrop-filter:none;backdrop-filter:none;background:linear-gradient(150deg,rgba(255,255,255,.1),rgba(255,255,255,.02) 55%,rgba(255,255,255,.05)),rgba(14,20,16,.94)}}',
    /* вход: тонкое лаймовое кольцо и искры в момент приземления */
    '.rg-ring{position:absolute;inset:-3px;border-radius:50%;border:1.5px solid rgba(212,255,79,.95);box-shadow:0 0 16px rgba(212,255,79,.5),inset 0 0 10px rgba(212,255,79,.25);opacity:0;pointer-events:none}',
    '.rg-sp{position:absolute;left:50%;top:50%;width:0;height:0;pointer-events:none}',
    '.rg-sp b{position:absolute;left:-1.5px;top:-1.5px;width:3px;height:3px;border-radius:50%;background:#EEFFB0;box-shadow:0 0 6px #D4FF4F;opacity:0}',
    '.rg.land .rg-ring{animation:rgRing .9s cubic-bezier(.2,.7,.2,1) forwards}',
    '.rg.land .rg-sp b{animation:rgSpark .8s cubic-bezier(.15,.8,.25,1) forwards;animation-delay:var(--dl,0s)}',
    '.rg.land .rg-sq{animation:rgSquash .5s cubic-bezier(.3,1.6,.5,1)}',
    '@keyframes rgRing{0%{opacity:.95;transform:scale(.82)}100%{opacity:0;transform:scale(2.15)}}',
    '@keyframes rgSpark{0%{opacity:1;transform:rotate(var(--a)) translateX(calc(var(--r) * .5))}100%{opacity:0;transform:rotate(var(--a)) translateX(var(--r)) scale(.3)}}',
    '@keyframes rgSquash{0%{transform:scale(1.08,.88)}100%{transform:none}}',
    '.rg.on .rg-fl{animation:rgFloat 4.4s ease-in-out infinite}',
    '.rg.on .rg-gl{animation:rgGlow 4.2s ease-in-out infinite}',
    '.rg.mute .rg-gl{animation:none}',
    '@keyframes rgFloat{0%,100%{transform:translateY(0)}25%{transform:translateY(-5px)}50%{transform:translateY(0)}75%{transform:translateY(-2.5px)}}',
    '@keyframes rgGlow{0%,100%{opacity:.72}50%{opacity:1}}',
    '.rg.bye{opacity:0;transition:opacity .6s ease .5s}.rg.bye .rg-sq{transform:scale(.6);transition:transform .7s cubic-bezier(.5,0,.75,0) .35s}',
    /* палец режиссёра: X и Y летят с разными кривыми — путь получается дугой */
    '.rg-f{position:fixed;left:0;top:0;z-index:46;width:0;height:0;pointer-events:none;visibility:hidden;transition:transform .66s cubic-bezier(.25,.85,.3,1)}',
    '.rg-f.on{visibility:visible}',
    '.rg-fy{position:absolute;left:0;top:0;transition:transform .66s cubic-bezier(.6,0,.3,1)}',
    '.rg-fs{position:absolute;left:0;top:0;opacity:0;transform:scale(.3);transition:opacity .2s ease,transform .55s cubic-bezier(.34,1.45,.42,1)}',
    '.rg-f.on .rg-fs{opacity:1;transform:none}',
    '.rg-f.out .rg-fs{opacity:0;transform:scale(.85);transition:opacity .25s ease,transform .3s ease}',
    '.rg-fo{position:absolute;left:0;top:0}',
    '.rg-fo img{position:absolute;max-width:none;height:auto;transform-origin:13% 12%;transform:translate(8px,10px);filter:drop-shadow(0 10px 14px rgba(0,0,0,.55));-webkit-user-drag:none;user-select:none}',
    '.rg-fr{position:absolute;left:-22px;top:-22px;width:44px;height:44px;border-radius:50%;border:2px solid rgba(212,255,79,.95);box-shadow:0 0 14px rgba(212,255,79,.5);opacity:0}',
    '.rg-f.tap .rg-fo img{animation:rgTap 1.2s cubic-bezier(.34,1.4,.5,1) 2}',
    '.rg-f.tap .rg-fr{animation:rgRip 1.2s cubic-bezier(.3,0,.2,1) 2}',
    '.rg-f.tap .rg-fr.r2{animation-delay:.14s}',
    '@keyframes rgTap{0%,46%{transform:translate(8px,10px) scale(1)}62%{transform:translate(0,0) scale(.92)}76%,100%{transform:translate(8px,10px) scale(1)}}',
    '@keyframes rgRip{0%,58%{transform:scale(.25);opacity:0}63%{opacity:.95}92%,100%{transform:scale(1.65);opacity:0}}',
    '@media (prefers-reduced-motion:reduce){.rg,.rg *,.rg-f,.rg-f *{animation:none!important;transition-property:opacity,visibility!important}',
    '.rg-h{transition:opacity .3s ease}.ava>img{transition:filter .3s ease}',
    '.rg-b{transform:none}.rg-f.tap .rg-fo img{transform:translate(0,0)}.rg-f.tap .rg-fr{opacity:.8;transform:scale(1.15)}.rg-f.tap .rg-fr.r2{opacity:0}}'
  ].join('');

  var rg, hd, sq, cv, xb, mb, bub, bOn, bOff, ms, fEl, fx, fy, fs, fo, fImg;
  var face = null, LF = null, LNG = lang();
  function el(tag, cls, parent) { var e = D.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; }
  function build() {
    var st = el('style'); st.id = 'rgCss'; st.textContent = CSS; D.head.appendChild(st);
    rg = el('div', 'rg'); rg.id = 'rochGuide';
    hd = el('button', 'rg-h', rg); hd.type = 'button';
    var fl = el('span', 'rg-fl', hd); sq = el('span', 'rg-sq', fl);
    el('span', 'rg-gl', sq).setAttribute('aria-hidden', 'true');
    var img = el('img', 'rg-s', sq); img.alt = ''; img.setAttribute('aria-hidden', 'true'); img.draggable = false; img.decoding = 'async';
    cv = el('canvas', '', sq); cv.setAttribute('aria-hidden', 'true');
    el('i', 'rg-hl', sq).setAttribute('aria-hidden', 'true');
    mb = el('button', 'rg-c rg-m', rg); mb.type = 'button';
    mb.innerHTML = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.2 2.4h7.6a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H6.4L4 10.3V8.4H2.2a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path class="mo" d="M1.3 1.3l9.4 9.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
    xb = el('button', 'rg-c rg-x', rg); xb.type = 'button';
    xb.innerHTML = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
    var ring = el('i', 'rg-ring', rg); ring.setAttribute('aria-hidden', 'true');
    var sp = el('i', 'rg-sp', rg), k; sp.setAttribute('aria-hidden', 'true');
    for (k = 0; k < 10; k++) { var b = el('b', '', sp); b.style.cssText = '--a:' + (k * 36 + (k % 2 ? 11 : -7)) + 'deg;--r:' + (k % 2 ? 52 : 66) + '%;--dl:' + (k % 3) * 0.04 + 's'; }
    bub = el('div', 'rg-b', rg); bub.setAttribute('aria-hidden', 'true');
    bOn = el('span', 'on', bub); bOff = el('span', 'off', bub);
    ms = el('div', 'rg-b rg-ms', rg); ms.setAttribute('aria-hidden', 'true');
    fEl = el('div', 'rg-f'); fEl.setAttribute('aria-hidden', 'true');
    fx = fEl; fy = el('div', 'rg-fy', fEl); fs = el('div', 'rg-fs', fy); fo = el('div', 'rg-fo', fs);
    el('i', 'rg-fr', fo); el('i', 'rg-fr r2', fo);
    fImg = el('img', '', fo); fImg.alt = ''; fImg.draggable = false; fImg.decoding = 'async'; fImg.src = HAND;
    D.body.appendChild(rg); D.body.appendChild(fEl);
    return img;
  }
  function sizeDom() {
    rg.classList.toggle('sm', SZ < 64);
    rg.classList.toggle('tiny', tiny);
    bsCache = {};
    fImg.style.width = FW + 'px';
    fImg.style.left = (-0.128 * FW).toFixed(1) + 'px'; fImg.style.top = (-0.116 * FW).toFixed(1) + 'px';
  }
  function relabel() {
    var d = TX[LNG];
    hd.setAttribute('aria-label', d.head);
    mb.setAttribute('aria-label', muted ? d.muteOff : d.muteOn); mb.title = mb.getAttribute('aria-label');
    mb.setAttribute('aria-pressed', muted ? 'true' : 'false');
    xb.setAttribute('aria-label', d.close); xb.title = d.close;
  }
  var bsCache = {};
  function bubbleSize(str, w) {
    var k = w + '|' + str; if (bsCache[k]) return bsCache[k];
    ms.style.maxWidth = w + 'px'; ms.textContent = str;
    return (bsCache[k] = { w: ms.offsetWidth, h: ms.offsetHeight });
  }

  /* ================= полёт ================= */
  var P = { x: -300, y: -300, vx: 0, vy: 0 }, T = { x: 0, y: 0 }, spot = null, lookPt = null;
  var HX = -300, HY = -300, tilt = 0, lastTilt = 99, raf = 0, lastT = 0, lastSY = 0;
  var shown = false, flying = false, entering = false, parked = false, fly0 = 1, arcH = 0, AN = { x: 0, y: -1 };
  var K = 170, C = 20, ATTACH = 0.85;
  function wake() { if (!raf && !off) raf = W.requestAnimationFrame(frame); }
  function target() {
    var sy = W.pageYOffset, x, un;
    if (spot) { x = spot.x; un = spot.y - sy; } else { x = vw - EDGE - SZ; un = vh * 0.62; }
    T.x = clamp(x, EDGE, vw - EDGE - SZ); T.y = clamp(un, TOP, vh - BOT - SZ);
    return un;
  }
  function render(x, y, t) {
    HX = x; HY = y;
    rg.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
    var tr = Math.round(t * 10) / 10;
    if (tr !== lastTilt) { lastTilt = tr; hd.style.transform = tr ? 'rotate(' + tr + 'deg)' : ''; }
  }
  function lookScreen(x, y) {
    if (!face) return;
    var c = SZ * 0.78 * 2.2;
    face.look(clamp((x - HX - SZ / 2) / c, -1, 1), clamp((y - HY - SZ / 2) / c, -1, 1));
  }
  function lookSpot() { if (lookPt) lookScreen(lookPt.x, lookPt.y - W.pageYOffset); }
  function setPark(on) {
    if (on === parked) return;
    parked = on; rg.classList.toggle('park', on);
    if (on) { hush(); hideFinger(); }
    else { if (cur && cur.want) setTimeout(function () { tryReact(cur); }, 260); wake(); }
  }
  function frame(ts) {
    raf = 0; if (off) return;
    var dt = lastT ? Math.min(0.04, (ts - lastT) / 1000) : 1 / 60; lastT = ts;
    var morphing = false;
    if (!shown) { morphing = morphTick(dt); if (morphing) { if (!raf) raf = W.requestAnimationFrame(frame); } else lastT = 0; return; }
    var sy = W.pageYOffset, dsy = sy - lastSY; lastSY = sy;
    var un = target(), clampedY = Math.abs(un - T.y) > 0.5;
    if (!entering) setPark(Math.abs(un - T.y) > SZ * 0.45);
    if (RM) {
      P.x = T.x; P.y = T.y; P.vx = P.vy = 0; render(P.x, P.y, 0);
      morphing = morphTick(dt);
      if (morphing) { if (!raf) raf = W.requestAnimationFrame(frame); } else lastT = 0;
      return;
    }
    if (!entering && !clampedY) P.y -= dsy * ATTACH;   /* пришита к странице на 85 %: остаток догоняет пружина */
    var k = K, c = C, n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n, i;
    for (i = 0; i < n; i++) {
      P.vx += (k * (T.x - P.x) - c * P.vx) * h; P.vy += (k * (T.y - P.y) - c * P.vy) * h;
      P.x += P.vx * h; P.y += P.vy * h;
    }
    if (entering && P.x <= vw - EDGE - SZ && P.y >= TOP) entering = false;
    if (!entering) {
      if (P.x < EDGE) { P.x = EDGE; if (P.vx < 0) P.vx = 0; } else if (P.x > vw - EDGE - SZ) { P.x = vw - EDGE - SZ; if (P.vx > 0) P.vx = 0; }
      if (P.y < TOP) { P.y = TOP; if (P.vy < 0) P.vy = 0; } else if (P.y > vh - BOT - SZ) { P.y = vh - BOT - SZ; if (P.vy > 0) P.vy = 0; }
    }
    var ex = T.x - P.x, ey = T.y - P.y, dist = Math.sqrt(ex * ex + ey * ey), spd = Math.sqrt(P.vx * P.vx + P.vy * P.vy), ox = 0, oy = 0;
    if (flying) {
      var pr = clamp(1 - dist / fly0, 0, 1), bb = Math.sin(pr * Math.PI) * arcH;
      ox = AN.x * bb; oy = AN.y * bb;
      if (dist < 1.2 && spd < 12) { flying = false; landed(); }
    }
    var tg = clamp(P.vx * 0.011, -11, 11);
    tilt += (tg - tilt) * Math.min(1, dt * 12);
    if (flying || entering) lookSpot();
    render(P.x + ox, P.y + oy, tilt);
    morphing = morphTick(dt);
    if (flying || entering || morphing || dist > 0.4 || spd > 3 || Math.abs(tilt) > 0.05) { if (!raf) raf = W.requestAnimationFrame(frame); }
    else { P.x = T.x; P.y = T.y; P.vx = P.vy = 0; tilt = 0; render(P.x, P.y, 0); lastT = 0; }
  }
  function fly() {
    if (!shown) return;
    target();
    if (RM) { teleport(); return; }
    var dx = T.x - P.x, dy = T.y - P.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d < 6) { if (cur && cur.want) setTimeout(function () { tryReact(cur); }, 120); wake(); return; }
    flying = true; fly0 = d;
    /* дуга: поперёк полёта; вертикальный перелёт выгибается к середине экрана, остальные — вверх */
    var nx = -dy / d, ny = dx / d;
    if (Math.abs(dy) > Math.abs(dx) * 1.5) { var toC = vw / 2 - (P.x + SZ / 2) >= 0 ? 1 : -1; if (nx * toC < 0) { nx = -nx; ny = -ny; } }
    else if (ny > 0) { nx = -nx; ny = -ny; }
    AN = { x: nx, y: ny }; arcH = Math.min(SZ * 1.1, d * 0.16);
    wake();
  }
  var tpT = 0;
  function teleport() {
    clearTimeout(tpT);
    var go = function () { target(); P.x = T.x; P.y = T.y; render(P.x, P.y, 0); rg.classList.remove('fade'); wake(); if (cur && cur.want) setTimeout(function () { tryReact(cur); }, 220); };
    if (Math.abs(T.x - HX) + Math.abs(T.y - HY) < 4) { go(); return; }
    rg.classList.add('fade'); tpT = setTimeout(go, 200);
  }
  function landed() {
    if (cur && !cur.refined && cur.spot) {
      /* одна сверка после посадки: блоки страницы могли доезжать своим появлением */
      cur.refined = true;
      var s2 = spotFor(cur);
      if (Math.abs(s2.x - cur.spot.x) + Math.abs(s2.y - cur.spot.y) > 8) { cur.spot = s2; spot = s2; lookPt = { x: s2.lx, y: s2.ly }; fly(); return; }
    }
    if (cur && cur.want) setTimeout(function () { tryReact(cur); }, 100);
    wake();
  }
  /* голова собралась из частиц: пружинный «выход» и тонкое лаймовое кольцо с искрами */
  function pop() {
    rg.classList.add('lit');
    rg.classList.remove('land'); rg.classList.remove('pop'); void rg.offsetWidth; rg.classList.add('land'); rg.classList.add('pop');
    setTimeout(function () { rg.classList.remove('land'); rg.classList.remove('pop'); }, 1000);
  }

  /* ================= остановки: смена, реакция, фраза ================= */
  var actT = 0, reactT = 0, calmT = 0, typeT = 0, hideT = 0, idleT = 0, bubbleOn = false, sayKey = '', muted = lsGet(K_MUTE) === '1', off = false, lbOpen = false;
  function activate(st) {
    if (st === cur && spot) return;
    cur = st; clearTimeout(reactT); hush(); hideFinger();
    if (!st) { spot = null; lookPt = null; fly(); return; }
    if (!st.spot) st.spot = spotFor(st);
    spot = st.spot; lookPt = { x: spot.lx, y: spot.ly };
    st.want = true; st.at = now();
    ET = wantE();
    if (st.k === 'contact') setTimeout(wake, 1850);
    fly();
    reactT = setTimeout(function () { tryReact(st); }, RM ? 380 : 600);
  }
  function tryReact(st) {
    if (!st || cur !== st || !st.want || off) return;
    if (flying || entering || parked || lbOpen || tiny || rebooting || greet || D.hidden || !face) return;   /* landed/unpark/visibility/перезагрузка позовут снова */
    if (E !== 0 && !(E === 1 && st.k === 'contact')) return;   /* говорит голова — или фото в контактах, в которое она превратилась */
    st.want = false; react(st);
  }
  function react(st) {
    var said = ssGet(K_SAID).indexOf(st.k) >= 0, str = text(st);
    lookSpot();
    if (str && !said && !muted) {
      ssAdd(K_SAID, st.k);
      emote(st, true);
      say(str, st.line, function () { hintFor(st); });
    } else {
      emote(st, false);
      if (!muted) hintFor(st);
    }
  }
  function emote(st, long) {
    if (!face) return;
    clearTimeout(calmT);
    if (rebooting) return;
    if (LF.isOneShot(st.emo)) { baseE = st.then || 'idle'; face.play(st.emo, baseE); } else { baseE = st.emo; face.set(st.emo); }
    calmT = setTimeout(calm, long ? 12000 : 2400);
  }
  function calm() { clearTimeout(calmT); if (face && !bubbleOn && !rebooting) { baseE = 'idle'; face.set('idle'); } }
  function placeBubble(str) {
    var V = { l: EDGE, r: vw - EDGE, t: TOP, b: vh - BOT }, av = avoid(cur && cur.el, 0), im = E === 1 && avaBot ? q('img', avaBot) : null, b;
    if (im) { var ir = im.getBoundingClientRect(); b = bubbleFor(ir.left, ir.top, str, V, av, ir.width); }
    else b = bubbleFor(HX, HY, str, V, av);
    bub.style.maxWidth = b.mw + 'px';
    bub.style.left = (b.x - HX).toFixed(1) + 'px'; bub.style.top = (b.y - HY).toFixed(1) + 'px';
    bub.className = 'rg-b c-' + b.c + (bubbleOn ? ' on' : '');
  }
  function say(str, key, after) {
    if (!face || off) return;
    clearTimeout(typeT); clearTimeout(hideT);
    sayKey = key;
    bOn.textContent = ''; bOff.textContent = str;
    placeBubble(str);
    void bub.offsetWidth;
    bubbleOn = true; bub.classList.add('on');
    var fin = function () { face && face.talk(false); lookSpot(); hideT = setTimeout(hush, 3500); if (after) after(); };
    if (RM) { bOn.textContent = str; bOff.textContent = ''; fin(); return; }
    face.talk(true);
    var i = 0, n = str.length;
    (function step() {
      i++;
      bOn.textContent = str.slice(0, i); bOff.textContent = str.slice(i);
      if (i >= n) { fin(); return; }
      var ch = str.charAt(i - 1);
      typeT = setTimeout(step, ch === ',' || ch === ':' ? 150 : (ch === '.' || ch === '!' || ch === '?') ? 240 : 28);
    })();
  }
  function hush() {
    clearTimeout(typeT); clearTimeout(hideT);
    if (face) face.talk(false);
    if (bubbleOn) { bubbleOn = false; bub.classList.remove('on'); clearTimeout(calmT); calmT = setTimeout(calm, 1400); }
    if (greet) { greet = false; if (cur && cur.want) setTimeout(function () { tryReact(cur); }, 350); }
  }
  function retext() {
    var d = TX[LNG], str = d[sayKey] || '';
    if (!str) { hush(); return; }
    var wasTyping = !!bOff.textContent;
    clearTimeout(typeT);
    bOn.textContent = str; bOff.textContent = '';
    placeBubble(str);
    if (wasTyping) { if (face) face.talk(false); clearTimeout(hideT); hideT = setTimeout(hush, 3500); }
  }

  /* ================= палец режиссёра ================= */
  var fingerOn = false, fT1 = 0, fT2 = 0, fT3 = 0, fSY = 0, fAct = null;
  function labelBoxes(act) {
    var out = [], tw, nd;
    try {
      tw = D.createTreeWalker(act, 4, null, false);
      while ((nd = tw.nextNode())) {
        if (!/\S/.test(nd.nodeValue)) continue;
        var rg2 = D.createRange(); rg2.selectNodeContents(nd);
        var r = rg2.getBoundingClientRect(); if (!r.width) continue;
        var b = box(r, 0); b.w = 10; out.push(b);
      }
    } catch (e) {}
    return out;
  }
  function handBoxes(x, y, mx, my) {
    /* силуэт руки от кончика пальца, в ширинах картинки: указательный палец и кулак (замер по tutor_hand 240×223) */
    var a = [[-0.09, -0.12, 0.29, 0.33], [0.12, 0.03, 0.87, 0.81]], out = [], i, ox = 8 * mx, oy = 10 * my;
    for (i = 0; i < 2; i++) {
      var f = a[i], x1 = f[0] * mx * FW, x2 = f[2] * mx * FW, y1 = f[1] * my * FW, y2 = f[3] * my * FW;
      out.push({ l: x + ox + Math.min(x1, x2), r: x + ox + Math.max(x1, x2), t: y + oy + Math.min(y1, y2), b: y + oy + Math.max(y1, y2) });
    }
    return out;
  }
  function fingerPlace(tip, act, sec) {
    var r = tip.getBoundingClientRect(), B = { l: r.left, t: r.top, r: r.right, b: r.bottom }, w = B.r - B.l, h = B.b - B.t;
    var ic = q('.ico', tip), I = ic ? ic.getBoundingClientRect() : null, Pt = [], i, j;
    if (I && I.width) Pt.push({ x: (I.left + I.right) / 2, y: (I.top + I.bottom) / 2, p: 0 });
    if (Math.abs(w - h) < 10 && w < 90) {
      Pt.push({ x: B.l + w * 0.5, y: B.t + h * 0.6, p: 0 }, { x: B.l + w * 0.32, y: B.t + h * 0.68, p: 15 }, { x: B.l + w * 0.68, y: B.t + h * 0.68, p: 15 });
    } else if (w > 120 && h > 120) {
      Pt.push({ x: B.l + w * 0.5, y: B.t + h * 0.42, p: 0 }, { x: B.l + w * 0.38, y: B.t + h * 0.34, p: 10 }, { x: B.l + w * 0.62, y: B.t + h * 0.34, p: 10 });
    } else {
      var e = Math.min(16, w * 0.15);
      Pt.push({ x: B.l + e, y: B.b - 7, p: 30 }, { x: B.r - e, y: B.b - 7, p: 30 }, { x: B.l + 8, y: B.t + h / 2, p: 40 },
        { x: B.r - 8, y: B.t + h / 2, p: 40 }, { x: B.l + e, y: B.t + 7, p: 50 }, { x: B.r - e, y: B.t + 7, p: 50 });
    }
    var lab = labelBoxes(act), av = avoid(sec, 0), V = { l: 0, t: TOP - 10, r: vw, b: vh - 8 }, O = [[1, 1, 0], [-1, 1, 0], [1, -1, 150], [-1, -1, 150]], best = null;
    for (i = 0; i < Pt.length; i++) for (j = 0; j < O.length; j++) {
      var hb = handBoxes(Pt[i].x, Pt[i].y, O[j][0], O[j][1]), s = Pt[i].p + O[j][2], k;
      for (k = 0; k < 2; k++) s += cost(hb[k], lab) + cost(hb[k], av, act) + outside(hb[k], V) * 60 + overlap(hb[k], { l: HX, t: HY, r: HX + SZ, b: HY + SZ }) * 3;
      if (!best || s < best.s) best = { x: Pt[i].x, y: Pt[i].y, mx: O[j][0], my: O[j][1], s: s };
    }
    return best;
  }
  function hintFor(st) {
    if (!st || !st.hint || muted || fingerOn || off || cur !== st || parked || tiny || rebooting) return;
    var used = ssGet(K_HINT);
    if (used.length >= 4 || used.indexOf(st.hk) >= 0) return;
    var tip = pick(st, 'hint'); if (!tip) return;
    var r = tip.getBoundingClientRect();
    if (!r.width || r.top < TOP || r.bottom > vh - 4 || r.left < 0 || r.right > vw) { st.hintWait = true; return; }
    st.hintWait = false; ssAdd(K_HINT, st.hk);
    finger(tip, st);
  }
  function finger(tip, st) {
    var act = closestAct(tip) || tip, pl = fingerPlace(tip, act, st.el);
    fo.style.transform = 'scale(' + pl.mx + ',' + pl.my + ')';
    fEl.className = 'rg-f';
    fx.style.transition = fy.style.transition = 'none';
    fx.style.transform = 'translate3d(' + (HX + SZ / 2).toFixed(1) + 'px,0,0)';
    fy.style.transform = 'translate3d(0,' + (HY + SZ * (E === 1 ? 0.5 : 0.45)).toFixed(1) + 'px,0)';
    void fEl.offsetWidth;
    fx.style.transition = fy.style.transition = '';
    fEl.className = 'rg-f on';
    fx.style.transform = 'translate3d(' + pl.x.toFixed(1) + 'px,0,0)';
    fy.style.transform = 'translate3d(0,' + pl.y.toFixed(1) + 'px,0)';
    fingerOn = true; fSY = W.pageYOffset; fAct = act;
    lookScreen(pl.x, pl.y);
    if (face && !rebooting) face.play('nod', baseE);
    fT1 = setTimeout(function () { fEl.classList.add('tap'); lookScreen(pl.x, pl.y); }, RM ? 0 : 700);
    fT3 = setTimeout(function () { lookScreen(pl.x, pl.y); }, 2600);
    fT2 = setTimeout(hideFinger, RM ? 2600 : 700 + 2400 + 120);
    D.addEventListener('pointerdown', hideFinger, true);
    D.addEventListener('keydown', hideFinger, true);
    act.addEventListener('focus', hideFinger);
  }
  function hideFinger() {
    if (!fingerOn) return;
    fingerOn = false; clearTimeout(fT1); clearTimeout(fT2); clearTimeout(fT3);
    fEl.classList.remove('tap'); fEl.classList.add('out');
    setTimeout(function () { if (!fingerOn) fEl.className = 'rg-f'; }, 340);
    D.removeEventListener('pointerdown', hideFinger, true);
    D.removeEventListener('keydown', hideFinger, true);
    if (fAct) fAct.removeEventListener('focus', hideFinger);
    fAct = null;
  }

  /* ================= события ================= */
  /* на быстрой прокрутке лицо замирает (на него в этот миг не смотрят, а 4× медленный процессор теряет кадры
     на отрисовке светодиодов) и оживает через 200 мс после того, как прокрутка улеглась */
  var sfT = 0, sfOn = false, sLastY = 0, sLastT = 0;
  function scrollFreeze() {
    var t = now(), y = W.pageYOffset, v = sLastT ? Math.abs(y - sLastY) / Math.max(1, t - sLastT) : 0;
    sLastY = y; sLastT = t;
    if (!face || RM) return;
    if (v > 0.6 && !sfOn && !bubbleOn && !rebooting && !lbOpen) { sfOn = true; face.freeze(true); }
    clearTimeout(sfT);
    if (sfOn) sfT = setTimeout(function () { sfOn = false; sLastT = 0; if (face && !lbOpen) face.freeze(false); }, 200);
  }
  function onScroll() {
    if (!shown || off) return;
    scrollFreeze();
    var st = activeStop();
    if (st !== pend) {
      pend = st; clearTimeout(actT);
      if (st !== cur) { hush(); hideFinger(); }
      actT = setTimeout(function () { activate(pend); }, 90);
    }
    if (fingerOn && Math.abs(W.pageYOffset - fSY) > 24) hideFinger();
    ET = wantE();
    if (cur && cur.hintWait) { clearTimeout(idleT); idleT = setTimeout(function () { if (cur && cur.hintWait && !bubbleOn) hintFor(cur); }, 500); }
    wake();
  }
  var rzT = 0, lastW = 0;
  function onResize() {
    clearTimeout(rzT);
    rzT = setTimeout(function () {
      var oldSZ = SZ, oldW = vw, oldH = vh;
      metrics(); if (shown) sizeDom();
      dirty = true;
      /* мобильный Safari меняет высоту при прокрутке (панели) — это не повод переставлять гида */
      if (vw === oldW && Math.abs(vh - oldH) < 140) { wake(); return; }
      if (SZ !== oldSZ && face) mountFace();
      var i; for (i = 0; i < stops.length; i++) { stops[i].spot = null; stops[i].refined = false; }
      hush(); hideFinger();
      if (shown) { var st = activeStop(); pend = st; cur = null; activate(st); prewarm(); }
    }, 160);
  }
  function mountFace() {
    if (face) face.destroy();
    var fsz = Math.round(SZ * 0.78);
    face = LF.mount(cv, { size: fsz, emotion: 'idle' });
  }

  /* ================= превращение: фото ↔ голова (страница в обложках) =================
     E — где сейчас тело гида: −1 фото обложки, 0 голова, +1 фото в контактах. E идёт к цели ET со скоростью 1/1,15 с;
     из −1 в +1 — только через 0, поэтому «два фото сразу» или «фото и голова сразу» не бывает. Переход — частицы
     с сетки фото (шаг ≈4,4 px, пачки по цвету — тот же язык, что рой обложки): точка взлетает лаймовой искрой и
     садится на круг головы цветом светодиодов (лаймовые глаза, зелёная улыбка, тёмное стекло) или обратно в своё
     место на фото. Смена направления посреди перехода проигрывает те же пути назад. Холст на весь экран живёт только
     во время перехода. reduced-motion — перекрёстное растворение фото и головы. */
  var MDUR = 1.15, E = 0, ET = 0, alive = false, enterT = 0, topWant = false, greet = false, mph = null, ovl = null, og = null, odpr = 1, tail = 0, bb0 = null;
  var avaTop = q('.ava', COVER), ctSec = D.getElementById('contact'), avaBot = ctSec ? (q('.fin .ava', ctSec) || q('.ava', ctSec)) : null;
  var photo = null, photoOk = false, sampCache = {};
  var LEDC = ['#0d1310', '#161e19', '#2f3a34', '#5a6a61', '#D6FF26', '#00F680'];
  function ledClass(u, v) {
    var r = Math.sqrt(u * u + v * v), ex = Math.abs(u) - 0.33, ey = v + 0.14, my = v - (0.36 - 0.55 * u * u);
    if (r > 0.9) return 3;                                                     /* кромка сферы */
    if (ex * ex + ey * ey < 0.026) return 4;                                   /* глаза */
    if (Math.abs(u) < 0.42 && v > 0.18 && Math.abs(my) < 0.07) return 5;     /* улыбка */
    if ((u + 0.38) * (u + 0.38) + (v + 0.48) * (v + 0.48) < 0.05) return 2;  /* блик стекла */
    return (Math.round((u + v) * 7) & 1) ? 1 : 0;
  }
  function sample(w0) {
    var gw = Math.max(8, Math.round(w0 / 4.4)), key = w0 + '|' + gw, st, c, g, d, out = [], i, j, R = w0 / 2;
    if (sampCache[key]) return sampCache[key];
    if (!photoOk) return null;
    st = w0 / gw; c = D.createElement('canvas'); c.width = c.height = gw; g = c.getContext('2d');
    try { g.drawImage(photo, 0, 0, gw, gw); d = g.getImageData(0, 0, gw, gw).data; } catch (e) { return null; }
    for (j = 0; j < gw; j++) for (i = 0; i < gw; i++) {
      var dx = (i + 0.5) * st - R, dy = (j + 0.5) * st - R, rt = Math.sqrt(dx * dx + dy * dy), k = (j * gw + i) * 4;
      if (rt > R - 1) continue;
      out.push({ dx: dx, dy: dy, rt: rt, c: (d[k] >> 4) * 256 + (d[k + 1] >> 4) * 16 + (d[k + 2] >> 4) });
    }
    out.st = st; out.R = R;
    return (sampCache[key] = out);
  }
  function photoImg(lo) { var a = lo < 0 ? avaTop : avaBot; return a ? q('img', a) : null; }
  function startMorph(lo, cloud) {
    var im = photoImg(lo); if (!im) return null;
    var r = im.getBoundingClientRect(), s = r.width ? sample(Math.round(r.width)) : null; if (!s) return null;
    var R = s.R, k = SZ * 0.46 / R, pb = {}, lb = [], parts = [], i, sg = Math.random() < 0.5 ? -1 : 1;
    for (i = 0; i < LEDC.length; i++) lb.push({ c: LEDC[i], p: [] });
    for (i = 0; i < s.length; i++) {
      var o = s[i], hx = o.dx * k, hy = o.dy * k, c = o.c, a, rr;
      if (cloud) { a = Math.random() * 6.2832; rr = R * (1.3 + Math.random() * 0.9); hx = Math.cos(a) * rr; hy = Math.sin(a) * rr; }
      var pt = { px: o.dx, py: o.dy, hx: hx, hy: hy, t: 0, kk: sg * (0.14 + Math.random() * 0.3) + (Math.random() - 0.5) * 0.18,
        dl: (lo < 0 ? 1 - o.rt / R : o.rt / R) * 0.26 + Math.random() * 0.1 };   /* фото тает с края, собирается от центра */
      parts.push(pt);
      (pb[c] || (pb[c] = { c: 'rgb(' + ((c >> 8) * 17) + ',' + (((c >> 4) & 15) * 17) + ',' + ((c & 15) * 17) + ')', p: [] })).p.push(pt);
      lb[cloud ? 4 : ledClass(o.dx / R, o.dy / R)].p.push(pt);
    }
    return { lo: lo, cloud: !!cloud, parts: parts, pb: pb, lb: lb, R: R, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 + W.pageYOffset,
      sz: s.st * 0.9, hsz: cloud ? 2 : Math.max(1.4, s.st * k * 1.05) };
  }
  function ovlOn() {
    if (ovl) return;
    odpr = Math.min(2, W.devicePixelRatio || 1);
    ovl = D.createElement('canvas'); ovl.className = 'rg-ov'; ovl.setAttribute('aria-hidden', 'true');
    ovl.width = Math.round(vw * odpr); ovl.height = Math.round(vh * odpr); ovl.style.width = vw + 'px'; ovl.style.height = vh + 'px';
    og = ovl.getContext('2d'); bb0 = null;
    D.body.appendChild(ovl);
  }
  function ovlOff() { if (ovl && ovl.parentNode) ovl.parentNode.removeChild(ovl); ovl = null; og = null; mph = null; }
  function drawMorph(alpha) {
    var m = mph, sy = W.pageYOffset, p = clamp(E - m.lo, 0, 1), pcx = m.cx, pcy = m.cy - sy;
    var hcx = m.cloud ? pcx : HX + SZ / 2, hcy = m.cloud ? pcy : HY + SZ / 2, aP = m.lo < 0, L, i, j, key, pt, n = m.parts.length;
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    og.setTransform(odpr, 0, 0, odpr, 0, 0);
    /* чистим только прямоугольник прошлого кадра: холст на весь экран, а частицы занимают его малую часть */
    if (bb0) og.clearRect(bb0[0], bb0[1], bb0[2] - bb0[0], bb0[3] - bb0[1]); else og.clearRect(0, 0, vw, vh);
    og.globalAlpha = clamp(alpha, 0, 1);
    for (i = 0; i < n; i++) { pt = m.parts[i]; pt.t = clamp((p - pt.dl) / 0.64, 0, 1); }
    /* 1 — на фото, его цветом */
    for (key in m.pb) {
      L = m.pb[key].p; og.fillStyle = m.pb[key].c;
      for (j = 0; j < L.length; j++) { pt = L[j]; if (aP ? pt.t > 0.1 : pt.t < 0.9) continue; og.fillRect(pcx + pt.px - m.sz / 2, pcy + pt.py - m.sz / 2, m.sz, m.sz); }
    }
    var pr0 = m.R + m.sz + 4;
    if (pcx - pr0 < x0) x0 = pcx - pr0; if (pcx + pr0 > x1) x1 = pcx + pr0; if (pcy - pr0 < y0) y0 = pcy - pr0; if (pcy + pr0 > y1) y1 = pcy + pr0;
    /* 2 — на круге головы, цветом светодиодов */
    for (i = 0; i < m.lb.length; i++) {
      L = m.lb[i].p; og.fillStyle = m.lb[i].c;
      for (j = 0; j < L.length; j++) { pt = L[j]; if (aP ? pt.t < 0.9 : pt.t > 0.1) continue; og.fillRect(hcx + pt.hx - m.hsz / 2, hcy + pt.hy - m.hsz / 2, m.hsz, m.hsz); }
    }
    var hr = m.cloud ? m.sz * 40 : SZ;
    if (hcx - hr < x0) x0 = hcx - hr; if (hcx + hr > x1) x1 = hcx + hr; if (hcy - hr < y0) y0 = hcy - hr; if (hcy + hr > y1) y1 = hcy + hr;
    /* 3 — в полёте: лаймовая искра по дуге (как рой обложки) */
    og.globalCompositeOperation = 'lighter'; og.fillStyle = 'rgba(212,255,79,.62)';
    for (i = 0; i < n; i++) {
      pt = m.parts[i]; if (pt.t <= 0.1 || pt.t >= 0.9) continue;
      var u = (pt.t - 0.1) / 0.8; u = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      var ax = pcx + pt.px, ay = pcy + pt.py, bx = hcx + pt.hx, by = hcy + pt.hy, tq;
      if (!aP) { tq = ax; ax = bx; bx = tq; tq = ay; ay = by; by = tq; }
      var ddx = bx - ax, ddy = by - ay, mx = (ax + bx) / 2 - ddy * pt.kk, my = (ay + by) / 2 + ddx * pt.kk, iu = 1 - u;
      var x = iu * iu * ax + 2 * iu * u * mx + u * u * bx, y = iu * iu * ay + 2 * iu * u * my + u * u * by;
      og.fillRect(x - 1.1, y - 1.1, 2.2, 2.2);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    og.globalCompositeOperation = 'source-over'; og.globalAlpha = 1;
    bb0 = [Math.max(0, x0 - 6), Math.max(0, y0 - 6), Math.min(vw, x1 + 6), Math.min(vh, y1 + 6)];
  }
  /* куда хочет тело: наверху — фото обложки, в контактах — фото там, всё остальное — голова */
  function wantE() {
    var sy = W.pageYOffset;
    if (sy < 20) topWant = true; else if (sy > 40) topWant = false;
    if (!alive) return botView() ? 1 : E;
    if (topWant) return -1;
    if (pend && pend.k === 'contact') return 1;
    return 0;
  }
  function botView() {
    var im = photoImg(1); if (!im) return false;
    var r = im.getBoundingClientRect(); return r.width > 0 && r.bottom > 40 && r.top < (W.innerHeight || 800) - 40;
  }
  function nearAva() {
    if (!alive) return true;
    if (!cur || cur.k !== 'contact' || parked) return false;
    return (!flying && Math.abs(HX - T.x) + Math.abs(HY - T.y) < SZ * 0.6) || now() - (cur.at || 0) > 1800;
  }
  function applyE() {
    if (rg) rg.classList.toggle('emb', E !== 0);
    if (avaTop) avaTop.classList.toggle('rg-gone', alive && E > -1);
    if (avaBot) avaBot.classList.toggle('rg-gone', E < 1);
  }
  function arrive(from) {
    tail = now();
    if (E === 0) {
      pop();
      if (from < 0) born();
      else if (cur && cur.want) setTimeout(function () { tryReact(cur); }, 300);
    } else {
      hush(); hideFinger();
      if (E === 1 && cur && cur.k === 'contact' && cur.want) setTimeout(function () { tryReact(cur); }, 250);
    }
  }
  /* голова родилась из фото обложки: «привет» — первым делом, один раз за визит */
  function born() {
    if (!face) return;
    if (cur && cur.k === 'cover') { if (cur.want) { tryReact(cur); return; } face.play('hello', 'idle'); return; }
    if (ssGet(K_SAID).indexOf('cover') < 0 && !muted) {
      ssAdd(K_SAID, 'cover'); face.play('hello', 'idle'); greet = true;
      say(TX[LNG].cover, 'cover', null);
    } else { face.play('hello', 'idle'); if (cur && cur.want) setTimeout(function () { tryReact(cur); }, 400); }
  }
  function morphTick(dt) {
    var tg = ET, was = E, busy = false;
    /* открыли страницу сразу на контактах (якорь, восстановление прокрутки): без рождения и полёта —
       фото просто собирается из облака частиц */
    var direct = alive && tg === 1 && E < 1 && now() - enterT < 3000 && !(mph && mph.lo === 0 && !mph.cloud);
    if (direct && (E <= 0 || (mph && mph.lo < 0))) { ovlOff(); E = 0.0001; applyE(); }   /* начатое рождение за кадром бросаем */
    if (!alive && tg < E) tg = E;                                   /* без головы фото в контактах не разбирается */
    if (tg > E && E === 0 && !direct && !nearAva()) tg = 0;   /* в контактах сначала долететь до кольца: разбудят посадка, выход из парковки или таймер */
    if (tg !== E) {
      if (RM) { E = (E < 0 && tg > 0) || (E > 0 && tg < 0) ? 0 : tg; applyE(); arrive(was); return true; }
      var lo = E < 0 || (E === 0 && tg < 0) ? -1 : 0;
      if (!mph || mph.lo !== lo) {
        ovlOff();
        mph = startMorph(lo, lo === 0 && (!alive || direct));
        if (!mph) { E = (E < 0 && tg > 0) || (E > 0 && tg < 0) ? 0 : tg; applyE(); arrive(was); return true; }
        ovlOn();
      }
      var sp = dt / MDUR, nE = E < tg ? Math.min(tg, E + sp) : Math.max(tg, E - sp);
      if ((E < 0 && nE > 0) || (E > 0 && nE < 0)) nE = 0;
      E = nE; applyE();
      if (was === 0 && E !== 0) { hush(); hideFinger(); }   /* голова начала таять — её реплика и палец уходят с ней */
      if (E === -1 || E === 0 || E === 1) arrive(was);
      busy = true;
    }
    if (mph && og) {
      var a = 1;
      if (E === mph.lo || E === mph.lo + 1) { a = 1 - (now() - tail) / 240; if (a <= 0) { ovlOff(); return busy; } }
      drawMorph(a); busy = true;
    }
    return busy;
  }
  function preScroll() { if (alive || off) return; var t = wantE(); if (t !== ET) { ET = t; wake(); } }
  (function () {
    var src = avaTop && q('img', avaTop);
    photo = new Image(); photo.decoding = 'async';
    photo.onload = function () { photoOk = true; preScroll(); };
    photo.src = src ? (src.currentSrc || src.src) : '/assets/roch-ava.webp';
  })();

  /* ================= запуск ================= */
  var started = false, ready = false, asmDone = false, sphereOk = false, scrolled = false;
  function load() {
    if (started) return; started = true;
    if (W.LedFace) { onEngine(); return; }
    var s = D.createElement('script'); s.src = BASE + '/led-face.js'; s.async = true;
    s.onload = onEngine; s.onerror = function () { started = 'failed'; };
    D.head.appendChild(s);
  }
  function onEngine() {
    LF = W.LedFace; if (!LF || !LF.mount) return;
    try { LF.setBase(BASE); } catch (e) {}
    metrics();
    var img = build(); sizeDom(); relabel();
    rg.classList.toggle('mute', muted);
    img.onload = img.onerror = function () { sphereOk = true; maybeEnter(); };
    img.src = BASE + '/mascot/sphere.webp';
    mountFace();
    if (!face) { rg.parentNode.removeChild(rg); fEl.parentNode.removeChild(fEl); return; }
    bind();
    ready = true; maybeEnter();
  }
  function maybeEnter() {
    if (shown || off || !ready || !sphereOk || !(asmDone || scrolled)) return;
    if (D.hidden) { D.addEventListener('visibilitychange', function v() { if (!D.hidden) { D.removeEventListener('visibilitychange', v); maybeEnter(); } }); return; }
    enter();
  }
  /* места всех остановок считаются заранее, в простое страницы: смена остановки на прокрутке почти бесплатна */
  var warmT = 0;
  function prewarm() {
    clearTimeout(warmT);
    var ric = W.requestIdleCallback || function (fn) { return setTimeout(function () { fn({ timeRemaining: function () { return 10; } }); }, 120); };
    ric(function (dl) {
      var i, left = false;
      for (i = 0; i < stops.length; i++) {
        if (stops[i].spot) continue;
        if (dl.timeRemaining() < 6) { left = true; break; }
        stops[i].spot = spotFor(stops[i]);
      }
      if (left || !stops.every(function (x) { return x.spot; })) warmT = setTimeout(prewarm, 60);
    }, { timeout: 2000 });
  }
  function enter() {
    shown = true; alive = true; enterT = now(); metrics(); sizeDom(); scan(); measure();
    setTimeout(prewarm, 1600);
    lastSY = W.pageYOffset;
    var st = activeStop();
    pend = st; cur = null;
    rg.classList.add('on');
    wantE();
    /* тело на старте: наверху — фото обложки (голова родится из него на первой прокрутке); обложка ещё видна,
       а прокрутка уже ушла вниз — рождение играет сразу; фото в контактах уже собрано — остаёмся им */
    if (topWant) E = -1;
    else if (E === 0) { var ti = photoImg(-1), tr = ti ? ti.getBoundingClientRect() : null; if (tr && tr.bottom > TOP && tr.top < vh) E = -1; }
    ET = wantE(); applyE();
    if (E !== 0 || RM) {
      rg.classList.add('lit');
      if (st) { st.spot = st.spot || spotFor(st); spot = st.spot; lookPt = { x: spot.lx, y: spot.ly }; }
      target(); P.x = T.x; P.y = T.y; render(P.x, P.y, 0);
      if (RM && E === 0) rg.classList.add('fade');
      activate(st); wake();
      return;
    }
    /* открыли страницу в середине: голова влетает справа */
    rg.classList.add('lit');
    target(); P.x = vw + 24; P.y = clamp(vh * 0.55, TOP, vh - BOT - SZ); P.vx = -200; P.vy = 0; entering = true;
    render(P.x, P.y, 0);
    activate(st);
  }


  var pmT = 0, lpT = 0, xT = 0, eatClick = false, mo1, mo2, mo3, ro = null;
  /* касания головы — для удовольствия: случайная эмоция; 4–5 быстрых — раздражение; 6-е — «перезагрузка» */
  var FUN = ['giggle', 'wow', 'cheeky', 'wink', 'shy', 'laugh', 'tongue', 'love', 'kiss', 'embarrassed'], MAD = ['grumpy', 'nervous', 'dizzy'];
  var taps = [], lastFun = '', funT = 0, rebooting = false, baseE = 'idle', rbT = [];
  function poolPick(a) {
    var ok = [], i; for (i = 0; i < a.length; i++) if (LF.has(a[i]) && a[i] !== lastFun) ok.push(a[i]);
    lastFun = ok[Math.floor(Math.random() * ok.length)] || 'giggle'; return lastFun;
  }
  function flash(name, hold) {
    clearTimeout(funT);
    if (LF.isOneShot(name)) face.play(name, baseE);
    else { face.set(name); funT = setTimeout(function () { if (face && !rebooting) face.set(baseE); }, hold || 1600); }
  }
  function onTap() {
    if (!face || off || rebooting) return;
    var t = Date.now(); taps.push(t);
    while (taps.length && t - taps[0] > 2500) taps.shift();
    hideFinger();
    if (taps.length >= 6) { taps = []; reboot(); return; }
    if (taps.length >= 4) flash(poolPick(MAD), 1500); else flash(poolPick(FUN));
  }
  function reboot() {
    rebooting = true; hush(); hideFinger(); clearTimeout(funT); clearTimeout(calmT);
    var t = 0, at = function (ms, fn) { t += ms; rbT.push(setTimeout(fn, t)); };
    if (!RM) rg.classList.add('glitchy');
    face.play('glitch', 'deepSleep');
    at(1300, function () { rg.classList.remove('glitchy'); face.set('deepSleep'); rg.classList.add('sleep'); });
    at(3500 + Math.round(Math.random() * 1000), function () { face.play('shutdown', 'deepSleep'); });
    at(1300, function () { rg.classList.add('dark'); });
    at(500, function () { rg.classList.remove('sleep'); rg.classList.remove('dark'); face.play('boot', 'idle'); });
    at(1700, function () {
      rebooting = false; rbT = []; baseE = 'idle';
      if (cur && cur.want) tryReact(cur);
      else if (!muted && !bubbleOn && !parked && !lbOpen) say(TX[LNG].reboot, 'reboot', null);
    });
  }
  function toggleMute() {
    muted = !muted; lsSet(K_MUTE, muted ? '1' : null);
    rg.classList.toggle('mute', muted); relabel();
    hideFinger();
    if (face && !rebooting) face.play('nod', baseE);
    say(TX[LNG][muted ? 'mute' : 'unmute'], muted ? 'mute' : 'unmute', null);
  }
  function onPointer(e) {
    if (e.pointerType !== 'mouse' || !face || bubbleOn || fingerOn || flying || entering) return;
    var t = Date.now(); if (t - pmT < 60) return; pmT = t;
    lookScreen(e.clientX, e.clientY);
  }
  function bind() {
    W.addEventListener('scroll', onScroll, { passive: true });
    W.addEventListener('resize', onResize, { passive: true });
    if (FINE) W.addEventListener('pointermove', onPointer, { passive: true });
    hd.addEventListener('click', function () {
      if (eatClick) { eatClick = false; return; }
      onTap();
    });
    mb.addEventListener('click', function (e) { e.stopPropagation(); toggleMute(); });
    hd.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      clearTimeout(lpT);
      lpT = setTimeout(function () {
        eatClick = true; rg.classList.add('xon');
        clearTimeout(xT); xT = setTimeout(function () { rg.classList.remove('xon'); }, 3200);
      }, 480);
    });
    var stopLp = function () { clearTimeout(lpT); };
    hd.addEventListener('pointerup', stopLp); hd.addEventListener('pointercancel', stopLp); hd.addEventListener('pointerleave', stopLp);
    hd.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    xb.addEventListener('click', function (e) { e.stopPropagation(); goodbye(); });
    /* язык страницы: <html lang> меняет переключатель RU/EN */
    mo1 = new MutationObserver(function () {
      var l = lang(); if (l === LNG) return;
      LNG = l; relabel();
      var i; for (i = 0; i < stops.length; i++) if (stops[i] !== cur) stops[i].spot = null;
      if (bubbleOn) retext();
      prewarm();
    });
    mo1.observe(HTML, { attributes: true, attributeFilter: ['lang'] });
    /* слайды продуктов перерисовываются при смене языка; блок ROCH Motion может появиться позже */
    var scT = 0;
    mo2 = new MutationObserver(function () {
      clearTimeout(scT);
      scT = setTimeout(function () {
        var had = cur && cur.k; scan(); measure(); prewarm();
        if (cur) { cur.spot = spotFor(cur); spot = cur.spot; lookPt = { x: spot.lx, y: spot.ly }; if (bubbleOn) placeBubble(bOn.textContent + bOff.textContent); wake(); }
        else if (had) { var st = activeStop(); pend = st; activate(st); }
      }, 140);
    });
    var pr = D.getElementById('prods'), main = q('main');
    if (pr) mo2.observe(pr, { childList: true });
    if (main) mo2.observe(main, { childList: true });
    /* лайтбокс экранов — гид прячется и замирает */
    var lb = D.getElementById('lb');
    if (lb) {
      mo3 = new MutationObserver(function () {
        var o = !lb.hasAttribute('hidden'); if (o === lbOpen) return;
        lbOpen = o; rg.classList.toggle('lbo', o);
        if (o) { hush(); hideFinger(); }
        if (face) face.freeze(o);
        if (!o && cur && cur.want) setTimeout(function () { tryReact(cur); }, 300);
      });
      mo3.observe(lb, { attributes: true, attributeFilter: ['hidden'] });
    }
    if (W.ResizeObserver) { ro = new ResizeObserver(function () { dirty = true; }); ro.observe(D.body); }
    D.addEventListener('visibilitychange', function () { if (!D.hidden && cur && cur.want) setTimeout(function () { tryReact(cur); }, 300); });
  }
  function goodbye() {
    off = true; lsSet(K_OFF, '1');
    hush(); hideFinger();
    while (rbT.length) clearTimeout(rbT.pop());
    if (face) face.play('shutdown');
    rg.classList.remove('xon'); rg.classList.add('bye');
    setTimeout(function () {
      W.removeEventListener('scroll', onScroll); W.removeEventListener('resize', onResize); W.removeEventListener('pointermove', onPointer);
      if (mo1) mo1.disconnect(); if (mo2) mo2.disconnect(); if (mo3) mo3.disconnect(); if (ro) ro.disconnect();
      if (face) { face.destroy(); face = null; }
      if (raf) W.cancelAnimationFrame(raf);
      ovlOff();
      if (avaTop) avaTop.classList.remove('rg-gone');
      if (avaBot) avaBot.classList.remove('rg-gone');
      if (rg.parentNode) rg.parentNode.removeChild(rg);
      if (fEl.parentNode) fEl.parentNode.removeChild(fEl);
      shown = false;
    }, 1300);
  }

  /* сборка фото на обложке закончилась (класс sw-on есть, sw-wait снят) — момент для входа */
  (function () {
    var ava = q('.ava', COVER), done = false;
    var go = function () { if (done) return; done = true; asmDone = true; load(); maybeEnter(); };
    if (RM || !ava) { setTimeout(go, 700); return; }
    var ok = function () { var c = ' ' + ava.className + ' '; return c.indexOf(' sw-on ') >= 0 && c.indexOf(' sw-wait ') < 0; };
    setTimeout(go, 3400);   /* запасной выход, если рой не доиграл */
    if (ok()) { setTimeout(go, 250); return; }
    if ((' ' + ava.className + ' ').indexOf(' sw ') < 0) { setTimeout(go, 900); return; }
    var m = new MutationObserver(function () { if (ok()) { m.disconnect(); setTimeout(go, 250); } });
    m.observe(ava, { attributes: true, attributeFilter: ['class'] });
  })();
  /* лицо грузим после сборки фото, после первой прокрутки или через 2 с после load — что раньше */
  W.addEventListener('scroll', function first() { W.removeEventListener('scroll', first); scrolled = true; load(); maybeEnter(); }, { passive: true });
  if (D.readyState === 'complete') setTimeout(load, 2000);
  else W.addEventListener('load', function () { setTimeout(load, 2000); });
  metrics(); scan();
  /* до появления головы: фото в контактах ждёт своей сборки (если оно уже на экране — не трогаем) */
  W.addEventListener('scroll', preScroll, { passive: true });
  if (avaBot && !botView()) { E = 0; applyE(); } else { E = avaBot ? 1 : 0; }
  ET = E;

  if (LOCAL) W.__rochGuide = {
    state: function () {
      return { shown: shown, cur: cur && cur.k, bubble: bubbleOn ? bOn.textContent + bOff.textContent : '', typing: bubbleOn && !!bOff.textContent,
        finger: fingerOn, muted: muted, parked: parked, flying: flying, entering: entering, x: Math.round(HX), y: Math.round(HY), size: SZ, lang: LNG,
        fun: lastFun, rebooting: rebooting, E: Math.round(E * 1000) / 1000, ET: ET, ovl: !!ovl, cls: rg ? rg.className : '', aria: hd ? hd.getAttribute('aria-label') : '',
        stops: stops.map(function (s) { return s.k; }) };
    }
  };
})();
