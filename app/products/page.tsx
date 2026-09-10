// 크론(revalidatePath)이 실제 무효화를 담당하고,
// 이 값은 크론이 실패해도 캐시가 영구히 얼지 않게 하는 안전망이다.
export const revalidate = 86400;

import { createClient } from "@supabase/supabase-js";
import { ProductsClient } from "@/app/components/tps/ProductsClient";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function ProductsPage() {
  const { data: products } = await supabase
    .from("products")
    .select("*")
    .eq("is_active", true)
    .order("score", { ascending: false });

  return (
    <div className="px-12 py-6 mx-auto">
      <ProductsClient initialProducts={products ?? []} />
    </div>
  );
}
