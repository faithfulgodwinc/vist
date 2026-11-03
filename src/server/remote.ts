import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Browser, BrowserContext, Page } from "playwright";
import { launch, VIEWPORT } from "../pipeline/browser";
import { ROOT } from "./jobs";

// A browser running on the server that the user drives from the page to sign in to their
// product. We never see the password; we only keep the resulting session cookies.
type Remote = { id: string; browser: Browser; context: BrowserContext; page: Page; timer: NodeJS.Timeout };

const store = globalThis as unknown as { vistRemotes?: Map<string, Remote> };
const remotes = (store.vistRemotes ??= new Map());
const IDLE_MS = 10 * 60 * 1000;
const SESSIONS_DIR = path.join(ROOT, "renders", "_sessions");

function touch(r: Remote) {
  clearTimeout(r.timer);
  r.timer = setTimeout(() => void close(r.id), IDLE_MS);
}

export async function openRemote(url: string) {
  const browser = await launch();
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  // Sign-in flows that open a popup (e.g. "Continue with Google") take over the view.
  context.on("page", (popup) => {
    const r = remotes.get(id);
    if (r) r.page = popup;
    popup.on("close", () => r && (r.page = page));
  });
  const id = randomBytes(8).toString("hex");
  const r: Remote = { id, browser, context, page, timer: setTimeout(() => {}, 0) };
  remotes.set(id, r);
  touch(r);
  await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
  return id;
}

export function getRemote(id: string) {
  const r = remotes.get(id);
  if (r) touch(r);
  return r;
}

export async function frame(r: Remote) {
  return r.page.screenshot({ type: "jpeg", quality: 70 });
}

export type RemoteInput =
  | { type: "click"; x: number; y: number }
  | { type: "type"; text: string }
  | { type: "key"; key: string }
  | { type: "scroll"; dy: number };

export async function input(r: Remote, e: RemoteInput) {
  const p = r.page;
  if (e.type === "click") await p.mouse.click(e.x * VIEWPORT.width, e.y * VIEWPORT.height);
  if (e.type === "type") await p.keyboard.type(e.text);
  if (e.type === "key") await p.keyboard.press(e.key);
  if (e.type === "scroll") await p.mouse.wheel(0, e.dy);
}

// Saves the signed-in session and shuts the browser down.
export async function finish(id: string) {
  const r = remotes.get(id);
  if (!r) throw new Error("This sign-in window has expired. Start again.");
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
  const file = path.join(SESSIONS_DIR, `${id}.json`);
  await r.context.storageState({ path: file, indexedDB: true });
  await close(id);
  return file;
}

export function sessionFile(id: string) {
  return path.join(SESSIONS_DIR, `${id.replace(/[^a-f0-9]/g, "")}.json`);
}

async function close(id: string) {
  const r = remotes.get(id);
  if (!r) return;
  remotes.delete(id);
  clearTimeout(r.timer);
  await r.browser.close().catch(() => {});
}
