import React, { createContext, useContext, useState } from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { experimental_Video as Video } from "@remotion/media";
import type { AdTimeline, ClipSource, StyleKit, TimedShot } from "../pipeline/types";
import { font } from "./fonts";
import { cursorAt, lastClick, sourceMs, zoomAt, zoomTransform } from "./motion";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.2, 0.8, 0.2, 1);

// Motion personality: how springs feel, how long exits take, how words ripple in.
const MOTION = {
  snappy: { spring: { damping: 26, stiffness: 320 }, exit: 4, stagger: 2, travel: 36 },
  smooth: { spring: { damping: 30, stiffness: 80, mass: 1.3 }, exit: 10, stagger: 5, travel: 60 },
  bouncy: { spring: { damping: 9, stiffness: 170 }, exit: 6, stagger: 3, travel: 70 },
} as const;

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Everything a shot needs to look on-brand, resolved once per ad.
function resolveTheme(t: AdTimeline) {
  const s = t.style;
  const p = s.palette;
  // On a brand-coloured background the brand colour disappears, so highlight with whichever reads best.
  // Highlights are huge display text, which stays legible at a lower contrast than body copy.
  const highlight = [p.primary, p.secondary, p.ink].find((c) => contrast(c, p.background) >= 2.4) ?? p.ink;
  const onHighlight = luminance(highlight) > 0.45 ? "#0d0d12" : "#ffffff";
  return {
    style: s,
    p,
    highlight,
    onHighlight,
    dark: luminance(p.background) < 0.25,
    display: font(s.displayFont),
    body: font(s.bodyFont),
    motion: MOTION[s.motion],
    headline: (text: string) => (s.caps ? text.toUpperCase() : text),
  };
}
type Theme = ReturnType<typeof resolveTheme>;
const ThemeContext = createContext<Theme | null>(null);
const useTheme = () => useContext(ThemeContext)!;

type ShotProps<K extends TimedShot["kind"]> = { shot: Extract<TimedShot, { kind: K }>; t: AdTimeline };

// How hard the current beat is hitting: 1 on the beat, decaying to 0, for pulses.
function useBeat(bpm: number) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const beatFrames = (fps * 60) / bpm;
  return { beatFrames, pulse: Math.exp(-(frame % beatFrames) / (beatFrames * 0.22)) };
}

function useShotMotion(durationInFrames: number) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { motion } = useTheme();
  const enter = spring({ frame, fps, config: motion.spring });
  const exit = interpolate(frame, [durationInFrames - motion.exit, durationInFrames], [0, 1], clamp);
  return { frame, fps, enter, exit, opacity: Math.min(Math.min(1, enter), 1 - exit) };
}

function Backdrop({ t }: { t: AdTimeline }) {
  const frame = useCurrentFrame();
  const { p, style, dark } = useTheme();
  const { pulse } = useBeat(t.bpm);
  const drift = frame / 90;
  const glowAlpha = dark ? "55" : "38";
  const kind: StyleKit["backdrop"] = style.backdrop === "image" && !t.background ? "mesh" : style.backdrop;

  return (
    <AbsoluteFill style={{ background: p.background, overflow: "hidden" }}>
      {kind === "image" && t.background && (
        <>
          <Img
            src={staticFile(t.background)}
            style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${1.08 + frame * 0.00025}) translateX(${-frame * 0.04}px)` }}
          />
          <AbsoluteFill style={{ background: p.background, opacity: dark ? 0.55 : 0.5 }} />
        </>
      )}
      {(kind === "glow" || kind === "grid") && (
        <AbsoluteFill
          style={{
            background: `radial-gradient(900px 600px at ${30 + 12 * Math.sin(drift)}% ${20 + 10 * Math.cos(drift * 0.8)}%, ${p.primary}${glowAlpha}, transparent 65%),
                         radial-gradient(800px 600px at ${75 + 10 * Math.cos(drift * 0.7)}% ${85 + 8 * Math.sin(drift)}%, ${p.secondary}${glowAlpha}, transparent 65%)`,
            opacity: 0.85 + 0.15 * pulse,
          }}
        />
      )}
      {kind === "mesh" && (
        <AbsoluteFill style={{ filter: "blur(90px)", opacity: dark ? 0.6 : 0.45 }}>
          {[p.primary, p.secondary, p.primary].map((c, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                width: 900,
                height: 900,
                borderRadius: "50%",
                background: c,
                left: 200 + i * 520 + 160 * Math.sin(drift + i * 2),
                top: -150 + (i % 2) * 500 + 120 * Math.cos(drift * 0.8 + i),
              }}
            />
          ))}
        </AbsoluteFill>
      )}
      {kind === "grid" && (
        <AbsoluteFill
          style={{
            backgroundImage: `linear-gradient(${dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"} 1px, transparent 1px), linear-gradient(90deg, ${dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"} 1px, transparent 1px)`,
            backgroundSize: "80px 80px",
            maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
          }}
        />
      )}
      {kind === "solid" && <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, transparent 50%, ${dark ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.06)"})` }} />}
    </AbsoluteFill>
  );
}

