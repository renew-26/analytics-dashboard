import { describe, expect, it } from "vitest";
import { getRowBM } from "@/lib/company-map";

const row = (partner_company: string | null, brand: string | null, rental_company: string | null) => ({
  partner_company,
  brand,
  rental_company,
});

describe("getRowBM", () => {
  it("스마트렌탈로 판 아싸컴은 BM3", () => {
    expect(getRowBM(row("스마트렌탈 공식몰", "아싸컴", "스마트렌탈"))).toBe("BM3");
  });

  it("BM1 파트너가 판 아싸컴은 BM1 그대로", () => {
    expect(getRowBM(row("비비렌탈", "아싸컴", "BS렌탈"))).toBe("BM1");
    expect(getRowBM(row("비비렌탈", "아싸컴", "스마트렌탈"))).toBe("BM1");
  });

  it("스마트렌탈이 아닌 렌탈사로 판 아싸컴은 파트너 기준", () => {
    expect(getRowBM(row("BS렌탈 공식몰", "아싸컴", "BS렌탈"))).toBe("BM2");
  });

  it("아싸컴이 아니면 파트너 기준", () => {
    expect(getRowBM(row("스마트렌탈 공식몰", "삼성", "스마트렌탈"))).toBe("BM2");
    expect(getRowBM(row("렌트리 안심구독(렌탈)", "퓨리얼", "이니렌탈"))).toBe("BM3");
    expect(getRowBM(row(null, "아싸컴", "스마트렌탈"))).toBe("BM1");
  });
});
