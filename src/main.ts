// Paws began as the focus-timer example of the BUSY Bar Emulator, Copyright (C) 2026 Flipper FZCO, GNU General
// Public License version 2 or later, and some lines of this file are still its. Paws as a whole is under version
// 3: see LICENSE.
import { formatDay, formatHM, formatMonth, formatWeekday } from "@shared/datetime";
import { AWAY_DAYS, MEETING_MS, MEETING_STEP_MS, MINUTE, QUIET_MS, breakAfter, breaksOn, closeBreak, closeFocus, dayOf, daysBetween, daysOff, food, freshDay, glassEvery, idleAt, isMeal, isOff, isWeekend, lookAt, looking, met, minuteOf, moveHoliday, need, nextChange, nextDay, nextWorkday, partyOn, recall, rest, streakNow, water, weekdayOf } from "@shared/day";
import type { Memory, Need, Party, Quiet, Rules, Run } from "@shared/day";
import { device } from "@shared/device";
import { createScreen, type Element } from "@shared/screen";
import { flag, integer, loadValues, timeOfDay } from "@shared/settings";
import manifest from "./appmeta/manifest.json";
import { KINDS, MOMENTS, OPENINGS, WHITE, back, front, type Mode, type MomentName, type SceneName, type View } from "@shared/view";

/** The name the app draws under; the device clears elements by this id. */
const APP = manifest.id;

/** The light blinks blue for a glass and at the end of a break, green for a session done and for lunch. */
const WATER = "#2FA8FFFF";
const GREEN = "#30E060FF";

/** The day a holiday ends, for "Back Mon": the weekday within a week, the date beyond it. */
function backLabel(holiday: number, now: number): string {
  const date = new Date(holiday);
  return daysBetween(now, holiday) <= 6 ? formatWeekday(date) : `${formatDay(date)} ${formatMonth(date)}`;
}

/** The wheel changes the session's length in steps of this many minutes. */
const STEP_MINUTES = 5;
const MAX_MINUTES = 180;
/** A turn of the wheel shows the new length on the front display for this long. */
const PEEK_MS = 2500;
const STORAGE_KEY = "paws";

/** The rules of the day (shared/day.ts) read most of the settings; the rest is the app's own. */
type Settings = Rules & {
  /** The session length the app opens with, until the wheel chooses another. */
  minutes: number;
  sound: boolean;
  /** The smoke break is one of the kinds of break. */
  smoking: boolean;
  /** In a session Paws looks away every twenty minutes. */
  lookAway: boolean;
};

async function loadSettings(): Promise<Settings> {
  const values = await loadValues();
  return {
    minutes: integer(values, "minutes", 25, 1, MAX_MINUTES),
    breakMinutes: integer(values, "break_minutes", 5, 0, 60),
    breakDue: integer(values, "break_due", 60, 15, 240),
    glasses: integer(values, "glasses", 6, 1, 20),
    lunch: flag(values, "lunch", true),
    lunchFrom: timeOfDay(values, "lunch_from", 12 * 60),
    mealMinutes: integer(values, "meal_minutes", 30, 5, 120),
    dayStart: timeOfDay(values, "day_start", 9 * 60),
    dayEnd: timeOfDay(values, "day_end", 17 * 60),
    remind: flag(values, "remind_end", true),
    weekendsOff: flag(values, "weekends_off", true),
    sessions: integer(values, "sessions", 4, 0, 20),
    longBreak: integer(values, "long_break", 15, 0, 60),
    sound: flag(values, "sound", true),
    smoking: flag(values, "smoking", false),
    lookAway: flag(values, "look_away", true),
  };
}

function saveMemory(memory: Memory): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch (err) {
    console.error(`${APP}: the day was not saved: ${String(err)}`);
  }
}

// ------------------------------------------------------------------------------------------------------- the app

/**
 * Entry point, called at the end of the file: the device runs this script from top to bottom and starts nothing by itself.
 */
