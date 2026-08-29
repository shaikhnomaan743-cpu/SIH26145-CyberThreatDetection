import React, { useState, useEffect } from 'react';

/* ============================================================
   THREX AI — Predictive Network Defense
   Single-file dashboard. No external chart/UI libraries.
   Live data is pulled from the local API when it's running;
   otherwise the reference values below are shown.
   ============================================================ */

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
  text: '#e8f4f5',
  muted: '#8ba3a7',
  dim: '#5c7377',
};

/* ---------- helpers ---------- */

// Catmull-Rom -> cubic bezier, for smooth chart curves
const smoothPath = (pts) => {
  if (!pts.length) return '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[Math.max(i - 1, 0)];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const [x3, y3] = pts[Math.min(i + 2, pts.length - 1)];
    d += ` C ${x1 + (x2 - x0) / 6} ${y1 + (y2 - y0) / 6}, ${x2 - (x3 - x1) / 6} ${y2 - (y3 - y1) / 6}, ${x2} ${y2}`;
  }
  return d;
};

const linePath = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'} ${x} ${y}`).join(' ');

/* ---------- small pieces ---------- */

function Sparkline({ id, values }) {
  const w = 220, h = 46;
  const max = Math.max(...values), min = Math.min(...values);
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * w,
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
  'M872 150 L884 138 L893 155 L886 178 L876 172 Z',
  'M788 296 L820 292 L845 300 L820 308 L792 305 Z',
  'M634 372 L642 386 L636 404 L628 392 Z',
  'M963 424 L975 417 L980 434 L968 441 Z',
  'M479 128 L489 122 L492 138 L481 141 Z',
];

const NODES = [
  { x: 205, y: 145, r: 13, label: 'NA-East' },
  { x: 345, y: 175, r: 9 },
  { x: 505, y: 155, r: 11 },
  { x: 600, y: 200, r: 10 },
  { x: 690, y: 215, r: 14 },
  { x: 790, y: 190, r: 9 },
  { x: 860, y: 375, r: 8 },
];

function WorldMap() {
  const arcs = [
    [NODES[0], NODES[2], -60],
    [NODES[2], NODES[4], -40],
    [NODES[0], NODES[3], 70],
    [NODES[4], NODES[6], 90],
    [NODES[1], NODES[5], 110],
    [NODES[3], NODES[5], -55],
  ];
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

      {CONTINENTS.map((d, i) => (
        <path key={i} d={d} fill="url(#landDots)" />
      ))}

      {arcs.map(([a, b, lift], i) => {
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2 + lift;
        return (
          <path
            key={i}
            d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
            fill="none"
            stroke={C.teal}
            strokeWidth="1.4"
            opacity="0.45"
          />
        );
      })}

      {NODES.map((n, i) => (
        <g key={i}>
          <circle cx={n.x} cy={n.y} r={n.r * 3} fill="url(#nodeGlow)" />
          <circle cx={n.x} cy={n.y} r={n.r} fill="none" stroke={C.teal} strokeWidth="1.6" opacity="0.85" />
          <circle cx={n.x} cy={n.y} r={n.r * 0.42} fill={C.teal} />
        </g>
      ))}
    </svg>
  );
}

