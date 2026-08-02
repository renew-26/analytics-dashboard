import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildIdentityKey } from "@/lib/tps/surveyIdentity";
import { CATEGORY_FIELDS, SurveyCategory } from "@/lib/tps/surveySelection";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const category = body?.category as SurveyCategory;
    const confirmed = body?.confirmed as Record<string, unknown>[];

    if (category !== "tps" && category !== "appliance") {
      return NextResponse.json({ error: "category는 tps 또는 appliance여야 합니다." }, { status: 400 });
    }
    if (!Array.isArray(confirmed) || confirmed.length === 0) {
      return NextResponse.json({ error: "confirmed는 비어있지 않은 배열이어야 합니다." }, { status: 400 });
    }

    const fields = CATEGORY_FIELDS[category];
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    let keyed: { key: string; identityFields: Record<string, unknown> }[];
    try {
      keyed = confirmed.map((record) => ({
        key: buildIdentityKey(fields, record),
        identityFields: Object.fromEntries(fields.map((f) => [f, record[f]])),
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "식별 정보가 불완전한 항목이 있습니다.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Dedupe by identity key, keeping the first occurrence, so a batch containing
    // duplicate identity keys doesn't produce two upsert rows for the same
    // (category, identity_key) pair — Postgres rejects that within a single
    // upsert with "ON CONFLICT DO UPDATE command cannot affect row a second time".
    // This mirrors the first-occurrence dedup convention used in
    // buildCatalogItems.
    const seenKeys = new Set<string>();
    const dedupedKeyed = keyed.filter(({ key }) => {
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });

    const { data: existingRows, error: selectError } = await supabase
      .from("survey_selection_history")
      .select("identity_key, survey_count")
      .eq("category", category)
      .in("identity_key", dedupedKeyed.map((k) => k.key));
    if (selectError) throw selectError;

    const existingCountByKey = new Map((existingRows ?? []).map((r) => [r.identity_key, r.survey_count]));

    const upsertRows = dedupedKeyed.map(({ key, identityFields }) => ({
      category,
      identity_key: key,
      identity_fields: identityFields,
      last_survey_year: year,
      last_survey_month: month,
      survey_count: (existingCountByKey.get(key) ?? 0) + 1,
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await supabase
      .from("survey_selection_history")
      .upsert(upsertRows, { onConflict: "category,identity_key" });
    if (upsertError) throw upsertError;

    return NextResponse.json({ confirmedCount: confirmed.length, year, month });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "알 수 없는 오류";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
