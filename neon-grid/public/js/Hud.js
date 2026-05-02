export class Hud {
  constructor() {
    this._hp        = 100;
    this._dead      = false;
    this._respawnTimer = null;
    this._killFeedItems = [];
    this._el = {};

    this._build();
  }

  _build() {
    // ── Root container ─────────────────────────────────────────
    const root = document.createElement('div');
    root.id = 'hud';
    root.style.cssText = `
      position:fixed; inset:0; pointer-events:none; z-index:200;
      font-family:'Orbitron',sans-serif;
    `;
    document.body.appendChild(root);

    // ── Health bar (bottom-left) ───────────────────────────────
    const hpWrap = this._el.hpWrap = document.createElement('div');
    hpWrap.style.cssText = `
      position:absolute; bottom:28px; left:28px;
      display:flex; flex-direction:column; gap:4px;
    `;
    const hpLabel = document.createElement('div');
    hpLabel.style.cssText = `font-size:.65rem; letter-spacing:.15em; color:#ff2d78;
      text-shadow:0 0 6px #ff2d78;`;
    hpLabel.textContent = 'HEALTH';
    const hpTrack = document.createElement('div');
    hpTrack.style.cssText = `
      width:200px; height:10px; background:rgba(255,45,120,.15);
      border:1px solid rgba(255,45,120,.4); position:relative; overflow:hidden;
    `;
    const hpFill = this._el.hpFill = document.createElement('div');
    hpFill.style.cssText = `
      height:100%; width:100%; background:#ff2d78;
      box-shadow:0 0 8px #ff2d78; transition:width .2s;
    `;
    hpTrack.appendChild(hpFill);
    const hpNum = this._el.hpNum = document.createElement('div');
    hpNum.style.cssText = `font-size:.7rem; color:#e0e0ff; letter-spacing:.1em;`;
    hpNum.textContent = 'HP: 100';
    hpWrap.append(hpLabel, hpTrack, hpNum);
    root.appendChild(hpWrap);

    // ── Kill feed (top-right) ──────────────────────────────────
    const kf = this._el.killFeed = document.createElement('div');
    kf.style.cssText = `
      position:absolute; top:20px; right:20px;
      display:flex; flex-direction:column; align-items:flex-end; gap:4px;
      width:340px;
    `;
    root.appendChild(kf);

    // ── Crosshair hit-flash ring ───────────────────────────────
    const ring = this._el.hitRing = document.createElement('div');
    ring.style.cssText = `
      position:absolute; top:50%; left:50%;
      transform:translate(-50%,-50%);
      width:24px; height:24px;
      border:2px solid transparent; border-radius:50%;
      transition:border-color .05s, transform .05s;
      pointer-events:none;
    `;
    root.appendChild(ring);

    // ── Kill notification (centre) ─────────────────────────────
    const kn = this._el.killNotif = document.createElement('div');
    kn.style.cssText = `
      position:absolute; top:38%; left:50%; transform:translateX(-50%);
      font-size:1.1rem; font-weight:700; letter-spacing:.2em;
      color:#00f5ff; text-shadow:0 0 10px #00f5ff, 0 0 20px #00f5ff;
      opacity:0; transition:opacity .2s; text-align:center; white-space:nowrap;
    `;
    root.appendChild(kn);

    // ── Death / respawn screen ─────────────────────────────────
    const ds = this._el.deathScreen = document.createElement('div');
    ds.style.cssText = `
      position:absolute; inset:0;
      background:rgba(180,0,0,.35);
      display:none; flex-direction:column;
      align-items:center; justify-content:center; gap:1rem;
      pointer-events:none;
    `;
    const dTitle = document.createElement('div');
    dTitle.style.cssText = `
      font-size:clamp(2rem,6vw,4rem); font-weight:900; letter-spacing:.25em;
      color:#ff2d78; text-shadow:0 0 20px #ff2d78, 0 0 40px rgba(255,45,120,.5);
    `;
    dTitle.textContent = 'YOU DIED';
    const dTimer = this._el.deathTimer = document.createElement('div');
    dTimer.style.cssText = `
      font-size:1rem; letter-spacing:.2em; color:#e0e0ff;
    `;
    ds.append(dTitle, dTimer);
    root.appendChild(ds);
  }

  // ── Public API ─────────────────────────────────────────────────

  setHp(hp) {
    this._hp = Math.max(0, Math.min(100, hp));
    const pct = this._hp;
    this._el.hpFill.style.width = pct + '%';
    this._el.hpNum.textContent  = `HP: ${pct}`;
    // Colour shifts red as health drops
    const g  = Math.round((pct / 100) * 45);
    this._el.hpFill.style.background    = `rgb(255,${g},120)`;
    this._el.hpFill.style.boxShadow     = `0 0 8px rgb(255,${g},120)`;
  }

  flashHit() {
    const ring = this._el.hitRing;
    ring.style.borderColor = '#ff2d78';
    ring.style.transform   = 'translate(-50%,-50%) scale(1.4)';
    setTimeout(() => {
      ring.style.borderColor = 'transparent';
      ring.style.transform   = 'translate(-50%,-50%) scale(1)';
    }, 120);
  }

  showKill(killerName, victimName) {
    const feed = this._el.killFeed;
    const item  = document.createElement('div');
    item.style.cssText = `
      background:rgba(10,10,15,.75); border:1px solid rgba(0,245,255,.2);
      padding:4px 10px; font-size:.62rem; letter-spacing:.1em;
      color:#e0e0ff; opacity:1; transition:opacity 1s;
      white-space:nowrap;
    `;
    item.innerHTML = `<span style="color:#00f5ff">${killerName}</span>
      <span style="color:rgba(224,224,255,.4)"> fragged </span>
      <span style="color:#ff2d78">${victimName}</span>`;
    feed.appendChild(item);
    this._killFeedItems.push(item);

    // Keep max 5 entries
    while (this._killFeedItems.length > 5) {
      feed.removeChild(this._killFeedItems.shift());
    }

    // Fade after 5 s
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
    el.textContent = '+100 XP  ·  KILL';
    el.style.opacity = '1';
    clearTimeout(this._killNotifTimer);
    this._killNotifTimer = setTimeout(() => {
      el.style.opacity = '0';
    }, 2000);
  }

  showDeathScreen(seconds = 3) {
    this._dead = true;
    const ds = this._el.deathScreen;
    ds.style.display = 'flex';
    let remaining = seconds;
    this._el.deathTimer.textContent = `Respawning in ${remaining}…`;
    if (this._respawnTimer) clearInterval(this._respawnTimer);
    this._respawnTimer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(this._respawnTimer);
      } else {
        this._el.deathTimer.textContent = `Respawning in ${remaining}…`;
      }
    }, 1000);
  }

  hideDeathScreen() {
    this._dead = false;
    this._el.deathScreen.style.display = 'none';
    if (this._respawnTimer) clearInterval(this._respawnTimer);
    this.setHp(100);
  }
}