function TrafficTrend() {
  const days = ['May 20', 'May 21', 'May 22', 'May 23', 'May 24', 'May 25', 'May 26', 'May 27'];
  const normal = [60, 78, 85, 84, 82, 90, 88, 96];
  const suspicious = [22, 25, 38, 35, 33, 42, 38, 40];
  const threat = [5, 6, 10, 9, 8, 12, 11, 12];

  const L = 52, R = 636, T = 18, B = 196;
  const px = (i) => L + (i / (days.length - 1)) * (R - L);
  const py = (v) => B - (v / 100) * (B - T);
  const toPts = (arr) => arr.map((v, i) => [px(i), py(v)]);

  const series = [
    { data: normal, color: C.teal, w: 2.2, fill: true },
    { data: suspicious, color: C.teal2, w: 1.8, fill: false },
    { data: threat, color: C.teal3, w: 1.6, fill: false },
  ];

  return (
    <div>
      <svg viewBox="0 0 660 220" style={{ width: '100%', height: 220 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.teal} stopOpacity="0.22" />
            <stop offset="100%" stopColor={C.teal} stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 20, 40, 60, 80, 100].map((v) => (
          <g key={v}>
            <line x1={L} y1={py(v)} x2={R} y2={py(v)} stroke={C.lineSoft} strokeWidth="1" />
            <text x={L - 10} y={py(v) + 3.5} textAnchor="end" fontSize="10" fill={C.dim}>{v}</text>
          </g>
        ))}
        <text x={L - 10} y={T - 6} textAnchor="start" fontSize="10" fill={C.dim}>Traffic (GB)</text>

        {series.map((s, i) => {
          const pts = toPts(s.data);
          const d = smoothPath(pts);
          return (
            <g key={i}>
              {s.fill && <path d={`${d} L ${R} ${B} L ${L} ${B} Z`} fill="url(#trendFill)" />}
              <path d={d} fill="none" stroke={s.color} strokeWidth={s.w} strokeLinecap="round" />
              {pts.map(([x, y], j) => (
                <circle key={j} cx={x} cy={y} r="3.2" fill={s.color} stroke={C.panel} strokeWidth="1.5" />
              ))}
            </g>
          );
        })}

        <line x1={L} y1={B} x2={R} y2={B} stroke={C.line} strokeWidth="1" />
        {days.map((d, i) => (
          <text key={d} x={px(i)} y={B + 18} textAnchor="middle" fontSize="10" fill={C.dim}>{d}</text>
        ))}
      </svg>
    </div>
  );
}

function ThreatsOverTime() {
  const vals = [45, 62, 72, 66, 88, 96, 112, 138, 168, 152, 186, 170, 152, 128, 142, 118, 104, 92, 78, 70, 66, 88, 102, 88, 74];
  const labels = ['12:00 PM', '04:00 PM', '08:00 PM', '12:00 AM', '04:00 AM', '08:00 AM'];
  const L = 34, R = 386, T = 16, B = 132;
  const px = (i) => L + (i / (vals.length - 1)) * (R - L);
  const py = (v) => B - (v / 200) * (B - T);
  const pts = vals.map((v, i) => [px(i), py(v)]);
  const d = linePath(pts);

  return (
    <svg viewBox="0 0 400 168" style={{ width: '100%', height: 168 }}>
      <defs>
        <linearGradient id="totFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.teal} stopOpacity="0.3" />
          <stop offset="100%" stopColor={C.teal} stopOpacity="0" />
        </linearGradient>
      </defs>

      {[0, 50, 100, 150, 200].map((v) => (
        <g key={v}>
          <line x1={L} y1={py(v)} x2={R} y2={py(v)} stroke={C.lineSoft} strokeWidth="1" />
          <text x={L - 6} y={py(v) + 3} textAnchor="end" fontSize="8.5" fill={C.dim}>{v}</text>
        </g>
      ))}
      <text x={L - 6} y={T - 5} fontSize="8.5" fill={C.dim}>Threat Count</text>

      <path d={`${d} L ${R} ${B} L ${L} ${B} Z`} fill="url(#totFill)" />
      <path d={d} fill="none" stroke={C.teal} strokeWidth="1.8" strokeLinejoin="round" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.2" fill={C.teal} />
      ))}

      <line x1={L} y1={B} x2={R} y2={B} stroke={C.line} />
      {labels.map((t, i) => (
        <text
          key={t}
          x={L + (i / (labels.length - 1)) * (R - L)}
          y={B + 16}
          textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}
          fontSize="8.5"
          fill={C.dim}
        >
          {t}
        </text>
      ))}
    </svg>
  );
}

