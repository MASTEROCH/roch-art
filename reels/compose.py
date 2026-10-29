#!/usr/bin/env python3
"""ROCH Reels · compose. «Слово → продукт за 17 секунд»: hook (the customer's idea dissolves into particles that fly into
the phone) → 3 real beats of the live app (kinetic caption, finger ring on real taps, gentle push-in) → end card.

python3 reels/compose.py reels/beats/<slug>.json [--lang ru|en] [--draft] [--no-layers]

Edit decision list on the SOURCE clock: every step of a beat is a window [a, b] of the recording (markers.json) played at
its own speed; beats are hard cuts. Every frame is composed in PIL and piped to libx264.
→ reels/out/<slug>-<lang>-master.mp4 (1080×1920, crf 18) · <slug>-<lang>-site.mp4 (720×1280, two-pass ≤ 3 MB, no audio)
→ reels/out/<slug>-poster.webp (720×1280, a frame from beat 1) · reels/out/<slug>-<lang>.edl.json
"""
import json, math, os, random, subprocess, sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = {a.split('=')[0][2:]: (a.split('=', 1)[1] if '=' in a else True) for a in sys.argv[1:] if a.startswith('--')}
if not ARGS:
    sys.exit('usage: python3 reels/compose.py reels/beats/<slug>.json [--lang ru|en] [--draft]')
SPEC = json.load(open(ARGS[0]))
LANG = OPT.get('lang', 'ru'); DRAFT = bool(OPT.get('draft'))
LY = json.load(open(os.path.join(HERE, 'lib', 'layout.json')))
W, H, FPS = LY['W'], LY['H'], LY['FPS']
SW, SH, SX, SY, SR, BZ, PAD = LY['SW'], LY['SH'], LY['SX'], LY['SY'], LY['SR'], LY['BZ'], LY['PAD']
HOOK, END = SPEC.get('hook', {}).get('dur', LY['HOOK']), SPEC.get('end', {}).get('dur', LY['END'])
WORK = os.path.join(HERE, 'work', SPEC['slug']); LAY = os.path.join(WORK, 'layers-' + LANG)
# EN-дубли с переведённым интерфейсом лежат в work/<slug>/en (record.mjs --lang=en); нет их — монтаж берёт русские дубли
TAKES = os.path.join(WORK, 'en') if LANG == 'en' and os.path.isdir(os.path.join(WORK, 'en', 'take-1')) else WORK
OUTD = os.path.join(HERE, 'out'); os.makedirs(OUTD, exist_ok=True)
def hexrgb(h): n = int(h[1:], 16); return (n >> 16 & 255, n >> 8 & 255, n & 255)
BRAND, LIME = hexrgb(SPEC.get('color', '#FF4F8B')), hexrgb(LY['LIME'])
random.seed(7)

# ── every word the viewer reads goes through the ТЕКСТ guard first (findings are printed, not fatal) ──
def T(k): return SPEC.get(k + '_' + LANG, SPEC.get(k + '_ru', ''))
TXT = os.path.join(OUTD, '%s-%s.captions.txt' % (SPEC['slug'], LANG))
open(TXT, 'w').write('\n\n'.join([T('idea')] + [B.get('cap_' + LANG, B.get('cap_ru', '')).replace('*', '') for B in SPEC['beats']] + [SPEC['name'], T('niche'),
    'Упаковано ROCH 0→1 · roch-art.com' if LANG == 'ru' else 'Packaged by ROCH 0→1 · roch-art.com']) + '\n')
TC = os.path.expanduser('~/.claude/skills/ТЕКСТ/templates/textcheck.py')
if LANG == 'ru' and os.path.exists(TC):
    r = subprocess.run(['python3', TC, TXT], capture_output=True, text=True)
    print('textcheck:', 'clean' if r.returncode == 0 else '\n' + (r.stdout + r.stderr).strip())

