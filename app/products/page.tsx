export const dynamic = "force-dynamic";

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
