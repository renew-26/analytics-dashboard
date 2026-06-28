import { supabase } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_PAGE_SIZE = 50000;

interface FetchRowsOptions {
  table?: string;
  select: string;
  dateColumn?: string;
  start: string;
  end?: string;
  orderBy?: string;
  pageSize?: number;
  client?: SupabaseClient;
}

export async function fetchRows<T>(options: FetchRowsOptions): Promise<T[]> {
  const {
    table = "raw_contracts",
    select,
    dateColumn = "contract_date",
    start,
    end,
    orderBy,
    pageSize = DEFAULT_PAGE_SIZE,
    client = supabase,
  } = options;

  const all: T[] = [];
  let from = 0;

  while (true) {
    let query = client
      .from(table)
      .select(select)
      .gte(dateColumn, start);

    if (end) {
      query = query.lte(dateColumn, end);
    }

    if (orderBy) {
      query = query.order(orderBy, { ascending: true });
    }

    query = query.range(from, from + pageSize - 1);

    const { data, error } = await query;
    if (error || !data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}
