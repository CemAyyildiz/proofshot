import { TileMap } from "@/components/verdict/tile-map";
import { VerdictBadge } from "@/components/verdict/verdict-badge";

/**
 * An illustrated car panel (not a real claim photo) with a dent painted into one region. The landing page shows it with
 * the real Verdict components so a visitor sees what a check looks like before trying one.
 */
const SCENE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfd8e0"/><stop offset="1" stop-color="#eef1f3"/></linearGradient>
<linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b7289"/><stop offset=".55" stop-color="#3f566d"/><stop offset="1" stop-color="#2c3d4e"/></linearGradient>
<linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9fb3c4"/><stop offset="1" stop-color="#5f7486"/></linearGradient>
<radialGradient id="dent" cx=".45" cy=".4" r=".6"><stop offset="0" stop-color="#1c2833"/><stop offset=".7" stop-color="#2d3e4f"/><stop offset="1" stop-color="#3f566d" stop-opacity="0"/></radialGradient>
</defs>
<rect width="800" height="600" fill="url(#sky)"/>
<rect y="470" width="800" height="130" fill="#8d9296"/>
<rect y="470" width="800" height="6" fill="#6f7478"/>
<path d="M40 250 Q90 160 250 140 L560 135 Q690 140 750 240 L770 400 Q770 440 730 445 L70 445 Q30 440 30 400 Z" fill="url(#body)"/>
<path d="M120 245 Q160 175 270 165 L400 162 L400 250 Z" fill="url(#glass)"/>
<path d="M420 162 L560 160 Q640 168 680 250 L420 250 Z" fill="url(#glass)"/>
<rect x="408" y="160" width="8" height="280" fill="#2c3d4e"/>
<rect x="300" y="290" width="60" height="10" rx="5" fill="#1f2d3a"/>
<rect x="520" y="290" width="60" height="10" rx="5" fill="#1f2d3a"/>
<path d="M40 330 L770 330" stroke="#6d8397" stroke-width="3"/>
<circle cx="170" cy="450" r="78" fill="#1a1f24"/><circle cx="170" cy="450" r="40" fill="#9aa3ab"/>
<circle cx="640" cy="450" r="78" fill="#1a1f24"/><circle cx="640" cy="450" r="40" fill="#9aa3ab"/>
<ellipse cx="505" cy="222" rx="70" ry="44" fill="url(#dent)"/>
<path d="M455 205 Q500 190 548 212" stroke="#8ea4b8" stroke-width="3" fill="none" opacity=".7"/>
</svg>`;
const SRC = `data:image/svg+xml;utf8,${encodeURIComponent(SCENE)}`;

export function VerdictExample() {
  return (
    <figure className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-sm sm:p-5" aria-labelledby="example-caption">
      <div className="flex items-center justify-between gap-3">
        <VerdictBadge kind="altered" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted">Example result</span>
      </div>
      <p className="font-medium">Matches a photo sealed 12 Sept 2026, 14:05, but 1 of 16 regions was changed after sealing.</p>
      <TileMap src={SRC} alteredTiles={[6]} width={800} height={600} alt="Illustrated car door with a dent painted in after sealing" />
      <figcaption id="example-caption" className="text-sm text-muted">
        What the Public Verifier shows for a sealed photo that was edited later. Illustration, not a real claim.
      </figcaption>
    </figure>
  );
}
