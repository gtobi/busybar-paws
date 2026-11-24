// The rules of Paws' day, held to what docs/DESIGN.md says. Run with `npm test` (Node's own test runner; it reads
// TypeScript as it is, so there is nothing to install or build).

import assert from "node:assert/strict";
import { test } from "node:test";
import { AWAY_MS, MINUTE, QUIET_MS, breakAfter, closeBreak, closeFocus, daysOff, food, freshDay, glassEvery, hatOn, idleAt, isMeal, isNight, isOff, level, lookAt, looking, met, midnight, moveHoliday, need, nextChange, nextDay, nextWorkday, partyOn, recall, rest, streakAfter, streakNow, water } from "./day.ts";
import type { Memory, Quiet, Rules, Run } from "./day.ts";

/** A moment on 23 November 2026 (a Monday), or `days` later, by the clock of the machine the tests run on. */
const at = (hour: number, minute = 0, days = 0): number => new Date(2026, 10, 23 + days, hour, minute).getTime();

/** A day of eleven hours and five glasses: a glass every 132 minutes. */
const rules: Rules = { breakMinutes: 5, breakDue: 90, glasses: 5, lunch: true, lunchFrom: 11 * 60 + 30, mealMinutes: 20, dayStart: 7 * 60, dayEnd: 18 * 60, weekendsOff: true, remind: true, sessions: 4, longBreak: 15 };
const noQuiet: Quiet = { leave: 0, lunch: 0, break: 0, water: 0 };
/** A day that began at `since`, looked at later. */
const dayFrom = (since: number, change: Partial<Memory> = {}): Memory => ({ ...freshDay(since), ...change });
const keep = (m: Memory): string => JSON.stringify(m);

test("the meters lose a third at a time and are empty when the time is up", () => {
  const since = at(9);
  assert.equal(level(since, since, 90), 3);
  assert.equal(level(since + 29 * MINUTE, since, 90), 3);
  assert.equal(level(since + 30 * MINUTE, since, 90), 2);
  assert.equal(level(since + 60 * MINUTE, since, 90), 1);
  assert.equal(level(since + 90 * MINUTE, since, 90), 0);
});

test("night is from the end of day to the start of day, across midnight", () => {
  for (const [hour, minute] of [[18, 0], [23, 59], [0, 30], [6, 59]]) assert.equal(isNight(rules, at(hour!, minute)), true, `${hour}:${minute}`);
  for (const [hour, minute] of [[7, 0], [12, 0], [17, 59]]) assert.equal(isNight(rules, at(hour!, minute)), false, `${hour}:${minute}`);
});

test("an end of day at or after midnight is a short night, not a day asleep", () => {
  const midnight = { ...rules, dayEnd: 0 };
  assert.equal(isNight(midnight, at(0, 30)), true);
  assert.equal(isNight(midnight, at(12)), false);
  assert.equal(isNight(midnight, at(23)), false);
  const one = { ...rules, dayEnd: 60 };
  assert.equal(isNight(one, at(0, 30)), false);
  assert.equal(isNight(one, at(3)), true);
  assert.equal(isNight(one, at(12)), false);
  assert.equal(isNight({ ...rules, dayEnd: 420 }, at(3)), false, "the same time twice: no night");
});

test("the week is celebrated on a Friday, the year on 31 December, and the year comes first", () => {
  assert.equal(partyOn(at(18)), null, "a Monday");
  assert.equal(partyOn(at(18, 0, 4)), "week", "Friday 27 November 2026");
  assert.equal(partyOn(new Date(2026, 11, 31, 18).getTime()), "year", "a Thursday");
  assert.equal(partyOn(new Date(2027, 11, 31, 18).getTime()), "year", "a Friday");
  assert.equal(partyOn(new Date(2026, 11, 30, 18).getTime()), null, "the day before");
});

test("the water goal paces the day: its length in as many parts as there are glasses", () => {
  const office = { ...rules, dayStart: 9 * 60, dayEnd: 17 * 60, glasses: 6 };
  assert.equal(glassEvery(office), 80);
  assert.equal(glassEvery({ ...office, glasses: 8 }), 60);
  assert.equal(glassEvery({ ...office, glasses: 40 }), 20, "not more often than every 20 minutes");
  assert.equal(glassEvery({ ...office, glasses: 1 }), 240, "not less often than every four hours");
  assert.equal(glassEvery({ ...office, dayEnd: 9 * 60 }), 240, "the same time twice is a whole day");
  assert.equal(glassEvery({ ...office, dayStart: 22 * 60, dayEnd: 6 * 60 }), 80, "a working night");
});

