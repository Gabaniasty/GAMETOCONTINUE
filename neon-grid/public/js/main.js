import { Game }         from './Game.js';
import { Network }      from './Network.js';
import { Hud }          from './Hud.js';
import { BulletSystem } from './BulletSystem.js';
import { SoundEngine }  from './SoundEngine.js';
import { CLASSES }      from './Classes.js';
import { OverwatchMap, OVERWATCH_AABBS } from './maps/OverwatchMap.js';
import { PostMatch }    from './PostMatch.js';
import { Scoreboard }   from './Scoreboard.js';
// ── Map selection via URL param (?map=OVERWATCH | TERMINAL) ─────────────────
const _selectedMap = (new URLSearchParams(location.search).get('map') || 'TERMINAL').toUpperCase();

const localClass  = localStorage.getItem('ng_class') || 'SOLDIER';
const classData   = CLASSES[localClass] || CLASSES.SOLDIER;
const maxHp       = classData.hp;
const weaponSound = classData.sound || 'ak47';

const game    = new Game('gameCanvas');
const network = new Network();
const hud     = new Hud();
const bullets = new BulletSystem(game.scene);
const sound   = new SoundEngine();

const postMatch  = new PostMatch(network._socket, () => network.getLocalId());
const scoreboard = new Scoreboard(network._socket, () => network.getLocalId());

// ── Remote player sound tracking ────────────────────────────────────
// Maps player id → previous isShooting boolean (for rising-edge detection)
const _remoteShootPrev  = new Map();
// Maps player id → accumulated footstep timer (seconds)
const _remoteFootTimers = new Map();

// Resume / init audio context on any user gesture
function _initAudio() {
  sound.init();
  // Apply any persisted volume settings after the audio context is created
  const vols = sound.getVolumes();
  sound.setVolume('master',    vols.master);
  sound.setVolume('weapons',   vols.weapons);
  sound.setVolume('footsteps', vols.footsteps);
  sound.setVolume('ambient',   vols.ambient);
  sound.setMuted(vols.muted);
}
document.addEventListener('mousedown', _initAudio, { once: true });
document.addEventListener('keydown',   _initAudio, { once: true });

// ── AWP weapon init (WRAITH class) ──────────────────────────────────
if (localClass === 'WRAITH') {
  game.initAWP(sound);
  // Show AWP ammo HUD
  const awpHud = document.getElementById('awp-hud');
  if (awpHud) awpHud.style.display = 'flex';
  // Seed HUD values immediately
  const awpCur = document.getElementById('awp-ammo-current');
  const awpRes = document.getElementById('awp-ammo-reserve');
  if (awpCur) awpCur.textContent = game._awpWeapon.ammo;
  if (awpRes) awpRes.textContent = game._awpWeapon.reserve;
}

hud.setHp(maxHp, maxHp);

// ── Barrel tip positions in weapon-camera local space ───────────────
// Gun group base: (0.2, -0.22, -0.35). Each value is base + muzzle offset.
const BARREL_TIP = {
  SOLDIER: new THREE.Vector3(0.2, -0.205, -0.83),   // AK47 muzzle tip
  GHOST:   new THREE.Vector3(0.2, -0.204, -0.633),  // SMG muzzle tip
  WRAITH:  new THREE.Vector3(0.2, -0.204, -0.908),  // Sniper muzzle brake tip
};

// ── Start sending position on connect ──────────────────────────────
network._socket.on('connect', () => {
  network.startSendingPosition(game.camera, game.controls);
});

// ── Shared shoot helper (fires raycast + network notify) ─────────────
// Headshot detection is now server-authoritative via hitZone from dual hitboxes.
let _pendingKillIsHeadshot = false;
// Pending server confirmation for predicted hit marker
let _pendingConfirmTimer   = null;
let _pendingConfirmDone    = false;

