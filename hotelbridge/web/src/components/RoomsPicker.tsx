import { useEffect, useRef, useState } from 'react';
import type { RoomRequest } from '../../../shared/domain';
import { Button, Stepper } from './ui';
import { Icon } from './icons';
import { plural } from '../lib/format';

export const summariseRooms = (rooms: RoomRequest[]) => {
  const adults = rooms.reduce((a, r) => a + r.adults, 0);
  const children = rooms.reduce((a, r) => a + r.childrenAges.length, 0);
  return `${plural(rooms.length, 'room')} · ${plural(adults, 'adult')}${children ? ` · ${plural(children, 'child', 'children')}` : ''}`;
};

/** Mixed room configurations: each room keeps its own adults and children's ages end-to-end. */
export function RoomsPicker({ rooms, onChange }: { rooms: RoomRequest[]; onChange: (r: RoomRequest[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open]);
  const set = (i: number, r: RoomRequest) => onChange(rooms.map((x, j) => (j === i ? r : x)));
  return (
    <div className="rooms-picker" ref={ref}>
      <button type="button" className="input rooms-trigger" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="bed" size={16} /><span>{summariseRooms(rooms)}</span>
      </button>
      {open && (
        <div className="rooms-pop enter" role="dialog" aria-label="Rooms and guests">
          {rooms.map((r, i) => (
            <div key={i} className="rooms-row">
              <div className="row between">
                <strong className="small">Room {i + 1}</strong>
                {rooms.length > 1 && <button type="button" className="link-btn small" onClick={() => onChange(rooms.filter((_, j) => j !== i))}>Remove</button>}
              </div>
              <div className="row between gap-4 mt-2"><span className="small muted">Adults</span><Stepper label={`adults in room ${i + 1}`} value={r.adults} min={1} max={6} onChange={(v) => set(i, { ...r, adults: v })} /></div>
              <div className="row between gap-4 mt-2"><span className="small muted">Children</span><Stepper label={`children in room ${i + 1}`} value={r.childrenAges.length} min={0} max={4}
                onChange={(v) => set(i, { ...r, childrenAges: v > r.childrenAges.length ? [...r.childrenAges, 8] : r.childrenAges.slice(0, v) })} /></div>
              {r.childrenAges.length > 0 && (
                <div className="row gap-2 wrap mt-2">
                  {r.childrenAges.map((age, k) => (
                    <select key={k} className="select input-sm" style={{ width: 96 }} aria-label={`Age of child ${k + 1} in room ${i + 1}`} value={age}
                      onChange={(e) => set(i, { ...r, childrenAges: r.childrenAges.map((a, m) => (m === k ? Number(e.target.value) : a)) })}>
                      {Array.from({ length: 18 }, (_, n) => <option key={n} value={n}>{n === 0 ? 'Under 1' : `${n} yrs`}</option>)}
                    </select>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="row between mt-4">
            <Button type="button" variant="secondary" size="sm" icon="plus" disabled={rooms.length >= 9} onClick={() => onChange([...rooms, { adults: 2, childrenAges: [] }])}>Add room</Button>
            <Button type="button" size="sm" onClick={() => setOpen(false)}>Done</Button>
          </div>
          {rooms.length >= 9 && <p className="xs subtle mt-2">For 10 rooms or more, use the Group Desk for negotiated rates.</p>}
        </div>
      )}
    </div>
  );
}

export function encodeRooms(rooms: RoomRequest[]) { return rooms.map((r) => [r.adults, ...r.childrenAges].join('-')).join(','); }
export function decodeRooms(s: string | null): RoomRequest[] {
  if (!s) return [{ adults: 2, childrenAges: [] }];
  const parsed = s.split(',').map((p) => { const [a, ...c] = p.split('-').map(Number); return { adults: Math.min(6, Math.max(1, a || 2)), childrenAges: c.filter((x) => x >= 0 && x <= 17).slice(0, 4) }; });
  return parsed.slice(0, 9);
}
