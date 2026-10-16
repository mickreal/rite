// Copy for the public /saturn-return/saturn-in/:sign pages. Everything dated on those pages is computed.
import type { Sign } from "../astro/saturn";

export const SIGN_PAGES: Record<Sign, { about: string; questions: string }> = {
  Aries: {
    about: "Aries is the sign of starting things, acting on your own and going first. Saturn there asks for the slower version of that: leadership that holds up over time, and independence you can actually support.",
    questions: "People in this return often describe questions about self-direction. Am I building my own thing or someone else's? What am I willing to be responsible for?",
  },
  Taurus: {
    about: "Taurus is the sign of what lasts: money, land, the body, routine. Saturn there asks whether your security is real or just familiar, and what you'd keep if you had to choose.",
    questions: "People in this return often describe questions about worth. What am I holding onto because it's mine rather than because it's good? What would I build if I weren't afraid of losing what I have?",
  },
  Gemini: {
    about: "Gemini is the sign of talking, learning and keeping options open. Saturn there asks for the disciplined version: saying one true thing and standing by it, and learning something properly instead of a little of everything.",
    questions: "People in this return often describe questions about commitment of attention. Which thread am I actually following? Where has cleverness stood in for depth?",
  },
  Cancer: {
    about: "Cancer is the sign of home, family and who you look after. Saturn there asks what belonging costs and whether the home you have is the one you built on purpose.",
    questions: "People in this return often describe questions about care. Who am I responsible for, and who am I carrying out of habit? What does a home I chose look like?",
  },
  Leo: {
    about: "Leo is the sign of being seen, making things and taking the stage. Saturn there asks for creative work that doesn't need applause, and a confidence that survives nobody clapping.",
    questions: "People in this return often describe questions about visibility. Am I performing or expressing? What would I make if no one was watching?",
  },
  Virgo: {
    about: "Virgo is the sign of craft, service and getting it right. Saturn there asks for useful competence, finished and shipped, rather than a standard so high nothing gets done.",
    questions: "People in this return often describe questions about usefulness. What am I good at that I keep refining instead of releasing? Who is my work actually for?",
  },
  Libra: {
    about: "Libra is the sign of partnership, fairness and keeping the peace. Saturn there asks for agreements that are actually fair, including the ones you've been avoiding because they'd cause a scene.",
    questions: "People in this return often describe questions about commitment. Which relationships are chosen and which are just unexamined? Where have I kept the peace at my own expense?",
  },
  Scorpio: {
    about: "Scorpio is the sign of depth, intimacy and what's shared. Saturn there asks for trust that survives being tested, and control you can put down.",
    questions: "People in this return often describe questions about trust. What am I guarding, and from whom? What would change if I stopped managing how much people see?",
  },
  Sagittarius: {
    about: "Sagittarius is the sign of meaning, distance and the big picture. Saturn there asks for a belief you've actually lived, and a direction you'll still be walking in ten years.",
    questions: "People in this return often describe questions about direction. What do I believe because I've tested it, and what did I just inherit? Where am I going, and is it mine?",
  },
  Capricorn: {
    about: "Capricorn is Saturn's own sign: ambition, structure and authority. Saturn at home asks for responsibility you chose, and a definition of success you wrote yourself.",
    questions: "People in this return often describe questions about authority. Whose approval am I still working for? What would I build if failure were allowed?",
  },
  Aquarius: {
    about: "Aquarius is the sign of the group, the future and standing apart. Saturn there asks for belonging to something bigger without losing yourself, and ideas you'll do the slow work to realise.",
    questions: "People in this return often describe questions about belonging. Which communities am I actually part of? Where has being different become a way of not committing?",
  },
  Pisces: {
    about: "Pisces is the sign of empathy, imagination and letting go. Saturn there asks for compassion with a spine: boundaries that let you stay open, and a practice that holds when the feeling fades.",
    questions: "People in this return often describe questions about boundaries. Where does my generosity become an escape? What structure would protect the things I care about most?",
  },
};