const SEVERITY = [
  { label: 'High', count: 323, pct: 43.5, color: C.teal },
  { label: 'Medium', count: 256, pct: 34.5, color: C.teal2 },
  { label: 'Low', count: 128, pct: 17.3, color: C.teal3 },
  { label: 'Info', count: 35, pct: 4.7, color: C.teal4 },
];

function Donut() {
  let offset = 0;
  return (
    <div style={{ position: 'relative', width: 132, height: 132, flexShrink: 0 }}>
      <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
        {SEVERITY.map((s) => {
          const dash = `${s.pct} ${100 - s.pct}`;
          const el = (
            <circle
              key={s.label}
              cx="18" cy="18" r="15.915"
              fill="transparent"
              stroke={s.color}
              strokeWidth="5.5"
              strokeDasharray={dash}
              strokeDashoffset={-offset}
            />
          );
          offset += s.pct;
          return el;
        })}
      </svg>
      <div style={S.donutCenter}>
        <div style={{ color: '#fff', fontWeight: 700, fontSize: 22, letterSpacing: '-0.5px' }}>742</div>
        <div style={{ color: C.dim, fontSize: 10 }}>Total</div>
      </div>
    </div>
  );
}

const PORTS = [
  { port: '443 (HTTPS)', val: 68.42, pct: 100 },
  { port: '80 (HTTP)', val: 55.18, pct: 81 },
  { port: '22 (SSH)', val: 28.71, pct: 42 },
  { port: '3389 (RDP)', val: 19.86, pct: 29 },
  { port: '53 (DNS)', val: 16.43, pct: 24 },
  { port: 'Others', val: 42.18, pct: 62 },
];

/* ---------- icons ---------- */
const Ic = {
  shieldLock: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <rect x="9" y="10" width="6" height="5" rx="1" />
      <path d="M10.5 10V8.5a1.5 1.5 0 0 1 3 0V10" />
    </svg>
  ),
  home: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>),
  monitor: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 12h4l2-3 2 6 2-4 2 1h6" /></svg>),
  bell: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>),
  report: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg>),
  chart: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="3 17 9 11 13 15 21 7" /><polyline points="15 7 21 7 21 13" /></svg>),
  target: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>),
  gear: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>),
  search: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" {...p}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>),
  calendar: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>),
  chevron: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="6 9 12 15 18 9" /></svg>),
  trend: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="3 17 9 11 13 15 21 7" /><polyline points="15 7 21 7 21 13" /></svg>),
  shieldCheck: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></svg>),
  warn: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>),
  skull: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 2a8 8 0 0 0-8 8c0 2.5 1.2 4 2.5 5V18a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-3c1.3-1 2.5-2.5 2.5-5a8 8 0 0 0-8-8z" /><circle cx="9" cy="10" r="1.4" /><circle cx="15" cy="10" r="1.4" /><path d="M10 20v-3M14 20v-3" /></svg>),
  arrowRight: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="4" y1="12" x2="20" y2="12" /><polyline points="14 6 20 12 14 18" /></svg>),
};

const NAV = [
  { label: 'Overview', icon: Ic.home },
  { label: 'Real-time Monitor', icon: Ic.monitor },
  { label: 'Alerts', icon: Ic.bell },
  { label: 'Reports', icon: Ic.report },
  { label: 'Traffic Analysis', icon: Ic.chart },
  { label: 'Threat Intelligence', icon: Ic.target },
  { label: 'Settings', icon: Ic.gear },
];

const FALLBACK_ALERTS = [
  { time: '10:42:15 AM', source_ip: '185.214.135.23', destination_ip: '10.0.0.25', port: 80, protocol: 'TCP', threat_type: 'DDoS Attack', severity: 'High' },
  { time: '10:38:47 AM', source_ip: '103.45.67.89', destination_ip: '10.0.0.8', port: 22, protocol: 'TCP', threat_type: 'Port Scan', severity: 'Medium' },
  { time: '10:35:22 AM', source_ip: '45.77.32.11', destination_ip: '10.0.0.12', port: 443, protocol: 'TCP', threat_type: 'Brute Force', severity: 'High' },
];

