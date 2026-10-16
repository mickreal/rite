// Style 2, per sign: "Saturn return in <Sign>", the dial at Saturn's current angle, the transit dates and who
// it's for by birth range. SignCard = 1080×1350 still; SignCardVertical = 1080×1920, 8 s, animated.
import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { T, DISPLAY, TEXT, Brand, Dial } from "./brand";
import DATA from "../data/signs.json";

export type SignProps = { sign: string };
type S = (typeof DATA.signs)[number];
const get = (sign: string): S => DATA.signs.find((s) => s.sign.toLowerCase() === sign.toLowerCase()) ?? DATA.signs[0];

const statusLabel = (s: S) => (s.status === "now" ? `Saturn in ${s.sign} now` : s.status === "next" ? `Saturn in ${s.sign} next` : `Saturn in ${s.sign} most recently`);
/** Title size so "in Sagittarius" fits the width. */
const signSize = (sign: string, max: number, width: number) => Math.min(max, Math.floor(width / ((sign.length + 3) * 0.56)));

const Tile: React.FC<{ label: string; main: string; also: string[]; style?: React.CSSProperties; size?: number }> = ({ label, main, also, style, size = 46 }) => (
  <div style={{ background: T.panel, borderRadius: 30, padding: "28px 28px", display: "flex", flexDirection: "column", gap: 10, ...style }}>
    <span style={{ fontFamily: TEXT, fontSize: 28, color: T.muted }}>{label}</span>
    <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: size, letterSpacing: "-0.02em", lineHeight: 1.05, color: T.cream }}>{main}</span>
    {also.length > 0 && <span style={{ fontFamily: TEXT, fontSize: 26, color: T.muted, lineHeight: 1.3 }}>also {also.join(" and ")}</span>}
  </div>
);

/** Transit block: headline dates, plus the dip / pass back in small type. */
const Transit: React.FC<{ s: S; big: number }> = ({ s, big }) => {
  const mi = s.transit.parts.indexOf(s.transit.main);
  const before = s.transit.parts.slice(0, mi), after = s.transit.parts.slice(mi + 1);
  const nw = (t: string) => <span style={{ whiteSpace: "nowrap" }}>{t}</span>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <span style={{ fontFamily: TEXT, fontSize: 30, color: T.muted }}>{statusLabel(s)}</span>
      <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: big, letterSpacing: "-0.03em", lineHeight: 1.02, color: T.cream }}>
        {s.transit.from}<br /><span style={{ color: T.muted, fontWeight: 500 }}>to </span>{s.transit.to}
      </span>
      {before.map((p) => <span key={p} style={{ fontFamily: TEXT, fontSize: 26, color: T.muted, lineHeight: 1.3 }}>first dip {nw(p)}</span>)}
      {after.map((p) => <span key={p} style={{ fontFamily: TEXT, fontSize: 26, color: T.muted, lineHeight: 1.3 }}>last pass back {nw(p)}</span>)}
    </div>
  );
};

const Footer: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <div style={{ borderTop: `2px solid ${T.line}`, paddingTop: 34, display: "flex", justifyContent: "space-between", alignItems: "baseline", ...style }}>
    <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 40, letterSpacing: "-0.02em", color: T.cream }}>Find your exact passes</span>
    <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 36, color: T.gold }}>{DATA.site}</span>
  </div>
);

export const SignCard: React.FC<SignProps> = ({ sign }) => {
  const s = get(sign);
  return (
    <AbsoluteFill style={{ background: T.bg, padding: 72, display: "flex", flexDirection: "column" }}>
      <Brand size={42} />
      <div style={{ marginTop: 56, fontFamily: DISPLAY, fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 0.9 }}>
        <div style={{ fontSize: 104, color: T.cream }}>Saturn return</div>
        <div style={{ fontSize: signSize(s.sign, 168, 936), color: T.gold }}>in {s.sign}</div>
      </div>
      <div style={{ flex: "1 1 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
        <div style={{ flex: "1 1 auto" }}><Transit s={s} big={60} /></div>
        <div style={{ flex: "0 0 auto", marginRight: -10 }}><Dial size={380} angle={s.angle} /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Tile label="First return, born" main={s.firstBorn.main} also={s.firstBorn.also} size={38} />
        <Tile label="Second return, born" main={s.secondBorn.main} also={s.secondBorn.also} size={38} />
      </div>
      <Footer style={{ marginTop: 40 }} />
    </AbsoluteFill>
  );
};

export const SignCardVertical: React.FC<SignProps> = ({ sign }) => {
  const s = get(sign);
  const f = useCurrentFrame(); const { fps, durationInFrames } = useVideoConfig();
  const rise = (delay: number) => {
    const p = spring({ frame: f - delay, fps, config: { damping: 200 }, durationInFrames: 24 });
    return { opacity: p, transform: `translateY(${(1 - p) * 60}px)` };
  };
  const enter = spring({ frame: f - 10, fps, config: { damping: 14, stiffness: 70, mass: 1 } });
  // Saturn swings from the return point (top) round to today's angle, like the /start build step
  const swing = interpolate(f, [24, 120], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.5, 0, 0.2, 1) });
  const angle = s.angle * swing;
  const fadeOut = interpolate(f, [durationInFrames - 12, durationInFrames], [1, 0], { extrapolateLeft: "clamp" });
  return (
    <AbsoluteFill style={{ background: T.bg, padding: "150px 80px 120px", display: "flex", flexDirection: "column", opacity: fadeOut }}>
      <div style={rise(0)}><Brand size={46} /></div>
      <div style={{ marginTop: 60, fontFamily: DISPLAY, fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 0.9, overflow: "hidden" }}>
        <div style={{ fontSize: 112, color: T.cream, ...rise(4) }}>Saturn return</div>
        <div style={{ fontSize: signSize(s.sign, 184, 920), color: T.gold, ...rise(9) }}>in {s.sign}</div>
      </div>
      <div style={{ alignSelf: "center", marginTop: 40 }}><Dial size={560} angle={angle} enter={enter} /></div>
      <div style={{ marginTop: 30, ...rise(110) }}><Transit s={s} big={68} /></div>
      <div style={{ marginTop: "auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Tile label="First return, born" main={s.firstBorn.main} also={s.firstBorn.also} size={40} style={rise(140)} />
        <Tile label="Second return, born" main={s.secondBorn.main} also={s.secondBorn.also} size={40} style={rise(150)} />
      </div>
      <Footer style={{ marginTop: 40, ...rise(175) }} />
    </AbsoluteFill>
  );
};
