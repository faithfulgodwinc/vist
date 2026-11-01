import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { ActionEvent, Brand } from "./types";

// Screenshots must stay one size for the whole run; coordinates are pixels in them.
export const VIEWPORT = { width: 1280, height: 800 };

const KEY_ALIASES: Record<string, string> = {
  CTRL: "Control", CONTROL: "Control", CMD: "Meta", META: "Meta", SUPER: "Meta",
  ALT: "Alt", OPTION: "Alt", SHIFT: "Shift", ENTER: "Enter", RETURN: "Enter",
  ESC: "Escape", ESCAPE: "Escape", TAB: "Tab", SPACE: " ", BACKSPACE: "Backspace",
  DELETE: "Delete", UP: "ArrowUp", DOWN: "ArrowDown", LEFT: "ArrowLeft", RIGHT: "ArrowRight",
  ARROWUP: "ArrowUp", ARROWDOWN: "ArrowDown", ARROWLEFT: "ArrowLeft", ARROWRIGHT: "ArrowRight",
  PAGEUP: "PageUp", PAGEDOWN: "PageDown", HOME: "Home", END: "End",
};

function normalizeKey(key: string) {
  return KEY_ALIASES[key.toUpperCase()] ?? (key.length === 1 ? key : key[0].toUpperCase() + key.slice(1));
}

export async function launch(): Promise<Browser> {
  return chromium.launch({ headless: process.env.VIST_HEADFUL !== "1" });
}

export async function newContext(
  browser: Browser,
  opts: { storageState?: string; recordDir?: string } = {},
): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    storageState: opts.storageState,
    recordVideo: opts.recordDir ? { dir: opts.recordDir, size: VIEWPORT } : undefined,
  });
  // tsx/esbuild wraps named functions in a __name() helper that doesn't exist in the page,
  // which breaks functions we pass to page.evaluate.
  await context.addInitScript("window.__name = (fn) => fn;");
  return context;
}

// Executes computer-use actions on a page and logs them with timestamps for the editor.
export class Driver {
  events: ActionEvent[] = [];
  private t0 = Date.now();
  private pointer = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 };

  constructor(public page: Page) {}

  resetClock() {
    this.t0 = Date.now();
    this.events = [];
  }

  now() {
    return Date.now() - this.t0;
  }

  async screenshot(): Promise<Buffer> {
    return this.page.screenshot({ type: "jpeg", quality: 80 });
  }

  private async log(type: string, run: () => Promise<unknown>, at?: { x: number; y: number }) {
    const t = this.now();
    await run();
    if (at) this.pointer = at;
    this.events.push({ t, tEnd: this.now(), type, ...this.pointer });
  }

  private async moveTo(x: number, y: number) {
    await this.page.mouse.move(x, y, { steps: 12 });
  }

  async execute(actions: any[]) {
    const mouse = this.page.mouse;
    for (const a of actions) {
      switch (a.type) {
        case "click":
          await this.log("click", async () => {
            await this.moveTo(a.x, a.y);
            await mouse.click(a.x, a.y, { button: a.button ?? "left" });
          }, { x: a.x, y: a.y });
          break;
        case "double_click":
          await this.log("click", async () => {
            await this.moveTo(a.x, a.y);
            await mouse.dblclick(a.x, a.y);
          }, { x: a.x, y: a.y });
          break;
        case "move":
          await this.log("move", () => this.moveTo(a.x, a.y), { x: a.x, y: a.y });
          break;
        case "drag": {
          const path: { x: number; y: number }[] = a.path ?? [];
          if (path.length < 2) break;
          const last = path[path.length - 1];
          await this.log("drag", async () => {
            await this.moveTo(path[0].x, path[0].y);
            await mouse.down();
            for (const p of path.slice(1)) await mouse.move(p.x, p.y, { steps: 8 });
            await mouse.up();
          }, last);
          break;
        }
        case "scroll": {
          const x = a.x ?? this.pointer.x;
          const y = a.y ?? this.pointer.y;
          const dx = a.scroll_x ?? a.delta_x ?? 0;
          const dy = a.scroll_y ?? a.delta_y ?? 0;
          await this.log("scroll", async () => {
            await this.moveTo(x, y);
            await mouse.wheel(dx, dy);
          }, { x, y });
          break;
        }
        case "type":
          await this.log("type", () => this.page.keyboard.type(a.text ?? "", { delay: 45 }));
          break;
        case "keypress": {
          const keys: string[] = (a.keys ?? [a.key]).filter(Boolean).map(normalizeKey);
          await this.log("keypress", () => this.page.keyboard.press(keys.join("+")));
          break;
        }
        case "wait":
          await this.page.waitForTimeout(Math.min(a.ms ?? 1000, 5000));
          break;
        case "screenshot":
          break;
        default:
          console.warn(`  ! unknown action ${a.type}`);
      }
      await this.settle();
    }
  }

  async settle() {
    await this.page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
    await this.page.waitForTimeout(350);
  }
}

// Pull name, colors and logo straight from the product so the video looks on-brand.
export async function extractBrand(page: Page, url: string): Promise<Brand> {
  const raw = await page.evaluate(() => {
    const meta = (sel: string) => document.querySelector<HTMLMetaElement>(sel)?.content ?? "";
    const icon =
      document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')?.href ??
      document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href ??
      "";
    const counts = new Map<string, number>();
    for (const el of Array.from(document.querySelectorAll("button, a, [role=button]")).slice(0, 200)) {
      const bg = getComputedStyle(el).backgroundColor;
      if (!bg || bg === "rgba(0, 0, 0, 0)" || bg === "transparent") continue;
      counts.set(bg, (counts.get(bg) ?? 0) + 1);
    }
    const isNeutral = (c: string) => {
      const [r, g, b] = (c.match(/\d+/g) ?? []).map(Number);
      return Math.max(r, g, b) - Math.min(r, g, b) < 24;
    };
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
    return {
      title: document.title,
      siteName: meta('meta[property="og:site_name"]') || meta('meta[name="application-name"]'),
      description: meta('meta[name="description"]') || meta('meta[property="og:description"]'),
      themeColor: meta('meta[name="theme-color"]'),
      button: ranked.find((c) => !isNeutral(c)) ?? "",
      background: getComputedStyle(document.body).backgroundColor,
      icon,
    };
  });
  const name = raw.siteName || raw.title.split(/[|\-–—:]/)[0].trim() || new URL(url).hostname;
  return {
    url,
    name,
    tagline: raw.description,
    primary: raw.themeColor || raw.button || "#6d5dfc",
    background: raw.background || "#0b0b12",
    logo: raw.icon || undefined,
  };
}
