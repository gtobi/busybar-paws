/**
 * The rules of Paws' day: what it needs and when, what counts, what is kept between runs. Nothing here touches the
 * bar. Every function answers from the clock, the settings and the record it is given, so the rules are tested off
 * the bar: shared/day.test.ts, `npm test`.
 */

export const MINUTE = 60000;
/** Closed for longer than this, the app starts the clocks afresh: time away is never held against you. */
export const AWAY_MS = 30 * MINUTE;
/** A break shorter than this does not count as one. */
export const MIN_BREAK_MS = MINUTE;
/** A session ended with Start counts if it ran this long. One that runs out always counts. */
export const MIN_SESSION_MS = 5 * MINUTE;
/**
 * "Not now": how long a prompt stays quiet after the wheel, or after its break was cancelled or cut short. Also how
 * long Paws waits for an answer after the working day before it falls asleep by itself.
 */
export const QUIET_MS = 15 * MINUTE;
/** A meal that lasted this long is lunch, even if Start ended it before its length. Nobody eats to the minute. */
export const MIN_MEAL_MS = 10 * MINUTE;
/** After this many days with nobody there, Paws says "Hi again" when it wakes. A weekend is two. */
export const AWAY_DAYS = 2;
/** So many weeks before this one are kept, each day of them as met or not. With this week: four. */
export const HISTORY_WEEKS = 3;
/** After every so many sessions of a day, the break is the long one. */
export const LONG_AFTER = 4;
/** In a session Paws looks away from its screen every so often, for so many seconds: so should you. */
export const LOOK_EVERY_MS = 20 * MINUTE;
export const LOOK_SECONDS = 20;
/** A call begun with a hold of OK lasts this long, and the wheel changes it by so much. */
export const MEETING_MS = 30 * MINUTE;
export const MEETING_STEP_MS = 15 * MINUTE;
const DAY_MS = 24 * 60 * MINUTE;

/** The settings the rules read. Times of day are minutes after midnight. */
export type Rules = {
  /** 0: no breaks. Nothing asks for one, and a session ends at home. */
  breakMinutes: number;
  /** A break is overdue this many minutes after the last one. */
  breakDue: number;
  /** The day's goal, glasses of water. Paws is thirsty at even gaps through the working day until it is reached. */
  glasses: number;
  /** Paws asks for lunch. */
  lunch: boolean;
  /** From this time on, until the meal or the end of day. */
  lunchFrom: number;
  /** A break this long, begun from lunch time on, is the meal. */
  mealMinutes: number;
  /** The working day. Paws sleeps from its end to its start, whatever is pressed. */
  dayStart: number;
  dayEnd: number;
  /** Saturday and Sunday are not working days: Paws sleeps through them too. */
  weekendsOff: boolean;
  /** When the working day ends, Paws says so and waits for an answer before it sleeps. */
  remind: boolean;
  /** The day's goal, focus sessions. 0: none, they are only counted. */
  sessions: number;
  /** Minutes of the break after every fourth session of the day. 0: that break is like the others. */
  longBreak: number;
};

/**
 * A session, a break or a call that is running. Kept, so that it survives the app being closed. A call ("meeting")
 * counts as nothing: while it runs nothing is asked, and that is all.
 */
export type Run = { kind: "focus" | "break" | "meeting"; beganAt: number; endsAt: number; meal: boolean };

/**
 * What is kept on the bar between runs. Every write goes to flash, so it is written only when something happens:
 * a glass, a session or a break beginning or ending.
 */
export type Memory = {
  day: string;
  /** When the last break ended, and when the last glass was logged, bar clock, ms. */
  lastBreak: number;
  lastGlass: number;
  /** When something was last written. Not when the app was last open: that would be a write a minute. */
  seen: number;
  glasses: number;
  breaks: number;
  /** Focus sessions finished today. */
  sessions: number;
  /** Lunch happened today, eaten here or said to have been eaten. */
  lunch: boolean;
  run: Run | null;
  /** The session length the wheel last chose, minutes. 0: none, the setting's stands. */
  minutes: number;
  /** The kind of break the wheel last chose: its place in the app's list. */
  kind: number;
  /** Smoke breaks that counted today. Only where the settings ask for that kind of break. */
  smokes: number;
  /** When someone was last there: a press, or the app opened by day. Written once a day, not at every press. */
  here: number;
  /** On holiday until this moment, the midnight the day of return begins with. 0: not on holiday. */
  holiday: number;
  /** The Monday of the week that `week` tells of, as `day` is written. */
  monday: string;
  /** For each day of that week before today, Monday first: 1 where the day's goals were met, else 0. */
  week: number[];
  /**
   * The weeks before this one, the nearest first, at most HISTORY_WEEKS of them. Each is a number whose bit for a
   * day, Monday the lowest, says that the day's goals were met. A week from before the app was there is not in it.
   */
  past: number[];
  /** Days in a row whose goals were met, up to yesterday, and the longest such row so far. */
  streak: number;
  best: number;
};

