import { Game }         from './Game.js';
import { Network }      from './Network.js';
import { Hud }          from './Hud.js';
import { BulletSystem } from './BulletSystem.js';
import { SoundSystem }  from './SoundSystem.js';
import { CLASSES }      from './Classes.js';

const localClass = localStorage.getItem('ng_class') || 'SOLDIER';
const maxHp      = (CLASSES[localClass] || CLASSES.SOLDIER).hp;

const game    = new Game('gameCanvas');
const network = new Network();
const hud     = new Hud();
const bullets = new BulletSystem(game.scene);
const sound   = new SoundSystem();

// Set initial HP bar to class max
hud.setHp(maxHp, maxHp);

// ── Start sending position on connect ──────────────────────────
network._socket.on('connect', () => {
  network.startSendingPosition(game.camera);
});

// ── Shoot ───────────────────────────────────────────────────────
game.controls.onShoot = () => {
  const origin = {
    x: game.camera.position.x,
    y: game.camera.position.y,
    z: game.camera.position.z,
  };
  const dir3 = new THREE.Vector3(0, 0, -1).applyQuaternion(game.camera.quaternion);
  const direction = { x: dir3.x, y: dir3.y, z: dir3.z };

  sound.playGunshot();
  game.triggerRecoil();
  bullets.spawnBullet(origin, direction, game.camera);
  network.sendShoot(origin, direction);
};

// ── Combat callbacks ────────────────────────────────────────────

network.onHit = ({ targetId, damage, newHp }) => {
  hud.flashHit();
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

network.onKilled = ({ killerId, killerName, victimId, victimName }) => {
  hud.showKill(killerName, victimName);
  const localId = network.getLocalId();
  if (killerId === localId) {
    hud.showKillNotification();
    sound.playKill();
  }
  if (victimId === localId) {
    hud.showDeathScreen(3);
  }
};

network.onRespawned = ({ id, x, y, z, hp }) => {
  const localId = network.getLocalId();
  if (id === localId) {
    hud.hideDeathScreen();
    hud.setHp(hp, maxHp);
    game.camera.position.set(x, y, z);
    game.yVelocity = 0;
    game.onGround  = true;
  }
};

// XP updates from server after each kill
network.onXpUpdate = ({ xp, level }) => {
  hud.setXp(xp, level);
};

// ── Tab: scoreboard ─────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.code === 'Tab') {
    e.preventDefault();
    hud.showScoreboard(network.getRemotePlayers());
  }
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'Tab') hud.hideScoreboard();
});

// ── Patched game loop ───────────────────────────────────────────
game._animate = function () {
  requestAnimationFrame(() => game._animate());

  const dt = Math.min(game._clock.getDelta(), 0.05);
  const { controls, camera } = game;

  const speed = controls.getSpeed();
  const move  = controls.getMovementVector();
  camera.position.x += move.x * speed * dt;
  camera.position.z += move.z * speed * dt;
  game._clampToWalls(camera.position);

  if (controls.isJumping() && game.onGround) {
    game.yVelocity = game.JUMP_FORCE;
    game.onGround  = false;
  }
  if (!game.onGround) {
    game.yVelocity    += game.GRAVITY * dt;
    camera.position.y += game.yVelocity * dt;
    if (camera.position.y <= game.FLOOR_Y) {
      camera.position.y = game.FLOOR_Y;
      game.yVelocity    = 0;
      game.onGround     = true;
    }
  }

  controls.applyToCamera();
  game.updateRemotePlayers(network.getRemotePlayers(), dt);
  game._tickVfx(dt);
  game.tickWeapon(dt);
  bullets.update(dt);

  // HUD updates
  hud.tickFps(dt);
  hud.updateMinimap(camera.position, network.getRemotePlayers());

  game.renderer.clear();
  game.renderer.render(game.scene, camera);
  game.renderWeapon();
};

game.start();
