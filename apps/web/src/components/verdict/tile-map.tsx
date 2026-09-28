/**
 * 4×4 overlay on the submitted image marking the regions that differ from the sealed photo (FR-11). Changed
 * regions get a thick outline, a hatch pattern and a number, so the map reads without colour.
 */
export function TileMap({ src, alteredTiles, width, height }: { src: string; alteredTiles: number[]; width: number; height: number }) {
  const regions = alteredTiles.map((i) => `row ${Math.floor(i / 4) + 1}, column ${(i % 4) + 1}`);
  return (
    <figure className="flex flex-col gap-2">
      <div className="relative w-full overflow-hidden rounded-md" style={{ aspectRatio: `${width} / ${height}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the viewer's own file, shown in-session only */}
        <img src={src} alt="Your image with changed regions highlighted" className="absolute inset-0 size-full object-fill" />
        <div className="absolute inset-0 grid grid-cols-4 grid-rows-4" aria-hidden="true">
          {Array.from({ length: 16 }, (_, i) => {
            const n = alteredTiles.indexOf(i);
            return (
              <div
                key={i}
                className={n >= 0 ? "relative border-[3px] border-verdict-altered" : "border border-white/25"}
                style={
                  n >= 0
                    ? { backgroundImage: "repeating-linear-gradient(45deg, rgb(154 43 18 / 0.35) 0 6px, transparent 6px 12px)" }
                    : undefined
                }
              >
                {n >= 0 && (
                  <span className="absolute left-1 top-1 rounded bg-verdict-altered px-1.5 text-xs font-bold text-verdict-fg">{n + 1}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <figcaption className="text-sm">
        {alteredTiles.length} of 16 regions differ from the sealed photo: {regions.join("; ")}.
      </figcaption>
    </figure>
  );
}
