// Style 2, per cohort: "Born <range>? Your Saturn return is open now / opens <Month Year>", with the pass months.
import React from "react";
import { AbsoluteFill } from "remotion";
import { T, DISPLAY, TEXT, Brand, LiveDial, Rise } from "./brand";
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
      {/* the dial, whole, in the top-right corner beside the mark */}
      <div style={{ position: "absolute", right: 56, top: 40, opacity: 0.55 }}><LiveDial size={250} angle={c.state === "open" ? 352 : 320} halo={0.14} /></div>
      <Rise at={0.2}><Brand size={42} /></Rise>
      <Rise at={0.5} style={{ marginTop: 120, fontFamily: DISPLAY, fontWeight: 800, fontSize: bornSize, letterSpacing: "-0.045em", lineHeight: 0.98, color: T.cream, maxWidth: 900 }}>
        Born {c.born}?
      </Rise>
      {c.alsoBorn.length > 0 && <Rise at={0.9} style={{ marginTop: 18, fontFamily: TEXT, fontSize: 32, color: T.soft, lineHeight: 1.35, maxWidth: 900 }}>or {c.alsoBorn.join(", or ")}</Rise>}
      <Rise at={1.4} style={{ marginTop: 52, fontFamily: DISPLAY, fontWeight: 600, fontSize: 52, letterSpacing: "-0.02em", color: T.cream, lineHeight: 1 }}>
        Your {c.returnNumber > 1 ? `${RN[c.returnNumber - 1]} ` : ""}Saturn return {opens ? "opens" : "is"}
      </Rise>
      <Rise at={1.8} dur={1} dy={40} style={{ marginTop: 6, fontFamily: DISPLAY, fontWeight: 800, fontSize: opens ? 128 : 150, letterSpacing: "-0.055em", lineHeight: 0.95, color: T.gold }}>
        {head}.
      </Rise>
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 18 }}>
        {c.passes.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", borderTop: `2px solid ${T.line}` }}>
            {c.passes.map((p, i) => (
              <Rise key={i} at={2.6 + i * 0.4} dy={18} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "18px 0", borderBottom: `2px solid ${T.line}` }}>
                <span style={{ fontFamily: TEXT, fontSize: 30, color: T.muted }}>{c.passes.length === 1 ? "Exact pass" : ORD[i]}</span>
                <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 50, letterSpacing: "-0.02em", lineHeight: 1, color: T.cream }}>{p}</span>
              </Rise>
            ))}
          </div>
        ) : (
          <Rise at={2.6} style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 44, letterSpacing: "-0.02em", lineHeight: 1.15, color: T.cream }}>{c.passSpan}</Rise>
        )}
        <Rise at={3.6} dy={14}><span style={{ fontFamily: TEXT, fontSize: 28, color: T.muted }}>Saturn in {c.sign} · window {c.window}</span></Rise>
      </div>
      <Rise at={4.1} dy={14} style={{ marginTop: 40, borderTop: `2px solid ${T.line}`, paddingTop: 34, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 40, letterSpacing: "-0.02em", color: T.cream }}>Your exact days, free</span>
        <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 36, color: T.gold }}>{DATA.site}</span>
      </Rise>
    </AbsoluteFill>
  );
};