# ── layers (re-rendered when the beat file is newer) ──
lj = os.path.join(LAY, 'layers.json')
if not OPT.get('no-layers') and (not os.path.exists(lj) or os.path.getmtime(ARGS[0]) > os.path.getmtime(lj) or os.path.getmtime(os.path.join(HERE, 'layers.mjs')) > os.path.getmtime(lj)):
    subprocess.run(['node', os.path.join(HERE, 'layers.mjs'), ARGS[0], '--lang=' + LANG], check=True)
META = json.load(open(lj))
def L(n): return Image.open(os.path.join(LAY, n + '.png')).convert('RGBA')
BG = L('bg'); UNDER, BEZEL, GLARE, SCRIM = L('phone-under'), L('bezel'), L('glare'), L('scrim')
PW, PH = UNDER.size
PO = (SX - BZ - PAD, SY - BZ - PAD)                      # phone canvas origin in the frame at rest
CAPS = [[(Image.open(os.path.join(LAY, 'cap-%d-w%d.png' % (i, k))).convert('RGBA'), b) for k, b in enumerate(c['words'])] for i, c in enumerate(META['caps'])]
HOOKW = [(Image.open(os.path.join(LAY, 'hook-w%d.png' % k)).convert('RGBA'), b) for k, b in enumerate(META['hook']['words'])]
HOOKIMG = L('hook')
E_LOGO, E_NAME, E_NICHE, E_CRED = L('end-logo'), L('end-name'), L('end-niche'), L('end-credit')
m4 = Image.new('L', (SW * 4, SH * 4), 0); ImageDraw.Draw(m4).rounded_rectangle([0, 0, SW * 4 - 1, SH * 4 - 1], radius=SR * 4, fill=255)
MASK = m4.resize((SW, SH), Image.LANCZOS)

# ── takes and markers ──
best = json.load(open(os.path.join(TAKES, 'best.json'))) if os.path.exists(os.path.join(TAKES, 'best.json')) else {}
MK = {}
def markers(take):
    if take not in MK: MK[take] = json.load(open(os.path.join(TAKES, take, 'markers.json')))
    return MK[take]
K = SW / float(markers(best.get(SPEC['beats'][0].get('id', 'b1'), 'take-1'))['vw'])

# ── EDL: (take, a, b, speed, beat) on the source clock ──
segs = []
for i, B in enumerate(SPEC['beats']):
    bid = B.get('id', 'b%d' % (i + 1)); take = best.get(bid, 'take-1')
    M = [m for m in markers(take)['beats'] if m['id'] == bid][0]
    st = M['steps']; part = []
    for j, s in enumerate(st):
        a = s['a'] + (B.get('trim_in', 0) if j == 0 else 0)
        b = s['b'] - (B.get('trim_out', 0) if j == len(st) - 1 else 0)
        sp = (B.get('steps') or [B])[j].get('speed', 1) if j < len(B.get('steps') or [B]) else 1
        part.append([take, a, b, sp, i])
    natural = sum((p[2] - p[1]) / p[3] for p in part)
    if B.get('dur') and natural > B['dur']:                # only ever speed up to fit; never slow a UI down
        k = natural / B['dur']
        for p in part: p[3] *= k
    segs += part
outs, acc = [], HOOK
for s in segs: outs.append(acc); acc += (s[2] - s[1]) / s[3]
SCREEN_END = acc; TOTAL = SCREEN_END + END; NF = int(round(TOTAL * FPS))
BT = []
for i in range(len(SPEC['beats'])):
    ix = [k for k, s in enumerate(segs) if s[4] == i]
    BT.append((outs[ix[0]], outs[ix[-1]] + (segs[ix[-1]][2] - segs[ix[-1]][1]) / segs[ix[-1]][3]))
print('hook %.2f · ' % HOOK + ' · '.join('%s %.2f' % (SPEC['beats'][i].get('id'), b - a) for i, (a, b) in enumerate(BT)) + ' · end %.2f → %.2f s' % (END, TOTAL))