function main(): void {
  const screen = createScreen(APP);
  let settings: Settings | null = null;
  /** What is kept (shared/day.ts). A session or break that is running is `memory.run`: there is no other mode. */
  let memory: Memory = freshDay(Date.now());
  /** The length of the next session, minutes: the wheel's choice, or the setting's. */
  let minutes = 25;
  /**
   * Paws is awake. It falls asleep when night begins and stays asleep after it, until a press by day: a bar left
   * on over a night or a weekend shows a sleeping cat, not one that has asked an empty room for a break.
   */
  let woke = true;
  /** Until when each prompt stays quiet after "not now". */
  const quiet: Quiet = { leave: 0, lunch: 0, break: 0, water: 0 };
  /**
   * The working day is over and Paws has taken note: once for each evening, when it is awake at home at the end of
   * day, or when what ran across the end is done.
   */
  let late = false;
  /** Since when Paws has been saying that the day is done. Unanswered for a while, it sleeps by itself. */
  let leaveSince = 0;
  /** What the home screen showed when it was last drawn, or null in a session or a break. */
  let shown: Need | null = null;
  /** Until when the front display shows the length the wheel has just chosen. */
  let peekUntil = 0;
  /** Until when the party goes on, and what it is for. 0: there is none. */
  let partyUntil = 0;
  let partyFor: Party = "week";
  /** Until when Paws says "Hi again", and after how many days with nobody there. 0: it does not. */
  let hiUntil = 0;
  let hiDays = 0;
  /** The scene last sent. A scene that comes up anew begins with its `once` section. */
  let playing: SceneName | null = null;
  /** When Paws last began to look away in a session: once for each time. */
  let looked = 0;
  /** The moment last begun, when the bar takes it away, how many there have been, and whether it says that the day's goals are met. */
  let moment: { name: MomentName; until: number; turn: number; crowns: boolean } | null = null;
  /** The day's goals are met, and it has been said: once a day, by the count that completed them. */
  let metToday = false;
  /** The app has drawn its first screen. Before that nothing is a change, so nothing is a moment. */
  let opened = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const report = (err: unknown) => console.error(`${APP}: ${err instanceof Error ? err.message : String(err)}`);

  /** Clearing a timer that was never set makes the firmware log a warning, so only a pending one is cleared. */
  function cancel(): void {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  const asks = (s: Settings, now: number): Need => need(s, memory, !woke, quiet, now);
  /** How many kinds of break the wheel turns through: all of them, or all but the last. */
  const kinds = (s: Settings): number => (s.smoking ? KINDS.length : KINDS.length - 1);

  /** A moment begins: the next draw lays it over the scene. */
  function cheer(name: MomentName): void {
    // Every count is written down before its moment begins. The glass, the meal or the session that completes the
    // day's goals says so, once: after it the day is met, and a later glass is a glass.
    const crowns = settings !== null && !metToday && (name === "sip" || name === "lick" || name === "done") && met(settings, memory);
    if (crowns) metToday = true;
    moment = { name, until: Date.now() + MOMENTS[name] * 1000, turn: (moment?.turn ?? 0) + 1, crowns };
  }

  function render(led: string | null = null): void {
    if (stopped || !settings) return;
    const now = Date.now();
    const run = memory.run;
    const mode: Mode = run ? run.kind : "home";
    const asked = run ? "none" : asks(settings, now);
    // Paws begins to say that the day is done: it is heard, and from now it waits for the answer.
    if (asked === "leave" && shown !== "leave") {
      leaveSince = now;
      sound("mrrow");
    }
    shown = run ? null : asked;
    const kind = memory.kind % kinds(settings);
    const party = !run && now < partyUntil ? partyFor : null;
    const hi = !run && now < hiUntil && asked !== "holiday" && asked !== "sleep" ? hiDays : 0;
    // After twice the time, a break or a glass is long overdue: Paws looks it. Nothing else changes.
    const scene: SceneName =
      mode === "focus" ? "focus"
      : mode === "meeting" ? "meeting"
      : mode === "break" ? (run?.meal ? "eating" : KINDS[kind]!.scene)
      : party ? "party"
      : asked === "holiday" ? "holiday"
      : hi > 0 ? "back-again"
      : asked === "sleep" ? "asleep"
      : asked === "leave" ? "wave"
      : asked === "lunch" ? "lunch"
      : asked === "break" ? (now - memory.lastBreak >= 2 * settings.breakDue * MINUTE ? "flat" : "no-break")
      : asked === "water" ? (now - memory.lastGlass >= 2 * glassEvery(settings) * MINUTE ? "parched" : "thirsty")
      : idleAt(settings, memory, now);
    // The week so far, and the day's plan while nothing of it is done.
    const today = weekdayOf(now);
    const days = settings.weekendsOff ? 5 : 7;
    const untouched = memory.sessions + memory.glasses + memory.breaks === 0 && !memory.lunch;
    const streak = streakNow(settings, memory);
    const hm = (minute: number): string => formatHM(new Date(2000, 0, 1, 0, minute));
    const plan = [...(settings.sessions > 0 ? [`${settings.sessions} focus`] : []), `${settings.glasses} water`, settings.lunch ? `lunch ${hm(settings.lunchFrom)}` : `to ${hm(settings.dayEnd)}`];
    const view: View = {
      mode,
      need: asked,
      scene,
      started: true,
      fromSleep: playing === "asleep",
      moment: moment && now < moment.until ? { name: moment.name, turn: moment.turn } : null,
      time: formatHM(new Date(now)),
      minutes,
      peek: !run && now < peekUntil,
      endsAt: run ? run.endsAt : 0,
      left: run ? Math.max(1, Math.ceil((run.endsAt - now) / MINUTE)) : 0,
      meal: run?.meal === true,
      mealMinutes: settings.mealMinutes,
      kind,
      party,
      back: asked === "holiday" ? backLabel(memory.holiday, now) : "",
      hi,
      breaks: breaksOn(settings),
      wakes: !woke && !isOff(settings, now),
      sleeps: settings.weekendsOff && isWeekend(now) ? "weekend" : settings.dayStart < settings.dayEnd && minuteOf(now) < settings.dayStart ? "early" : "night",
      dayStart: hm(settings.dayStart),
      lunch: settings.lunch && minuteOf(now) >= settings.lunchFrom ? memory.lunch : null,
      food: food(settings, memory, now),
      water: water(settings, memory, now),
      rest: rest(settings, memory, now),
      sinceBreak: Math.floor((now - memory.lastBreak) / MINUTE),
      sessions: memory.sessions,
      sessionGoal: settings.sessions,
      glasses: memory.glasses,
      goal: settings.glasses,
      past: memory.past,
      streak,
      best: Math.max(memory.best, streak),
      dayMet: moment !== null && now < moment.until && moment.crowns,
      week: [0, 1, 2, 3, 4, 5, 6].map((i) => (i >= days ? -1 : i < today ? (memory.week[i] === 1 ? 2 : 1) : i > today ? 0 : met(settings!, memory) ? 4 : 3)),
      plan: untouched && !isOff(settings, now) && minuteOf(now) < (settings.lunch ? settings.lunchFrom : 12 * 60) ? plan : null,
      hints: mode === "home" && asked === "none" && hi === 0 && !party && new Date(now).getMinutes() % 2 === 1,
      long: run?.kind === "break" && !run.meal && breakAfter(settings, memory) > settings.breakMinutes && run.endsAt - run.beganAt === breakAfter(settings, memory) * MINUTE,
      breaksTaken: memory.breaks,
      smokes: memory.smokes,
    };
    const frame = (started: boolean): Element[] => [...front({ ...view, started }), ...back(view)];
    // A scene that has just come up and begins with a section of its own: that section, and its loop right behind.
    const opens = playing !== scene && OPENINGS[scene] !== undefined;
    playing = scene;
    opened = true;
    if (opens) void screen.draw(frame(false), led, frame(true));
    else void screen.draw(frame(true), led);
  }

  /** Paws' own voice, from the app's sounds folder (made by tools/art): a greeting, a call, and a sleepy one. */
  function sound(name: "mrrp" | "chirrup" | "mrrow"): void {
    if (settings?.sound) void device.AudioPlay({ application_name: APP, path: `sounds/${name}.snd` } as never).catch(report);
  }

  /** Something happened: it is written down, with the moment. */
  function remember(change: Partial<Memory>): void {
    memory = { ...memory, ...change, seen: Date.now() };
    saveMemory(memory);
  }

  /**
   * Looks at the clock before anything else happens. A new day while the app stays open: the counts and the clocks
   * start again, so a glass or a break after midnight is the new day's first; what is running goes on, but a meal
   * begun before midnight is not the new day's lunch.
   *
   * The working day ends for Paws when it is awake at home at the end of day, or when what ran across the end is
   * done. On a Friday, and on 31 December, there is a party first. Then Paws says that the day is done and waits
   * for an answer (the rules make that a prompt, "leave"); where it is not to remind, it yawns and sleeps at once.
   */
  function catchUp(s: Settings): void {
    const now = Date.now();
    if (memory.day !== dayOf(now)) {
      memory = nextDay(memory, s, now);
      saveMemory(memory);
      metToday = false;
    }
    if (!isOff(s, now)) {
      late = false;
      return;
    }
    if (!woke || memory.run || late) return;
    late = true;
    const what = opened ? partyOn(now) : null;
    if (what) {
      partyFor = what;
      partyUntil = now + MINUTE;
    }
    if (!s.remind) {
      woke = false;
      if (!what) cheer("yawn");
    }
  }

  /** Paws wakes. If nobody was there for days, it says so for a minute: "Hi again". */
  function greet(now: number): void {
    const off = daysOff(memory, now);
    if (off < AWAY_DAYS) return;
    hiDays = off;
    hiUntil = now + MINUTE;
  }

  /** Someone is there. Written down once a day: the days off are counted from the last of these. */
  function present(now: number): void {
    if (dayOf(memory.here) !== dayOf(now)) remember({ here: now });
  }

  /**
   * A holiday begins, with a hold of Start at home: until the next working day, unless the wheel says another.
   * Paws is asleep under it: when the holiday is over it sleeps on, until a press by day wakes it.
   */
  function holiday(s: Settings): void {
    const now = Date.now();
    remember({ holiday: nextWorkday(s, now), here: now });
    woke = false;
    partyUntil = 0;
    hiUntil = 0;
    peekUntil = 0;
    schedule(s);
    render();
  }

  /** What ran is over and Paws is asleep, as it was before: it does not drop into its bed, it yawns into it. */
  function settle(): void {
    if (!woke) cheer("yawn");
  }

  /** Paws goes to sleep: told to with OK, or by itself when nobody answers. */
  function goodnight(): void {
    woke = false;
    cheer("yawn");
  }

  /**
   * The one timer. In a session or a break it fires when the minutes left become one less, and when the time is up;
   * at home, when the screen can next change.
   */
  function schedule(s: Settings): void {
    cancel();
    const now = Date.now();
    const run = memory.run;
    let at = run ? Math.min(run.endsAt, now + ((run.endsAt - now) % MINUTE || MINUTE)) + 20 : nextChange(s, memory, quiet, now) + 50;
    if (!run && peekUntil > now) at = Math.min(at, peekUntil + 20);
    // In a session, the next time to look away.
    const look = run && s.lookAway ? lookAt(run, now) : null;
    if (look !== null) at = Math.min(at, look + 20);
    // When a moment that stands in for words is over, they come back: at home the clock and the meters, in a
    // session or a break the minutes.
    if (moment && moment.until > now && (!run || moment.name === "lookaway" || moment.name === "done" || moment.crowns)) at = Math.min(at, moment.until + 20);
    if (!run && partyUntil > now) at = Math.min(at, partyUntil + 20);
    if (!run && hiUntil > now) at = Math.min(at, hiUntil + 20);
    timer = setTimeout(wake, Math.max(50, at - now));
  }

  /** A session or a break begins. It is written down, so that it goes on if the app is closed meanwhile. */
  function begin(s: Settings, kind: Run["kind"], ms: number): void {
    const now = Date.now();
    const run: Run = { kind, beganAt: now, endsAt: now + ms, meal: kind === "break" && isMeal(s, memory, now, ms) };
    remember(kind === "focus" ? { run, minutes } : { run });
    schedule(s);
  }

  /** The session is over, run out or ended with Start: a break follows, where there are breaks. */
  function endFocus(s: Settings, run: Run): void {
    const before = memory.sessions;
    memory = closeFocus(memory, run, Date.now());
    const counted = memory.sessions > before;
    if (counted) cheer("done");
    if (breaksOn(s)) {
      // After every fourth session that counts, the long break.
      begin(s, "break", (counted ? breakAfter(s, memory) : s.breakMinutes) * MINUTE);
    } else {
      if (!counted) settle();
      saveMemory(memory);
      schedule(s);
    }
  }

  /** A break is closed and counted. A meal cut short: Paws does not ask for lunch again right away. Says if it was eaten. */
  function closeRunningBreak(s: Settings, run: Run): boolean {
    const now = Date.now();
    const result = closeBreak(memory, run, s, now);
    memory = result.memory;
    if (result.counted && !run.meal && KINDS[memory.kind % kinds(s)]!.scene === "smoke") memory = { ...memory, smokes: memory.smokes + 1 };
    if (run.meal && !result.eaten) quiet.lunch = now + QUIET_MS;
    return result.eaten;
  }

  /** The break is over, run out or ended with Start. */
  function endBreak(s: Settings, run: Run): void {
    const eaten = closeRunningBreak(s, run);
    saveMemory(memory);
    if (eaten) cheer("lick");
    else settle();
    schedule(s);
  }

  /** The call is over: its time is up, or Start ended it. Nothing is counted, and Paws is where it was. */
  function endMeeting(s: Settings): void {
    remember({ run: null });
    settle();
    schedule(s);
  }

  /**
   * A call begins, with a hold of OK. What runs is closed as Start would close it, but no break follows a session:
   * the call is what comes next. Asleep by day, the hold wakes Paws as any press does.
   */
  function call(s: Settings): void {
    const now = Date.now();
    const run = memory.run;
    if (run?.kind === "meeting") return;
    if (run?.kind === "focus") memory = closeFocus(memory, run, now);
    else if (run) closeRunningBreak(s, run);
    else if (!woke && !isOff(s, now)) {
      woke = true;
      memory = { ...memory, lastBreak: now, lastGlass: now };
    }
    partyUntil = 0;
    hiUntil = 0;
    if (dayOf(memory.here) !== dayOf(now)) memory = { ...memory, here: now };
    begin(s, "meeting", MEETING_MS);
    render();
  }

  function wake(): void {
    timer = undefined;
    if (stopped || !settings) return;
    catchUp(settings);
    const run = memory.run;
    if (run && Date.now() >= run.endsAt) {
      if (run.kind === "focus") {
        sound("mrrp");
        endFocus(settings, run);
        render(GREEN);
      } else if (run.kind === "break") {
        sound("chirrup");
        endBreak(settings, run);
        render(WATER);
      } else {
        // Without a sound: the talk may go on.
        endMeeting(settings);
        render();
      }
      return;
    }
    const now = Date.now();
    // Twenty minutes of a session have gone by: Paws looks away from its screen, and the light says so.
    const look = run && settings.lookAway ? looking(run, now) : null;
    if (look !== null && look !== looked) {
      looked = look;
      cheer("lookaway");
      schedule(settings);
      render(WHITE);
      return;
    }
    // The party is over. Where Paws went to sleep with it, it yawns now; otherwise it says that the day is done.
    if (partyUntil > 0 && now >= partyUntil) {
      partyUntil = 0;
      if (!run && !woke) cheer("yawn");
    }
    // Nobody answered "the day is done" for a while: whoever was here has left, and Paws sleeps.
    if (!run && shown === "leave" && now >= partyUntil && now >= leaveSince + QUIET_MS && asks(settings, now) === "leave") goodnight();
    schedule(settings);
    render();
  }

  // The listener keeps the app alive; a long Back is handled by the firmware and quits it.
  const unbind = listen("input", (event) => {
    if (stopped || !settings) return;
    // A turn of the wheel, a press and release of a button, or a hold of OK or Start. The other actions (press,
    // release, repeat) do nothing; a hold is not followed by a short press.
    const held = event.action === "long" && (event.key === "ok" || event.key === "start");
    if (event.key !== "encoder" && event.action !== "short" && !held) return;
    const s = settings;
    catchUp(s);
    const now = Date.now();
    const run = memory.run;
    const away = memory.holiday > now;
    if (held) {
      // A hold of OK is a call; a hold of Start, at home, a holiday. On holiday a hold is nothing.
      if (away) return;
      if (event.key === "ok") call(s);
      else if (!run) holiday(s);
      return;
    }
    let led: string | null = null;

    if (!run) {
      if (event.key === "back") {
        // Back leaves the app: with the timer cleared and the handler detached, nothing keeps it alive. A short Back
        // leaves the app's screen on firmware 1.4.1; the moment is written down, so that time away counts from here.
        screen.forget();
        remember({});
        stopped = true;
        cancel();
        // Not detached from inside the handler itself: the unbind would stop the app while this handler still runs.
        setTimeout(unbind, 0);
        return;
      }
      // A press ends the party: whoever presses wants what the control does, and the screen has to show it.
      partyUntil = 0;
      // A press ends the greeting too, and does nothing else: under it the screen may have something to ask.
      if (now < hiUntil) {
        hiUntil = 0;
        schedule(s);
        render();
        return;
      }
      if (away) {
        if (event.key === "encoder") {
          // The wheel moves the day of return.
          remember({ holiday: moveHoliday(s, memory.holiday, event.delta > 0, now) });
        } else if (event.key === "start") {
          // "I am back": the holiday is over now. By day Paws is awake, and says so if days have gone by. In the
          // evening it leaves the fire for its bed.
          remember({ holiday: 0 });
          woke = !isOff(s, now);
          if (woke) {
            greet(now);
            remember({ here: now, lastBreak: now, lastGlass: now });
          } else {
            cheer("yawn");
          }
        } else {
          return;
        }
        schedule(s);
        render();
        return;
      }
      // Asleep by day: whoever presses is here. The press wakes Paws, starts the clocks, and does nothing else.
      if (!woke && !isOff(s, now)) {
        woke = true;
        greet(now);
        cheer("wake");
        remember({ lastBreak: now, lastGlass: now, here: now });
        schedule(s);
        render();
        return;
      }
      present(now);
      // The screen is drawn when something changes, but a press can come a moment before. If Paws needs something
      // other than what is shown, the press shows that first: a control only ever does what the screen says.
      const asked = asks(s, now);
      if (asked !== shown) {
        schedule(s);
        render();
        return;
      }
      if (event.key === "encoder") {
        if (asked === "leave" || asked === "lunch" || asked === "break" || asked === "water") {
          // "Not now": this prompt is quiet for a while, and the next one can show.
          quiet[asked] = now + QUIET_MS;
        } else {
          // From a length that is not a multiple of five (set in the settings) the wheel goes to the next multiple.
          const stepped = event.delta > 0 ? Math.floor(minutes / STEP_MINUTES) + 1 : Math.ceil(minutes / STEP_MINUTES) - 1;
          minutes = Math.min(MAX_MINUTES, Math.max(STEP_MINUTES, stepped * STEP_MINUTES));
          peekUntil = now + PEEK_MS;
        }
      } else if (event.key === "ok") {
        if (asked === "leave") {
          goodnight();
        } else if (asked === "lunch") {
          // Eaten elsewhere: said, not timed.
          remember({ lunch: true });
          cheer("lick");
          led = GREEN;
        } else {
          remember({ lastGlass: now, glasses: memory.glasses + 1 });
          // Asleep, it takes its glass in bed and sleeps on.
          cheer(asked === "sleep" ? "nightsip" : "sip");
          led = WATER;
        }
      } else if (asked === "lunch") {
        begin(s, "break", s.mealMinutes * MINUTE);
      } else if (asked === "break") {
        begin(s, "break", s.breakMinutes * MINUTE);
      } else {
        begin(s, "focus", minutes * MINUTE);
      }
      schedule(s);
      render(led);
      return;
    }

    // In a session, a break or a call.
    present(now);
    if (event.key === "encoder") {
      if (run.kind === "meeting") {
        // The wheel makes the call a quarter of an hour longer or shorter: at least a minute from now, at most four hours.
        const endsAt = run.endsAt + (event.delta > 0 ? MEETING_STEP_MS : -MEETING_STEP_MS);
        remember({ run: { ...run, endsAt: Math.min(now + 240 * MINUTE, Math.max(now + MINUTE, endsAt)) } });
        schedule(s);
      } else {
        // The wheel turns through the kinds of break. Not written down until the break ends: a turn is not an event.
        if (run.kind !== "break" || run.meal) return;
        // One kind on for an event, as the wheel at home goes one length on, however many clicks it carries.
        const n = kinds(s);
        memory = { ...memory, kind: ((memory.kind % n) + (event.delta > 0 ? 1 : n - 1)) % n };
      }
    } else if (event.key === "ok") {
      remember({ lastGlass: now, glasses: memory.glasses + 1 });
      cheer("sip");
      led = WATER;
    } else if (event.key === "start") {
      if (run.kind === "focus") endFocus(s, run);
      else if (run.kind === "break") endBreak(s, run);
      else endMeeting(s);
    } else {
      // Back cancels: nothing is counted. A short Back clears the app's screen on firmware 1.3.1 and leaves it on
      // 1.4.1, so whatever comes next is drawn from nothing, after a clear. After a cancelled break Paws does not
      // ask for one again right away.
      screen.forget();
      remember({ run: null });
      if (run.kind === "break") {
        quiet.break = now + QUIET_MS;
        if (run.meal) quiet.lunch = now + QUIET_MS;
      }
      settle();
      schedule(s);
    }
    render(led);
  });

  void (async () => {
    settings = await loadSettings();
    const now = Date.now();
    let kept: string | null = null;
    try {
      kept = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Nothing kept.
    }
    // What was kept, as it stands now: a session still running goes on, one that ran out meanwhile is counted.
    memory = recall(kept, settings, now);
    if (JSON.stringify(memory) !== kept) saveMemory(memory);
    minutes = memory.minutes > 0 ? memory.minutes : settings.minutes;
    // Goals met before the app opened have been said, or were met with nobody there to tell.
    metToday = met(settings, memory);
    // Opening the app in working time is being here: Paws is awake, and after days away it says so. Not on holiday.
    woke = !isOff(settings, now) && memory.holiday <= now;
    if (woke) {
      greet(now);
      present(now);
    }
    schedule(settings);
    render();
  })().catch(report);
}

main();
