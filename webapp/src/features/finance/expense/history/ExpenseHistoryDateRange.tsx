// Copyright (c) 2026 WSO2 LLC. (https://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

import { useState } from "react";
import { Box, ButtonBase, IconButton, Stack, Typography, alpha } from "@wso2/oxygen-ui";
import { ChevronLeftIcon, ChevronRightIcon } from "@wso2/oxygen-ui-icons-react";
import { toIso, todayIso } from "../../util/financeFormat";

/**
 * The month grid behind Claim Range → Custom Date.
 *
 * The source app picks its window on `react-date-range`'s `<DateRange>`
 * (`FilterHolder.tsx:141-152`): click a day to open the range, click a second
 * to close it, never past today. That two-click behaviour is reproduced here
 * on the portal's own primitives rather than by adding the dependency — the
 * port already refuses MUI X's pickers for the same reason (`LeaveDateField`),
 * and a grid drawn from theme tokens is what keeps this looking like the rest
 * of the portal instead of like the app it came from.
 *
 * It selects only. The caller owns the draft and the Apply that commits it,
 * because the same two dates are also editable in the From/To fields above.
 */

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface Month {
  year: number;
  month: number;
}

function monthOf(iso: string): Month {
  const [y, m] = iso.split("-");
  return { year: Number(y), month: Number(m) - 1 };
}

function shiftMonth({ year, month }: Month, by: number): Month {
  const d = new Date(year, month + by, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** The 42 days drawn for a month, including the neighbours that pad the grid. */
function gridDays({ year, month }: Month): Date[] {
  const lead = new Date(year, month, 1).getDay();
  return Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - lead + i));
}

export function ExpenseHistoryDateRange({
  start,
  end,
  onSelect,
}: {
  /** ISO `yyyy-mm-dd`, or "" when nothing is picked yet. */
  start: string;
  end: string;
  onSelect: (start: string, end: string) => void;
}) {
  // Which day opened the range that is still being drawn. Null between
  // selections, which is what makes the next click start a fresh range.
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  // The month on screen is the one holding the current start, until the
  // arrows say otherwise — derived rather than mirrored into an effect, so
  // typing a date into From still moves the grid to it.
  const [paged, setPaged] = useState<Month | null>(null);
  const cursor = paged ?? monthOf(start || todayIso());

  const today = todayIso();
  const atCurrentMonth = cursor.year === monthOf(today).year && cursor.month === monthOf(today).month;

  // While a range is open, the day under the pointer stands in for its end, so
  // the highlight follows the cursor the way the source's does.
  const previewEnd = anchor && hovered ? hovered : end;
  const lo = anchor ? (anchor <= (previewEnd || anchor) ? anchor : previewEnd) : start;
  const hi = anchor ? (anchor <= (previewEnd || anchor) ? previewEnd : anchor) : end;

  const pick = (iso: string) => {
    if (anchor === null) {
      // First click opens a one-day range, as `moveRangeOnFirstSelection={false}` does.
      onSelect(iso, iso);
      setAnchor(iso);
      return;
    }
    // Second click closes it, in whichever order the two days were clicked.
    onSelect(anchor <= iso ? anchor : iso, anchor <= iso ? iso : anchor);
    setAnchor(null);
    setHovered(null);
  };

  return (
    <Box sx={{ width: 266 }} onMouseLeave={() => setHovered(null)}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <IconButton
          size="small"
          aria-label="Previous month"
          onClick={() => setPaged(shiftMonth(cursor, -1))}
        >
          <ChevronLeftIcon size={16} />
        </IconButton>
        <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>
          {MONTHS[cursor.month]} {cursor.year}
        </Typography>
        <IconButton
          size="small"
          aria-label="Next month"
          // maxDate is today (`FilterHolder.tsx:150`), so there is nothing to
          // page forward into once the grid reaches this month.
          disabled={atCurrentMonth}
          onClick={() => setPaged(shiftMonth(cursor, 1))}
        >
          <ChevronRightIcon size={16} />
        </IconButton>
      </Stack>

      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {WEEKDAYS.map((d, i) => (
          <Typography
            key={i}
            aria-hidden
            sx={{ fontSize: 10.5, fontWeight: 700, color: "text.secondary", textAlign: "center", py: 0.5 }}
          >
            {d}
          </Typography>
        ))}

        {gridDays(cursor).map((day) => {
          const iso = toIso(day);
          const outside = day.getMonth() !== cursor.month;
          const future = iso > today;
          const isStart = Boolean(lo) && iso === lo;
          const isEnd = Boolean(hi) && iso === hi;
          const inside = Boolean(lo) && Boolean(hi) && iso > lo && iso < hi;
          const edge = isStart || isEnd;

          return (
            <ButtonBase
              key={iso}
              disabled={future}
              aria-label={iso}
              aria-pressed={edge || inside}
              onClick={() => pick(iso)}
              onMouseEnter={() => setHovered(iso)}
              sx={{
                height: 30,
                fontSize: 11.5,
                // The endpoints cap the bar; the days between it square it off,
                // so a selected week reads as one run rather than seven chips.
                borderRadius: isStart && isEnd ? 1 : isStart ? "4px 0 0 4px" : isEnd ? "0 4px 4px 0" : inside ? 0 : 1,
                fontWeight: edge ? 700 : 400,
                color: edge
                  ? "primary.contrastText"
                  : future
                    ? "text.disabled"
                    : outside
                      ? "text.disabled"
                      : "text.primary",
                bgcolor: edge
                  ? "primary.main"
                  : inside
                    ? (t) => alpha(t.palette.primary.main, 0.14)
                    : "transparent",
                "&:hover": {
                  bgcolor: edge ? "primary.dark" : (t) => alpha(t.palette.primary.main, 0.08),
                },
              }}
            >
              {day.getDate()}
            </ButtonBase>
          );
        })}
      </Box>
    </Box>
  );
}
