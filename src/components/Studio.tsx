"use client";

import { useEffect, useMemo, useState } from "react";
import type { Direction } from "@/pipeline/run";
import type { Exploration, Format, Storyboard } from "@/pipeline/types";
import { Editor } from "./Editor";

type StageName = "explore" | "storyboard" | "shoot" | "direct" | "edit" | "render";
type StageState = { status: "waiting" | "start" | "done" | "cached"; seconds?: number };
type Take = { sceneId: string; title: string; attempt: number; ok: boolean; reason: string };
type JobStatus = "queued" | "running" | "done" | "error";

const STAGES: { name: StageName; label: string; model: string }[] = [
  { name: "explore", label: "Exploring your product", model: "Muse Spark · computer use" },
  { name: "storyboard", label: "Planning the story", model: "Muse Spark" },
  { name: "shoot", label: "Filming features", model: "Muse Spark · vision review" },
  { name: "direct", label: "Directing the ad", model: "Muse Spark · Muse Image" },
  { name: "edit", label: "Composing & cutting", model: "Spark-composed score" },
  { name: "render", label: "Rendering", model: "Remotion" },
];

const FORMATS: { id: Format; label: string }[] = [
  { id: "16:9", label: "Landscape 16:9" },
  { id: "9:16", label: "Vertical 9:16" },
  { id: "1:1", label: "Square 1:1" },
];

