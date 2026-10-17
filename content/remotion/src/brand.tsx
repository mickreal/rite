// Tokens from src/views/theme.ts, the dial from src/card.ts, the brand fonts from content/fonts.
import React from "react";
import { continueRender, delayRender, staticFile, Easing } from "remotion";

export const T = {
  bg: "#0E1014", panel: "#14171D", cream: "#EDE6D6", gold: "#F2B544", muted: "#A7A196", soft: "#BDB6A8",
  line: "rgba(237,230,214,.14)", ink: "#14110A", accent: "#B9861F", inkSoft: "rgba(20,17,10,.62)",
};
export const DISPLAY = "'Bricolage Grotesque', 'Helvetica Neue', Arial, sans-serif";
export const TEXT = "'Hanken Grotesk', 'Helvetica Neue', Arial, sans-serif";

// Load the variable TTFs once per page; every render waits for them.
const handle = delayRender("brand fonts");
Promise.all([
  new FontFace("Bricolage Grotesque", `url(${staticFile("BricolageGrotesque-VF.ttf")}) format('truetype')`, { weight: "200 800", stretch: "75% 100%" }).load(),
  new FontFace("Hanken Grotesk", `url(${staticFile("HankenGrotesk-VF.ttf")}) format('truetype')`, { weight: "100 900" }).load(),
]).then((fs) => { fs.forEach((f) => document.fonts.add(f)); continueRender(handle); })
  .catch((e) => { console.error("font load failed", e); continueRender(handle); });

/** The Rite mark (planet + ring). `onCream` swaps to ink + accent. */
export const Mark: React.FC<{ size: number; onCream?: boolean }> = ({ size, onCream }) => (
  <svg width={size} height={size} viewBox="0 0 30 30" style={{ display: "block", flex: "0 0 auto" }}>
    <circle cx="15" cy="15" r="6.5" fill={onCream ? T.ink : T.cream} />
    <ellipse cx="15" cy="15" rx="13.5" ry="4" fill="none" stroke={onCream ? T.accent : T.gold} strokeWidth="1.8" transform="rotate(-22 15 15)" />
  </svg>
);

export const Brand: React.FC<{ size?: number; onCream?: boolean }> = ({ size = 44, onCream }) => (
  <div style={{ display: "flex", alignItems: "center", gap: size * 0.3, fontFamily: DISPLAY, fontWeight: 700, fontSize: size, letterSpacing: "-0.02em", color: onCream ? T.ink : T.cream, lineHeight: 1 }}>
    <Mark size={size * 1.2} onCream={onCream} />Rite
  </div>
);

/**
 * The orbit dial, as in src/card.ts: ticked outer ring, dotted track, gold progress arc from the top marker
 * (the return point) round to Saturn. `angle` = how far round the cycle Saturn is, 0–360.
 * `enter` 0→1 plays the /start entrance (scale + spin in); `onCream` is the light-card variant.
 */
export const Dial: React.FC<{ size: number; angle: number; enter?: number; onCream?: boolean; arc?: boolean; halo?: number; draw?: number; spin?: number; pulse?: number }> = ({ size, angle: full, enter = 1, onCream, arc = true, halo = 0.18, draw = 1, spin = 0, pulse = 0 }) => {
  const angle = full * draw; // Saturn travels round with the arc as it draws
  const Cw = 2 * Math.PI * 230;
  const ring = onCream ? "rgba(20,17,10,.22)" : "rgba(237,230,214,.32)";
  const track = onCream ? "rgba(20,17,10,.16)" : "rgba(237,230,214,.2)";
  const gold = onCream ? T.accent : T.gold;
  const planet = onCream ? T.ink : T.cream;
  const sc = 0.35 + 0.65 * enter, rot = -140 * (1 - enter);
  return (
    <svg width={size} height={size} viewBox="0 0 600 600" style={{ display: "block", overflow: "visible" }}>
      <g transform={`translate(300 300) scale(${sc}) rotate(${rot + spin}) translate(-300 -300)`} opacity={Math.min(1, enter * 1.6)}>
        <circle cx="300" cy="300" r="266" fill="none" stroke={ring} strokeWidth="10" strokeDasharray="1.2 22.0126" strokeDashoffset="0.6" />
        <circle cx="300" cy="300" r="266" fill="none" stroke={onCream ? "rgba(20,17,10,.3)" : "rgba(237,230,214,.6)"} strokeWidth="18" strokeDasharray="1.6 137.6739" strokeDashoffset="0.8" />
        <circle cx="300" cy="300" r="230" fill="none" stroke={track} strokeDasharray="2 7" />
      </g>
      {arc && angle > 0.5 && <circle cx="300" cy="300" r="230" fill="none" stroke={gold} strokeWidth="4" strokeLinecap="round" transform="rotate(-90 300 300)" strokeDasharray={`${(angle / 360 * Cw).toFixed(1)} 2000`} opacity={enter} />}
      <line x1="300" y1="40" x2="300" y2="100" stroke={gold} strokeWidth="3" opacity={enter} />
      <circle cx="300" cy="300" r="8" fill={planet} opacity={enter} />
      <g transform={`rotate(${angle.toFixed(2)} 300 300)`} opacity={enter}>
        <circle cx="300" cy="70" r={40 * (1 + 0.22 * pulse)} fill={gold} opacity={halo * (1 + 0.8 * pulse)} />
        <circle cx="300" cy="70" r="20" fill={planet} />
        <ellipse cx="300" cy="70" rx="38" ry="10" fill="none" stroke={gold} strokeWidth="3.5" transform="rotate(-22 300 70)" />
      </g>
    </svg>
  );
};

