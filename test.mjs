// test.mjs — runs the app module (embedded verbatim in index.html) under Node
// and cross-validates the generated PSBT against bitcoinjs-lib + bip174.
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

const m = html.match(/<script type="module" id="app">([\s\S]*?)<\/script>/);
if (!m) { console.error("FATAL: app module not found"); process.exit(1); }

let code = m[1]
  .replace('from "https://cdn.jsdelivr.net/npm/@noble/hashes@1.8.0/esm/sha2.js"', "from \"@noble/hashes/sha2\"")
  .replace('from "https://cdn.jsdelivr.net/npm/@noble/hashes@1.8.0/esm/ripemd160.js"', "from \"@noble/hashes/ripemd160\"")
  .replace('from "https://cdn.jsdelivr.net/npm/@noble/hashes@1.8.0/esm/hmac.js"', "from \"@noble/hashes/hmac\"")
  .replace('from "https://cdn.jsdelivr.net/npm/@noble/curves@1.9.0/esm/secp256k1.js"', "from \"@noble/curves/secp256k1\"");
writeFileSync(new URL("./.tmp_app_extracted.mjs", import.meta.url), code);
const app = await import(new URL("./.tmp_app_extracted.mjs", import.meta.url).href);
const bitcoin = require("bitcoinjs-lib");
const bip174 = require("bip174");
const enc = new TextEncoder();

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "  → " + extra : "")); }
};
const TXID = "deadbeef" + "0".repeat(52) + "0001";
const PRIV = app.deriveKey("fixed-demo-key-2026");
const H = app.h160(app.pubkey(PRIV));
const DEST_H = app.h160(app.pubkey(app.deriveKey("fixed-demo-destination-2026")));
const IN_WPKH = app.scriptP2WPKH(H);
const IN_P2PKH = app.scriptP2PKH(H);
const DEST_WPKH = app.scriptP2WPKH(DEST_H);
const hexOf = (b) => app.hex(Buffer.isBuffer(b) ? new Uint8Array(b) : b);