test("Paws is thirsty when a glass is due, and not again once the day's goal is reached", () => {
  const office = { ...rules, lunch: false, breakMinutes: 0, dayStart: 9 * 60, dayEnd: 17 * 60, glasses: 6 };
  const m = dayFrom(at(9), { glasses: 5, lastGlass: at(13) });
  assert.equal(water(office, m, at(14, 19)), 1);
  assert.equal(need(office, m, false, noQuiet, at(14, 19)), "none");
  assert.equal(need(office, m, false, noQuiet, at(14, 20)), "water", "80 minutes after the fifth");
  const done = { ...m, glasses: 6, lastGlass: at(14, 20) };
  assert.equal(need(office, done, false, noQuiet, at(16, 59)), "none");
  assert.equal(water(office, done, at(16, 59)), 3, "the meter stays full");
});

test("the weekend is off where weekends are off, and Paws sleeps through it like a night", () => {
  const saturday = at(12, 0, 5);
  assert.equal(new Date(saturday).getDay(), 6);
  assert.equal(isOff(rules, saturday), true);
  assert.equal(isOff(rules, at(12, 0, 6)), true, "Sunday");
  assert.equal(isOff({ ...rules, weekendsOff: false }, saturday), false);
  assert.equal(isOff(rules, at(12)), false, "Monday noon");
  assert.equal(isOff(rules, at(19)), true, "Monday night");
  assert.equal(isOff({ ...rules, weekendsOff: false }, at(19, 0, 5)), true, "Saturday night, weekends on");
});

test("awake after the working day, Paws says the day is done; told 'not now', it goes on without lunch", () => {
  const m = dayFrom(at(8), { lastBreak: at(17), lastGlass: at(17) });
  const evening = at(18, 5);
  assert.equal(need(rules, m, false, noQuiet, at(17, 59)), "lunch", "a minute before the end lunch is still asked");
  assert.equal(need(rules, m, false, noQuiet, at(18)), "leave");
  assert.equal(need(rules, m, false, { ...noQuiet, leave: evening + QUIET_MS }, evening), "none", "not lunch: that was the day's");
  assert.equal(need(rules, { ...m, lastBreak: at(16) }, false, { ...noQuiet, leave: evening + QUIET_MS }, evening), "break");
  assert.equal(need(rules, m, false, { ...noQuiet, leave: evening + QUIET_MS }, evening + QUIET_MS), "leave", "and asks again");
  assert.equal(need({ ...rules, remind: false }, m, false, noQuiet, evening), "none");
  assert.equal(need(rules, m, true, noQuiet, evening), "sleep");
  assert.equal(need(rules, m, false, noQuiet, at(12, 0, 5)), "leave", "awake on a Saturday: a session has just ended");
});

test("at home Paws does something else every minute, and each everyday thing before one comes again", () => {
  const off = { ...rules, lunch: false, breakMinutes: 0 };
  const m = dayFrom(at(9), { glasses: off.glasses });
  for (let minute = 9 * 60; minute < 17 * 60; minute++) {
    const now = at(0, minute);
    assert.notEqual(idleAt(off, m, now), idleAt(off, m, now + MINUTE), `minute ${minute}`);
  }
  // Thirteen minutes: the thirteen everyday loops, each once.
  const seen: string[] = [];
  for (let minute = 14 * 60; minute < 14 * 60 + 13; minute++) seen.push(idleAt(off, m, at(0, minute)));
  assert.equal(new Set(seen).size, 13, seen.join(" "));
  assert.notEqual(idleAt(off, m, at(14)), idleAt(off, m, at(14, 0, 1)), "another order the next day");
});

test("Paws shows what is coming every other minute: lunch, a glass, a break, the end of the day", () => {
  const full = dayFrom(at(8), { glasses: rules.glasses, lunch: true, lastBreak: at(10, 40) });
  assert.equal(idleAt(rules, { ...full, lunch: false }, at(10, 45)), "hungry", "lunch is from 11:30: the last hour before it");
  assert.equal(idleAt(rules, full, at(10, 45)), idleAt({ ...rules, lunch: false, breakMinutes: 0 }, full, at(10, 45)), "after lunch: an everyday loop");
  // A glass every 132 minutes: the last third begins after 88.
  assert.equal(idleAt(rules, { ...full, glasses: 1, lastGlass: at(9) }, at(10, 31)), "dry");
  assert.equal(idleAt(rules, { ...full, lastBreak: at(9) }, at(10, 1)), "drowsy", "a break is due after 90: the last third begins after 60");
  assert.equal(idleAt(rules, full, at(17, 51)), "clock", "the day ends at 18:00");
  assert.notEqual(idleAt(rules, full, at(17, 43)), "clock");
  // Two things coming take turns, and the minutes between stay everyday.
  const both = { ...full, glasses: 1, lastGlass: at(9), lastBreak: at(9, 30) };
  assert.deepEqual([idleAt(rules, both, at(10, 31)), idleAt(rules, both, at(10, 33))].sort(), ["drowsy", "dry"]);
  assert.equal(["dry", "drowsy"].includes(idleAt(rules, both, at(10, 32))), false);
});

