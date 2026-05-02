import { renderRankBadge, getRankFromRP } from './RankBadge.js';

export class Hud {
  constructor() {
    this._hp        = 100;
    this._maxHp     = 100;
    this._xp        = 0;
    this._level     = 1;
    this._dead      = false;
    this._respawnTimer   = null;
    this._killNotifTimer = null;
    this._killFeedItems  = [];
    this._el = {};
    this._fpsFrames = 0;
    this._fpsClock  = 0;
    this._playerClass = localStorage.getItem('ng_class')    || 'SOLDIER';
    this._username    = localStorage.getItem('ng_username') || 'OPERATIVE';
    this._CLASS_COLORS = { SOLDIER: '#00f5ff', GHOST: '#ff2d78', WRAITH: '#7b2fff' };
    this._matchKills  = 0;
    this._matchDeaths = 0;
    this._playerRp    = parseInt(localStorage.getItem('ng_rp') || '0', 10);

    this._addAnimStyles();
    this._build();

    // Listen for settings changes (FPS visibility)
    document.addEventListener('ng-settings-changed', (e) => {
      if ('ng_show_fps' in e.detail && this._el.fps) {
        this._el.fps.style.display = e.detail.ng_show_fps ? '' : 'none';
      }
    });
    // Apply persisted FPS show/hide
    const showFps = localStorage.getItem('ng_show_fps');
    if (showFps === 'false' && this._el.fps) this._el.fps.style.display = 'none';
  }

  _addAnimStyles() {
    if (document.getElementById('hud-anim-styles')) return;
    const s = document.createElement('style');
    s.id = 'hud-anim-styles';
    s.textContent = `
      @keyframes xp-float {
        0%   { opacity:1; transform:translateX(-50%) translateY(0); }
        100% { opacity:0; transform:translateX(-50%) translateY(-56px); }
      }
      @keyframes rp-float {
        0%   { opacity:1; transform:translateX(-50%) translateY(0); }
        100% { opacity:0; transform:translateX(-50%) translateY(-72px); }
      }
      @keyframes dmg-float {
        0%   { opacity:1; transform:translate(-50%,-50%) translateY(0); }
        100% { opacity:0; transform:translate(-50%,-50%) translateY(-55px); }
      }
      @keyframes level-flash {
        0%,100% { opacity:0; }
        8%,92%  { opacity:1; }
        50%     { opacity:0.85; }
      }
      @keyframes kf-slide-in {
        from { transform:translateX(110%); opacity:0; }
        to   { transform:translateX(0);    opacity:1; }
      }
      @keyframes seg-pulse {
        0%,100% { opacity:1; }
        50%     { opacity:0.6; }
      }
      @keyframes death-glitch {
        0%,100% { text-shadow:0 0 20px #ff2d78,0 0 40px rgba(255,45,120,.5); transform:none; }
        8%      { text-shadow:4px 0 #ff2d78,0 0 40px #ff2d78; transform:translateX(-4px); }
        16%     { text-shadow:-4px 0 #00f5ff,0 0 40px #ff2d78; transform:translateX(4px); }
        24%     { text-shadow:none; transform:none; }
      }
      @keyframes ch-spread {
        0%   { gap: 4px; }
        40%  { gap: 9px; }
        100% { gap: 4px; }
      }
      @keyframes announce-scale-in {
        0%      { transform:translate(-50%,-50%) scale(1.3); opacity:0; }
        7.41%   { opacity:1; transform:translate(-50%,-50%) scale(1); }
        81.48%  { opacity:1; transform:translate(-50%,-50%) scale(1); }
        100%    { opacity:0; transform:translate(-50%,-50%) scale(0.95); }
      }
      @keyframes spree-pulse {
        0%,100% { text-shadow:0 0 24px #ff2d78, 0 0 50px #ff2d78; }
        50%     { text-shadow:0 0 40px #ff2d78, 0 0 80px #ff2d78, 0 0 120px rgba(255,45,120,0.4); }
      }
      @keyframes skull-pop {
        0%   { opacity:0; transform:translate(-50%,-50%) scale(0.5); }
        25%  { opacity:1; transform:translate(-50%,-50%) scale(1.2); }
        75%  { opacity:1; transform:translate(-50%,-50%) scale(1); }
        100% { opacity:0; transform:translate(-50%,-50%) scale(1); }
      }
    `;
    document.head.appendChild(s);
  }

