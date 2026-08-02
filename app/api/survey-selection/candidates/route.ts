import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchRedashData } from "@/lib/redash";
import { buildCatalog, CATALOG_QUERY_IDS, CatalogItem, SurveyCategory } from "@/lib/tps/surveySelection";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface HistoryEntry {
  surveyCount: number;
  lastSurveyYear: number;
  lastSurveyMonth: number;
}

async function loadHistory(category: SurveyCategory): Promise<Record<string, HistoryEntry>> {
  const { data, error } = await supabase
    .from("survey_selection_history")
    .select("identity_key, survey_count, last_survey_year, last_survey_month")
    .eq("category", category);
  if (error) throw error;

  const result: Record<string, HistoryEntry> = {};
  for (const row of data ?? []) {
    result[row.identity_key] = {
      surveyCount: row.survey_count,
      lastSurveyYear: row.last_survey_year,
      lastSurveyMonth: row.last_survey_month,
    };
  }
  return result;
}

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category") as SurveyCategory | null;
  if (category !== "tps" && category !== "appliance") {
    return NextResponse.json({ error: "category는 tps 또는 appliance여야 합니다." }, { status: 400 });
  }

  try {
    let items: CatalogItem[];
    let skippedCount = 0;
    let usedCache = false;
    let syncedAt: string | null = null;

    try {
      const rawRows = await fetchRedashData(CATALOG_QUERY_IDS[category]);
      const built = buildCatalog(category, rawRows as Record<string, unknown>[]);
      items = built.items;
      skippedCount = built.skipped;

      const { error: upsertError } = await supabase
        .from("survey_selection_catalog_cache")
        .upsert({ category, payload: items, synced_at: new Date().toISOString() }, { onConflict: "category" });
      if (upsertError) throw upsertError;
    } catch (err) {
      const { data: cached } = await supabase
        .from("survey_selection_catalog_cache")
        .select("payload, synced_at")
        .eq("category", category)
        .maybeSingle();
      if (!cached) {
        const msg = err instanceof Error ? err.message : "알 수 없는 오류";
        return NextResponse.json({ error: `Redash 연동 실패, 캐시된 카탈로그도 없습니다: ${msg}` }, { status: 502 });
      }
      items = cached.payload as CatalogItem[];
      usedCache = true;
      syncedAt = cached.synced_at;
    }

    const history = await loadHistory(category);
    const withHistory = items.map((item) => ({
      ...item,
      surveyCount: history[item.key]?.surveyCount ?? 0,
      lastSurveyYear: history[item.key]?.lastSurveyYear ?? null,
      lastSurveyMonth: history[item.key]?.lastSurveyMonth ?? null,
    }));

    return NextResponse.json({ items: withHistory, skippedCount, usedCache, syncedAt });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "알 수 없는 오류";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