test("a hat for a few days of the year, each long enough to hold a working day", () => {
  const on = (month: number, day: number): string | null => hatOn(new Date(2026, month - 1, day, 12).getTime());
  assert.deepEqual([on(1, 1), on(1, 6), on(1, 7)], ["newyear", "newyear", null]);
  assert.deepEqual([on(3, 14), on(3, 15), on(3, 17), on(3, 18)], [null, "clover", "clover", null]);
  assert.deepEqual([on(6, 18), on(6, 19), on(6, 21), on(6, 22)], [null, "sunhat", "sunhat", null]);
  assert.deepEqual([on(8, 5), on(8, 6), on(8, 8), on(8, 9)], [null, "crown", "crown", null]);
  assert.deepEqual([on(10, 24), on(10, 25), on(10, 31), on(11, 1)], [null, "witch", "witch", null]);
  assert.deepEqual([on(12, 1), on(12, 26), on(12, 27)], ["santa", "santa", null]);
  // It is worn one minute in ten, in place of an everyday loop.
  const october = (hour: number, minute: number): number => new Date(2026, 9, 30, hour, minute).getTime();
  const m = dayFrom(october(9, 0), { glasses: 9, lunch: true });
  assert.equal(idleAt(rules, m, october(14, 4)), "witch");
  assert.notEqual(idleAt(rules, m, october(14, 6)), "witch");
});

test("a wink at 11:11, a hat until Christmas, a mug in the first hour", () => {
  const m = dayFrom(at(7), { glasses: rules.glasses, lunch: true });
  assert.equal(idleAt(rules, m, at(11, 11)), "wink");
  assert.equal(idleAt(rules, m, at(7, 2)), "mug", "the day begins at 7:00");
  assert.notEqual(idleAt(rules, m, at(8, 2)), "mug");
  const december = (day: number, hour: number, minute: number): number => new Date(2026, 11, day, hour, minute).getTime();
  assert.equal(idleAt(rules, dayFrom(december(10, 9, 0), { glasses: 9, lunch: true }), december(10, 14, 4)), "santa");
  assert.notEqual(idleAt(rules, dayFrom(december(28, 9, 0), { glasses: 9, lunch: true }), december(28, 14, 4)), "santa");
  assert.notEqual(idleAt(rules, m, at(14, 4)), "santa", "not in November");
});

test("asleep comes first and silences every prompt", () => {
  const m = dayFrom(at(7));
  assert.equal(need(rules, m, true, noQuiet, at(13)), "sleep");
});

test("lunch is asked from lunch time until it is eaten, also late in the afternoon", () => {
  const m = dayFrom(at(11));
  assert.equal(need(rules, m, false, noQuiet, at(11, 29)), "none");
  assert.equal(need(rules, m, false, noQuiet, at(11, 30)), "lunch");
  assert.equal(need(rules, { ...m, lastBreak: at(15), lastGlass: at(15) }, false, noQuiet, at(15, 30)), "lunch");
  assert.equal(need(rules, { ...m, lunch: true, lastBreak: at(15), lastGlass: at(15) }, false, noQuiet, at(15, 30)), "none");
  assert.equal(need({ ...rules, lunch: false }, { ...m, lastBreak: at(12), lastGlass: at(12) }, false, noQuiet, at(12, 10)), "none");
});

test("a prompt told 'not now' lets the next one show", () => {
  const m = dayFrom(at(9));
  const now = at(12);
  assert.equal(need(rules, m, false, noQuiet, now), "lunch");
  assert.equal(need(rules, m, false, { ...noQuiet, lunch: now + QUIET_MS }, now), "break");
  assert.equal(need(rules, m, false, { ...noQuiet, lunch: now + QUIET_MS, break: now + QUIET_MS }, now), "water");
  assert.equal(need(rules, m, false, { leave: 0, lunch: now + QUIET_MS, break: now + QUIET_MS, water: now + QUIET_MS }, now), "none");
  assert.equal(need(rules, m, false, { ...noQuiet, lunch: now + QUIET_MS }, now + QUIET_MS), "lunch", "and it asks again when the quiet is over");
});

