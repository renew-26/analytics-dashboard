#!/usr/bin/env node
/**
 * 문구 리뷰 — 화면에 실제로 렌더된 문장을 뽑아(extract), GPT에게 개선안을 묻는다(ask).
 *
 * 이 대시보드의 문장은 숫자를 서술한다. 모델이 수치를 고쳐 쓰면 차트와 글이
 * 어긋나는데, 그건 눈에 안 띄는 종류의 거짓말이라 프롬프트로 묶어 둔다.
 * 제안은 "소스 템플릿" 형태(${...} 자리 보존)로 받아 코드 반영이 기계적이게 한다.
 *
 *   node scripts/copy-review.mjs extract http://localhost:3000 > screen.txt
 *   node scripts/copy-review.mjs ask payload.json > review.json
 */

import { readFileSync } from "node:fs";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-5.6-terra";

/* ── .env.local 로더 — Next.js 는 읽지만 맨 node 는 안 읽는다 ─────────── */
function loadEnv() {
  if (process.env.OPENAI_API_KEY) return;
  let raw;
  try {
    raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, "");
  }
}

/* ── extract ───────────────────────────────────────────────────────────
 * 서버 컴포넌트라 curl 한 HTML 에 이미 실제 숫자가 박혀 있다.
 * 헤드리스 브라우저 없이 태그만 벗기면 "읽는 순서대로의 화면 텍스트"가 나온다.
 */
const BLOCK = "address|article|aside|blockquote|br|caption|div|dd|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul";

const ENTITIES = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
  "&#39;": "'", "&#x27;": "'", "&nbsp;": " ", "&middot;": "·",
};

function htmlToLines(html) {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, "")
    .replace(new RegExp(`</?(?:${BLOCK})\\b[^>]*>`, "gi"), "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&[a-z]+;|&#x?[0-9a-f]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e);

  const lines = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+/g, " ").trim();
    // 연속 중복은 접는다 — 같은 문자열이 중첩 div 로 여러 번 떨어진다
    if (line && line !== lines[lines.length - 1]) lines.push(line);
  }
  return lines;
}

async function extract(url) {
  const res = await fetch(url, { headers: { "user-agent": "copy-review" } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const lines = htmlToLines(await res.text());
  console.log(lines.map((l, i) => `${String(i + 1).padStart(3)} | ${l}`).join("\n"));
  console.error(`\n[extract] ${url} — ${lines.length}줄`);
}

/* ── ask ──────────────────────────────────────────────────────────────── */
const SYSTEM = `당신은 한국어 UX 라이터다. 사내 렌탈 분석 대시보드의 문구를 다듬는다.

## 이 화면의 성격
내부 분석 도구다. 숫자가 주인공이고 문장은 그 숫자를 읽는 사람이 무엇을 해야 하는지
알려주는 역할이다. 마케팅 어투·과장·감탄은 이 화면에서 노이즈다.

## 톤 규칙
- 짧게 끊는다. 한 문장에 한 가지만 말한다.
- 증감(올랐다/내렸다)과 좋고 나쁨(개선/악화)을 섞지 않는다. 대손율처럼 오르면
  나쁜 지표를 "올랐다"로만 쓰면 읽는 사람이 좋은 소식으로 오해한다. 반대로
  단순 증감에 가치판단을 붙이지도 않는다.
- 판정 기준은 목표치가 아니라 자기 과거(평소 페이스) 대비다. 그 기준이 문장에서
  드러나야 한다.
- 추측을 단정으로 쓰지 않는다. 원인을 모르면 "확인이 필요하다"고 쓴다.

## 절대 규칙 — 어기면 안 된다
1. 숫자·퍼센트·금액·단위·날짜를 바꾸지 않는다. 반올림도 하지 않는다.
2. 렌탈사명·카테고리명·BM명 등 고유명사를 바꾸지 않는다.
3. 소스 템플릿의 \${...} 자리표시자를 그대로 보존한다. 개수·순서를 바꾸지 않는다.
   문장 구조를 바꾸느라 자리표시자를 옮겨야 하면, 옮긴 뒤에도 각 자리표시자가
   원래와 같은 값을 가리키는지 확인한다.
4. 숫자나 사실 자체가 틀렸다고 판단되면 고쳐 쓰지 말고 kind:"flag" 로 보고한다.
5. 지금도 충분히 좋은 문장은 kind:"keep" 으로 두고 억지로 손대지 않는다.

## cross_cutting
개별 문장이 아니라 화면 전체를 보고 나오는 지적을 여기 담는다. 같은 개념을
서로 다른 말로 부르는 것, 문장끼리의 중복, 읽는 순서가 어색한 것.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items", "cross_cutting"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "kind", "suggestion", "rendered_preview", "why", "confidence"],
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: ["rewrite", "flag", "keep"] },
          suggestion: {
            type: "string",
            description: "소스 템플릿 형태. ${...} 자리표시자를 원본 그대로 보존한다. kind가 keep이면 원본과 동일.",
          },
          rendered_preview: {
            type: "string",
            description: "화면에 있던 실제 값을 자리표시자에 넣었을 때 어떻게 읽히는지",
          },
          why: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
    cross_cutting: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["observation", "affected_ids", "suggestion"],
        properties: {
          observation: { type: "string" },
          affected_ids: { type: "array", items: { type: "string" } },
          suggestion: { type: "string" },
        },
      },
    },
  },
};

async function ask(payloadPath) {
  loadEnv();
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY 없음 (.env.local 확인)");
  const payload = JSON.parse(readFileSync(payloadPath, "utf8"));

  const user = [
    `# 화면 전체 (실제 렌더된 텍스트, 읽는 순서)`,
    "```",
    payload.screen,
    "```",
    "",
    `# 다듬을 문구 — 화면에 보이는 모습과 소스 템플릿을 함께 준다`,
    "```json",
    JSON.stringify(payload.items, null, 2),
    "```",
    "",
    `items 의 각 항목마다 결과를 하나씩 돌려준다. id 를 그대로 쓴다.`,
  ].join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "copy_review", strict: true, schema: SCHEMA },
      },
    }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${JSON.stringify(json.error ?? json, null, 2)}`);
  console.log(json.choices[0].message.content);
  const u = json.usage ?? {};
  console.error(`\n[ask] ${MODEL} — in ${u.prompt_tokens} / out ${u.completion_tokens} 토큰`);
}

/* ── entry ────────────────────────────────────────────────────────────── */
const [cmd, arg] = process.argv.slice(2);
try {
  if (cmd === "extract" && arg) await extract(arg);
  else if (cmd === "ask" && arg) await ask(arg);
  else {
    console.error("usage: copy-review.mjs extract <url> | ask <payload.json>");
    process.exit(1);
  }
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}
