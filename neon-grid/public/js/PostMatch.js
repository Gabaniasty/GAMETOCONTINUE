import { renderRankBadge, getRankFromRP } from './RankBadge.js';

const TIER_COLORS = {
  BRONZE:      '#cd7f32',
  SILVER:      '#c0c0c0',
  GOLD:        '#ffd700',
  PLATINUM:    '#00f5ff',
  DIAMOND:     '#b9f2ff',
  MASTER:      '#ff2d78',
  GRANDMASTER: '#7b2fff',
};

export class PostMatch {
  constructor(socket, getLocalId) {
    this._socket    = socket;
    this._getId     = getLocalId;
    this._visible   = false;
    this._cdTimer   = null;
    this._overlay   = null;

    this._injectStyles();
    this._buildOverlay();

    socket.on('match:ended', (data) => this._show(data));
  }

  _injectStyles() {
    if (document.getElementById('pm-styles')) return;
    const s = document.createElement('style');
    s.id = 'pm-styles';
    s.textContent = `
      @keyframes pm-flash {
        0%   { opacity: 0; }
        15%  { opacity: 1; }
        100% { opacity: 0; }
      }
      @keyframes pm-badge-out {
        from { transform: translateX(0);    opacity: 1; }
        to   { transform: translateX(-120%); opacity: 0; }
      }
      @keyframes pm-badge-in {
        from { transform: translateX(120%); opacity: 0; }
        to   { transform: translateX(0);    opacity: 1; }
      }
      @keyframes pm-glow-pulse {
        0%,100% { box-shadow: 0 0 12px currentColor; }
        50%     { box-shadow: 0 0 36px currentColor, 0 0 72px currentColor; }
      }
      @keyframes pm-slide-up {
        from { transform: translateY(30px); opacity: 0; }
        to   { transform: translateY(0);    opacity: 1; }
      }
      #pm-overlay {
        position: fixed; inset: 0; z-index: 9500;
        background: rgba(1, 1, 12, 0.97);
        backdrop-filter: blur(16px);
        display: none; flex-direction: column;
        align-items: center; overflow-y: auto;
        font-family: 'Orbitron', sans-serif;
      }
      #pm-overlay.visible { display: flex; }
      .pm-screen-flash {
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(255,255,255,0.35);
        pointer-events: none;
        animation: pm-flash 0.65s ease-out forwards;
      }
      .pm-header {
        width: 100%; max-width: 900px;
        display: flex; align-items: center; justify-content: space-between;
        padding: 1.5rem 2rem 0;
      }
      .pm-meta { font-size: .52rem; letter-spacing: .22em; color: rgba(224,224,255,.4); }
      .pm-verdict {
        font-size: clamp(2rem,6vw,4rem); font-weight: 900; letter-spacing: .25em;
        text-align: center; margin: .75rem 0 .25rem;
      }
      .pm-verdict.victory { color: #00f5ff; text-shadow: 0 0 20px #00f5ff, 0 0 40px #00f5ff; }
      .pm-verdict.defeat  { color: #ff2d78; text-shadow: 0 0 20px #ff2d78; }
      .pm-body {
        width: 100%; max-width: 900px;
        display: flex; gap: 1.5rem; padding: 1rem 2rem 2rem;
        animation: pm-slide-up .4s ease-out;
      }
      .pm-table-wrap { flex: 1; min-width: 0; }
      .pm-table {
        width: 100%; border-collapse: collapse;
        font-size: .58rem; letter-spacing: .08em;
      }
      .pm-table thead th {
        font-size: .46rem; letter-spacing: .22em; color: #00f5ff;
        padding: 6px 10px; border-bottom: 1px solid rgba(0,245,255,.3);
        text-align: left;
      }
      .pm-table tbody tr { border-bottom: 1px solid rgba(255,255,255,.05); }
      .pm-table tbody tr:hover { background: rgba(0,245,255,.04); }
      .pm-table tbody tr.pm-me {
        background: rgba(123,47,255,.12);
        outline: 1px solid rgba(123,47,255,.5);
      }
      .pm-table tbody td { padding: 7px 10px; color: rgba(224,224,255,.75); }
      .pm-table .td-pos   { color: rgba(200,200,255,.4); font-size:.52rem; width:32px; }
      .pm-table .td-name  { font-weight: 700; }
      .pm-table .td-rp    { white-space: nowrap; }
      .pm-rp-pos { color: #00f5ff; }
      .pm-rp-neg { color: #ff2d78; }

      .pm-side {
        width: 240px; flex-shrink: 0;
        display: flex; flex-direction: column; gap: 1rem;
      }
      .pm-stat-box {
        background: rgba(10,10,25,.8);
        border: 1px solid rgba(0,245,255,.15);
        padding: 1rem 1.25rem;
      }
      .pm-stat-title {
        font-size: .46rem; letter-spacing: .25em; color: #00f5ff;
        margin-bottom: .75rem; border-bottom: 1px solid rgba(0,245,255,.12); padding-bottom: .4rem;
      }
      .pm-stat-row {
        display: flex; justify-content: space-between; align-items: baseline;
        margin-bottom: .45rem;
      }
      .pm-stat-label { font-size: .5rem; letter-spacing: .12em; color: rgba(200,200,255,.5); }
      .pm-stat-value { font-size: .72rem; font-weight: 700; color: #e0e0ff; }

      .pm-rankup-box {
        background: rgba(10,10,25,.9);
        border: 1px solid rgba(123,47,255,.4);
        padding: 1rem 1.25rem; text-align: center;
        animation: pm-glow-pulse 1.8s ease-in-out infinite;
      }
      .pm-rankup-title {
        font-size: .56rem; letter-spacing: .3em;
        color: #7b2fff; text-shadow: 0 0 10px #7b2fff;
        margin-bottom: .6rem;
      }
      .pm-badge-anim { display: flex; justify-content: center; gap: .5rem; overflow: hidden; }
      .pm-badge-anim .out { animation: pm-badge-out .4s ease-in forwards; }
      .pm-badge-anim .in  { animation: pm-badge-in  .4s ease-out .35s both; }
      .pm-rankup-label {
        font-size: .52rem; letter-spacing: .18em; margin-top: .6rem;
      }

      .pm-footer {
        width: 100%; max-width: 900px;
        padding: .5rem 2rem 1.5rem;
        display: flex; align-items: center; justify-content: space-between;
      }
      .pm-countdown {
        font-size: .56rem; letter-spacing: .22em; color: rgba(224,224,255,.4);
      }
      .pm-continue {
        background: transparent;
        border: 1.5px solid #00f5ff;
        color: #00f5ff; font-family: 'Orbitron', sans-serif;
        font-size: .62rem; letter-spacing: .25em;
        padding: .6rem 1.6rem; cursor: pointer;
        text-shadow: 0 0 8px #00f5ff; box-shadow: 0 0 16px rgba(0,245,255,.15);
        transition: background .15s, box-shadow .15s;
      }
      .pm-continue:hover {
        background: rgba(0,245,255,.08);
        box-shadow: 0 0 28px rgba(0,245,255,.35);
      }

      /* filter tab stubs */
      .pm-filter-tabs {
        display: flex; gap: .5rem; padding: .5rem 2rem 0;
        width: 100%; max-width: 900px;
      }
      .pm-tab {
        font-size: .46rem; letter-spacing: .18em;
        padding: .3rem .8rem; border: 1px solid rgba(0,245,255,.2);
        color: rgba(224,224,255,.35); cursor: not-allowed;
      }
      .pm-tab.active {
        color: #00f5ff; border-color: rgba(0,245,255,.5);
        text-shadow: 0 0 6px #00f5ff;
      }
    `;
    document.head.appendChild(s);
  }

