import { Game } from './Game.js';
import { Network } from './Network.js';

console.log('NEON GRID client loaded');

const game = new Game('gameCanvas');
const network = new Network();

// Start sending position updates once socket connects
network._socket.on('connect', () => {
  network.startSendingPosition(game.camera);
});

// Wire shoot event
game.controls.onShoot = () => {
  const origin = {
    x: game.camera.position.x,
    y: game.camera.position.y,
    z: game.camera.position.z,
  };
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(game.camera.quaternion);
  network.sendShoot(origin, { x: dir.x, y: dir.y, z: dir.z });
};

// Patch the game loop to update remote players each frame
const _origAnimate = game._animate.bind(game);
game._animate = function () {
  requestAnimationFrame(() => game._animate());

  const dt = Math.min(game._clock.getDelta(), 0.05);
  const { controls, camera } = game;

  const BASE_SPEED = 8;
  const speed = BASE_SPEED * (controls.isSprinting() ? 1.5 : 1);
  const move = controls.getMovementVector();
  camera.position.x += move.x * speed * dt;
  camera.position.z += move.z * speed * dt;

  game._clampToWalls(camera.position);

  if (controls.isJumping() && game.onGround) {
    game.yVelocity = game.JUMP_FORCE;
    game.onGround = false;
  }

  if (!game.onGround) {
    game.yVelocity += game.GRAVITY * dt;
    camera.position.y += game.yVelocity * dt;

    if (camera.position.y <= game.FLOOR_Y) {
      camera.position.y = game.FLOOR_Y;
      game.yVelocity = 0;
      game.onGround = true;
    }
  }

  controls.applyToCamera();

  // Update remote player meshes
  game.updateRemotePlayers(network.getRemotePlayers());

  game.renderer.render(game.scene, game.camera);
};

game.start();