def seg_at(t):
    for s, o in zip(segs, outs):
        if o - 1e-6 <= t < o + (s[2] - s[1]) / s[3] - 1e-6: return s, o
    return segs[-1], outs[-1]
def out_t(take, src):
    for s, o in zip(segs, outs):
        if s[0] == take and s[1] - 1e-3 <= src <= s[2] + 1e-3: return o + (src - s[1]) / s[3]
    return None
TAPS = []                                                  # (output time, x css, y css)
SWIPES = []
for take in sorted(set(s[0] for s in segs)):
    for tp in markers(take).get('taps', []):
        ot = out_t(take, tp['t'])
        if ot is not None: TAPS.append((ot, tp['x'], tp['y']))
    for sw in markers(take).get('swipes', []):
        a, b = out_t(take, sw['t0']), out_t(take, sw['t1'])
        if a is not None and b is not None: SWIPES.append((a, b, sw['x0'], sw['y0'], sw['x1'], sw['y1']))

# ── source decoders: one sequential 60 fps pipe per take; requests are monotonic inside a take ──
class Dec:
    def __init__(self, take):
        self.p = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', os.path.join(TAKES, take, 'full.mp4'), '-vf', 'scale=%d:%d:flags=lanczos' % (SW, SH),
                                   '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE, bufsize=SW * SH * 3 * 4)
        self.i, self.last, self.n = -1, None, SW * SH * 3
    def get(self, idx):
        while self.i < idx:
            b = self.p.stdout.read(self.n)
            if len(b) < self.n: break
            self.last = b; self.i += 1
        return Image.frombytes('RGB', (SW, SH), self.last)
DEC = {t: Dec(t) for t in sorted(set(s[0] for s in segs))}
def screen_at(t):
    s, o = seg_at(t); src = s[1] + (t - o) * s[3]
    return DEC[s[0]].get(int(round(src * 60)))

def clamp(x, a=0., b=1.): return max(a, min(b, x))
def ease_io(k): k = clamp(k); return 4 * k ** 3 if k < .5 else 1 - (-2 * k + 2) ** 3 / 2
def ease_out(k): k = clamp(k); return 1 - (1 - k) ** 4
def ease_in(k): k = clamp(k); return k ** 3
def back_out(k): k = clamp(k); c = 1.6; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2
def with_alpha(img, a):
    if a >= 0.999: return img
    im = img.copy(); im.putalpha(ImageChops.multiply(im.getchannel('A'), Image.new('L', im.size, int(255 * clamp(a))))); return im

# ── finger: a soft touch dot that lands, presses, and leaves a ripple (only where a real tap happened) ──
def draw_finger(cv, t):
    # ImageDraw on an RGBA image REPLACES pixels, alpha included: a 60-alpha fill drawn straight on the phone punched a hole
    # through the screen, and the dark background showed through as a black disc over the button (babyland, hotelito 29.10).
    # So the touch is drawn on its own transparent layer and alpha-composited over the screen.
    ox, oy = PAD + BZ, PAD + BZ
    if not any(ot - .26 <= t <= ot + .55 for ot, _, _ in TAPS) and not any(a - .2 <= t <= b + .25 for a, b, *_ in SWIPES): return
    lay = Image.new('RGBA', cv.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lay, 'RGBA')
    for ot, x, y in TAPS:
        if not (ot - .26 <= t <= ot + .55): continue
        cx, cy = ox + x * K, oy + y * K; u = t - ot
        # a ring, not a disc: the button under the finger must stay readable (a filled dot read as a grey blob)
        if u < 0: k = ease_out((u + .26) / .26); r = 36 * (1.4 - .4 * k); a = k
        elif u < .12: k = 1; r = 36 * (1 - .14 * ease_out(u / .12)); a = 1
        else: k = 1; r = 36 * (.86 + .14 * ease_out((u - .12) / .2)); a = 1 - ease_in((u - .12) / .3)
        if a > .01:
            d.ellipse([cx - r - 7, cy - r - 7, cx + r + 7, cy + r + 7], outline=(255, 255, 255, int(46 * a)), width=7)
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, int((30 if u < 0 else 60) * a)), outline=(255, 255, 255, int(235 * a)), width=4)
        if u >= 0:                                            # ripple in the brand colour, then a thin white echo
            k2 = ease_out(u / .5); R = 36 + 70 * k2
            d.ellipse([cx - R, cy - R, cx + R, cy + R], outline=BRAND + (int(235 * (1 - k2)),), width=5)
            k3 = ease_out(u / .4); R2 = 34 + 46 * k3; d.ellipse([cx - R2, cy - R2, cx + R2, cy + R2], outline=(255, 255, 255, int(170 * (1 - k3))), width=2)
    for a, b, x0, y0, x1, y1 in SWIPES:
        if not (a - .2 <= t <= b + .25): continue
        k = ease_io((t - a) / max(.05, b - a)); cx, cy = ox + (x0 + (x1 - x0) * k) * K, oy + (y0 + (y1 - y0) * k) * K
        al = min(clamp((t - a + .2) / .2), clamp((b + .25 - t) / .25)) * .5
        for rr, aa in ((46, .12), (38, .2), (31, 1.)): d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(255, 255, 255, int(255 * al * aa)))
    cv.alpha_composite(lay)

