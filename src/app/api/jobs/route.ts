import { NextResponse } from "next/server";
import { checkInvite, consumeInvite } from "@/server/invites";
import { createJob } from "@/server/jobs";
import { sessionFile } from "@/server/remote";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { url?: string; invite?: string; sessionId?: string; seedFrom?: string };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//.test(body.url ?? "") ? body.url! : `https://${body.url}`);
  } catch {
    return NextResponse.json({ error: "Enter a valid product URL." }, { status: 400 });
  }
  const invite = await checkInvite(body.invite);
  if (!invite.ok) return NextResponse.json({ error: invite.reason }, { status: 403 });

  const job = await createJob({
    url: url.toString(),
    sessionFile: body.sessionId ? sessionFile(body.sessionId) : undefined,
    seedFrom: body.seedFrom,
  });
  await consumeInvite(body.invite!);
  return NextResponse.json({ id: job.id });
}