test("with a break length of 0 nothing asks for a break and the rest meter stays full", () => {
  const off = { ...rules, breakMinutes: 0, lunch: false };
  const m = dayFrom(at(8), { lastGlass: at(11) });
  assert.equal(need(off, m, false, noQuiet, at(11, 30)), "none");
  assert.equal(rest(off, m, at(11, 30)), 3);
  assert.equal(rest(rules, m, at(11, 30)), 0);
});

test("the food meter empties over the three hours before lunch and is full after it", () => {
  const m = dayFrom(at(8));
  assert.equal(food(rules, m, at(8)), 3);
  assert.equal(food(rules, m, at(9, 45)), 2);
  assert.equal(food(rules, m, at(10, 45)), 1);
  assert.equal(food(rules, m, at(11, 30)), 0);
  assert.equal(food(rules, m, at(16)), 0);
  assert.equal(food(rules, { ...m, lunch: true }, at(16)), 3);
  assert.equal(food({ ...rules, lunch: false }, m, at(12)), 3);
});

test("the meal is a break of a meal's length from lunch time on, at any hour after it", () => {
  const m = dayFrom(at(8));
  assert.equal(isMeal(rules, m, at(12), 20 * MINUTE), true);
  assert.equal(isMeal(rules, m, at(15), 20 * MINUTE), true, "a late lunch");
  assert.equal(isMeal(rules, m, at(12), 5 * MINUTE), false, "too short");
  assert.equal(isMeal(rules, m, at(10), 20 * MINUTE), false, "before lunch time");
  assert.equal(isMeal(rules, { ...m, lunch: true }, at(12), 20 * MINUTE), false, "lunch is done");
});

test("the home screen is looked at again on the minute, or sooner when something becomes due", () => {
  const m = dayFrom(at(9, 0), { lastBreak: at(9, 0) + 20000 });
  const now = at(10, 30) + 5000;
  assert.equal(nextChange(rules, m, noQuiet, now), at(10, 30) + 20000, "the break becomes due in this minute");
  assert.equal(nextChange(rules, m, noQuiet, at(10, 10) + 5000), at(10, 11), "nothing is due: the next minute");
  assert.equal(nextChange(rules, m, { ...noQuiet, lunch: at(10, 10) + 30000 }, at(10, 10) + 5000), at(10, 10) + 30000, "a 'not now' runs out");
});

test("a session counts when it runs out, or after five minutes when Start ends it", () => {
  const run: Run = { kind: "focus", beganAt: at(9), endsAt: at(9, 25), meal: false };
  const m = dayFrom(at(8), { run });
  assert.equal(closeFocus(m, run, at(9, 25)).sessions, 1);
  assert.equal(closeFocus(m, run, at(9, 3)).sessions, 0);
  assert.equal(closeFocus(m, run, at(9, 6)).sessions, 1);
  assert.equal(closeFocus(m, run, at(9, 25)).run, null);
});

test("a break counts after a minute; the meal is lunch after ten minutes, or its whole length if that is shorter", () => {
  const short: Run = { kind: "break", beganAt: at(10), endsAt: at(10, 5), meal: false };
  const m = dayFrom(at(8));
  assert.equal(closeBreak(m, short, rules, at(10) + 30000).counted, false);
  const taken = closeBreak(m, short, rules, at(10, 5));
  assert.deepEqual([taken.counted, taken.memory.breaks, taken.memory.lastBreak], [true, 1, at(10, 5)]);

  const meal: Run = { kind: "break", beganAt: at(12), endsAt: at(12, 20), meal: true };
  const cut = closeBreak(m, meal, rules, at(12, 5));
  assert.deepEqual([cut.counted, cut.eaten, cut.memory.lunch], [true, false, false]);
  const early = closeBreak(m, meal, rules, at(12, 12));
  assert.deepEqual([early.eaten, early.memory.lunch], [true, true], "back from lunch after twelve minutes");
  const eaten = closeBreak(m, meal, rules, at(12, 20) - 500);
  assert.deepEqual([eaten.eaten, eaten.memory.lunch, eaten.memory.breaks], [true, true, 1]);
  const snack: Run = { ...meal, endsAt: at(12, 5) };
  assert.equal(closeBreak(m, snack, { ...rules, mealMinutes: 5 }, at(12, 5) - 500).eaten, true, "a meal set to five minutes");
});

test("nothing kept, or something that is not ours, is a fresh day", () => {
  const now = at(9);
  assert.deepEqual(recall(null, rules, now), freshDay(now));
  assert.deepEqual(recall("{broken", rules, now), freshDay(now));
  assert.deepEqual(recall('"text"', rules, now), freshDay(now));
});

