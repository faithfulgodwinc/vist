"use client";

import { useEffect, useState } from "react";
import type { Direction } from "@/pipeline/run";
import { FONT_NAMES, type AdShot, type Score, type StyleKit } from "@/pipeline/types";

const KIND_LABEL: Record<AdShot["kind"], string> = { text: "Headline", clip: "Product moment", stat: "Stat", features: "Checklist", logo: "Logo card" };

// Lets people rewrite any shot, reorder or drop shots, and change the look and sound,
// then re-cuts the ad from the saved footage (no new agent work or API calls).
export function Editor({ id }: { id: string }) {
  const [direction, setDirection] = useState<Direction | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch(`/api/jobs/${id}/direction`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setDirection);
  }, [id]);

  if (!direction) return null;
  const { script, score } = direction;

  const update = (next: Direction) => {
    setDirection(next);
    setDirty(true);
  };
  const setShots = (shots: AdShot[]) => update({ ...direction, script: { ...script, shots } });
  const setShot = (i: number, patch: Partial<AdShot>) => setShots(script.shots.map((s, j) => (j === i ? ({ ...s, ...patch } as AdShot) : s)));
  const move = (i: number, by: number) => {
    const shots = [...script.shots];
    const j = i + by;
    if (j < 0 || j >= shots.length - 1 || i === shots.length - 1) return; // the logo card stays last
    [shots[i], shots[j]] = [shots[j], shots[i]];
    setShots(shots);
  };
  const setStyle = (patch: Partial<StyleKit>) => update({ ...direction, script: { ...script, style: { ...script.style, ...patch } } });
  const setPalette = (key: keyof StyleKit["palette"], value: string) => setStyle({ palette: { ...script.style.palette, [key]: value } });
  const setSound = (patch: Partial<Score["sound"]>) => update({ ...direction, score: { ...score, sound: { ...score.sound, ...patch } } });

  async function recut() {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/jobs/${id}/direction`, { method: "PUT", body: JSON.stringify(direction) });
    if (!res.ok) setError((await res.json()).error);
    else setDirty(false);
    setSaving(false);
  }

  return (
    <section className="mt-12">
      <link
        rel="stylesheet"
        href={`https://fonts.googleapis.com/css2?${FONT_NAMES.map((f) => `family=${f.replace(/ /g, "+")}`).join("&")}&display=swap`}
      />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Make it yours</h2>
          <p className="mt-1 text-sm text-muted">Edit any shot or change the look and sound. Re-cutting reuses the footage, so it takes only a few minutes.</p>
        </div>
        <button onClick={recut} disabled={!dirty || saving} className="rounded-xl bg-ink px-6 py-3 font-medium text-background disabled:opacity-40">
          {saving ? "Sending…" : "Re-cut ad"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-live">{error}</p>}

      <div className="mt-6 flex snap-x gap-3 overflow-x-auto pb-3">
        {script.shots.map((shot, i) => (
          <div key={i} className="w-72 shrink-0 snap-start rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="font-medium uppercase tracking-wider">
                {i + 1} · {KIND_LABEL[shot.kind]}
              </span>
              <span>{shot.beats} beats</span>
            </div>
            <div className="mt-3 space-y-2 text-sm">
              {shot.kind === "text" && (
                <textarea value={shot.lines.join("\n")} rows={3} onChange={(e) => setShot(i, { lines: e.target.value.split("\n").slice(0, 3) })} className={field} />
              )}
              {shot.kind === "clip" && (
                <>
                  <input value={shot.caption} onChange={(e) => setShot(i, { caption: e.target.value })} className={field} />
                  <textarea value={shot.sub} rows={2} onChange={(e) => setShot(i, { sub: e.target.value })} className={field} />
                </>
              )}
              {shot.kind === "stat" && (
                <>
                  <input value={shot.value} onChange={(e) => setShot(i, { value: e.target.value })} className={field} />
                  <input value={shot.label} onChange={(e) => setShot(i, { label: e.target.value })} className={field} />
                </>
              )}
              {shot.kind === "features" && (
                <textarea value={shot.items.join("\n")} rows={4} onChange={(e) => setShot(i, { items: e.target.value.split("\n").slice(0, 5) })} className={field} />
              )}
              {shot.kind === "logo" && <input value={shot.tagline} onChange={(e) => setShot(i, { tagline: e.target.value })} className={field} />}
            </div>
            {shot.kind !== "logo" && (
              <div className="mt-3 flex gap-1 text-xs">
                <button onClick={() => move(i, -1)} className={chip}>←</button>
                <button onClick={() => move(i, 1)} className={chip}>→</button>
                <button onClick={() => setShots(script.shots.filter((_, j) => j !== i))} className={`${chip} ml-auto text-live`}>
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel title="Colours">
          {(["primary", "secondary", "background", "ink", "muted"] as const).map((k) => (
            <label key={k} className="flex items-center justify-between gap-3 capitalize">
              {k === "ink" ? "Headlines" : k}
              <span className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted">{script.style.palette[k]}</span>
                <input type="color" value={script.style.palette[k]} onChange={(e) => setPalette(k, e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-line" />
              </span>
            </label>
          ))}
          <Select label="Theme" value={script.style.theme} options={["light", "dark", "brand"]} onChange={(v) => setStyle({ theme: v as StyleKit["theme"] })} />
        </Panel>

        <Panel title="Type & motion">
          <Select label="Headline font" value={script.style.displayFont} options={[...FONT_NAMES]} font onChange={(v) => setStyle({ displayFont: v as StyleKit["displayFont"] })} />
          <Select label="Body font" value={script.style.bodyFont} options={[...FONT_NAMES]} font onChange={(v) => setStyle({ bodyFont: v as StyleKit["bodyFont"] })} />
          <Select label="Motion" value={script.style.motion} options={["snappy", "smooth", "bouncy"]} onChange={(v) => setStyle({ motion: v as StyleKit["motion"] })} />
          <Select label="Layout" value={script.style.align} options={["center", "left"]} onChange={(v) => setStyle({ align: v as StyleKit["align"] })} />
          <Select label="Product frame" value={script.style.frame} options={["browser", "floating", "bleed"]} onChange={(v) => setStyle({ frame: v as StyleKit["frame"] })} />
          <Select label="Backdrop" value={script.style.backdrop} options={["glow", "mesh", "grid", "solid", "image"]} onChange={(v) => setStyle({ backdrop: v as StyleKit["backdrop"] })} />
          <label className="flex items-center justify-between">
            Uppercase headlines
            <input type="checkbox" checked={script.style.caps} onChange={(e) => setStyle({ caps: e.target.checked })} className="accent-ink" />
          </label>
        </Panel>

        <Panel title="Sound">
          <Select label="Drums" value={score.sound.kit} options={["punchy", "808", "soft", "lofi"]} onChange={(v) => setSound({ kit: v as Score["sound"]["kit"] })} />
          <Select label="Lead" value={score.sound.lead} options={["pluck", "piano", "bell", "saw"]} onChange={(v) => setSound({ lead: v as Score["sound"]["lead"] })} />
          <Select label="Pad" value={score.sound.pad} options={["warm", "airy", "dark"]} onChange={(v) => setSound({ pad: v as Score["sound"]["pad"] })} />
          <label className="flex items-center justify-between gap-3">
            Tempo
            <span className="flex items-center gap-2">
              <input type="range" min={70} max={140} value={script.bpm} onChange={(e) => update({ ...direction, script: { ...script, bpm: Number(e.target.value) } })} />
              <span className="w-14 text-right text-muted">{script.bpm} bpm</span>
            </span>
          </label>
          <label className="flex items-center justify-between gap-3">
            Swing
            <input type="range" min={0} max={30} value={Math.round(score.sound.swing * 100)} onChange={(e) => setSound({ swing: Number(e.target.value) / 100 })} />
          </label>
        </Panel>
      </div>
    </section>
  );
}

const field = "w-full resize-none rounded-lg border border-line bg-background px-3 py-2 outline-none focus:border-ink/30";
const chip = "rounded-md border border-line px-2 py-1 hover:bg-background";

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-5 text-sm">
      <div className="text-xs font-medium uppercase tracking-wider text-muted">{title}</div>
      {children}
    </div>
  );
}

function Select({ label, value, options, onChange, font }: { label: string; value: string; options: string[]; onChange: (v: string) => void; font?: boolean }) {
  return (
    <label className="flex items-center justify-between gap-3">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={font ? { fontFamily: `'${value}'` } : undefined}
        className="rounded-lg border border-line bg-background px-2 py-1.5 capitalize outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o} style={font ? { fontFamily: `'${o}'` } : undefined}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
