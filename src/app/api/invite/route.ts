import { NextResponse } from "next/server";
import { checkInvite } from "@/server/invites";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  const result = await checkInvite(code);
  return NextResponse.json(result, { status: result.ok ? 200 : 403 });
}