test("the same day, soon after: everything is as it was left", () => {
  const left = dayFrom(at(8), { glasses: 2, breaks: 1, sessions: 3, lunch: true, lastBreak: at(9), lastGlass: at(9, 30), seen: at(9, 50), minutes: 45, kind: 3 });
  assert.deepEqual(recall(keep(left), rules, at(10)), left);
});

test("the same day after time away: what was counted stays, the clocks start again", () => {
  const left = dayFrom(at(8), { glasses: 2, breaks: 1, sessions: 3, lastBreak: at(9), lastGlass: at(9, 30), seen: at(9, 50) });
  const now = at(9, 50) + AWAY_MS + MINUTE;
  const back = recall(keep(left), rules, now);
  assert.deepEqual([back.glasses, back.breaks, back.sessions], [2, 1, 3]);
  assert.deepEqual([back.lastBreak, back.lastGlass], [now, now]);
});

test("another day starts again, and keeps what the wheel chose, who was there last, and the week so far", () => {
  const left = dayFrom(at(8), { glasses: 5, breaks: 4, sessions: 6, lunch: true, minutes: 50, kind: 2 });
  assert.deepEqual(recall(keep(left), rules, at(8, 0, 1)), { ...freshDay(at(8, 0, 1)), minutes: 50, kind: 2, here: at(8), week: [1, 0, 0, 0, 0, 0, 0], streak: 1, best: 1 });
});

test("midnight with the app open: the same new day as on opening, and a meal across it is not the new day's lunch", () => {
  const meal: Run = { kind: "break", beganAt: at(23, 50), endsAt: at(0, 10, 1), meal: true };
  const left = dayFrom(at(8), { glasses: 5, breaks: 4, sessions: 6, lunch: true, minutes: 50, kind: 2, run: meal });
  const now = at(0, 1, 1);
  const turned = nextDay(left, rules, now);
  assert.deepEqual(turned, { ...freshDay(now), minutes: 50, kind: 2, run: { ...meal, meal: false }, here: at(8), week: [1, 0, 0, 0, 0, 0, 0], streak: 1, best: 1 });
  assert.deepEqual(recall(keep(left), rules, now), turned);
});

test("a session still running when the app opens goes on, and the clocks are not started again", () => {
  const run: Run = { kind: "focus", beganAt: at(9), endsAt: at(10), meal: false };
  const left = dayFrom(at(8), { run, lastBreak: at(8), seen: at(9) });
  const back = recall(keep(left), rules, at(9, 45));
  assert.deepEqual(back.run, run);
  assert.equal(back.lastBreak, at(8), "45 minutes with the app closed in a session is not time away");
});

test("a session that ran out while the app was closed is counted", () => {
  const run: Run = { kind: "focus", beganAt: at(9), endsAt: at(9, 25), meal: false };
  const back = recall(keep(dayFrom(at(8), { run, seen: at(9) })), rules, at(9, 40));
  assert.deepEqual([back.run, back.sessions], [null, 1]);
});

test("a break that ran out while the app was closed is counted from when it was due", () => {
  const run: Run = { kind: "break", beganAt: at(12), endsAt: at(12, 20), meal: true };
  const back = recall(keep(dayFrom(at(8), { run, seen: at(11) })), rules, at(12, 30));
  assert.deepEqual([back.run, back.breaks, back.lunch, back.lastBreak], [null, 1, true, at(12, 20)]);
});

test("a session across midnight goes on into the new day; one that ended yesterday is not today's", () => {
  const run: Run = { kind: "focus", beganAt: at(23, 50), endsAt: at(0, 15, 1), meal: false };
  const left = dayFrom(at(8), { run, glasses: 4 });
  const during = recall(keep(left), rules, at(0, 5, 1));
  assert.deepEqual([during.run, during.glasses, during.sessions], [run, 0, 0]);
  const after = recall(keep(left), rules, at(8, 0, 1));
  assert.deepEqual([after.run, after.sessions], [null, 0]);
});

test("moments from a clock that has since been set back are not believed", () => {
  const left = dayFrom(at(8), { lastBreak: at(11), lastGlass: at(11), seen: at(9, 30) });
  const back = recall(keep(left), rules, at(9, 40));
  assert.deepEqual([back.lastBreak, back.lastGlass], [at(9, 40), at(9, 40)]);
  const run: Run = { kind: "focus", beganAt: at(11), endsAt: at(11, 25), meal: false };
  assert.equal(recall(keep(dayFrom(at(8), { run })), rules, at(9, 40)).run, null);
});