/* ============================================================
   App Component
   ============================================================ */

export default function App() {
  const [flows, setFlows] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [active, setActive] = useState('Overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [isInjecting, setIsInjecting] = useState(false);

  // Background polling loop to auto-refresh flows and alerts from backend every 2.5 seconds
  useEffect(() => {
    const fetchData = () => {
      fetch('http://127.0.0.1:8000/api/flows')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (Array.isArray(d)) setFlows(d); })
        .catch(() => {});

      fetch('http://127.0.0.1:8000/api/alerts')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (Array.isArray(d)) setAlerts(d); })
        .catch(() => {});
    };

    fetchData();
    const interval = setInterval(fetchData, 2500);
    return () => clearInterval(interval);
  }, []);

  // Filter alerts by IP, Threat Type, Port, or Protocol
  const baseAlerts = alerts.length ? alerts : FALLBACK_ALERTS;
  const filteredAlerts = baseAlerts.filter((r) => {
    const q = searchQuery.toLowerCase();
    return (
      r.source_ip?.toLowerCase().includes(q) ||
      r.destination_ip?.toLowerCase().includes(q) ||
      r.threat_type?.toLowerCase().includes(q) ||
      r.protocol?.toLowerCase().includes(q) ||
      String(r.port).includes(q) ||
      r.severity?.toLowerCase().includes(q)
    );
  });

  const flowsProcessed = flows.length ? flows.length.toLocaleString() : '1.23 M';
  const totalThreatCount = alerts.length ? alerts.length : 742;

  // Pipeline test helper: transmits a flow directly to Person 1's backend & ML model
  const handleInjectTestFlow = async () => {
    setIsInjecting(true);
    const testPacket = {
      source_ip: `185.220.101.${Math.floor(Math.random() * 250) + 1}`,
      destination_ip: '10.0.0.25',
      source_port: 52140,
      destination_port: 80,
      protocol: 'TCP',
      packet_count: 8500,
      byte_count: 5900000,
      duration_seconds: 0.8,
      packets_per_second: 10625,
      bytes_per_second: 7375000
    };

    try {
      await fetch('http://127.0.0.1:8000/api/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPacket),
      });
    } catch {
      // Offline fallback: inserts alert locally so you can preview dynamic reaction
      setAlerts((prev) => [
        {
          time: new Date().toLocaleTimeString(),
          source_ip: testPacket.source_ip,
          destination_ip: testPacket.destination_ip,
          port: testPacket.destination_port,
          protocol: testPacket.protocol,
          threat_type: 'Anomaly Detected',
          severity: 'High'
        },
        ...prev
      ]);
    }
    setIsInjecting(false);
  };

  const METRICS = [
    { key: 'total', label: 'TOTAL TRAFFIC', value: '256.42 GB', change: '14.7%', icon: Ic.trend, spark: [30, 34, 31, 40, 37, 45, 42, 50, 47, 56, 52, 61, 58, 66, 63, 72, 70, 78] },
    { key: 'normal', label: 'NORMAL TRAFFIC', value: '212.67 GB', change: '11.3%', icon: Ic.shieldCheck, spark: [28, 33, 30, 36, 34, 41, 38, 44, 42, 49, 46, 53, 51, 57, 55, 62, 60, 67] },
    { key: 'susp', label: 'SUSPICIOUS TRAFFIC', value: '18.94 GB', change: '21.6%', icon: Ic.warn, spark: [20, 26, 22, 31, 27, 36, 30, 41, 34, 46, 39, 52, 44, 58, 49, 65, 55, 72] },
    { key: 'threats', label: 'THREATS DETECTED', value: `${totalThreatCount}`, change: '23.8%', icon: Ic.skull, spark: [18, 25, 21, 30, 26, 38, 32, 44, 38, 51, 45, 58, 50, 66, 58, 74, 66, 82] },
  ];

  return (
    <div style={S.app}>
      <style>{`
        * { box-sizing: border-box; }
        input::placeholder { color: ${C.dim}; }
        .nav-item:hover { background: #0f1f23; color: ${C.text}; }
        .row-hover:hover { background: #0d1a1e; }
        .pill:hover { border-color: ${C.teal3}; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: #16292e; border-radius: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        @media (max-width: 1200px) {
          .metrics { grid-template-columns: repeat(2, 1fr) !important; }
          .two-col, .three-col { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ================= SIDEBAR ================= */}
      <aside style={S.sidebar}>
        <div>
          <div style={S.logoRow}>
            <div style={S.logoMark}>
              <Ic.shieldLock width="26" height="26" style={{ color: C.teal }} />
            </div>
            <div>
              <div style={S.brandTop}>THREX AI</div>
              <div style={S.brandBottom}>PREDICTIVE NETWORK DEFENSE</div>
            </div>
          </div>

          <nav style={S.nav}>
            {NAV.map(({ label, icon: Icon }) => {
              const on = active === label;
              return (
                <div
                  key={label}
                  className="nav-item"
                  onClick={() => setActive(label)}
                  style={{ ...S.navItem, ...(on ? S.navItemOn : null) }}
                >
                  <Icon width="19" height="19" style={{ color: on ? C.teal : C.dim, flexShrink: 0 }} />
                  <span>{label}</span>
                </div>
              );
            })}
          </nav>
        </div>

        <div style={S.statusCard}>
          <div style={S.statusTitle}>System Status</div>
          <div style={S.statusOk}>
            <Ic.shieldCheck width="17" height="17" style={{ color: C.teal }} />
            <span>All Systems Operational</span>
          </div>
          <div style={S.statRow}><span>Sensors Online</span><b style={{ color: C.teal }}>24 / 24</b></div>
          <div style={S.statRow}><span>Packets Analyzed</span><b style={{ color: C.text }}>5.63 M</b></div>
          <div style={S.statRow}><span>Flows Processed</span><b style={{ color: C.text }}>{flowsProcessed}</b></div>
          <div style={S.statRow}><span>Last Updated</span><b style={{ color: C.text }}>10:42:30 AM</b></div>
        </div>
      </aside>

      {/* ================= MAIN ================= */}
      <main style={S.main}>
        <header style={S.topbar}>
          <div style={S.search}>
            <Ic.search width="16" height="16" style={{ color: C.dim, flexShrink: 0 }} />
            <input
              placeholder="Search IP, Domain, Port..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={S.searchInput}
            />
          </div>

          <div style={S.topRight}>
            <button
              onClick={handleInjectTestFlow}
              disabled={isInjecting}
              className="pill"
              style={{ ...S.livePill, border: `1px solid ${C.teal3}`, background: 'rgba(47,220,210,0.08)' }}
            >
              ⚡ <span>{isInjecting ? 'Injecting Flow...' : 'Test ML Flow'}</span>
            </button>

            <div className="pill" style={S.livePill}>
              <span style={S.liveDot} />
              <span>Live Monitoring</span>
              <Ic.chevron width="13" height="13" />
            </div>
            <Ic.bell width="19" height="19" style={{ color: C.muted, cursor: 'pointer' }} />
            <div style={S.user}>
              <div style={S.avatar}>A</div>
              <span style={{ color: C.text, fontSize: 13 }}>Admin</span>
              <Ic.chevron width="13" height="13" style={{ color: C.dim }} />
            </div>
          </div>
        </header>

        {/* METRICS */}
        <section className="metrics" style={S.metrics}>
          {METRICS.map((m) => (
            <div key={m.key} style={S.metricCard}>
              <div style={S.metricTop}>
                <div style={S.metricIcon}>
                  <m.icon width="18" height="18" style={{ color: C.teal }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={S.metricLabel}>{m.label}</div>
                  <div style={S.metricValue}>{m.value}</div>
                  <div style={S.metricChange}>
                    <span style={{ color: C.teal, fontWeight: 600 }}>↑ {m.change}</span>
                    <span style={{ color: C.dim }}> vs last 7 days</span>
                  </div>
                </div>
              </div>
              <Sparkline id={`spark-${m.key}`} values={m.spark} />
            </div>
          ))}
          <div className="pill" style={S.datePill}>
            <Ic.calendar width="15" height="15" style={{ color: C.muted }} />
            <span>May 20 - May 27, 2026</span>
            <Ic.chevron width="13" height="13" style={{ color: C.dim }} />
          </div>
        </section>

        {/* MAP + TREND */}
        <section className="two-col" style={S.twoCol}>
          <div style={S.card}>
            <div style={S.cardHead}>
              <div>
                <h3 style={S.cardTitle}>GLOBAL TRAFFIC MAP</h3>
                <div style={S.cardSub}>Top Source IPs by Traffic Volume</div>
              </div>
            </div>
            <div style={{ height: 250 }}><WorldMap /></div>
          </div>

          <div style={S.card}>
            <div style={{ ...S.cardHead, alignItems: 'center' }}>
              <h3 style={S.cardTitle}>TRAFFIC TREND (UNIDIRECTIONAL)</h3>
              <div style={S.legendRow}>
                {[['Normal', C.teal], ['Suspicious', C.teal2], ['Threat', C.teal3]].map(([l, c]) => (
                  <span key={l} style={S.legendItem}>
                    <span style={{ ...S.legendDash, background: c }} />{l}
                  </span>
                ))}
              </div>
              <div className="pill" style={S.selectPill}>Last 7 Days <Ic.chevron width="12" height="12" /></div>
            </div>
            <TrafficTrend />
          </div>
        </section>

        {/* THREE CHARTS */}
        <section className="three-col" style={S.threeCol}>
          <div style={S.card}>
            <div style={{ ...S.cardHead, alignItems: 'center' }}>
              <h3 style={S.cardTitle}>THREATS OVER TIME</h3>
              <div className="pill" style={S.selectPill}>Last 24 Hours <Ic.chevron width="12" height="12" /></div>
            </div>
            <ThreatsOverTime />
          </div>

          <div style={S.card}>
            <div style={S.cardHead}><h3 style={S.cardTitle}>THREAT SEVERITY DISTRIBUTION</h3></div>
            <div style={S.donutWrap}>
              <Donut />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {SEVERITY.map((s) => (
                  <div key={s.label} style={S.donutLegend}>
                    <span style={{ ...S.legendDot, background: s.color }} />
                    <span style={{ flex: 1, color: C.muted }}>{s.label}</span>
                    <b style={{ color: C.text, fontWeight: 500 }}>{s.count}</b>
                    <span style={{ color: C.dim, width: 54, textAlign: 'right' }}>({s.pct}%)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={S.card}>
            <div style={S.cardHead}><h3 style={S.cardTitle}>TOP DESTINATION PORTS</h3></div>
            <div style={{ ...S.portRow, color: C.dim, marginBottom: 10 }}>
              <span style={{ width: 92 }}>Port</span>
              <span style={{ flex: 1 }} />
              <span style={{ width: 62, textAlign: 'right' }}>Traffic (GB)</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {PORTS.map((p) => (
                <div key={p.port} style={S.portRow}>
                  <span style={{ width: 92, color: C.muted }}>{p.port}</span>
                  <span style={S.barTrack}>
                    <span style={{ ...S.barFill, width: `${p.pct}%` }} />
                  </span>
                  <span style={{ width: 62, textAlign: 'right', color: C.text }}>{p.val.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ALERTS TABLE */}
        <section style={{ ...S.card, marginTop: 16 }}>
          <div style={S.cardHead}>
            <h3 style={S.cardTitle}>RECENT THREAT ALERTS ({filteredAlerts.length})</h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={S.table}>
              <thead>
                <tr>
                  {['Time', 'Source IP', 'Destination IP', 'Port', 'Protocol', 'Threat Type', 'Severity'].map((h) => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredAlerts.map((r, i) => (
                  <tr key={i} className="row-hover">
                    <td style={S.td}>{r.time}</td>
                    <td style={{ ...S.td, color: C.text }}>{r.source_ip}</td>
                    <td style={S.td}>{r.destination_ip}</td>
                    <td style={S.td}>{r.port}</td>
                    <td style={S.td}>{r.protocol}</td>
                    <td style={S.td}>{r.threat_type}</td>
                    <td style={S.td}>
                      <span style={r.severity === 'High' ? S.sevHigh : S.sevMed}>{r.severity}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={S.tableFoot}>
            <span style={S.viewAll}>View all alerts <Ic.arrowRight width="14" height="14" /></span>
          </div>
        </section>
      </main>
    </div>
  );
}

/* ============================================================
   Styles
   ============================================================ */

const S = {
  app: {
    display: 'flex',
    minHeight: '100vh',
    background: C.bg,
    color: C.muted,
    fontFamily: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif',
    fontSize: 13,
  },

  sidebar: {
    width: 258,
    flexShrink: 0,
    background: '#070f12',
    borderRight: `1px solid ${C.line}`,
    padding: '22px 16px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    gap: 24,
  },
  logoRow: { display: 'flex', alignItems: 'center', gap: 11, padding: '0 6px', marginBottom: 26 },
  logoMark: {
    width: 42, height: 42, borderRadius: 11,
    background: 'rgba(47,220,210,0.09)',
    border: '1px solid rgba(47,220,210,0.22)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 0 18px rgba(47,220,210,0.14)',
  },
  brandTop: { color: '#fff', fontSize: 15, fontWeight: 700, letterSpacing: '0.6px', lineHeight: 1.25 },
  brandBottom: { color: C.teal, fontSize: 8.5, fontWeight: 600, letterSpacing: '1.1px' },
  nav: { display: 'flex', flexDirection: 'column', gap: 3 },
  navItem: {
    display: 'flex', alignItems: 'center', gap: 13,
    padding: '11px 14px', borderRadius: 9,
    color: C.muted, fontSize: 13.5, cursor: 'pointer',
    transition: 'background .15s, color .15s',
  },
  navItemOn: { background: 'rgba(47,220,210,0.10)', color: '#fff', fontWeight: 600 },

  statusCard: { background: C.panelAlt, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16 },
  statusTitle: { color: '#fff', fontSize: 14, fontWeight: 600, marginBottom: 12 },
  statusOk: { display: 'flex', alignItems: 'center', gap: 8, color: C.teal, fontSize: 12.5, marginBottom: 14 },
  statRow: { display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', color: C.muted },

  main: { flex: 1, minWidth: 0, padding: '18px 22px 26px' },
  topbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20 },
  search: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10,
    padding: '10px 14px', width: 380, maxWidth: '45%',
  },
  searchInput: { background: 'none', border: 'none', outline: 'none', color: C.text, fontSize: 13, width: '100%', fontFamily: 'inherit' },
  topRight: { display: 'flex', alignItems: 'center', gap: 18 },
  livePill: {
    display: 'flex', alignItems: 'center', gap: 8,
    color: C.teal, fontSize: 12.5,
    border: `1px solid ${C.line}`, background: C.panel,
    padding: '8px 13px', borderRadius: 9, cursor: 'pointer', transition: 'border-color .15s',
  },
  liveDot: { width: 6, height: 6, borderRadius: '50%', background: C.teal, boxShadow: `0 0 7px ${C.teal}` },
  user: { display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' },
  avatar: {
    width: 30, height: 30, borderRadius: '50%',
    background: 'rgba(47,220,210,0.12)', border: '1px solid rgba(47,220,210,0.28)',
    color: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12.5, fontWeight: 700,
  },

  metrics: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr)) auto', gap: 14, marginBottom: 16, alignItems: 'start' },
  metricCard: { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: '14px 14px 0', overflow: 'hidden' },
  metricTop: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  metricIcon: {
    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
    background: 'rgba(47,220,210,0.09)', border: '1px solid rgba(47,220,210,0.18)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  metricLabel: { fontSize: 10, fontWeight: 700, letterSpacing: '0.7px', color: C.muted },
  metricValue: { fontSize: 23, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px', margin: '3px 0 4px' },
  metricChange: { fontSize: 10.5 },
  sparkline: { width: 'calc(100% + 28px)', height: 46, marginLeft: -14, display: 'block' },
  datePill: {
    display: 'flex', alignItems: 'center', gap: 9, alignSelf: 'start',
    background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10,
    padding: '12px 14px', color: C.muted, fontSize: 12.5, whiteSpace: 'nowrap',
    cursor: 'pointer', transition: 'border-color .15s',
  },

  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1.05fr', gap: 14, marginBottom: 14 },
  threeCol: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 },
  card: { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18 },
  cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14, flexWrap: 'wrap' },
  cardTitle: { margin: 0, fontSize: 13, fontWeight: 600, color: '#fff', letterSpacing: '0.4px' },
  cardSub: { fontSize: 11.5, color: C.dim, marginTop: 4 },
  legendRow: { display: 'flex', gap: 16 },
  legendItem: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: C.muted },
  legendDash: { width: 14, height: 2.5, borderRadius: 2 },
  legendDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  selectPill: {
    display: 'flex', alignItems: 'center', gap: 7,
    background: C.panelAlt, border: `1px solid ${C.line}`, borderRadius: 8,
    padding: '6px 11px', fontSize: 11.5, color: C.muted, cursor: 'pointer', transition: 'border-color .15s',
  },

  donutWrap: { display: 'flex', alignItems: 'center', gap: 20 },
  donutCenter: {
    position: 'absolute', inset: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  },
  donutLegend: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 },

  portRow: { display: 'flex', alignItems: 'center', fontSize: 11.5, gap: 10 },
  barTrack: { flex: 1, height: 7, background: '#122227', borderRadius: 4, overflow: 'hidden' },
  barFill: { display: 'block', height: '100%', background: C.teal, borderRadius: 4 },

  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 720 },
  th: { textAlign: 'left', color: C.dim, fontWeight: 500, fontSize: 11.5, padding: '0 12px 10px 0', borderBottom: `1px solid ${C.line}` },
  td: { padding: '13px 12px 13px 0', borderBottom: `1px solid ${C.lineSoft}`, color: C.muted },
  sevHigh: {
    display: 'inline-block', padding: '3px 11px', borderRadius: 6,
    background: 'rgba(47,220,210,0.16)', color: C.teal,
    border: '1px solid rgba(47,220,210,0.3)', fontSize: 11, fontWeight: 600,
  },
  sevMed: {
    display: 'inline-block', padding: '3px 11px', borderRadius: 6,
    background: 'rgba(31,169,165,0.14)', color: C.teal2,
    border: '1px solid rgba(31,169,165,0.28)', fontSize: 11, fontWeight: 600,
  },
  tableFoot: { display: 'flex', justifyContent: 'center', marginTop: 14 },
  viewAll: { display: 'flex', alignItems: 'center', gap: 8, color: C.teal, fontSize: 12.5, cursor: 'pointer' },
};