/** Until when each prompt stays quiet, bar clock, ms. Not kept: a restart asks again. */
export type Quiet = { leave: number; lunch: number; break: number; water: number };

/** What the home screen shows instead of the clock and the meters. The first that applies, in this order. */
export type Need = "holiday" | "sleep" | "leave" | "lunch" | "break" | "water" | "none";

export function dayOf(now: number): string {
  const date = new Date(now);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/** Minutes after midnight, by the bar's clock. */
export function minuteOf(now: number): number {
  const date = new Date(now);
  return date.getHours() * 60 + date.getMinutes();
}

/** Midnight: the moment the day of `now` begins with, or the day so many days after it. */
export function midnight(now: number, days = 0): number {
  const date = new Date(now);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days).getTime();
}

/** Whole days from the day of `from` to the day of `to`. Rounded: a day is 23 or 25 hours where the clocks change. */
export function daysBetween(from: number, to: number): number {
  return Math.round((midnight(to) - midnight(from)) / DAY_MS);
}

/** 0 for a Monday to 6 for a Sunday. */
export function weekdayOf(now: number): number {
  return (new Date(now).getDay() + 6) % 7;
}

/** The Monday of the week of `now`, as a day is written. */
export function mondayOf(now: number): string {
  return dayOf(midnight(now, -weekdayOf(now)));
}

/** The noon of a day as `dayOf` writes it, or NaN. */
function whenOf(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year!, month! - 1, date!, 12).getTime();
}

/** A day that begins now: nothing counted, both clocks started. */
export function freshDay(now: number): Memory {
  return { day: dayOf(now), lastBreak: now, lastGlass: now, seen: now, glasses: 0, breaks: 0, sessions: 0, lunch: false, run: null, minutes: 0, kind: 0, smokes: 0, here: now, holiday: 0, monday: mondayOf(now), week: [0, 0, 0, 0, 0, 0, 0], past: [], streak: 0, best: 0 };
}

/**
 * The day's goals are met: the glasses of water, lunch where Paws asks for it, and the focus sessions where there
 * is a goal for them. Breaks have no goal: Paws asks for them as they become due.
 */
export function met(r: Rules, m: Pick<Memory, "glasses" | "lunch" | "sessions">): boolean {
  return m.glasses >= r.glasses && (!r.lunch || m.lunch) && (r.sessions === 0 || m.sessions >= r.sessions);
}

/**
 * The streak as the day that is over leaves it. A day whose goals were met adds one. A day that was not met ends
 * it only if it was held against nobody unfairly: a working day, not a day of a holiday, and someone was there.
 * A weekend, a holiday and a day with nobody at the bar leave it as it is: time away costs nothing.
 */
export function streakAfter(r: Rules, m: Memory): number {
  if (met(r, m)) return m.streak + 1;
  const was = whenOf(m.day);
  const working = !(r.weekendsOff && isWeekend(was));
  const there = dayOf(m.here) === m.day;
  return working && there && m.holiday <= was ? 0 : m.streak;
}

/** The streak with today in it, once today's goals are met. */
export function streakNow(r: Rules, m: Memory): number {
  return m.streak + (met(r, m) ? 1 : 0);
}

/**
 * The day after: nothing counted, both clocks started. What the wheel chose stays: it is a liking, not a count.
 * What is running goes on, but a meal begun on another day is not this day's lunch. A holiday goes on, and who was
 * there last stays known.
 *
 * The day that is over is written down: into its week, met or not, and into the streak. When that week is over
 * too it goes to the front of the weeks before, with an empty week for each one that lay between and was never
 * seen, and this week begins empty.
 */