test("on holiday Paws needs nothing, until the day of return", () => {
  // Left on Monday evening, back on Thursday.
  const back = midnight(at(12), 3);
  const m = dayFrom(at(8), { holiday: back });
  assert.equal(need(rules, m, true, noQuiet, at(19)), "holiday", "before sleep");
  assert.equal(need(rules, m, false, noQuiet, at(12, 0, 1)), "holiday", "before lunch, a break and a glass");
  assert.equal(need(rules, m, true, noQuiet, back - MINUTE), "holiday");
  assert.equal(need(rules, m, true, noQuiet, back), "sleep", "the day of return begins asleep, like any other");
  assert.equal(nextChange(rules, m, noQuiet, back - 30000), back, "and the screen is looked at when it does");
});

test("a holiday begins with the next working day as the day of return, and the wheel moves it by working days", () => {
  const friday = at(17, 0, 4);
  assert.equal(nextWorkday(rules, at(17)), midnight(at(0), 1), "Monday: Tuesday");
  assert.equal(nextWorkday(rules, friday), midnight(at(0), 7), "Friday: Monday");
  assert.equal(nextWorkday({ ...rules, weekendsOff: false }, friday), midnight(at(0), 5), "Friday, weekends on: Saturday");
  const monday = nextWorkday(rules, friday);
  assert.equal(moveHoliday(rules, monday, true, friday), midnight(at(0), 8), "a day later: Tuesday");
  assert.equal(moveHoliday(rules, monday, false, friday), monday, "not before the next working day");
  assert.equal(moveHoliday(rules, midnight(at(0), 11), true, friday), midnight(at(0), 14), "from a Friday on: Monday");
  assert.equal(moveHoliday(rules, midnight(at(0), 14), false, friday), midnight(at(0), 11), "and back");
  assert.equal(moveHoliday({ ...rules, weekendsOff: false }, midnight(at(0), 11), true, friday), midnight(at(0), 12), "weekends on: Saturday");
});

test("a holiday goes on over the days, and is over on the day of return", () => {
  const back = midnight(at(12), 3);
  const left = dayFrom(at(8), { holiday: back, seen: at(17) });
  assert.equal(recall(keep(left), rules, at(10, 0, 2)).holiday, back, "two days later");
  assert.equal(nextDay(left, rules, at(0, 1, 1)).holiday, back, "midnight with the app open");
  assert.equal(recall(keep(left), rules, at(10, 0, 3)).holiday, 0, "the day of return");
  assert.equal(recall(keep(left), rules, at(17, 30)).holiday, back, "the same day");
});

test("days off are the whole days with nobody there", () => {
  const friday = dayFrom(at(9, 0, 4));
  assert.equal(daysOff(friday, at(17, 0, 4)), 0, "the same day");
  assert.equal(daysOff(friday, at(9, 0, 5)), 0, "the next day");
  assert.equal(daysOff(friday, at(9, 0, 7)), 2, "Friday to Monday: the weekend");
  assert.equal(daysOff(friday, at(9, 0, 14)), 9);
  // Who was there last is kept across the days, with the app open or closed.
  assert.equal(daysOff(recall(keep(friday), rules, at(9, 0, 7)), at(9, 0, 7)), 2);
  assert.equal(daysOff(nextDay(nextDay(friday, rules, at(0, 1, 5)), rules, at(0, 1, 6)), at(9, 0, 7)), 2);
  assert.equal(daysOff(recall(keep({ ...friday, here: undefined }), rules, at(9, 0, 7)), at(9, 0, 7)), 0, "kept before this was: no greeting");
});

test("the day's goals are water, lunch where it is asked for, and sessions where there is a goal", () => {
  const day = { glasses: 5, lunch: true, sessions: 4 };
  assert.equal(met(rules, day), true);
  assert.equal(met(rules, { ...day, glasses: 4 }), false);
  assert.equal(met(rules, { ...day, lunch: false }), false);
  assert.equal(met({ ...rules, lunch: false }, { ...day, lunch: false }), true);
  assert.equal(met(rules, { ...day, sessions: 3 }), false);
  assert.equal(met({ ...rules, sessions: 0 }, { ...day, sessions: 0 }), true);
});

