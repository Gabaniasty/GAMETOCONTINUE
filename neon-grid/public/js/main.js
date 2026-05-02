import { Game }         from './Game.js';
import { Network }      from './Network.js';
import { Hud }          from './Hud.js';
import { BulletSystem } from './BulletSystem.js';
import { SoundSystem }  from './SoundSystem.js';

console.log('NEON GRID client loaded');

const game    = new Game('gameCanvas');
const network = new Network();
const hud     = new Hud();
const bullets = new BulletSystem(game.scene);
const sound   = new SoundSystem();

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

  // Immediate client-side feedback
  sound.playGunshot();
  game.triggerRecoil();              // weapon scene muzzle flash handled here
  bullets.spawnBullet(origin, direction, game.camera);

  network.sendShoot(origin, direction);
};

// ── Combat network callbacks ────────────────────────────────────

// Our bullet hit someone
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

// We were hit
network.onDamaged = ({ shooterId, damage, newHp }) => {
  hud.setHp(newHp);
  sound.playTakeDamage();
};

// A kill happened
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

// A player respawned
network.onRespawned = ({ id, x, y, z, hp }) => {
  const localId = network.getLocalId();
  if (id === localId) {
    hud.hideDeathScreen();
    hud.setHp(hp);
    game.camera.position.set(x, y, z);
    game.yVelocity = 0;
    game.onGround  = true;
  }
};

// ── Patched game loop ───────────────────────────────────────────
game._animate = function () {
  requestAnimationFrame(() => game._animate());

  const dt = Math.min(game._clock.getDelta(), 0.05);
  const { controls, camera } = game;

  const speed = 8 * (controls.isSprinting() ? 1.5 : 1);
  const move  = controls.getMovementVector();
  camera.position.x += move.x * speed * dt;
  camera.position.z += move.z * speed * dt;
  game._clampToWalls(camera.position);

  if (controls.isJumping() && game.onGround) {
    game.yVelocity = game.JUMP_FORCE;
    game.onGround  = false;
  }
  if (!game.onGround) {
    game.yVelocity     += game.GRAVITY * dt;
    camera.position.y  += game.yVelocity * dt;
    if (camera.position.y <= game.FLOOR_Y) {
      camera.position.y = game.FLOOR_Y;
      game.yVelocity    = 0;
      game.onGround     = true;
    }
  }

  controls.applyToCamera();
  game.updateRemotePlayers(network.getRemotePlayers());
  game._tickVfx(dt);
  game.tickWeapon(dt);
  bullets.update(dt);

  game.renderer.clear();
  game.renderer.render(game.scene, camera);
  game.renderWeapon();
};

game.start();
