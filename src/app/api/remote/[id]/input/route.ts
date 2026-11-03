import { NextResponse } from "next/server";
import { getRemote, input, type RemoteInput } from "@/server/remote";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = getRemote((await params).id);
  if (!r) return NextResponse.json({ error: "This sign-in window has expired." }, { status: 410 });
  await input(r, (await req.json()) as RemoteInput).catch(() => {});
  return NextResponse.json({ ok: true });
}
