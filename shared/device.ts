// Parts of this file come from the focus-timer example of the BUSY Bar Emulator, Copyright (C) 2026 Flipper FZCO,
// GNU General Public License version 2 or later. Paws as a whole is under version 3: see LICENSE.
import { BusyBar } from "@busy-app/busy-lib";

/** Shared device client. */
export const device = new BusyBar({ addr: __BUSY_ADDR__ });
