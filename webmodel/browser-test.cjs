// Real end-to-end check in Chromium: open the built app, upload a known Tamil clip with the
// default (Tamil) model, and wait for the text. Run against `vite preview` on port 4173.
const { chromium } = require("playwright");

(async () => {
  const [clip, expected, pick] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  page.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
  page.on("response", (r) => r.status() >= 300 && console.log("http", r.status(), r.request().method(), r.url()));
  page.on("requestfailed", (r) => console.log("failed", r.method(), r.url(), r.failure()?.errorText));
  await page.goto("http://localhost:4173/");
  await page.getByRole("tab", { name: /Upload audio/ }).click();
  const select = page.locator('label.field:has-text("Speech model") select');
  if (pick) await select.selectOption(pick);
  const model = await select.inputValue();
  console.log("model:", model);
  const t0 = Date.now();
  await page.locator("input[type=file]").setInputFiles(clip);
  await page.waitForFunction(
    () => (document.querySelector("textarea")?.value.length ?? 0) > 0 || document.querySelector(".error"),
    null,
    { timeout: 20 * 60 * 1000, polling: 2000 },
  );
  const err = await page.locator(".error").textContent().catch(() => null);
  const text = (await page.locator("textarea").inputValue()).trim();
  console.log(`seconds: ${(Date.now() - t0) / 1000}`);
  console.log("GOT:     ", text);
  console.log("EXPECTED:", expected);
  await browser.close();
  if (err || !text) {
    console.log("error:", err);
    process.exit(1);
  }
})();