test("each day that is over goes into its week, met or not, and another week begins empty", () => {
  const good = { glasses: 5, lunch: true, sessions: 4 };
  const monday = dayFrom(at(8), good);
  const tuesday = nextDay(monday, rules, at(0, 1, 1));
  assert.deepEqual(tuesday.week, [1, 0, 0, 0, 0, 0, 0]);
  const wednesday = nextDay({ ...tuesday, glasses: 2 }, rules, at(0, 1, 2));
  assert.deepEqual(wednesday.week, [1, 0, 0, 0, 0, 0, 0], "Tuesday was not met");
  const thursday = nextDay({ ...wednesday, ...good }, rules, at(0, 1, 3));
  assert.deepEqual(thursday.week, [1, 0, 1, 0, 0, 0, 0]);
  // Closed over Thursday and Friday, opened on Saturday: the two days with nobody there are not met.
  assert.deepEqual(recall(keep({ ...thursday, ...good }), rules, at(10, 0, 5)).week, [1, 0, 1, 1, 0, 0, 0]);
  assert.deepEqual(recall(keep({ ...thursday, ...good }), rules, at(10, 0, 7)).week, [0, 0, 0, 0, 0, 0, 0], "the Monday after");
  assert.deepEqual(nextDay({ ...thursday, day: "2026-11-29", ...good }, rules, at(0, 1, 7)).week, [0, 0, 0, 0, 0, 0, 0], "Sunday night with the app open");
  // The same day: the week is as it was kept. Something else in its place is no week.
  assert.deepEqual(recall(keep(thursday), rules, at(10, 0, 3)).week, [1, 0, 1, 0, 0, 0, 0]);
  assert.deepEqual(recall(keep({ ...thursday, week: "x" }), rules, at(10, 0, 3)).week, [0, 0, 0, 0, 0, 0, 0]);
});

test("after every fourth session of the day the break is the long one", () => {
  assert.equal(breakAfter(rules, { sessions: 3 }), 5);
  assert.equal(breakAfter(rules, { sessions: 4 }), 15);
  assert.equal(breakAfter(rules, { sessions: 5 }), 5);
  assert.equal(breakAfter(rules, { sessions: 8 }), 15);
  assert.equal(breakAfter({ ...rules, longBreak: 0 }, { sessions: 4 }), 5, "no long break");
  assert.equal(breakAfter({ ...rules, longBreak: 3 }, { sessions: 4 }), 5, "never shorter than the others");
});

test("in a session Paws looks away every twenty minutes for twenty seconds, but not in the last minute", () => {
  const long: Run = { kind: "focus", beganAt: at(9), endsAt: at(9, 45), meal: false };
  assert.equal(lookAt(long, at(9, 5)), at(9, 20));
  assert.equal(looking(long, at(9, 19) + 59000), null);
  assert.equal(looking(long, at(9, 20) + 20), at(9, 20));
  assert.equal(looking(long, at(9, 20) + 19000), at(9, 20));
  assert.equal(looking(long, at(9, 20) + 20000), null);
  assert.equal(lookAt(long, at(9, 20) + 20), at(9, 40));
  assert.equal(lookAt(long, at(9, 41)), null);
  const usual: Run = { ...long, endsAt: at(9, 25) };
  assert.equal(lookAt(usual, at(9)), at(9, 20), "once in 25 minutes");
  assert.equal(lookAt(usual, at(9, 21)), null);
  assert.equal(lookAt({ ...long, endsAt: at(9, 20) }, at(9)), null, "20 minutes: the session ends there");
  assert.equal(lookAt({ ...long, kind: "break" }, at(9, 5)), null);
  assert.equal(looking({ ...long, kind: "meeting" }, at(9, 20) + 20), null);
});

test("a call that is running goes on when the app opens; one that ran out is over and counts as nothing", () => {
  const run: Run = { kind: "meeting", beganAt: at(10), endsAt: at(10, 30), meal: false };
  const left = dayFrom(at(8), { run, lastBreak: at(9), seen: at(10) });
  const during = recall(keep(left), rules, at(10, 20));
  assert.deepEqual([during.run, during.lastBreak], [run, at(9)]);
  const after = recall(keep(left), rules, at(10, 40));
  assert.deepEqual([after.run, after.sessions, after.breaks, after.lastBreak], [null, 0, 0, at(9)]);
});

test("a streak is days in a row whose goals were met, and only a day someone was there ends it", () => {
  const good = { glasses: 5, lunch: true, sessions: 4 };
  // Monday and Tuesday met.
  const tuesday = nextDay(dayFrom(at(8), good), rules, at(0, 1, 1));
  assert.deepEqual([tuesday.streak, tuesday.best], [1, 1]);
  const wednesday = nextDay({ ...tuesday, ...good, here: at(9, 0, 1) }, rules, at(0, 1, 2));
  assert.deepEqual([wednesday.streak, wednesday.best], [2, 2]);
  // Wednesday: nobody there, the bar left on. The streak is as it was.
  const thursday = nextDay(wednesday, rules, at(0, 1, 3));
  assert.deepEqual([thursday.streak, thursday.best], [2, 2]);
  // Thursday: someone there, one glass short. It ends, and the best stays.
  const friday = nextDay({ ...thursday, ...good, glasses: 4, here: at(9, 0, 3) }, rules, at(0, 1, 4));
  assert.deepEqual([friday.streak, friday.best], [0, 2]);
  assert.equal(streakNow(rules, { ...wednesday, ...good }), 3, "today counts once it is met");
  assert.equal(streakNow(rules, wednesday), 2, "and not before");
});

