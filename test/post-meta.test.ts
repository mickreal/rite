import { describe, it, expect } from "vitest";
import { firstSentence, postMeta, type MetaData } from "../content/scripts/post-meta";
import cohorts from "../content/clips/cohorts.json";
import carousels from "../content/remotion/carousels.json";
import presenter from "../content/remotion/presenter.json";

const data: MetaData = { cohorts: cohorts.cohorts, carousels: carousels.carousels, presenter: presenter.reels };

describe("week manifest post meta (title, presenter)", () => {
  it("a dial clip's title is its cohort hook, and it has no presenter", () => {
    const m = postMeta("aries-three-pass-1997", "Some caption. Free preview at rite.report", data);
    expect(m.title).toBe("Born in spring 1997? You don't get one Saturn return. You get three dates.");
    expect(m.presenter).toBe(false);
  });

  it("an Anna reel is flagged presenter", () => {
    expect(data.presenter.some((r) => r.id === "script-6")).toBe(true);
    const m = postMeta("script-6", "Your Saturn return is not a birthday. It's a season.", data);
    expect(m.presenter).toBe(true);
    expect(m.title).toBe("Your Saturn return is not a birthday.");
  });

  it("a carousel's title comes from carousels.json", () => {
    expect(postMeta("carousel-1-what-it-is", "x", data).title).toBe("What a Saturn return actually is");
  });

  it("anything else falls back to the caption's first sentence, without URLs", () => {
    expect(postMeta("quote-taurus-sign-line-vertical", "Taurus is the sign of what lasts. Saturn there asks.", data).title)
      .toBe("Taurus is the sign of what lasts.");
    expect(postMeta(null, "Born in 1969? Your second return is open now.", data)).toEqual({ title: "Born in 1969?", presenter: false });
    expect(firstSentence("See https://rite.report now")).toBe("See now");
    expect(firstSentence("")).toBe("");
  });
});
