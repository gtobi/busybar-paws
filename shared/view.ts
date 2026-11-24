/**
 * The two displays: what each shows for a state of the app. Nothing here touches the bar or the clock. `front()` and
 * `back()` turn a View, the state as the app has worked it out, into the elements to draw, so the same code draws
 * the app's screens and the previews of them (shared/states.ts, tools/show).
 *
 * It lies here and not beside main.ts because the build makes a script of its own of every file in src/, and the
 * package is to be one script, main.js, as the firmware starts it.
 */
import type { Idle, Need, Party } from "@shared/day";
import type { Element } from "@shared/screen";

export const WHITE = "#FFFFFFFF";
const GRAY = "#8A8F9CFF";
/** The clock while Paws sleeps. */
const DIM = "#3A3A3AFF";
/** Draws nothing: for a slot that is not in use. */
const CLEAR = "#00000000";

/** The right edge of the front display: where every message ends. */
const EDGE = 71;
/**
 * Where the home clock begins. Its digits are 7 px wide but for the 1, which is 5, so a time is 22 to 30 px. It
 * keeps its left edge, so that its first digit always stands in the same place (Paws jumps on it), and from here
 * the widest time ends against the meters, which begin at column 55.
 */
const CLOCK_X = 24;

export type Mode = "home" | "focus" | "break" | "meeting";

/**
 * What Paws does on the left 30 columns: an animation the firmware plays by itself, 25 frames a second, from
 * src/animations/<scene>.anim (drawn and encoded by tools/art). At home it is one of the idle loops, another every
 * minute (`idleAt` in shared/day.ts).
 *
 * The app sends a scene when its state begins and then leaves it alone. What asks for attention (the paw on the
 * bowl, the sweat drop) is the beginning of a loop a minute long, so it comes round once a minute with no timer here.
 */
export type SceneName =
  | Idle
  | "asleep" | "party" | "lunch" | "no-break" | "flat" | "thirsty" | "parched" | "holiday" | "back-again"
  | "focus" | "eating" | "meeting"
  | "break" | "reading" | "yoga" | "coffee" | "stretch" | "walk" | "workout" | "smoke";

/**
 * A scene's name is its file's. These four begin with a section that plays once; the rest are one loop, "default".
 * Focus has a second way in, from sleep: out of the bed, a yawn and a stretch, and only then the glasses.
 */
export const OPENINGS: Partial<Record<SceneName, { once: string; fromSleep?: string; loop: string }>> = {
  focus: { once: "intro", fromSleep: "wake", loop: "work" },
  eating: { once: "start", loop: "eat" },
  walk: { once: "leave", loop: "away" },
  meeting: { once: "on", loop: "call" },
};

/**
 * The kinds of break the wheel turns through while one runs: what Paws does, the word for the front display (five
 * letters fit beside the minutes) and the title for the back. The time is the same for all; the meal is not one.
 */
export const KINDS: readonly { scene: SceneName; word: string; title: string }[] = [
  { scene: "break", word: "Break", title: "Break" },
  { scene: "reading", word: "Read", title: "Reading" },
  { scene: "yoga", word: "Yoga", title: "Yoga" },
  { scene: "coffee", word: "Cup", title: "Coffee" },
  { scene: "stretch", word: "Move", title: "Stretch" },
  { scene: "walk", word: "Walk", title: "A walk" },
  { scene: "workout", word: "Gym", title: "Workout" },
  // The last, and only where the settings ask for it: a cough and a count, nothing lasting.
  { scene: "smoke", word: "Puff", title: "Smoke" },
];

/**
 * What plays once, as an answer to a press or at a turn of the day, and how many seconds it lasts: Paws drinks, licks
 * its lips after a meal, is done with a session, wakes, yawns before it sleeps, looks away from its screen. A moment is not a scene. It is laid
 * over the scene for its seconds, and the bar takes it away by itself (`timeout`, whole seconds only), so the app
 * needs no timer for it; the scene goes on underneath. Its frames are filled, so that the scene does not show through.
 */
