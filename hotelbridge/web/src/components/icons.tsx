import type { SVGProps } from 'react';

/** One consistent icon family: 20px grid, 1.6 stroke, round caps. */
const P = {
  overview: 'M3.5 10.5 10 4l6.5 6.5M5.5 9v7h9V9',
  search: 'M9 15.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM17.5 17.5l-3.9-3.9',
  calendar: 'M4 5.5h12v11H4zM4 8.5h12M7 3.5v3M13 3.5v3',
  groups: 'M7.5 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2.5 16.5c.6-2.8 2.6-4.5 5-4.5s4.4 1.7 5 4.5M13 3.3a3 3 0 0 1 0 5.5M14.5 12.3c1.6.6 2.6 2.1 3 4.2',
  heart: 'M10 16.5s-6.5-3.8-6.5-8.3A3.6 3.6 0 0 1 10 6.1a3.6 3.6 0 0 1 6.5 2.1c0 4.5-6.5 8.3-6.5 8.3Z',
  receipt: 'M5 2.5h10v15l-2.5-1.5L10 17.5 7.5 16 5 17.5zM7.5 6.5h5M7.5 9.5h5M7.5 12.5h3',
  building: 'M4 17.5V3.5h8v14M12 7.5h4v10M2.5 17.5h15M6.5 6.5h3M6.5 9.5h3M6.5 12.5h3',
  help: 'M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15ZM7.8 7.8a2.3 2.3 0 0 1 4.4 1c0 1.6-2.2 1.9-2.2 3.2M10 14.6v.1',
  logout: 'M8 17H4.5V3H8M12.5 14l4-4-4-4M16.5 10H7.5',
  menu: 'M3 5.5h14M3 10h14M3 14.5h14',
  x: 'M5 5l10 10M15 5 5 15',
  left: 'M12.5 4.5 7 10l5.5 5.5',
  right: 'M7.5 4.5 13 10l-5.5 5.5',
  plus: 'M10 4v12M4 10h12',
  check: 'M4 10.5 8 14.5 16 6',
  alert: 'M10 3 18 17H2zM10 8v4M10 14.5v.1',
  clock: 'M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15ZM10 6v4l2.5 2',
  bed: 'M2.5 15.5v-9M2.5 12.5h15v3M17.5 12.5v-2.5a2 2 0 0 0-2-2h-6v4.5M5.5 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  pin: 'M10 17.5s5.5-5 5.5-9.5a5.5 5.5 0 0 0-11 0c0 4.5 5.5 9.5 5.5 9.5ZM10 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  arrow: 'M4 10h12M11.5 5.5 16 10l-4.5 4.5',
  chart: 'M3.5 16.5h13M6 13.5V9M10 13.5V5.5M14 13.5V11',
  file: 'M5 2.5h6.5L15 6v11.5H5zM11.5 2.5V6H15',
  contract: 'M5 2.5h10v15H5zM7.5 6.5h5M7.5 9.5h5M7.5 13.5l1.5 1 3-2.5',
  shield: 'M10 2.5 16 5v5c0 3.6-2.6 6.3-6 7.5-3.4-1.2-6-3.9-6-7.5V5z',
  link: 'M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.9.9M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.9-.9',
  coins: 'M10 8.5c3.6 0 6.5-1.1 6.5-2.5S13.6 3.5 10 3.5 3.5 4.6 3.5 6 6.4 8.5 10 8.5ZM3.5 6v4c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5V6M3.5 10v4c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-4',
  plug: 'M7 2.5v4M13 2.5v4M5 6.5h10v3a5 5 0 0 1-10 0zM10 14.5v3',
  inbox: 'M2.5 11 5 4h10l2.5 7v5.5h-15zM2.5 11h4.5l1 2h4l1-2h4.5',
  sliders: 'M4 5.5h7M14 5.5h2M4 10h2M9 10h7M4 14.5h9M16 14.5h0M11 4v3M6 8.5v3M13 13v3',
  print: 'M5.5 7V2.5h9V7M5.5 14.5h-2v-7h13v7h-2M5.5 11.5h9v6h-9z',
  user: 'M10 9.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3.5 17.5c.8-3.4 3.4-5.5 6.5-5.5s5.7 2.1 6.5 5.5',
  refresh: 'M16 4.5v4h-4M4 15.5v-4h4M15.3 8.5A6 6 0 0 0 5 6.5M4.7 11.5A6 6 0 0 0 15 13.5',
  star: 'M10 2.8l2.1 4.6 5 .5-3.8 3.4 1.1 4.9L10 13.7l-4.4 2.5 1.1-4.9L2.9 7.9l5-.5z',
};

export type IconName = keyof typeof P;
export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={P[name]} />
    </svg>
  );
}

export function Logo({ dark = false, sub = 'Global' }: { dark?: boolean; sub?: string }) {
  return (
    <span className={`brand${dark ? ' dark' : ''}`}>
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill={dark ? '#0B1220' : 'rgba(255,255,255,0.08)'} />
        <path d="M6 21c5-8 15-8 20 0" stroke="#C9AE7E" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <path d="M9 21v-4M16 21v-6M23 21v-4" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span>HotelBridge <span className="brand-sub">{sub}</span></span>
    </span>
  );
}
