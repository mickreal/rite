import React from "react";
import { Composition, Still } from "remotion";
import { SignCard, SignCardVertical, SignHookVertical, type SignProps, type SignHookProps } from "./SignCard";
import { CohortCard, type CohortProps } from "./CohortCard";
import { QuoteCard, type QuoteProps } from "./QuoteCard";
import { CarouselSlide, type CarouselProps } from "./CarouselSlide";
import { VerticalCard, type VerticalProps } from "./VerticalCard";
import { DialPreview } from "./DialPreview";
import { PresenterReel, reelSeconds, type PresenterProps } from "./PresenterReel";
import { CARD } from "../../timing";

// Props pick a row from data/*.json (built by scripts/build-data.ts): --props='{"sign":"Taurus"}', '{"id":"taurus-2028"}'.
export const Root: React.FC = () => (
  <>
    <Still id="SignCard" component={SignCard as React.FC<SignProps>} width={1080} height={1350} defaultProps={{ sign: "Aries" }} />
    <Composition id="SignCardVertical" component={SignCardVertical as React.FC<SignProps>} width={1080} height={1920} fps={30} durationInFrames={CARD.seconds * 30} defaultProps={{ sign: "Aries" }}
      calculateMetadata={({ props }) => ({ durationInFrames: Math.round(((props as SignProps).seconds ?? CARD.seconds) * 30) })} />
    <Composition id="SignHookVertical" component={SignHookVertical as React.FC<SignHookProps>} width={1080} height={1920} fps={30} durationInFrames={CARD.seconds * 30} defaultProps={{ sign: "Taurus", born: "Mar 1999 – Aug 2000", sub: "Your Saturn return opens April 2028." }}
      calculateMetadata={({ props }) => ({ durationInFrames: Math.round(((props as SignHookProps).seconds ?? CARD.seconds) * 30) })} />
    <Still id="CohortCard" component={CohortCard as React.FC<CohortProps>} width={1080} height={1350} defaultProps={{ id: "aries-1997-three-pass" }} />
    <Still id="QuoteCard" component={QuoteCard as React.FC<QuoteProps>} width={1080} height={1350} defaultProps={{ id: "aries-opener" }} />
    <Still id="CarouselSlide" component={CarouselSlide as React.FC<CarouselProps>} width={1080} height={1350} defaultProps={{ id: "carousel-1-what-it-is", n: 1 }} />
    <Composition id="VerticalCard" component={VerticalCard as React.FC<VerticalProps>} width={1080} height={1920} fps={30} durationInFrames={CARD.seconds * 30} defaultProps={{ card: "CohortCard", id: "aries-first-return" }}
      calculateMetadata={({ props }) => ({ durationInFrames: Math.round(((props as VerticalProps).seconds ?? CARD.seconds) * 30) })} />
    <Composition id="PresenterReel" component={PresenterReel as React.FC<PresenterProps>} width={1080} height={1920} fps={30} durationInFrames={30 * 30} defaultProps={{ id: "script-6", base: "http://127.0.0.1:8873" }}
      calculateMetadata={({ props }) => ({ durationInFrames: Math.round(reelSeconds((props as PresenterProps).id) * 30) })} />
    <Composition id="DialPreview" component={DialPreview} width={1920} height={1080} fps={30} durationInFrames={240} />
  </>
);
