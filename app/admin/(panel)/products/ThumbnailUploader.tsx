"use client";

// Same pattern as settings/HeroImageUploader.tsx, simplified: no position/zoom
// controls, since product cards always crop this to a fixed frame.
import { useState } from "react";
import { uploadProductThumbnail, removeProductThumbnail } from "./actions";

export function ThumbnailUploader({ id, currentUrl }: { id: string; currentUrl: string | null }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl);
  const [isNewFile, setIsNewFile] = useState(false);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setIsNewFile(false);
      setPreviewUrl(currentUrl);
      return;
    }
    setIsNewFile(true);
    setPreviewUrl(URL.createObjectURL(file));
  }

  return (
    <form action={uploadProductThumbnail} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <div className="h-40 w-full max-w-xs overflow-hidden rounded-xl border border-line bg-ground">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="Product photo preview" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">No photo yet</div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" onChange={onFileChange} className="text-sm" />
        {isNewFile && <button className="btn btn-primary">Upload photo</button>}
        {currentUrl && !isNewFile && (
          <button formAction={removeProductThumbnail} className="btn btn-quiet">Remove photo</button>
        )}
      </div>
    </form>
  );
}
