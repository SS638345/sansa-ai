// Runs every tests/*.test.ts: bundles each one with esbuild (already installed with Vite) and runs it with Node.
// A test sets process.exitCode = 1 when something is wrong. Usage: npm test
import { build } from "esbuild";
import { readdirSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const dir = "tests";
const out = join("node_modules", ".cache", "sansa-tests");
mkdirSync(out, { recursive: true });
let failed = 0;
for (const f of readdirSync(dir).filter((f) => f.endsWith(".test.ts")).sort()) {
  const js = join(out, f.replace(/\.ts$/, ".mjs"));
  await build({ entryPoints: [join(dir, f)], bundle: true, platform: "node", format: "esm", outfile: js, logLevel: "error" });
  console.log(`\n▶ ${f}`);
  const r = spawnSync(process.execPath, [js], { stdio: "inherit" });
  if (r.status !== 0) {
    failed++;
    console.log(`✖ ${f} failed`);
  } else console.log(`✔ ${f}`);
}
rmSync(out, { recursive: true, force: true });
console.log(failed ? `\n${failed} test file(s) failed` : "\nAll tests passed");
process.exit(failed ? 1 : 0);
