// Per-post fields the week manifest carries for auto-posting (build 5, og-content-system's import_rite.py):
//   title      a short headline for platforms that need one (YouTube title, TikTok title): the clip's hook from
//              clips/cohorts.json, the carousel's title from remotion/carousels.json, else the caption's first
//              sentence. The importer and the content engine only truncate it (TikTok 90, YouTube 100).
//   presenter  true when the asset is a presenter reel (Anna, the AI presenter, remotion/presenter.json): it's
//              flagged "made with AI" on TikTok and X, and YouTube needs the altered-content box ticked by hand.
// Pure (no file or network access) so it can be tested; upload-week.ts loads the data and calls it.

export type MetaData = {
  cohorts: { id: string; hook?: string }[];
  carousels: { id: string; title?: string }[];
  presenter: { id: string; interimOf?: string }[];
};

/** The caption's first sentence (or line), without URLs; "" for an empty caption. */
export function firstSentence(caption: string): string {
  const line = (caption ?? "").split("\n").map((l) => l.trim()).find((l) => l) ?? "";
  const m = /^(.+?[.?!])(\s|$)/.exec(line);
  return (m ? m[1] : line).replace(/\s*https?:\/\/\S+/g, "").trim();
}

export function postMeta(asset: string | null, caption: string, data: MetaData): { title: string; presenter: boolean } {
  // an interim reel (`interimOf`) is the same cut with Anna taken out: no AI presenter in it
  const presenter = !!asset && data.presenter.some((r) => r.id === asset && !r.interimOf);
  const hook = asset ? data.cohorts.find((c) => c.id === asset)?.hook : undefined;
  const carousel = asset ? data.carousels.find((c) => c.id === asset)?.title : undefined;
  const title = (hook || carousel || firstSentence(caption)).trim();
  return { title, presenter };
}
