import { Game }         from './Game.js';
import { Network }      from './Network.js';
import { Hud }          from './Hud.js';
import { BulletSystem } from './BulletSystem.js';
import { SoundSystem }  from './SoundSystem.js';
import { CLASSES }      from './Classes.js';

const localClass  = localStorage.getItem('ng_class') || 'SOLDIER';
const classData   = CLASSES[localClass] || CLASSES.SOLDIER;
const maxHp       = classData.hp;
const weaponSound = classData.sound || 'ak47';

const game    = new Game('gameCanvas');
const network = new Network();
const hud     = new Hud();
const bullets = new BulletSystem(game.scene);
const sound   = new SoundSystem();

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

// ── Shoot ──────────────────────────────────────────────────────────
game.controls.onShoot = () => {
  const origin = {
    x: game.camera.position.x,
    y: game.camera.position.y,
    z: game.camera.position.z,
  };
  const dir3      = new THREE.Vector3(0, 0, -1).applyQuaternion(game.camera.quaternion);
  const direction = { x: dir3.x, y: dir3.y, z: dir3.z };

  sound.playGunshot(weaponSound);
  game.triggerRecoil();

  // Transform barrel tip from weapon-camera local → world space for visual spawn
  const btLocal    = (BARREL_TIP[localClass] || BARREL_TIP.SOLDIER).clone();
  btLocal.applyQuaternion(game.camera.quaternion);
  const barrelWorld = game.camera.position.clone().add(btLocal);

  // Client-side raycast — determines what (if anything) the bullet hits
  const result = bullets.shoot(origin, direction, game.camera, barrelWorld);

  if (result.type === 'player') {
    // A player is hit and no wall was between us — notify server for authoritative damage
    network.sendShoot(origin, direction, result.playerId, result.distance);
  }
  // type 'wall' → bullet already stopped visually; no damage server notification needed
  // type 'miss' → bullet travels full range; no server notification needed
};

// ── Combat callbacks ───────────────────────────────────────────────

network.onHit = ({ targetId, damage, newHp }) => {
  hud.flashHit();
  hud.showHitMarker(false);
  sound.playHitConfirm();
  const remote = network.getRemotePlayers().find(p => p.id === targetId);
  if (remote) {
    const hitPos = { x: remote.x, y: remote.y, z: remote.z };
    game.spawnHitParticles(hitPos);
    bullets.onHit(hitPos);
  }
};

network.onDamaged = ({ shooterId, damage, newHp }) => {
  hud.setHp(newHp, maxHp);
  sound.playTakeDamage();
};

network.onKilled = ({ killerId, killerName, victimId, victimName, killerClass }) => {
  hud.showKill(killerName, victimName);
  const localId = network.getLocalId();

  if (killerId === localId) {
    hud.showKillNotification();
    hud.showHitMarker(true);
    sound.playKill();
  }

  if (victimId === localId) {
    game.controls.isDead = true;
    hud.showDeathScreen(3, killerName);
  }
};

network.onRespawned = ({ id, x, y, z, hp }) => {
  const localId = network.getLocalId();
  if (id === localId) {
    hud.hideDeathScreen();
    hud.setHp(hp, maxHp);
    game.camera.position.set(x, y, z);
    game.controls._vel.x = 0;
    game.controls._vel.y = 0;
    game.controls._vel.z = 0;
    game.controls.isDead = false;
    game.showSpawnProtection();
  }
};

network.onXpUpdate = ({ xp, level }) => {
  hud.setXp(xp, level);
};

// ── Tab: scoreboard (other players only, sorted by kills) ──────────
document.addEventListener('keydown', (e) => {
  if (e.code === 'Tab') {
    e.preventDefault();
    const sorted = [...network.getRemotePlayers()].sort((a, b) => (b.kills || 0) - (a.kills || 0));
    hud.showScoreboard(sorted);
  }
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'Tab') hud.hideScoreboard();
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

  game.tickScope(dt);
  game.tickSpawnShield(camera);
  game.updateRemotePlayers(network.getRemotePlayers(), dt);
  game._tickVfx(dt);
  game.tickWeapon(dt);
  bullets.update(dt);
  bullets.updatePlayerHitboxes(network.getRemotePlayers());

  hud.tickFps(dt);
  hud.updateMinimap(camera.position, network.getRemotePlayers());

  game.renderer.clear();
  game.renderer.render(game.scene, camera);
  game.renderWeapon();
};

// ── Load map, then start game loop ─────────────────────────────────
const loadingText = document.getElementById('loadingText');
if (loadingText) loadingText.textContent = 'LOADING MAP...';

game.loadMap('/assets/maps/arena.glb', (map) => {
  // Wire up collidable meshes for movement + bullet collision
  game.controls.setCollidableMeshes(map.getCollidableMeshes());
  bullets.setCollidableMeshes(map.getCollidableMeshes());

  // Start the game loop only after the map is fully loaded
  game.start();
});