console.log("== A. known-answer self tests (executed from the page itself) ==");
for (const r of app.selfTestsPure()) {
  console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? "  · " + r.detail : ""}`);
  r.ok ? pass++ : fail++;
}

console.log("== B. P2WPKH PSBT cross-check (mainnet) ==");
{
  const ps = app.buildPsbt({ spendType: "p2wpkh", inScript: IN_WPKH, destScript: DEST_WPKH });
  const b64 = app.b64encode(ps);
  ok("base64 starts with cHNidP8…", b64.startsWith("cHNidP8"), b64.slice(0, 20));

  const txGetter = (buf) => {
    const t = bitcoin.Transaction.fromBuffer(buf);
    Object.assign(t, { getInputOutputCounts: () => ({ inputCount: t.ins.length, outputCount: t.outs.length }) });
    return t;
  };
  const ref = bip174.Psbt.fromBase64(b64, txGetter);
  ok("bip174 ref: 1 input + 1 output", ref.inputs.length === 1 && ref.outputs.length === 1);
  ok("bip174 ref: input 0 keys = [witnessUtxo]",
     JSON.stringify(Object.keys(ref.inputs[0]).sort()) === '["witnessUtxo"]',
     JSON.stringify(Object.keys(ref.inputs[0])));
  ok("bip174 ref: witnessUtxo value = 1 BTC",
     String(ref.inputs[0].witnessUtxo.value) === "100000000",
     String(ref.inputs[0].witnessUtxo.value));
  ok("bip174 ref: witnessUtxo script = P2WPKH(h)",
     Buffer.from(ref.inputs[0].witnessUtxo.script).toString("hex") === app.hex(IN_WPKH),
     Buffer.from(ref.inputs[0].witnessUtxo.script).toString("hex"));
  ok("bip174 ref: unsignedTx out0 = (0.99 BTC, P2WPKH(destH))",
     String(ref.globalMap.unsignedTx.outs[0].value) === "99000000" &&
     Buffer.from(ref.globalMap.unsignedTx.outs[0].script).toString("hex") === app.hex(DEST_WPKH));

  const p = bitcoin.Psbt.fromBase64(b64); // user-specified API: bitcoinjs-lib
  ok("bitcoinjs: p.data has inputs/outputs/globalMap",
     p.data && Array.isArray(p.data.inputs) && Array.isArray(p.data.outputs) && p.data.globalMap);
  ok("bitcoinjs: 1 in / 1 out", p.data.inputs.length === 1 && p.data.outputs.length === 1);
  ok("bitcoinjs: witnessUtxo value 1e8 sats",
     p.data.inputs[0].witnessUtxo && String(p.data.inputs[0].witnessUtxo.value) === "100000000",
     p.data.inputs[0].witnessUtxo ? String(p.data.inputs[0].witnessUtxo.value) : "missing");
  ok("bitcoinjs: witnessUtxo script = P2WPKH(h)",
     p.data.inputs[0].witnessUtxo && hexOf(p.data.inputs[0].witnessUtxo.script) === app.hex(IN_WPKH),
     p.data.inputs[0].witnessUtxo ? hexOf(p.data.inputs[0].witnessUtxo.script) : "missing");
  const utx = p.data.globalMap.unsignedTx.tx;
  ok("bitcoinjs: unsigned tx present in globalMap", !!utx);
  ok("bitcoinjs: unsigned tx version 0 / locktime 0", utx.version === 0 && utx.locktime === 0,
     "v=" + utx.version + " lt=" + utx.locktime);
  ok("bitcoinjs: input hash == deadbeef…0001, vout 0",
     Buffer.from(hexOf(utx.ins[0].hash), "hex").reverse().toString("hex") === TXID && utx.ins[0].index === 0,
     hexOf(utx.ins[0].hash) + " idx=" + utx.ins[0].index);
  ok("bitcoinjs: output value 99,000,000", String(utx.outs[0].value) === "99000000", String(utx.outs[0].value));
  ok("bitcoinjs: output script = P2WPKH(destH)", hexOf(utx.outs[0].script) === app.hex(DEST_WPKH), hexOf(utx.outs[0].script));
  const b64b = p.toBase64();
  const p2 = bitcoin.Psbt.fromBase64(b64b);
  ok("bitcoinjs: toBase64 → fromBase64 round-trips",
     p2.data.inputs.length === 1 && String(p2.data.inputs[0].witnessUtxo.value) === "100000000");
  console.log("  b64 (" + b64.length + " chars): " + b64);
}

console.log("== C. P2PKH legacy PSBT cross-check (mainnet) ==");
{
  const ps = app.buildPsbt({ spendType: "p2pkh", inScript: IN_P2PKH, destScript: DEST_WPKH });
  const b64 = app.b64encode(ps);
  ok("base64 starts with cHNidP8…", b64.startsWith("cHNidP8"), b64.slice(0, 20));
  const p = bitcoin.Psbt.fromBase64(b64);
  const i0 = p.data.inputs[0];
  ok("bitcoinjs: input0 has witnessUtxo + nonWitnessUtxo",
     !!i0.witnessUtxo && !!i0.nonWitnessUtxo, JSON.stringify(Object.keys(i0)));
  ok("bitcoinjs: witnessUtxo = (1 BTC, P2PKH(h))",
     i0.witnessUtxo && String(i0.witnessUtxo.value) === "100000000" && hexOf(i0.witnessUtxo.script) === app.hex(IN_P2PKH),
     i0.witnessUtxo ? String(i0.witnessUtxo.value) + " " + hexOf(i0.witnessUtxo.script) : "missing");
  const nwuRaw = i0.nonWitnessUtxo;
  const nwu = nwuRaw && nwuRaw.outs ? nwuRaw : (() => { try { return bitcoin.Transaction.fromBuffer(nwuRaw); } catch (e) { return "ERR:" + e.message; } })();
  ok("bitcoinjs: nonWitnessUtxo is a valid prev tx paying 1 BTC to P2PKH(h)",
     nwu && String(nwu.outs[0].value) === "100000000" && hexOf(nwu.outs[0].script) === app.hex(IN_P2PKH),
     nwu ? String(nwu.outs[0].value) + " " + hexOf(nwu.outs[0].script) : ("raw " + (nwuRaw && nwuRaw.constructor && nwuRaw.constructor.name + " len=" + nwuRaw.length)));
  const utxw = p.data.globalMap.unsignedTx.tx;
  ok("bitcoinjs: input hash == deadbeef…0001 vout 0",
     Buffer.from(hexOf(utxw.ins[0].hash), "hex").reverse().toString("hex") === TXID && utxw.ins[0].index === 0,
     hexOf(utxw.ins[0].hash));
  ok("bitcoinjs: output 0.99 BTC to P2WPKH(destH)", String(utxw.outs[0].value) === "99000000");
}

console.log("== D. WIF / addresses (fixed seeds, both networks) ==");
{
  const pub = app.pubkey(PRIV);
  ok("pubkey = 33B compressed (02/03 prefix)", pub.length === 33 && (pub[0] === 2 || pub[0] === 3), "len=" + pub.length + " first=" + pub[0]);
  const wifMain = app.wifEncode(PRIV, 0x80);
  const wifTest = app.wifEncode(PRIV, 0xef);
  const bs58 = require("bs58check").default || require("bs58check");
  const dM = bs58.decode(wifMain);
  const dT = bs58.decode(wifTest);
  ok("WIF mainnet (0x80) valid base58check, version 0x80, compressed flag 0x01",
     dM.length === 34 && dM[0] === 0x80 && dM[33] === 0x01,
     wifMain + " (len " + dM.length + ")");
  ok("WIF testnet (0xEF) valid, version byte 0xEF, compressed flag 0x01",
     dT.length === 34 && dT[0] === 0xef && dT[33] === 0x01,
     wifTest + " (len " + dT.length + ")");
  const p2pkh_main = app.p2pkhAddress(H, 0x00);
  const p2pkh_test = app.p2pkhAddress(H, 0x6f);
  ok("P2PKH mainnet starts '1' (0x00 ver + hash160)", p2pkh_main.startsWith("1"), p2pkh_main);
  ok("P2PKH testnet starts 'm'/'n' (0x6F ver + hash160)", /^[mn]/.test(p2pkh_test), p2pkh_test);
  const bc = app.p2wpkhAddress(H, "bc");
  const tb = app.p2wpkhAddress(H, "tb");
  ok("bech32 mainnet bc1q…", bc.startsWith("bc1q"), bc);
  ok("bech32 testnet tb1q…", tb.startsWith("tb1q"), tb);
  const b32 = require("bech32").bech32 || require("bech32").default;
  const words = b32.decode(bc, 2000).words;
  const prog = Buffer.from(b32.fromWords(words.slice(1)));
  ok("bech32 lib agrees on program bytes", prog.equals(Buffer.from(H)));
  console.log(`  mainnet  WIF=${wifMain}  P2PKH=${p2pkh_main}  P2WPKH=${bc}`);
  console.log(`  testnet  WIF=${wifTest}  P2PKH=${p2pkh_test}  P2WPKH=${tb}`);
}

console.log("== E. PSBT QR formats (SeedSigner-recognized) ==");
{
  // Canonical base64 of the P2WPKH PSBT, exactly as the page emits it.
  const b64 = app.b64encode(app.buildPsbt({ spendType: "p2wpkh", inScript: IN_WPKH, destScript: DEST_WPKH }));
  ok("psbt b64 is canonical (no stray chars)", /^[A-Za-z0-9+/=]+$/.test(b64) && b64.length % 4 === 0 || b64.endsWith("==") ? true : false, b64.slice(-8));
  const SEEDSIGNER_RE = /^p(\d+)of(\d+) ([A-Za-z0-9+\/=]+)$/; // decode_qr.py: detect_segment_type
  const frames10 = app.specterFrames(b64, 10);
  ok("every pNofM frame matches SeedSigner's detector regex", frames10.every((f) => SEEDSIGNER_RE.test(f)),
     frames10.join(" | "));
  ok("reassembly (join in index order) reproduces the exact base64", app.specterJoin(frames10) === b64);
  ok("joined b64 decodes to the identical PSBT bytes",
     Buffer.from(app.specterJoin(frames10), "base64").equals(Buffer.from(b64, "base64")));
  // Order-independence, like a real animated scan arriving out of order.
  const shuffled = [...frames10]; for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  ok("out-of-order scan still reassembles to the same base64", app.specterJoin(shuffled) === b64);
  // Full-base64 static mode = a single frame whose SLICE is exactly the base64.
  const one = app.specterFrames(b64, 1);
  ok("N=1 → one frame whose payload is the full base64 string",
     one.length === 1 && /^p1of1 ([A-Za-z0-9+\/=]+)$/.test(one[0]) && one[0].split(" ")[1] === b64);
}

console.log("== F. misc core helpers ==");
{
  ok("deriveKey deterministic", app.hex(app.deriveKey("fixed-demo-key-2026")) === app.hex(PRIV));
  ok("b58encode: leading zero byte → '1'", app.b58encode(new Uint8Array([0x00])) === "1",
     app.b58encode(new Uint8Array([0x00])));
  ok("varint edge values (BE after marker)",
     JSON.stringify(app.varint(252)) === "[252]" &&
     JSON.stringify(app.varint(253)) === "[253,0,253]" &&
     JSON.stringify(app.varint(65535)) === "[253,255,255]" &&
     JSON.stringify(app.varint(65536)) === "[254,0,1,0,0]", [252, 253, 65535, 65536].map((n) => JSON.stringify(app.varint(n))).join(" | "));
  ok("u64le(99,000,000) exact bytes (0x05E69EC0 LE)", app.hex(app.u64le(99000000n)) === "c09ee60500000000",
     app.hex(app.u64le(99000000n)));
  ok("hex/bytesFromHex roundtrip", app.hex(app.bytesFromHex("deadbeef")) === "deadbeef");
}

rmSync(new URL("./.tmp_app_extracted.mjs", import.meta.url), { force: true });
console.log("\n===== RESULT: " + pass + " passed, " + fail + " failed =====");
process.exit(fail ? 1 : 0);
