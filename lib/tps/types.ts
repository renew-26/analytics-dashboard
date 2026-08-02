export type Category = "tps" | "usim" | "appliance";
export type Telecom = "SKB" | "LGU+" | "KT";
export type ProductType =
  | "인터넷"
  | "인터넷+TV"
  | "유심+인터넷"
  | "유심+인터넷+TV";
export type ApplianceCategory = string;

export interface Product {
  id: string;
  category: Category;
  name: string;
  brand: string | null;
  our_subsidy: number;
  commission: number;
  bad_debt: number;
  effective_subsidy: number;
  score: number;
  is_active: boolean;
  // TPS / 유심
  telecom: Telecom | null;
  product_type: ProductType | null;
  has_usim_bundle: boolean;
  usim_product: string | null;
  // 가전
  model_number: string | null;
  appliance_category: ApplianceCategory | null;
  monthly_fee: number;
  management_type: string | null;
  contract_period: number | null;
  // 선정 이력
  selection_count: number;
  last_selected_year: number | null;
  last_selected_month: number | null;
  // 수수료 시트 연동
  commission_key: string | null;
  commission_channel: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompetitorSubsidy {
  id: string;
  product_id: string | null;
  category: string | null;
  brand: string | null;
  product_name: string;
  model_number: string | null;
  partner_name: string | null;
  subsidy: number;
  management_type: string | null;
  survey_year: number;
  survey_month: number;
  bad_debt_applicable: boolean;
  synced_at: string;
}

export interface MarginSettings {
  id: number;
  tps_baseline_rate: number;
  appliance_baseline_rate: number;
  tps_bad_debt_rate: number;
  appliance_bad_debt_rate: number;
  updated_at: string;
}

export interface ApplianceRentreSubsidy {
  id: string;
  product_id: string;
  doublecheck_subsidy: number;
  doublecheck_commission: number;
  doublecheck_bad_debt: number;
  other_partner_subsidy: number | null;
  other_partner_name: string | null;
  synced_at: string;
}

export const CATEGORY_LABELS: Record<Category, string> = {
  tps: "TPS (인터넷)",
  usim: "유심",
  appliance: "가전",
};

export const TELECOM_LABELS: Record<Telecom, string> = {
  SKB: "SK 브로드밴드",
  "LGU+": "LG U+",
  KT: "KT",
};

export const APPLIANCE_CATEGORIES: ApplianceCategory[] = [
  "정수기",
  "공기청정기",
  "비데",
  "에어컨",
  "음식물처리기",
  "냉장고",
  "세탁기",
  "세탁기+건조기",
  "건조기",
  "무선청소기",
  "로봇청소기",
  "제습기",
  "안마의자",
  "의류관리기",
  "오븐",
  "커피머신",
  "식기세척기",
  "김치냉장고",
  "냉난방기",
  "헤어기기",
  "피부미용기기",
  "기타",
];

export function calcRoom(
  product: Pick<Product, "commission" | "our_subsidy" | "bad_debt">,
) {
  return product.commission - product.our_subsidy - product.bad_debt;
}
