# SeedSigner WIF + PSBT test-data generator

> **⚠️ TEST ONLY — everything here is fake.** No real money, no real keys,
> no live addresses. The tools below generate *synthetic* test data so you
> can exercise a specific SeedSigner workflow end-to-end — without a real
> private key, real funds, or any online dependency beyond pinned CDN
> libraries. The generated WIF, addresses, and transaction are **not yours**;
> do **not** send coins to them, do **not** keep the WIF, and do **not** use
> the PSBT in a real wallet. It is deliberately unspendable and meaningless
> on-chain (fake UTXO referencing a fake `deadbeef…` previous transaction).

## 30-second background

**SeedSigner** is an open-source, **air-gapped, stateless** hardware signing
device: you point its camera at a QR code, it reviews what you're about to
sign, and it produces a signature — all offline, no phone, no state kept
between operations (and no PIN).

The specific feature this project targets is **"WIF key signing"**, as
implemented by the **[3rdIteration/seedsigner](https://github.com/3rdIteration/seedsigner)**
fork (WIF-key support is that fork's distinguishing addition). On that
device the WIF-signing flow is **PSBT-first**:

1. scan the **PSBT** — a *Partially Signed Bitcoin Transaction* (BIP-174),
   the standard container for handing an unsigned transaction to a signer;
2. if the **use-WIF-key** option is enabled, the device offers to sign with
   a WIF key;
3. scan the **WIF** — *Wallet Import Format*, a text form of a Bitcoin
   private key;
4. review, then sign.

## What it does

Open `index.html` in any modern browser — **double-click it, no server, no
build step**. It will:

1. **Derive a deterministic demo key** from a fixed seed string using real
   secp256k1 (via `@noble/curves`), so the WIF and addresses are stable
   across reloads. A `Regenerate random key` button exists for one-offs.
2. **Show the WIF** (compressed) as text **and a QR code** (a plain byte-mode
   QR) — for SeedSigner *WIF key* scan.
3. **Build a minimal, structurally-valid BIP-174 PSBT** (1 input → 1 output,
   0.99 BTC out of 1.00 BTC in) that pays a **P2WPKH** output, and encode it
   as **base64** (the `cHNidP8…` form SeedSigner accepts).
4. **Frame that PSBT as SeedSigner "Specter Desktop" animated frames** —
   each QR holds the ASCII text `pNofM <base64-slice>` (1-indexed), exactly
   the format SeedSigner's scanner parses (`decode_qr.py`) — and animate
   **frame 1/N → 2/N → …** via the `FPS` + `N` controls. Scanning in any
   order reassembles to the identical base64.
   - Switch **QR mode** to **Full single QR** to render the *single* QR
     holding the whole base64 string (also a format SeedSigner accepts).
5. **Live-verify** the PSBT three ways, shown as badges:
   - **self-parser:** the page's own strict BIP-174 reader.
   - **bitcoinjs-lib 6.1.5** (loaded from a pinned CDN): the real BIP-174
     parser, confirming `Psbt.fromBase64(...)` succeeds and the fields match.
   - **structure:** `tx v0 · locktime 0 · 1 in / 1 out · <n> B`.
6. Run a **battery of known-answer self-tests** (EC, WIF, P2PKH/bech32,
   Specter-PSBT framing, PSBT build+parse) and print them on the page.

### Spend type
- **P2WPKH (default):** input script `0014 <hash160>`, output P2WPKH.
- **P2PKH (legacy):** input script `76a914 … 88ac`, and the PSBT includes
  `non_witness_utxo` (the full fake previous transaction) in addition to
  `witness_utxo`, as BIP-174 requires for legacy inputs.

---

## Requirements

- A modern browser (Chrome/Edge/Firefox/Safari). No install, no server.
- One-time **network access** to fetch pinned CDN libraries
  (qrcode-generator, `@noble/hashes`, `@noble/curves`, `bitcoinjs-lib`).
  After the first load they can be served from browser cache.

## Run the page

```
open index.html          # macOS
xdg-open index.html      # Linux
# or: double-click the file
```

## Run the cross-validation test harness (Node)

The harness extracts the embedded app module and cross-validates the
generated PSBT against **bitcoinjs-lib** and the standalone **bip174**
reference, plus WIF/bech32 and the SeedSigner-recognized PSBT-QR framing.

```
npm install        # installs pinned dev deps (bitcoinjs-lib, bip174, @noble/*, bs58check, bech32)
node test.mjs      # expected: "RESULT: 48 passed, 0 failed"
```

A headless-Chromium smoke test (optional — install a Chromium/Chrome binary,
then either let puppeteer find it or point `CHROMIUM_BIN` at it):

```
CHROMIUM_BIN=/usr/bin/chromium node test-browser.mjs   # expected: "BROWSER TEST: OK"
```

### Prove the PSBT-QR frames are accepted by SeedSigner's real decoder

`test-seedsigner.py` reproduces, line-for-line, the exact code path in
SeedSigner's `src/seedsigner/models/decode_qr.py` — the `detect_segment_type`
regex for `pNofM`/base64, the `SpecterPsbtQrDecoder` segment join, the
canonical-base64 check, and the final `embit.psbt.PSBT.parse()` (the same
PSBT library SeedSigner itself uses) — and runs our actual rendered frames
through it. This is the direct regression test for the *"QR code is invalid
or data format is not yet supported"* error.

```
node emit-frames.mjs /tmp/frames.json        # emit the exact QR payloads from index.html
pip install embit                            # SeedSigner's PSBT library (final parse step)
python3 test-seedsigner.py /tmp/frames.json  # expected: "ALL SEEDSIGNER-DECODER CHECKS PASSED"
```

---

## Files

| File                | Purpose                                                          |
|---------------------|------------------------------------------------------------------|
| `index.html`        | The whole app: one self-contained HTML file (CSS + one ES module, CDN libraries). |
| `test.mjs`          | Node cross-validation harness (48 checks, 0 expected failures).   |
| `test-browser.mjs`  | Headless-Chromium smoke test of the rendered page (optional).     |
| `emit-frames.mjs`   | Emits the exact PSBT-QR payloads the page renders, as JSON, for external verification. |
| `test-seedsigner.py`| Simulates SeedSigner's real QR-decode path (detector regex + reassembly + `embit` PSBT.parse). |
| `package.json` / `package-lock.json` | Pinned dev-deps used **only by the test harness** (not the page). |
| `LICENSE`           | MIT license text.                                                |
| `node_modules/`     | Installed by `npm install` (test-only; git-ignored). The page never reads it. |

---

## How the PSBT is built (byte-accurate)

A minimal unsigned `CTransaction` (version `0`, locktime `0`, one input,
one output) is hand-serialized:

```
00000000  | varint(1) |
  <32B prev_txid BE> <4B vout=0 LE> <varint(0) scriptSig> <4B seq=FFFFFFFF> |
varint(1) |
  <8B value 1 BTC LE> <varint(22) scriptLen> <00 14 <20B hash160>> |
00000000
```

That unsigned-tx byte string is stored in the PSBT **global map** under
key `PSBT_GLOBAL_UNSIGNED_TX (0x00)`. Then, per BIP-174:

- **Input map (key 0):**
  - `PSBT_IN_WITNESS_UTXO (0x01)` = `8B value LE ‖ varint(22) ‖ <inScript>`
  - (P2PKH only) `PSBT_IN_NON_WITNESS_UTXO (0x00)` = the full fake prev-tx.
- **Output maps:** empty (0x00 terminator) — output data already lives in
  the unsigned tx.

Key/value entries use bitcoin's **varint** for length. The whole thing is
base64-encoded to the `cHNidP8…` form.

### PSBT QR formatting (why the "pNofM" format?)

A common pitfall — and the one this project existed to catch: **QR framing
is format-specific**. A PSBT framed in a format SeedSigner doesn't know about
is rejected with the generic *"QR code is invalid or the data format is not
yet supported"* message. Its scanner
(`src/seedsigner/models/decode_qr.py` → `detect_segment_type`) accepts PSBTs
in exactly a few known shapes, so this page emits only the two it recognizes:

- **Specter Desktop animated base64 segments (default).** The PSBT's base64
  string is sliced into `N` contiguous pieces; the `i`-th QR encodes the
  ASCII text

  ```
  p{i}of{N} <base64-slice_i>
  ```

  SeedSigner's detector regex is `^p(\d+)of(\d+) ([A-Za-z0-9+/=]+$)` and
  `SpecterPsbtQrDecoder` joins the slices (in any scan order) to the exact
  base64 before `base64 → PSBT`. Our slices are verbatim sub-strings of the
  same valid base64 shown on the page, so the join is byte-identical.
- **Full single QR (base64).** One QR holding the whole `cHNidP8…` base64
  string — the `PSBT__BASE64` path. A handy fallback if the animated QR is
  flaky to photograph.

The `FPS` + `N` controls only change how the *frames* are presented as a
slideshow; the underlying PSBT byte-string is identical either way.
(`test-seedsigner.py` re-checks the very frames above against SeedSigner's
detector regex and PSBT parser.)

---

## Security / privacy

- **No telemetry, no analytics, no beacons.** The page makes **no** calls to
  any origin other than the pinned CDN `jsdelivr.net` / `esm.sh` library
  hosts that serve the (public, read-only) JS libraries.
- All key derivation, hashing, and PSBT construction happens **locally in
  your browser** (or Node) — nothing is transmitted.
- The libraries are **pinned by exact version** to avoid supply-chain drift.
- The private key is derived from a fixed human-readable seed and held only
  in local memory; it is never persisted to disk, never sent anywhere.

## Pinned dependencies (page)

| Library            | Version | Served from                     |
|--------------------|---------|---------------------------------|
| qrcode-generator   | 1.4.4   | cdnjs (cdnjs.cloudflare.com)     |
| @noble/hashes      | 1.8.0   | cdn.jsdelivr.net (esm/ ESM build) |
| @noble/curves      | 1.9.0   | cdn.jsdelivr.net (esm/ ESM build) |
| bitcoinjs-lib      | 6.1.5   | esm.sh (page-only verification)  |

**Test harness (Node, dev-deps via `npm install`):**
`bitcoinjs-lib@7.0.2`, `bip174@3.0.1`, `@noble/hashes`, `@noble/curves`,
`bs58check`, `bech32`, `puppeteer-core` (optional browser smoke test). The page
itself never reads `node_modules` — those packages exist **only** so `test.mjs`
can cross-check the same PSBT bytes.

## Acknowledgements

Inspired by [testqrs.com](https://testqrs.com/) — a handy test-QR generator
that showed the value of having safe, fake data for exercising air-gapped
signer workflows.

## License

**MIT licensed** (see [`LICENSE`](LICENSE)) — a very permissive license:
you may use, copy, modify, merge, publish, distribute, sublicense, and/or
sell copies for any purpose, provided the copyright notice and permission
notice are kept. No copyleft, no warranty of any kind.

This project is provided as-is for **testing only** — it is not financial
advice and is not a product.
