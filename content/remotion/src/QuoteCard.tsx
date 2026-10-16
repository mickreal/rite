// Style 6: one line on the cream card, small Rite mark. Lines from sign openers and the launch kit.
import React from "react";
import { AbsoluteFill } from "remotion";
import { T, DISPLAY, TEXT, Brand, Dial } from "./brand";
import DATA from "../data/quotes.json";

export type QuoteProps = { id: string };

export const QuoteCard: React.FC<QuoteProps> = ({ id }) => {
  const q = DATA.quotes.find((x) => x.id === id) ?? DATA.quotes[0];
  const n = q.text.length;
  const size = n < 50 ? 112 : n < 90 ? 84 : 74;
  return (
    <AbsoluteFill style={{ background: T.cream, padding: 80, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ position: "absolute", right: -330, top: -330, opacity: 0.6 }}><Dial size={760} angle={300} onCream halo={0.1} /></div>
      <div style={{ width: 96, height: 8, borderRadius: 4, background: T.accent }} />
      <div style={{ marginTop: "auto", marginBottom: "auto", fontFamily: DISPLAY, fontWeight: 700, fontSize: size, letterSpacing: "-0.035em", lineHeight: 1.06, color: T.ink, maxWidth: 900, textWrap: "balance" as never }}>
        {q.text}
      </div>
      <div style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 34, color: T.accent, marginBottom: 44, position: "relative" }}>{q.footer}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative" }}>
        <Brand size={36} onCream />
        <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 32, color: T.ink }}>{DATA.site}</span>
      </div>
    </AbsoluteFill>
  );
};