def phone_canvas(scr, t, dim=0.):
    cv = UNDER.copy()
    if dim > 0: scr = Image.blend(scr, Image.new('RGB', scr.size, (0, 0, 0)), dim)
    cv.paste(scr, (PAD + BZ, PAD + BZ), MASK)
    draw_finger(cv, t)
    cv.alpha_composite(GLARE); cv.alpha_composite(BEZEL)
    return cv
def place(frame, cv, z=1., ax=0., ay=0., dx=0., dy=0., alpha=1.):
    """scale the phone canvas by z about frame point (ax, ay), then shift by (dx, dy)"""
    if z != 1.:
        nw, nh = int(round(PW * z)), int(round(PH * z)); cv = cv.resize((nw, nh), Image.BICUBIC)
        x = ax + (PO[0] - ax) * z + dx; y = ay + (PO[1] - ay) * z + dy
    else: x, y = PO[0] + dx, PO[1] + dy
    if alpha < 1: cv = with_alpha(cv, alpha)
    frame.alpha_composite(cv, (int(round(x)), int(round(y)))) if x >= 0 and y >= 0 else frame.paste(cv, (int(round(x)), int(round(y))), cv)

def draw_caption(frame, i, t):
    a, b = BT[i]
    for k, (im, (x, y, w, h)) in enumerate(CAPS[i]):
        u = t - a - .06 - k * .045; e = ease_out(u / .42)
        if e <= 0: continue
        al, dy = e, 38 * (1 - e)
        if t > b - .16: q = clamp((b - t) / .16); al *= q; dy -= 22 * (1 - q)
        if al <= 0.01: continue
        frame.alpha_composite(with_alpha(im, al), (x, int(round(y + dy))))

# ── hook particles: sampled from the idea's own pixels, they leave left→right and stream into the chat input ──
HA = HOOKIMG.getchannel('A'); bbox = HA.getbbox(); hx0, hy0, hx1, hy1 = bbox
pts = []
px = HA.load()
for yy in range(hy0, hy1, 3):
    for xx in range(hx0, hx1, 3):
        if px[xx, yy] > 150: pts.append((xx, yy))
random.shuffle(pts); N = min(len(pts), 1900 if not DRAFT else 1000)
LAND = SPEC.get('hook', {}).get('land', {'x': SW / K / 2, 'y': SH / K * .9})
D0, D1 = .92, 1.52                                         # dissolve front sweeps in this window
SLIDE = (.82, 1.62)
P = []
for (x, y) in pts[:N]:
    rel = (x - hx0) / max(1, hx1 - hx0)
    tr = D0 + (D1 - D0) * rel + random.random() * .05
    c = random.random(); col = LIME if c < .5 else (BRAND if c < .92 else (255, 244, 248))
    P.append(dict(x=x, y=y, tr=tr, d=.38 + random.random() * .2, cx=x + random.uniform(-380, 380), cy=y + random.uniform(-520, -60),
                  lx=random.uniform(-150, 150), ly=random.gauss(0, 10), r=1.9 + random.random() * 1.9, col=col))
