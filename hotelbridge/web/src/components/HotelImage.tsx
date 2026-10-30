/**
 * Hotel imagery. Shows a licensed image when one is recorded (with its credit). Otherwise renders a
 * deliberate architectural line drawing — never an unrelated photograph standing in for a real property.
 */
interface Img { url: string; caption: string | null; credit: string }
const TONES = [['#efe9df', '#d9cfbe'], ['#e9ece9', '#cdd3cd'], ['#ece8e3', '#d6cdc2'], ['#e8ebef', '#cbd2dc'], ['#f0e9e1', '#dcccba']];

function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

export function HotelImage({ name, images, height = 180, label = true }: { name: string; images?: Img[]; height?: number | string; label?: boolean }) {
  const img = images?.[0];
  if (img) {
    return (
      <div className="himg" style={{ height }}>
        <img src={img.url} alt={img.caption ?? name} loading="lazy" decoding="async" />
        <span className="himg-credit">© {img.credit}</span>
      </div>
    );
  }
  const h = hash(name);
  const [bg, ln] = TONES[h % TONES.length];
  const floors = 4 + (h % 3), cols = 5 + ((h >> 3) % 3);
  const W = 400, H = 240, bx = 70 + (h % 40), bw = W - bx * 2, top = 70 - (h % 20), fh = (H - top - 26) / floors, cw = bw / cols;
  const windows = [];
  for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
    windows.push(<rect key={`${f}-${c}`} x={bx + c * cw + cw * 0.28} y={top + f * fh + fh * 0.25} width={cw * 0.44} height={fh * 0.5} rx={f === 0 ? cw * 0.22 : 1.5} fill="none" stroke={ln} strokeWidth="1.2" />);
  }
  return (
    <div className="himg" style={{ height, background: bg }} role="img" aria-label={`${name} — photography to follow`}>
      <div className="himg-ph">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" aria-hidden>
          <line x1="0" y1={H - 26} x2={W} y2={H - 26} stroke={ln} strokeWidth="1.2" />
          <rect x={bx} y={top} width={bw} height={H - top - 26} fill="none" stroke={ln} strokeWidth="1.4" />
          <path d={`M${bx - 8} ${top} H${bx + bw + 8}`} stroke={ln} strokeWidth="1.4" />
          {windows}
          <path d={`M${W / 2 - 14} ${H - 26} v-20 a14 14 0 0 1 28 0 v20`} fill="none" stroke={ln} strokeWidth="1.4" />
        </svg>
        {label && <span className="himg-cap">Photography to follow</span>}
      </div>
    </div>
  );
}
