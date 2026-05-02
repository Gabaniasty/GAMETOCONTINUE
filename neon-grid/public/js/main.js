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

// ── Start sending position on connect ──────────────────────────────
network._socket.on('connect', () => {
  network.startSendingPosition(game.camera);
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
  bullets.spawnBullet(origin, direction, game.camera);
  network.sendShoot(origin, direction);
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
    // Zero out velocity so player doesn't fly off at respawn
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

// ── Tab: scoreboard ────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.code === 'Tab') {
    e.preventDefault();
    hud.showScoreboard(network.getRemotePlayers());
  }
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'Tab') hud.hideScoreboard();
});

// ── Patched game loop ──────────────────────────────────────────────
game._animate = function () {
  requestAnimationFrame(() => game._animate());

  const dt = Math.min(game._clock.getDelta(), 0.05);
  const { controls, camera } = game;

  // Velocity-based movement (includes gravity, jump, crouch, head bob)
  controls.update(camera, dt);
  game._clampToWalls(camera.position);
  controls.applyToCamera();

  // Spawn protection shield tracks camera
  game.tickSpawnShield(camera);

  game.updateRemotePlayers(network.getRemotePlayers(), dt);
  game._tickVfx(dt);
  game.tickWeapon(dt);
  bullets.update(dt);

  hud.tickFps(dt);
  hud.updateMinimap(camera.position, network.getRemotePlayers());

  game.renderer.clear();
  game.renderer.render(game.scene, camera);
  game.renderWeapon();
};

game.start();
