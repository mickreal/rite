// Style 2, per cohort: "Born <range>? Your Saturn return is open now / opens <Month Year>", with the pass months.
import React from "react";
import { AbsoluteFill } from "remotion";
import { T, DISPLAY, TEXT, Brand, Dial } from "./brand";
import DATA from "../data/cohorts.json";

export type CohortProps = { id: string };
const ORD = ["Pass one", "Pass two", "Pass three"];
const RN = ["first", "second", "third"];

export const CohortCard: React.FC<CohortProps> = ({ id }) => {
  const c = DATA.cohorts.find((x) => x.id === id) ?? DATA.cohorts[0];
  const head = c.headline.replace(/^opens /, "");
  const opens = c.state === "opens";
  const bornSize = c.born.length > 22 ? 84 : 96;
  return (
    <AbsoluteFill style={{ background: T.bg, padding: 72, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* faint dial echo in the open space right of the verdict, half off the edge */}
      <div style={{ position: "absolute", right: -300, top: 470, opacity: 0.4 }}><Dial size={620} angle={c.state === "open" ? 352 : 320} halo={0.12} /></div>
      <Brand size={42} />
      <div style={{ marginTop: 120, fontFamily: DISPLAY, fontWeight: 800, fontSize: bornSize, letterSpacing: "-0.045em", lineHeight: 0.98, color: T.cream, maxWidth: 900 }}>
        Born {c.born}?
      </div>
      {c.alsoBorn.length > 0 && <div style={{ marginTop: 18, fontFamily: TEXT, fontSize: 32, color: T.soft, lineHeight: 1.35, maxWidth: 900 }}>or {c.alsoBorn.join(", or ")}</div>}
      <div style={{ marginTop: 52, fontFamily: DISPLAY, fontWeight: 600, fontSize: 52, letterSpacing: "-0.02em", color: T.cream, lineHeight: 1 }}>
        Your {c.returnNumber > 1 ? `${RN[c.returnNumber - 1]} ` : ""}Saturn return {opens ? "opens" : "is"}
      </div>
      <div style={{ marginTop: 6, fontFamily: DISPLAY, fontWeight: 800, fontSize: opens ? 128 : 150, letterSpacing: "-0.055em", lineHeight: 0.95, color: T.gold }}>
        {head}.
      </div>
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 18 }}>
        {c.passes.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", borderTop: `2px solid ${T.line}` }}>
            {c.passes.map((p, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "18px 0", borderBottom: `2px solid ${T.line}` }}>
                <span style={{ fontFamily: TEXT, fontSize: 30, color: T.muted }}>{c.passes.length === 1 ? "Exact pass" : ORD[i]}</span>
                <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 50, letterSpacing: "-0.02em", lineHeight: 1, color: T.cream }}>{p}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 44, letterSpacing: "-0.02em", lineHeight: 1.15, color: T.cream }}>{c.passSpan}</div>
        )}
        <span style={{ fontFamily: TEXT, fontSize: 28, color: T.muted }}>Saturn in {c.sign} · window {c.window}</span>
      </div>
      <div style={{ marginTop: 40, borderTop: `2px solid ${T.line}`, paddingTop: 34, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 40, letterSpacing: "-0.02em", color: T.cream }}>Your exact days, free</span>
        <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 36, color: T.gold }}>{DATA.site}</span>
      </div>
    </AbsoluteFill>
  );
};
