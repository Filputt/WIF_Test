// Emits the exact PSBT-QR payloads the page renders, for external verification.
//
//   node emit-frames.mjs [outPath]      (default: ./frames.json)
//
// Produces, for both spend types (p2wpkh, p2pkh):
//   b64      : the whole canonical base64 PSBT string (the "Full single QR" mode)
//   anim10   : the 10 Specter `pNofM <base64-slice>` frames (the animated mode)
// These are byte-for-byte what the QR codes on the page encode.
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, "index.html"), "utf8");
const m = html.match(/<script type="module" id="app">([\s\S]*?)<\/script>/);
if (!m) throw new Error("could not locate <script id=\"app\"> in index.html");

const code = m[1]
  .replace(/from "https:\/\/cdn\.jsdelivr\.net\/npm\/@noble\/hashes@[\d.]+\/esm\/sha2\.js"/, 'from "@noble/hashes/sha2"')
  .replace(/from "https:\/\/cdn\.jsdelivr\.net\/npm\/@noble\/hashes@[\d.]+\/esm\/ripemd160\.js"/, 'from "@noble/hashes/ripemd160"')
  .replace(/from "https:\/\/cdn\.jsdelivr\.net\/npm\/@noble\/hashes@[\d.]+\/esm\/hmac\.js"/, 'from "@noble/hashes/hmac"')
  .replace(/from "https:\/\/cdn\.jsdelivr\.net\/npm\/@noble\/curves@[\d.]+\/esm\/secp256k1\.js"/, 'from "@noble/curves/secp256k1"');

const tmp = resolve(here, ".tmp_emit.mjs");
writeFileSync(tmp, code);
let app;
try {
  app = await import(tmp);
} finally {
  rmSync(tmp, { force: true });
}

const H = app.h160(app.pubkey(app.deriveKey("fixed-demo-key-2026")));
const DEST = app.h160(app.pubkey(app.deriveKey("fixed-demo-destination-2026")));
const out = {};
for (const sp of ["p2wpkh", "p2pkh"]) {
  const inS = sp === "p2wpkh" ? app.scriptP2WPKH(H) : app.scriptP2PKH(H);
  const ps = app.buildPsbt({ spendType: sp, inScript: inS, destScript: app.scriptP2WPKH(DEST) });
  const b64 = app.b64encode(ps);
  out[sp] = { b64, anim10: app.specterFrames(b64, 10) };
}
const target = resolve(process.argv[2] || "./frames.json");
writeFileSync(target, JSON.stringify(out, null, 2));
console.log("wrote " + target);
console.log("  p2wpkh: b64 " + out.p2wpkh.b64.length + " chars, " + out.p2wpkh.anim10.length + " frames");
console.log("  p2pkh : b64 " + out.p2pkh.b64.length + " chars, " + out.p2pkh.anim10.length + " frames");