function _doFireShot() {
  const origin = {
    x: game.camera.position.x,
    y: game.camera.position.y,
    z: game.camera.position.z,
  };
  const dir3      = new THREE.Vector3(0, 0, -1).applyQuaternion(game.camera.quaternion);
  const direction = { x: dir3.x, y: dir3.y, z: dir3.z };

  const btLocal    = (BARREL_TIP[localClass] || BARREL_TIP.SOLDIER).clone();
  btLocal.applyQuaternion(game.camera.quaternion);
  const barrelWorld = game.camera.position.clone().add(btLocal);

  const result = bullets.shoot(origin, direction, game.camera, barrelWorld);
  if (result.type === 'player') {
    // ── Predicted hit marker: show immediately, revert if server rejects ──
    hud.showHitMarker(false, false);        // instant feedback (no HS info yet)
    _pendingConfirmDone = false;
    clearTimeout(_pendingConfirmTimer);
    _pendingConfirmTimer = setTimeout(() => {
      // Server did not confirm within 350 ms — revert crosshair spread
      if (!_pendingConfirmDone) {
        const ch = document.getElementById('crosshair');
        if (ch) ch.style.setProperty('--ch-gap', '4px');
        const arms = document.querySelectorAll('#crosshair .ch-arm');
        arms.forEach(arm => {
          arm.style.background = 'rgba(255,255,255,0.75)';
          arm.style.boxShadow  = 'none';
          arm.style.transition = 'background .08s, box-shadow .08s';
        });
      }
    }, 350);

    network.sendShoot(origin, direction, result.playerId, result.distance, result.hitZone);
  } else {
    // Missed shot — still notify server so isShooting fires for remote animation
    network.sendShoot(origin, direction, null, 0, null);
  }
}

// ── Shoot ──────────────────────────────────────────────────────────
if (localClass === 'WRAITH' && game._awpWeapon) {
  // AWP: scoped-click fires through AWP (handles rate limit + bolt)
  game.controls.onAwpShoot = () => {
    game._awpWeapon.shoot(() => {
      // This fires only when AWP approves the shot
      game.triggerRecoil();
      _doFireShot();
    });
  };
  // Unscoped fallback (hip-fire — not recommended but still possible via onShoot)
  game.controls.onShoot = () => {
    game._awpWeapon.shoot(() => {
      game.triggerRecoil();
      _doFireShot();
    });
  };
  // Reload on R
  game.controls.onReload = () => game._awpWeapon.reload();
  // Hold breath on Shift while scoped (hold-to-steady: cancel on keyup)
  game.controls.onHoldBreath    = () => game._awpWeapon.startBreath();
  game.controls.onReleaseBreath = () => game._awpWeapon.releaseBreath();
} else {
  game.controls.onShoot = () => {
    sound.playGunshot(weaponSound);
    game.triggerRecoil();
    _doFireShot();
  };
}

// ── Combat callbacks ───────────────────────────────────────────────

network.onHit = ({ targetId, damage, newHp, isHeadshot }) => {
  const isLethal = newHp <= 0;

  // Server confirmed — cancel pending revert timer, then show confirmed marker
  _pendingConfirmDone = true;
  clearTimeout(_pendingConfirmTimer);

  hud.flashHit();
  hud.showHitMarker(false, isHeadshot);
  hud.showDamageNumber(damage);

  if (isHeadshot) {
    sound.play_headshot_confirm();
  } else {
    sound.play_hit_confirm();
  }

  // Remember for kill event — server may send onKilled before or after
  if (isLethal) {
    _pendingKillIsHeadshot = !!isHeadshot;
  }

  const remote = network.getRemotePlayers().find(p => p.id === targetId);
  if (remote) {
    const hitPos = { x: remote.x, y: remote.y, z: remote.z };
    bullets.onHit(hitPos, !!isHeadshot);
  }
};

network.onDamaged = ({ shooterId, damage, newHp, isHeadshot }) => {
  hud.setHp(newHp, maxHp);
  sound.play_take_damage();
  hud.showDamageVignette();

  // Directional indicator: compute angle from player's facing toward the shooter
  const shooter = network.getRemotePlayers().find(p => p.id === shooterId);
  if (shooter) {
    const dx    = shooter.x - game.camera.position.x;
    const dz    = shooter.z - game.camera.position.z;
    const camY  = game.camera.rotation.y;
    const fwdX  = -Math.sin(camY);
    const fwdZ  = -Math.cos(camY);
    const cross = fwdX * dz - fwdZ * dx;
    const dot   = fwdX * dx + fwdZ * dz;
    const angleDeg = Math.atan2(cross, dot) * 180 / Math.PI;
    hud.showDirectionalIndicator(angleDeg);
  }
};

network.onKilled = ({ killerId, killerName, victimId, victimName, killerClass, killerRp = 0, isHeadshot = false, weaponName = '' }) => {
  hud.showKill(killerName, victimName, { isHeadshot, weaponName, killerClass, killerRp });
  const localId = network.getLocalId();

  if (killerId === localId) {
    hud.showKillNotification();
    const wasHeadshot = _pendingKillIsHeadshot || isHeadshot;
    hud.showHitMarker(true, wasHeadshot);
    _pendingKillIsHeadshot = false;
    sound.play_kill();
  }

  if (victimId === localId) {
    game.controls.isDead = true;
    game.controls.setInputLocked(true);
    hud.showDeathScreen(3, killerName, killerRp);
  }
};

