// Review aid (not used in posts): the dial Saturn going once round, before (ring turns with the orbit) and after
// (ring keeps the logo's tilt). Render: npx remotion render build DialPreview out.mp4
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { T, TEXT, Dial } from "./brand";

export const DialPreview: React.FC = () => {
  const f = useCurrentFrame(); const { durationInFrames } = useVideoConfig();
  const angle = (360 * f) / (durationInFrames - 1);
  const col = (label: string, upright: boolean) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 30 }}>
      <Dial size={820} angle={angle} upright={upright} />
      <span style={{ fontFamily: TEXT, fontSize: 44, color: T.cream }}>{label}</span>
    </div>
  );
  return (
    <AbsoluteFill style={{ background: T.bg, flexDirection: "row", alignItems: "center", justifyContent: "space-evenly" }}>
      {col("Before", false)}{col("After", true)}
    </AbsoluteFill>
  );
};
