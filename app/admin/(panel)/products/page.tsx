import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { formatINR } from "@/lib/pricing";
import type { Product } from "@/lib/types";
import { Field, Flash, PageHead, Row, Section, type Search } from "@/components/ui";
import { createProduct } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProductsAdminPage({ searchParams }: { searchParams: Search }) {
  const { supabase } = await requireAdmin();
  const { data: products } = await supabase.from("products").select("*").order("sort").returns<Product[]>();

  return (
    <>
      <PageHead title="Digital products">
        Your Lightroom preset packs and other downloads. Add one below, then open it to add the
        cover photo, description and the file buyers will receive.
      </PageHead>
      <Flash {...await searchParams} />

      <div className="flex max-w-3xl flex-col gap-8">
        <Section title="All products">
          {(products ?? []).length === 0 ? (
            <p className="text-sm text-muted">No products yet — add your first one below.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {(products ?? []).map((p) => (
                <Link key={p.id} href={`/admin/products/${p.id}`}>
                  <Row muted={!p.active}>
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-line bg-ground">
                        {p.thumbnail_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.thumbnail_url} alt="" className="h-full w-full object-cover" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{p.name}</div>
                        <div className="text-xs text-muted">
                          {formatINR(p.price_paise)}
                          {!p.active && " · off"}
                          {p.featured && " · featured"}
                          {!p.file_path && " · no file uploaded yet"}
                        </div>
                      </div>
                    </div>
                  </Row>
                </Link>
              ))}
            </div>
          )}
        </Section>

        <Section title="Add a product">
          <form action={createProduct} className="grid gap-3 rounded-xl border border-dashed border-line p-4 sm:grid-cols-[1fr_1fr_120px]">
            <Field label="Name"><input name="name" required className="input" placeholder="e.g. Kolkata Streets" /></Field>
            <Field label="URL slug" hint="Leave blank to generate from the name">
              <input name="slug" className="input" placeholder="kolkata-streets" />
            </Field>
            <Field label="Price (₹)"><input name="price_paise" type="number" min={0} required className="input" /></Field>
            <div className="sm:col-span-3"><button className="btn btn-primary">Add product</button></div>
          </form>
        </Section>
      </div>
    </>
  );
}
