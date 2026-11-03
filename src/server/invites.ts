import fs from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./jobs";

// Invite codes come from VIST_INVITES as "code:quota,code:quota". Usage is persisted so
// restarts don't reset quotas, and every run is still under the global spend cap.
const USAGE_FILE = path.join(ROOT, "renders", "invite-usage.json");

function codes() {
  const map = new Map<string, number>();
  for (const pair of (process.env.VIST_INVITES ?? "").split(",")) {
    const [code, quota] = pair.trim().split(":");
    if (code) map.set(code.toLowerCase(), Number(quota ?? 3));
  }
  return map;
}

async function usage(): Promise<Record<string, number>> {
  try {
    return JSON.parse(await fs.readFile(USAGE_FILE, "utf8"));
  } catch {
    return {};
  }
}

export async function checkInvite(code: string | undefined) {
  const quota = codes().get((code ?? "").trim().toLowerCase());
  if (quota === undefined) return { ok: false as const, reason: "That invite code isn't valid." };
  const used = (await usage())[code!.trim().toLowerCase()] ?? 0;
  if (used >= quota) return { ok: false as const, reason: "This invite code has used all its ads." };
  return { ok: true as const, left: quota - used };
}

export async function consumeInvite(code: string) {
  const all = await usage();
  const key = code.trim().toLowerCase();
  all[key] = (all[key] ?? 0) + 1;
  await fs.mkdir(path.dirname(USAGE_FILE), { recursive: true });
  await fs.writeFile(USAGE_FILE, JSON.stringify(all, null, 2));
}
