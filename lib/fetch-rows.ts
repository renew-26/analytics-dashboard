import { supabase } from "@/lib/supabase";
import { DATE_COL, type DateBasis } from "@/lib/date-basis";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_PAGE_SIZE = 50000;

interface FetchRowsOptions {
  /** 기준. 기본 "contract" — 기존 호출부가 계약완료였다. */
  basis?: DateBasis;
  select: string;
  start: string;
  end?: string;
  orderBy?: string;
  pageSize?: number;
  client?: SupabaseClient;
}

export async function fetchRows<T>(options: FetchRowsOptions): Promise<T[]> {
  const {
    basis = "contract",
    select,
    start,
    end,
    orderBy,
    pageSize = DEFAULT_PAGE_SIZE,
    client = supabase,
  } = options;

  const dateColumn = DATE_COL[basis];
  const all: T[] = [];
  let from = 0;

  while (true) {
    // 기준 날짜가 빈 행은 그 기준에 존재하지 않는 건이다.
    let query = client
      .from("raw_prop_items")
      .select(select)
      .not(dateColumn, "is", null)
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
