"use client";

// Shows the photo in the exact same frame shape as the homepage, so what you
// see here is what visitors see. The slider moves object-position vertically
// — the frame is short and wide, so a tall portrait almost always needs
// repositioning rather than a hard crop.
import { useState } from "react";
import { updateHeroImagePosition, uploadHeroImage, removeHeroImage } from "../actions";

export function HeroImageUploader({ currentUrl, currentPositionY }: { currentUrl: string | null; currentPositionY: number }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl);
  const [positionY, setPositionY] = useState(currentPositionY);
  const [isNewFile, setIsNewFile] = useState(false);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setIsNewFile(false);
      setPreviewUrl(currentUrl);
      setPositionY(currentPositionY);
      return;
    }
    setIsNewFile(true);
    setPreviewUrl(URL.createObjectURL(file));
    setPositionY(50);
  }

  return (
    <form action={isNewFile ? uploadHeroImage : updateHeroImagePosition} className="flex flex-col gap-4">
      <div className="h-64 max-w-md overflow-hidden rounded-sm border border-line bg-surface">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl} alt="Homepage photo preview" className="h-full w-full"
            style={{ objectFit: "cover", objectPosition: `center ${positionY}%` }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">No photo yet</div>
        )}
      </div>

      {previewUrl && (
        <label className="flex max-w-md flex-col gap-1.5">
          <span className="text-sm text-muted">Vertical position — drag to show more of the top or bottom</span>
          <input type="range" min={0} max={100} value={positionY} onChange={(e) => setPositionY(Number(e.target.value))} className="w-full accent-safelight" />
        </label>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" onChange={onFileChange} className="text-sm" />
        <input type="hidden" name="positionY" value={positionY} />
        <button className="btn btn-primary">{isNewFile ? "Upload photo" : "Save position"}</button>
        {currentUrl && !isNewFile && (
          <button formAction={removeHeroImage} className="btn btn-quiet">Remove photo</button>
        )}
      </div>
    </form>
  );
}