  _col() { return this._CLASS_COLORS[this._playerClass] || '#00f5ff'; }

  _build() {
    const root = this._el.root = document.createElement('div');
    root.id = 'hud';
    root.style.cssText = `
      position:fixed; inset:0; pointer-events:none; z-index:200;
      font-family:'Orbitron',sans-serif;
    `;
    document.body.appendChild(root);

    this._buildTopCenter(root);
    this._buildTopLeft(root);
    this._buildHp(root);
    this._buildXpBar(root);
    this._buildAmmoMinimap(root);
    this._buildKillFeed(root);
    this._buildFpsCounter(root);
    this._buildHitRing(root);
    this._buildKillNotif(root);
    this._buildDeathScreen(root);
    this._buildScoreboard(root);
    this._listenAnnouncements();
  }

  // ── Top-center: match timer + team score ─────────────────────────────
  _buildTopCenter(root) {
    const wrap = this._el.topCenter = document.createElement('div');
    wrap.style.cssText = `
      position:absolute; top:14px; left:50%; transform:translateX(-50%);
      display:flex; flex-direction:column; align-items:center; gap:4px;
    `;

    const timerEl = this._el.matchTimer = document.createElement('div');
    timerEl.style.cssText = `
      font-size:1.1rem; font-weight:900; letter-spacing:.22em; color:#e0e0ff;
      text-shadow:0 0 8px rgba(224,224,255,0.35); min-width:70px; text-align:center;
    `;
    timerEl.textContent = '';

    const scoreEl = this._el.teamScore = document.createElement('div');
    scoreEl.style.cssText = `
      font-size:.55rem; letter-spacing:.2em; color:rgba(224,224,255,0.5); text-align:center;
    `;
    scoreEl.textContent = '';

    wrap.append(timerEl, scoreEl);
    root.appendChild(wrap);
  }

  // ── Top-left: rank badge + match K/D ────────────────────────────────
  _buildTopLeft(root) {
    const wrap = this._el.topLeft = document.createElement('div');
    wrap.style.cssText = `
      position:absolute; top:14px; left:20px;
      display:flex; align-items:center; gap:8px;
    `;

    const badgeWrap = this._el.hudRankBadge = document.createElement('div');
    const rp  = this._playerRp;
    const col = this._col();
    const entry = getRankFromRP(rp);
    badgeWrap.appendChild(renderRankBadge(entry.tier, null, 'sm'));

    const kdEl = this._el.matchKD = document.createElement('div');
    kdEl.style.cssText = `font-size:.5rem; letter-spacing:.15em; color:rgba(224,224,255,0.4);`;
    kdEl.textContent = '';

    wrap.append(badgeWrap, kdEl);
    root.appendChild(wrap);
  }

  // ── Bottom-left: player info + segmented HP ─────────────────────────
  _buildHp(root) {
    const wrap = this._el.hpWrap = document.createElement('div');
    wrap.style.cssText = `
      position:absolute; bottom:36px; left:28px;
      display:flex; flex-direction:column; gap:5px;
    `;

    const infoRow = document.createElement('div');
    infoRow.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:2px;';
    const col  = this._col();
    const icon = document.createElement('div');
    icon.style.cssText = `width:8px; height:8px; background:${col}; box-shadow:0 0 6px ${col}; flex-shrink:0;`;
    const nameEl = document.createElement('span');
    nameEl.style.cssText = 'font-size:.52rem; letter-spacing:.18em; color:rgba(224,224,255,0.5);';
    nameEl.textContent = this._username.toUpperCase();
    const lvlBadge = this._el.levelBadge = document.createElement('span');
    lvlBadge.style.cssText = 'font-size:.52rem; letter-spacing:.15em; color:#7b2fff; text-shadow:0 0 6px #7b2fff;';
    lvlBadge.textContent = 'LVL 1';
    infoRow.append(icon, nameEl, lvlBadge);

    const hpLabel = document.createElement('div');
    hpLabel.style.cssText = 'font-size:.55rem; letter-spacing:.2em; color:#ff2d78; text-shadow:0 0 6px #ff2d78;';
    hpLabel.textContent = 'HEALTH';

    const segsWrap = this._el.hpSegs = document.createElement('div');
    segsWrap.style.cssText = 'display:flex; gap:3px;';
    for (let i = 0; i < 10; i++) {
      const seg = document.createElement('div');
      seg.style.cssText = `width:15px; height:10px; background:${col}; box-shadow:0 0 4px ${col}60; transition:background .12s, box-shadow .12s;`;
      segsWrap.appendChild(seg);
    }

    const hpNum = this._el.hpNum = document.createElement('div');
    hpNum.style.cssText = 'font-size:.58rem; color:rgba(224,224,255,0.6); letter-spacing:.08em;';
    hpNum.textContent = 'HP: 100 / 100';

    wrap.append(infoRow, hpLabel, segsWrap, hpNum);
    root.appendChild(wrap);
  }

