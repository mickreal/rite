// Tokens from src/views/theme.ts, the dial from src/card.ts, the brand fonts from content/fonts.
import React from "react";
import { continueRender, delayRender, staticFile } from "remotion";

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
export const Dial: React.FC<{ size: number; angle: number; enter?: number; onCream?: boolean; arc?: boolean; halo?: number }> = ({ size, angle, enter = 1, onCream, arc = true, halo = 0.18 }) => {
  const Cw = 2 * Math.PI * 230;
  const ring = onCream ? "rgba(20,17,10,.22)" : "rgba(237,230,214,.32)";
  const track = onCream ? "rgba(20,17,10,.16)" : "rgba(237,230,214,.2)";
  const gold = onCream ? T.accent : T.gold;
  const planet = onCream ? T.ink : T.cream;
  const sc = 0.35 + 0.65 * enter, rot = -140 * (1 - enter);
  return (
    <svg width={size} height={size} viewBox="0 0 600 600" style={{ display: "block", overflow: "visible" }}>
      <g transform={`translate(300 300) scale(${sc}) rotate(${rot}) translate(-300 -300)`} opacity={Math.min(1, enter * 1.6)}>
        <circle cx="300" cy="300" r="266" fill="none" stroke={ring} strokeWidth="10" strokeDasharray="1.2 22.0126" strokeDashoffset="0.6" />
        <circle cx="300" cy="300" r="266" fill="none" stroke={onCream ? "rgba(20,17,10,.3)" : "rgba(237,230,214,.6)"} strokeWidth="18" strokeDasharray="1.6 137.6739" strokeDashoffset="0.8" />
        <circle cx="300" cy="300" r="230" fill="none" stroke={track} strokeDasharray="2 7" />
      </g>
      {arc && angle > 0.5 && <circle cx="300" cy="300" r="230" fill="none" stroke={gold} strokeWidth="4" strokeLinecap="round" transform="rotate(-90 300 300)" strokeDasharray={`${(angle / 360 * Cw).toFixed(1)} 2000`} opacity={enter} />}
      <line x1="300" y1="40" x2="300" y2="100" stroke={gold} strokeWidth="3" opacity={enter} />
      <circle cx="300" cy="300" r="8" fill={planet} opacity={enter} />
      <g transform={`rotate(${angle.toFixed(2)} 300 300)`} opacity={enter}>
        <circle cx="300" cy="70" r="40" fill={gold} opacity={halo} />
        <circle cx="300" cy="70" r="20" fill={planet} />
        <ellipse cx="300" cy="70" rx="38" ry="10" fill="none" stroke={gold} strokeWidth="3.5" transform="rotate(-22 300 70)" />
      </g>
    </svg>
  );
};
