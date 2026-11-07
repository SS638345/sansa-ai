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
  // Hugging Face answers 405 to headless Chromium from CI runners (even for onnx-community
  // models), and Playwright can't pass >512 MB bodies through route.fetch. So the workflow
  // downloads the model repos to MIRROR first and we serve those files to the page.
  const mirror = process.env.MIRROR;
  await page.route(/https:\/\/huggingface\.co\/.+\/resolve\/main\//, async (route) => {
    const m = route.request().url().match(/huggingface\.co\/(.+?)\/resolve\/main\/([^?]+)/);
    const file = m && require("node:path").join(mirror, m[1], decodeURIComponent(m[2]));
    if (file && require("node:fs").existsSync(file)) {
      await route.fulfill({ path: file, headers: { "access-control-allow-origin": "*" } });
    } else {
      console.log("not mirrored (404):", route.request().url());
      await route.fulfill({ status: 404, body: "", headers: { "access-control-allow-origin": "*" } });
    }
  });
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
  console.log("error box:", err);
  const text = (await page.locator("textarea").inputValue()).trim();
  console.log(`seconds: ${(Date.now() - t0) / 1000}`);
  console.log("GOT:     ", text);
  console.log("EXPECTED:", expected);
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await browser.close();
  if (err || !text) {
    console.log("error:", err);
    process.exit(1);
  }
})();