export function Studio({ id }: { id: string }) {
  const [status, setStatus] = useState<JobStatus>("queued");
  const [stages, setStages] = useState<Record<string, StageState>>({});
  const [logs, setLogs] = useState<string[]>([]);
  const [frameCount, setFrameCount] = useState(0);
  const [exploration, setExploration] = useState<Exploration | null>(null);
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [takes, setTakes] = useState<Take[]>([]);
  const [direction, setDirection] = useState<Direction | null>(null);
  const [renderPct, setRenderPct] = useState(0);
  const [error, setError] = useState("");
  const [formats, setFormats] = useState<Format[]>([]);
  const [format, setFormat] = useState<Format>("16:9");
  const [version, setVersion] = useState(0);
  const [exporting, setExporting] = useState<Format | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/jobs/${id}/events`);
    es.onmessage = (msg) => {
      const e = JSON.parse(msg.data);
      if (e.type === "status") {
        setStatus(e.status);
        if (e.status === "running") {
          setError("");
          setRenderPct(0);
        }
      }
      if (e.type === "stage") setStages((s) => ({ ...s, [e.stage]: { status: e.status, seconds: e.seconds } }));
      if (e.type === "log") setLogs((l) => [...l.slice(-60), e.text]);
      if (e.type === "frame") setFrameCount(e.count);
      if (e.type === "error") setError(e.message);
      if (e.type === "done") setVersion((v) => v + 1);
      if (e.type === "card") {
        if (e.card === "exploration") setExploration(e.data);
        if (e.card === "storyboard") setStoryboard(e.data);
        if (e.card === "take") setTakes((t) => [...t.filter((x) => !(x.sceneId === e.data.sceneId && x.attempt === e.data.attempt)), e.data]);
        if (e.card === "direction") setDirection(e.data);
        if (e.card === "render") setRenderPct(e.data.pct);
      }
    };
    return () => es.close();
  }, [id]);

  // Which formats are rendered changes as exports finish; ask the server after each completed run.
  useEffect(() => {
    fetch(`/api/jobs/${id}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.status) setStatus(j.status);
        setFormats(j.formats ?? []);
        if (j.formats?.length && !j.formats.includes(format)) setFormat(j.formats[0]);
        setExporting(null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, version]);

  const working = status === "queued" || status === "running";
  const lastLog = useMemo(() => [...logs].reverse().find((l) => l && !l.startsWith("render ")) ?? "Getting ready…", [logs]);
  const showReveal = formats.length > 0;

  async function exportFormat(f: Format) {
    setFormat(f);
    if (formats.includes(f)) return;
    setExporting(f);
    await fetch(`/api/jobs/${id}/export`, { method: "POST", body: JSON.stringify({ format: f }) });
  }

  return (
    <main className="mx-auto max-w-7xl px-6 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm text-muted">Your ad for</div>
          <h1 className="text-2xl font-semibold tracking-tight">{exploration?.brand.name ?? id.replace(/-[a-f0-9]{6}$/, "")}</h1>
        </div>
        <StatusPill status={status} />
      </div>

      {showReveal && (
        <section className="rise mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1 rounded-xl border border-line bg-surface p-1 text-sm">
              {FORMATS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => exportFormat(f.id)}
                  disabled={working && !formats.includes(f.id)}
                  className={`rounded-lg px-3 py-1.5 transition ${format === f.id ? "bg-ink text-background" : "text-muted hover:text-ink"} disabled:opacity-40`}
                >
                  {f.label}
                  {!formats.includes(f.id) && <span className="ml-1 opacity-60">+</span>}
                </button>
              ))}
            </div>
            {formats.includes(format) && (
              <a href={`/api/jobs/${id}/video?format=${encodeURIComponent(format)}&download=1`} className="rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-background">
                Download MP4
              </a>
            )}
          </div>
          <div className="mt-4 grid place-items-center rounded-2xl border border-line bg-surface p-4">
            {formats.includes(format) ? (
              <video
                key={`${format}-${version}`}
                src={`/api/jobs/${id}/video?format=${encodeURIComponent(format)}&v=${version}`}
                controls
                autoPlay
                playsInline
                className={`max-h-[70vh] rounded-xl ${format === "16:9" ? "w-full" : ""}`}
              />
            ) : (
              <div className="py-24 text-center text-muted">
                {exporting === format || working ? `Re-flowing your ad for ${format}… ${renderPct ? `${renderPct}%` : ""}` : "Pick a format to render it."}
              </div>
            )}
          </div>
        </section>
      )}

      {(working || !showReveal) && (
        <section className="mt-8 grid gap-6 lg:grid-cols-[230px_1fr_300px]">
          <ol className="space-y-1">
            {STAGES.map((s) => {
              const st = stages[s.name]?.status ?? "waiting";
              return (
                <li key={s.name} className={`rounded-xl px-3 py-2.5 ${st === "start" ? "bg-surface shadow-sm" : ""}`}>
                  <div className="flex items-center gap-2.5 text-sm">
                    <StageIcon state={st} />
                    <span className={st === "waiting" ? "text-muted" : "font-medium"}>{s.label}</span>
                  </div>
                  <div className="ml-[26px] mt-0.5 text-xs text-muted">
                    {s.model}
                    {stages[s.name]?.seconds ? ` · ${Math.round(stages[s.name]!.seconds!)}s` : ""}
                    {s.name === "render" && st === "start" && renderPct ? ` · ${renderPct}%` : ""}
                  </div>
                </li>
              );
            })}
          </ol>

          <div>
            <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_30px_80px_-40px_rgba(0,0,0,0.3)]">
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${working ? "live-dot bg-live" : "bg-line"}`} />
                  {working ? "Agent is live" : "Agent finished"}
                </span>
                <span>What the agent sees</span>
              </div>
              <div className="aspect-[16/10] bg-background">
                {frameCount ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/jobs/${id}/frame?n=${frameCount}`} alt="The agent's browser" className="h-full w-full object-contain" />
                ) : (
                  <div className="grid h-full place-items-center text-sm text-muted">{status === "queued" ? "Waiting for the studio…" : "Opening your product…"}</div>
                )}
              </div>
            </div>
            <div className="mt-3 truncate rounded-xl bg-surface px-4 py-3 font-mono text-xs text-muted">{error ? <span className="text-live">{error}</span> : lastLog}</div>
          </div>

          <aside className="space-y-3">
            {exploration && (
              <Card title="What the agent found">
                <ul className="space-y-1.5">
                  {exploration.features.map((f) => (
                    <li key={f.name}>
                      <span className="font-medium">{f.name}</span>
                      <span className="text-muted"> · {f.why}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {storyboard && (
              <Card title="Shot list">
                <ul className="space-y-1.5">
                  {storyboard.scenes.map((s) => {
                    const take = [...takes].reverse().find((t) => t.sceneId === s.id);
                    return (
                      <li key={s.id} className="flex items-start gap-2">
                        <span className="mt-0.5 w-4 text-center">{take ? (take.ok ? "✓" : "↻") : "·"}</span>
                        <span className={take && !take.ok ? "text-muted" : ""}>{s.title}</span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
            {direction && <DirectionCard direction={direction} />}
          </aside>
        </section>
      )}

      {showReveal && !working && <Editor id={id} />}
    </main>
  );
}

function StatusPill({ status }: { status: JobStatus }) {
  const text = { queued: "In the queue", running: "Making your ad", done: "Ready", error: "Something went wrong" }[status];
  return (
    <span className={`flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm ${status === "error" ? "text-live" : ""}`}>
      {status === "running" && <span className="live-dot h-2 w-2 rounded-full bg-live" />}
      {text}
    </span>
  );
}

function StageIcon({ state }: { state: StageState["status"] }) {
  if (state === "done" || state === "cached") return <span className="grid h-4 w-4 place-items-center rounded-full bg-ink text-[9px] text-background">✓</span>;
  if (state === "start") return <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-live" />;
  return <span className="h-4 w-4 rounded-full border border-line" />;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rise rounded-2xl border border-line bg-surface p-4 text-sm">
      <div className="mb-2.5 text-xs font-medium uppercase tracking-wider text-muted">{title}</div>
      {children}
    </div>
  );
}

function DirectionCard({ direction }: { direction: Direction }) {
  const { script, score } = direction;
  const p = script.style.palette;
  return (
    <Card title="Creative direction">
      <div className="font-medium capitalize">{script.mood}</div>
      <div className="mt-3 flex gap-1.5">
        {[p.primary, p.secondary, p.background, p.ink].map((c, i) => (
          <span key={i} title={c} className="h-7 flex-1 rounded-md border border-line" style={{ background: c }} />
        ))}
      </div>
      <div className="mt-3 space-y-1 text-muted">
        <div>
          <span className="text-ink">{script.style.displayFont}</span> / {script.style.bodyFont}
        </div>
        <div>
          {script.style.theme} theme · {script.style.motion} motion · {script.style.frame} frame
        </div>
        <div>
          ♪ {script.bpm} BPM · {score.key} {score.scale} · {score.sound.kit} drums, {score.sound.lead}, {score.sound.pad} pad
        </div>
      </div>
    </Card>
  );
}
