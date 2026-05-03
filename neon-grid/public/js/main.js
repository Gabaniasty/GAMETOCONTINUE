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
    game.controls._vel.x = 0;
    game.controls._vel.y = 0;
    game.controls._vel.z = 0;
    game.controls.isDead = false;
    game.controls.setInputLocked(false);
    game.showSpawnProtection();
    // Reset AWP ammo on respawn
    if (game._awpWeapon) {
      game._awpWeapon.ammo    = game._awpWeapon._maxMag;
      game._awpWeapon.reserve = 25;
      game._awpWeapon.isReloading = false;
      game._awpWeapon._updateAmmoHud();
      const rl = document.getElementById('awp-reload-bar');
      if (rl) rl.style.display = 'none';
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

// ── Scope wiring (WRAITH only) ─────────────────────────────────────
if (localClass === 'WRAITH') {
  game.controls.onScope   = () => game.setScoped(true);
  game.controls.onUnscope = () => game.setScoped(false);
}

// Also unscope on death
const _origOnKilled = network.onKilled;
network.onKilled = (...args) => {
  if (game._isScoped) game.setScoped(false);
  if (game.controls.isScoped) game.controls.isScoped = false;
  if (_origOnKilled) _origOnKilled(...args);
};

// ── Lobby overlay ─────────────────────────────────────────────────
const _lobbyOverlay   = document.getElementById('lobby-overlay');
const _lobbyList      = document.getElementById('lobby-players-list');
const _lobbyHeader    = document.getElementById('lobby-players-header');
const _lobbyStartBtn  = document.getElementById('lobby-start-btn');
const _lobbyHint      = document.getElementById('lobby-hint');
const _lobbyStateLabel = document.getElementById('lobby-state-label');
const _lobbyResults   = document.getElementById('lobby-results');
const _resultsScores  = document.getElementById('results-scores');
const _lobbyCountdown = document.getElementById('lobby-countdown');

const _CC = { SOLDIER: '#00f5ff', GHOST: '#ff2d78', WRAITH: '#7b2fff' };
let _cdTimer = null;

network.onLobbyState = ({ gameState, hostId, players, maxPlayers }) => {
  const localId = network.getLocalId();
  const isHost  = hostId === localId;

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

  } else if (gameState === 'playing') {
    _lobbyOverlay.style.display = 'none';
    if (_cdTimer) { clearInterval(_cdTimer); _cdTimer = null; }
    game.controls.roundActive = true;
    sound.startAmbient();

  } else if (gameState === 'results') {
    _lobbyStateLabel.textContent = 'ROUND OVER';
    _lobbyResults.style.display  = 'block';
    _lobbyStartBtn.style.display = 'none';
    _lobbyHint.style.display     = 'none';
    _lobbyOverlay.style.display  = 'flex';
    game.controls.roundActive    = false;
    if (document.pointerLockElement) document.exitPointerLock();

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

  // ── Footstep audio ────────────────────────────────────────────
  if (controls.isPlaying && !controls.isDead) {
    const hspd  = Math.sqrt(controls._vel.x ** 2 + controls._vel.z ** 2);
    const moving = hspd > 0.5 && controls._onGround;
    const surface = sound.detectSurface(game.collidableMeshes, camera.position);
    sound.updateFootsteps(dt, moving, hspd, controls.isSprinting(), surface);
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

let _mapLoaded = false;

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
  if (_mapLoaded) return;
  _mapLoaded = true;

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