function TextShot({ shot, t }: ShotProps<"text">) {
  const { frame, fps, opacity, exit } = useShotMotion(shot.durationInFrames);
  const { beatFrames, pulse } = useBeat(t.bpm);
  const { p, highlight, display, motion, style, headline } = useTheme();
  const longest = Math.max(...shot.lines.map((l) => l.length));
  const size = Math.min(style.caps ? 130 : 150, 1650 / (longest * (style.caps ? 0.66 : 0.56)));
  const left = style.align === "left";
  return (
    <AbsoluteFill style={{ alignItems: left ? "flex-start" : "center", justifyContent: "center", padding: left ? "0 170px" : 0, opacity }}>
      <div style={{ transform: `scale(${1 + 0.05 * exit + 0.012 * pulse})`, transformOrigin: left ? "left center" : "center", textAlign: style.align }}>
        {shot.lines.map((line, li) => (
          <div key={li} style={{ fontFamily: display.family, fontSize: size, fontWeight: display.heavy, letterSpacing: -size * (style.caps ? 0.01 : 0.035), lineHeight: 1.06 }}>
            {headline(line).split(" ").map((word, wi) => {
              // Lines land on successive beats; words within a line ripple in.
              const prog = spring({ frame: frame - (li * beatFrames + wi * motion.stagger), fps, config: motion.spring });
              return (
                <span
                  key={wi}
                  style={{
                    display: "inline-block",
                    marginRight: size * 0.25,
                    color: li === shot.lines.length - 1 ? highlight : p.ink,
                    opacity: Math.min(1, prog),
                    transform: `translateY(${(1 - prog) * motion.travel}px)`,
                    filter: `blur(${Math.max(0, 1 - prog) * 10}px)`,
                  }}
                >
                  {word}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}

// Plays a scene's cut footage fit into the shot: sped up (up to 2.5x) when it is long,
// starting late enough that the shot always ends on the result.
function Footage({ clip, durationInFrames, t }: { clip: ClipSource; durationInFrames: number; t: AdTimeline }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { highlight } = useTheme();
  const { width: vw, height: vh } = t.viewport;
  const totalMs = clip.segments.reduce((n, s) => n + s.to - s.from, 0);
  const shotMs = (durationInFrames / fps) * 1000;
  const rate = Math.min(2.5, Math.max(1, totalMs / shotMs));
  const offsetMs = Math.max(0, totalMs - rate * shotMs);

  const virtualMs = offsetMs + (frame / fps) * 1000 * rate;
  const { ms, holding } = sourceMs((virtualMs / 1000) * fps, fps, clip.segments);
  const zoom = zoomAt(ms, clip.events);
  const scale = 1 + 0.28 * zoom.amount;
  const cursor = cursorAt(ms, clip.events, { x: vw / 2, y: vh / 2 });
  const click = lastClick(ms, clip.events);
  const ripple = click ? (ms - click.t) / 450 : 0;

  let acc = 0;
  const pieces: React.ReactNode[] = [];
  clip.segments.forEach((s, i) => {
    const len = s.to - s.from;
    const vStart = Math.max(acc, offsetMs);
    const vEnd = Math.min(acc + len, offsetMs + rate * shotMs);
    if (vEnd > vStart) {
      const from = Math.round(((vStart - offsetMs) / rate / 1000) * fps);
      const frames = Math.max(1, Math.round(((vEnd - vStart) / rate / 1000) * fps));
      pieces.push(
        <Sequence key={i} from={from} durationInFrames={frames} layout="none">
          <Video
            src={staticFile(clip.video)}
            muted
            playbackRate={rate}
            trimBefore={Math.round(((s.from + vStart - acc) / 1000) * fps)}
            style={{ width: vw, height: vh, display: "block" }}
          />
        </Sequence>,
      );
    }
    acc += len;
  });

  return (
    <div style={{ width: vw, height: vh, overflow: "hidden", position: "relative", background: "white" }}>
      <div style={{ width: vw, height: vh, position: "relative", transform: zoomTransform(scale, zoom, vw, vh), transformOrigin: "0 0" }}>
        {holding ? <Img src={staticFile(clip.endShot)} style={{ width: vw, height: vh, display: "block" }} /> : pieces}
        {click && (
          <div
            style={{
              position: "absolute",
              left: click.x! - 28,
              top: click.y! - 28,
              width: 56,
              height: 56,
              borderRadius: 99,
              border: `4px solid ${highlight}`,
              transform: `scale(${0.4 + ripple})`,
              opacity: 1 - ripple,
            }}
          />
        )}
        <svg width={28} height={28} viewBox="0 0 24 24" style={{ position: "absolute", left: cursor.x - 3, top: cursor.y - 2, filter: "drop-shadow(0 2px 3px rgba(0,0,0,.45))" }}>
          <path d="M3 2l7.5 19 2.6-7.6L21 10.8z" fill="white" stroke="black" strokeWidth={1.4} strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

// Three ways to present the product: a tilted browser window, a chromeless floating card, or huge and edge-to-edge.
function Device({ clip, durationInFrames, t }: { clip: ClipSource; durationInFrames: number; t: AdTimeline }) {
  const { frame, enter } = useShotMotion(durationInFrames);
  const { style, p, dark } = useTheme();
  const progress = frame / durationInFrames;
  const footage = <Footage clip={clip} durationInFrames={durationInFrames} t={t} />;
  const shadow = dark ? "0 60px 140px rgba(0,0,0,0.6)" : "0 50px 120px rgba(20,20,40,0.22)";

  if (style.frame === "bleed") {
    return (
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 1240, overflow: "hidden", transform: `translateX(${(1 - enter) * 200}px)` }}>
        <div style={{ position: "absolute", left: 0, top: "50%", transform: `translateY(-50%) scale(${1.02 + 0.06 * progress})`, transformOrigin: "left center" }}>
          {footage}
        </div>
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, ${p.background} 0%, transparent 22%)` }} />
      </div>
    );
  }

  const floating = style.frame === "floating";
  const tilt = floating ? 0 : interpolate(progress, [0, 1], [-16, -5], { ...clamp, easing: ease });
  const bob = floating ? Math.sin(frame / 22) * 8 : 0;
  return (
    <div style={{ position: "absolute", right: 70, top: "50%", perspective: 2200 }}>
      <div
        style={{
          transform: `translateY(calc(-50% + ${bob}px)) translateX(${(1 - enter) * 160}px) rotateY(${tilt}deg) rotateX(${floating ? 0 : 3}deg) scale(0.8)`,
          transformOrigin: "right center",
          borderRadius: style.radius + 6,
          overflow: "hidden",
          boxShadow: `${shadow}, 0 0 0 1px ${dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)"}, 0 0 120px ${p.primary}33`,
          background: dark ? "#16161d" : "#ffffff",
        }}
      >
        {!floating && (
          <div style={{ height: 40, display: "flex", alignItems: "center", gap: 9, paddingLeft: 18, background: dark ? "#16161d" : "#f1f1f4" }}>
            {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
              <div key={c} style={{ width: 13, height: 13, borderRadius: 99, background: c }} />
            ))}
          </div>
        )}
        {footage}
      </div>
    </div>
  );
}

function ClipShot({ shot, t }: ShotProps<"clip">) {
  const { frame, fps, opacity } = useShotMotion(shot.durationInFrames);
  const { p, highlight, display, body, motion, headline, style } = useTheme();
  const clip = t.clips[shot.sceneId];
  const textIn = spring({ frame: frame - 4, fps, config: motion.spring });
  const subIn = spring({ frame: frame - 10, fps, config: motion.spring });
  if (!clip) return null;
  return (
    <AbsoluteFill style={{ opacity }}>
      <Device clip={clip} durationInFrames={shot.durationInFrames} t={t} />
      <div style={{ position: "absolute", left: 110, top: 0, bottom: 0, width: 560, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ width: 64, height: 6, borderRadius: 3, background: highlight, marginBottom: 28, transform: `scaleX(${Math.min(1, textIn)})`, transformOrigin: "left" }} />
        <div
          style={{
            fontFamily: display.family,
            fontSize: style.caps ? 70 : 84,
            fontWeight: display.heavy,
            color: p.ink,
            letterSpacing: style.caps ? 0 : -2.5,
            lineHeight: 1.02,
            opacity: Math.min(1, textIn),
            transform: `translateX(${(1 - textIn) * -motion.travel}px)`,
          }}
        >
          {headline(shot.caption)}
        </div>
        <div style={{ marginTop: 22, fontFamily: body.family, fontSize: 36, fontWeight: 500, color: p.muted, lineHeight: 1.3, opacity: Math.min(1, subIn), transform: `translateX(${(1 - subIn) * -motion.travel * 0.7}px)` }}>
          {shot.sub}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function parseStat(value: string) {
  const m = value.match(/^(\D*)([\d,]*\.?\d+)(.*)$/);
  if (!m) return null;
  const n = parseFloat(m[2].replace(/,/g, ""));
  const decimals = (m[2].split(".")[1] ?? "").length;
  return { prefix: m[1], n, decimals, suffix: m[3], commas: m[2].includes(",") };
}

function StatShot({ shot, t }: ShotProps<"stat">) {
  const { frame, opacity } = useShotMotion(shot.durationInFrames);
  const { pulse } = useBeat(t.bpm);
  const { p, highlight, display, body } = useTheme();
  const stat = parseStat(shot.value);
  const prog = interpolate(frame, [0, shot.durationInFrames * 0.55], [0, 1], { ...clamp, easing: ease });
  const shown = stat
    ? `${stat.prefix}${(stat.n * prog).toLocaleString("en-US", { minimumFractionDigits: stat.decimals, maximumFractionDigits: stat.decimals, useGrouping: stat.commas })}${stat.suffix}`
    : shot.value;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity }}>
      <div style={{ fontFamily: display.family, fontSize: 300, fontWeight: display.heavy, letterSpacing: -10, color: highlight, transform: `scale(${1 + 0.025 * pulse})`, fontVariantNumeric: "tabular-nums" }}>
        {shown}
      </div>
      <div style={{ fontFamily: body.family, fontSize: 52, fontWeight: 600, color: p.ink, marginTop: -10, opacity: prog }}>{shot.label}</div>
    </AbsoluteFill>
  );
}

function FeaturesShot({ shot, t }: ShotProps<"features">) {
  const { frame, fps, opacity } = useShotMotion(shot.durationInFrames);
  const { beatFrames } = useBeat(t.bpm);
  const { p, highlight, onHighlight, display, motion, style, headline } = useTheme();
  return (
    <AbsoluteFill style={{ alignItems: style.align === "left" ? "flex-start" : "center", justifyContent: "center", padding: style.align === "left" ? "0 170px" : 0, opacity }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 34 }}>
        {shot.items.map((item, i) => {
          const prog = spring({ frame: frame - i * beatFrames, fps, config: motion.spring });
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 34, opacity: Math.min(1, prog), transform: `translateX(${(1 - prog) * motion.travel}px)` }}>
              <div style={{ width: 76, height: 76, borderRadius: Math.min(38, style.radius), background: highlight, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${0.5 + 0.5 * prog})` }}>
                <svg width={42} height={42} viewBox="0 0 24 24">
                  <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={onHighlight} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div style={{ fontFamily: display.family, fontSize: style.caps ? 72 : 86, fontWeight: display.heavy, color: p.ink, letterSpacing: style.caps ? 0 : -2.5 }}>{headline(item)}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

// Favicons are often tiny; only show a logo image that will look sharp at this size.
function Logo({ src, size }: { src?: string; size: number }) {
  const [state, setState] = useState<"ok" | "hidden">("ok");
  if (!src || state === "hidden") return null;
  return (
    <Img
      src={src}
      onError={() => setState("hidden")}
      onLoad={(e) => (e.currentTarget.naturalWidth < 96 ? setState("hidden") : undefined)}
      style={{ width: size, height: size, borderRadius: size * 0.22, objectFit: "contain" }}
    />
  );
}

function LogoShot({ shot, t }: ShotProps<"logo">) {
  const { frame, fps } = useShotMotion(shot.durationInFrames);
  const { p, highlight, onHighlight, display, body, motion, style } = useTheme();
  const pop = spring({ frame, fps, config: motion.spring });
  const tag = spring({ frame: frame - 10, fps, config: motion.spring });
  const pill = spring({ frame: frame - 18, fps, config: motion.spring });
  const host = new URL(t.brand.url).hostname.replace(/^www\./, "");
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 30, transform: `scale(${0.7 + 0.3 * Math.min(1.05, pop)})`, opacity: Math.min(1, pop) }}>
        <Logo src={t.brand.logo} size={120} />
        <div style={{ fontFamily: display.family, fontSize: 160, fontWeight: display.heavy, letterSpacing: -5, color: p.ink }}>{t.brand.name}</div>
      </div>
      <div style={{ fontFamily: body.family, fontSize: 50, fontWeight: 500, color: p.muted, marginTop: 26, opacity: Math.min(1, tag), transform: `translateY(${(1 - tag) * 24}px)` }}>
        {shot.tagline}
      </div>
      <div
        style={{
          marginTop: 48,
          padding: "20px 54px",
          borderRadius: Math.max(12, style.radius * 2),
          background: highlight,
          color: onHighlight,
          fontFamily: body.family,
          fontSize: 44,
          fontWeight: 700,
          opacity: Math.min(1, pill),
          transform: `scale(${0.8 + 0.2 * Math.min(1, pill)})`,
        }}
      >
        {host}
      </div>
      <div style={{ position: "absolute", bottom: 46, fontFamily: body.family, fontSize: 24, color: p.muted, opacity: 0.7 * Math.min(1, pill) }}>Made with Vist</div>
    </AbsoluteFill>
  );
}

function Shot({ shot, t }: { shot: TimedShot; t: AdTimeline }) {
  switch (shot.kind) {
    case "text":
      return <TextShot shot={shot} t={t} />;
    case "clip":
      return <ClipShot shot={shot} t={t} />;
    case "stat":
      return <StatShot shot={shot} t={t} />;
    case "features":
      return <FeaturesShot shot={shot} t={t} />;
    case "logo":
      return <LogoShot shot={shot} t={t} />;
  }
}

export const VistAd: React.FC<AdTimeline> = (t) => (
  <ThemeContext.Provider value={resolveTheme(t)}>
    <AbsoluteFill>
      <Backdrop t={t} />
      {t.shots.map((shot, i) => (
        <Sequence key={i} from={shot.from} durationInFrames={shot.durationInFrames}>
          <Shot shot={shot} t={t} />
        </Sequence>
      ))}
      {t.music && <Audio src={staticFile(t.music)} />}
    </AbsoluteFill>
  </ThemeContext.Provider>
);
