import { describe, it, expect } from "vitest";
import { getBM } from "@/lib/company-map";

describe("getBM — brand-based BM3 (아싸컴/퓨리얼)", () => {
  it("아싸컴 row whose partner is a BM2 company classifies BM3 (brand takes precedence)", () => {
    // 실측: 아싸컴 74건이 partner_company = "스마트렌탈 공식몰"(BM2 등록사)로 들어온다.
    expect(getBM("아싸컴", "스마트렌탈 공식몰")).toBe("BM3");
  });

  it("아싸컴 row whose partner is unmapped classifies BM3", () => {
    // 실측: 아싸컴 3건이 partner_company = "비비렌탈"(BM1/미등록)로 들어온다.
    expect(getBM("아싸컴", "비비렌탈")).toBe("BM3");
    expect(getBM("아싸컴", null)).toBe("BM3");
  });

  it("퓨리얼 row stays BM3 (already BM3 via partner_company — rule change must not move it)", () => {
    expect(getBM("퓨리얼", "렌트리 안심구독(렌탈)")).toBe("BM3");
  });

  it("non-listed brand with a BM2 partner still classifies BM2", () => {
    expect(getBM("코웨이", "스마트렌탈 공식몰")).toBe("BM2");
  });

  it("null brand behaves as before (partner_company 기준 그대로)", () => {
    expect(getBM(null, "렌트리 안심구독(렌탈)")).toBe("BM3");
    expect(getBM(null, "스마트렌탈 공식몰")).toBe("BM2");
    expect(getBM(null, "비비렌탈")).toBe("BM1");
    expect(getBM(null, null)).toBe("BM1");
  });
});