export function nextDay(m: Memory, r: Rules, now: number): Memory {
  const fresh = freshDay(now);
  const was = whenOf(m.day);
  const streak = streakAfter(r, m);
  let week = fresh.week;
  let past = m.past;
  if (!isNaN(was)) {
    // The week the day belongs to, with the day in it.
    const closed = m.monday === mondayOf(was) ? m.week.slice() : fresh.week.slice();
    closed[weekdayOf(was)] = met(r, m) ? 1 : 0;
    const weeks = Math.round(daysBetween(midnight(was, -weekdayOf(was)), midnight(now, -weekdayOf(now))) / 7);
    if (weeks === 0) week = closed;
    // A week in the past: kept. One in the future was written under a clock that has since been set back.
    else if (weeks > 0) past = [...new Array<number>(Math.min(weeks - 1, HISTORY_WEEKS)).fill(0), closed.reduce((bits, day, i) => bits | (day << i), 0), ...m.past].slice(0, HISTORY_WEEKS);
  }
  return { ...fresh, minutes: m.minutes, kind: m.kind, run: m.run ? { ...m.run, meal: false } : null, here: m.here, holiday: m.holiday > now ? m.holiday : 0, week, past, streak, best: Math.max(m.best, streak) };
}

/** Whole days with nobody there, between the day someone was last there and today. From Friday to Monday: two. */
export function daysOff(m: Pick<Memory, "here">, now: number): number {
  return Math.max(0, daysBetween(m.here, now) - 1);
}

/** The first working day after today, its midnight: tomorrow, or Monday where weekends are off. A holiday ends there. */
export function nextWorkday(r: Rules, now: number): number {
  let at = midnight(now, 1);
  while (r.weekendsOff && isWeekend(at)) at = midnight(at, 1);
  return at;
}

/**
 * A holiday's day of return, moved by the wheel: a working day later or earlier. Not before the next working
 * day, and not more than a year away.
 */
export function moveHoliday(r: Rules, holiday: number, later: boolean, now: number): number {
  const step = later ? 1 : -1;
  let at = midnight(holiday, step);
  while (r.weekendsOff && isWeekend(at)) at = midnight(at, step);
  return Math.min(midnight(now, 365), Math.max(nextWorkday(r, now), at));
}

/** 3 … 0: how much is left of something that runs out `everyMinutes` after `since`. */
export function level(now: number, since: number, everyMinutes: number): number {
  const part = (now - since) / (everyMinutes * MINUTE);
  return part >= 1 ? 0 : part >= 2 / 3 ? 1 : part >= 1 / 3 ? 2 : 3;
}

/**
 * Night: from the end of day to the start of day. Usually that crosses midnight (18:00 to 07:00). An end of day
 * after midnight (01:00, start 07:00) is a night that lies within one day. The same time twice: no night.
 */
export function isNight(r: Rules, now: number): boolean {
  const minute = minuteOf(now);
  return r.dayEnd <= r.dayStart ? minute >= r.dayEnd && minute < r.dayStart : minute >= r.dayEnd || minute < r.dayStart;
}

/** What there is to celebrate when a day ends: the year on 31 December, the week on any other Friday. */
export type Party = "year" | "week";

export function partyOn(now: number): Party | null {
  const date = new Date(now);
  if (date.getMonth() === 11 && date.getDate() === 31) return "year";
  return date.getDay() === 5 ? "week" : null;
}

/** Saturday or Sunday, by the bar's clock. */
export function isWeekend(now: number): boolean {
  const day = new Date(now).getDay();
  return day === 0 || day === 6;
}

/** Not working time: the night, and the weekend where weekends are off. Paws sleeps, and a press does not wake it. */
export function isOff(r: Rules, now: number): boolean {
  return isNight(r, now) || (r.weekendsOff && isWeekend(now));
}

/** Breaks are part of the day: with a break length of 0 nothing asks for one and the rest meter stays full. */
export const breaksOn = (r: Rules): boolean => r.breakMinutes > 0;

/** The working day's length, minutes. The same time twice is a whole day. */
export function dayMinutes(r: Rules): number {
  return (r.dayEnd - r.dayStart + 1440) % 1440 || 1440;
}

