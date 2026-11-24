/**
 * One of each screen of Paws, as the app draws it. The app's own `front()` and `back()` make them (shared/view.ts)
 * from a View written out by hand for each state, so nothing here can show what the app would not.
 *
 * Two things read them. shared/states.test.ts holds both displays to their fixed set of elements and to files that
 * are there. tools/show puts the states on the emulated bar one after another, whole screens with the clock, the
 * meters and the words: `go run -C tools/show . -states`.
 *
 * It runs under Node, as the tests do, which the app does not: so the imports are by file, and of types only
 * where they come from the app's shared code.
 */
import { KINDS, OPENINGS, back, front, type MomentName, type SceneName, type View } from "./view.ts";
import type { Element } from "./screen.ts";

export type State = {
  /** What tools/show calls it. */
  name: string;
  /** What it shows, in a few words. */
  title: string;
  /** The scene's file, the section of it that plays once first, and the moment over it: tools/show knows how long each is. */
  scene: SceneName;
  once: string;
  moment: MomentName | "";
  /** What the app sends as the state begins: one frame, or two where the scene begins with a section of its own. */
  frames: Element[][];
  /** What it sends when the moment is over. null: there is no moment. */
  after: Element[] | null;
};

const MINUTE = 60000;

/** An afternoon at home, half way through the day's goals: every state is this with something changed. */
const HOME: View = {
  mode: "home",
  need: "none",
  scene: "home",
  started: true,
  fromSleep: false,
  moment: null,
  time: "14:32",
  minutes: 25,
  peek: false,
  endsAt: 0,
  left: 0,
  meal: false,
  mealMinutes: 30,
  kind: 0,
  party: null,
  back: "",
  hi: 0,
  breaks: true,
  wakes: false,
  sleeps: "night",
  dayStart: "09:00",
  lunch: true,
  food: 3,
  water: 2,
  rest: 3,
  sinceBreak: 20,
  sessions: 2,
  sessionGoal: 4,
  glasses: 3,
  goal: 6,
  breaksTaken: 3,
  smokes: 0,
  long: false,
  // Monday met, Tuesday not, today Wednesday. Three weeks before it: last week all but its Tuesday.
  week: [2, 1, 3, 0, 0, -1, -1],
  past: [29, 31, 13],
  streak: 0,
  best: 7,
  dayMet: false,
  plan: null,
  hints: false,
};

const PLAN = ["4 focus", "6 water", "lunch 12:00"];
/** A morning with nothing done yet. */
const MORNING: Partial<View> = { sessions: 0, glasses: 0, breaksTaken: 0, lunch: null, food: 2, water: 3, plan: PLAN };
/** The evening of a day whose goals were met, the sixth in a row: three last week, and three this. */
const EVENING: Partial<View> = { time: "17:00", sessions: 4, glasses: 6, breaksTaken: 5, water: 3, week: [2, 2, 4, 0, 0, -1, -1], streak: 6 };
const moment = (name: MomentName): Pick<View, "moment"> => ({ moment: { name, turn: 1 } });

