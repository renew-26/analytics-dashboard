import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function isValidRate(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value) && value >= 0 && value <= 1;
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const update: Record<string, number> = {};

    if (body?.tps_baseline_rate !== undefined) {
      if (!isValidRate(Number(body.tps_baseline_rate))) {
        return NextResponse.json({ error: "TPS 타겟마진율은 0과 1 사이의 값이어야 합니다." }, { status: 400 });
      }
      update.tps_baseline_rate = Number(body.tps_baseline_rate);
    }
    if (body?.appliance_baseline_rate !== undefined) {
      if (!isValidRate(Number(body.appliance_baseline_rate))) {
        return NextResponse.json({ error: "가전 타겟마진율은 0과 1 사이의 값이어야 합니다." }, { status: 400 });
      }
      update.appliance_baseline_rate = Number(body.appliance_baseline_rate);
    }
    if (body?.tps_bad_debt_rate !== undefined) {
      if (!isValidRate(Number(body.tps_bad_debt_rate))) {
        return NextResponse.json({ error: "TPS 대손비율은 0과 1 사이의 값이어야 합니다." }, { status: 400 });
      }
      update.tps_bad_debt_rate = Number(body.tps_bad_debt_rate);
    }
    if (body?.appliance_bad_debt_rate !== undefined) {
      if (!isValidRate(Number(body.appliance_bad_debt_rate))) {
        return NextResponse.json({ error: "가전 대손비율은 0과 1 사이의 값이어야 합니다." }, { status: 400 });
      }
      update.appliance_bad_debt_rate = Number(body.appliance_bad_debt_rate);
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "변경할 값이 없습니다." }, { status: 400 });
    }

    const { error } = await supabase
      .from("margin_settings")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw error;

    return NextResponse.json({ success: true, ...update });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "알 수 없는 오류";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
