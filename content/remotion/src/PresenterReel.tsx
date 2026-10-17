// Kit style 3 with an AI presenter: short to-camera parts by "Anna" (the voice of Rite, labelled as AI) where a person
// lands the line, and animated cards for the data, cut to one VO take. Segments and word-timed cues are in
// presenter.json; the media (presenter clips, the VO) are served by render-presenter.sh, not bundled.
// Motion rules as everywhere (content/timing.ts): eased, nothing faster than ~0.45 s, crossfades, no music.
import React from "react";
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { T, DISPLAY, TEXT, LiveBrand, LiveDial, Range, Clock } from "./brand";
import DATA from "../presenter.json";

export type PresenterProps = { id: string; base: string };
type Reel = (typeof DATA.reels)[number];
type Seg = Reel["segments"][number];

export const XF = 0.45;        // crossfade between segments (the next fades in over the previous, ending on its cue)
const FADE_IN = 0.25, FADE_OUT = 0.8;
const easeOut = Easing.bezier(0.22, 1, 0.36, 1);
const sine = Easing.inOut(Easing.sin);
const clamp = (x: number) => Math.min(1, Math.max(0, x));
/** Eased 0→1 from time a over dur seconds. */
const p = (t: number, a: number, dur = 0.7) => easeOut(clamp((t - a) / dur));

export const reelSeconds = (id: string) => {
  const r = DATA.reels.find((x) => x.id === id) ?? DATA.reels[0];
  return r.voSeconds + r.tail;
};

export const PresenterReel: React.FC<PresenterProps> = ({ id, base }) => {
  const r = DATA.reels.find((x) => x.id === id) ?? DATA.reels[0];
  const f = useCurrentFrame(); const { fps, durationInFrames } = useVideoConfig();
  const t = f / fps, d = durationInFrames / fps;
  const g = Math.min(sine(clamp(t / FADE_IN)), sine(clamp((d - t) / FADE_OUT)));
  const url = (s: string) => `${base.replace(/\/$/, "")}/${r.id}/${s}`;
  return (
    <AbsoluteFill style={{ background: T.bg }}>
      <AbsoluteFill style={{ opacity: g }}>
        {r.segments.map((s, i) => {
          const start = i === 0 ? 0 : s.from - XF;
          const end = s.to ?? d;
          const fin = i === 0 ? 1 : sine(clamp((t - start) / XF));
          return (
            <Sequence key={i} from={Math.round(start * fps)} durationInFrames={Math.max(1, Math.round((end - start) * fps))} layout="none">
              <AbsoluteFill style={{ opacity: fin }}>
                <Clock.Provider value={{ t: t - start, d: end - start }}>
                  <Segment s={s} t={t} url={url} />
                </Clock.Provider>
              </AbsoluteFill>
            </Sequence>
          );
        })}
      </AbsoluteFill>
      <Audio src={url(r.audio)} />
    </AbsoluteFill>
  );
};

const Segment: React.FC<{ s: Seg; t: number; url: (s: string) => string }> = ({ s, t, url }) => {
  switch (s.kind) {
    case "presenter": return <Presenter s={s as PresenterSeg} t={t} url={url} />;
    case "window": return <Window s={s as WindowSeg} t={t} />;
    case "phases": return <Phases s={s as PhasesSeg} t={t} />;
    case "line": return <Line s={s as LineSeg} t={t} />;
    case "cta": return <Cta s={s as CtaSeg} t={t} />;
    default: return null;
  }
};

type Cap = { at: number; to: number; text: string };
type PresenterSeg = { from: number; to: number; src: string; captions: Cap[] };
type WindowSeg = { from: number; to: number; sign: string; range: string; cues: Record<"years" | "inside" | "one" | "three" | "date", number> };
type PhasesSeg = { from: number; to: number; phases: { name: string; line: string; at: number; lineAt: number }[] };
type LineSeg = { from: number; to: number; words: { at: number; text: string; key?: boolean }[] };
type CtaSeg = { from: number; lead: string; site: string; tail: string; tailAt: number };

/** The branding line used on every segment: mark + name left, URL right. */
const Top: React.FC<{ onCream?: boolean }> = ({ onCream }) => (
  <div style={{ position: "absolute", left: 72, right: 72, top: 96, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
    <LiveBrand size={40} onCream={onCream} />
    <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 32, color: onCream ? T.accent : T.gold }}>rite.report</span>
  </div>
);