// ── RP gain notification at round end ─────────────────────────────────
network._socket.on('player:stats_update', ({ rpChange }) => {
  if (rpChange && rpChange !== 0) {
    hud.showRpGain(rpChange);
  }
});

network.onAnnouncement = (type) => {
  sound.playAnnouncement(type);
};

let _initialSpawnDone = false;
network.onRespawned = ({ id, x, y, z, hp }) => {
  const localId = network.getLocalId();
  if (id === localId) {
    if (!_initialSpawnDone) {
      _initialSpawnDone = true;
      if (window._advanceLoadingStage) window._advanceLoadingStage(3);
    }
    hud.hideDeathScreen();
    hud.setHp(hp, maxHp);
    game.camera.position.set(x, y, z);
    // Face toward map center so players immediately see each other
    // North spawns (z < 0) face south (yaw = π); south spawns face north (yaw = 0)
    game.controls.yaw   = z < 0 ? Math.PI : 0;
    game.controls.pitch = 0;
    game.controls._vel.x = 0;
    game.controls._vel.y = 0;
    game.controls._vel.z = 0;
    game.controls.isDead = false;
    game.controls.setInputLocked(false);
    game.showSpawnProtection();
    // Reset AWP ammo on respawn
    if (game._awpWeapon) {
      game._awpWeapon.ammo    = game._awpWeapon._maxMag;
      game._awpWeapon.reserve = Infinity;
      game._awpWeapon.isReloading = false;
      game._awpWeapon._updateAmmoHud();
      const rl = document.getElementById('awp-reload-bar');
      if (rl) rl.style.display = 'none';
    }
    // Reset non-AWP ammo on respawn
    if (localClass !== 'WRAITH') {
      game.controls.resetAmmo();
    }
  }
};

network.onXpUpdate = ({ xp, level }) => {
  hud.setXp(xp, level);
};

// ── Tab: server-polled scoreboard ─────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.code === 'Tab') {
    e.preventDefault();
    scoreboard.show();
  }
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'Tab') scoreboard.hide();
});

// ── ESC: pointer-lock release → pause menu (only during gameplay) ──
// Browsers suppress Escape in keydown during pointer lock, so we use
// the pointerlockchange event to detect when ESC was pressed.
document.addEventListener('pointerlockchange', () => {
  const isLocked = !!document.pointerLockElement;
  if (!isLocked) {
    const lobbyVisible = _lobbyOverlay && _lobbyOverlay.style.display !== 'none';
    if (!lobbyVisible && !_isPaused) _openPause();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && _isPaused) {
    e.preventDefault();
    _closePause();
  }
});

// ── Scope wiring (WRAITH only) ─────────────────────────────────────
if (localClass === 'WRAITH') {
  game.controls.onScope   = () => game.setScoped(true);
  game.controls.onUnscope = () => game.setScoped(false);
  // Fix scope state sync: when AWP forces unscope (e.g. reload), reset Controls.isScoped
  if (game._awpWeapon) {
    game._awpWeapon._onForceUnscope = () => {
      if (game.controls.isScoped) {
        game.controls.isScoped = false;
        game.setScoped(false);
      }
    };
  }
}

// ── Non-AWP ammo HUD wiring (SOLDIER / GHOST) ──────────────────────
if (localClass !== 'WRAITH') {
  const initAmmo = classData.magazineSize ?? 30;
  hud.setAmmo(initAmmo, initAmmo * 3);

  game.controls.onAmmoChanged    = (ammo, reserve) => hud.setAmmo(ammo, reserve);
  game.controls.onReloadStart    = ()    => hud.setReloading(true);
  game.controls.onReloadEnd      = ()    => hud.setReloading(false);
  game.controls.onReloadProgress = (pct) => hud.setReloadProgress(pct);
}

// Also unscope on death
const _origOnKilled = network.onKilled;
network.onKilled = (...args) => {
  if (game._isScoped) game.setScoped(false);
  if (game.controls.isScoped) game.controls.isScoped = false;
  if (_origOnKilled) _origOnKilled(...args);
};

