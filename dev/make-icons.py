#!/usr/bin/env python3
"""Generate icons/icon.svg and the PNG icons from one shape list (no dependencies)."""
import struct, zlib, os

BG, ACC, LINE, NODE, SEG2, SEG3 = "#0b0d17", "#818cf8", "#2b3262", "#e7eaff", "#38bdf8", "#f472b6"

def shapes(s, ox, oy):
    f = lambda v, o: o + v * s
    out = []
    rect = lambda x0, y0, x1, y1, c: out.append(("rect", f(x0, ox), f(y0, oy), f(x1, ox), f(y1, oy), c))
    # two nodes joined by a link with a segmented bar
    rect(.14, .28, .34, .44, NODE); rect(.66, .28, .86, .44, NODE)
    rect(.34, .355, .66, .365, LINE)
    rect(.30, .58, .70, .68, LINE)
    rect(.30, .58, .48, .68, ACC); rect(.48, .58, .60, .68, SEG2); rect(.60, .58, .66, .68, SEG3)
    rect(.44, .74, .70, .78, LINE)
    rect(.694, .54, .706, .72, NODE)
    return out

def svg(maskable=False):
    s, o = (0.66, 0.17) if maskable else (1, 0)
    r = 0 if maskable else 0.18
    p = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">', f'<rect width="512" height="512" rx="{r*512:.0f}" fill="{BG}"/>']
    for _, x0, y0, x1, y1, c in shapes(s, o, o):
        p.append(f'<rect x="{x0*512:.1f}" y="{y0*512:.1f}" width="{(x1-x0)*512:.1f}" height="{(y1-y0)*512:.1f}" fill="{c}"/>')
    p.append("</svg>")
    return "\n".join(p) + "\n"

def hexrgb(h): return tuple(int(h[i:i+2], 16) for i in (1, 3, 5))

def png(size, maskable=False, ss=3):
    s, o = (0.66, 0.17) if maskable else (1, 0)
    sh = shapes(s, o, o); rr = 0 if maskable else 0.18
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    x = (px + (sx + .5) / ss) / size; y = (py + (sy + .5) / ss) / size
                    col = None
                    cx = min(max(x, rr), 1 - rr); cy = min(max(y, rr), 1 - rr)
                    if (x - cx) ** 2 + (y - cy) ** 2 <= rr * rr + 1e-12: col = hexrgb(BG) + (255,)
                    for _, x0, y0, x1, y1, c in sh:
                        if x0 <= x <= x1 and y0 <= y <= y1: col = hexrgb(c) + (255,)
                    if col:
                        for i in range(4): acc[i] += col[i]
            n = ss * ss; a = acc[3] // n
            row += bytes([acc[0] // n if a else 0, acc[1] // n if a else 0, acc[2] // n if a else 0, a])
        rows.append(b"\x00" + bytes(row))
    raw = b"".join(rows)
    def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")
os.makedirs(root, exist_ok=True)
open(os.path.join(root, "icon.svg"), "w").write(svg())
open(os.path.join(root, "icon-maskable.svg"), "w").write(svg(True))
for name, size, mk in [("icon-180.png", 180, False), ("icon-192.png", 192, False), ("icon-512.png", 512, False), ("icon-maskable-512.png", 512, True)]:
    open(os.path.join(root, name), "wb").write(png(size, mk))
print("icons written")
