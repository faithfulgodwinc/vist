import { log } from "./events";
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { runComputerTask } from "./agent";
import { Driver, extractBrand, launch, newContext } from "./browser";
import { askJson, extractJson, MODELS } from "./meta";
import type { Exploration } from "./types";

export type Credentials = { email?: string; password?: string };

const ExploreResult = z.object({
  homeUrl: z.string(),
  summary: z.string(),
  tagline: z.string().optional(),
  features: z
    .array(z.object({ name: z.string(), howTo: z.string(), why: z.string() }))
    .min(1),
});

const INSTRUCTIONS = `You are Vist's product scout. You operate a web product in a browser to learn it well enough to plan a polished product demo video.
Rules: never delete data, never make purchases, never change account or billing settings, never send messages or invites to real people. Creating sample content (a project, a note, a task) is fine.`;

export async function explore(url: string, creds: Credentials, statePath: string): Promise<Exploration> {
  const browser = await launch();
  try {
    const loggedIn = existsSync(statePath);
    const context = await newContext(browser, { storageState: loggedIn ? statePath : undefined });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const driver = new Driver(page);
    await driver.settle();

    // The main screen is where products show their headline numbers; the director uses it for stats.
    await page.screenshot({ path: path.join(path.dirname(statePath), "home.jpg"), type: "jpeg", quality: 80 });
    const brand = await extractBrand(page, url);
    log(`  brand: ${brand.name} ${brand.primary}`);

    const login = loggedIn
      ? "You are already signed in. Do not sign out."
      : creds.email
        ? `If the product needs a login, sign in with email "${creds.email}" and password "${creds.password ?? ""}".`
        : "Stay on pages that do not need a login.";

    const visited: { url: string; title: string }[] = [];
    page.on("load", async () => {
      const entry = { url: page.url(), title: await page.title().catch(() => "") };
      if (!visited.some((v) => v.url === entry.url)) visited.push(entry);
    });

    const { text } = await runComputerTask({
      driver,
      model: MODELS.explorer,
      label: "explore",
      maxSteps: 20,
      wrapUpNote: "Reply ONLY with the JSON described in the task, based on what you have seen so far.",
      instructions: INSTRUCTIONS,
      task: `Explore the product at ${url}. ${login}
Find its 3-6 most impressive, demo-worthy features: open the main navigation, visit key screens, try the core workflow once.
When you are done, stop using the computer and reply ONLY with JSON:
{"homeUrl": "<URL of the main screen after login, where a demo should start>",
 "summary": "<2 sentences: what the product does and for whom>",
 "tagline": "<a punchy 6-10 word tagline>",
 "features": [{"name": "...", "howTo": "<concrete clicks starting from homeUrl>", "why": "<the benefit to the user>"}]}`,
    });

    let result: z.infer<typeof ExploreResult>;
    try {
      result = ExploreResult.parse(extractJson(text));
    } catch {
      // The scout ran out of turns or answered loosely: rebuild its report from where it went.
      result = await askJson(ExploreResult, {
        instructions: "You turn a product scout's browsing session into a structured feature report.",
        prompt: `Product: ${url}
Scout's notes: ${text || "(none)"}
Pages the scout visited:
${visited.map((v) => `- ${v.title} (${v.url})`).join("\n") || "- " + url}
The attached image is the last screen the scout saw.

Return {"homeUrl","summary","tagline","features":[{"name","howTo","why"}]} with 3-6 features. Use ${url} as homeUrl unless a logged-in main screen is clearly better.`,
        images: [await driver.screenshot()],
      });
    }

    // Only keep a session that is actually signed in; a saved session means "logged in" to later runs.
    if (loggedIn || creds.email) await context.storageState({ path: statePath, indexedDB: true });
    if (result.tagline) brand.tagline = result.tagline;
    return { brand, homeUrl: result.homeUrl || page.url(), summary: result.summary, features: result.features };
  } finally {
    await browser.close();
  }
}
