function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parse(dateStr: string) {
  return new Date(dateStr + "T00:00:00Z");
}

function startOfWeek(d: Date) {
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const s = new Date(d);
  s.setUTCDate(d.getUTCDate() + diff);
  return s;
}

export function rangeForPeriod(period: "day" | "week" | "month", anchor: string) {
  const d = parse(anchor);
  let start: Date, end: Date;
  if (period === "day") {
    start = d;
    end = d;
  } else if (period === "week") {
    start = startOfWeek(d);
    end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
  } else {
    start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  }
  return { start: fmt(start), end: fmt(end) };
}

export function shiftAnchor(dateStr: string, unit: "day" | "month" | "year", amount: number): string {
  const d = parse(dateStr);
  if (unit === "day") d.setUTCDate(d.getUTCDate() + amount);
  else if (unit === "month") d.setUTCMonth(d.getUTCMonth() + amount);
  else d.setUTCFullYear(d.getUTCFullYear() + amount);
  return fmt(d);
}

export type Bucket = { label: string; start: string; end: string };

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

export function buildBuckets(
  granularity: "day" | "week" | "month",
  count: number,
  anchor: string
): Bucket[] {
  const d = parse(anchor);
  const buckets: Bucket[] = [];

  if (granularity === "day") {
    for (let i = count - 1; i >= 0; i--) {
      const day = new Date(d);
      day.setUTCDate(d.getUTCDate() - i);
      const label = `${DIAS_SEMANA[day.getUTCDay()]} ${String(day.getUTCDate()).padStart(2, "0")}/${String(day.getUTCMonth() + 1).padStart(2, "0")}`;
      buckets.push({ label, start: fmt(day), end: fmt(day) });
    }
  } else if (granularity === "week") {
    const thisWeekStart = startOfWeek(d);
    for (let i = count - 1; i >= 0; i--) {
      const s = new Date(thisWeekStart);
      s.setUTCDate(thisWeekStart.getUTCDate() - i * 7);
      const e = new Date(s);
      e.setUTCDate(s.getUTCDate() + 6);
      const label = `${String(s.getUTCDate()).padStart(2, "0")}/${String(s.getUTCMonth() + 1).padStart(2, "0")}`;
      buckets.push({ label, start: fmt(s), end: fmt(e) });
    }
  } else {
    for (let i = count - 1; i >= 0; i--) {
      const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
      const s = m;
      const e = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0));
      const label = `${MESES[m.getUTCMonth()]}/${String(m.getUTCFullYear()).slice(2)}`;
      buckets.push({ label, start: fmt(s), end: fmt(e) });
    }
  }
  return buckets;
}

export function buildWeeksOfMonth(anchor: string): Bucket[] {
  const d = parse(anchor);
  const monthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));

  const buckets: Bucket[] = [];
  let cursor = new Date(monthStart);
  let weekNum = 1;
  while (cursor <= monthEnd) {
    const weekStartReal = startOfWeek(cursor);
    const s = weekStartReal < monthStart ? monthStart : weekStartReal;
    const weekEndReal = new Date(weekStartReal);
    weekEndReal.setUTCDate(weekStartReal.getUTCDate() + 6);
    const e = weekEndReal > monthEnd ? monthEnd : weekEndReal;
    buckets.push({ label: `Sem ${weekNum}`, start: fmt(s), end: fmt(e) });
    weekNum++;
    cursor = new Date(weekEndReal);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return buckets;
}
