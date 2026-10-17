// Style 6: one line on the cream card, small Rite mark. Lines from sign openers and the launch kit.
import React from "react";
import { AbsoluteFill } from "remotion";
import { T, DISPLAY, TEXT, Brand, LiveDial, Rise, useReveal } from "./brand";
import DATA from "../data/quotes.json";

export type QuoteProps = { id: string };

export const QuoteCard: React.FC<QuoteProps> = ({ id }) => {
  const q = DATA.quotes.find((x) => x.id === id) ?? DATA.quotes[0];
  const n = q.text.length;
  const size = n < 50 ? 112 : n < 90 ? 84 : 74;
  const bar = useReveal(0.3, 0.8);
  const words = q.text.split(" ");
  const step = Math.min(0.09, 2.2 / words.length); // the whole line is in by ~3 s
  return (
    <AbsoluteFill style={{ background: T.cream, padding: 80, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* the dial, whole, in the top-right corner */}
      <div style={{ position: "absolute", right: 64, top: 56, opacity: 0.75 }}><LiveDial size={340} angle={300} onCream halo={0.12} /></div>
      <div style={{ width: 96 * bar, height: 8, borderRadius: 4, background: T.accent }} />
      <div style={{ marginTop: "auto", marginBottom: "auto", fontFamily: DISPLAY, fontWeight: 700, fontSize: size, letterSpacing: "-0.035em", lineHeight: 1.06, color: T.ink, maxWidth: 900, textWrap: "balance" as never }}>
        {words.map((w, i) => <Word key={i} at={0.7 + i * step}>{w}{i < words.length - 1 ? " " : ""}</Word>)}
      </div>
      <Rise at={0.9 + words.length * step + 0.4} dy={16} style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 34, color: T.accent, marginBottom: 44, position: "relative" }}>{q.footer}</Rise>
      <Rise at={1.3 + words.length * step + 0.4} dy={16} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative" }}>
        <Brand size={36} onCream />
        <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 32, color: T.ink }}>{DATA.site}</span>
      </Rise>
    </AbsoluteFill>
  );
};

/** One word fading and rising in; inline so the line still wraps and balances as plain text would. */
const Word: React.FC<{ at: number; children: React.ReactNode }> = ({ at, children }) => {
  const p = useReveal(at, 0.6);
  return <span style={{ opacity: 0.08 + 0.92 * p, display: "inline-block", whiteSpace: "pre", transform: p < 1 ? `translateY(${((1 - p) * 14).toFixed(2)}px)` : undefined }}>{children}</span>;
};
