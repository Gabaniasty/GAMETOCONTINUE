export class CharacterController {
  constructor(scene) {
    this._scene       = scene;
    this._mixer       = null;
    this._clips       = {};
    this._currentAction = null;
    this._model       = null;
    this._loaded      = false;
    this._dead        = false;
    this._shootTimer  = 0;
    this._pendingAnim = null;
  }

  async load(modelPath) {
    return new Promise((resolve, reject) => {
      const loader = new THREE.GLTFLoader();
      loader.load(
        modelPath,
        (gltf) => {
          this._model = gltf.scene;
          this._model.scale.setScalar(0.011);

          this._model.traverse((child) => {
            if (child.isMesh) {
              child.castShadow    = true;
              child.receiveShadow = true;
              const mats = Array.isArray(child.material) ? child.material : [child.material];
              mats.forEach((m) => {
                if (!m) return;
                m.emissive          = new THREE.Color(0x001133);
                m.emissiveIntensity = 0.2;
              });
            }
          });

          this._scene.add(this._model);

          this._mixer = new THREE.AnimationMixer(this._model);

          gltf.animations.forEach((clip) => {
            this._clips[clip.name.toLowerCase()] = clip;
          });

          this._loaded = true;
          if (this._pendingAnim) {
            const { name, options } = this._pendingAnim;
            this._pendingAnim = null;
            this._doPlay(name, options);
          } else {
            this._doPlay('idle', { loop: true });
          }

          resolve(this);
        },
        undefined,
        reject
      );
    });
  }

  _findClip(name) {
    const lower = name.toLowerCase();
    if (this._clips[lower]) return this._clips[lower];
    for (const key of Object.keys(this._clips)) {
      if (key.includes(lower) || lower.includes(key)) return this._clips[key];
    }
    return null;
  }

  _doPlay(name, options = {}) {
    if (!this._mixer || !this._loaded) {
      this._pendingAnim = { name, options };
      return;
    }

    const clip = this._findClip(name);
    if (!clip) return;

    const action = this._mixer.clipAction(clip);

    if (this._currentAction === action) return;

    action.loop             = options.loop === false ? THREE.LoopOnce : THREE.LoopRepeat;
    action.clampWhenFinished = options.loop === false;

    if (this._currentAction) {
      this._currentAction.fadeOut(0.2);
    }

    action.reset().fadeIn(0.2).play();
    this._currentAction = action;
  }

  playAnimation(name, options = {}) {
    this._doPlay(name, options);
  }

  update(delta) {
    if (this._mixer) this._mixer.update(delta);
    if (this._shootTimer > 0) this._shootTimer -= delta;
  }

  setPosition(x, y, z) {
    if (!this._model) return;
    this._model.position.set(x, (y || 1.65) - 1.65, z);
  }

  setRotation(rotY) {
    if (this._model) this._model.rotation.y = rotY || 0;
  }

  updateState(velocity, isShooting, isDead, isADS) {
    if (!this._loaded) return;

    if (isDead && !this._dead) {
      this._dead = true;
      this._doPlay('death', { loop: false });
      return;
    }
    if (this._dead) return;

    if (isShooting) this._shootTimer = 0.2;

    if (this._shootTimer > 0) {
      this._doPlay('shoot', { loop: false });
      return;
    }

    const vel  = velocity || { x: 0, y: 0, z: 0 };
    const hspd = Math.sqrt(vel.x * vel.x + vel.z * vel.z);

    if (hspd > 5) {
      this._doPlay('run',  { loop: true });
    } else if (hspd > 0.5) {
      this._doPlay('walk', { loop: true });
    } else {
      this._doPlay('idle', { loop: true });
    }
  }

  get sceneObject() { return this._model; }

  /**
   * Lerp all mesh materials toward the given opacity (0–1).
   * Called each frame by Game.js while the controller is dying.
   */
  setFade(opacity) {
    if (!this._model) return;
    this._model.traverse((child) => {
      if (!child.isMesh) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => {
        if (!m) return;
        m.transparent = true;
        m.opacity = Math.max(0, Math.min(1, opacity));
      });
    });
  }

  dispose() {
    if (this._mixer) {
      this._mixer.stopAllAction();
      this._mixer.uncacheRoot(this._model);
      this._mixer = null;
    }
    if (this._model) {
      this._scene.remove(this._model);
      this._model.traverse((child) => {
        if (child.isMesh) {
          child.geometry?.dispose();
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m) => m?.dispose());
        }
      });
      this._model = null;
    }
    this._loaded        = false;
    this._dead          = false;
    this._currentAction = null;
    this._clips         = {};
  }
}