/** The states, with what runs in them ending so many minutes after `now`. */
export function states(now: number): State[] {
  const list: State[] = [];
  const add = (name: string, title: string, change: Partial<View>): void => {
    const v: View = { ...HOME, ...change };
    const frame = (w: View, started: boolean): Element[] => [...front({ ...w, started }), ...back(w)];
    const opening = OPENINGS[v.scene];
    list.push({
      name,
      title,
      scene: v.scene,
      once: opening ? (v.fromSleep && opening.fromSleep) || opening.once : "",
      moment: v.moment?.name ?? "",
      frames: opening ? [frame(v, false), frame(v, true)] : [frame(v, true)],
      after: v.moment ? frame({ ...v, moment: null }, true) : null,
    });
  };
  /** Something runs, with so many minutes left. */
  const running = (mode: View["mode"], scene: SceneName, left: number): Partial<View> => ({ mode, scene, left, endsAt: now + left * MINUTE });

  // At home, with nothing asked: the clock, the meters, and another idle loop every minute.
  add("home", "At home: the clock and the meters", {});
  for (const [scene, title] of [
    ["ears", "An ear twitches"], ["look", "Looking around"], ["purr", "Purring"], ["swish", "The tail swishes"], ["groom", "Grooming"],
    ["pounce", "A pounce onto the clock"], ["fly", "A fly"], ["wave", "A wave"], ["loaf", "A loaf"], ["peek", "Peek-a-boo"],
    ["reach", "A stretch and a yawn"], ["climb", "Up the wall"],
  ] as const) add(scene, `At home: ${title.toLowerCase()}`, { scene });
  add("hungry", "At home: lunch is soon", { scene: "hungry", time: "11:15", food: 1, lunch: null });
  add("dry", "At home: a glass is due soon", { scene: "dry", water: 1 });
  add("drowsy", "At home: a break is due soon", { scene: "drowsy", rest: 1, sinceBreak: 45 });
  add("clock", "At home: the day ends soon", { scene: "clock", time: "16:51" });
  add("wink", "At home: 11:11", { scene: "wink", time: "11:11", lunch: null, food: 1 });
  add("mug", "At home: the first cup", { scene: "mug", time: "09:08", ...MORNING });
  for (const [scene, title] of [
    ["santa", "December"], ["newyear", "the new year"], ["clover", "St. Patrick's Day"], ["sunhat", "midsummer"], ["crown", "Cat Day"], ["witch", "Halloween"],
  ] as const) add(scene, `At home: a hat for ${title}`, { scene, time: "10:04", lunch: null, food: 2 });
  add("plan", "At home in the morning: the day's plan on the back", { time: "09:05", ...MORNING });
  add("hints", "At home: what a hold does, on the back", { time: "14:33", hints: true });
  add("wheel", "The wheel at home: the next session's length", { peek: true, minutes: 30 });
  add("wake", "The first press of a morning", { time: "09:01", ...MORNING, ...moment("wake") });
  add("sip", "OK at home: a glass of water", { glasses: 4, water: 3, ...moment("sip") });
  add("lick", "A meal is eaten", { time: "12:35", ...moment("lick") });
  add("day-met", "The glass that completes the day's goals", { ...EVENING, time: "15:40", ...moment("sip"), dayMet: true });
  add("hi-again", "Paws wakes after days away", { scene: "back-again", time: "09:01", hi: 2, ...MORNING, ...moment("wake") });

  // What Paws asks for.
  add("lunch", "Lunch?", { need: "lunch", scene: "lunch", time: "12:05", food: 0, lunch: false });
  add("no-break", "Break?", { need: "break", scene: "no-break", rest: 0, sinceBreak: 61 });
  add("flat", "Break? after twice the time", { need: "break", scene: "flat", rest: 0, sinceBreak: 125 });
  add("thirsty", "Thirsty", { need: "water", scene: "thirsty", water: 0 });
  add("parched", "Thirsty, after twice the time", { need: "water", scene: "parched", water: 0 });
  add("day-done", "Day done, with the day and the week on the back", { need: "leave", scene: "wave", ...EVENING });
  add("friday", "The party at the end of a Friday", { need: "leave", scene: "party", party: "week", ...EVENING, week: [2, 2, 2, 2, 4, -1, -1], streak: 8, best: 8 });
  add("new-year", "The party on 31 December", { need: "leave", scene: "party", party: "year", ...EVENING });

  // Asleep.
  add("yawn", "Good night", { need: "sleep", scene: "asleep", ...EVENING, time: "17:01", ...moment("yawn") });
  add("asleep", "Asleep at night, with the day and the week on the back", { need: "sleep", scene: "asleep", ...EVENING, time: "23:10" });
  add("nightsip", "OK at night: a glass in bed", { need: "sleep", scene: "asleep", ...EVENING, time: "23:10", glasses: 7, ...moment("nightsip") });
  add("asleep-weekend", "Asleep on the weekend", { need: "sleep", scene: "asleep", sleeps: "weekend", time: "11:20", week: [2, 1, 2, 2, 1, -1, -1] });
  add("asleep-seven", "Asleep at night where weekends are working days", { need: "sleep", scene: "asleep", ...EVENING, time: "23:10", week: [2, 2, 4, 0, 0, 0, 0], past: [93, 127, 45] });
  add("asleep-first", "Asleep at night in the app's first week", { need: "sleep", scene: "asleep", ...EVENING, time: "23:10", week: [1, 1, 4, 0, 0, -1, -1], past: [], streak: 1, best: 1 });
  add("asleep-early", "Asleep before the day begins", { need: "sleep", scene: "asleep", sleeps: "early", time: "07:40", ...MORNING, plan: null });
  add("asleep-morning", "Asleep by day until a press: the plan on the back", { need: "sleep", scene: "asleep", wakes: true, time: "09:02", ...MORNING });
  add("asleep-day", "Asleep by day until a press, after noon", { need: "sleep", scene: "asleep", wakes: true, time: "13:30" });

  // A holiday.
  add("holiday", "On holiday, back within a week", { need: "holiday", scene: "holiday", back: "Mon", time: "17:20" });
  add("holiday-far", "On holiday, back later", { need: "holiday", scene: "holiday", back: "7 Dec", time: "17:20" });

  // A session.
  add("focus", "A session begins: the glasses go on", running("focus", "focus", 25));
  add("focus-wake", "A session begins while Paws sleeps", { ...running("focus", "focus", 25), fromSleep: true });
  add("look-away", "Twenty minutes into a session", { ...running("focus", "focus", 5), ...moment("lookaway") });
  add("session-done", "A session ends, and its break begins", { ...running("break", "break", 5), sessions: 3, ...moment("done") });
  add("goal-met", "The fourth session ends: the long break", { ...running("break", "break", 15), sessions: 4, long: true, ...moment("done") });
  add("day-met-session", "The session that completes the day's goals", { ...running("break", "break", 15), ...EVENING, time: "15:40", long: true, ...moment("done"), dayMet: true });

  // A break, of each kind, and the meal.
  KINDS.forEach((kind, i) => add(kind.scene, i === 0 ? "A break" : `A break: ${kind.title.toLowerCase()}`, { ...running("break", kind.scene, 5), kind: i, smokes: 1 }));
  add("eating", "Lunch", { ...running("break", "eating", 30), meal: true, time: "12:06" });

  // A call.
  add("meeting", "In a call", running("meeting", "meeting", 30));
  return list;
}