  _buildOverlay() {
    const ov = this._overlay = document.createElement('div');
    ov.id = 'pm-overlay';
    document.body.appendChild(ov);
  }

  _show(data) {
    if (this._visible) return;
    this._visible = true;

    const {
      mapName = 'TERMINAL', duration = 0, mode = 'DEATHMATCH',
      players = [],
      rankChanged = false, oldTier = null, oldDiv = null,
      newTier = null, newDiv = null, newColor = null,
      myStats = {},
    } = data;

    const localId   = this._getId ? this._getId() : null;
    const localUser = players.find(p => p.id === localId);
    const won       = localUser ? localUser.won : false;

    const ov = this._overlay;
    ov.innerHTML = '';
    ov.classList.add('visible');

    // Blur game canvas
    const gc = document.getElementById('gameCanvas');
    if (gc) gc.style.filter = 'blur(3px) brightness(0.4)';

    // ── Header ──────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'pm-header';
    const dur = this._fmtDuration(duration);
    header.innerHTML = `
      <div class="pm-meta">${mapName} · ${mode} · ${dur}</div>
      <div class="pm-meta">END OF MATCH</div>
    `;
    ov.appendChild(header);

    // ── Verdict ──────────────────────────────────────────────────
    const verdict = document.createElement('div');
    verdict.className = `pm-verdict ${won ? 'victory' : 'defeat'}`;
    verdict.textContent = won ? 'VICTORY' : 'DEFEAT';
    ov.appendChild(verdict);

    // ── Filter tabs (non-functional stubs) ────────────────────────
    const tabs = document.createElement('div');
    tabs.className = 'pm-filter-tabs';
    tabs.innerHTML = `
      <div class="pm-tab active">ALL</div>
      <div class="pm-tab">THIS WEEK</div>
      <div class="pm-tab">TODAY</div>
    `;
    ov.appendChild(tabs);

    // ── Body ─────────────────────────────────────────────────────
    const body = document.createElement('div');
    body.className = 'pm-body';

    // Player table
    const tableWrap = document.createElement('div');
    tableWrap.className = 'pm-table-wrap';
    const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));
    const CC = { SOLDIER: '#00f5ff', GHOST: '#ff2d78', WRAITH: '#7b2fff' };

    const tbl = document.createElement('table');
    tbl.className = 'pm-table';
    tbl.innerHTML = `
      <thead>
        <tr>
          <th>#</th>
          <th>OPERATIVE</th>
          <th>K</th>
          <th>D</th>
          <th>HS</th>
          <th>DMG</th>
          <th>SCORE</th>
          <th>RP</th>
        </tr>
      </thead>
      <tbody id="pm-tbody"></tbody>
    `;
    tableWrap.appendChild(tbl);

    const tbody = tbl.querySelector('#pm-tbody');
    sorted.forEach((p, i) => {
      const isMe = p.id === localId;
      const col  = CC[p.class] || '#00f5ff';
      const rp   = p.rpChange !== undefined ? p.rpChange : 0;
      const rpClass = rp >= 0 ? 'pm-rp-pos' : 'pm-rp-neg';
      const rpText  = rp >= 0 ? `+${rp} RP` : `${rp} RP`;
      const tr = document.createElement('tr');
      if (isMe) tr.className = 'pm-me';
      tr.innerHTML = `
        <td class="td-pos">${i + 1}</td>
        <td class="td-name" style="color:${col}">${p.username.toUpperCase()}${isMe ? ' ★' : ''}</td>
        <td>${p.kills ?? 0}</td>
        <td>${p.deaths ?? 0}</td>
        <td>${p.headshots ?? 0}</td>
        <td>${p.damage ?? 0}</td>
        <td>${p.score ?? 0}</td>
        <td class="td-rp ${rpClass}">${rpText}</td>
      `;
      tbody.appendChild(tr);
    });

    body.appendChild(tableWrap);

    // Side panel
    const side = document.createElement('div');
    side.className = 'pm-side';

    // Personal stats
    const kd = myStats.kd ?? (localUser ? parseFloat((localUser.kills / Math.max(localUser.deaths, 1)).toFixed(2)) : 0);
    const acc = myStats.accuracy ?? 0;
    const streak = myStats.bestStreak ?? 0;
    const dmg = myStats.damage ?? (localUser ? localUser.damage : 0) ?? 0;

    const statBox = document.createElement('div');
    statBox.className = 'pm-stat-box';
    statBox.innerHTML = `
      <div class="pm-stat-title">PERSONAL STATS</div>
      <div class="pm-stat-row">
        <span class="pm-stat-label">HS ACCURACY</span>
        <span class="pm-stat-value">${acc}%</span>
      </div>
      <div class="pm-stat-row">
        <span class="pm-stat-label">BEST STREAK</span>
        <span class="pm-stat-value">${streak}</span>
      </div>
      <div class="pm-stat-row">
        <span class="pm-stat-label">TOTAL DAMAGE</span>
        <span class="pm-stat-value">${dmg}</span>
      </div>
      <div class="pm-stat-row">
        <span class="pm-stat-label">K/D RATIO</span>
        <span class="pm-stat-value">${kd}</span>
      </div>
    `;
    side.appendChild(statBox);

    // Rank-up panel
    if (rankChanged && oldTier && newTier) {
      const ruBox = document.createElement('div');
      ruBox.className = 'pm-rankup-box';
      const color = TIER_COLORS[newTier] || '#7b2fff';
      ruBox.style.borderColor = color + '66';

      const oldLabel = `${oldTier}${oldDiv > 1 ? ' ' + oldDiv : ''}`;
      const newLabel = `${newTier}${newDiv > 1 ? ' ' + newDiv : ''}`;
      const oldBadgeEl = renderRankBadge(oldLabel, null, 'sm');
      const newBadgeEl = renderRankBadge(newLabel, null, 'sm');
      oldBadgeEl.classList.add('out');
      newBadgeEl.classList.add('in');

      const badgeRow = document.createElement('div');
      badgeRow.className = 'pm-badge-anim';
      badgeRow.appendChild(oldBadgeEl);
      badgeRow.appendChild(newBadgeEl);

      ruBox.innerHTML = `<div class="pm-rankup-title">RANK UP!</div>`;
      ruBox.appendChild(badgeRow);
      const lbl = document.createElement('div');
      lbl.className = 'pm-rankup-label';
      lbl.style.color = color;
      lbl.style.textShadow = `0 0 8px ${color}`;
      lbl.textContent = `YOU ARE NOW ${newLabel}`;
      ruBox.appendChild(lbl);

      side.appendChild(ruBox);
      this._screenFlash(color);
      this._playRankUpSound();
    }

    body.appendChild(side);
    ov.appendChild(body);

    // ── Footer ───────────────────────────────────────────────────
    const footer = document.createElement('div');
    footer.className = 'pm-footer';
    const cdEl = document.createElement('div');
    cdEl.className = 'pm-countdown';
    const btn = document.createElement('button');
    btn.className = 'pm-continue';
    btn.textContent = 'CONTINUE';
    btn.addEventListener('click', () => this._dismiss());
    footer.append(cdEl, btn);
    ov.appendChild(footer);

    // 15-second countdown
    let secs = 15;
    const tick = () => { cdEl.textContent = `RETURNING TO MATCHMAKING IN ${secs}s…`; };
    tick();
    if (this._cdTimer) clearInterval(this._cdTimer);
    this._cdTimer = setInterval(() => {
      secs--;
      if (secs <= 0) { clearInterval(this._cdTimer); this._cdTimer = null; this._dismiss(); }
      else tick();
    }, 1000);
  }

  _dismiss() {
    if (this._cdTimer) { clearInterval(this._cdTimer); this._cdTimer = null; }
    this._visible = false;
    if (this._overlay) {
      this._overlay.classList.remove('visible');
      this._overlay.innerHTML = '';
    }
    const gc = document.getElementById('gameCanvas');
    if (gc) gc.style.filter = '';
    // Return to matchmaking
    window.location.href = '/matchmaking.html';
  }

  _screenFlash(color) {
    const flash = document.createElement('div');
    flash.className = 'pm-screen-flash';
    flash.style.background = (color || '#ffffff') + '44';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 700);
  }

  _playRankUpSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
      notes.forEach((freq, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.13;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.28, t + 0.04);
        gain.gain.linearRampToValueAtTime(0, t + 0.28);
        osc.start(t);
        osc.stop(t + 0.32);
      });
    } catch (_) {}
  }

  _fmtDuration(secs) {
    const m = Math.floor(secs / 60), s = secs % 60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
}
