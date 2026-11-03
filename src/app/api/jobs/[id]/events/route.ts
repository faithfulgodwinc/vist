import { getJob } from "@/server/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-sent events: replays everything so far, then streams new events as they happen.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const job = getJob((await params).id);
  if (!job) return new Response("Not found", { status: 404 });

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      // A viewer can close the tab at any moment; writing after that throws and would crash the server.
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
          cleanup();
        }
      };
      const send = (data: unknown) => write(`data: ${JSON.stringify(data)}\n\n`);
      send({ type: "status", status: job.status });
      for (const e of job.events) send(e);
      if (job.frameCount) send({ type: "frame", count: job.frameCount });

      const listener = (e: unknown) => send(e);
      job.listeners.add(listener);
      const heartbeat = setInterval(() => write(": ping\n\n"), 15000);
      cleanup = () => {
        closed = true;
        clearInterval(heartbeat);
        job.listeners.delete(listener);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    // Compression buffers the stream, so events would arrive in bursts or not at all.
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Content-Encoding": "none",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
