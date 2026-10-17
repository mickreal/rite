// A 1080×1350 card placed on a 1080×1920 frame for TikTok / Reels (the calendar runs cohort and quote cards in the
// daily video slot). 10 s: eased fade in, a slow eased push-in (the "with motion" in launch-kit-v2 style 6), eased fade
// out. Timings are in content/timing.ts (CARD). The card is a composited layer (will-change) so the push-in scales one
// rasterised image smoothly instead of re-laying out text every frame, which made glyphs snap and shimmer.
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { T, Clock } from "./brand";
import { CohortCard } from "./CohortCard";
import { QuoteCard } from "./QuoteCard";
import { CARD } from "../../timing";

export type VerticalProps = { card: "CohortCard" | "QuoteCard"; id: string };
const inOut = Easing.bezier(0.65, 0, 0.35, 1);
const sine = Easing.inOut(Easing.sin);

export const VerticalCard: React.FC<VerticalProps> = ({ card, id }) => {
  const f = useCurrentFrame(); const { durationInFrames, fps } = useVideoConfig();
  const scale = interpolate(f, [0, durationInFrames - 1], [CARD.pushFrom, CARD.pushTo], { easing: inOut, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fin = interpolate(f, [0, CARD.fadeIn * fps], [0, 1], { easing: sine, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fout = interpolate(f, [durationInFrames - 1 - CARD.fadeOut * fps, durationInFrames - 1], [1, 0], { easing: sine, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const bg = card === "QuoteCard" ? T.cream : T.bg;
  return (
    <AbsoluteFill style={{ background: bg }}>
      <AbsoluteFill style={{ opacity: Math.min(fin, fout), transform: `scale(${scale.toFixed(5)})`, willChange: "transform" }}>
        <div style={{ position: "absolute", left: 0, top: (1920 - 1350) / 2, width: 1080, height: 1350, overflow: "hidden" }}>
          <Clock.Provider value={f / fps}>{card === "QuoteCard" ? <QuoteCard id={id} /> : <CohortCard id={id} />}</Clock.Provider>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
