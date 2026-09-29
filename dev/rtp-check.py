#!/usr/bin/env python3
"""Local check of the AES67 packet arithmetic with an independent RTP sender (ffmpeg).

ffmpeg sends L16/L24 RTP over loopback with the payload size the planner computes for each
case; this script receives the datagrams and checks what is observable at UDP level:
  - the RTP header is the fixed 12 bytes (version 2, no padding, no extension, no CSRC)
  - the UDP payload is 12 + channels x samples x bytes
  - the RTP timestamp advances by the samples per packet
  - the steady-state packet rate matches fs / samples
The remaining headers (UDP 8, IPv4 20, Ethernet 14 + 4 + 8 + 12) are fixed by their standards and
are not visible on loopback; the planner adds them.   Usage: python3 dev/rtp-check.py
"""
import json, socket, struct, subprocess, sys, time

CASES = [  # channels, sample rate, bits, samples per packet, label
    (2, 48000, 24, 48, "2 ch, 48 kHz, L24, 1 ms"),
    (8, 48000, 24, 48, "8 ch, 48 kHz, L24, 1 ms"),
    (8, 48000, 24, 6, "8 ch, 48 kHz, L24, 125 us"),
    (8, 48000, 24, 12, "8 ch, 48 kHz, L24, 250 us"),
    (2, 44100, 16, 48, "2 ch, 44.1 kHz, L16, 48 samples"),
    (4, 96000, 24, 96, "4 ch, 96 kHz, L24, 1 ms"),
    (2, 48000, 24, 192, "2 ch, 48 kHz, L24, 4 ms"),
]
SECONDS = 4

def model(ch, fs, bits, samples):
    js = ("const M=require('./model.js');const s=M.aes67Stream(%d,%d,%d,%d,{vlan:false,wire:true});"
          "console.log(JSON.stringify(s))") % (ch, fs, bits // 8, samples)
    return json.loads(subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout)

def run(ch, fs, bits, samples, port):
    payload = ch * samples * bits // 8
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(("127.0.0.1", port)); sock.settimeout(3)
    codec = "pcm_s24be" if bits == 24 else "pcm_s16be"
    # asetnsamples makes every audio frame exactly one packet's worth of samples; without it ffmpeg cuts
    # its 1024-sample frames into full packets plus a short remainder packet
    cmd = ["ffmpeg", "-v", "error", "-re", "-f", "lavfi", "-i", "sine=frequency=997:sample_rate=%d" % fs, "-t", str(SECONDS),
           "-af", "asetnsamples=n=%d:p=0" % samples, "-ac", str(ch), "-c:a", codec, "-f", "rtp", "rtp://127.0.0.1:%d?pkt_size=%d" % (port, payload + 12)]
    p = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    pk = []
    try:
        while True:
            data, _ = sock.recvfrom(65535); pk.append((time.monotonic(), data))
    except socket.timeout:
        pass
    p.wait(); sock.close()
    return [x for x in pk if len(x[1]) >= 12 and (x[1][0] >> 6) == 2 and (x[1][1] & 0x7F) != 72]   # drop RTCP (PT 200-204 -> 72..76 after masking)

bad = 0
for i, (ch, fs, bits, samples, label) in enumerate(CASES):
    m = model(ch, fs, bits, samples)
    pk = run(ch, fs, bits, samples, 25000 + 2 * i)
    if len(pk) < 50:
        print("NO DATA  ", label, len(pk)); bad += 1; continue
    hdr = [struct.unpack("!BBHII", d[:12]) for _, d in pk]
    v_ok = all((h[0] >> 6) == 2 and not (h[0] >> 5) & 1 and not (h[0] >> 4) & 1 and (h[0] & 15) == 0 for h in hdr)
    sizes = sorted({len(d) for _, d in pk})
    body = [len(d) - 12 for _, d in pk]
    full = [b for b in body if b == m["payload"]]
    steps = sorted({(hdr[k + 1][3] - hdr[k][3]) & 0xFFFFFFFF for k in range(len(hdr) - 1)})
    # ffmpeg's -re starts with a burst of about 0.5 s of audio, so measure the packet rate after the first second
    steady = [x for x in pk if x[0] - pk[0][0] > 1.0]
    dur = steady[-1][0] - steady[0][0]
    pps = (len(steady) - 1) / dur
    exp_pps = m["pps"]
    ok = v_ok and len(full) >= 0.98 * len(body) and steps == [samples] and abs(pps - exp_pps) / exp_pps < 0.03
    bad += 0 if ok else 1
    print(("PASS " if ok else "FAIL ") + label.ljust(34) +
          " header12/noCSRC/noExt=%s  payload=%d (model %d)  ts step=%s  pps=%.1f (model %.1f)  wire packet %d B, %.2f Mbps" %
          (v_ok, body[0], m["payload"], steps, pps, exp_pps, m["packet"], m["mbps"]))
print("all cases agree with the planner's arithmetic" if not bad else "%d case(s) differ" % bad)
sys.exit(1 if bad else 0)