// ---------- motion ----------
// Cards render as Stills (no clock: everything in its final state) and inside VerticalCard (clock = seconds since start +
// the video's length), so the same components serve both. Timing scales with the video, so a 20 s voiceover reel isn't
// all over in the first two seconds:
//   - the build-up (text reveals) runs across REVEAL of the video, each move ≥ 0.9 s, eased;
//   - the dial keeps drawing round to Saturn for most of the video, the tick ring drifts, the halo breathes;
//   - one quiet accent at a time after that: the key line glows at 1/3 and 2/3; the branding line (on screen from the
//     start) gets one refresh in the quiet gap between the end of the build-up and the second glow (refreshAt).
export type ClockValue = { t: number; d: number } | null;
export const Clock = React.createContext<ClockValue>(null);
export const useClock = () => React.useContext(Clock);
const easeOut = Easing.bezier(0.22, 1, 0.36, 1);
const inOut = Easing.bezier(0.65, 0, 0.35, 1);
export const REVEAL = 0.42; // share of the video the build-up takes
/** Seconds for a story position f (0–1 of the build-up). */
const at = (c: { d: number }, f: number) => 0.3 + f * Math.min(9, Math.max(3.5, c.d * REVEAL));

/** 0→1 for a reveal placed at story position f; always 1 in a Still. */
export function useReveal(f: number, dur = 1.1): number {
  const c = useClock();
  if (!c) return 1;
  return easeOut(Math.min(1, Math.max(0, (c.t - at(c, f)) / dur)));
}
/** A soft bell 0→1→0 centred on fraction x of the whole video, `w` seconds wide; 0 in a Still. */
export function useAccent(x: number, w = 1.6): number {
  const c = useClock();
  if (!c) return 0;
  const u = (c.t - x * c.d) / w + 0.5;
  return u <= 0 || u >= 1 ? 0 : (1 - Math.cos(u * Math.PI * 2)) / 2;
}
/** Eased 0→1 progress of a one-off move centred on fraction x of the video, lasting `w` seconds. */
export function useMove(x: number, w = 2.4): number {
  const c = useClock();
  if (!c) return 0;
  const u = (c.t - x * c.d) / w + 0.5;
  return inOut(Math.min(1, Math.max(0, u)));
}

/**
 * When the branding line gets its one refresh, as a fraction of the video: in the quiet gap after the build-up has
 * finished and before the key line's second glow (at 2/3), so it never lands on top of other motion.
 */
export function refreshAt(d: number): number {
  const buildEnd = at({ d }, 1) + 1.1;           // last reveal settles
  const glowStart = (2 / 3) * d - 0.9;            // second glow begins
  const mid = (buildEnd + glowStart) / 2;
  return Math.min(0.62, Math.max(0.45, mid / d)); // fallback to around the middle on very short videos
}
/** Bell 0→1→0 of the branding refresh (≈2 s); 0 in a Still. */
export function useRefresh(w = 2.2): number {
  const c = useClock();
  return useAccent(c ? refreshAt(c.d) : 0, w);
}
/** Eased one-way progress across the branding refresh. */
export function useRefreshMove(w = 2.2): number {
  const c = useClock();
  return useMove(c ? refreshAt(c.d) : 0, w);
}

