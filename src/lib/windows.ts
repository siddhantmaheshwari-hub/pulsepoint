// Reporting windows: two consecutive 7-day periods ending at local midnight of the report day.
const DAY = 86_400_000;

export interface ReportWindows {
  currentStart: Date;
  currentEnd: Date;
  previousStart: Date;
  previousEnd: Date;
}

export function reportWindows(now: Date, tzOffsetMinutes = 330): ReportWindows {
  const offset = tzOffsetMinutes * 60_000;
  const localMidnight = Math.floor((now.getTime() + offset) / DAY) * DAY;
  const end = localMidnight - offset;
  return {
    currentStart: new Date(end - 7 * DAY),
    currentEnd: new Date(end),
    previousStart: new Date(end - 14 * DAY),
    previousEnd: new Date(end - 7 * DAY),
  };
}

export function inWindow(d: Date, start: Date, end: Date): boolean {
  const t = d.getTime();
  return t >= start.getTime() && t < end.getTime();
}
