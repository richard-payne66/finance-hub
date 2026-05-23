// FreeAgent category sync + cache.
// We keep a Supabase cache and refresh it lazily (every 24h) so we don't
// hit FA's /categories endpoint on every transaction we classify.

import { db } from "@/app/lib/db";
import { api as faApi } from "@/app/lib/freeagent";

export type FaCategory = {
  url: string;
  description: string;
  group_description?: string;
  nominal_code?: string;
  allowable_for_tax?: boolean;
  tax_reporting_name?: string;
  auto_sales_tax_rate?: string;
};

type CategoriesResponse = {
  admin_expenses_categories?: FaCategory[];
  cost_of_sales_categories?: FaCategory[];
  general_categories?: FaCategory[];
  income_categories?: FaCategory[];
};

const KV_KEY = "fa_categories_cache";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type Cache = { fetched_at: string; categories: FaCategory[] };

async function fetchFromFA(): Promise<FaCategory[]> {
  const res = await faApi<CategoriesResponse>("/categories");
  return [
    ...(res.admin_expenses_categories ?? []),
    ...(res.cost_of_sales_categories ?? []),
    ...(res.general_categories ?? []),
    ...(res.income_categories ?? []),
  ];
}

export async function getCategories(force = false): Promise<FaCategory[]> {
  if (!force) {
    const { data } = await db().from("kv").select("value").eq("key", KV_KEY).maybeSingle();
    if (data) {
      try {
        const cache = JSON.parse(data.value) as Cache;
        const age = Date.now() - new Date(cache.fetched_at).getTime();
        if (age < CACHE_TTL_MS && cache.categories.length > 0) {
          return cache.categories;
        }
      } catch {}
    }
  }

  const fresh = await fetchFromFA();
  const cache: Cache = { fetched_at: new Date().toISOString(), categories: fresh };
  await db().from("kv").upsert({ key: KV_KEY, value: JSON.stringify(cache) });
  return fresh;
}

export async function findCategoryByUrl(url: string): Promise<FaCategory | null> {
  const cats = await getCategories();
  return cats.find((c) => c.url === url) ?? null;
}
