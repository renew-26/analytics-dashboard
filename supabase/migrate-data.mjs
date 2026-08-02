/**
 * tps Supabase → analytics Supabase 데이터 이관 스크립트
 *
 * 사용법:
 *   node supabase/migrate-data.mjs
 *
 * 전제 조건:
 *   - analytics Supabase에 migration.sql이 이미 실행되어 테이블이 생성된 상태
 *   - tps-dashboard/.env.local에 tps Supabase 접속 정보
 *   - analytics-dashboard/.env.local에 analytics Supabase 접속 정보
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// .env.local 파서
function parseEnv(filePath) {
  const content = readFileSync(filePath, "utf8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
  }
  return env;
}

const tpsEnv = parseEnv(resolve(__dirname, "../../tps-dashboard/.env.local"));
const analyticsEnv = parseEnv(resolve(__dirname, "../.env.local"));

const TPS = {
  url: tpsEnv.NEXT_PUBLIC_SUPABASE_URL,
  anon: tpsEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  service: tpsEnv.SUPABASE_SERVICE_ROLE_KEY,
};

const ANALYTICS = {
  url: analyticsEnv.NEXT_PUBLIC_SUPABASE_URL,
  anon: analyticsEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  service: analyticsEnv.SUPABASE_SERVICE_ROLE_KEY,
};

// Supabase REST API 헬퍼 (페이지네이션 포함 — 기본 1000건 제한 우회)
async function supabaseSelect(config, table, select = "*", params = "") {
  const PAGE = 1000;
  const allRows = [];
  for (let offset = 0; ; offset += PAGE) {
    const url = `${config.url}/rest/v1/${table}?select=${encodeURIComponent(select)}${params ? "&" + params : ""}&limit=${PAGE}&offset=${offset}`;
    const res = await fetch(url, {
      headers: {
        apikey: config.anon,
        Authorization: `Bearer ${config.service}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) throw new Error(`SELECT ${table} failed: ${res.status} ${await res.text()}`);
    const rows = await res.json();
    allRows.push(...rows);
    if (rows.length < PAGE) break;
  }
  return allRows;
}

async function supabaseDelete(config, table) {
  const url = `${config.url}/rest/v1/${table}?id=neq.00000000-0000-0000-0000-000000000000`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      apikey: config.anon,
      Authorization: `Bearer ${config.service}`,
    },
  });
  if (!res.ok) throw new Error(`DELETE ${table} failed: ${res.status} ${await res.text()}`);
}

async function supabaseInsert(config, table, rows) {
  if (rows.length === 0) return { count: 0 };

  // 100건씩 배치
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const url = `${config.url}/rest/v1/${table}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: config.anon,
        Authorization: `Bearer ${config.service}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`INSERT ${table} batch ${i} failed: ${res.status} ${body}`);
    }
    inserted += batch.length;
  }
  return { count: inserted };
}

async function main() {
  console.log("=== tps → analytics 데이터 이관 시작 ===\n");
  console.log(`FROM: ${TPS.url}`);
  console.log(`TO:   ${ANALYTICS.url}\n`);

  // 1. margin_settings (싱글턴)
  console.log("1/6 margin_settings...");
  const ms = await supabaseSelect(TPS, "margin_settings", "*", "id=eq.1");
  if (ms.length > 0) {
    // upsert via DELETE + INSERT
    await fetch(`${ANALYTICS.url}/rest/v1/margin_settings?id=eq.1`, {
      method: "DELETE",
      headers: {
        apikey: ANALYTICS.anon,
        Authorization: `Bearer ${ANALYTICS.service}`,
      },
    });
    await supabaseInsert(ANALYTICS, "margin_settings", ms);
    console.log(`   ✓ ${ms.length}건 이관`);
  } else {
    console.log("   - 데이터 없음");
  }

  // 2. products (FK 의존 대상이므로 먼저)
  console.log("2/6 products...");
  const products = await supabaseSelect(TPS, "products");
  if (products.length > 0) {
    await supabaseInsert(ANALYTICS, "products", products);
    console.log(`   ✓ ${products.length}건 이관`);
  } else {
    console.log("   - 데이터 없음");
  }

  // 3. competitor_subsidies (products FK 참조)
  console.log("3/6 competitor_subsidies...");
  const cs = await supabaseSelect(TPS, "competitor_subsidies");
  if (cs.length > 0) {
    await supabaseInsert(ANALYTICS, "competitor_subsidies", cs);
    console.log(`   ✓ ${cs.length}건 이관`);
  } else {
    console.log("   - 데이터 없음");
  }

  // 4. appliance_rentre_subsidy (products FK 참조)
  console.log("4/6 appliance_rentre_subsidy...");
  const ars = await supabaseSelect(TPS, "appliance_rentre_subsidy");
  if (ars.length > 0) {
    await supabaseInsert(ANALYTICS, "appliance_rentre_subsidy", ars);
    console.log(`   ✓ ${ars.length}건 이관`);
  } else {
    console.log("   - 데이터 없음");
  }

  // 5. survey_selection_catalog_cache (기존 데이터 삭제 후 insert)
  console.log("5/6 survey_selection_catalog_cache...");
  const cache = await supabaseSelect(TPS, "survey_selection_catalog_cache");
  if (cache.length > 0) {
    await supabaseDelete(ANALYTICS, "survey_selection_catalog_cache");
    await supabaseInsert(ANALYTICS, "survey_selection_catalog_cache", cache);
    console.log(`   ✓ ${cache.length}건 이관`);
  } else {
    console.log("   - 데이터 없음");
  }

  // 6. survey_selection_history (기존 데이터 삭제 후 insert)
  console.log("6/6 survey_selection_history...");
  const hist = await supabaseSelect(TPS, "survey_selection_history");
  if (hist.length > 0) {
    await supabaseDelete(ANALYTICS, "survey_selection_history");
    await supabaseInsert(ANALYTICS, "survey_selection_history", hist);
    console.log(`   ✓ ${hist.length}건 이관`);
  } else {
    console.log("   - 데이터 없음");
  }

  console.log("\n=== 이관 완료 ===");
}

main().catch((e) => {
  console.error("\n❌ 이관 실패:", e.message);
  process.exit(1);
});