  // ── Bottom strip: XP bar ────────────────────────────────────────────
  _buildXpBar(root) {
    const wrap = document.createElement('div');
    wrap.style.cssText = `
      position:absolute; bottom:0; left:0; right:0; height:28px;
      display:flex; align-items:center; padding:0 24px; gap:14px;
      background:rgba(6,6,15,0.92); border-top:1px solid rgba(0,245,255,0.1);
    `;
    const label = this._el.xpLabel = document.createElement('span');
    label.style.cssText = 'font-size:.52rem; letter-spacing:.18em; color:#00f5ff; white-space:nowrap; min-width:155px;';
    label.textContent = 'LVL 1 — 0 XP';

    const track = document.createElement('div');
    track.style.cssText = 'flex:1; max-width:420px; height:3px; background:rgba(0,245,255,0.12); border-radius:2px; overflow:hidden;';
    const fill = this._el.xpFill = document.createElement('div');
    fill.style.cssText = 'height:100%; width:0%; background:#00f5ff; box-shadow:0 0 6px #00f5ff; transition:width .5s ease;';
    track.appendChild(fill);

    wrap.append(label, track);
    root.appendChild(wrap);
  }

  // ── Bottom-right: ammo + minimap ────────────────────────────────────
  _buildAmmoMinimap(root) {
    const wrap = document.createElement('div');
    wrap.style.cssText = `
      position:absolute; bottom:36px; right:24px;
      display:flex; flex-direction:column; align-items:flex-end; gap:8px;
    `;

    const ammoWrap = document.createElement('div');
    ammoWrap.style.cssText = 'display:flex; flex-direction:column; align-items:flex-end; gap:2px;';
    const ammoLbl = document.createElement('div');
    ammoLbl.style.cssText = 'font-size:.42rem; letter-spacing:.2em; color:rgba(224,224,255,0.3);';
    ammoLbl.textContent = 'AMMO';
    const ammoNum = document.createElement('div');
    ammoNum.style.cssText = 'font-size:2rem; font-weight:900; letter-spacing:.04em; color:rgba(224,224,255,0.8); line-height:1;';
    ammoNum.textContent = '∞';
    ammoWrap.append(ammoLbl, ammoNum);

    const mapWrap = document.createElement('div');
    mapWrap.style.cssText = 'display:flex; flex-direction:column; align-items:flex-end; gap:3px;';
    const mapLbl = document.createElement('div');
    mapLbl.style.cssText = 'font-size:.42rem; letter-spacing:.2em; color:rgba(0,245,255,0.3);';
    mapLbl.textContent = 'SECTOR MAP';
    const canvas = this._el.minimap = document.createElement('canvas');
    canvas.width = 80; canvas.height = 80;
    canvas.style.cssText = 'display:block; border:1px solid rgba(0,245,255,0.2); background:#010108;';
    mapWrap.append(mapLbl, canvas);

    wrap.append(ammoWrap, mapWrap);
    root.appendChild(wrap);
  }

