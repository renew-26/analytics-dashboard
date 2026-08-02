import { supabase } from "@/lib/supabase";
import { Category, Product } from "@/lib/tps/types";

const PAGE_SIZE = 1000;

export async function fetchAllProducts(categories: Category[]): Promise<Product[]> {
  const rows: Product[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .in("category", categories)
      .eq("is_active", true)
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as Product[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}
