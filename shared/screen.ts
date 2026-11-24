// Parts of this file come from the focus-timer example of the BUSY Bar Emulator, Copyright (C) 2026 Flipper FZCO,
// GNU General Public License version 2 or later. Paws as a whole is under version 3: see LICENSE.
import { device } from "@shared/device";

/**
 * One thing on a display, in the bar's own words (POST /api/display/draw): a text, an image, an animation, a
 * countdown or a rectangle, placed by x, y and align. `display: "back"` puts it on the back display.
 */
export type Element = Record<string, unknown> & { id: string };

/**
 * Draws screens by sending only what changed since the last one.
 *
 * Every call to the bar is an HTTP request its web server handles, so a second-by-second counter should cost one
 * small element, not the whole screen. The screen remembers what it sent by element id; `draw(elements)` sends the
 * elements whose description changed and removes the ones that are gone.
 */
export function createScreen(app: string) {
  /** What is on the displays now, by element id. */
  const shown = new Map<string, string>();
  /**
   * Draws run one after another. What is asked for meanwhile waits in `next`, and a newer request takes the place of
   * one still waiting: only the latest state is worth sending. A request can be two frames, the second to follow
   * the first at once; they wait and are replaced together.
   */
  let busy = false;
  let next: { elements: Element[]; led: string | null }[] | null = null;
  /** Set by forget(): nothing is known about the displays, so the next draw clears them first. */
  let unknown = false;

  async function send(elements: Element[], led: string | null): Promise<void> {
    const request = { application_name: app, priority: 50, elements, ...(led ? { led_notification_color: led } : {}) };
    // busy-lib's element types are stricter than the firmware about optional fields; the shapes here follow the firmware.
    await device.DisplayDraw(request as never);
  }

  async function once(elements: Element[], led: string | null): Promise<void> {
    if (unknown) {
      // After a short Back: firmware 1.3.1 has cleared the app's screen, 1.4.1 has not. Clearing it here makes both
      // the same, so nothing of the last screen is left under the next one. It stays unknown until the clear works.
      shown.clear();
      await device.DisplayClear({ application_name: app });
      unknown = false;
    }
    const changed = elements.filter((e) => shown.get(e.id) !== JSON.stringify(e));
    const present = new Set(elements.map((e) => e.id));
    const gone = [...shown.keys()].filter((id) => !present.has(id));
    try {
      if (gone.length > 0) await device.DisplayClear({ application_name: app, element_ids: gone });
      // A blink of the light needs a draw request to ride on: the first element is sent again.
      if (led && changed.length === 0 && elements.length > 0) changed.push(elements[0]!);
      if (changed.length > 0) await send(changed, led);
    } catch (err) {
      // Firmware 1.3.1 refuses a whole delete when one of its ids is already gone (a short Back clears the app's
      // screen there), and an element cannot change its type under the same id. Either way: start from nothing.
      console.error(`${app}: drawing everything again: ${err instanceof Error ? err.message : String(err)}`);
      // What is on the displays is not known now. If the clear below fails too, it stays unknown, and the next draw
      // begins with a clear: otherwise what is left of this screen would stand under the next one.
      unknown = true;
      shown.clear();
      await device.DisplayClear({ application_name: app });
      unknown = false;
      if (elements.length > 0) await send(elements, led);
    }
    shown.clear();
    for (const e of elements) shown.set(e.id, JSON.stringify(e));
  }

  return {
    /**
     * Shows exactly these elements. `led` (#RRGGBBAA) also blinks the bar's light. `then`, when given, is a second
     * frame sent right after the first: for an animation that begins with a part of its own and goes on with a
     * loop, where the same element is sent twice. Errors are reported, not thrown: one failed request must not
     * stop the app.
     */
    async draw(elements: Element[], led: string | null = null, then: Element[] | null = null): Promise<void> {
      const frames = [{ elements, led: led ?? next?.[0]?.led ?? null }];
      if (then) frames.push({ elements: then, led: null });
      next = frames;
      if (busy) return;
      busy = true;
      while (next) {
        const [frame, ...rest] = next;
        next = rest.length > 0 ? rest : null;
        await once(frame!.elements, frame!.led).catch((err: unknown) => console.error(`${app}: ${err instanceof Error ? err.message : String(err)}`));
      }
      busy = false;
    },
    /**
     * Forgets what was sent: the next draw sends everything. For after a short Back, which clears the app's screen
     * on firmware 1.3.1 and leaves it on 1.4.1: sent again in full, the elements are drawn afresh on the one and
     * replaced in place on the other. Nothing is cleared, so an app that always draws the same ids shows no empty
     * moment; one that drops ids across a Back would have to clear them itself.
     */
    forget(): void {
      shown.clear();
    },
  };
}
