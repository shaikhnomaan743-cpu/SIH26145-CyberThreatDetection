import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ackAlert,
  apiRoot,
  clearData,
  fetchAlerts,
  fetchFlows,
  fetchHealth,
  fetchIntel,
  login as apiLogin,
  simulateTraffic,
  uploadPcap,
} from './api';

const C = {
  bg: '#040a0c',
  panel: '#0a1417',
  panelAlt: '#0c191d',
  line: '#15272c',
  lineSoft: '#101f23',
  teal: '#2fdcd2',
  teal2: '#1fa9a5',
  teal3: '#15807e',
  teal4: '#0c5252',
  red: '#e85d4c',
  yellow: '#e6c35c',
  text: '#e8f4f5',
  muted: '#8ba3a7',
  dim: '#5c7377',
};

const RANGE_MS = { '1h': 3600000, '24h': 86400000, '7d': 7 * 86400000 };
const RANGE_LABEL = { '1h': 'Last 1 Hour', '24h': 'Last 24 Hours', '7d': 'Last 7 Days', all: 'All time' };
const RANGES = ['1h', '24h', '7d', 'all'];

function flowTime(row) {
  const t = Date.parse(row.timestamp || '');
  return Number.isNaN(t) ? 0 : t;
}

function alertTime(row) {
  const t = Date.parse(row.timestamp || '');
  return Number.isNaN(t) ? 0 : t;
}

function inWindow(ts, range) {
  if (range === 'all' || !ts) return true;
  return Date.now() - ts <= RANGE_MS[range];
}

function hashIp(ip) {
  let h = 0;
  for (let i = 0; i < (ip || '').length; i += 1) h = (h * 33 + ip.charCodeAt(i)) >>> 0;
  return h;
}

const smoothPath = (pts) => {
  if (!pts.length) return '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [x0, y0] = pts[Math.max(i - 1, 0)];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const [x3, y3] = pts[Math.min(i + 2, pts.length - 1)];
    d += ` C ${x1 + (x2 - x0) / 6} ${y1 + (y2 - y0) / 6}, ${x2 - (x3 - x1) / 6} ${y2 - (y3 - y1) / 6}, ${x2} ${y2}`;
  }
  return d;
};

const linePath = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'} ${x} ${y}`).join(' ');

function Sparkline({ id, values }) {
  const w = 220;
  const h = 46;
  const series = values.length ? values : [0, 0];
  const max = Math.max(...series);
  const min = Math.min(...series);
  const pts = series.map((v, i) => [
    (i / (series.length - 1 || 1)) * w,
    h - 4 - ((v - min) / (max - min || 1)) * (h - 12),
  ]);
  const d = linePath(pts);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={S.sparkline}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.teal} stopOpacity="0.35" />
          <stop offset="100%" stopColor={C.teal} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L ${w} ${h} L 0 ${h} Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={C.teal} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const CONTINENTS = [
  'M33 69 L111 52 L167 45 L236 41 L278 41 L333 52 L347 114 L306 138 L278 183 L231 203 L194 214 L175 183 L153 155 L125 93 Z',
  'M375 86 L339 66 L347 10 L444 7 L444 52 Z',
  'M244 235 L267 259 L289 262 L333 276 L361 293 L403 314 L394 345 L367 379 L339 424 L319 472 L300 448 L306 362 L283 310 L272 266 Z',
  'M472 169 L475 145 L494 128 L514 110 L514 93 L533 103 L556 52 L583 52 L611 66 L639 86 L625 138 L578 152 L550 155 L533 138 L508 148 Z',
  'M453 241 L500 241 L542 183 L589 186 L619 252 L642 252 L611 310 L611 379 L569 410 L550 410 L533 314 L522 279 L478 276 Z',
  'M639 103 L667 45 L750 35 L833 38 L917 52 L972 59 L1000 69 L986 86 L944 103 L889 138 L861 172 L839 190 L806 224 L778 252 L764 224 L744 217 L722 266 L700 224 L689 210 L667 207 L656 200 L633 190 L625 155 Z',
  'M814 369 L861 335 L894 331 L925 379 L911 424 L881 414 L819 410 Z',
];

function WorldMap({ flows }) {
  const nodes = useMemo(() => {
    const byIp = {};
    flows.forEach((f) => {
      const ip = f.source_ip;
      if (!ip) return;
      if (!byIp[ip]) {
        const h = hashIp(ip);
        byIp[ip] = {
          ip,
          x: 70 + (h % 860),
          y: 40 + ((Math.floor(h / 860) % 40) * 10),
          bytes: 0,
          bad: false,
        };
      }
      byIp[ip].bytes += f.byte_count || 0;
      byIp[ip].bad = byIp[ip].bad || !!f.is_malicious;
    });
    return Object.values(byIp).sort((a, b) => b.bytes - a.bytes).slice(0, 18);
  }, [flows]);

  return (
    <svg viewBox="0 0 1000 500" style={{ width: '100%', height: '100%', display: 'block' }}>
      <defs>
        <pattern id="landDots" width="7.2" height="7.2" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.35" fill="#17454b" />
        </pattern>
        <radialGradient id="nodeGlow">
          <stop offset="0%" stopColor={C.teal} stopOpacity="0.55" />
          <stop offset="70%" stopColor={C.teal} stopOpacity="0.08" />
          <stop offset="100%" stopColor={C.teal} stopOpacity="0" />
        </radialGradient>
      </defs>
      {CONTINENTS.map((d, i) => <path key={i} d={d} fill="url(#landDots)" />)}
      {nodes.length === 0 && (
        <text x="500" y="250" textAnchor="middle" fill={C.dim} fontSize="16">No source IPs in this window</text>
      )}
      {nodes.map((n) => (
        <g key={n.ip}>
          <circle cx={n.x} cy={n.y} r={22} fill="url(#nodeGlow)" />
          <circle cx={n.x} cy={n.y} r={n.bad ? 11 : 8} fill="none" stroke={C.teal} strokeWidth="1.6" />
          <circle cx={n.x} cy={n.y} r={3} fill={C.teal} />
          <text x={n.x + 14} y={n.y - 10} fill={C.muted} fontSize="11">{n.ip}</text>
        </g>
      ))}
    </svg>
  );
}