export const MOMENTS = { sip: 2, nightsip: 4, lick: 2, done: 3, wake: 3, yawn: 3, lookaway: 20 } as const;
export type MomentName = keyof typeof MOMENTS;

export type View = {
  mode: Mode;
  need: Need;
  scene: SceneName;
  /** The scene's `once` section has been sent: what is sent now is its loop. */
  started: boolean;
  /** The scene before this one was sleep: a scene with a way in from sleep takes it. */
  fromSleep: boolean;
  /** The moment that is playing, and how many moments have played. */
  moment: { name: MomentName; turn: number } | null;
  /** "14:32". */
  time: string;
  /** The length of the next session, minutes. */
  minutes: number;
  /** The wheel has just changed that length: the front display shows it for a moment. */
  peek: boolean;
  /** When the running session or break ends, bar clock, ms. */
  endsAt: number;
  /** Whole minutes left of it, rounded up: 25 at the start, 1 through the last minute. */
  left: number;
  /** The running break is the meal. */
  meal: boolean;
  mealMinutes: number;
  /** The kind of break: its place in KINDS. */
  kind: number;
  /** The day is done on a Friday or on 31 December: a party for a minute before Paws sleeps, and what it is for. */
  party: Party | null;
  /** On holiday: the day of return, "Mon" or "7 Dec". Else empty. */
  back: string;
  /** Paws has woken after this many days with nobody there, and says so for a minute. 0: it has not. */
  hi: number;
  /** Lunch was eaten today. null: it is not a topic, because Paws does not ask for it or it is not lunch time yet. */
  lunch: boolean | null;
  /** There are breaks: a session ends in one. */
  breaks: boolean;
  /** Paws is asleep by day: the next press wakes it and does nothing else. */
  wakes: boolean;
  /** Why Paws sleeps where a press does not wake it: the weekend, the hours before the day begins, the night. */
  sleeps: "weekend" | "early" | "night";
  /** "09:00": when the working day begins. */
  dayStart: string;
  /** 0 … 3. */
  food: number;
  water: number;
  rest: number;
  /** Whole minutes since the last break. */
  sinceBreak: number;
  /** Today's counts, and the day's goals: glasses, and sessions (0: none). */
  sessions: number;
  sessionGoal: number;
  glasses: number;
  goal: number;
  /** The break that runs is the long one, after every fourth session. */
  long: boolean;
  /**
   * The week, a picture for each day from Monday: 0 to come, 1 gone by with its goals not met, 2 met, 3 and 4 the
   * same for today. -1: the day is not shown (the weekend, where weekends are off).
   */
  week: number[];
  /** The weeks before this one, the nearest first: for each, a bit for every day whose goals were met, Monday the lowest. */
  past: number[];
  /** Days in a row whose goals were met, today among them once it is, and the longest such row so far. */
  streak: number;
  best: number;
  /** The moment that plays is the count that completed the day's goals: it says so. */
  dayMet: boolean;
  /** The day's plan, while nothing of it is done and it is not lunch time yet: "4 focus", "6 water", "lunch 12:00". */
  plan: string[] | null;
  /** This minute the back display says what a hold does, in place of what a press does. */
  hints: boolean;
  breaksTaken: number;
  smokes: number;
};

/**
 * Both displays are a fixed set of elements, the same ids in every state: a scene, a few texts, the meters. A state
 * that has no use for one sends it empty or unseen. So a change of state is one request that redraws what differs,
 * and nothing is ever cleared: the bar goes from one screen to the next in one step, with no empty moment between.
 */

/** A scene with a `once` section is sent twice: that section, then the loop, which waits for it to end. */
function play(id: string, v: View, suffix: string, extra: Record<string, unknown>): Element {
  const opening = OPENINGS[v.scene];
  const looping = v.started || !opening;
  const section = !opening ? "default" : looping ? opening.loop : (v.fromSleep && opening.fromSleep) || opening.once;
  return { id, type: "animation", path: `animations/${v.scene}${suffix}.anim`, section, loop: looping, await_previous_end: looping && !!opening, ...extra };
}

