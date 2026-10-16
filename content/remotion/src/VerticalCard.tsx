// A 1080×1350 card placed on a 1080×1920 frame for TikTok / Reels (the calendar runs cohort and quote cards in the
// daily video slot). 10 s: fade in, a slow push-in (the "with motion" in launch-kit-v2 style 6), fade out.
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { T } from "./brand";
import { CohortCard } from "./CohortCard";
import { QuoteCard } from "./QuoteCard";

export type VerticalProps = { card: "CohortCard" | "QuoteCard"; id: string };

export const VerticalCard: React.FC<VerticalProps> = ({ card, id }) => {
  const f = useCurrentFrame(); const { durationInFrames } = useVideoConfig();
  const scale = interpolate(f, [0, durationInFrames], [1, 1.04]);
  const opacity = interpolate(f, [0, 12, durationInFrames - 15, durationInFrames - 1], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const bg = card === "QuoteCard" ? T.cream : T.bg;
  return (
    <AbsoluteFill style={{ background: bg }}>
      <AbsoluteFill style={{ opacity, transform: `scale(${scale})` }}>
        <div style={{ position: "absolute", left: 0, top: (1920 - 1350) / 2, width: 1080, height: 1350, overflow: "hidden" }}>
          {card === "QuoteCard" ? <QuoteCard id={id} /> : <CohortCard id={id} />}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
