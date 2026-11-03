import { NextResponse } from "next/server";
import { checkInvite } from "@/server/invites";
import { openRemote } from "@/server/remote";

export const runtime = "nodejs";

// Opens a server-side browser on the product so the user can sign in from the page.
export async function POST(req: Request) {
  const { url, invite } = (await req.json().catch(() => ({}))) as { url?: string; invite?: string };
  const check = await checkInvite(invite);
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 403 });
  try {
    const target = new URL(/^https?:\/\//.test(url ?? "") ? url! : `https://${url}`);
    return NextResponse.json({ id: await openRemote(target.toString()) });
  } catch {
    return NextResponse.json({ error: "Enter a valid product URL." }, { status: 400 });
  }
}
