"use client";

// Shows the photo in the exact same frame shape as the homepage, so what you
// see here is what visitors see. Position sets the object-position focal
// point; zoom scales the image up around that same point via a CSS
// transform, so all three controls share one coherent focal point.
import { useState } from "react";
import { updateHeroImagePosition, uploadHeroImage, removeHeroImage } from "../actions";

export function HeroImageUploader({
  currentUrl, currentPositionX, currentPositionY, currentZoom,
}: {
  currentUrl: string | null;
  currentPositionX: number;
  currentPositionY: number;
  currentZoom: number;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl);
  const [x, setX] = useState(currentPositionX);
  const [y, setY] = useState(currentPositionY);
  const [zoom, setZoom] = useState(currentZoom);
  const [isNewFile, setIsNewFile] = useState(false);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setIsNewFile(false);
      setPreviewUrl(currentUrl);
      setX(currentPositionX); setY(currentPositionY); setZoom(currentZoom);
      return;
    }
    setIsNewFile(true);
    setPreviewUrl(URL.createObjectURL(file));
    setX(50); setY(50); setZoom(100);
  }

  return (
    <form action={isNewFile ? uploadHeroImage : updateHeroImagePosition} className="flex flex-col gap-4">
      <div className="h-64 max-w-md overflow-hidden rounded-sm border border-line bg-surface">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl} alt="Homepage photo preview" className="h-full w-full"
            style={{ objectFit: "cover", objectPosition: `${x}% ${y}%`, transform: `scale(${zoom / 100})`, transformOrigin: `${x}% ${y}%` }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">No photo yet</div>
        )}
      </div>

      {previewUrl && (
        <div className="grid max-w-md gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">Left / right</span>
            <input type="range" min={0} max={100} value={x} onChange={(e) => setX(Number(e.target.value))} className="w-full accent-safelight" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">Up / down</span>
            <input type="range" min={0} max={100} value={y} onChange={(e) => setY(Number(e.target.value))} className="w-full accent-safelight" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">Zoom</span>
            <input type="range" min={100} max={300} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full accent-safelight" />
          </label>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" onChange={onFileChange} className="text-sm" />
        <input type="hidden" name="positionX" value={x} />
        <input type="hidden" name="positionY" value={y} />
        <input type="hidden" name="zoom" value={zoom} />
        <button className="btn btn-primary">{isNewFile ? "Upload photo" : "Save position"}</button>
        {currentUrl && !isNewFile && (
          <button formAction={removeHeroImage} className="btn btn-quiet">Remove photo</button>
        )}
      </div>
    </form>
  );
}
