// Loads digital products straight from the database on every call — same
// no-cache philosophy as lib/config.ts: an admin save is live on the very
// next request.
import "server-only";
import { createServiceClient } from "./supabase/service";
import type { Product } from "./types";

export async function loadProducts(opts: { includeInactive?: boolean } = {}): Promise<Product[]> {
  const db = createServiceClient();
  let query = db.from("products").select("*").order("sort", { ascending: true });
  if (!opts.includeInactive) query = query.eq("active", true);
  const { data, error } = await query.returns<Product[]>();
  if (error) throw new Error(`Could not load products: ${error.message}`);
  return data ?? [];
}

export async function getProductBySlug(slug: string, opts: { includeInactive?: boolean } = {}): Promise<Product | null> {
  const db = createServiceClient();
  let query = db.from("products").select("*").eq("slug", slug);
  if (!opts.includeInactive) query = query.eq("active", true);
  const { data, error } = await query.maybeSingle<Product>();
  if (error) throw new Error(`Could not load product: ${error.message}`);
  return data;
}