test("a weekend, a holiday and time away cost a streak nothing", () => {
  const good = { glasses: 5, lunch: true, sessions: 4 };
  const on = (days: number, change: Partial<Memory> = {}): Memory => ({ ...dayFrom(at(8, 0, days)), streak: 3, best: 3, here: at(9, 0, days), ...change });
  assert.equal(streakAfter(rules, on(5)), 3, "a Saturday with a press, weekends off");
  assert.equal(streakAfter(rules, on(5, good)), 4, "a Saturday whose goals were met all the same");
  assert.equal(streakAfter({ ...rules, weekendsOff: false }, on(5)), 0, "a Saturday where weekends are working days");
  assert.equal(streakAfter(rules, on(1, { holiday: midnight(at(0), 7) })), 3, "a day of a holiday, the one it began on too");
  assert.equal(streakAfter(rules, on(1, { holiday: midnight(at(0), 1) })), 0, "the day of return is a day like any other");
  assert.equal(streakAfter(rules, on(1, { here: at(9) })), 3, "nobody there since Monday");
  // Closed on a met Friday, opened ten days later: Friday counts, the days between do not.
  const back = recall(keep({ ...on(4, good) }), rules, at(9, 0, 14));
  assert.deepEqual([back.streak, back.best], [4, 4]);
  // Closed on a Friday that was not met.
  assert.equal(recall(keep(on(4)), rules, at(9, 0, 14)).streak, 0);
});

test("a week that is over goes to the front of the weeks before, at most three, with a week never seen between as empty", () => {
  const good = { glasses: 5, lunch: true, sessions: 4 };
  // A week with Monday, Wednesday and Friday met, closed on its Friday evening.
  const friday = dayFrom(at(8, 0, 4), { ...good, week: [1, 0, 1, 0, 0, 0, 0], past: [31, 4] });
  const saturday = nextDay(friday, rules, at(0, 1, 5));
  assert.deepEqual([saturday.week, saturday.past], [[1, 0, 1, 0, 1, 0, 0], [31, 4]], "the same week: nothing moves");
  const monday = nextDay(nextDay(saturday, rules, at(0, 1, 6)), rules, at(0, 1, 7));
  assert.deepEqual([monday.week, monday.past], [[0, 0, 0, 0, 0, 0, 0], [21, 31, 4]], "Monday, Wednesday and Friday are bits 0, 2 and 4");
  const after = nextDay(nextDay({ ...monday, ...good }, rules, at(0, 1, 8)), rules, at(0, 1, 14));
  assert.deepEqual(after.past, [1, 21, 31], "the oldest of four is gone");
  // Opened again in the next week but one: last week was never seen.
  assert.deepEqual(recall(keep(friday), rules, at(9, 0, 14)).past, [0, 21, 31]);
  assert.deepEqual(recall(keep(friday), rules, at(9, 0, 70)).past, [0, 0, 0], "ten weeks later");
  assert.deepEqual(recall(keep(friday), rules, at(9, 0, 4)).past, [31, 4], "the same day");
  // A clock set back a week: what is kept stays, and the week begins empty.
  const set = recall(keep(friday), rules, at(9, 0, -3));
  assert.deepEqual([set.week, set.past], [[0, 0, 0, 0, 0, 0, 0], [31, 4]]);
});

test("a new record has no weeks before and no streak, and what is not a history is none", () => {
  const fresh = freshDay(at(9));
  assert.deepEqual([fresh.past, fresh.streak, fresh.best], [[], 0, 0]);
  const odd = recall(keep({ ...dayFrom(at(8)), past: "x", streak: -2, best: "9" } as never), rules, at(9));
  assert.deepEqual([odd.past, odd.streak, odd.best], [[], 0, 0]);
  const long = recall(keep({ ...dayFrom(at(8)), past: [1, 2, 3, 4, 5], streak: 6, best: 2 }), rules, at(9));
  assert.deepEqual([long.past, long.streak, long.best], [[1, 2, 3], 6, 6]);
});