// ── Lobby code display ────────────────────────────────────────────
network.onLobbyCode = (code) => {
  const row = document.getElementById('lobby-code-row');
  const el  = document.getElementById('lobby-code-display');
  if (row && el) {
    el.textContent = code;
    row.style.display = 'flex';
    el.onclick = () => {
      navigator.clipboard.writeText(code).then(() => {
        const copied = document.getElementById('lobby-code-copied');
        if (copied) { copied.style.opacity = 1; setTimeout(() => { copied.style.opacity = 0; }, 1800); }
      }).catch(() => {});
    };
  }
};

// ── ESC pause menu ────────────────────────────────────────────────
const _pauseMenu   = document.getElementById('pause-menu');
const _pauseResume = document.getElementById('pause-resume');
const _pauseQuit   = document.getElementById('pause-quit');
let   _isPaused    = false;

function _openPause() {
  if (!_pauseMenu) return;
  _isPaused = true;
  _pauseMenu.classList.add('open');
  if (document.pointerLockElement) document.exitPointerLock();
}
function _closePause() {
  if (!_pauseMenu) return;
  _isPaused = false;
  _pauseMenu.classList.remove('open');
}

if (_pauseResume) _pauseResume.onclick = () => _closePause();
if (_pauseQuit)   _pauseQuit.onclick   = () => { network.leaveLobby(); };

// ── Lobby overlay ─────────────────────────────────────────────────
const _lobbyOverlay    = document.getElementById('lobby-overlay');
const _lobbyList       = document.getElementById('lobby-players-list');
const _lobbyHeader     = document.getElementById('lobby-players-header');
const _lobbyStartBtn   = document.getElementById('lobby-start-btn');
const _lobbyHint       = document.getElementById('lobby-hint');
const _lobbyStateLabel = document.getElementById('lobby-state-label');
const _lobbyResults    = document.getElementById('lobby-results');
const _resultsScores   = document.getElementById('results-scores');
const _lobbyCountdown  = document.getElementById('lobby-countdown');

// ── Map vote refs ──────────────────────────────────────────────────
const _mapCards        = document.querySelectorAll('.map-card');
const _votesTERMINAL   = document.getElementById('votes-TERMINAL');
const _votesOVERWATCH  = document.getElementById('votes-OVERWATCH');

// ── Round selector refs ────────────────────────────────────────────
const _roundsBtns       = document.querySelectorAll('.round-btn');
const _roundsTargetLbl  = document.getElementById('rounds-target-label');

// ── Round wins HUD refs ────────────────────────────────────────────
const _rwHud            = document.getElementById('round-wins-hud');
const _rwhLeftName      = document.getElementById('rwh-left-name');
const _rwhLeftKills     = document.getElementById('rwh-left-kills');
const _rwhRightName     = document.getElementById('rwh-right-name');
const _rwhRightKills    = document.getElementById('rwh-right-kills');
const _rwhTargetEl      = document.getElementById('rwh-target');

// ── Match winner banner refs ───────────────────────────────────────
const _mwBanner   = document.getElementById('match-winner-banner');
const _mwTitle    = document.getElementById('mwb-title');
const _mwSub      = document.getElementById('mwb-sub');

const _CC = { SOLDIER: '#00f5ff', GHOST: '#ff2d78', WRAITH: '#7b2fff' };
let _cdTimer         = null;
let _roundTarget     = 10;
let _matchWinsTarget = 3;

// ── Round won banner refs ──────────────────────────────────────────
const _rwBanner = document.getElementById('round-won-banner');
const _rwbTitle = document.getElementById('rwb-title');
const _rwbSub   = document.getElementById('rwb-sub');

// ── Match wins selector refs ───────────────────────────────────────
const _matchWinsBtns      = document.querySelectorAll('.match-wins-btn');
const _matchWinsTargetLbl = document.getElementById('match-wins-target-label');

// ── Round wins dots renderer ───────────────────────────────────────
function _updateRoundWinsDots(roundWins) {
  const localId   = network.getLocalId();
  const leftDots  = document.getElementById('rwh-left-dots');
  const rightDots = document.getElementById('rwh-right-dots');
  if (!leftDots || !rightDots) return;

  const localEntry  = roundWins.find(r => r.id === localId);
  const remoteEntry = roundWins.find(r => r.id !== localId);
  const localWins   = localEntry  ? (localEntry.wins  || 0) : 0;
  const oppWins     = remoteEntry ? (remoteEntry.wins || 0) : 0;

  const renderDots = (container, filled, max) => {
    container.innerHTML = '';
    for (let i = 0; i < max; i++) {
      const dot = document.createElement('span');
      dot.className = 'rwh-dot' + (i < filled ? ' filled' : '');
      container.appendChild(dot);
    }
  };
  renderDots(leftDots,  localWins, _matchWinsTarget);
  renderDots(rightDots, oppWins,   _matchWinsTarget);
}