// ---------- presenter: the clip covers the frame, a slow push-in, captions over the sweater ----------
const Presenter: React.FC<{ s: PresenterSeg; t: number; url: (s: string) => string }> = ({ s, t, url }) => {
  const { fps } = useVideoConfig();
  const k = (t - s.from) / Math.max(1, s.to - s.from);
  const scale = 1.0 + 0.03 * sine(clamp(k)); // 704×1280 → covers 1080×1920 at objectFit cover; +3 % over the part
  const cap = s.captions.find((c) => t >= c.at - 0.15 && t < c.to + 0.3);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `scale(${scale.toFixed(5)})`, willChange: "transform" }}>
        <OffthreadVideo src={url(s.src)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} startFrom={Math.round(s.from * fps)} />
      </AbsoluteFill>
      {/* legibility: soft dark at the top for the branding line, at the bottom for captions */}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(14,16,20,.55) 0%, rgba(14,16,20,0) 16%, rgba(14,16,20,0) 66%, rgba(14,16,20,.62) 100%)" }} />
      <Top />
      <div style={{ position: "absolute", right: 72, top: 162, fontFamily: TEXT, fontWeight: 600, fontSize: 24, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(237,230,214,.78)", padding: "8px 16px", borderRadius: 999, background: "rgba(14,16,20,.42)" }}>
        AI presenter
      </div>
      {cap && <Caption key={cap.at} c={cap} t={t} />}
    </AbsoluteFill>
  );
};

const Caption: React.FC<{ c: Cap; t: number }> = ({ c, t }) => {
  const a = p(t, c.at - 0.15, 0.45), z = 1 - sine(clamp((t - c.to) / 0.3));
  return (
    <div style={{ position: "absolute", left: 84, right: 84, bottom: 300, textAlign: "center", fontFamily: DISPLAY, fontWeight: 700, fontSize: 64, lineHeight: 1.12, letterSpacing: "-0.02em", color: T.cream, textWrap: "balance" as never, textShadow: "0 2px 18px rgba(0,0,0,.45)", opacity: a * z, transform: `translateY(${((1 - a) * 22).toFixed(2)}px)` }}>
      {c.text}
    </div>
  );
};

// ---------- window: the sign stretch as the dated season, then one pass or three ----------
const Window: React.FC<{ s: WindowSeg; t: number }> = ({ s, t }) => {
  const c = s.cues;
  const head = p(t, s.from - XF + 0.1, 0.9), years = p(t, c.years - 0.15, 0.8);
  const passes = p(t, c.inside - 0.1, 0.8);
  const one = p(t, c.one - 0.1, 0.6), three = p(t, c.three - 0.1, 0.8), date = p(t, c.date - 0.1, 0.9);
  const glow = Math.sin(clamp((t - c.date) / 2.2) * Math.PI);
  return (
    <AbsoluteFill style={{ background: T.bg, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: (1080 - 560) / 2, top: 880, opacity: 0.5 }}><LiveDial size={560} angle={352} halo={0.14} /></div>
      <Top />
      <div style={{ position: "absolute", left: 72, right: 72, top: 520 }}>
        <div style={{ opacity: head, transform: `translateY(${((1 - head) * 26).toFixed(2)}px)` }}>
          <div style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 36, color: T.muted, letterSpacing: "0.02em" }}>Saturn in {s.sign}</div>
          <div style={{ marginTop: 18, fontFamily: DISPLAY, fontWeight: 800, fontSize: 112, letterSpacing: "-0.045em", lineHeight: 0.98, color: T.cream }}><Range text={s.range} /></div>
        </div>
        <div style={{ marginTop: 34, display: "inline-block", fontFamily: TEXT, fontWeight: 600, fontSize: 34, color: T.ink, background: T.gold, padding: "12px 24px", borderRadius: 999, opacity: years, transform: `translateY(${((1 - years) * 18).toFixed(2)}px)` }}>
          A season of 2 to 4 years
        </div>
      </div>
      <div style={{ position: "absolute", left: 72, right: 72, bottom: 300, opacity: passes, transform: `translateY(${((1 - passes) * 24).toFixed(2)}px)` }}>
        <div style={{ borderTop: `2px solid ${T.line}`, paddingTop: 36, display: "flex", alignItems: "center", gap: 28 }}>
          <Tick on={one} /><Tick on={three} /><Tick on={three} delay={0.25} t={t} at={c.three} />
          <div style={{ marginLeft: 12, fontFamily: DISPLAY, fontWeight: 700, fontSize: 56, letterSpacing: "-0.02em", color: T.cream, lineHeight: 1.05 }}>
            <span style={{ opacity: one }}>One exact pass</span><span style={{ opacity: three, color: T.soft }}>, or three</span>
          </div>
        </div>
        <div style={{ marginTop: 26, fontFamily: DISPLAY, fontWeight: 700, fontSize: 64, letterSpacing: "-0.03em", color: T.gold, opacity: date, transform: `translateY(${((1 - date) * 18).toFixed(2)}px)`, textShadow: glow > 0.01 ? `0 0 ${(18 + 24 * glow).toFixed(1)}px rgba(242,181,68,${(0.5 * glow).toFixed(3)})` : undefined }}>
          That's the part with a date.
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Tick: React.FC<{ on: number; delay?: number; t?: number; at?: number }> = ({ on, delay = 0, t = 0, at = 0 }) => {
  const v = delay ? p(t, at - 0.1 + delay, 0.8) : on;
  return <div style={{ width: 30, height: 30, borderRadius: 15, background: T.gold, opacity: 0.15 + 0.85 * v, transform: `scale(${(0.6 + 0.4 * v).toFixed(3)})`, flex: "0 0 auto" }} />;
};

