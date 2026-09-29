"use client";

// Simple upload/remove for the fixed app-wide background. Unlike the hero
// photo, this one is always shown full-bleed and cropped to fill the screen
// (background-size: cover), so it doesn't need position/zoom controls — just
// a preview of what it'll look like.
import { useState } from "react";
import { uploadBgImage, removeBgImage } from "../actions";

export function BgImageUploader({ currentUrl }: { currentUrl: string | null }) {
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
    <form action={uploadBgImage} className="flex flex-col gap-4">
      <div className="h-40 max-w-md overflow-hidden rounded-sm border border-line bg-ground bg-cover bg-center"
        style={previewUrl ? { backgroundImage: `url(${previewUrl})` } : undefined}>
        {!previewUrl && (
          <div className="flex h-full items-center justify-center text-xs text-muted">Using the built-in gradient</div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" onChange={onFileChange} className="text-sm" />
        {isNewFile && <button className="btn btn-primary">Upload background</button>}
        {currentUrl && !isNewFile && (
          <button formAction={removeBgImage} className="btn btn-quiet">Remove photo (use the built-in gradient)</button>
        )}
      </div>
    </form>
  );
}
