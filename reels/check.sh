#!/bin/bash
# ROCH Reels · guard: duration 15–20 s, size, resolution, and a storyboard sheet (a frame every 2.5 s, labelled) to LOOK at.
# bash reels/check.sh <video.mp4> [every_s=2.5] [from_s=0] [to_s=end]   → <video>-storyboard.png next to the video
set -u
V="$1"; EVERY="${2:-2.5}"; FROM="${3:-0}"; TO="${4:-}"
[ -f "$V" ] || { echo "no file: $V"; exit 2; }
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$V")
RES=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,codec_name -of csv=p=0 "$V")
AUD=$(ffprobe -v error -select_streams a -show_entries stream=codec_name -of csv=p=0 "$V")
SZ=$(stat -f %z "$V")
FAST=$(python3 -c "import sys;d=open(sys.argv[1],'rb').read(4096);i=d.find(b'moov');j=d.find(b'mdat');print('yes' if i!=-1 and (j==-1 or i<j) else 'no')" "$V")
printf '%s\n  duration %.2f s · %s · %.2f MB · audio: %s · faststart: %s\n' "$V" "$DUR" "$RES" "$(echo "$SZ/1000000" | bc -l)" "${AUD:-none}" "$FAST"
FAIL=0
python3 -c "import sys;d=float(sys.argv[1]);sys.exit(0 if 15<=d<=20 else 1)" "$DUR" || { echo "  ✗ duration outside 15–20 s"; FAIL=1; }
case "$V" in *-site.mp4) [ "$SZ" -le 3000000 ] || { echo "  ✗ site copy over 3 MB"; FAIL=1; }; [ -z "$AUD" ] || { echo "  ✗ site copy has audio"; FAIL=1; };; esac
[ "$FAST" = yes ] || { echo "  ✗ moov atom not at the front (+faststart)"; FAIL=1; }
SHEET="${V%.mp4}-storyboard.png"; [ "$EVERY" != "2.5" ] && SHEET="${V%.mp4}-sheet-${EVERY}s.png"
TMP=$(mktemp -d)
python3 - "$V" "$DUR" "$EVERY" "$FROM" "${TO:-$DUR}" "$TMP" "$SHEET" <<'EOF'
import os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont
v, dur, every, a, b, tmp, out = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5]), sys.argv[6], sys.argv[7]
ts = []; t = a
while t < min(b, dur) - 0.02: ts.append(round(t, 3)); t += every
ts.append(round(min(b, dur) - 0.06, 3))
tw = 270 if len(ts) <= 10 else 216; ims = []
for i, t in enumerate(ts):
    f = os.path.join(tmp, '%03d.png' % i)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(t), '-i', v, '-frames:v', '1', '-vf', 'scale=%d:-2' % tw, f], check=True)
    ims.append((t, Image.open(f).convert('RGB')))
th = ims[0][1].height; cols = min(len(ims), 6 if tw == 270 else 8); rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * (tw + 8) + 8, rows * (th + 34) + 8), (24, 24, 28)); d = ImageDraw.Draw(sheet)
try: fnt = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 18)
except Exception: fnt = ImageFont.load_default()
for k, (t, im) in enumerate(ims):
    x, y = 8 + (k % cols) * (tw + 8), 8 + (k // cols) * (th + 34)
    sheet.paste(im, (x, y + 26)); d.text((x + 2, y + 3), '%.2f s' % t, fill=(212, 255, 79), font=fnt)
sheet.save(out); print('  storyboard →', out, '(%d frames)' % len(ims))
EOF
rm -rf "$TMP"
[ $FAIL = 0 ] && echo "  ✓ ok" || exit 1
