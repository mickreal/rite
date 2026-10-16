import type { Sign } from "../astro/saturn";

export const SIGN_NOTES: Record<Sign, { work: string; fails: string; matures: string; hook: string }> = {
  Aries: { work: "initiative", fails: "impulsiveness, or waiting for permission", matures: "starting things you also finish", hook: "Starting things you also finish." },
  Taurus: { work: "stability", fails: "stubbornness or hoarding", matures: "resources you can rely on without being owned by them", hook: "Resources you can rely on without being owned by them." },
  Gemini: { work: "communication", fails: "scatter, or cleverness without commitment", matures: "saying one true thing and standing by it", hook: "Saying one true thing and standing by it." },
  Cancer: { work: "belonging", fails: "over-caretaking, or hiding in the shell", matures: "a home you built on purpose", hook: "A home you built on purpose." },
  Leo: { work: "self-expression", fails: "performance, or fear of being seen", matures: "creative work that doesn't need applause", hook: "Creative work that doesn't need applause." },
  Virgo: { work: "craft", fails: "perfectionism or self-criticism", matures: "useful competence, done, shipped", hook: "Useful competence, done, shipped." },
  Libra: { work: "partnership", fails: "people-pleasing, or avoiding conflict", matures: "agreements that are actually fair", hook: "Agreements that are actually fair." },
  Scorpio: { work: "depth", fails: "control or secrecy", matures: "trust that survives being tested", hook: "Trust that survives being tested." },
  Sagittarius: { work: "meaning", fails: "restlessness or preaching", matures: "a belief you've actually lived", hook: "A belief you've actually lived." },
  Capricorn: { work: "authority", fails: "workaholism, or fear of failure", matures: "responsibility you chose", hook: "Responsibility you chose." },
  Aquarius: { work: "independence", fails: "detachment or contrarianism", matures: "belonging to something bigger without losing yourself", hook: "Belonging to something bigger without losing yourself." },
  Pisces: { work: "surrender", fails: "escape, or boundarylessness", matures: "compassion with a spine", hook: "Compassion with a spine." },
};

export const HOUSE_NOTES: Record<number, { area: string; short: string }> = {
  1: { area: "identity, body, how you show up", short: "how you show up" },
  2: { area: "money, possessions, self-worth", short: "money and worth" },
  3: { area: "communication, siblings, daily environment", short: "how you communicate" },
  4: { area: "home, family, roots", short: "home and family" },
  5: { area: "creativity, romance, children, play", short: "creativity and love" },
  6: { area: "work, health, routine, service", short: "work and routine" },
  7: { area: "partnership, marriage, contracts", short: "partnership" },
  8: { area: "shared resources, intimacy, debt, inheritance", short: "what you share" },
  9: { area: "belief, education, travel, publishing", short: "belief and learning" },
  10: { area: "career, reputation, public role", short: "career and reputation" },
  11: { area: "friends, community, long-term goals", short: "friends and goals" },
  12: { area: "solitude, the unconscious, endings, what you hide", short: "the inner life" },
};

export const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th"];