  // ── Top-right: FPS counter ──────────────────────────────────────────
  _buildFpsCounter(root) {
    const fps = this._el.fps = document.createElement('div');
    fps.style.cssText = `
      position:absolute; top:6px; right:8px;
      font-size:.48rem; letter-spacing:.15em; color:rgba(0,245,255,0.35);
    `;
    fps.textContent = '60 FPS';
    root.appendChild(fps);
  }

  // ── Top-right: kill feed ────────────────────────────────────────────
  _buildKillFeed(root) {
    const kf = this._el.killFeed = document.createElement('div');
    kf.style.cssText = `
      position:absolute; top:22px; right:20px;
      display:flex; flex-direction:column; align-items:flex-end; gap:4px; width:320px;
    `;
    root.appendChild(kf);
  }

  // ── Center: hit-flash ring ──────────────────────────────────────────
  _buildHitRing(root) {
    const ring = this._el.hitRing = document.createElement('div');
    ring.style.cssText = `
      position:absolute; top:50%; left:50%;
      transform:translate(-50%,-50%);
      width:24px; height:24px;
      border:2px solid transparent; border-radius:50%;
      transition:border-color .05s, transform .06s;
    `;
    root.appendChild(ring);
  }

  // ── Center: RP gain notification ─────────────────────────────────────
  _buildRpGain(root) {
    // No persistent element; spawned dynamically per showRpGain()
  }

  // ── Center: kill notification ───────────────────────────────────────
  _buildKillNotif(root) {
    const kn = this._el.killNotif = document.createElement('div');
    kn.style.cssText = `
      position:absolute; top:38%; left:50%; transform:translateX(-50%);
      font-size:1rem; font-weight:700; letter-spacing:.2em;
      color:#00f5ff; text-shadow:0 0 10px #00f5ff, 0 0 20px #00f5ff;
      opacity:0; transition:opacity .2s; text-align:center; white-space:nowrap;
    `;
    root.appendChild(kn);
  }

  // ── Full-screen: death screen ───────────────────────────────────────
  _buildDeathScreen(root) {
    const ds = this._el.deathScreen = document.createElement('div');
    ds.style.cssText = `
      position:absolute; inset:0;
      background:rgba(0,0,0,0.72);
      display:none; flex-direction:column;
      align-items:center; justify-content:center; gap:1rem;
    `;

    const dTitle = document.createElement('div');
    dTitle.style.cssText = `
      font-size:clamp(2.5rem,7vw,5rem); font-weight:900; letter-spacing:.28em;
      color:#ff2d78; animation:death-glitch 1.8s ease-in-out infinite;
    `;
    dTitle.textContent = 'ELIMINATED';

    const dKillerRow = this._el.deathKillerRow = document.createElement('div');
    dKillerRow.style.cssText = `
      display:flex; align-items:center; gap:.75rem;
      font-size:.78rem; letter-spacing:.18em; color:#e0e0ff;
      text-shadow:0 0 8px rgba(224,224,255,0.3);
    `;

    const dKillerLabel = this._el.deathKillerLabel = document.createElement('span');
    const dKillerBadge = this._el.deathKillerBadge = document.createElement('div');

    dKillerRow.append(dKillerLabel, dKillerBadge);

    const dTimer = this._el.deathTimer = document.createElement('div');
    dTimer.style.cssText = `
      font-size:.72rem; letter-spacing:.22em;
      color:rgba(224,224,255,0.45); margin-top:.25rem;
    `;

    ds.append(dTitle, dKillerRow, dTimer);
    root.appendChild(ds);
  }

  // ── Full-screen: Tab scoreboard ─────────────────────────────────────
  _buildScoreboard(root) {
    const ov = this._el.scoreboard = document.createElement('div');
    ov.style.cssText = `
      position:absolute; inset:0;
      background:rgba(0,0,8,0.82); backdrop-filter:blur(5px);
      display:none; flex-direction:column;
      align-items:center; justify-content:center; gap:1.5rem;
    `;

    const title = document.createElement('div');
    title.style.cssText = 'font-size:1rem; letter-spacing:.35em; color:#00f5ff; text-shadow:0 0 10px #00f5ff;';
    title.textContent = 'SCOREBOARD';

    const tbl = this._el.scoreTable = document.createElement('div');
    tbl.style.cssText = 'min-width:480px; display:flex; flex-direction:column; gap:2px;';

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:.46rem; letter-spacing:.2em; color:rgba(200,200,255,0.25); text-align:center;';
    hint.textContent = '[TAB] TOGGLE';

    ov.append(title, tbl, hint);
    root.appendChild(ov);
  }