/**
 * Minutes from one glass to the next: the working day in as many parts as the goal has glasses, so that the goal is
 * met by the end of day. Not under 20 minutes, not over four hours.
 */
export function glassEvery(r: Rules): number {
  return Math.min(240, Math.max(20, Math.round(dayMinutes(r) / Math.max(1, r.glasses))));
}

/** 3 … 0: time since the last glass. Full once the day's goal is reached: Paws has had enough. */
export function water(r: Rules, m: Memory, now: number): number {
  return m.glasses >= r.glasses ? 3 : level(now, m.lastGlass, glassEvery(r));
}

/**
 * What Paws needs now. On holiday it needs nothing, until the day of return. Asleep comes next and silences the
 * rest. Each prompt can be told "not now" on its own, so that one left unanswered does not hide the next.
 *
 * Awake after the working day (it has just ended, or a session ran across its end), Paws says that the day is done.
 * Told "not now", it goes on as by day, but for lunch: that was the day's.
 */
export function need(r: Rules, m: Memory, asleep: boolean, quiet: Quiet, now: number): Need {
  if (m.holiday > now) return "holiday";
  if (asleep) return "sleep";
  const off = isOff(r, now);
  if (off && r.remind && now >= quiet.leave) return "leave";
  if (!off && r.lunch && !m.lunch && minuteOf(now) >= r.lunchFrom && now >= quiet.lunch) return "lunch";
  if (breaksOn(r) && now >= quiet.break && level(now, m.lastBreak, r.breakDue) === 0) return "break";
  if (now >= quiet.water && water(r, m, now) === 0) return "water";
  return "none";
}

/** 3 … 0: full after lunch; before it, a segment less for each of the last three hours before lunch time. */
export function food(r: Rules, m: Memory, now: number): number {
  if (!r.lunch || m.lunch) return 3;
  const left = r.lunchFrom - minuteOf(now);
  return left > 120 ? 3 : left > 60 ? 2 : left > 0 ? 1 : 0;
}

/** 3 … 0: time since the last break. Full when there are no breaks. */
export function rest(r: Rules, m: Memory, now: number): number {
  return breaksOn(r) ? level(now, m.lastBreak, r.breakDue) : 3;
}

/**
 * What Paws does at home while nothing is asked of it or of you: the name of a loop, 30 seconds round. The home
 * screen is drawn again every minute for the clock, and takes another one each time.
 */
export type Idle =
  | "home" | "ears" | "look" | "purr" | "swish" | "groom" | "pounce" | "fly" | "wave" | "loaf" | "peek" | "reach" | "climb"
  | "hungry" | "dry" | "drowsy" | "clock"
  | Hat | "wink" | "mug";

/** A hat for a time of the year: the name of the idle loop in which it drops onto Paws' head. */
export type Hat = "newyear" | "clover" | "sunhat" | "crown" | "witch" | "santa";

/**
 * The hat of these days, if they have one. Each is worn for three days or more, so that a working day is among
 * them: the new year, St. Patrick's Day, midsummer, Cat Day (8 August), Halloween, and December until Christmas.
 */
export function hatOn(now: number): Hat | null {
  const date = new Date(now);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (month === 1 && day <= 6) return "newyear";
  if (month === 3 && day >= 15 && day <= 17) return "clover";
  if (month === 6 && day >= 19 && day <= 21) return "sunhat";
  if (month === 8 && day >= 6 && day <= 8) return "crown";
  if (month === 10 && day >= 25) return "witch";
  if (month === 12 && day <= 26) return "santa";
  return null;
}

/**
 * The everyday loops, which take turns. Thirteen of them, a prime, so that a step of four visits each before one
 * comes again, and so does a step of eight, when every other minute goes to what is coming.
 */
const TURNS: readonly Idle[] = ["home", "ears", "look", "purr", "swish", "groom", "pounce", "fly", "wave", "loaf", "peek", "reach", "climb"];

/**
 * The idle loop for this minute. Never the same in two minutes running.
 *
 * - 11:11 is a wink.
 * - Every other minute Paws shows what is coming, while something is: the working day ends within a quarter of an
 *   hour, or a meter is on its last segment. It asks for nothing yet.
 * - Now and then something for the season or the hour: the hat of these days, a mug in the day's first hour.
 * - Otherwise the everyday loops take turns, in an order that begins elsewhere each day.
 */