// ── Update round wins HUD from a kills array [{id, username, kills}] ──
function _updateRwHud(kills) {
  if (!_rwHud) return;
  const localId = network.getLocalId();
  const local   = kills.find(k => k.id === localId);
  const remotes = kills.filter(k => k.id !== localId);

  _rwhLeftKills.textContent  = local ? (local.kills || 0) : 0;
  _rwhRightKills.textContent = remotes.length ? (remotes[0].kills || 0) : 0;
  _rwhRightName.textContent  = remotes.length ? remotes[0].username.slice(0, 7).toUpperCase() : 'OPP';
  _rwhTargetEl.textContent   = _roundTarget;
}

network.onLobbyState = ({ gameState, hostId, players, maxPlayers, roundTarget, matchWinsTarget, mapVotes, playerVotes }) => {
  const localId = network.getLocalId();
  const isHost  = hostId === localId;

  if (roundTarget) {
    _roundTarget = roundTarget;
    if (_roundsTargetLbl) _roundsTargetLbl.textContent = roundTarget;
    if (_rwhTargetEl)     _rwhTargetEl.textContent     = roundTarget;
  }

  if (matchWinsTarget) {
    _matchWinsTarget = matchWinsTarget;
    if (_matchWinsTargetLbl) _matchWinsTargetLbl.textContent = matchWinsTarget;
    _matchWinsBtns.forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.wins) === matchWinsTarget);
      btn.disabled = !isHost;
    });
  }

  // ── Rebuild player list ─────────────────────────────────────────
  _lobbyHeader.textContent = `OPERATIVES [${players.length} / ${maxPlayers}]`;
  _lobbyList.innerHTML = '';
  players.forEach((p) => {
    const isMe = p.id === localId;
    const isH  = p.id === hostId;
    const col  = _CC[p.class] || '#00f5ff';
    const row  = document.createElement('div');
    row.className = 'lobby-player-row';
    row.innerHTML = `
      <span class="lpr-name" style="color:${col}">${p.username.toUpperCase()}${isH ? ' ★' : ''}${isMe ? ' (YOU)' : ''}</span>
      <span class="lpr-class">${p.class}</span>
      <span class="lpr-kd">${p.kills}K / ${p.deaths}D</span>
    `;
    _lobbyList.appendChild(row);
  });

  // ── Update map vote counts ──────────────────────────────────────
  if (mapVotes) {
    const tCount = mapVotes.TERMINAL || 0;
    const oCount = mapVotes.OVERWATCH || 0;
    if (_votesTERMINAL)  _votesTERMINAL.textContent  = tCount === 1 ? '1 VOTE' : `${tCount} VOTES`;
    if (_votesOVERWATCH) _votesOVERWATCH.textContent = oCount === 1 ? '1 VOTE' : `${oCount} VOTES`;
  }

  // ── Highlight the local player's voted map card ─────────────────
  if (playerVotes && localId) {
    const myVote = playerVotes[localId];
    _mapCards.forEach(card => {
      card.classList.toggle('voted', card.dataset.map === myVote);
    });
  }

  // ── Update round selector active button ─────────────────────────
  if (roundTarget) {
    _roundsBtns.forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.rounds) === roundTarget);
      btn.disabled = !isHost;
    });
  }

  if (gameState === 'lobby') {
    _lobbyStateLabel.textContent = players.length >= maxPlayers ? 'ROUND STARTING…' : 'LOBBY';
    _lobbyResults.style.display  = 'none';
    _lobbyOverlay.style.display  = 'flex';
    _lobbyStartBtn.style.display = isHost ? 'block' : 'none';
    _lobbyHint.textContent = isHost
      ? `YOU ARE HOST — CLICK START WHEN READY (${players.length}/${maxPlayers})`
      : 'WAITING FOR HOST TO START THE ROUND…';
    _lobbyHint.style.display = 'block';
    if (_cdTimer) { clearInterval(_cdTimer); _cdTimer = null; }
    game.controls.roundActive = false;
    if (document.pointerLockElement) document.exitPointerLock();
    if (_rwHud) _rwHud.style.display = 'none';
    if (_mwBanner) _mwBanner.style.display = 'none';

  } else if (gameState === 'playing') {
    _lobbyOverlay.style.display = 'none';
    if (_cdTimer) { clearInterval(_cdTimer); _cdTimer = null; }
    game.controls.roundActive = true;
    sound.startAmbient();
    // Show round wins HUD — seed with current kill data
    if (_rwHud) {
      _rwHud.style.display = 'flex';
      _updateRwHud(players.map(p => ({ id: p.id, username: p.username, kills: p.kills })));
    }

  } else if (gameState === 'results') {
    _lobbyStateLabel.textContent = 'ROUND OVER';
    _lobbyResults.style.display  = 'block';
    _lobbyStartBtn.style.display = 'none';
    _lobbyHint.style.display     = 'none';
    _lobbyOverlay.style.display  = 'flex';
    game.controls.roundActive    = false;
    if (document.pointerLockElement) document.exitPointerLock();
    if (_rwHud) _rwHud.style.display = 'none';

    // Results table sorted by kills
    const sorted = [...players].sort((a, b) => (b.kills || 0) - (a.kills || 0));
    _resultsScores.innerHTML = '';
    const medals = ['①', '②', '③'];
    sorted.forEach((p, i) => {
      const isMe = p.id === localId;
      const col  = _CC[p.class] || '#00f5ff';
      const row  = document.createElement('div');
      row.className = 'results-row';
      row.innerHTML = `
        <span class="rr-rank">${medals[i] || (i + 1)}</span>
        <span class="rr-name" style="color:${col}">${p.username.toUpperCase()}${isMe ? ' ★' : ''}</span>
        <span class="rr-class">${p.class}</span>
        <span class="rr-kills">${p.kills}K</span>
        <span class="rr-deaths">${p.deaths}D</span>
      `;
      _resultsScores.appendChild(row);
    });

    // Countdown timer back to lobby
    let secs = 12;
    _lobbyCountdown.textContent = `RETURNING TO LOBBY IN ${secs}s…`;
    if (_cdTimer) clearInterval(_cdTimer);
    _cdTimer = setInterval(() => {
      secs--;
      if (secs <= 0) {
        clearInterval(_cdTimer); _cdTimer = null;
        _lobbyCountdown.textContent = '';
      } else {
        _lobbyCountdown.textContent = `RETURNING TO LOBBY IN ${secs}s…`;
      }
    }, 1000);
  }
};