function bucketSeries(items, range, getTs, pred) {
  const now = Date.now();
  let n = 8;
  let span = RANGE_MS['7d'];
  if (range === '1h') { n = 12; span = RANGE_MS['1h']; }
  else if (range === '24h') { n = 12; span = RANGE_MS['24h']; }
  else if (range === 'all') {
    const times = items.map(getTs).filter(Boolean);
    span = times.length ? Math.max(now - Math.min(...times), RANGE_MS['1h']) : RANGE_MS['7d'];
  }
  const start = now - span;
  const step = span / n;
  const labels = [];
  const values = [];
  for (let i = 0; i < n; i += 1) {
    const a = start + i * step;
    const b = a + step;
    const count = items.filter((it) => {
      const t = getTs(it);
      return t >= a && t < b && (!pred || pred(it));
    }).length;
    values.push(count);
    const d = new Date(a + step / 2);
    if (span <= RANGE_MS['1h']) labels.push(`${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`);
    else if (span <= RANGE_MS['24h']) labels.push(`${d.getHours()}:00`);
    else labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
  }
  return { labels, values };
}

function LineChart({ series, yLabel, height = 220, width = 660 }) {
  const L = 52;
  const R = width - 24;
  const T = 18;
  const B = height - 24;
  const all = series.flatMap((s) => s.data);
  const max = Math.max(4, ...all);
  const px = (i, len) => L + (i / Math.max(len - 1, 1)) * (R - L);
  const py = (v) => B - (v / max) * (B - T);
  const ticks = 5;
  const labels = series[0]?.labels || [];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height }}>
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const v = Math.round((max / ticks) * i);
        return (
          <g key={v}>
            <line x1={L} y1={py(v)} x2={R} y2={py(v)} stroke={C.lineSoft} strokeWidth="1" />
            <text x={L - 10} y={py(v) + 3.5} textAnchor="end" fontSize="10" fill={C.dim}>{v}</text>
          </g>
        );
      })}
      <text x={L - 10} y={T - 6} fontSize="10" fill={C.dim}>{yLabel}</text>
      {series.map((s) => {
        const pts = s.data.map((v, i) => [px(i, s.data.length), py(v)]);
        const d = s.smooth ? smoothPath(pts) : linePath(pts);
        return (
          <g key={s.label}>
            {s.fill && <path d={`${d} L ${R} ${B} L ${L} ${B} Z`} fill={C.teal} opacity="0.12" />}
            <path d={d} fill="none" stroke={s.color} strokeWidth={s.w || 1.8} strokeLinecap="round" />
          </g>
        );
      })}
      <line x1={L} y1={B} x2={R} y2={B} stroke={C.line} strokeWidth="1" />
      {labels.map((lab, i) => (
        <text key={`${lab}-${i}`} x={px(i, labels.length)} y={B + 16} textAnchor="middle" fontSize="9" fill={C.dim}>{lab}</text>
      ))}
    </svg>
  );
}

function Donut({ items }) {
  const counts = { High: 0, Medium: 0, Low: 0, Info: 0 };
  items.forEach((a) => {
    const k = counts[a.severity] !== undefined ? a.severity : 'Info';
    counts[k] += 1;
  });
  const total = items.length;
  const parts = [
    { label: 'High', count: counts.High, color: C.teal },
    { label: 'Medium', count: counts.Medium, color: C.teal2 },
    { label: 'Low', count: counts.Low, color: C.teal3 },
    { label: 'Info', count: counts.Info, color: C.teal4 },
  ];
  let offset = 0;
  return (
    <div style={S.donutWrap}>
      <div style={{ position: 'relative', width: 132, height: 132, flexShrink: 0 }}>
        <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
          <circle cx="18" cy="18" r="15.915" fill="transparent" stroke={C.line} strokeWidth="5.5" />
          {parts.map((s) => {
            const pct = total ? (s.count / total) * 100 : 0;
            const el = (
              <circle
                key={s.label}
                cx="18" cy="18" r="15.915"
                fill="transparent"
                stroke={s.color}
                strokeWidth="5.5"
                strokeDasharray={`${pct} ${100 - pct}`}
                strokeDashoffset={-offset}
              />
            );
            offset += pct;
            return el;
          })}
        </svg>
        <div style={S.donutCenter}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 22 }}>{total}</div>
          <div style={{ color: C.dim, fontSize: 10 }}>Total</div>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {parts.map((s) => (
          <div key={s.label} style={S.donutLegend}>
            <span style={{ ...S.legendDot, background: s.color }} />
            <span style={{ flex: 1, color: C.muted }}>{s.label}</span>
            <b style={{ color: C.text, fontWeight: 500 }}>{s.count}</b>
            <span style={{ color: C.dim, width: 54, textAlign: 'right' }}>
              ({total ? ((s.count / total) * 100).toFixed(1) : '0.0'}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const Ic = {
  ShieldLock: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <rect x="9" y="10" width="6" height="5" rx="1" />
      <path d="M10.5 10V8.5a1.5 1.5 0 0 1 3 0V10" />
    </svg>
  ),
  Home: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>),
  Monitor: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 12h4l2-3 2 6 2-4 2 1h6" /></svg>),
  Bell: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>),
  Report: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg>),
  Chart: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="3 17 9 11 13 15 21 7" /><polyline points="15 7 21 7 21 13" /></svg>),
  Target: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>),
  Gear: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>),
  Search: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" {...p}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>),
  Calendar: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>),
  Chevron: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="6 9 12 15 18 9" /></svg>),
  Trend: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="3 17 9 11 13 15 21 7" /><polyline points="15 7 21 7 21 13" /></svg>),
  ShieldCheck: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></svg>),
  Skull: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 2a8 8 0 0 0-8 8c0 2.5 1.2 4 2.5 5V18a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-3c1.3-1 2.5-2.5 2.5-5a8 8 0 0 0-8-8z" /><circle cx="9" cy="10" r="1.4" /><circle cx="15" cy="10" r="1.4" /></svg>),
  ArrowRight: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="4" y1="12" x2="20" y2="12" /><polyline points="14 6 20 12 14 18" /></svg>),
  Upload: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
};

