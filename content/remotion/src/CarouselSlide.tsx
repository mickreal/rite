// Instagram carousel slide (launch-kit-v2 (e)): cream card, gold dial, dark type, 1080×1350.
// Slide 1 is the cover (big line, dial), the last is the CTA; the rest are one idea each. Text from data/carousels.json.
import React from "react";
import { AbsoluteFill } from "remotion";
import { T, DISPLAY, TEXT, Brand, Dial } from "./brand";
import DATA from "../data/carousels.json";

export type CarouselProps = { id: string; n: number };
type Slide = { kind?: "cover" | "cta"; head?: string; text?: string; small?: string; tag?: string; dial?: string; list?: string[][]; alt: string };

// keep "13 May 2026" together, and keep a range's dash on the first line ("29 Jan 1994 –" / "7 Apr 1996")
const nw = (t: string) => t.replace(/(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})/g, "$1 $2 $3").replace(/(\d{1,2}) ([A-Z][a-z]{2}) –/g, "$1 $2 –").replace(/(\d{4}) – /g, "$1 – ");
const sizeFor = (s: string, steps: Array<[number, number]>) => (steps.find(([n]) => s.length <= n) ?? steps[steps.length - 1])[1];

export const CarouselSlide: React.FC<CarouselProps> = ({ id, n }) => {
  const c = DATA.carousels.find((x) => x.id === id) ?? DATA.carousels[0];
  const slides = c.slides as Slide[];
  const s = slides[Math.min(Math.max(n, 1), slides.length) - 1];
  const total = slides.length;
  const last = s.kind === "cta";
  const top = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative" }}>
      <Brand size={36} onCream />
      <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 28, color: T.inkSoft, letterSpacing: "0.04em" }}>{n} / {total}</span>
    </div>
  );
  const bottom = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", borderTop: "2px solid rgba(20,17,10,.14)", paddingTop: 30 }}>
      <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 30, color: T.ink }}>{DATA.site}</span>
      {!last && <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 30, color: T.accent }}>Swipe →</span>}
    </div>
  );

  if (s.kind === "cover" || last) {
    return (
      <AbsoluteFill style={{ background: T.cream, padding: 80, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ position: "absolute", right: -260, bottom: -300, opacity: 0.85 }}><Dial size={900} angle={last ? 352 : 300} onCream halo={0.12} /></div>
        {top}
        <div style={{ marginTop: 130, width: 96, height: 8, borderRadius: 4, background: T.accent, position: "relative" }} />
        <div style={{ marginTop: 44, fontFamily: DISPLAY, fontWeight: 800, fontSize: sizeFor(s.head!, [[30, 132], [45, 116], [999, 100]]), letterSpacing: "-0.045em", lineHeight: 0.98, color: T.ink, maxWidth: 900, textWrap: "balance" as never, position: "relative" }}>
          {s.head}
        </div>
        {s.small && <div style={{ marginTop: 40, fontFamily: TEXT, fontWeight: 600, fontSize: 36, color: T.accent, position: "relative" }}>{nw(s.small)}</div>}
        {last && <div style={{ marginTop: 56, fontFamily: DISPLAY, fontWeight: 800, fontSize: 104, letterSpacing: "-0.04em", lineHeight: 1, color: T.accent, position: "relative" }}>{DATA.site}</div>}
        <div style={{ marginTop: "auto", position: "relative" }}>
          {!last && <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 30, color: T.accent }}>Swipe →</span>}
        </div>
      </AbsoluteFill>
    );
  }

  const body = s.text ?? "";
  const textSize = s.head ? 52 : sizeFor(body, [[90, 82], [140, 70], [999, 62]]);
  return (
    <AbsoluteFill style={{ background: T.cream, padding: 80, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ position: "absolute", right: -380, top: -380, opacity: 0.45 }}><Dial size={760} angle={300} onCream arc={false} halo={0.08} /></div>
      {top}
      <div style={{ marginTop: "auto", marginBottom: "auto", display: "flex", flexDirection: "column", gap: 36, position: "relative", maxWidth: 920 }}>
        {s.head && (
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: sizeFor(s.head, [[20, 104], [40, 84], [60, 72], [999, 62]]), letterSpacing: "-0.04em", lineHeight: 1.02, color: T.ink, textWrap: "balance" as never }}>
            {nw(s.head)}
          </div>
        )}
        {body && (
          <div style={{ fontFamily: s.head ? TEXT : DISPLAY, fontWeight: s.head ? 500 : 700, fontSize: textSize, letterSpacing: s.head ? "-0.01em" : "-0.03em", lineHeight: s.head ? 1.3 : 1.1, color: s.head ? T.ink : T.ink, textWrap: "pretty" as never }}>
            {nw(body)}
          </div>
        )}
        {s.list && (
          <div style={{ display: "flex", flexDirection: "column", borderTop: "2px solid rgba(20,17,10,.14)" }}>
            {s.list.map(([k, v]) => (
              <div key={k} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "26px 0", borderBottom: "2px solid rgba(20,17,10,.14)" }}>
                <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 60, letterSpacing: "-0.03em", lineHeight: 1, color: T.accent }}>{k}</span>
                <span style={{ fontFamily: TEXT, fontWeight: 500, fontSize: 42, lineHeight: 1.25, color: T.ink }}>{v}</span>
              </div>
            ))}
          </div>
        )}
        {s.dial === "window" && (
          <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
            <Dial size={360} angle={30} onCream halo={0.14} />
            <div style={{ display: "flex", flexDirection: "column", gap: 18, fontFamily: TEXT, fontSize: 32, color: T.inkSoft, lineHeight: 1.3 }}>
              <span><b style={{ color: T.ink }}>Gold arc:</b> your sign, one twelfth of Saturn's orbit</span>
              <span>From the day Saturn enters it <b style={{ color: T.ink }}>→</b> to the day it leaves</span>
            </div>
          </div>
        )}
        {s.tag && <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 72, letterSpacing: "-0.04em", lineHeight: 1, color: T.accent }}>{s.tag}</div>}
      </div>
      {bottom}
    </AbsoluteFill>
  );
};