_lobbyStartBtn.addEventListener('click', () => network.sendStartRound());

// ── Map vote card clicks ───────────────────────────────────────────
_mapCards.forEach(card => {
  card.addEventListener('click', () => {
    network.sendVoteMap(card.dataset.map);
  });
});

// ── Round target button clicks ────────────────────────────────────
_roundsBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const t = parseInt(btn.dataset.rounds);
    network.sendSetRounds(t);
  });
});

// ── Match wins button clicks ───────────────────────────────────────
_matchWinsBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const t = parseInt(btn.dataset.wins);
    network.sendSetMatchWins(t);
  });
});

// ── Real-time kill update → round wins HUD ────────────────────────
network._socket.on('game:kills_update', ({ kills, roundTarget: rt }) => {
  if (rt) {
    _roundTarget = rt;
    if (_rwhTargetEl) _rwhTargetEl.textContent = rt;
  }
  _updateRwHud(kills);
});

// ── Match winner announcement ─────────────────────────────────────
network._socket.on('game:match_winner', ({ winnerId, winnerName, kills, target }) => {
  if (!_mwBanner || !_mwTitle || !_mwSub) return;
  const isWinner = winnerId === network.getLocalId();
  _mwTitle.textContent = isWinner ? 'VICTORY' : `${winnerName.toUpperCase()} WINS`;
  _mwTitle.style.color = isWinner ? '#00f5ff' : '#ff2d78';
  _mwSub.textContent   = `${kills} / ${target} KILLS`;
  _mwBanner.style.display = 'block';
  if (_rwHud) _rwHud.style.display = 'none';
  setTimeout(() => { if (_mwBanner) _mwBanner.style.display = 'none'; }, 4000);
});

// ── Round won (match continues) ───────────────────────────────────
network._socket.on('game:round_won', ({ winnerId, winnerName, roundWins, matchWinsTarget: mwt }) => {
  _matchWinsTarget = mwt;
  if (_rwBanner && _rwbTitle && _rwbSub) {
    const isWinner = winnerId === network.getLocalId();
    _rwbTitle.textContent = isWinner ? 'ROUND WON!' : `${winnerName.toUpperCase()} WINS ROUND`;
    _rwbTitle.style.color = isWinner ? '#00f5ff' : '#ff2d78';
    _rwbSub.textContent   = `${roundWins} / ${mwt} ROUNDS TO WIN MATCH`;
    _rwBanner.style.display = 'block';
    setTimeout(() => { if (_rwBanner) _rwBanner.style.display = 'none'; }, 3000);
  }
});