/** The branding line: on screen from the start; once, mid-video, it brightens a touch and lifts 4 px, then settles. */
export const BrandLine: React.FC<{ style?: React.CSSProperties; children: React.ReactNode }> = ({ style, children }) => {
  const r = useRefresh();
  return <div style={{ ...style, transform: r > 0.001 ? `translateY(${(-4 * r).toFixed(2)}px)` : undefined, filter: r > 0.001 ? `brightness(${(1 + 0.18 * r).toFixed(3)})` : undefined }}>{children}</div>;
};

/** Fade + rise for a block of text, at story position f. */
export const Rise: React.FC<{ f: number; dur?: number; dy?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({ f, dur = 1.1, dy = 26, style, children }) => {
  const p = useReveal(f, dur);
  return <div style={{ ...style, opacity: p, transform: p < 1 ? `translateY(${((1 - p) * dy).toFixed(2)}px)` : undefined }}>{children}</div>;
};

/** The key line: glows softly twice, at 1/3 and 2/3 of the video. */
export const Glow: React.FC<{ color: string; children: React.ReactNode; style?: React.CSSProperties }> = ({ color, children, style }) => {
  const g = Math.max(useAccent(1 / 3, 1.8), useAccent(2 / 3, 1.8));
  const rgb = color.replace("#", "").match(/../g)!.map((h) => parseInt(h, 16)).join(",");
  return <span style={{ ...style, display: "inline-block", textShadow: g > 0.001 ? `0 0 ${(18 + 26 * g).toFixed(1)}px rgba(${rgb},${(0.55 * g).toFixed(3)})` : undefined, filter: g > 0.001 ? `brightness(${(1 + 0.12 * g).toFixed(3)})` : undefined }}>{children}</span>;
};

/** The URL with one light sweep across it, during the branding refresh. */
export const Sweep: React.FC<{ color: string; light: string; children: React.ReactNode; style?: React.CSSProperties }> = ({ color, light, children, style }) => {
  const c = useClock();
  const m = useRefreshMove(1.8);
  if (!c || m <= 0 || m >= 1) return <span style={{ ...style, color }}>{children}</span>;
  const x = -30 + m * 160; // highlight band travels left → right
  return <span style={{ ...style, color, backgroundImage: `linear-gradient(100deg, ${color} ${x - 18}%, ${light} ${x}%, ${color} ${x + 18}%)`, WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>{children}</span>;
};

/** The dial with the card motion: scale/spin-in entrance, the gold arc drawing slowly round to Saturn for most of the
 * video (the planet travelling with it), a slow drift of the tick ring, and a breathing halo. Finished dial in a Still. */
export const LiveDial: React.FC<{ size: number; angle: number; onCream?: boolean; halo?: number }> = ({ size, angle, onCream, halo }) => {
  const c = useClock();
  if (!c) return <Dial size={size} angle={angle} onCream={onCream} halo={halo} />;
  const enter = easeOut(Math.min(1, Math.max(0, (c.t - 0.2) / 2.6)));
  const drawEnd = Math.max(6, c.d * 0.72);
  const draw = inOut(Math.min(1, Math.max(0, (c.t - 1.4) / (drawEnd - 1.4))));
  const spin = c.t * 2.2;
  const pulse = c.t < 3 ? 0 : (1 - Math.cos((c.t - 3) * Math.PI * 2 / 4.5)) / 2;
  return <Dial size={size} angle={angle} onCream={onCream} halo={halo} enter={enter} draw={draw} spin={spin} pulse={pulse} />;
};

/** The Rite mark + name. With `refresh`, the mark's ring turns once, slowly, during the branding refresh. */
export const LiveBrand: React.FC<{ size?: number; onCream?: boolean; refresh?: boolean }> = ({ size = 44, onCream, refresh }) => {
  const m = useRefreshMove(2.6), b = useRefresh(2.6);
  const turn = refresh ? m : 0, lift = refresh ? b : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.3, fontFamily: DISPLAY, fontWeight: 700, fontSize: size, letterSpacing: "-0.02em", color: onCream ? T.ink : T.cream, lineHeight: 1 }}>
      <svg width={size * 1.2} height={size * 1.2} viewBox="0 0 30 30" style={{ display: "block", flex: "0 0 auto", overflow: "visible" }}>
        <circle cx="15" cy="15" r={6.5 * (1 + 0.06 * lift)} fill={onCream ? T.ink : T.cream} />
        <ellipse cx="15" cy="15" rx="13.5" ry="4" fill="none" stroke={onCream ? T.accent : T.gold} strokeWidth="1.8" transform={`rotate(${(-22 + 360 * turn).toFixed(2)} 15 15)`} />
      </svg>Rite
    </div>
  );
};