// ---------- phases: approach / contact / integration, each lights as it's said ----------
const Phases: React.FC<{ s: PhasesSeg; t: number }> = ({ s, t }) => {
  const head = p(t, s.from - XF + 0.1, 0.9);
  return (
    <AbsoluteFill style={{ background: T.cream, overflow: "hidden" }}>
      <div style={{ position: "absolute", right: 64, top: 200, opacity: 0.6 }}><LiveDial size={300} angle={300} onCream halo={0.12} /></div>
      <Top onCream />
      <div style={{ position: "absolute", left: 72, top: 300, width: 96 * head, height: 8, borderRadius: 4, background: T.accent }} />
      <div style={{ position: "absolute", left: 72, right: 72, top: 640, display: "flex", flexDirection: "column" }}>
        {s.phases.map((ph, i) => {
          const on = p(t, ph.at - 0.15, 0.7), line = p(t, ph.lineAt - 0.1, 0.8);
          const next = s.phases[i + 1];
          const active = next ? 1 - 0.55 * p(t, next.at - 0.15, 0.7) : 1; // earlier phases settle back once the next is said
          return (
            <div key={i} style={{ padding: "34px 0", borderTop: `2px solid rgba(20,17,10,.14)`, opacity: (0.16 + 0.84 * on) * active, transform: `translateY(${((1 - on) * 20).toFixed(2)}px)` }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
                <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 30, color: T.accent, width: 44 }}>{i + 1}</span>
                <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 92, letterSpacing: "-0.045em", lineHeight: 1, color: T.ink }}>{ph.name}</span>
              </div>
              <div style={{ marginTop: 12, marginLeft: 68, fontFamily: TEXT, fontSize: 40, lineHeight: 1.3, color: T.inkSoft, opacity: line }}>{ph.line}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ---------- line: the challenge, word-timed (a candidate for a second presenter part) ----------
const Line: React.FC<{ s: LineSeg; t: number }> = ({ s, t }) => (
  <AbsoluteFill style={{ background: T.bg, overflow: "hidden" }}>
    <Top />
    <div style={{ position: "absolute", left: 72, right: 72, top: 0, bottom: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 30 }}>
      {s.words.map((w, i) => {
        const a = p(t, w.at - 0.15, 0.7);
        return (
          <div key={i} style={{ fontFamily: DISPLAY, fontWeight: w.key ? 800 : 700, fontSize: w.key ? 120 : 68, letterSpacing: w.key ? "-0.05em" : "-0.025em", lineHeight: w.key ? 0.98 : 1.1, color: w.key ? T.gold : T.cream, opacity: 0.06 + 0.94 * a, transform: `translateY(${((1 - a) * 22).toFixed(2)}px)`, textWrap: "balance" as never }}>
            {w.text}
          </div>
        );
      })}
    </div>
  </AbsoluteFill>
);

// ---------- CTA ----------
const Cta: React.FC<{ s: CtaSeg; t: number }> = ({ s, t }) => {
  const a = p(t, s.from - XF + 0.1, 0.9), b = p(t, s.tailAt - 0.15, 0.8);
  return (
    <AbsoluteFill style={{ background: T.bg, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", left: (1080 - 760) / 2, top: 260, opacity: 0.5 }}><LiveDial size={760} angle={352} halo={0.16} /></div>
      <div style={{ position: "absolute", left: 72, right: 72, top: 1180, textAlign: "center" }}>
        <div style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 40, color: T.muted, opacity: a }}>{s.lead}</div>
        <div style={{ marginTop: 10, fontFamily: DISPLAY, fontWeight: 800, fontSize: 132, letterSpacing: "-0.05em", lineHeight: 1, color: T.gold, opacity: a, transform: `translateY(${((1 - a) * 24).toFixed(2)}px)` }}>{s.site}</div>
        <div style={{ marginTop: 24, fontFamily: DISPLAY, fontWeight: 700, fontSize: 60, letterSpacing: "-0.025em", color: T.cream, opacity: b, transform: `translateY(${((1 - b) * 18).toFixed(2)}px)` }}>{s.tail}</div>
      </div>
      <div style={{ position: "absolute", bottom: 150, opacity: a }}><LiveBrand size={44} /></div>
    </AbsoluteFill>
  );
};