/**
 * The moment over the scene, or its slot unseen. The bar takes a moment away when its seconds are over, and the app
 * does not hear of it: sent again as it was, the same moment would count as still shown and not be sent. The turn
 * moves it one layer up or down, which makes it another element to send and changes nothing to the eye.
 */
function over(id: string, v: View, suffix: string, extra: Record<string, unknown>): Element {
  const m = v.moment;
  // Unseen, the slot holds a file that is never a moment. A moment is then always another file, and the bar begins
  // another file at its first frame; the same file made visible again would stand at its last.
  if (!m) return { id, type: "animation", path: `animations/break${suffix}.anim`, section: "default", loop: false, opacity: 0, z_index: 2, ...extra };
  return { id, type: "animation", path: `animations/${m.name}${suffix}.anim`, section: "default", loop: false, opacity: 100, timeout: MOMENTS[m.name], z_index: 2 + (m.turn % 2), ...extra };
}

/**
 * The front display, 72x16, faces the room: Paws on the left, one message on the right. At home that is the clock
 * and the three meters; when Paws needs something, a question and the control that answers it; asleep, the clock
 * alone; in a session or a break, the minutes left, the largest thing on the screen.
 *
 * Every message ends at the right edge, the one thing all states share, so the left third is always Paws' own.
 */