  // ═══ Public API ════════════════════════════════════════════════════════

  // ── Match timer ─────────────────────────────────────────────────────
  setMatchTimer(seconds) {
    if (!this._el.matchTimer) return;
    if (seconds == null || seconds < 0) {
      this._el.matchTimer.textContent = '';
      return;
    }
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    this._el.matchTimer.textContent =
      String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  // ── Team score ──────────────────────────────────────────────────────
  setScore(teamA, teamB, localTeam) {
    if (!this._el.teamScore) return;
    const col   = this._col();
    const aCol  = localTeam === 'A' ? col : 'rgba(224,224,255,0.55)';
    const bCol  = localTeam === 'B' ? col : 'rgba(224,224,255,0.55)';
    this._el.teamScore.innerHTML =
      `<span style="color:${aCol}">A ${teamA}</span>` +
      `<span style="color:rgba(224,224,255,0.3);margin:0 .5em">—</span>` +
      `<span style="color:${bCol}">${teamB} B</span>`;
  }

  // ── Match K/D ───────────────────────────────────────────────────────
  setMatchKD(kills, deaths) {
    this._matchKills  = kills;
    this._matchDeaths = deaths;
    if (!this._el.matchKD) return;
    this._el.matchKD.textContent = `K:${kills}  D:${deaths}`;
  }

  // ── RP gain notification ─────────────────────────────────────────────
  showRpGain(amount) {
    const el = document.createElement('div');
    el.textContent = `+${amount} RP`;
    el.style.cssText = `
      position:absolute; top:38%; right:22%;
      font-size:1.3rem; font-weight:900; letter-spacing:.2em;
      color:#7b2fff; text-shadow:0 0 12px #7b2fff, 0 0 24px #7b2fff;
      pointer-events:none; white-space:nowrap;
      animation:rp-float 1.8s ease-out forwards;
    `;
    this._el.root.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  // ── Damage numbers ───────────────────────────────────────────────────
  showDamageNumber(amount) {
    const el = document.createElement('div');
    el.textContent = String(Math.round(amount));
    const offX = (Math.random() - 0.5) * 14 + '%';
    const offY = (Math.random() - 0.5) * 8 + '%';
    el.style.cssText = `
      position:absolute;
      top:calc(50% + ${offY}); left:calc(50% + ${offX});
      font-size:1.1rem; font-weight:900; letter-spacing:.08em;
      color:#ff2d78; text-shadow:0 0 8px #ff2d78;
      pointer-events:none; white-space:nowrap;
      animation:dmg-float 1.1s ease-out forwards;
    `;
    this._el.root.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  setHp(hp, maxHp) {
    if (maxHp !== undefined) this._maxHp = maxHp;
    this._hp = Math.max(0, Math.min(this._maxHp, hp));
    const pct    = this._hp / this._maxHp;
    const filled = Math.round(pct * 10);
    const col    = this._col();
    const segs   = this._el.hpSegs.children;
    for (let i = 0; i < 10; i++) {
      if (i < filled) {
        segs[i].style.background = col;
        segs[i].style.boxShadow  = `0 0 4px ${col}70`;
      } else {
        segs[i].style.background = '#0d0d22';
        segs[i].style.boxShadow  = 'none';
      }
    }
    this._el.hpNum.textContent = `HP: ${Math.round(this._hp)} / ${this._maxHp}`;
  }

  setXp(xp, level) {
    const prevLevel = this._level;
    this._xp    = xp;
    this._level = level;
    const levelStart = level >= 2 ? level * level * 100 : 0;
    const levelEnd   = (level + 1) * (level + 1) * 100;
    const pct = Math.min(100, ((xp - levelStart) / (levelEnd - levelStart)) * 100);
    this._el.xpFill.style.width   = pct + '%';
    this._el.xpLabel.textContent  = `LVL ${level} — ${xp} XP`;
    this._el.levelBadge.textContent = `LVL ${level}`;
    if (level > prevLevel) this._showLevelUp(level);
  }

  _showLevelUp(level) {
    const el = document.createElement('div');
    el.style.cssText = `
      position:absolute; inset:0;
      display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.75rem;
      background:rgba(0,245,255,0.04);
      animation:level-flash 2.5s ease-out forwards;
    `;
    el.innerHTML = `
      <div style="font-size:clamp(1.5rem,5vw,3rem);font-weight:900;letter-spacing:.3em;color:#00f5ff;text-shadow:0 0 20px #00f5ff,0 0 40px #00f5ff;">LEVEL UP!</div>
      <div style="font-size:1.1rem;letter-spacing:.3em;color:#e0e0ff;">→ LVL ${level}</div>
    `;
    this._el.root.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  showXpGain(amount) {
    const el = document.createElement('div');
    el.textContent = `+${amount} XP`;
    el.style.cssText = `
      position:absolute; top:40%; left:50%;
      font-size:1.1rem; font-weight:900; letter-spacing:.2em;
      color:#00f5ff; text-shadow:0 0 10px #00f5ff;
      pointer-events:none; white-space:nowrap;
      animation:xp-float 1.5s ease-out forwards;
    `;
    this._el.root.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  flashHit() {
    const ring = this._el.hitRing;
    ring.style.borderColor = '#ff2d78';
    ring.style.transform   = 'translate(-50%,-50%) scale(1.5)';
    setTimeout(() => {
      ring.style.borderColor = 'transparent';
      ring.style.transform   = 'translate(-50%,-50%) scale(1)';
    }, 120);
  }

  showKill(killerName, victimName) {
    const feed = this._el.killFeed;
    const item = document.createElement('div');
    item.style.cssText = `
      background:rgba(8,8,20,0.88); border:1px solid rgba(0,245,255,0.18);
      backdrop-filter:blur(4px); padding:4px 10px;
      font-size:.58rem; letter-spacing:.1em; color:#e0e0ff;
      opacity:1; transition:opacity 1s; white-space:nowrap;
      animation:kf-slide-in .22s ease-out;
    `;
    item.innerHTML =
      `<span style="color:#00f5ff">${killerName}</span>` +
      `<span style="color:rgba(224,224,255,.3)"> fragged </span>` +
      `<span style="color:#ff2d78">${victimName}</span>`;
    feed.appendChild(item);
    this._killFeedItems.push(item);
    while (this._killFeedItems.length > 5) feed.removeChild(this._killFeedItems.shift());
    setTimeout(() => {
      item.style.opacity = '0';
      setTimeout(() => {
        if (item.parentNode) feed.removeChild(item);
        const idx = this._killFeedItems.indexOf(item);
        if (idx !== -1) this._killFeedItems.splice(idx, 1);
      }, 1000);
    }, 5000);
  }

  showKillNotification() {
    const el = this._el.killNotif;
    el.textContent = 'KILL  +100 XP';
    el.style.opacity = '1';
    this.showXpGain(100);
    clearTimeout(this._killNotifTimer);
    this._killNotifTimer = setTimeout(() => { el.style.opacity = '0'; }, 2000);
  }

  showDeathScreen(seconds = 3, killerName = '', killerRp = 0) {
    this._dead = true;
    const ds = this._el.deathScreen;
    ds.style.display = 'flex';

    // Grayscale + blur on game canvas
    const gc = document.getElementById('gameCanvas');
    if (gc) {
      gc.style.filter       = 'grayscale(1) blur(2px)';
      gc.style.pointerEvents = 'none';
    }

    // Killer info
    if (this._el.deathKillerBadge) {
      this._el.deathKillerBadge.innerHTML = '';
      const entry = getRankFromRP(killerRp);
      this._el.deathKillerBadge.appendChild(renderRankBadge(entry.tier, null, 'md'));
    }
    if (this._el.deathKillerLabel) {
      this._el.deathKillerLabel.textContent = killerName
        ? `KILLED BY ${killerName.toUpperCase()}`
        : '';
    }

    let remaining = seconds;
    const tick = () => {
      if (remaining > 0) {
        this._el.deathTimer.textContent = `RESPAWNING IN ${remaining}...`;
      }
    };
    tick();
    if (this._respawnTimer) clearInterval(this._respawnTimer);
    this._respawnTimer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(this._respawnTimer);
        this._el.deathTimer.textContent = 'RESPAWNING…';
      } else {
        tick();
      }
    }, 1000);
  }

  hideDeathScreen() {
    this._dead = false;
    this._el.deathScreen.style.display = 'none';
    if (this._respawnTimer) clearInterval(this._respawnTimer);

    // Remove canvas filter
    const gc = document.getElementById('gameCanvas');
    if (gc) {
      gc.style.filter       = '';
      gc.style.pointerEvents = '';
    }
  }

  // Hit marker — updated for 4-arm crosshair
  showHitMarker(isKill = false) {
    const arms = document.querySelectorAll('#crosshair .ch-arm');
    if (!arms.length) return;

    const col = isKill ? '#ffff00' : '#ff4000';
    const dur = isKill ? 300 : 150;

    arms.forEach(arm => {
      arm.style.background   = col;
      arm.style.boxShadow    = `0 0 6px ${col}`;
      arm.style.transition   = 'none';
    });

    // Spread
    const ch = document.getElementById('crosshair');
    if (ch) {
      ch.style.setProperty('--ch-gap', '10px');
    }

    if (isKill) {
      // Skull flash
      const skull = document.createElement('div');
      skull.textContent = '☠';
      skull.style.cssText = `
        position:fixed; top:50%; left:50%;
        font-size:1.8rem; color:#ffff00;
        text-shadow:0 0 14px #ffff00;
        pointer-events:none; z-index:300;
        animation:skull-pop 300ms ease-out forwards;
      `;
      document.body.appendChild(skull);
      setTimeout(() => skull.remove(), 300);
    }

    clearTimeout(this._hitMarkerTimer);
    this._hitMarkerTimer = setTimeout(() => {
      arms.forEach(arm => {
        arm.style.background = 'rgba(255,255,255,0.75)';
        arm.style.boxShadow  = 'none';
        arm.style.transition = 'background .08s, box-shadow .08s';
      });
      if (ch) ch.style.setProperty('--ch-gap', '4px');
    }, dur);
  }

  // ── FPS ──────────────────────────────────────────────────────────────
  tickFps(dt) {
    this._fpsFrames++;
    this._fpsClock += dt;
    if (this._fpsClock >= 1) {
      const fps = this._fpsFrames;
      this._el.fps.textContent = fps + ' FPS';
      this._el.fps.style.color =
        fps < 30 ? 'rgba(255,45,120,0.55)' :
        fps < 50 ? 'rgba(255,200,0,0.45)'  :
                   'rgba(0,245,255,0.35)';
      this._fpsFrames = 0;
      this._fpsClock -= 1;
    }
  }

  // ── Minimap ───────────────────────────────────────────────────────────
  updateMinimap(localPos, remotePlayers) {
    const canvas = this._el.minimap;
    const ctx    = canvas.getContext('2d');
    const sz     = 80;
    const toPixel = (v) => (v + 40) / 80 * sz;

    ctx.clearRect(0, 0, sz, sz);
    ctx.fillStyle = '#010108';
    ctx.fillRect(0, 0, sz, sz);

    ctx.strokeStyle = 'rgba(0,245,255,0.07)';
    ctx.lineWidth   = 0.5;
    for (let i = 0; i <= sz; i += 20) {
      ctx.beginPath(); ctx.moveTo(i, 0);  ctx.lineTo(i, sz);  ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i);  ctx.lineTo(sz, i);  ctx.stroke();
    }

    const CC = { SOLDIER: '#00f5ff', GHOST: '#ff2d78', WRAITH: '#7b2fff' };
    remotePlayers.forEach((p) => {
      if (p.dead) return;
      ctx.fillStyle = CC[p.class] || '#00f5ff';
      ctx.beginPath();
      ctx.arc(toPixel(p.x), toPixel(p.z), 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    if (localPos) {
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur  = 5;
      ctx.beginPath();
      ctx.arc(toPixel(localPos.x), toPixel(localPos.z), 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  // ── Scoreboard ────────────────────────────────────────────────────────
  showScoreboard(players) {
    const tbl = this._el.scoreTable;
    tbl.innerHTML = '';

    const header = document.createElement('div');
    header.style.cssText = `
      display:grid; grid-template-columns:2fr 1fr 1fr 1fr 1fr;
      gap:4px; padding:5px 10px;
      border-bottom:1px solid rgba(0,245,255,0.28); margin-bottom:4px;
    `;
    ['OPERATIVE','CLASS','KILLS','DEATHS','HP'].forEach((h) => {
      const s = document.createElement('span');
      s.style.cssText = 'font-size:.48rem; letter-spacing:.18em; color:#00f5ff;';
      s.textContent = h;
      header.appendChild(s);
    });
    tbl.appendChild(header);

    const CC = { SOLDIER: '#00f5ff', GHOST: '#ff2d78', WRAITH: '#7b2fff' };
    players.forEach((p) => {
      const row = document.createElement('div');
      row.style.cssText = `
        display:grid; grid-template-columns:2fr 1fr 1fr 1fr 1fr;
        gap:4px; padding:4px 10px; background:rgba(10,10,24,0.6);
      `;
      const col = CC[p.class] || '#00f5ff';
      const cells = [
        `<span style="font-size:.6rem;letter-spacing:.1em;color:${col}">${p.username}</span>`,
        `<span style="font-size:.55rem;color:rgba(200,200,255,.45)">${p.class || '?'}</span>`,
        `<span style="font-size:.6rem;color:#e0e0ff">${p.kills || 0}</span>`,
        `<span style="font-size:.6rem;color:rgba(200,200,255,.45)">${p.deaths || 0}</span>`,
        `<span style="font-size:.6rem;color:${p.dead ? '#ff2d78' : '#e0e0ff'}">${p.dead ? 'DEAD' : (p.hp ?? '?')}</span>`,
      ];
      row.innerHTML = cells.join('');
      tbl.appendChild(row);
    });

    this._el.scoreboard.style.display = 'flex';
  }

  hideScoreboard() {
    this._el.scoreboard.style.display = 'none';
  }

  // ── Announcement overlay ─────────────────────────────────────────────────
  _listenAnnouncements() {
    window.addEventListener('announcement', (e) => {
      this._showAnnouncement(e.detail.type);
    });
  }

  _showAnnouncement(type) {
    const CONFIG = {
      first_blood:   { label: 'FIRST BLOOD',   color: '#ff2d78', shadow: '#ff2d78', pulse: false },
      double_kill:   { label: 'DOUBLE KILL',    color: '#ffd700', shadow: '#ffd700', pulse: false },
      triple_kill:   { label: 'TRIPLE KILL',    color: '#ff8c00', shadow: '#ff8c00', pulse: false },
      killing_spree: { label: 'KILLING SPREE',  color: '#ff2d78', shadow: '#ff2d78', pulse: true  },
      match_start:   { label: 'MATCH START',    color: '#00f5ff', shadow: '#00f5ff', pulse: false },
      match_end:     { label: 'MATCH OVER',     color: '#e0e0ff', shadow: '#e0e0ff', pulse: false },
    };
    const cfg = CONFIG[type] || { label: type.toUpperCase(), color: '#e0e0ff', shadow: '#e0e0ff', pulse: false };
    const TOTAL = 2.7;

    const el = document.createElement('div');
    el.style.cssText = [
      'position:absolute',
      'top:50%',
      'left:50%',
      'transform:translate(-50%,-50%) scale(1.3)',
      `color:${cfg.color}`,
      `text-shadow:0 0 24px ${cfg.shadow}, 0 0 50px ${cfg.shadow}`,
      'font-size:clamp(1.8rem,5vw,3.2rem)',
      'font-weight:900',
      'letter-spacing:.28em',
      'white-space:nowrap',
      'pointer-events:none',
      'opacity:0',
      `animation:announce-scale-in ${TOTAL}s ease forwards${cfg.pulse ? ', spree-pulse 0.7s ease-in-out infinite' : ''}`,
      'z-index:500',
    ].join(';');
    el.textContent = cfg.label;
    this._el.root.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, TOTAL * 1000 + 100);
  }
}
