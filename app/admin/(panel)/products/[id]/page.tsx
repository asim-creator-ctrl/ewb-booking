import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import type { Product } from "@/lib/types";
import { Field, Flash, PageHead, Section, Toggle, toRupees, type Search } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { ThumbnailUploader } from "../ThumbnailUploader";
import { updateProduct, deleteProduct, uploadProductFile } from "../actions";

export const dynamic = "force-dynamic";

function formatBytes(n: number | null) {
  if (!n) return null;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function EditProductPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Search }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const { data: product } = await supabase.from("products").select("*").eq("id", id).maybeSingle<Product>();
  if (!product) notFound();

  return (
    <>
      <PageHead title={product.name}>
        Live at /products/{product.slug} once it&apos;s on and has a file attached.
      </PageHead>
      <Flash {...await searchParams} />

      <div className="flex max-w-2xl flex-col gap-10">
        <Section title="Cover photo" hint="Shown on the product card and at the top of the product page.">
          <ThumbnailUploader id={product.id} currentUrl={product.thumbnail_url} />
        </Section>

        <Section
          title="The file buyers receive"
          hint="A .zip, .rar or .7z with the presets inside. Kept private — only ever handed out through a paid download link."
        >
          {product.file_path ? (
            <p className="mb-3 text-sm text-paper">
              Current file: <span className="text-muted">{product.file_name}</span>
              {formatBytes(product.file_size_bytes) && <span className="text-muted"> · {formatBytes(product.file_size_bytes)}</span>}
            </p>
          ) : (
            <p className="mb-3 text-sm text-danger">No file uploaded yet — this product can&apos;t be sold until one is.</p>
          )}
          <form action={uploadProductFile} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="id" value={product.id} />
            <input type="file" name="file" accept=".zip,.rar,.7z" className="text-sm" required />
            <button className="btn btn-primary">{product.file_path ? "Replace file" : "Upload file"}</button>
          </form>
        </Section>

        <Section title="Details">
          <form action={updateProduct} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value={product.id} />
            <Field label="Name"><input name="name" defaultValue={product.name} required className="input" /></Field>
            <Field label="URL slug" hint={`/products/${product.slug}`}>
              <input name="slug" defaultValue={product.slug} required className="input" />
            </Field>
            <Field label="Badge" hint='e.g. "5 PRESETS · .XMP & .DNG"'>
              <input name="badge" defaultValue={product.badge ?? ""} className="input" />
            </Field>
            <Field label="Order"><input name="sort" type="number" defaultValue={product.sort} className="input" /></Field>
            <Field label="Price (₹)">
              <input name="price_paise" type="number" min={0} defaultValue={toRupees(product.price_paise)} required className="input" />
            </Field>
            <Field label="Compare-at price (₹)" hint="Optional — shown struck through">
              <input name="compare_at_price_paise" type="number" min={0} defaultValue={toRupees(product.compare_at_price_paise)} className="input" />
            </Field>
            <Field label="Short description" className="sm:col-span-2" hint="One line, shown on the product card">
              <input name="short_description" defaultValue={product.short_description ?? ""} className="input" />
            </Field>
            <Field label="What's included" className="sm:col-span-2" hint="One line per item">
              <textarea name="includes" rows={4} defaultValue={product.includes.join("\n")} className="input" />
            </Field>
            <Field label="About this pack" className="sm:col-span-2">
              <textarea name="description" rows={4} defaultValue={product.description ?? ""} className="input" />
            </Field>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <Toggle name="active" label="On sale" defaultChecked={product.active} />
              <Toggle name="featured" label="Featured (BEST VALUE badge)" defaultChecked={product.featured} />
              <span className="flex-1" />
              <ConfirmButton formAction={deleteProduct}>Delete</ConfirmButton>
              <button className="btn btn-primary">Save changes</button>
            </div>
          </form>
        </Section>
      </div>
    </>
  );
}