export function idleAt(r: Rules, m: Memory, now: number): Idle {
  const date = new Date(now);
  const minute = date.getHours() * 60 + date.getMinutes();
  if (minute === 11 * 60 + 11) return "wink";
  if (minute % 2 === 1) {
    const coming: Idle[] = [];
    const left = (r.dayEnd - minute + 1440) % 1440;
    if (left > 0 && left <= 15) coming.push("clock");
    if (food(r, m, now) === 1) coming.push("hungry");
    if (water(r, m, now) === 1) coming.push("dry");
    if (rest(r, m, now) === 1) coming.push("drowsy");
    if (coming.length > 0) return coming[((minute - 1) / 2) % coming.length]!;
  } else {
    const hat = hatOn(now);
    if (hat && minute % 10 === 4) return hat;
    if ((minute - r.dayStart + 1440) % 1440 < 60 && minute % 6 === 2) return "mug";
  }
  return TURNS[(minute * 4 + date.getDate() * 3) % TURNS.length]!;
}

/** A break of a meal's length that begins from lunch time on, on a day without lunch yet, is the meal. */
export function isMeal(r: Rules, m: Memory, beganAt: number, ms: number): boolean {
  return r.lunch && !m.lunch && minuteOf(beganAt) >= r.lunchFrom && ms >= r.mealMinutes * MINUTE;
}

/**
 * When the home screen can next change: the next full minute (the clock, the meters, lunch time, night), or
 * sooner when a break or a glass becomes due, a "not now" runs out or a holiday ends, in the middle of one.
 */
export function nextChange(r: Rules, m: Memory, quiet: Quiet, now: number): number {
  let next = now - (now % MINUTE) + MINUTE;
  for (const at of [m.lastBreak + r.breakDue * MINUTE, m.lastGlass + glassEvery(r) * MINUTE, quiet.leave, quiet.lunch, quiet.break, quiet.water, m.holiday]) {
    if (at > now && at < next) next = at;
  }
  return next;
}

/**
 * Minutes of the break that follows a session that has just counted: the long one after every fourth of the day,
 * where there is one, and never shorter than the others. `m` is the day with that session in it.
 */
export function breakAfter(r: Rules, m: Pick<Memory, "sessions">): number {
  const long = r.longBreak > 0 && m.sessions > 0 && m.sessions % LONG_AFTER === 0;
  return long ? Math.max(r.longBreak, r.breakMinutes) : r.breakMinutes;
}

/**
 * When Paws next looks away in a session: every twenty minutes of it, but not in its last minute. null: not again.
 */
export function lookAt(run: Run, now: number): number | null {
  if (run.kind !== "focus") return null;
  const at = run.beganAt + (Math.floor((now - run.beganAt) / LOOK_EVERY_MS) + 1) * LOOK_EVERY_MS;
  return at <= run.endsAt - MINUTE ? at : null;
}

/** The moment Paws began to look away, while it does; else null. */
export function looking(run: Run, now: number): number | null {
  if (run.kind !== "focus" || now - run.beganAt < LOOK_EVERY_MS) return null;
  const at = run.beganAt + Math.floor((now - run.beganAt) / LOOK_EVERY_MS) * LOOK_EVERY_MS;
  return now < at + LOOK_SECONDS * 1000 && at <= run.endsAt - MINUTE ? at : null;
}

/** A session ends. It counts if it ran out, or ran long enough before Start ended it. Back does not come here. */
export function closeFocus(m: Memory, run: Run, now: number): Memory {
  const counts = now >= run.endsAt - 1000 || now - run.beganAt >= MIN_SESSION_MS;
  return { ...m, run: null, sessions: m.sessions + (counts ? 1 : 0), seen: now };
}

/**
 * A break ends. It counts if it lasted a minute, and as lunch if it was the meal and lasted ten minutes, or its
 * whole length where that is shorter (less a second: the timer that ends it may fire a moment early). `eaten` is
 * false for a meal cut short before that.
 */
