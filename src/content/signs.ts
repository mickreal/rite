// Copy for the public /saturn-return/saturn-in/:sign pages. Everything dated on those pages is computed.
// Templates: `forWhom` may use {firstBorn} and {secondBorn}; `meta` may use {years}. The view fills them.
import type { Sign } from "../astro/saturn";

export interface SignCopy {
  opener: string;                // one sentence under the H1, specific to the sign
  about: string;
  questions: string;
  forWhom: string;               // template: {firstBorn}, {secondBorn}
  faq: Array<[string, string]>;  // exactly three
  meta: string;                  // template: {years}; ≤155 chars once filled
}

export const SIGN_PAGES: Record<Sign, SignCopy> = {
  Aries: {
    opener: "The return for people who start fast and are now being asked what they'll stay for.",
    about: "Aries is the sign of starting things, acting on your own and going first. Saturn there asks for the slower version of that: leadership that holds up over time, and independence you can actually support.",
    questions: "People in this return often describe questions about self-direction. Am I building my own thing or someone else's? What am I willing to be responsible for?",
    forWhom: "Born {firstBorn}? Saturn in Aries is your first return. Born {secondBorn}, it's your second.",
    faq: [
      ["I keep starting things and not finishing. Is that the Saturn return?", "It's the pattern Saturn in Aries puts under a light. Starting is the easy part for you; the return asks you to pick one thing and stay past the point where it stops being exciting. Nothing is wrong with you. The work is finishing."],
      ["Saturn dipped into Aries, went back out, then came back in. Which part counts?", "All of it. The dip matters most if you were born with Saturn early in Aries, because that's the stretch it crossed first. Enter your birth date and you'll see which passes are yours and which you can ignore."],
      ["I'm the one who always goes first and I'm tired of it. Is that this?", "Often, yes. Aries leads by instinct, and Saturn asks whether that leadership is a choice or a reflex. The grown-up version isn't going first less; it's knowing what you're leading toward and letting other people carry some of it."],
    ],
    meta: "Saturn return in Aries, {years}: the dates, who it's for by birth year, and what Saturn in Aries asks of you. Your exact passes free in ten seconds.",
  },
  Taurus: {
    opener: "The return for people who built something safe and now have to ask whether it's still good.",
    about: "Taurus is the sign of what lasts: money, land, the body, routine. Saturn there asks whether your security is real or just familiar, and what you'd keep if you had to choose.",
    questions: "People in this return often describe questions about worth. What am I holding onto because it's mine rather than because it's good? What would I build if I weren't afraid of losing what I have?",
    forWhom: "Born {firstBorn}? Saturn in Taurus is your first return. Born {secondBorn}, it's your second.",
    faq: [
      ["My life is stable. Why does it feel like it's sitting on the wrong foundations?", "Because Taurus is about what lasts, and Saturn there tests whether what you have is solid or just familiar. The return isn't telling you to blow it up. It's asking what you'd rebuild on purpose if you had to."],
      ["Is a Taurus return about money?", "Money is one place it shows up, because Taurus is the sign of what you own and what you're worth. But the return is a question, not a forecast: what do you value enough to work for slowly? Nothing on this page predicts your finances."],
      ["I hate change. Is Saturn in Taurus worse for me?", "Slower, not worse. Taurus sits tight, and Saturn rewards that when the thing you're sitting on is sound. The hard part is admitting when it isn't. It tends to feel like steady pressure to move, not a shove."],
    ],
    meta: "Saturn return in Taurus, {years}: the dates, who it's for by birth year, and what Saturn in Taurus asks of you. Your exact passes free in ten seconds.",
  },
  Gemini: {
    opener: "The return for people who can talk their way through anything and are being asked to say one true thing.",
    about: "Gemini is the sign of talking, learning and keeping options open. Saturn there asks for the disciplined version: saying one true thing and standing by it, and learning something properly instead of a little of everything.",
    questions: "People in this return often describe questions about commitment of attention. Which thread am I actually following? Where has cleverness stood in for depth?",
    forWhom: "Born {firstBorn}? Saturn in Gemini is your first return. Born {secondBorn}, it's your second.",
    faq: [
      ["I'm good at lots of things and committed to none. Is that what this is about?", "Yes. Gemini collects options the way other signs collect savings, and Saturn asks which one you'll actually follow. You don't have to drop the rest. You do have to pick the thread you'll still be pulling in five years."],
      ["Does Saturn in Gemini mean going back to school?", "Not as a rule. The return is about learning something properly, and for some people that's a course; for others it's finally reading the manual, or writing the thing instead of describing it. The form matters less than the depth."],
      ["I've gone quiet and I don't know why.", "Gemini runs on words, and Saturn tends to slow the stream. People in this return often say they're talking less and weighing more. That's usually the point: fewer things said, more of them true."],
    ],
    meta: "Saturn return in Gemini, {years}: the dates, who it's for by birth year, and what Saturn in Gemini asks of you. Your exact passes free in ten seconds.",
  },
  Cancer: {
    opener: "The return for people who hold the family together and are being asked who holds them.",
    about: "Cancer is the sign of home, family and who you look after. Saturn there asks what belonging costs and whether the home you have is the one you built on purpose.",
    questions: "People in this return often describe questions about care. Who am I responsible for, and who am I carrying out of habit? What does a home I chose look like?",
    forWhom: "Born {firstBorn}? Saturn in Cancer is your first return. Born {secondBorn}, it's your second.",
    faq: [
      ["Is this the return where you have to move home, or leave it?", "Neither is required. Saturn in Cancer doesn't tell you where to live; it asks whether the home you have is one you chose. Some people move, some stay and change the terms. The address matters less than the choosing."],
      ["I look after everyone. Why does that feel heavier now?", "Because Saturn in Cancer counts the cost of care, and for the first time you're feeling the bill. The return asks which of your responsibilities you took on and which you inherited, and what it would take for someone to look after you."],
      ["Does Saturn in Cancer mean something about my mother?", "It's an old association and worth a thought, but this page won't tell you what happens in your family. What the return does ask is what you learned about care growing up, and which parts you want to keep."],
    ],
    meta: "Saturn return in Cancer, {years}: the dates, who it's for by birth year, and what Saturn in Cancer asks of you. Your exact passes free in ten seconds.",
  },
  Leo: {
    opener: "The return for people who make things and are being asked whether they'd still make them with no one watching.",
    about: "Leo is the sign of being seen, making things and taking the stage. Saturn there asks for creative work that doesn't need applause, and a confidence that survives nobody clapping.",
    questions: "People in this return often describe questions about visibility. Am I performing or expressing? What would I make if no one was watching?",
    forWhom: "Born {firstBorn}? Saturn in Leo is your first return. Born {secondBorn}, it's your second.",
    faq: [
      ["I used to love being on stage and now I freeze. Is that the return?", "It's a common description of Saturn in Leo. The freeze usually isn't a loss of talent; it's the gap between being seen and being known becoming hard to ignore. The way through is making the thing anyway, smaller and truer, until the audience stops being the point."],
      ["Is Saturn in Leo bad for creative work?", "Demanding, not bad. Saturn doesn't take the work away; it takes away the cheap version. People in this return often make less for a while and keep more of it. What survives tends to be the work you'd do unpaid."],
      ["I'm not an attention-seeker. Does Saturn in Leo still apply?", "Yes. Leo is about expression, not just applause, and plenty of quiet people have Saturn here. The question is the same either way: what do you make, and who is it for? Hiding is as much a Leo answer as showing off."],
    ],
    meta: "Saturn return in Leo, {years}: the dates, who it's for by birth year, and what Saturn in Leo asks of you. Your exact passes free in ten seconds.",
  },
  Virgo: {
    opener: "The return for people who do things properly and are being asked to let something be finished.",
    about: "Virgo is the sign of craft, service and getting it right. Saturn there asks for useful competence, finished and shipped, rather than a standard so high nothing gets done.",
    questions: "People in this return often describe questions about usefulness. What am I good at that I keep refining instead of releasing? Who is my work actually for?",
    forWhom: "Born {firstBorn}? Saturn in Virgo is your first return. Born {secondBorn}, it's your second.",
    faq: [
      ["I can't stop fixing things that are already fine. Is that this?", "It's the Virgo failure mode, and Saturn makes it visible. The return doesn't lower your standard; it asks you to point it at something that matters and then stop. Good enough, shipped, beats perfect in a drawer."],
      ["Does Saturn in Virgo mean I should change jobs?", "This page can't tell you that, and the return doesn't predict it. What Saturn in Virgo asks is whether your work is useful to someone, and whether you can see that it is. Sometimes that's a new job; often it's the same job with the busywork cut out."],
      ["My standards are so high nothing gets released. Is Saturn making it worse?", "For a while, often yes. Saturn tightens before it loosens. The turn comes when you decide the job is to be useful, not flawless, and let the work go out with its small faults showing."],
    ],
    meta: "Saturn return in Virgo, {years}: the dates, who it's for by birth year, and what Saturn in Virgo asks of you. Your exact passes free in ten seconds.",
  },
  Libra: {
    opener: "The return for people who keep the peace and are being asked what it has cost them.",
    about: "Libra is the sign of partnership, fairness and keeping the peace. Saturn there asks for agreements that are actually fair, including the ones you've been avoiding because they'd cause a scene.",
    questions: "People in this return often describe questions about commitment. Which relationships are chosen and which are just unexamined? Where have I kept the peace at my own expense?",
    forWhom: "Born {firstBorn}? Saturn in Libra is your first return. Born {secondBorn}, it's your second.",
    faq: [
      ["Everyone says this is the marriage return. Is it?", "It's the commitment return, which is wider than marriage. Saturn in Libra asks whether the agreements you live by are fair and chosen, with partners, business, friends. It does not predict a wedding or a split."],
      ["I avoid conflict and I'm exhausted. Is that this?", "Yes, that's the Libra bargain coming due. Keeping the peace has a price, and Saturn makes you count it. The return asks you to say the uncomfortable thing once, clearly, and find out that the room survives."],
      ["I'm single. Does Saturn in Libra still have something for me?", "Plenty. Libra is about how you deal with other people, not whether you have a partner. The questions are the same: what do you owe, what are you owed, and where have you traded fairness for calm?"],
    ],
    meta: "Saturn return in Libra, {years}: the dates, who it's for by birth year, and what Saturn in Libra asks of you. Your exact passes free in ten seconds.",
  },
  Scorpio: {
    opener: "The return for people who keep their own counsel and are being asked to let someone in.",
    about: "Scorpio is the sign of depth, intimacy and what's shared. Saturn there asks for trust that survives being tested, and control you can put down.",
    questions: "People in this return often describe questions about trust. What am I guarding, and from whom? What would change if I stopped managing how much people see?",
    forWhom: "Born {firstBorn}? Saturn in Scorpio is your first return. Born {secondBorn}, it's your second.",
    faq: [
      ["I don't trust anyone with the real version of me. Is that what this is about?", "Largely, yes. Scorpio guards by default, and Saturn asks what the guarding costs. The return isn't about becoming an open book. It's about picking the people who've earned the real version and letting them have it."],
      ["Is this the return about sex, secrets and other people's money?", "Those are the old Scorpio keywords, and the return won't predict any of them. What it does ask about is what you share and what you hold back: intimacy, debt, loyalty, control. Where you keep the ledger, Saturn wants to look at it."],
      ["I need to control everything. Does Saturn make that worse?", "At first it can feel that way, because Saturn tightens before it loosens. The turn comes when you notice that control is costing you the closeness you actually want. Putting it down is the work, and it's slow."],
    ],
    meta: "Saturn return in Scorpio, {years}: the dates, who it's for by birth year, and what Saturn in Scorpio asks of you. Exact passes free in ten seconds.",
  },
  Sagittarius: {
    opener: "The return for people who always have a bigger plan and are being asked to pick one road.",
    about: "Sagittarius is the sign of meaning, distance and the big picture. Saturn there asks for a belief you've actually lived, and a direction you'll still be walking in ten years.",
    questions: "People in this return often describe questions about direction. What do I believe because I've tested it, and what did I just inherit? Where am I going, and is it mine?",
    forWhom: "Born {firstBorn}? Saturn in Sagittarius is your first return. Born {secondBorn}, it's your second.",
    faq: [
      ["I keep changing countries, jobs, beliefs. Is that the return?", "It's the pattern Saturn in Sagittarius points at. Moving on is how you stay free, and the return asks what you'd be if you stayed. Not forever, but long enough for something to grow."],
      ["Does Saturn in Sagittarius mean I should travel or study abroad?", "It doesn't tell you to do anything, and this page won't predict it. What the return asks is whether your sense of direction is yours or borrowed. Some people answer that on the other side of the world; some answer it at their kitchen table."],
      ["I've lost faith in the thing I used to believe. Is that this?", "Often, yes. Sagittarius runs on conviction, and Saturn tests it until only the lived part is left. That can feel like losing something. What usually comes back is smaller, slower and yours."],
    ],
    meta: "Saturn return in Sagittarius, {years}: dates, who it's for by birth year, what Saturn in Sagittarius asks of you. Exact passes free in ten seconds.",
  },
  Capricorn: {
    opener: "The return for people who already work hard and are being asked who they're working for.",
    about: "Capricorn is Saturn's own sign: ambition, structure and authority. Saturn at home asks for responsibility you chose, and a definition of success you wrote yourself.",
    questions: "People in this return often describe questions about authority. Whose approval am I still working for? What would I build if failure were allowed?",
    forWhom: "Born {firstBorn}? Saturn in Capricorn is your first return. Born {secondBorn}, it's your second.",
    faq: [
      ["Saturn rules Capricorn. Does that make my return easier or harder?", "Clearer, mostly. Saturn at home knows what it wants: structure, responsibility, work that holds. People with this return tend to understand the assignment early. The hard part is noticing that the ladder you're climbing might be someone else's."],
      ["I've hit every goal and I feel nothing. Is that the return?", "That's the classic Saturn in Capricorn moment. You did everything right by a definition of success you never wrote. The return asks you to write your own, and it usually looks less impressive and feels a lot better."],
      ["I'm not ambitious. Does Saturn in Capricorn still apply?", "Yes. Capricorn is about responsibility and authority, not just career. The return asks what you're willing to be answerable for, and whose rules you follow without noticing. That applies whether you run a company or a household."],
    ],
    meta: "Saturn return in Capricorn, {years}: dates, who it's for by birth year, and what Saturn in Capricorn asks of you. Exact passes free in ten seconds.",
  },
  Aquarius: {
    opener: "The return for people who stand apart and are being asked what they'd stand with.",
    about: "Aquarius is the sign of the group, the future and standing apart. Saturn there asks for belonging to something bigger without losing yourself, and ideas you'll do the slow work to realise.",
    questions: "People in this return often describe questions about belonging. Which communities am I actually part of? Where has being different become a way of not committing?",
    forWhom: "Born {firstBorn}? Saturn in Aquarius is your first return. Born {secondBorn}, it's your second.",
    faq: [
      ["I've always been the odd one out. Is this return about fitting in?", "No. It's about belonging without disappearing. Aquarius keeps its distance on principle, and Saturn asks whether the distance is still a principle or just a habit. The work is finding the group you'd show up for."],
      ["Does Saturn in Aquarius mean something about my friends?", "Friendship is where it often shows up, because Aquarius is the sign of the group. The return doesn't predict who stays or goes. It asks which friendships are real commitments and which are just proximity, and what you give to the ones that count."],
      ["I have big ideas and nothing built. Is that what Saturn is pointing at?", "Yes. Aquarius sees the future easily and Saturn asks for the boring middle part: the plan, the Tuesday, the version one. The return is where good ideas either get a foundation or stay ideas."],
    ],
    meta: "Saturn return in Aquarius, {years}: the dates, who it's for by birth year, and what Saturn in Aquarius asks of you. Exact passes free in ten seconds.",
  },
  Pisces: {
    opener: "The return for people who feel everything and are being asked where their edges are.",
    about: "Pisces is the sign of empathy, imagination and letting go. Saturn there asks for compassion with a spine: boundaries that let you stay open, and a practice that holds when the feeling fades.",
    questions: "People in this return often describe questions about boundaries. Where does my generosity become an escape? What structure would protect the things I care about most?",
    forWhom: "Born {firstBorn}? Saturn in Pisces is your first return. Born {secondBorn}, it's your second.",
    faq: [
      ["I give until there's nothing left. Is that what this return is about?", "Yes. Pisces gives by default, and Saturn asks where the edge is. The return isn't about caring less. It's about building the boundary that lets you keep caring without running dry."],
      ["I feel foggy and I can't make decisions. Is that Saturn?", "It's a common description of Saturn in Pisces. The fog usually isn't confusion; it's too many feelings and not enough structure. The return asks for a practice that holds when the feeling doesn't: a routine, a rule, a time of day that's yours."],
      ["Is Saturn in Pisces about escapism?", "Partly. Pisces knows how to leave the room without moving. The return asks you to notice where you go when it's hard, and whether that place is helping. It doesn't judge the exit; it asks you to come back."],
    ],
    meta: "Saturn return in Pisces, {years}: the dates, who it's for by birth year, and what Saturn in Pisces asks of you. Your exact passes free in ten seconds.",
  },
};