export function front(v: View): Element[] {
  // Layers: the scene, a moment over it, and the words over both: a moment covers the scene's 30 columns, and a
  // prompt's words begin at column 22.
  const text = (id: string, value: string, font: string, color: string, x: number, y: number, align = "top_left"): Element => ({ id, type: "text", text: value, font, color, x, y, align, z_index: 4 });
  // The small font's capitals are 5 px tall and start 2 px under y: two lines of it are rows 2 to 6 and 9 to 13.
  // Two lines that end at the right edge. The longest, "Press Start", is 40 px and begins at column 32, right of
  // the bowl and the confetti.
  const lines = (first: string, second: string): Element[] => [text("l1", first, "small", WHITE, EDGE, 0, "top_right"), text("l2", second, "small", GRAY, EDGE, 7, "top_right")];
  // The minutes' unit and what runs: these begin beside the number, which they belong to, and end at the edge too.
  const unit = (what: string): Element[] => [text("l1", "min", "small", WHITE, 50, 0), text("l2", what, "small", GRAY, 50, 7)];
  let big = text("big", "", "large", WHITE, CLOCK_X, 1);
  let words = lines("", "");
  // A moment at home has the screen for its seconds: it reaches to column 29, where the clock would stand, so two
  // words about it stand in for the clock and the meters.
  // Paws can be woken late: a bar left on overnight, and the first press after noon. The time is "HH:MM".
  // A glass is counted against the day's goal, and past it, by itself.
  const drunk = v.glasses <= v.goal ? `${v.glasses} of ${v.goal}` : `${v.glasses} today`;
  // A session too, where there is a goal for them; the one that reaches it says so.
  const done: [string, string] = v.sessionGoal === 0 ? ["Session", "done"] : v.sessions === v.sessionGoal ? ["Goal met", `${v.sessions} of ${v.sessionGoal}`] : ["Session", v.sessions < v.sessionGoal ? `${v.sessions} of ${v.sessionGoal}` : `${v.sessions} today`];
  const said: Record<MomentName, [string, string]> = { sip: ["Water", drunk], nightsip: ["Water", drunk], lick: ["Lunch", "eaten"], done, wake: v.hi > 0 ? ["Hi again", `${v.hi} days off`] : v.time < "12:00" ? ["Good", "morning"] : ["Hello", "again"], yawn: ["Good", "night"], lookaway: ["Look away", "20 sec"] };
  // The glass, the meal or the session that completes the day's goals is answered with that, and with the streak
  // it makes, in place of its own words.
  const crowned = v.dayMet && v.moment !== null && (v.moment.name === "sip" || v.moment.name === "lick" || v.moment.name === "done");
  if (crowned) said[v.moment!.name] = ["Goals met", v.streak >= 2 ? `${v.streak} in a row` : "today"];
  const telling = v.mode === "home" && v.need !== "sleep" && v.need !== "holiday" && v.moment !== null;
  const meters = v.mode === "home" && v.need === "none" && !v.peek && !telling && v.hi === 0;
  // The extra large digits are 10 px tall. From 100 minutes on there are three, and the bold font's fit.
  const minutes = (n: number): Element => (n < 100 ? text("big", String(n), "extra_large", WHITE, 48, 0, "top_right") : text("big", String(n), "bold", WHITE, 48, 2, "top_right"));
  // Some moments have something to say while something runs, and say it in place of the minutes: the session that
  // is done, where sessions have a goal, the look away from the screen, and the count that completes the day.
  const tells = v.mode !== "home" && v.moment !== null && (v.moment.name === "lookaway" || (v.moment.name === "done" && v.sessionGoal > 0) || crowned);
  if (tells) {
    words = lines(...said[v.moment!.name]);
  } else if (v.mode !== "home") {
    big = minutes(v.left);
    words = unit(v.mode === "focus" ? "Focus" : v.mode === "meeting" ? "Call" : v.meal ? "Lunch" : KINDS[v.kind]!.word);
  } else if (v.party) {
    words = v.party === "year" ? lines("Cheers!", "Year done") : lines("Friday!", "Week done");
  } else if (v.need === "holiday") {
    // For the room: where its owner is, and until when.
    words = lines("On holiday", `Back ${v.back}`);
  } else if (telling) {
    words = lines(...said[v.moment!.name]);
  } else if (v.hi > 0) {
    words = lines("Hi again", `${v.hi} days off`);
  } else if (v.peek) {
    // What Start would begin, as a session shows it.
    big = minutes(v.minutes);
    words = unit("Focus");
  } else if (v.need === "sleep") {
    big = text("big", v.time, "large", DIM, EDGE, 1, "top_right");
  } else if (v.need === "leave") {
    words = lines("Day done", "Press OK");
  } else if (v.need === "lunch") {
    words = lines("Lunch?", "Press Start");
  } else if (v.need === "break") {
    words = lines("Break?", "Press Start");
  } else if (v.need === "water") {
    words = lines("Thirsty", "Press OK");
  } else {
    // The large font's capitals are 9 px tall and start 2 px under y: rows 3 to 11.
    big = text("big", v.time, "large", WHITE, CLOCK_X, 1);
  }
  // A meter is one picture for each level: its icon and three segments, lit from the left.
  const meter = (id: string, level: number, y: number): Element => ({ id: `m_${id}`, type: "image", path: `images/meter_${id}_${meters ? level : 0}.png`, x: 55, y, opacity: meters ? 100 : 0, z_index: 1 });
  // One idle loop reaches into the clock: Paws jumps on its first digit. That scene lies over the clock while the
  // clock shows, and under everything as always when it does not.
  const scene = play("scene", v, "", { x: 0, y: 0, z_index: v.scene === "pounce" && meters ? 5 : 1 });
  return [scene, over("moment", v, "", { x: 0, y: 0 }), big, ...words, meter("food", v.food, 1), meter("water", v.water, 6), meter("rest", v.rest, 11)];
}

/**
 * The back display, 160x80 in gray, faces the person at the desk. Paws is there too, the same scene three times
 * the size; beside it the state: the meters by name at home, the time left in a session or a break. Below, the
 * day's counts and what each control does now. The firmware's status bar takes the right 12 px.
 */
