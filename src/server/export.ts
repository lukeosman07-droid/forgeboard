import "server-only";
import { toCsv } from "@/lib/export";
import type { createClient } from "@/lib/supabase/server";

// Reads rows for an export with the user's own client, so Row Level Security
// decides what they get: a guest exports only what they can see.

type Db = NonNullable<Awaited<ReturnType<typeof createClient>>>;
type Row = Record<string, unknown>;

const PAGE = 1000;

/** Every row of `table` where `column` = `value`, a page at a time (the API returns at most 1,000). */
export async function allRows(supabase: Db, table: string, columns: string, column: string, value: string | string[]): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase.from(table).select(columns);
    query = Array.isArray(value) ? query.in(column, value) : query.eq(column, value);
    const { data, error } = await query.order("created_at").range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < PAGE) return rows;
  }
}

/** A CSV of the given columns, in order. */
export function rowsToCsv(rows: Row[], columns: string[]) {
  return toCsv(
    columns,
    rows.map((row) => columns.map((c) => row[c] as string | number | boolean | null)),
  );
}

export const ITEM_COLUMNS = [
  "id",
  "project_id",
  "section",
  "type",
  "title",
  "details",
  "assignee",
  "status",
  "priority",
  "start_date",
  "due_date",
  "completed_at",
  "created_at",
];

/** Items with their section's name instead of its ID. */
export function withSectionNames(items: Row[], sections: Row[]) {
  const names = new Map(sections.map((s) => [s.id as string, s.name as string]));
  return items.map((item) => ({ ...item, section: item.section_id ? (names.get(item.section_id as string) ?? "") : "" }));
}
