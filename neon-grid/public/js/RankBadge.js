export const RANK_TABLE = [
  { tier: 'BRONZE III',   minRP: 0,    color: '#cd7f32' },
  { tier: 'BRONZE II',    minRP: 400,  color: '#cd7f32' },
  { tier: 'BRONZE I',     minRP: 800,  color: '#cd7f32' },
  { tier: 'SILVER III',   minRP: 1200, color: '#c0c0c0' },
  { tier: 'SILVER II',    minRP: 1600, color: '#c0c0c0' },
  { tier: 'SILVER I',     minRP: 2000, color: '#c0c0c0' },
  { tier: 'GOLD III',     minRP: 2400, color: '#ffd700' },
  { tier: 'GOLD II',      minRP: 2800, color: '#ffd700' },
  { tier: 'GOLD I',       minRP: 3200, color: '#ffd700' },
  { tier: 'PLATINUM III', minRP: 3600, color: '#00f5ff' },
  { tier: 'PLATINUM II',  minRP: 4000, color: '#00f5ff' },
  { tier: 'PLATINUM I',   minRP: 4400, color: '#00f5ff' },
  { tier: 'DIAMOND III',  minRP: 4800, color: '#b9f2ff' },
  { tier: 'DIAMOND II',   minRP: 5200, color: '#b9f2ff' },
  { tier: 'DIAMOND I',    minRP: 5600, color: '#b9f2ff' },
  { tier: 'MASTER',       minRP: 6000, color: '#ff2d78' },
  { tier: 'GRANDMASTER',  minRP: 8000, color: '#7b2fff' },
];

export function getRankFromRP(rp = 0) {
  let entry = RANK_TABLE[0];
  for (const r of RANK_TABLE) { if (rp >= r.minRP) entry = r; }
  return entry;
}

function _abbrev(tier) {
  if (!tier) return 'B3';
  const t = tier.toUpperCase().trim();
  if (t === 'GRANDMASTER') return 'GM';
  if (t === 'MASTER')      return 'M';
  const parts = t.split(' ');
  const name   = parts[0];
  const roman  = parts[1] || '';
  const div    = roman === 'III' ? '3' : roman === 'II' ? '2' : roman === 'I' ? '1' : '';
  const PRE    = { BRONZE: 'B', SILVER: 'S', GOLD: 'G', PLATINUM: 'PL', DIAMOND: 'D' };
  return (PRE[name] || name.slice(0, 2)) + div;
}

const _GLOW_TIERS   = ['DIAMOND', 'MASTER', 'GRANDMASTER'];
const _CROWN_TIERS  = ['MASTER', 'GRANDMASTER'];
const _SIZES = {
  sm: { padding: '.22rem .5rem',   font: '.5rem',  gap: '.3rem',  border: '1px' },
  md: { padding: '.32rem .7rem',   font: '.6rem',  gap: '.4rem',  border: '1px' },
  lg: { padding: '.5rem .95rem',   font: '.75rem', gap: '.5rem',  border: '2px' },
};

let _stylesInjected = false;
function _ensureStyles() {
  if (_stylesInjected) return;
  _stylesInjected = true;
  const s = document.createElement('style');
  s.id = 'rb-global-styles';
  s.textContent = `
    @keyframes rb-glow {
      0%,100% { filter: brightness(1); }
      50%      { filter: brightness(1.35) drop-shadow(0 0 5px currentColor); }
    }
  `;
  document.head.appendChild(s);
}

export function renderRankBadge(tierName, rp, size = 'sm') {
  _ensureStyles();

  const entry = tierName
    ? (RANK_TABLE.find(r => r.tier === tierName) || getRankFromRP(rp || 0))
    : getRankFromRP(rp || 0);

  const color   = entry.color;
  const abbr    = _abbrev(entry.tier);
  const sz      = _SIZES[size] || _SIZES.sm;
  const isGlow  = _GLOW_TIERS.some(t => entry.tier.startsWith(t));
  const hasCrown = _CROWN_TIERS.includes(entry.tier);

  const el = document.createElement('div');
  el.className = 'rb';
  el.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    `gap:${sz.gap}`,
    `padding:${sz.padding}`,
    'background:rgba(0,0,0,0.6)',
    `border:${sz.border} solid ${color}`,
    'border-radius:2px',
    "font-family:'Orbitron',sans-serif",
    `font-size:${sz.font}`,
    'font-weight:700',
    'letter-spacing:.1em',
    `color:${color}`,
    `text-shadow:0 0 5px ${color}88`,
    `box-shadow:0 0 6px ${color}28`,
    'white-space:nowrap',
    'user-select:none',
    'vertical-align:middle',
    isGlow ? 'animation:rb-glow 2s ease-in-out infinite' : '',
  ].filter(Boolean).join(';');

  if (hasCrown) {
    const crown = document.createElement('span');
    crown.textContent = '♛';
    crown.style.cssText = `font-size:${sz.font};line-height:1;`;
    el.appendChild(crown);
  }

  const label = document.createElement('span');
  label.textContent = abbr;
  el.appendChild(label);

  if (rp !== undefined && rp !== null) {
    const rpEl = document.createElement('span');
    rpEl.style.cssText = `font-size:.85em;opacity:.55;`;
    rpEl.textContent = rp + 'RP';
    el.appendChild(rpEl);
  }

  return el;
}