// ── Round wins dots update ─────────────────────────────────────────
network._socket.on('game:roundwins_update', ({ roundWins, matchWinsTarget: mwt }) => {
  _matchWinsTarget = mwt;
  _updateRoundWinsDots(roundWins);
});

// ── Round countdown ────────────────────────────────────────────────
network.onCountdown = (seconds) => {
  if (seconds > 0) {
    _lobbyStateLabel.textContent = `STARTING IN ${seconds}…`;
    _lobbyCountdown.textContent  = '';
    _lobbyStartBtn.style.display = 'none';
    _lobbyHint.textContent       = 'ROUND STARTING — GET READY!';
    _lobbyHint.style.display     = 'block';
  }
};

// ── Patched game loop ──────────────────────────────────────────────
game._animate = function () {
  requestAnimationFrame(() => game._animate());

  const dt = Math.min(game._clock.getDelta(), 0.05);
  const { controls, camera } = game;

  // Keep world matrices fresh every frame so raycasts hit actual geometry
  game.scene.updateMatrixWorld();

  controls.update(camera, dt);
  game._clampToWalls(camera.position);
  controls.applyToCamera();

  // ── OVERWATCH nest teleport triggers ────────────────────────────
  if (game._mapLoader && typeof game._mapLoader.checkNestTrigger === 'function') {
    const tp = game._mapLoader.checkNestTrigger(camera, dt);
    if (tp) {
      camera.position.set(tp.targetX, tp.targetY, tp.targetZ);
      controls._vel.y = 0;
    }
  }

  // Per-frame map animation (turbine, sky, flickering lights, etc.)
  if (game._mapLoader) game._mapLoader.update(dt);

  game.tickScope(dt);
  game.tickSpawnShield(camera);
  game.updateRemotePlayers(network.getRemotePlayers(), dt);
  game._tickVfx(dt);
  game.tickWeapon(dt);
  bullets.update(dt);
  bullets.updatePlayerHitboxes(network.getRemotePlayers());

  // ── Footstep audio (local player) ────────────────────────────
  if (controls.isPlaying && !controls.isDead) {
    const hspd  = Math.sqrt(controls._vel.x ** 2 + controls._vel.z ** 2);
    const moving = hspd > 0.5 && controls._onGround;
    const surface = sound.detectSurface(game.collidableMeshes, camera.position);
    sound.updateFootsteps(dt, moving, hspd, controls.isSprinting(), surface);
  }

  // ── Remote player sounds (gunshots + footsteps) ───────────────
  if (controls.isPlaying && !controls.isDead) {
    const localPos = camera.position;
    for (const rp of network.getRemotePlayers()) {
      if (rp.dead) {
        _remoteShootPrev.delete(rp.id);
        _remoteFootTimers.delete(rp.id);
        continue;
      }

      const dx   = rp.x - localPos.x;
      const dy   = (rp.y ?? localPos.y) - localPos.y;
      const dz   = rp.z - localPos.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // ── Gunshot: detect rising edge of isShooting ──────────────
      const prevShoot = _remoteShootPrev.get(rp.id) ?? false;
      if (rp.isShooting && !prevShoot) {
        sound.play_remote_fire(dist);
      }
      _remoteShootPrev.set(rp.id, !!rp.isShooting);

      // ── Footsteps: accumulate timer by velocity magnitude ───────
      const vel = rp.velocity || { x: 0, y: 0, z: 0 };
      const hspd = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
      const isMoving = hspd > 0.5;
      if (isMoving) {
        const isSprinting = hspd > 6.5;
        const interval    = isSprinting ? 0.30 : 0.52;
        const timer       = (_remoteFootTimers.get(rp.id) ?? 0) + dt;
        if (timer >= interval) {
          _remoteFootTimers.set(rp.id, timer - interval);
          sound.play_remote_footstep(dist, 'concrete');
        } else {
          _remoteFootTimers.set(rp.id, timer);
        }
      } else {
        _remoteFootTimers.set(rp.id, 0);
      }
    }
  }

  // ── Sprint indicator ──────────────────────────────────────────
  const _sprintEl = document.getElementById('sprint-indicator');
  if (_sprintEl && controls.isPlaying && !controls.isDead) {
    const _spHspd = Math.sqrt(controls._vel.x ** 2 + controls._vel.z ** 2);
    _sprintEl.style.display = (controls.isSprinting() && _spHspd > 0.5) ? 'flex' : 'none';
  } else if (_sprintEl) {
    _sprintEl.style.display = 'none';
  }

  hud.tickFps(dt);
  hud.updateMinimap(camera.position, network.getRemotePlayers());

  game.renderer.clear();
  game.renderer.render(game.scene, camera);
  game.renderWeapon();
};

