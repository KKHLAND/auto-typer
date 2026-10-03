// 선 아이콘 (stroke 1.6, 20px 격자)
const I = ({ d, size = 18, fill, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill={fill || 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    {d}
  </svg>
);

export const Plus = (p) => <I {...p} d={<path d="M10 4v12M4 10h12" />} />;
export const Home = (p) => <I {...p} d={<><path d="M3.5 9 10 3.5 16.5 9" /><path d="M5 8v8h10V8" /></>} />;
export const Layout = (p) => <I {...p} d={<><rect x="3.5" y="3.5" width="13" height="13" rx="2" /><path d="M3.5 8h13M8 8v8.5" /></>} />;
export const Gear = ({ size = 18, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </svg>
);
export const Help = (p) => <I {...p} d={<><circle cx="10" cy="10" r="7" /><path d="M8 8a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6 1V12" /><circle cx="10" cy="14.4" r=".4" fill="currentColor" /></>} />;
export const List = (p) => <I {...p} d={<path d="M7 5.5h9M7 10h9M7 14.5h9M3.8 5.5h.2M3.8 10h.2M3.8 14.5h.2" />} />;
export const Board = (p) => <I {...p} d={<><rect x="3" y="3.5" width="4" height="13" rx="1" /><rect x="8.5" y="3.5" width="4" height="9" rx="1" /><rect x="14" y="3.5" width="3" height="11" rx="1" /></>} />;
export const Eye = (p) => <I {...p} d={<><path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z" /><circle cx="10" cy="10" r="2.3" /></>} />;
export const Columns = (p) => <I {...p} d={<><rect x="3" y="3.5" width="14" height="13" rx="1.5" /><path d="M10 3.5v13" /></>} />;
export const Download = (p) => <I {...p} d={<><path d="M10 3.5v9M6.5 9l3.5 3.5L13.5 9" /><path d="M4 15.5h12" /></>} />;
export const Printer = (p) => <I {...p} d={<><path d="M6 7V3.5h8V7" /><rect x="3.5" y="7" width="13" height="6.5" rx="1.5" /><path d="M6 11.5h8v5H6z" /></>} />;
export const Close = (p) => <I {...p} d={<path d="m5 5 10 10M15 5 5 15" />} />;
export const Trash = (p) => <I {...p} d={<><path d="M4 6h12M8 6V4h4v2M5.5 6l.8 10h7.4l.8-10" /></>} />;
export const Upload = (p) => <I {...p} d={<><path d="M10 13V4M6.5 7.5 10 4l3.5 3.5" /><path d="M4 12.5v3h12v-3" /></>} />;
export const Doc = (p) => <I {...p} d={<><path d="M5 2.8h6.5L15 6.3v10.9H5z" /><path d="M11.5 2.8v3.5H15" /></>} />;
export const Sparkle = (p) => <I {...p} d={<path d="M10 3c.6 3.2 1.8 4.4 5 5-3.2.6-4.4 1.8-5 5-.6-3.2-1.8-4.4-5-5 3.2-.6 4.4-1.8 5-5ZM15.5 13.5c.2 1 .6 1.4 1.5 1.5-1 .2-1.3.6-1.5 1.5-.2-1-.6-1.3-1.5-1.5 1-.2 1.3-.6 1.5-1.5Z" />} />;
export const Check = (p) => <I {...p} d={<path d="m4.5 10.5 3.5 3.5 7.5-8" />} />;
export const Copy = (p) => <I {...p} d={<><rect x="7" y="7" width="9.5" height="9.5" rx="1.5" /><path d="M13 7V4.5A1.5 1.5 0 0 0 11.5 3h-7A1.5 1.5 0 0 0 3 4.5v7A1.5 1.5 0 0 0 4.5 13H7" /></>} />;
export const Up = (p) => <I {...p} d={<path d="m5 12 5-5 5 5" />} />;
export const Down = (p) => <I {...p} d={<path d="m5 8 5 5 5-5" />} />;
export const Shield = (p) => <I {...p} d={<><path d="M10 2.8 4 5v4.6c0 3.6 2.6 6.4 6 7.6 3.4-1.2 6-4 6-7.6V5z" /><path d="m7.4 10 1.9 1.9L12.8 8" /></>} />;
export const Image = (p) => <I {...p} d={<><rect x="3" y="4" width="14" height="12" rx="1.5" /><circle cx="7.5" cy="8" r="1.3" /><path d="m3.5 14.5 4-4 3 3 2-2 4 4" /></>} />;
export const Expand = (p) => <I {...p} d={<path d="M11.5 3.5h5v5M8.5 16.5h-5v-5M16.5 3.5 11 9M3.5 16.5 9 11" />} />;
export const Key = (p) => <I {...p} d={<><circle cx="6.5" cy="13.5" r="3" /><path d="m8.6 11.4 7-7M13.5 6.5l2 2M11.5 8.5l1.5 1.5" /></>} />;

export const Logo = () => (
  <svg className="logo" viewBox="0 0 24 24" aria-hidden="true">
    <defs>
      <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#4c8dff" />
        <stop offset="1" stopColor="#1f5fe6" />
      </linearGradient>
    </defs>
    <path d="M12 1.5 22.5 12 12 22.5 1.5 12Z" fill="url(#lg)" />
    <path d="M8 9.2h8M8 12h8M8 14.8h5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