export function closeBreak(m: Memory, run: Run, r: Rules, now: number): { memory: Memory; counted: boolean; eaten: boolean } {
  const lasted = now - run.beganAt;
  const counted = lasted >= MIN_BREAK_MS;
  const eaten = run.meal && lasted >= Math.min(r.mealMinutes * MINUTE, MIN_MEAL_MS) - 1000;
  const memory: Memory = { ...m, run: null, seen: now };
  if (counted) {
    memory.lastBreak = now;
    memory.breaks = m.breaks + 1;
  }
  if (eaten) memory.lunch = true;
  return { memory, counted, eaten };
}

const count = (value: unknown): number => (typeof value === "number" && isFinite(value) && value >= 0 ? Math.floor(value) : 0);
/** A saved moment, unless it is missing or lies in the future (the clock was set back). */
const moment = (value: unknown, now: number): number => (typeof value === "number" && isFinite(value) && value <= now ? value : now);

function savedRun(value: unknown): Run | null {
  const run = value as Partial<Run> | null;
  if (!run || (run.kind !== "focus" && run.kind !== "break" && run.kind !== "meeting")) return null;
  if (typeof run.beganAt !== "number" || typeof run.endsAt !== "number" || !isFinite(run.beganAt) || !isFinite(run.endsAt) || run.endsAt <= run.beganAt) return null;
  return { kind: run.kind, beganAt: run.beganAt, endsAt: run.endsAt, meal: run.meal === true };
}

/**
 * What was kept, as it stands at `now`, when the app opens.
 *
 * - A session or break still running goes on. One that ran out while the app was closed is counted as if the app
 *   had been open, unless that was on another day. A call that ran out is over.
 * - Another day: everything else starts again, and the day that was goes into its week and into the streak.
 * - The same day, but nothing written for a while: what was counted stays, the clocks start again.
 * - A holiday goes on until its day of return, and who was there last stays known, whatever the day.
 */
export function recall(text: string | null, r: Rules, now: number): Memory {
  const fresh = freshDay(now);
  let saved: Partial<Memory> | null = null;
  try {
    saved = JSON.parse(text ?? "null") as Partial<Memory> | null;
  } catch {
    // Not ours: as if nothing was kept.
  }
  if (!saved || typeof saved !== "object") return fresh;

  const minutes = count(saved.minutes);
  const kind = count(saved.kind);
  let run = savedRun(saved.run);
  // A run that begins in the future was kept under a clock that has since been set back.
  if (run && run.beganAt > now) run = null;
  const running = run !== null && run.endsAt > now;
  // The week as it was kept, if it is a week: seven days, each met or not.
  const kept = saved.week;
  const week = Array.isArray(kept) && kept.length === 7 ? kept.map((day) => (day === 1 ? 1 : 0)) : fresh.week;

  let memory: Memory = {
    ...fresh,
    minutes,
    kind,
    run,
    glasses: count(saved.glasses),
    breaks: count(saved.breaks),
    sessions: count(saved.sessions),
    smokes: count(saved.smokes),
    lunch: saved.lunch === true,
    lastBreak: moment(saved.lastBreak, now),
    lastGlass: moment(saved.lastGlass, now),
    seen: moment(saved.seen, now),
    here: moment(saved.here, now),
    holiday: typeof saved.holiday === "number" && isFinite(saved.holiday) && saved.holiday > now ? saved.holiday : 0,
    monday: typeof saved.monday === "string" ? saved.monday : "",
    week,
    past: Array.isArray(saved.past) ? saved.past.slice(0, HISTORY_WEEKS).map((bits) => count(bits) & 127) : [],
    streak: count(saved.streak),
    best: Math.max(count(saved.best), count(saved.streak)),
  };
  if (saved.day !== fresh.day) return nextDay({ ...memory, day: String(saved.day), run: running ? run : null }, r, now);
  if (memory.monday !== fresh.monday) memory = { ...memory, monday: fresh.monday, week: fresh.week };
  if (run && !running) {
    // It ran out while the app was closed: the end is when it was due, not now. A call is over and nothing more.
    memory = run.kind === "focus" ? closeFocus(memory, run, run.endsAt) : run.kind === "break" ? closeBreak(memory, run, r, run.endsAt).memory : { ...memory, run: null, seen: run.endsAt };
  }
  // Away: the clocks start again. Not while something is running: the app was closed, the person was not gone.
  if (!running && now - memory.seen > AWAY_MS) memory = { ...memory, lastBreak: now, lastGlass: now, seen: now };
  return memory;
}
