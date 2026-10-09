import puppeteer from "puppeteer-core";
const errors = [];
const browser = await puppeteer.launch({
  executablePath: "/usr/bin/chromium",
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--window-size=1024,1600"],
});
const page = await browser.newPage();
page.on("console", (m) => {
  const t = m.type();
  if (t === "error" || t === "warning") errors.push(`[${t}] ${m.text()}`);
});
page.on("pageerror", (e) => errors.push("[pageerror] " + e.message));
await page.goto("file:///home/ben/Documents/WIFTest/index.html", { waitUntil: "networkidle2", timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
const report = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const rows = [...document.querySelectorAll("#selftest-list li")].map((li) => li.textContent.trim());
  return {
    banner: q(".test-banner") && q(".test-banner").textContent.includes("TEST ONLY"),
    wifText: (q("#wif") && q("#wif").textContent || "").slice(0, 12) + "…",
    b64: (q("#psbt-b64") && q("#psbt-b64").textContent || "").slice(0, 12) + "…",
    qrWifImgs: document.querySelectorAll("#qr-wif img").length,
    qrPsbtImgs: document.querySelectorAll("#qr-psbt img").length,
    selfBadges: {
      self: (q("#badge-self")||{}).textContent,
      bjs: (q("#badge-bjs")||{}).textContent,
      struct: (q("#badge-struct")||{}).textContent,
    },
    rows,
    addrP2pkh: (q("#addr-p2pkh") && q("#addr-p2pkh").textContent || "").slice(0, 16),
    addrP2wpkh: (q("#addr-p2wpkh") && q("#addr-p2wpkh").textContent || "").slice(0, 16),
  };
});
console.log("console errors/warnings:", errors.length ? errors : "none");
console.log(JSON.stringify(report, null, 2));
await page.screenshot({ path: "/tmp/wiftest-full.png", fullPage: true });
await browser.close();
const ok = report.banner
  && report.qrWifImgs >= 1
  && report.qrPsbtImgs >= 1
  && report.rows.every((r) => r.includes("PASS"))
  && (report.rows.length >= 7)
  && (report.addrP2wpkh || "").startsWith("bc1q")
  && (report.b64 || "").startsWith("cHNidP8");
console.log(ok ? "BROWSER TEST: OK" : "BROWSER TEST: FAIL");
process.exit(ok ? 0 : 1);
