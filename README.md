# TEST / DEMO — SeedSigner WIF + PSBT test-data generator

**⚠️ TEST ONLY. Nothing here is real money, a real key, or a live address.**
This page generates *fake* data (an ephemeral private key + a synthetic
unsigned transaction) so you can exercise the **SeedSigner "WIF key
signing"** workflow — **scan WIF → scan PSBT → review → sign** — without
any private key, funds, or online dependency beyond pinned CDN libraries.

> The generated WIF / addresses **are not yours**. Do **not** send coins
> to the destination address, do **not** keep the WIF, and do **not**
> use the PSBT in any real wallet or on any live (or regtest/simnet)
> blockchain. It is designed to be **unspendable and meaningless** on-chain
> (fake UTXO, fake `deadbeef…` prev-txid).

---

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
4. **Frame that PSBT into SeedSigner "Segwit-QR" frames** (the 21-byte
   header + payload scheme) and animate **frame 1/N → 2/N → …** via the
   `FPS` + `N` controls, exactly like SeedSigner's multi-QR scan.
   - Switch **QR mode** to **Full base64** to render the *single* QR holding
     the whole base64 string instead of framed QRs.
5. **Live-verify** the PSBT three ways, shown as badges:
   - **self-parser:** the page's own strict BIP-174 reader.
   - **bitcoinjs-lib 6.1.5** (loaded from a pinned CDN): the real BIP-174
     parser, confirming `Psbt.fromBase64(...)` succeeds and the fields match.
   - **structure:** `tx v0 · locktime 0 · 1 in / 1 out · <n> B`.
6. Run a **battery of known-answer self-tests** (EC, WIF, P2PKH/bech32,
   Segwit-QR framing, PSBT build+parse) and print them on the page.

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
reference, plus WIF/bech32/Segwit-QR/framing checks.

```
npm install        # installs pinned dev deps (bitcoinjs-lib, bip174, @noble/*, bs58check, bech32)
node test.mjs      # expected: "RESULT: 47 passed, 0 failed"
```

A headless-Chromium smoke test (optional, needs a `chromium` binary on PATH):

```
node test-browser.mjs   # expected: "BROWSER TEST: OK"
```

---

## Files

| File                | Purpose                                                        |
|---------------------|----------------------------------------------------------------|
| `index.html`        | The single self-contained page (HTML + CSS + one ES module).   |
| `test.mjs`          | Node cross-validation harness (47 checks, 0 expected failures).|
| `test-browser.mjs`  | Headless-Chromium smoke test of the rendered page (optional).  |
| `package.json`      | Pinned dev-deps used **only by the test harness** (not the page). |
| `node_modules/`     | Installed by `npm install` (test-only). The page itself does not use it. |

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

### Segwit-QR framing (SeedSigner multi-QR)

Each PSBT byte-stream is split into 32-byte payloads, each wrapped in the
21-byte **Segwit-QR header**:

```
[ 00 00 00 00 | 01 | idx | total | len(2,BE) ] ‖ payload
```

`idx`/`total` let the scanner reassemble frames in order. The `FPS` and `N`
controls only change how these frames are *presented* as a slideshow; the
underlying PSBT byte-string is identical.

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
`bs58check`, `bech32`. The page itself never reads `node_modules` — those
packages exist **only** so `test.mjs` can cross-check the same PSBT bytes.

## License

Provided as-is for **testing only**. Not financial advice, not a product.