def phone_dy(t):
    if t >= SLIDE[1]: return 0.
    k = clamp((t - SLIDE[0]) / (SLIDE[1] - SLIDE[0])); return 1300 * (1 - (1 - (1 - k) ** 3) * (1 + .0 * k)) if k < 1 else 0.
def land_xy(t): return SX + LAND['x'] * K, SY + LAND['y'] * K + phone_dy(t)
GLOW = Image.new('RGBA', (220, 220), (0, 0, 0, 0)); gd = ImageDraw.Draw(GLOW)
for r in range(110, 0, -2): gd.ellipse([110 - r, 110 - r, 110 + r, 110 + r], fill=LIME + (int(110 * (1 - r / 110) ** 2.2),))
def draw_particles(frame, t):
    if t < D0 or t > HOOK + .1: return
    core = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dc = ImageDraw.Draw(core)
    glow = Image.new('RGBA', (W // 4, H // 4), (0, 0, 0, 0)); dg = ImageDraw.Draw(glow)
    tx, ty = land_xy(t); arrived = 0
    def pos(p, tt):
        u = (tt - p['tr']) / p['d']; e = ease_io(u); X, Y = land_xy(tt); X += p['lx']; Y += p['ly']
        q = 1 - e; return q * q * p['x'] + 2 * q * e * p['cx'] + e * e * X, q * q * p['y'] + 2 * q * e * p['cy'] + e * e * Y, u
    for p in P:
        if t < p['tr']: continue
        x, y, u = pos(p, t)
        if u >= 1: arrived += 1; continue
        x0, y0, _ = pos(p, max(p['tr'], t - .016))
        r = p['r'] * (1 - .55 * ease_in(u)); a = int(255 * (1 - .4 * ease_in(u)))
        dc.line([x0, y0, x, y], fill=p['col'] + (int(a * .42),), width=max(1, int(r)))
        dc.ellipse([x - r, y - r, x + r, y + r], fill=p['col'] + (a,))
        g = r * 2.6 / 4; dg.ellipse([x / 4 - g, y / 4 - g, x / 4 + g, y / 4 + g], fill=p['col'] + (70,))
    frame.alpha_composite(glow.filter(ImageFilter.GaussianBlur(3)).resize((W, H), Image.BILINEAR))
    frame.alpha_composite(core)
    k = arrived / max(1, len(P))
    if k > 0:                                               # the input lights up as the swarm lands
        s = int(220 * (.6 + 1.2 * k)); g = with_alpha(GLOW.resize((s, s), Image.BILINEAR), min(1, 1.6 * k) * (1 - clamp((t - HOOK + .05) / .3)))
        frame.alpha_composite(g, (int(tx - s / 2), int(ty - s / 2)))

def draw_hook_text(frame, t):
    if t > D1 + .1: return
    lay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for k, (im, (x, y, w, h)) in enumerate(HOOKW):
        e = ease_out((t + .2 - k * .075) / .5)                 # word 1 is already rising on frame 0 (a blank first frame loses the feed)
        if e <= 0: continue
        lay.alpha_composite(with_alpha(im, e), (x, int(round(y + 56 * (1 - e)))))
    if t > D0:                                              # the dissolve front eats the line left → right
        f = hx0 - 30 + (hx1 - hx0 + 60) * clamp((t - D0) / (D1 - D0))
        row = Image.new('L', (W, 1), 0); rp = row.load()
        for xx in range(W): rp[xx, 0] = int(255 * clamp((xx - f) / 26.))
        lay.putalpha(ImageChops.multiply(lay.getchannel('A'), row.resize((W, H), Image.NEAREST)))
    frame.alpha_composite(lay)

# ── end card ──
SPARK = [dict(x=random.uniform(120, 960), y=random.uniform(560, 1200), v=random.uniform(20, 70), r=random.uniform(1.2, 2.8), ph=random.uniform(0, 6.3),
              col=LIME if random.random() < .55 else BRAND) for _ in range(90)]
def draw_end(frame, t):
    e = t - SCREEN_END
    if e < 0: return
    d = ImageDraw.Draw(frame, 'RGBA')
    for s in SPARK:
        a = clamp((e - .2) / .6) * (.35 + .35 * math.sin(s['ph'] + e * 5)); y = s['y'] - s['v'] * e
        if a > 0: d.ellipse([s['x'] - s['r'], y - s['r'], s['x'] + s['r'], y + s['r']], fill=s['col'] + (int(255 * a),))
    for lay, d0, rise, dur in ((E_LOGO, .2, 0, .5), (E_NAME, .28, 46, .5), (E_NICHE, .46, 34, .5), (E_CRED, .68, 30, .5)):
        k = ease_out((e - d0) / dur)
        if k <= 0: continue
        if lay is E_LOGO:
            s = .72 + .28 * back_out((e - d0) / dur); im = lay.crop((W // 2 - 140, 470, W // 2 + 140, 754)); sz = int(280 * s)
            frame.alpha_composite(with_alpha(im.resize((sz, int(284 * s)), Image.BICUBIC), k), (W // 2 - sz // 2, 612 - int(284 * s) // 2))
        else: frame.alpha_composite(with_alpha(lay, k), (0, int(rise * (1 - k))))

# ── render ──
lang_tag = LANG
MASTER = os.path.join(OUTD, '%s-%s-master%s.mp4' % (SPEC['slug'], lang_tag, '-draft' if DRAFT else ''))
DW, DH = (540, 960) if DRAFT else (W, H)
enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (DW, DH), '-r', str(FPS), '-i', '-',
                        '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
                        '-c:v', 'libx264', '-preset', 'veryfast' if DRAFT else 'slow', '-crf', '23' if DRAFT else '18', '-profile:v', 'high',
                        '-movflags', '+faststart', MASTER], stdin=subprocess.PIPE)
PST = SPEC.get('poster', {'beat': 0, 'at': -.4}); pb = BT[PST.get('beat', 0)]
POSTER_T = (pb[1] + PST['at']) if PST.get('at', -.4) < 0 else (pb[0] + PST['at'])
poster = None
first = screen_at(HOOK + 1e-4)                             # beat 1's first frame: what the phone shows while the swarm flies in
C = (SX + SW / 2, SY + SH / 2)
for n in range(NF):
    t = n / FPS
    drift = t / TOTAL
    frame = BG.crop((int(60 + 60 * drift), int(140 + 120 * drift), int(60 + 60 * drift) + W, int(140 + 120 * drift) + H)).convert('RGBA')
    if t < HOOK:                                            # ── hook
        if t >= SLIDE[0]:                                   # the phone rises behind the words, the words dissolve into it
            dim = .8 * (1 - clamp((t - 1.55) / .45))
            place(frame, phone_canvas(first, t, dim), dy=phone_dy(t))
        draw_hook_text(frame, t)
        draw_particles(frame, t)
    elif t < SCREEN_END:                                    # ── beats
        i = max(k for k in range(len(BT)) if BT[k][0] <= t + 1e-6); a, b = BT[i]; B = SPEC['beats'][i]
        cam = B.get('cam', {}); s_ = cam.get('s', 1.12)
        ax, ay = SX + cam.get('x', SW / K / 2) * K, SY + cam.get('y', SH / K / 2) * K
        k = ease_io((t - a) / max(.1, b - a)); z = 1 + (s_ - 1) * k
        if i > 0: z *= 1 + .035 * (1 - ease_out((t - a) / .22))   # a small punch on every cut
        drift_k = (z - 1) / max(.01, s_ - 1) * .16
        place(frame, phone_canvas(screen_at(t), t), z, ax, ay, (C[0] - ax) * drift_k, (C[1] - ay) * drift_k)
        if t < HOOK + .12: draw_particles(frame, t)
        frame.alpha_composite(SCRIM)
        draw_caption(frame, i, t)
    else:                                                   # ── end card
        e = t - SCREEN_END
        if e < .3:                                          # the phone drops away fast; the name never sits on top of it
            kk = ease_in(e / .3); z = 1 - .12 * kk
            place(frame, phone_canvas(screen_at(SCREEN_END - 1e-3), t), z, C[0], C[1], 0, 320 * kk, 1 - kk)
            frame.alpha_composite(with_alpha(SCRIM, 1 - kk))
        draw_end(frame, t)
    if t > TOTAL - .28:                                     # loop-friendly: the last beat of the film sinks back to the dark the hook starts from
        frame = Image.blend(frame, Image.new('RGBA', (W, H), (5, 6, 8, 255)), clamp((t - TOTAL + .28) / .28) * .85)
    img = frame.convert('RGB')
    if poster is None and t >= POSTER_T: poster = img.copy()
    if DRAFT: img = img.resize((DW, DH), Image.BILINEAR)
    enc.stdin.write(img.tobytes())
    if n % 90 == 0: print('frame %d/%d · %.1f s' % (n, NF, t), flush=True)
enc.stdin.close(); enc.wait()
for d in DEC.values(): d.p.kill()
json.dump({'total': round(TOTAL, 3), 'hook': HOOK, 'beats': [[SPEC['beats'][i].get('id'), round(a, 3), round(b, 3)] for i, (a, b) in enumerate(BT)],
           'segs': [[s[0], round(s[1], 3), round(s[2], 3), round(s[3], 3), s[4], round(o, 3)] for s, o in zip(segs, outs)], 'taps': [[round(a, 3), b, c] for a, b, c in TAPS]},
          open(os.path.join(OUTD, '%s-%s.edl.json' % (SPEC['slug'], lang_tag)), 'w'), indent=1)
print('master →', MASTER, '%.2f s · %.1f MB' % (TOTAL, os.path.getsize(MASTER) / 1048576))
if DRAFT: sys.exit(0)

# ── poster (beat 1, a strong frame) ──
PATH_P = os.path.join(OUTD, '%s-poster.webp' % SPEC['slug'])
if LANG == 'ru' or not os.path.exists(PATH_P):
    poster.resize((720, 1280), Image.LANCZOS).save(PATH_P, 'WEBP', quality=86, method=6)
    print('poster →', PATH_P)

# ── site copy: 720×1280, two passes, ≤ 3 MB, no audio ──
SITE = os.path.join(OUTD, '%s-%s-site.mp4' % (SPEC['slug'], lang_tag)); LIMIT = 3_000_000
kb = int(LIMIT * .94 * 8 / TOTAL / 1000)
for attempt in range(4):
    lg = os.path.join(WORK, 'x264-2pass')
    common = ['-vf', 'scale=720:1280:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-b:v', '%dk' % kb, '-maxrate', '%dk' % int(kb * 1.5), '-bufsize', '%dk' % int(kb * 2),
              '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-an', '-passlogfile', lg]
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', MASTER] + common + ['-pass', '1', '-f', 'mp4', '/dev/null'], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', MASTER] + common + ['-pass', '2', '-movflags', '+faststart', SITE], check=True)
    for f in (lg + '-0.log', lg + '-0.log.mbtree'):
        if os.path.exists(f): os.remove(f)
    sz = os.path.getsize(SITE)
    if sz <= LIMIT: break
    kb = int(kb * LIMIT / sz * .95)
print('site →', SITE, '%.2f MB (%d kbit/s)' % (os.path.getsize(SITE) / 1e6, kb))
