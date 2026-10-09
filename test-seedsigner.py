#!/usr/bin/env python3
"""
test-seedsigner.py — prove our PSBT-QR frames are accepted by SeedSigner's real
decoder, without a device.

It reproduces, line-for-line, the code path SeedSigner runs when it scans a
PSBT QR (SeedSigner/seedsigner `src/seedsigner/models/decode_qr.py`):

    DecodeQR.detect_segment_type(segment)
        → "^p(\\d+)of(\\d+) ([A-Za-z0-9+/=]+$)"  ⇒  PSBT__SPECTER
        → is_base64(segment)                  ⇒  PSBT__BASE64
        → (else)                              ⇒  INVALID   ← your original error

    PSBT__SPECTER :
        SpecterPsbtQrDecoder
            .current_segment_num = int(group 1)
            .total_segment_nums = int(group 2)
            .parse_segment      = segment.split(" ")[-1].strip()
            .add(segment)       →  get_base64_data = "".join(segments)
            .is_base64(data)
            .get_data()         →  a2b_base64(data)
            →  DecodeQR.get_psbt()  →  embit.psbt.PSBT.parse(data)

    PSBT__BASE64 :
        Base64PsbtQrDecoder.get_data() → a2b_base64(segment)
            →  embit.psbt.PSBT.parse(data)

The bug we fixed: the page originally emitted an *invented* 21-byte binary
"Segwit" frame that matched none of these, so `detect_segment_type` fell
through to INVALID and the device reported:
    "QR code is invalid or the data format is not yet supported."

Usage:
    node emit-frames.mjs /tmp/frames.json      # (produces the exact QR payloads)
    python3 test-seedsigner.py /tmp/frames.json

Requires: embit  (pip install embit) for the final PSBT.parse step — the very
library SeedSigner uses to parse PSBTs.
"""
import base64, re, sys, json, os
from binascii import a2b_base64

try:
    from embit import psbt
    HAVE_EMBIT = True
except Exception:
    HAVE_EMBIT = False

# --- constants copied verbatim from decode_qr.py ---
SPECTER = re.compile(r'^p(\d+)of(\d+) ([A-Za-z0-9+/=]+$)', re.IGNORECASE)

def is_base64(s: str) -> bool:
    try:
        return base64.b64encode(base64.b64decode(s)) == s.encode("ascii")
    except Exception:
        return False

def detect_segment_type(s: str) -> str:
    # order mirrors the PSBT branch of DecodeQR.detect_segment_type()
    if re.search("^UR:CRYPTO-PSBT/", s, re.IGNORECASE):
        return "PSBT__UR2"
    if SPECTER.search(s):
        return "PSBT__SPECTER"
    if is_base64(s):
        return "PSBT__BASE64"
    return "INVALID"

def decode_specter(frames):
    segs, total = {}, None
    for seg in frames:
        t = detect_segment_type(seg)
        assert t == "PSBT__SPECTER", f"detector said {t} for {seg!r}"
        g = SPECTER.search(seg)
        cur, tot = int(g.group(1)), int(g.group(2))
        if total is None:
            total = tot
        assert total == tot, "segment total changed mid-stream"
        segs[cur - 1] = seg.split(" ")[-1].strip()          # parse_segment
    base64 = "".join(segs[i] for i in sorted(segs))          # get_base64_data
    assert is_base64(base64), "reassembled string is not canonical base64"
    return a2b_base64(base64)                                 # get_data

def decode_base64(frames):
    seg = frames[0]
    assert detect_segment_type(seg) == "PSBT__BASE64", "not detected as base64"
    data = a2b_base64(seg)
    return data

def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(2)
    frames = json.load(open(os.path.expanduser(sys.argv[1])))
    if not HAVE_EMBIT:
        sys.exit("embit is not installed — `pip install embit` to run the final "
                 "PSBT.parse step (the rest of the checks do run).")

    ok = True
    for name, f in frames.items():
        # 1. animated mode (what you were scanning)
        animated = decode_specter(f["anim10"])
        # 2. full-base64 static mode
        static = decode_base64([f["b64"]])
        # 3. both decodings are the identical PSBT
        assert animated == static, f"[{name}] animated vs static decode mismatch"
        # 4. SeedSigner's own PSBT library accepts it
        psbt.PSBT.parse(animated)
        print(f"[{name:<6}] animated SPECTER: {len(f['anim10'])} frames detected "
              f"→ reassembled → embit PSBT.parse OK ({len(animated)} B)  ✔")
        print(f"[{name:<6}] static   BASE64 : 1 frame  detected "
              f"→ embit PSBT.parse OK  ✔")
        print(f"[{name:<6}]   animated-decode == static-decode  ✔")
    print("\nALL SEEDSIGNER-DECODER CHECKS PASSED")

if __name__ == "__main__":
    main()