export function back(v: View): Element[] {
  const text = (id: string, value: string, font: string, x: number, y: number, align = "top_mid"): Element => ({ id, type: "text", text: value, font, x, y, align, display: "back" });
  const session = v.mode !== "home";
  const meters = v.mode === "home" && v.need === "none";
  const asking = v.need === "leave" || v.need === "lunch" || v.need === "break" || v.need === "water";
  // Asleep where a press does not wake it: at night, on a weekend, before the day begins.
  const night = v.need === "sleep" && !v.wakes;
  // Wherever the day is over or has not begun, the column is a small calendar: the streak, the weeks before this
  // one, a row each, and this week under them. What the day was stands in the line below.
  const dots = v.mode === "home" && (v.need === "leave" || night);
  // Asleep by day, before the first press of a morning: the column is the day's plan.
  const waiting = v.need === "sleep" && v.wakes;
  const plan = v.mode === "home" ? v.plan : null;
  const looks = v.mode === "focus" && v.moment?.name === "lookaway";
  const title =
    v.mode === "focus" ? (looks ? "Look away" : "Focus")
    : v.mode === "meeting" ? "In a call"
    : v.mode === "break" ? (v.meal ? "Lunch" : KINDS[v.kind]!.title)
    : v.party ? (v.party === "year" ? "Cheers!" : "Friday!")
    : v.need === "holiday" ? "Holiday"
    : v.hi > 0 ? "Hi again"
    : v.need === "sleep" ? "Asleep"
    : v.need === "leave" ? "Day done"
    : v.need === "lunch" ? "Lunch?"
    : v.need === "break" ? "Break?"
    : v.need === "water" ? "Thirsty"
    : "Paws";

  // The column right of the scene, columns 96 to 147: the three meters at home, the streak over the calendar when
  // the day is over, one line of detail otherwise.
  const names = ["food", "water", "rest"];
  const levels = [v.food, v.water, v.rest];
  const counts = [v.sessionGoal > 0 ? `${v.sessions}/${v.sessionGoal} focus` : `${v.sessions} focus`, `${v.glasses}/${v.goal} water`, `${v.breaksTaken} ${v.breaksTaken === 1 ? "break" : "breaks"}`];
  const detail = session ? "min left" : v.need === "holiday" ? `back ${v.back}` : v.need === "break" ? `${v.sinceBreak} min` : "";
  // The streak is worth a line from two days on; without one, the longest there was.
  const row = v.streak >= 2 ? `${v.streak} in a row` : v.best >= 2 ? `best: ${v.best}` : "";
  const column: Element[] = [];
  for (let i = 0; i < 3; i++) {
    column.push(
      meters ? text(`b_l${i}`, names[i]!, "small", 97, 18 + 11 * i, "top_left")
      : dots ? text(`b_l${i}`, i === 0 ? row : "", "small", 122, 13)
      : waiting && plan ? text(`b_l${i}`, plan[i] ?? "", "small", 122, 18 + 11 * i)
      : text(`b_l${i}`, i === 0 ? detail : "", "small", 122, session ? 32 : 20),
    );
    column.push({ id: `b_b${i}`, type: "image", path: `images/bar_${meters ? levels[i] : 0}.png`, x: 124, y: 19 + 11 * i, opacity: meters ? 100 : 0, display: "back" });
  }

  // What each control does now. Where a control does nothing, it is not named.
  let day = plan ? `plan: ${plan.join(", ")}` : `today: ${counts.join(", ")}`;
  let keys = ["", "BACK leave"];
  // A smoke break is counted when it ends, if it counts as a break: this one would be the next.
  if (v.mode === "break" && !v.meal && KINDS[v.kind]!.scene === "smoke") day = `number ${v.smokes + 1} today`;
  else if (v.long) day = `a long break: ${v.sessions} sessions done`;
  if (looks) day = "look at something far away";
  if (v.mode === "meeting") {
    day = "nothing is asked in a call";
    keys = ["START end the call   OK water", "WHEEL longer, shorter   BACK end"];
  } else if (session) {
    const start = v.mode === "break" ? (v.meal ? "START end lunch" : "START end the break") : v.breaks ? "START take a break" : "START end the session";
    keys = [`${start}   OK water`, v.mode === "break" && !v.meal ? "WHEEL kind of break   BACK cancel" : "BACK cancel"];
  } else if (v.need === "holiday") {
    day = "nothing is asked until then";
    keys = ["WHEEL day of return", "START I am back   BACK leave"];
  } else if (v.hi > 0) {
    day = `${v.hi} days off: welcome back`;
    keys = ["any press goes on", "BACK leave"];
  } else if (v.need === "sleep" && v.wakes) {
    day = plan ? "the plan for today" : v.time < "12:00" ? "good morning" : "hello again";
    keys = ["any press wakes Paws", "BACK leave"];
  } else {
    // What the day was, in one line: the counts and lunch. If that is longer than the display is wide, the breaks
    // go: they are not a goal. The party's minute has a line of its own, and so has sleep that is not a day's end.
    const whole = v.lunch === null ? counts : [...counts, v.lunch ? "lunch" : "no lunch"];
    const was = (whole.join(", ").length <= 37 ? whole : whole.filter((_, i) => i !== 2)).join(", ");
    if (v.party) day = v.party === "year" ? "the year is done" : "the week is done";
    else if (v.need === "leave") day = was;
    else if (night) day = v.sleeps === "weekend" ? "it is the weekend" : v.sleeps === "early" ? `the day begins at ${v.dayStart}` : was;
    const start = v.need === "lunch" ? `START eat ${v.mealMinutes} min` : v.need === "break" ? "START take a break" : `START focus ${v.minutes} min`;
    keys =
      v.need === "leave"
        ? [`OK good night   ${start}`, "WHEEL not now   BACK leave"]
        : [`${start}   ${v.need === "lunch" ? "OK already ate" : "OK water"}`, `${asking ? "WHEEL not now" : "WHEEL length"}   BACK leave`];
    // Every other minute, with nothing asked: what a hold does. The two lines have no room for both.
    if (v.hints) keys = ["HOLD OK in a call 30 min", "HOLD START on holiday"];
  }

  // The calendar: a row for each week, 7 px apart, the oldest on top and this week the lowest; in a row a dot for
  // each day, 8 px apart, five where weekends are off. Five are 38 px wide and stand in the middle of the column,
  // seven are 54 and end two columns short of the status bar. Unseen elsewhere.
  const week: Element[] = [];
  const five = v.week[5] === -1;
  const x0 = five ? 103 : 92;
  // A week before this one is two pictures: its first four days, and the rest. Where there are five days the rest
  // is the Friday, in the picture a single day has. A week that is not kept yet is not shown.
  for (let k = 0; k < 3; k++) {
    const bits = dots && k < v.past.length ? v.past[k]! : -1;
    const y = 36 - 7 * k;
    const rest = five ? `week_${bits >= 0 && (bits >> 4) & 1 ? 2 : 1}` : `days3_${bits < 0 ? 0 : (bits >> 4) & 7}`;
    week.push({ id: `b_h${k}a`, type: "image", path: `images/days4_${bits < 0 ? 0 : bits & 15}.png`, x: x0, y, opacity: bits < 0 ? 0 : 100, display: "back" });
    week.push({ id: `b_h${k}b`, type: "image", path: `images/${rest}.png`, x: x0 + 32, y, opacity: bits < 0 ? 0 : 100, display: "back" });
  }
  // This week: a picture for each of its days, with a line under today.
  for (let i = 0; i < 7; i++) {
    const n = dots ? v.week[i]! : -1;
    week.push({ id: `b_w${i}`, type: "image", path: `images/week_${n < 0 ? 0 : n}.png`, x: x0 + i * 8, y: 43, opacity: n < 0 ? 0 : 100, display: "back" });
  }

  return [
    play("b_scene", v, "_back", { x: 2, y: 2, z_index: 1, display: "back" }),
    over("b_moment", v, "_back", { x: 2, y: 2, display: "back" }),
    text("b_title", title, "bold", 122, 2),
    text("b_big", session ? String(v.left) : "", "extra_large", 122, 16),
    // The time left to the second, counted down by the firmware itself: sent once, not redrawn.
    { id: "b_time", type: "countdown", timestamp: String(Math.round(v.endsAt / 1000)), direction: "time_left", show_hours: "when_non_zero", color: session ? WHITE : CLEAR, x: 122, y: 41, align: "top_mid", display: "back" },
    ...column,
    text("b_day", day, "small", 74, 52),
    ...week,
    text("b_k1", keys[0]!, "small", 74, 62),
    text("b_k2", keys[1]!, "small", 74, 71),
  ];
}
