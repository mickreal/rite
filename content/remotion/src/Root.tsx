import React from "react";
import { Composition, Still } from "remotion";
import { SignCard, SignCardVertical, type SignProps } from "./SignCard";
import { CohortCard, type CohortProps } from "./CohortCard";
import { QuoteCard, type QuoteProps } from "./QuoteCard";
import { CarouselSlide, type CarouselProps } from "./CarouselSlide";
import { VerticalCard, type VerticalProps } from "./VerticalCard";
import { CARD } from "../../timing";

// Props pick a row from data/*.json (built by scripts/build-data.ts): --props='{"sign":"Taurus"}', '{"id":"taurus-2028"}'.
export const Root: React.FC = () => (
  <>
    <Still id="SignCard" component={SignCard as React.FC<SignProps>} width={1080} height={1350} defaultProps={{ sign: "Aries" }} />
    <Composition id="SignCardVertical" component={SignCardVertical as React.FC<SignProps>} width={1080} height={1920} fps={30} durationInFrames={240} defaultProps={{ sign: "Aries" }} />
    <Still id="CohortCard" component={CohortCard as React.FC<CohortProps>} width={1080} height={1350} defaultProps={{ id: "aries-1997-three-pass" }} />
    <Still id="QuoteCard" component={QuoteCard as React.FC<QuoteProps>} width={1080} height={1350} defaultProps={{ id: "aries-opener" }} />
    <Still id="CarouselSlide" component={CarouselSlide as React.FC<CarouselProps>} width={1080} height={1350} defaultProps={{ id: "carousel-1-what-it-is", n: 1 }} />
    <Composition id="VerticalCard" component={VerticalCard as React.FC<VerticalProps>} width={1080} height={1920} fps={30} durationInFrames={CARD.seconds * 30} defaultProps={{ card: "CohortCard", id: "aries-first-return" }} />
  </>
);