// ── Map loading ─────────────────────────────────────────────────────
// Deferred until the server confirms the active map via game:map.
// This ensures every client — with or without a ?map= URL param — loads
// the same map the server is using for collision / LOS validation.

let _loadedMapId = null;

// ── FOV + audio + settings listener ─────────────────────────────────
document.addEventListener('ng-settings-changed', (e) => {
  if ('ng_fov' in e.detail) {
    const fov = e.detail.ng_fov;
    game.camera.fov = fov;
    game.camera.updateProjectionMatrix();
  }
  if ('ng_motion_blur' in e.detail) {
    const gc = document.getElementById('gameCanvas');
    if (gc) gc.style.filter = e.detail.ng_motion_blur ? 'blur(0.6px)' : '';
  }
  // Volume sliders
  if ('ng_vol_master'    in e.detail) sound.setVolume('master',    e.detail.ng_vol_master);
  if ('ng_vol_weapons'   in e.detail) sound.setVolume('weapons',   e.detail.ng_vol_weapons);
  if ('ng_vol_footsteps' in e.detail) sound.setVolume('footsteps', e.detail.ng_vol_footsteps);
  if ('ng_vol_ambient'   in e.detail) sound.setVolume('ambient',   e.detail.ng_vol_ambient);
  // Mute toggle
  if ('ng_vol_muted' in e.detail) sound.setMuted(e.detail.ng_vol_muted);
});

// Apply stored FOV on boot
const _storedFov = parseFloat(localStorage.getItem('ng_fov') || '75');
if (game.camera) {
  game.camera.fov = _storedFov;
  game.camera.updateProjectionMatrix();
}

// Apply stored motion blur on boot (mirrors the ng-settings-changed handler)
const _storedMotionBlur = localStorage.getItem('ng_motion_blur');
if (_storedMotionBlur === '1' || _storedMotionBlur === 'true') {
  const gc = document.getElementById('gameCanvas');
  if (gc) gc.style.filter = 'blur(0.6px)';
}

function _loadMap(mapId) {
  if (_loadedMapId === mapId) return;   // already have this exact map

  // If switching maps (vote winner differs from initial load), clear old geometry
  if (_loadedMapId !== null) {
    const toRemove = [];
    game.scene.traverse(obj => { if (obj.isMesh) toRemove.push(obj); });
    toRemove.forEach(obj => { game.scene.remove(obj); });
    game.controls.setCollidableMeshes([]);
    bullets.setCollidableMeshes([]);
  }

  _loadedMapId = mapId;

  if (window._advanceLoadingStage) window._advanceLoadingStage(0);
  const loadingText = document.getElementById('loadingText');
  if (loadingText) loadingText.textContent = 'LOADING MAP...';

  if (mapId === 'OVERWATCH') {
    const owMap = new OverwatchMap(game.scene);
    game.loadWithLoader(owMap, (map) => {
      const meshes = map.getCollidableMeshes();
      game.controls.setCollidableMeshes(meshes);
      game.controls.setMapAABBs(OVERWATCH_AABBS);
      game.controls.setLadderZones([]);
      bullets.setCollidableMeshes(meshes);
      game.start();
      if (window._advanceLoadingStage) window._advanceLoadingStage(2);
    });
  } else {
    game.loadMap('/assets/maps/arena.glb', (map) => {
      game.controls.setCollidableMeshes(map.getCollidableMeshes());
      bullets.setCollidableMeshes(map.getCollidableMeshes());
      game.start();
      if (window._advanceLoadingStage) window._advanceLoadingStage(2);
    });
  }
}

// Listen for server-confirmed map (both initial response and late-join sync)
network._socket.on('game:map', ({ mapId }) => {
  _loadMap(mapId);
});

// On connect, send map preference to server; server replies with game:map
network._socket.once('connect', () => {
  network._socket.emit('game:map_request', { mapId: _selectedMap });
});

// Fallback: only if socket never connected (offline / server down) after 5 s.
// When connected, we rely entirely on the server's game:map event so the
// client never diverges from the server's authoritative map choice.
setTimeout(() => {
  if (!network._socket.connected) _loadMap(_selectedMap);
}, 5000);
