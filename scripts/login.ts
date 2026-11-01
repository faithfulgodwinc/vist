// Opens a real browser window so you can sign in to your product once (email code, Google,
// anything). The session is saved and every Vist run for that product starts logged in.
//
//   npm run vist:login -- --url https://app.example.com
import fs from "node:fs/promises";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { VIEWPORT } from "../src/pipeline/browser";
import { jobPaths } from "../src/pipeline/job";

const { values } = parseArgs({ options: { url: { type: "string" }, job: { type: "string" } } });
if (!values.url) throw new Error("--url is required");

async function main() {
  const url = values.url!.startsWith("http") ? values.url! : `https://${values.url}`;
  const { workDir, statePath } = jobPaths(url, values.job);
  await fs.mkdir(workDir, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  await page.goto(url);

  console.log(`\nA browser window is open at ${url}.`);
  console.log("1. Sign in the way you normally do (email code works best).");
  console.log("2. Wait until you can see your logged-in screen.");
  console.log("3. Close the browser window. Your session is saved as you go.\n");

  // Keep the richest snapshot seen; a later empty one (e.g. mid-redirect) must not replace it.
  let best = { score: -1, url: "" };
  const save = async () => {
    try {
      // indexedDB covers apps (e.g. Firebase) that keep their auth token there.
      const state = await context.storageState({ indexedDB: true });
      const keys = state.origins.reduce((n, o) => n + (o.localStorage?.length ?? 0) + ((o as any).indexedDB?.length ?? 0), 0);
      const score = state.cookies.length + keys;
      if (score < best.score) return;
      await fs.writeFile(statePath, JSON.stringify(state, null, 2));
      const current = context.pages()[0]?.url() ?? "";
      if (score !== best.score || current !== best.url) {
        console.log(`  saved: ${state.cookies.length} cookies, ${keys} storage entries · ${current}`);
      }
      best = { score, url: current };
    } catch {
      // The browser is closing; the last good snapshot is already on disk.
    }
  };

  const timer = setInterval(save, 2000);
  await new Promise<void>((resolve) => {
    browser.on("disconnected", () => resolve());
    context.on("close", () => resolve());
    page.on("close", () => resolve());
  });
  clearInterval(timer);
  await save();
  await browser.close().catch(() => {});

  if (best.score <= 0) {
    console.log("\n✗ Nothing was captured. Run the command again and sign in before closing the window.");
    process.exit(1);
  }
  console.log(`\n✓ Session saved to ${statePath}`);
  console.log("Tell Claude it's done, or run: npm run vist -- --url " + url + " --fresh=explore");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