const NAV = [
  { label: 'Overview', icon: Ic.Home },
  { label: 'Real-time Monitor', icon: Ic.Monitor },
  { label: 'Alerts', icon: Ic.Bell },
  { label: 'Reports', icon: Ic.Report },
  { label: 'Traffic Analysis', icon: Ic.Chart },
  { label: 'Threat Intelligence', icon: Ic.Target },
  { label: 'Settings', icon: Ic.Gear },
];

function matchesQuery(row, q) {
  if (!q) return true;
  const blob = [
    row.source_ip, row.destination_ip, row.threat_type, row.protocol,
    row.port, row.destination_port, row.severity, row.threat_type,
  ].join(' ').toLowerCase();
  return blob.includes(q);
}

function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Empty({ text, actionText, onAction }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 0' }}>
      <div style={{ color: C.dim, fontSize: 13, marginBottom: actionText ? 12 : 0 }}>{text}</div>
      {actionText && (
        <button onClick={onAction} style={{ ...S.livePill, margin: '0 auto' }}>
          {actionText}
        </button>
      )}
    </div>
  );
}

function Login({ onOk }) {
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    const fd = new FormData(e.target);
    const username = String(fd.get('username') || '');
    const password = String(fd.get('password') || '');
    try {
      const data = await apiLogin(username, password);
      localStorage.setItem('threx_session', JSON.stringify(data));
      onOk(data);
    } catch (ex) {
      setErr(ex.message);
    }
  };
  return (
    <div style={{ ...S.app, alignItems: 'center', justifyContent: 'center' }}>
      <form onSubmit={submit} className="login-card" style={{ ...S.card, width: 380, padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <Ic.ShieldLock width="28" height="28" style={{ color: C.teal }} />
          <div>
            <div style={S.brandTop}>THREX AI</div>
            <div style={S.brandBottom}>OPERATOR LOGIN</div>
          </div>
        </div>
        <input name="username" defaultValue="admin" autoComplete="username" style={{ ...S.searchInput, ...S.field }} placeholder="Username" />
        <input name="password" type="password" autoComplete="current-password" style={{ ...S.searchInput, ...S.field, marginTop: 10 }} placeholder="Password" />
        {err && <div style={{ color: C.teal, fontSize: 12, marginTop: 10 }}>{err}</div>}
        <button type="submit" style={{ ...S.livePill, marginTop: 16, width: '100%', justifyContent: 'center', background: 'rgba(47,220,210,0.12)' }}>Sign in</button>
        <div style={{ color: C.dim, fontSize: 11, marginTop: 12 }}>Default operator: admin / threx</div>
      </form>
    </div>
  );
}

export default function App() {
  const session = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('threx_session') || 'null'); } catch { return null; }
  }, []);
  const [user, setUser] = useState(session);
  const [flows, setFlows] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [intel, setIntel] = useState([]);
  const [health, setHealth] = useState(null);
  const [active, setActive] = useState('Overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [range, setRange] = useState('7d');
  const [sevFilter, setSevFilter] = useState('All');
  const [paused, setPaused] = useState(false);
  const [pollMs, setPollMs] = useState(() => Number(localStorage.getItem('threx_poll') || 2000));
  const [clock, setClock] = useState(new Date());
  const [lastUpdated, setLastUpdated] = useState(null);
  const [notice, setNotice] = useState('');
  const [isInjecting, setIsInjecting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [online, setOnline] = useState(false);
  const fileInputRef = useRef(null);

  const fetchData = useCallback(() => {
    fetchFlows().then((d) => {
      if (Array.isArray(d)) setFlows(d);
      setOnline(true);
      setLastUpdated(new Date());
    }).catch(() => setOnline(false));
    fetchAlerts().then((d) => { if (Array.isArray(d)) setAlerts(d); }).catch(() => {});
    fetchIntel().then((d) => { if (Array.isArray(d)) setIntel(d); }).catch(() => {});
    fetchHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    fetchData();
    if (paused) return undefined;
    const interval = setInterval(fetchData, pollMs);
    return () => clearInterval(interval);
  }, [user, fetchData, pollMs, paused]);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const q = searchQuery.toLowerCase().trim();
  const winFlows = flows.filter((f) => inWindow(flowTime(f), range) && matchesQuery(f, q));
  const winAlerts = alerts.filter((a) => inWindow(alertTime(a), range) && matchesQuery(a, q));
  const unread = alerts.filter((a) => !a.acknowledged).length;
  const threatFlows = winFlows.filter((f) => f.is_malicious);
  const normalFlows = winFlows.filter((f) => !f.is_malicious);

  const sparkFlows = bucketSeries(winFlows, range, flowTime).values;
  const sparkThreats = bucketSeries(winAlerts, range, alertTime).values;
  const trendNormal = bucketSeries(winFlows, range, flowTime, (f) => !f.is_malicious);
  const trendBad = bucketSeries(winFlows, range, flowTime, (f) => f.is_malicious);
  const threatSeries = bucketSeries(winAlerts, range, alertTime);

  const portRows = useMemo(() => {
    const m = {};
    winFlows.forEach((f) => {
      const p = f.destination_port || 0;
      if (!m[p]) m[p] = { port: p, bytes: 0, flows: 0 };
      m[p].bytes += f.byte_count || 0;
      m[p].flows += 1;
    });
    const list = Object.values(m).sort((a, b) => b.bytes - a.bytes).slice(0, 8);
    const max = list[0]?.bytes || 1;
    return list.map((r) => ({ ...r, pct: (r.bytes / max) * 100 }));
  }, [winFlows]);

  const protoRows = useMemo(() => {
    const m = {};
    winFlows.forEach((f) => {
      const p = f.protocol || 'OTHER';
      m[p] = (m[p] || 0) + 1;
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [winFlows]);

  const talkers = useMemo(() => {
    const m = {};
    winFlows.forEach((f) => {
      const ip = f.source_ip;
      if (!m[ip]) m[ip] = { ip, bytes: 0, flows: 0, bad: 0 };
      m[ip].bytes += f.byte_count || 0;
      m[ip].flows += 1;
      if (f.is_malicious) m[ip].bad += 1;
    });
    return Object.values(m).sort((a, b) => b.bytes - a.bytes).slice(0, 12);
  }, [winFlows]);

  const filteredAlerts = winAlerts.filter((a) => sevFilter === 'All' || a.severity === sevFilter);

  const handleInjectTestFlow = async () => {
    setIsInjecting(true);
    try {
      // Send a valid scenario instead of the raw packet
      const data = await simulateTraffic('flood');
      fetchData();
      setNotice(
        `Injected flow scored ${data.prediction?.threat_type} (${data.prediction?.severity}, ${((data.prediction?.confidence || 0) * 100).toFixed(1)}%)`
      );
    } catch (ex) {
      setNotice(`Error: ${ex.message}`);
    } finally {
      setIsInjecting(false);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const res = await uploadPcap(file);
      setNotice(`PCAP: ${res.summary.total_flows} flows, ${res.summary.threat_count} threats`);
      fetchData();
    } catch (err) {
      setNotice(err.message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const cycleRange = () => {
    const i = RANGES.indexOf(range);
    setRange(RANGES[(i + 1) % RANGES.length]);
  };

  const exportJson = () => {
    download(`threx-report-${range}.json`, JSON.stringify({ range, generated: new Date().toISOString(), flows: winFlows, alerts: winAlerts }, null, 2), 'application/json');
  };

  const exportCsv = () => {
    const header = 'time,source_ip,destination_ip,port,protocol,threat_type,severity,confidence\n';
    const body = winAlerts.map((a) => [a.time, a.source_ip, a.destination_ip, a.port, a.protocol, a.threat_type, a.severity, a.confidence].join(',')).join('\n');
    download(`threx-alerts-${range}.csv`, header + body, 'text/csv');
  };

  if (!user) return <Login onOk={setUser} />;

  const METRICS = [
    { key: 'total', label: 'TOTAL FLOWS', value: String(winFlows.length), change: RANGE_LABEL[range], icon: Ic.Trend, spark: sparkFlows },
    { key: 'normal', label: 'NORMAL FLOWS', value: String(normalFlows.length), change: winFlows.length ? `${((normalFlows.length / winFlows.length) * 100).toFixed(0)}% of window` : 'No traffic', icon: Ic.ShieldCheck, spark: trendNormal.values },
    { key: 'threats', label: 'THREATS DETECTED', value: String(winAlerts.length), change: unread ? `${unread} unread` : 'None unread', icon: Ic.Skull, spark: sparkThreats },
    { key: 'status', label: 'ENGINE STATUS', value: online ? 'ACTIVE' : 'OFFLINE', change: health?.engine || 'Isolation Forest', icon: Ic.ShieldLock, spark: online ? [1, 1, 1, 1, 1, 1, 1] : [0, 0, 0, 0, 0, 0, 0] },
  ];

  return (
    <div style={S.app}>
      <style>{`
        * { box-sizing: border-box; }
        input::placeholder { color: ${C.dim}; }
        .nav-item { transition: background 0.15s ease, color 0.15s ease; }
        .nav-item:hover { background: #0f1f23; color: ${C.text}; }
        .row-hover:hover { background: #0d1a1e; }
        .pill:hover { border-color: ${C.teal3}; }
        button { font-family: inherit; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: #16292e; border-radius: 4px; }
        @media (max-width: 1200px) {
          .metrics { grid-template-columns: repeat(2, 1fr) !important; }
          .two-col, .three-col { grid-template-columns: 1fr !important; }
        }

        .metric-card {
          transition: transform 0.2s ease, box-shadow 0.3s ease, border-color 0.2s ease;
          cursor: default;
        }
        .metric-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 8px 30px rgba(47, 220, 210, 0.06);
          border-color: rgba(47, 220, 210, 0.25);
        }

        .table-row:nth-child(even) {
          background: rgba(47, 220, 210, 0.02);
        }
        .table-row:hover {
          background: rgba(47, 220, 210, 0.06);
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .chart-container {
          animation: slideUp 0.4s ease;
        }

        @keyframes pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.4); }
          100% { opacity: 1; transform: scale(1); }
        }
        .live-dot-active {
          animation: pulse 1.8s ease-in-out infinite;
        }

        .login-card {
          position: relative;
          border: 1px solid rgba(47, 220, 210, 0.15);
          box-shadow: 0 0 60px rgba(47, 220, 210, 0.04);
        }
        .login-card::before {
          content: '';
          position: absolute;
          top: -1px;
          left: 20%;
          right: 20%;
          height: 2px;
          background: linear-gradient(90deg, transparent, #2fdcd2, transparent);
        }
      `}</style>

      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".pcap,.pcapng" style={{ display: 'none' }} />

      <aside style={S.sidebar}>
        <div>
          <div style={S.logoRow}>
            <div style={S.logoMark}><Ic.ShieldLock width="26" height="26" style={{ color: C.teal }} /></div>
            <div>
              <div style={S.brandTop}>THREX AI</div>
              <div style={S.brandBottom}>PREDICTIVE NETWORK DEFENSE</div>
            </div>
          </div>
          <nav style={S.nav}>
            {NAV.map(({ label, icon: Icon }) => {
              const on = active === label;
              return (
                <div key={label} className="nav-item" onClick={() => setActive(label)} style={{ ...S.navItem, ...(on ? S.navItemOn : null) }}>
                  <Icon width="19" height="19" style={{ color: on ? C.teal : C.dim, flexShrink: 0 }} />
                  <span>{label}</span>
                  {label === 'Alerts' && unread > 0 && <span style={S.badge}>{unread}</span>}
                </div>
              );
            })}
          </nav>
        </div>
        <div style={S.statusCard}>
          <div style={S.statusTitle}>System Status</div>
          <div style={S.statusOk}>
            <Ic.ShieldCheck width="17" height="17" style={{ color: online ? C.teal : C.dim }} />
            <span>{online ? 'AI Core Active' : 'API offline'}</span>
          </div>
          <div style={S.statRow}><span>Engine</span><b style={{ color: C.teal }}>{health?.engine || 'Isolation Forest'}</b></div>
          <div style={S.statRow}><span>Threats logged</span><b style={{ color: C.text }}>{alerts.length}</b></div>
          <div style={S.statRow}><span>Flows logged</span><b style={{ color: C.text }}>{flows.length}</b></div>
        </div>
      </aside>

      <main style={S.main}>
        <header style={S.topbar}>
          <div style={S.search}>
            <Ic.Search width="16" height="16" style={{ color: C.dim, flexShrink: 0 }} />
            <input placeholder="Search IP, port, protocol, type..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={S.searchInput} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
            <span style={S.topbarClock}>{clock.toLocaleTimeString()}</span>
            <button type="button" onClick={cycleRange} className="pill" style={S.datePill}>
              <Ic.Calendar width="15" height="15" style={{ color: C.muted }} />
              <span>{RANGE_LABEL[range]}</span>
              <Ic.Chevron width="13" height="13" style={{ color: C.dim }} />
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="pill" style={{ ...S.livePill, border: `1px solid ${C.teal2}` }}>
              <Ic.Upload width="14" height="14" style={{ color: C.teal }} />
              <span>{isUploading ? 'Analyzing PCAP...' : 'Upload PCAP'}</span>
            </button>
            <button type="button" onClick={handleInjectTestFlow} disabled={isInjecting} className="pill" style={S.livePill}>
              <span>{isInjecting ? 'Injecting...' : 'Test ML Threat'}</span>
            </button>
            <button
              type="button"
              className="pill"
              style={S.livePill}
              onClick={() => { fetchData(); setPaused(false); setNotice(online ? 'Live monitoring on — polling the engine.' : 'Engine unreachable at ' + apiRoot()); }}
            >
              <span style={{
                ...S.liveDot,
                background: online ? C.teal : C.dim,
                ...(online ? { animation: 'pulse 1.8s ease-in-out infinite', boxShadow: `0 0 12px ${C.teal}40` } : {})
              }} />
              <span>{online ? 'Live Monitoring' : 'Offline'}</span>
              {lastUpdated && <span style={{ color: C.dim, fontSize: 10, marginLeft: 4 }}>· {lastUpdated.toLocaleTimeString()}</span>}
            </button>
            <button type="button" onClick={() => setActive('Alerts')} style={S.iconBtn} title="Alerts">
              <Ic.Bell width="19" height="19" style={{ color: unread ? C.teal : C.muted }} />
              {unread > 0 && <span style={S.bellDot}>{unread}</span>}
            </button>
            <button type="button" onClick={() => setActive('Settings')} style={S.user}>
              <div style={S.avatar}>{(user.user || 'A')[0].toUpperCase()}</div>
              <span style={{ color: C.text, fontSize: 13 }}>{user.user || 'Admin'}</span>
              <Ic.Chevron width="13" height="13" style={{ color: C.dim }} />
            </button>
          </div>
        </header>

        {notice && (
          <div style={S.notice} onClick={() => setNotice('')}>{notice} — click to dismiss</div>
        )}

        {active === 'Overview' && (
          <>
            <section className="metrics" style={S.metrics}>
              {METRICS.map((m) => (
                <div key={m.key} className="metric-card" style={S.metricCard}>
                  <div style={S.metricTop}>
                    <div style={S.metricIcon}><m.icon width="18" height="18" style={{ color: C.teal }} /></div>
                    <div>
                      <div style={S.metricLabel}>{m.label}</div>
                      <div style={S.metricValue}>{m.value}</div>
                      <div style={S.metricChange}><span style={{ color: C.teal, fontWeight: 600 }}>{m.change}</span></div>
                    </div>
                  </div>
                  <Sparkline id={`spark-${m.key}`} values={m.spark} />
                </div>
              ))}
            </section>

            <section className="two-col" style={S.twoCol}>
              <div style={S.card}>
                <div style={S.cardHead}>
                  <div>
                    <h3 style={S.cardTitle}>OBSERVED SOURCE MAP</h3>
                    <div style={S.cardSub}>Source IPs in the selected window (schematic placement)</div>
                  </div>
                </div>
                <div className="chart-container" style={{ height: 250 }}><WorldMap flows={winFlows} /></div>
              </div>
              <div style={S.card}>
                <div style={{ ...S.cardHead, alignItems: 'center' }}>
                  <h3 style={S.cardTitle}>TRAFFIC TREND</h3>
                  <div style={S.legendRow}>
                    {[['Normal', C.teal], ['Threat', C.teal3]].map(([l, c]) => (
                      <span key={l} style={S.legendItem}><span style={{ ...S.legendDash, background: c }} />{l}</span>
                    ))}
                  </div>
                  <button type="button" className="pill" style={S.selectPill} onClick={() => setRange(range === '7d' ? '24h' : '7d')}>
                    {RANGE_LABEL[range]} <Ic.Chevron width="12" height="12" />
                  </button>
                </div>
                <div className="chart-container">
                  <LineChart
                    yLabel="Flows"
                    series={[
                      { label: 'Normal', data: trendNormal.values, labels: trendNormal.labels, color: C.teal, w: 2.2, fill: true, smooth: true },
                      { label: 'Threat', data: trendBad.values, labels: trendBad.labels, color: C.teal3, w: 1.6, smooth: true },
                    ]}
                  />
                </div>
              </div>
            </section>

            <section className="three-col" style={S.threeCol}>
              <div style={S.card}>
                <div style={{ ...S.cardHead, alignItems: 'center' }}>
                  <h3 style={S.cardTitle}>THREATS OVER TIME</h3>
                  <button type="button" className="pill" style={S.selectPill} onClick={() => setRange(range === '24h' ? '1h' : '24h')}>
                    {RANGE_LABEL[range]} <Ic.Chevron width="12" height="12" />
                  </button>
                </div>
                <div className="chart-container">
                  <LineChart
                    yLabel="Alerts"
                    height={168}
                    width={400}
                    series={[{ label: 'Alerts', data: threatSeries.values, labels: threatSeries.labels, color: C.teal, fill: true }]}
                  />
                </div>
              </div>
              <div style={S.card}>
                <div style={S.cardHead}><h3 style={S.cardTitle}>THREAT SEVERITY DISTRIBUTION</h3></div>
                <div className="chart-container"><Donut items={winAlerts} /></div>
              </div>
              <div style={S.card}>
                <div style={S.cardHead}><h3 style={S.cardTitle}>TOP DESTINATION PORTS</h3></div>
                {portRows.length === 0 && (
                  <Empty
                    text="No flows in this window"
                    actionText="Upload PCAP"
                    onAction={() => fileInputRef.current?.click()}
                  />
                )}
                {portRows.map((p) => (
                  <div key={p.port} style={{ ...S.portRow, marginBottom: 11 }}>
                    <span style={{ width: 72, color: C.muted }}>{p.port}</span>
                    <span style={S.barTrack}><span style={{ ...S.barFill, width: `${p.pct}%` }} /></span>
                    <span style={{ width: 90, textAlign: 'right', color: C.text, fontSize: 11 }}>
                      {(p.bytes / 1024 / 1024).toFixed(1)} MB
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <AlertTable rows={filteredAlerts.slice(0, 12)} onAck={async (id) => { 
              try {
                await ackAlert(id);
                fetchData();
              } catch (err) {
                setNotice(`Failed to acknowledge: ${err.message}`);
              }
            }} onViewAll={() => setActive('Alerts')} />
          </>
        )}

        {active === 'Real-time Monitor' && (
          <section style={S.card}>
            <div style={S.cardHead}>
              <h3 style={S.cardTitle}>LIVE FLOWS ({winFlows.length})</h3>
              <button type="button" className="pill" style={S.selectPill} onClick={() => setPaused((p) => !p)}>{paused ? 'Resume poll' : 'Pause poll'}</button>
            </div>
            {winFlows.length === 0 && (
              <Empty
                text="No flows yet. Upload a PCAP, inject a test threat, or start the live sniffer."
                actionText="Upload PCAP"
                onAction={() => fileInputRef.current?.click()}
              />
            )}
            {winFlows.length > 0 && (
              <table style={S.table}>
                <thead>
                  <tr>{['Time', 'Src', 'Dst', 'Port', 'Proto', 'Pkts', 'Bytes', 'Verdict'].map((h) => <th key={h} style={S.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {winFlows.slice(0, 80).map((f) => (
                    <tr key={f.id} className="table-row">
                      <td style={S.td}>{f.timestamp ? new Date(f.timestamp).toLocaleTimeString() : '—'}</td>
                      <td style={{ ...S.td, color: C.text }}>{f.source_ip}</td>
                      <td style={S.td}>{f.destination_ip}</td>
                      <td style={S.td}>{f.destination_port}</td>
                      <td style={S.td}>{f.protocol}</td>
                      <td style={S.tdNumeric}>{f.packet_count}</td>
                      <td style={S.tdNumeric}>{f.byte_count}</td>
                      <td style={S.td}>{f.is_malicious ? f.threat_type : 'Clean'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {active === 'Alerts' && (
          <section style={S.card}>
            <div style={S.cardHead}>
              <h3 style={S.cardTitle}>ALERTS ({filteredAlerts.length})</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                {['All', 'High', 'Medium', 'Low'].map((s) => (
                  <button key={s} type="button" className="pill" style={{ ...S.selectPill, borderColor: sevFilter === s ? C.teal : C.line }} onClick={() => setSevFilter(s)}>{s}</button>
                ))}
              </div>
            </div>
            <AlertTable rows={filteredAlerts} onAck={async (id) => { 
              try {
                await ackAlert(id);
                fetchData();
              } catch (err) {
                setNotice(`Failed to acknowledge: ${err.message}`);
              }
            }} hideFoot />
          </section>
        )}

        {active === 'Reports' && (
          <section style={S.card}>
            <div style={S.cardHead}>
              <h3 style={S.cardTitle}>WINDOW REPORT — {RANGE_LABEL[range]}</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="pill" style={S.livePill} onClick={exportJson}>Download JSON</button>
                <button type="button" className="pill" style={S.livePill} onClick={exportCsv}>Download CSV</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
              {[
                ['Flows', winFlows.length],
                ['Alerts', winAlerts.length],
                ['Malicious flows', threatFlows.length],
                ['Unique sources', new Set(winFlows.map((f) => f.source_ip)).size],
              ].map(([k, v]) => (
                <div key={k} style={S.statusCard}><div style={S.metricLabel}>{k}</div><div style={S.metricValue}>{v}</div></div>
              ))}
            </div>
            <div style={S.cardSub}>Top sources in this window</div>
            {talkers.slice(0, 8).map((t) => (
              <div key={t.ip} style={{ ...S.statRow, borderBottom: `1px solid ${C.lineSoft}` }}>
                <span>{t.ip}</span>
                <b style={{ color: C.text }}>{t.flows} flows · {t.bad} flagged · {t.bytes} B</b>
              </div>
            ))}
            {talkers.length === 0 && <Empty text="Nothing to report until traffic is ingested." actionText="Upload PCAP" onAction={() => fileInputRef.current?.click()} />}
          </section>
        )}

        {active === 'Traffic Analysis' && (
          <section className="two-col" style={S.twoCol}>
            <div style={S.card}>
              <h3 style={S.cardTitle}>PROTOCOLS</h3>
              {protoRows.length === 0 && <Empty text="No protocol mix yet" />}
              {protoRows.map(([p, n]) => (
                <div key={p} style={S.statRow}><span>{p}</span><b style={{ color: C.text }}>{n} flows</b></div>
              ))}
            </div>
            <div style={S.card}>
              <h3 style={S.cardTitle}>TOP TALKERS</h3>
              {talkers.length === 0 && <Empty text="No talkers in this window" />}
              {talkers.map((t) => (
                <div key={t.ip} style={S.statRow}><span>{t.ip}</span><b style={{ color: t.bad ? C.teal : C.text }}>{t.flows} flows{t.bad ? ` · ${t.bad} bad` : ''}</b></div>
              ))}
            </div>
          </section>
        )}

        {active === 'Threat Intelligence' && (
          <section style={S.card}>
            <div style={S.cardHead}>
              <div>
                <h3 style={S.cardTitle}>SENSOR INTEL</h3>
                <div style={S.cardSub}>Observed malicious sources plus the local watchlist in data/threat_intel.json</div>
              </div>
            </div>
            {intel.length === 0 && <Empty text="No intel yet. Flagged IPs appear here after detections." />}
            {intel.filter((row) => matchesQuery({ source_ip: row.ip, threat_type: row.threat_type }, q)).map((row) => (
              <div key={row.ip} style={{ ...S.statusCard, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <b style={{ color: C.text }}>{row.ip}</b>
                  <span style={row.listed ? S.sevHigh : S.sevMed}>{row.listed ? 'Watchlist' : 'Observed'}</span>
                </div>
                <div style={{ color: C.muted, marginTop: 6 }}>{row.threat_type} · {row.hits} hits · {row.source}</div>
                <div style={{ color: C.dim, marginTop: 4 }}>{row.notes}</div>
              </div>
            ))}
          </section>
        )}

        {active === 'Settings' && (
          <section style={{ ...S.card, maxWidth: 640 }}>
            <h3 style={S.cardTitle}>SETTINGS</h3>
            <div style={S.statRow}><span>API</span><b style={{ color: C.text }}>{apiRoot()}</b></div>
            <div style={S.statRow}><span>Health</span><b style={{ color: online ? C.teal : C.dim }}>{online ? 'healthy' : 'offline'}</b></div>
            <div style={S.statRow}><span>Operator</span><b style={{ color: C.text }}>{user.user}</b></div>
            <div style={{ margin: '16px 0' }}>
              <div style={S.metricLabel}>Poll interval</div>
              {[2000, 5000, 10000].map((ms) => (
                <button
                  key={ms}
                  type="button"
                  className="pill"
                  style={{ ...S.selectPill, marginRight: 8, marginTop: 8, borderColor: pollMs === ms ? C.teal : C.line }}
                  onClick={() => { setPollMs(ms); localStorage.setItem('threx_poll', String(ms)); }}
                >
                  {ms / 1000}s
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="pill"
                style={S.livePill}
                onClick={async () => {
                  if (!window.confirm('Delete all flows and alerts?')) return;
                  await clearData();
                  fetchData();
                  setNotice('Database cleared.');
                }}
              >
                Clear database
              </button>
              <button
                type="button"
                className="pill"
                style={S.livePill}
                onClick={() => { localStorage.removeItem('threx_session'); setUser(null); }}
              >
                Log out
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function AlertTable({ rows, onAck, onViewAll, hideFoot }) {
  return (
    <section style={{ ...S.card, marginTop: hideFoot ? 0 : 16 }}>
      {!hideFoot && (
        <div style={S.cardHead}><h3 style={S.cardTitle}>RECENT THREAT ALERTS ({rows.length})</h3></div>
      )}
      {rows.length === 0 && <Empty text="No alerts in this window. That is expected on a quiet sensor." />}
      {rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={S.table}>
            <thead>
              <tr>
                {['Time', 'Source IP', 'Destination IP', 'Port', 'Protocol', 'Threat Type', 'Severity', 'Ack'].map((h) => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id || `${r.time}-${r.source_ip}`} className="table-row">
                  <td style={S.td}>{r.time}</td>
                  <td style={{ ...S.td, color: C.text }}>{r.source_ip}</td>
                  <td style={S.td}>{r.destination_ip}</td>
                  <td style={S.td}>{r.port}</td>
                  <td style={S.td}>{r.protocol}</td>
                  <td style={S.td}>{r.threat_type}</td>
                  <td style={S.td}><span style={r.severity === 'High' ? S.sevHigh : S.sevMed}>{r.severity}</span></td>
                  <td style={S.td}>
                    {r.acknowledged ? <span style={{ color: C.dim }}>Done</span> : (
                      <button type="button" className="pill" style={S.selectPill} onClick={() => onAck(r.id)}>Ack</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {onViewAll && (
        <div style={S.tableFoot}>
          <button type="button" style={S.viewAll} onClick={onViewAll}>Open full alerts <Ic.ArrowRight width="14" height="14" /></button>
        </div>
      )}
    </section>
  );
}

const S = {
  app: {
    display: 'flex', minHeight: '100vh', background: C.bg, color: C.muted,
    fontFamily: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif', fontSize: 13,
  },
  sidebar: {
    width: 258, flexShrink: 0, background: '#070f12', borderRight: `1px solid ${C.line}`,
    padding: '22px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 24,
  },
  logoRow: { display: 'flex', alignItems: 'center', gap: 11, padding: '0 6px', marginBottom: 26 },
  logoMark: {
    width: 42, height: 42, borderRadius: 11, background: 'rgba(47,220,210,0.09)',
    border: '1px solid rgba(47,220,210,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  brandTop: { color: '#fff', fontSize: 17, fontWeight: 700, letterSpacing: '0.6px', lineHeight: 1.25 },
  brandBottom: { color: C.teal, fontSize: 8.5, fontWeight: 600, letterSpacing: '1.1px' },
  nav: { display: 'flex', flexDirection: 'column', gap: 3 },
  navItem: {
    display: 'flex', alignItems: 'center', gap: 13, padding: '11px 14px', paddingLeft: '12px',
    borderRadius: '0 9px 9px 0', color: C.muted, fontSize: 13.5, cursor: 'pointer',
    transition: 'background 0.15s ease, color 0.15s ease',
  },
  navItemOn: {
    background: 'rgba(47,220,210,0.08)', color: '#fff', fontWeight: 600,
    borderLeft: `2px solid ${C.teal}`,
  },
  badge: { marginLeft: 'auto', background: 'rgba(47,220,210,0.16)', color: C.teal, borderRadius: 8, padding: '1px 7px', fontSize: 11 },
  statusCard: { background: C.panelAlt, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16 },
  statusTitle: { color: '#fff', fontSize: 14, fontWeight: 600, marginBottom: 12 },
  statusOk: { display: 'flex', alignItems: 'center', gap: 8, color: C.teal, fontSize: 12.5, marginBottom: 14 },
  statRow: { display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', color: C.muted, gap: 12 },
  main: { flex: 1, minWidth: 0, padding: '18px 22px 26px' },
  topbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20 },
  search: {
    display: 'flex', alignItems: 'center', gap: 10, background: C.panel, border: `1px solid ${C.line}`,
    borderRadius: 10, padding: '10px 14px', width: 380, maxWidth: '45%',
  },
  searchInput: { background: 'none', border: 'none', outline: 'none', color: C.text, fontSize: 13, width: '100%', fontFamily: 'inherit' },
  field: { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: '10px 12px', width: '100%' },
  topbarClock: { color: C.muted, fontSize: 12, fontVariantNumeric: 'tabular-nums', marginRight: 4 },
  datePill: {
    display: 'flex', alignItems: 'center', gap: 9, background: C.panel,
    border: `1px solid ${C.line}`, borderRadius: 10, padding: '8px 14px',
    color: C.muted, fontSize: 12.5, whiteSpace: 'nowrap', cursor: 'pointer',
  },
  topRight: { display: 'flex', alignItems: 'center', gap: 12 },
  livePill: {
    display: 'flex', alignItems: 'center', gap: 8, color: C.teal, fontSize: 12.5,
    border: `1px solid ${C.line}`, background: C.panel, padding: '8px 13px', borderRadius: 9, cursor: 'pointer',
  },
  liveDot: { width: 6, height: 6, borderRadius: '50%', background: C.teal },
  user: { display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', background: 'none', border: 'none' },
  avatar: {
    width: 30, height: 30, borderRadius: '50%', background: 'rgba(47,220,210,0.12)',
    border: '1px solid rgba(47,220,210,0.28)', color: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12.5, fontWeight: 700,
  },
  iconBtn: { position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: 4 },
  bellDot: {
    position: 'absolute', top: -2, right: -4, background: C.teal, color: '#042', fontSize: 9, borderRadius: 8, padding: '1px 4px',
  },
  notice: {
    background: 'rgba(47,220,210,0.1)', border: `1px solid ${C.line}`, color: C.teal,
    padding: '10px 14px', borderRadius: 8, marginBottom: 14, cursor: 'pointer',
  },
  metrics: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 14, marginBottom: 16, alignItems: 'start' },
  metricCard: {
    background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12,
    padding: '16px 16px 0', overflow: 'hidden',
  },
  metricTop: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  metricIcon: {
    width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: 'rgba(47,220,210,0.09)',
    border: '1px solid rgba(47,220,210,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  metricLabel: { fontSize: 10, fontWeight: 700, letterSpacing: '0.7px', color: C.muted },
  metricValue: { fontSize: 28, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px', margin: '4px 0 6px' },
  metricChange: { fontSize: 10.5 },
  sparkline: { width: 'calc(100% + 28px)', height: 46, marginLeft: -14, display: 'block' },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1.05fr', gap: 14, marginBottom: 14 },
  threeCol: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 },
  card: { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18 },
  cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14, flexWrap: 'wrap' },
  cardTitle: { margin: 0, fontSize: 15, fontWeight: 600, color: '#fff', letterSpacing: '0.4px' },
  cardSub: { fontSize: 11.5, color: C.dim, marginTop: 4 },
  legendRow: { display: 'flex', gap: 16 },
  legendItem: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: C.muted },
  legendDash: { width: 14, height: 2.5, borderRadius: 2 },
  legendDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  selectPill: {
    display: 'flex', alignItems: 'center', gap: 7, background: C.panelAlt, border: `1px solid ${C.line}`,
    borderRadius: 8, padding: '6px 11px', fontSize: 11.5, color: C.muted, cursor: 'pointer',
  },
  donutWrap: { display: 'flex', alignItems: 'center', gap: 20 },
  donutCenter: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  donutLegend: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 },
  portRow: { display: 'flex', alignItems: 'center', fontSize: 11.5, gap: 10 },
  barTrack: { flex: 1, height: 7, background: '#122227', borderRadius: 4, overflow: 'hidden' },
  barFill: { display: 'block', height: '100%', background: C.teal, borderRadius: 4 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 720 },
  th: {
    textAlign: 'left', color: C.dim, fontWeight: 600, fontSize: 12,
    textTransform: 'uppercase', letterSpacing: '0.5px',
    padding: '0 12px 12px 0', borderBottom: `1px solid ${C.line}`,
  },
  td: { padding: '13px 12px 13px 0', borderBottom: `1px solid ${C.lineSoft}`, color: C.muted },
  tdNumeric: { padding: '13px 12px 13px 0', borderBottom: `1px solid ${C.lineSoft}`, color: C.muted, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  sevHigh: {
    display: 'inline-block', padding: '3px 11px', borderRadius: 6, background: 'rgba(47,220,210,0.16)',
    color: C.teal, border: '1px solid rgba(47,220,210,0.3)', fontSize: 11, fontWeight: 600,
  },
  sevMed: {
    display: 'inline-block', padding: '3px 11px', borderRadius: 6, background: 'rgba(31,169,165,0.14)',
    color: C.teal2, border: '1px solid rgba(31,169,165,0.28)', fontSize: 11, fontWeight: 600,
  },
  tableFoot: { display: 'flex', justifyContent: 'center', marginTop: 14 },
  viewAll: { display: 'flex', alignItems: 'center', gap: 8, color: C.teal, fontSize: 12.5, cursor: 'pointer', background: 'none', border: 'none' },
};