// The two displays, held to what docs/DESIGN.md says of them: a fixed set of elements, the same ids in every state,
// and no file named that is not in the app. Run with `npm test`.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { states } from "./states.ts";

const all = states(new Date(2026, 10, 23, 14, 32).getTime());
/** Every frame of every state, with the state's name. */
const frames = all.flatMap((s) => [...s.frames, ...(s.after ? [s.after] : [])].map((elements) => ({ name: s.name, elements })));

test("every state has a name of its own", () => {
  const names = all.map((s) => s.name);
  assert.equal(new Set(names).size, names.length, names.join(" "));
});

test("both displays are a fixed set of elements: the same ids, each once, in every state", () => {
  const ids = (elements: { id: string }[]): string => elements.map((e) => e.id).join(" ");
  const first = ids(frames[0]!.elements);
  assert.equal(first.split(" ").length, 35, "8 on the front, 27 on the back");
  assert.equal(new Set(first.split(" ")).size, 35, "no id twice");
  for (const frame of frames) assert.equal(ids(frame.elements), first, frame.name);
});

test("an element keeps its type from state to state: the bar cannot change it under the same id", () => {
  const types = new Map<string, unknown>(frames[0]!.elements.map((e) => [e.id, e.type]));
  for (const frame of frames) for (const e of frame.elements) assert.equal(e.type, types.get(e.id), `${frame.name}: ${e.id}`);
});

test("every animation and every picture a state names is in the app", () => {
  for (const frame of frames) {
    for (const e of frame.elements) {
      if (typeof e.path !== "string") continue;
      assert.equal(existsSync(new URL(`../src/${e.path}`, import.meta.url)), true, `${frame.name}: ${e.path}`);
    }
  }
});

test("text on the bar is printable ASCII", () => {
  for (const frame of frames) {
    for (const e of frame.elements) {
      if (typeof e.text === "string") assert.match(e.text, /^[\x20-\x7e]*$/, `${frame.name}: ${e.id}`);
    }
  }
});

test("a scene that begins with a section of its own is sent twice: that section once, then its loop, which waits", () => {
  const focus = all.find((s) => s.name === "focus")!;
  assert.equal(focus.once, "intro");
  assert.equal(all.find((s) => s.name === "focus-wake")!.once, "wake");
  const scene = (elements: { id: string }[]): Record<string, unknown> => elements.find((e) => e.id === "scene")!;
  assert.deepEqual([scene(focus.frames[0]!).section, scene(focus.frames[0]!).loop], ["intro", false]);
  assert.deepEqual([scene(focus.frames[1]!).section, scene(focus.frames[1]!).loop, scene(focus.frames[1]!).await_previous_end], ["work", true, true]);
});

test("a moment lies over the scene for its seconds, and its slot is unseen after", () => {
  const sip = all.find((s) => s.name === "sip")!;
  const slot = (elements: { id: string }[]): Record<string, unknown> => elements.find((e) => e.id === "moment")!;
  assert.deepEqual([slot(sip.frames[0]!).path, slot(sip.frames[0]!).timeout, slot(sip.frames[0]!).opacity], ["animations/sip.anim", 2, 100]);
  assert.equal(slot(sip.after!).opacity, 0);
});

test("the count that completes the day's goals says so, with the streak, at home and while something runs", () => {
  const words = (name: string): unknown[] => {
    const elements = all.find((s) => s.name === name)!.frames[0]!;
    return ["l1", "l2"].map((id) => elements.find((e) => e.id === id)!.text);
  };
  assert.deepEqual(words("day-met"), ["Goals met", "6 in a row"]);
  assert.deepEqual(words("day-met-session"), ["Goals met", "6 in a row"]);
  assert.deepEqual(words("sip"), ["Water", "4 of 6"]);
});

test("where the day is over the back display is a calendar: the streak, a row for each week kept, this week under them", () => {
  const back = (name: string): Record<string, Record<string, unknown>> => Object.fromEntries(all.find((s) => s.name === name)!.frames[0]!.map((e) => [e.id, e]));
  const done = back("day-done");
  assert.equal(done.b_l0!.text, "6 in a row");
  // Last week, 29: Monday, Wednesday, Thursday and Friday. Four days in one picture, the Friday in its own.
  assert.deepEqual([done.b_h0a!.path, done.b_h0b!.path, done.b_h0a!.opacity], ["images/days4_13.png", "images/week_2.png", 100]);
  assert.deepEqual([done.b_h2a!.path, done.b_h2b!.path], ["images/days4_13.png", "images/week_1.png"], "three weeks ago, 13: not its Friday");
  assert.equal(done.b_day!.text, "4/4 focus, 6/6 water, 5 breaks, lunch");
  // Seven days a week: the rest of a week is three days in one picture.
  assert.deepEqual([back("asleep-seven").b_h0a!.path, back("asleep-seven").b_h0b!.path], ["images/days4_13.png", "images/days3_5.png"]);
  // The app's first week: no week before it, and no row for one.
  const first = back("asleep-first");
  assert.deepEqual([first.b_h0a!.opacity, first.b_h2b!.opacity, first.b_l0!.text], [0, 0, ""]);
  // At home by day none of it shows.
  assert.deepEqual([back("home").b_h0a!.opacity, back("home").b_w0!.opacity], [0, 0]);
});
