import { emit, log } from "./events";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { runComputerTask } from "./agent";
import { Driver, launch, newContext } from "./browser";
import { askJson, MODELS } from "./meta";
import type { Exploration, StoryScene, Take } from "./types";

const INSTRUCTIONS = `You are Vist's camera operator. You perform one shot of a product demo video in a browser that is being recorded.
Act like a calm presenter: one deliberate action at a time, no wandering, no exploring beyond the shot.
Never delete data, make purchases, or change account settings.
When the shot's final state is clearly visible on screen, stop using the computer and reply "DONE". If the shot is impossible, reply "FAILED: <reason>".`;

const Verdict = z.object({ ok: z.boolean(), reason: z.string() });

// Checks the take actually ends on what the script promised, so the agent can re-shoot.
async function verifyTake(scene: StoryScene, endShot: Buffer) {
  return askJson(Verdict, {
    instructions: "You review takes for a product demo video. Be strict: a modal, error, login wall, or empty state that the goal did not ask for is a failed take.",
    prompt: `Shot goal: ${scene.goal}\nNarration over this shot: ${scene.narration}\n\nThe attached image is the final frame of the take. Does it clearly show the goal's end result? Return {"ok": boolean, "reason": "<short>"}.`,
    images: [endShot],
  });
}

export async function shootScene(
  scene: StoryScene,
  exp: Exploration,
  statePath: string,
  outDir: string,
  maxAttempts = 2,
): Promise<Take> {
  let last: Take | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const browser = await launch();
    const recordDir = path.join(outDir, `${scene.id}-raw`);
    try {
      const context = await newContext(browser, { storageState: statePath, recordDir });
      const page = await context.newPage();
      const driver = new Driver(page);
      driver.resetClock();
      await page.goto(exp.homeUrl, { waitUntil: "domcontentloaded" });
      await driver.settle();
      await page.waitForTimeout(800);

      const result = await runComputerTask({
        driver,
        model: MODELS.shooter,
        label: `${scene.id}#${attempt}`,
        maxSteps: 15,
        wrapUpNote: `Reply "DONE" if the goal's end state is on screen, otherwise "FAILED: <reason>".`,
        instructions: INSTRUCTIONS,
        task: `Shot "${scene.title}": ${scene.goal}`,
      });

      await page.waitForTimeout(1200);
      const endShot = path.join(outDir, `${scene.id}-end.png`);
      await page.screenshot({ type: "png", path: endShot });
      const reviewShot = await driver.screenshot();

      const video = page.video();
      const durationMs = driver.now();
      await context.close();
      const videoPath = path.join(outDir, `${scene.id}.webm`);
      await video!.saveAs(videoPath);

      // Even if the agent ran out of turns the screen may already show the goal, so let the reviewer judge.
      const failedByAgent = /^\s*FAILED/i.test(result.text);
      const verdict = failedByAgent ? { ok: false, reason: result.text } : await verifyTake(scene, reviewShot);
      log(`  [${scene.id}#${attempt}] ${verdict.ok ? "✓ take approved" : "✗ retake"}: ${verdict.reason}`);

      last = {
        sceneId: scene.id,
        video: videoPath,
        durationMs,
        events: driver.events,
        endShot,
        verified: verdict.ok,
        note: verdict.reason,
      };
      emit({ type: "card", card: "take", data: { sceneId: scene.id, title: scene.title, attempt, ok: verdict.ok, reason: verdict.reason } });
      if (verdict.ok) return last;
    } finally {
      await browser.close();
      await fs.rm(recordDir, { recursive: true, force: true });
    }
  }
  return last!;
}
