const paths = {
  modules: <><rect x="2.5" y="2.5" width="6" height="6" rx="1.6" /><rect x="11.5" y="2.5" width="6" height="6" rx="1.6" /><rect x="2.5" y="11.5" width="6" height="6" rx="1.6" /><rect x="11.5" y="11.5" width="6" height="6" rx="1.6" /></>,
  challenge: <><path d="M4.5 17.5v-15" /><path d="M4.5 3.5h9.8l-2 3.4 2 3.4H4.5" /></>,
  record: <><path d="M4 5h12M4 10h12M4 15h7" /><path d="m13.2 15 1.6 1.6 3-3.4" /></>,
  algorithms: <><path d="m6.5 6-4 4 4 4" /><path d="m13.5 6 4 4-4 4" /><path d="m11.4 3.6-2.8 12.8" /></>,
  preview: <><path d="M1.8 10S4.8 4.4 10 4.4 18.2 10 18.2 10 15.2 15.6 10 15.6 1.8 10 1.8 10Z" /><circle cx="10" cy="10" r="2.5" /></>,
  collapse: <><rect x="2.5" y="3.5" width="15" height="13" rx="2.4" /><path d="M7.5 3.5v13" /><path d="m13 8-2 2 2 2" /></>,
  expand: <><rect x="2.5" y="3.5" width="15" height="13" rx="2.4" /><path d="M7.5 3.5v13" /><path d="m11.4 8 2 2-2 2" /></>,
  compact: <><rect x="2.5" y="3" width="15" height="14" rx="2" /><path d="M8.5 3v14M5.5 6.5v.6m0 2.6v.6m0 2.6v.6" /></>,
  pin: <><path d="m6.5 3.5 7 0-1.3 2.1v3.2l2.4 2.9H5.4l2.4-2.9V5.6Z" /><path d="M10 12v5" /></>,
  previous: <path d="m12.5 4.5-5.5 5.5 5.5 5.5" />,
  next: <path d="m7.5 4.5 5.5 5.5-5.5 5.5" />,
  close: <path d="m5 5 10 10M15 5 5 15" />,
  fullscreen: <path d="M3 8V3h5m4 0h5v5M3 12v5h5m4 0h5v-5" />,
  refresh: <><path d="M16.2 8.2A6.4 6.4 0 1 0 16.4 12" /><path d="M16.6 3.8v4.6H12" /></>,
} as const

export type IconName = keyof typeof paths

/** Line icons drawn on a 20 by 20 grid. They are decorative; the button text carries the name. */
export function Icon({ name, size = 17 }: { name: IconName; size?: number }) {
  return <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>
}

export function FerryDockIcon() {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 32 28" className="ferry-dock-icon">
    <path fill="#ffe0a5" d="M7 15V7h5V4h8v3h4v8z" />
    <path fill="#206882" d="M9 9h4v4H9zm6 0h4v4h-4z" />
    <path fill="#ffac5e" d="M2 15h28l-6 8H8z" />
    <path fill="none" stroke="#8ee4ea" strokeWidth="2" d="M2 24q4 3 8 0 4 3 8 0 4 3 10 0" />
  </svg>
}
