export class Scoreboard {
  constructor(socket, getLocalId) {
    this._socket   = socket;
    this._getId    = getLocalId;
    this._visible  = false;
    this._pollTimer = null;
    this._overlay  = null;

    this._injectStyles();
    this._buildOverlay();

    socket.on('scoreboard:data', (data) => this._render(data));
  }

  _injectStyles() {
    if (document.getElementById('sb-styles')) return;
    const s = document.createElement('style');
    s.id = 'sb-styles';
    s.textContent = `
      #sb-overlay {
        position: fixed; inset: 0; z-index: 5000;
        background: rgba(0, 0, 8, 0.88);
        backdrop-filter: blur(8px);
        display: none; flex-direction: column;
        align-items: center; justify-content: center;
        font-family: 'Orbitron', sans-serif;
        pointer-events: none;
      }
      #sb-overlay.visible { display: flex; }
      .sb-title {
        font-size: 1rem; letter-spacing: .4em;
        color: #00f5ff; text-shadow: 0 0 12px #00f5ff;
        margin-bottom: .6rem;
      }
      .sb-team-score {
        display: flex; align-items: center; gap: 1.2rem;
        margin-bottom: 1rem;
      }
      .sb-team-score .sb-ta {
        font-size: .75rem; letter-spacing: .2em; font-weight: 700;
        color: #00f5ff; text-shadow: 0 0 8px #00f5ff80;
      }
      .sb-team-score .sb-tb {
        font-size: .75rem; letter-spacing: .2em; font-weight: 700;
        color: #ff2d78; text-shadow: 0 0 8px #ff2d7880;
      }
      .sb-team-score .sb-sep {
        font-size: .65rem; letter-spacing: .2em;
        color: rgba(224,224,255,.35);
      }
      .sb-team-score .sb-score-num {
        font-size: 1.4rem; font-weight: 900; letter-spacing: .05em;
      }
      .sb-totals {
        font-size: .48rem; letter-spacing: .22em;
        color: rgba(224,224,255,.35); margin-bottom: 1rem;
      }
      .sb-table {
        min-width: 560px; display: flex; flex-direction: column; gap: 2px;
      }
      .sb-team-header {
        font-size: .46rem; letter-spacing: .3em; font-weight: 700;
        padding: 4px 12px 2px;
        margin-top: 6px;
      }
      .sb-team-header.ta { color: #00f5ff; }
      .sb-team-header.tb { color: #ff2d78; }
      .sb-thead {
        display: grid;
        grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
        gap: 4px; padding: 5px 12px;
        border-bottom: 1px solid rgba(0,245,255,.3);
        margin-bottom: 2px;
      }
      .sb-thead span {
        font-size: .44rem; letter-spacing: .2em; color: #00f5ff;
      }
      .sb-row {
        display: grid;
        grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
        gap: 4px; padding: 5px 12px;
        background: rgba(10,10,22,.7);
        border-left: 3px solid transparent;
        align-items: center;
      }
      .sb-row.sb-me { border-left-color: #7b2fff; background: rgba(30,0,60,.5); }
      .sb-row.sb-team-b { background: rgba(22,5,12,.7); }
      .sb-row span { font-size: .58rem; letter-spacing: .1em; color: rgba(224,224,255,.75); }
      .sb-name { font-weight: 700; }
      .sb-hint {
        font-size: .44rem; letter-spacing: .22em;
        color: rgba(200,200,255,.25); margin-top: 1rem;
        text-align: center;
      }
    `;
    document.head.appendChild(s);
  }

  _buildOverlay() {
    const ov = this._overlay = document.createElement('div');
    ov.id = 'sb-overlay';
    document.body.appendChild(ov);
  }

  show() {
    if (this._visible) return;
    this._visible = true;
    this._overlay.classList.add('visible');
    this._poll();
    this._pollTimer = setInterval(() => this._poll(), 2000);
  }

  hide() {
    if (!this._visible) return;
    this._visible = false;
    this._overlay.classList.remove('visible');
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
  }

  _poll() {
    this._socket.emit('scoreboard:request');
  }

  _render(data) {
    if (!this._visible) return;
    const { players = [], totalKills = 0, teamA = {}, teamB = {} } = data;
    const localId = this._getId ? this._getId() : null;
    const CC = { SOLDIER: '#00f5ff', GHOST: '#ff2d78', WRAITH: '#7b2fff' };

    const ov = this._overlay;
    ov.innerHTML = '';

    // Title
    const title = document.createElement('div');
    title.className = 'sb-title';
    title.textContent = 'SCOREBOARD';
    ov.appendChild(title);

    // Team A vs Team B score bar
    const teamScoreEl = document.createElement('div');
    teamScoreEl.className = 'sb-team-score';
    teamScoreEl.innerHTML = `
      <span class="sb-ta">TEAM A <span class="sb-score-num">${teamA.kills ?? 0}</span></span>
      <span class="sb-sep">—</span>
      <span class="sb-tb"><span class="sb-score-num">${teamB.kills ?? 0}</span> TEAM B</span>
    `;
    ov.appendChild(teamScoreEl);

    // Totals line
    const totals = document.createElement('div');
    totals.className = 'sb-totals';
    totals.textContent =
      `TOTAL KILLS: ${totalKills}  ·  DMG A: ${teamA.damage ?? 0}  ·  DMG B: ${teamB.damage ?? 0}  ·  PLAYERS: ${players.length}`;
    ov.appendChild(totals);

    const tbl = document.createElement('div');
    tbl.className = 'sb-table';

    // Shared column header
    const thead = document.createElement('div');
    thead.className = 'sb-thead';
    ['OPERATIVE', 'KILLS', 'DEATHS', 'DMG', 'SCORE'].forEach(h => {
      const s = document.createElement('span');
      s.textContent = h;
      thead.appendChild(s);
    });
    tbl.appendChild(thead);

    // Group players by team, render each team section
    const byTeam = { A: [], B: [] };
    players.forEach(p => { (byTeam[p.team] || byTeam['A']).push(p); });

    ['A', 'B'].forEach(t => {
      const group = byTeam[t];
      if (!group.length) return;

      const hdr = document.createElement('div');
      hdr.className = `sb-team-header t${t.toLowerCase()}`;
      hdr.textContent = `▸ TEAM ${t}`;
      tbl.appendChild(hdr);

      group.forEach(p => {
        const isMe = p.id === localId;
        const col  = CC[p.class] || '#00f5ff';
        const row  = document.createElement('div');
        row.className = `sb-row${isMe ? ' sb-me' : ''}${t === 'B' ? ' sb-team-b' : ''}`;
        row.innerHTML = `
          <span class="sb-name" style="color:${col}">${p.username.toUpperCase()}${isMe ? ' ★' : ''}</span>
          <span>${p.kills ?? 0}</span>
          <span>${p.deaths ?? 0}</span>
          <span>${p.damage ?? 0}</span>
          <span>${p.score ?? 0}</span>
        `;
        tbl.appendChild(row);
      });
    });

    ov.appendChild(tbl);

    const hint = document.createElement('div');
    hint.className = 'sb-hint';
    hint.textContent = '[HOLD TAB] TO VIEW · [RELEASE] TO CLOSE';
    ov.appendChild(hint);
  }
}
