// Style 2, per sign: "Saturn return in <Sign>", the dial at Saturn's current angle, the transit dates and who
// it's for by birth range. SignCard = 1080×1350 still; SignCardVertical = 1080×1920, animated, length = the `seconds`
// prop (render-all.sh passes the VO length + 1.6 s; scripts/card-vo.ts).
//
// The vertical uses the card motion system in brand.tsx (same as the cohort and quote verticals): the build-up is paced
// to the video's length (Rise), the dial draws round to Saturn for most of it (LiveDial, whole and inside the frame),
// the transit dates are the key line and glow at 1/3 and 2/3 (Glow), and the branding line is on screen from the start
// with one refresh in the quiet gap (BrandLine, Sweep, LiveBrand). Dates never split: a range breaks after its dash,
// each date whole (Range, keepDates).
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { T, DISPLAY, TEXT, Brand, Dial, LiveBrand, LiveDial, Rise, Glow, Sweep, BrandLine, Clock, keepDates, Range } from "./brand";
import { CARD } from "../../timing";
import DATA from "../data/signs.json";

export type SignProps = { sign: string; seconds?: number };
type S = (typeof DATA.signs)[number];
const get = (sign: string): S => DATA.signs.find((s) => s.sign.toLowerCase() === sign.toLowerCase()) ?? DATA.signs[0];

const statusLabel = (s: S) => (s.status === "now" ? `Saturn in ${s.sign} now` : s.status === "next" ? `Saturn in ${s.sign} next` : `Saturn in ${s.sign} most recently`);
/** Title size so "in Sagittarius" fits the width. */
const signSize = (sign: string, max: number, width: number) => Math.min(max, Math.floor(width / ((sign.length + 3) * 0.56)));

const Tile: React.FC<{ label: string; main: string; also: string[]; style?: React.CSSProperties; size?: number }> = ({ label, main, also, style, size = 46 }) => (
  <div style={{ background: T.panel, borderRadius: 30, padding: "28px 28px", display: "flex", flexDirection: "column", gap: 10, ...style }}>
    <span style={{ fontFamily: TEXT, fontSize: 28, color: T.muted }}>{label}</span>
    <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: size, letterSpacing: "-0.02em", lineHeight: 1.05, color: T.cream }}><Range text={main} /></span>
    {also.length > 0 && <span style={{ fontFamily: TEXT, fontSize: 26, color: T.muted, lineHeight: 1.3 }}>{keepDates(`also ${also.join(" and ")}`)}</span>}
  </div>
);

/** Transit block: headline dates (the key line in the vertical), plus the dip / pass back in small type. */
const Transit: React.FC<{ s: S; big: number; live?: boolean }> = ({ s, big, live }) => {
  const mi = s.transit.parts.indexOf(s.transit.main);
  const before = s.transit.parts.slice(0, mi), after = s.transit.parts.slice(mi + 1);
  const dates = <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: big, letterSpacing: "-0.03em", lineHeight: 1.02, color: T.cream }}><Range text={`${s.transit.from} – ${s.transit.to}`} /></span>;
  const small = [...before.map((p) => `first stretch ${p}`), ...after.map((p) => `last pass back ${p}`)];
  const R: React.FC<{ f: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ f, children, style }) => live ? <Rise f={f} dy={18} style={style}>{children}</Rise> : <div style={style}>{children}</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <R f={0.4}><span style={{ fontFamily: TEXT, fontSize: 30, color: T.muted }}>{statusLabel(s)}</span></R>
      <R f={0.46}>{live ? <Glow color={T.cream}>{dates}</Glow> : dates}</R>
      {small.map((t, i) => <R key={t} f={0.56 + i * 0.05}><span style={{ fontFamily: TEXT, fontSize: 26, color: T.muted, lineHeight: 1.3 }}>{keepDates(t)}</span></R>)}
    </div>
  );
};

const Footer: React.FC<{ style?: React.CSSProperties; live?: boolean }> = ({ style, live }) => {
  const st: React.CSSProperties = { borderTop: `2px solid ${T.line}`, paddingTop: 34, display: "flex", justifyContent: "space-between", alignItems: "baseline", ...style };
  const head = <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 40, letterSpacing: "-0.02em", color: T.cream }}>Find your exact passes</span>;
  if (!live) return <div style={st}>{head}<span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 36, color: T.gold }}>{DATA.site}</span></div>;
  return <BrandLine style={st}>{head}<Sweep color={T.gold} light="#FFF1C9" style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 36 }}>{DATA.site}</Sweep></BrandLine>;
};

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
        <div style={{ flex: "0 0 auto" }}><Dial size={360} angle={s.angle} /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Tile label="First return, born" main={s.firstBorn.main} also={s.firstBorn.also} size={38} />
        <Tile label="Second return, born" main={s.secondBorn.main} also={s.secondBorn.also} size={38} />
      </div>
      <Footer style={{ marginTop: 40 }} />
    </AbsoluteFill>
  );
};

const inOut = Easing.bezier(0.65, 0, 0.35, 1);
const sine = Easing.inOut(Easing.sin);

export const SignCardVertical: React.FC<SignProps> = ({ sign }) => {
  const s = get(sign);
  const f = useCurrentFrame(); const { fps, durationInFrames } = useVideoConfig();
  const fin = interpolate(f, [0, CARD.fadeIn * fps], [0, 1], { easing: sine, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fout = interpolate(f, [durationInFrames - 1 - CARD.fadeOut * fps, durationInFrames - 1], [1, 0], { easing: sine, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const scale = interpolate(f, [0, durationInFrames - 1], [CARD.pushFrom, 1.02], { easing: inOut, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: T.bg }}>
      <AbsoluteFill style={{ opacity: Math.min(fin, fout), transform: `scale(${scale.toFixed(5)})`, willChange: "transform" }}>
        <Clock.Provider value={{ t: f / fps, d: durationInFrames / fps }}>
          <AbsoluteFill style={{ padding: "150px 80px 130px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <Rise f={0}><LiveBrand size={46} refresh /></Rise>
            <div style={{ marginTop: 56, fontFamily: DISPLAY, fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 0.9 }}>
              <Rise f={0.06} style={{ fontSize: 112, color: T.cream }}>Saturn return</Rise>
              <Rise f={0.16} dy={34} style={{ fontSize: signSize(s.sign, 184, 920), color: T.gold }}>in {s.sign}</Rise>
            </div>
            {/* the dial, whole and centred, with room for its halo inside the frame */}
            <div style={{ alignSelf: "center", marginTop: 36 }}><LiveDial size={540} angle={s.angle} /></div>
            <div style={{ marginTop: 28 }}><Transit s={s} big={66} live /></div>
            <div style={{ marginTop: "auto", paddingTop: 32, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <Rise f={0.7} dy={20} style={{ display: "flex" }}><Tile label="First return, born" main={s.firstBorn.main} also={s.firstBorn.also} size={40} style={{ flex: 1 }} /></Rise>
              <Rise f={0.8} dy={20} style={{ display: "flex" }}><Tile label="Second return, born" main={s.secondBorn.main} also={s.secondBorn.also} size={40} style={{ flex: 1 }} /></Rise>
            </div>
            <Footer style={{ marginTop: 36 }} live />
          </AbsoluteFill>
        </Clock.Provider>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
