// Generative architectural artwork — used when no photograph is available (or fails to load).
// Deterministic per seed so a property always gets the same plate.

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const PALETTES = [
  { sky: ["#0b1424", "#1d2e4d", "#b8975c"], tower: "#e9e1d2", shade: "#cfc3ad", glass: "#2a3b5c", accent: "#d0b27a" },
  { sky: ["#f3ece0", "#e7dcc8", "#d0b27a"], tower: "#111d33", shade: "#0a1322", glass: "#d0b27a", accent: "#efe2c4" },
  { sky: ["#1b2a45", "#47587a", "#e2cc9c"], tower: "#f8f4ed", shade: "#d3c6ae", glass: "#1b2a45", accent: "#b8975c" },
];

export function ArchitecturalPlate({ seed, className, label }: { seed: string; className?: string; label?: string }) {
  const r = hash(seed);
  const pal = PALETTES[Math.floor(r() * PALETTES.length)]!;
  const W = 800;
  const H = 600;
  const towers = 2 + Math.floor(r() * 3);
  const shapes: React.ReactNode[] = [];
  let x = 60 + r() * 60;
  for (let t = 0; t < towers; t++) {
    const w = 110 + r() * 120;
    const h = 220 + r() * 300;
    const y = H - h;
    const floors = Math.floor(h / 26);
    const cols = Math.max(2, Math.floor(w / 34));
    shapes.push(<rect key={`t${t}`} x={x} y={y} width={w} height={h} fill={pal.tower} />);
    shapes.push(<rect key={`s${t}`} x={x + w * 0.72} y={y} width={w * 0.28} height={h} fill={pal.shade} opacity={0.65} />);
    for (let f = 1; f < floors; f++) {
      for (let c = 0; c < cols; c++) {
        if (r() < 0.12) continue;
        shapes.push(
          <rect key={`w${t}-${f}-${c}`} x={x + 10 + c * ((w - 20) / cols)} y={y + f * 26 - 16} width={(w - 20) / cols - 6} height={12} fill={r() < 0.08 ? pal.accent : pal.glass} opacity={r() < 0.08 ? 0.95 : 0.85} />,
        );
      }
      if (f % 5 === 0) shapes.push(<rect key={`b${t}-${f}`} x={x - 6} y={y + f * 26 - 3} width={w + 12} height={3} fill={pal.shade} />);
    }
    shapes.push(<rect key={`c${t}`} x={x + w * 0.2} y={y - 18} width={w * 0.6} height={18} fill={pal.shade} />);
    x += w + 20 + r() * 50;
  }
  const sunX = 120 + r() * 560;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className={className} role="img" aria-label={label ?? "Architectural illustration"}>
      <defs>
        <linearGradient id={`sky-${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={pal.sky[0]} />
          <stop offset="0.65" stopColor={pal.sky[1]} />
          <stop offset="1" stopColor={pal.sky[2]} />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#sky-${seed})`} />
      <circle cx={sunX} cy={170} r={70} fill={pal.accent} opacity={0.35} />
      {shapes}
      <rect y={H - 26} width={W} height={26} fill={pal.shade} opacity={0.6} />
    </svg>
  );
}
