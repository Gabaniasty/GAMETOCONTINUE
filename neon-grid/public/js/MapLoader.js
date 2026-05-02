export class MapLoader {
  constructor(scene) {
    this.scene            = scene;
    this.collidableMeshes = [];
    this.spawnPoints      = [];
    this.loaded           = false;
  }

  load(path, onReady) {
    const loader = new THREE.GLTFLoader();
    loader.load(
      path,
      (gltf) => {
        const model = gltf.scene;

        // Scale and center — longest axis = 80 units, floor at y = 0
        const box    = new THREE.Box3().setFromObject(model);
        const size   = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale  = 80 / maxDim;

        model.scale.setScalar(scale);
        model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

        this.scene.add(model);

        // ── CRITICAL: update world matrices NOW so raycasts are correct ──
        // Without this, every mesh's matrixWorld is still an identity matrix
        // and all collision rays miss until after the very first render pass.
        model.updateMatrixWorld(true);

        // Apply cyberpunk material overrides + collect collidable meshes
        model.traverse((child) => {
          if (!child.isMesh) return;

          const origMap = child.material ? child.material.map : null;
          child.material = new THREE.MeshStandardMaterial({
            map:               origMap || null,
            color:             origMap ? 0xffffff : 0x0d2035,
            emissive:          new THREE.Color(0x001a44),
            emissiveIntensity: 0.55,
            roughness:         0.8,
            metalness:         0.3,
          });

          // Neon edge outline — visible at 0.6 opacity (was 0.08 = invisible)
          const edges = new THREE.EdgesGeometry(child.geometry);
          const line  = new THREE.LineSegments(
            edges,
            new THREE.LineBasicMaterial({ color: 0x00f5ff, opacity: 0.6, transparent: true })
          );
          child.add(line);

          child.castShadow    = true;
          child.receiveShadow = true;

          child.userData.isMapGeometry = true;
          this.collidableMeshes.push(child);
        });

        this.loaded = true;

        // Progress bar to 100%
        const fill = document.getElementById('loadingFill');
        if (fill) fill.style.width = '100%';

        this._addAtmosphere();

        const scaledBox = new THREE.Box3().setFromObject(model);
        this.spawnPoints = this._generateSpawnPoints(scaledBox);

        // Fade out loading screen
        const screen = document.getElementById('loadingScreen');
        if (screen) {
          screen.style.transition = 'opacity 0.6s ease';
          screen.style.opacity    = '0';
          setTimeout(() => { screen.style.display = 'none'; }, 650);
        }

        if (onReady) onReady(this);
      },
      (progress) => {
        if (!progress.total) return;
        const pct  = Math.round((progress.loaded / progress.total) * 100);
        const fill = document.getElementById('loadingFill');
        const text = document.getElementById('loadingText');
        if (fill) fill.style.width  = pct + '%';
        if (text) text.textContent  = `LOADING MAP... ${pct}%`;
      },
      (error) => {
        console.error('Map load failed:', error);
        const text = document.getElementById('loadingText');
        if (text) text.textContent = 'MAP LOAD FAILED — check console';
      }
    );
  }

  _generateSpawnPoints(box) {
    const mx = box.min.x + (box.max.x - box.min.x) * 0.2;
    const px = box.min.x + (box.max.x - box.min.x) * 0.8;
    const mz = box.min.z + (box.max.z - box.min.z) * 0.2;
    const pz = box.min.z + (box.max.z - box.min.z) * 0.8;
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    const y  = 1.6;
    return [
      new THREE.Vector3(mx, y, mz), new THREE.Vector3(px, y, mz),
      new THREE.Vector3(mx, y, pz), new THREE.Vector3(px, y, pz),
      new THREE.Vector3(cx, y, mz), new THREE.Vector3(cx, y, pz),
      new THREE.Vector3(mx, y, cz), new THREE.Vector3(px, y, cz),
    ];
  }

  _addAtmosphere() {
    // Fog
    this.scene.fog = new THREE.FogExp2(0x02020a, 0.018);

    // Hemisphere — sky tint from above, dark ground below
    const hemi = new THREE.HemisphereLight(0x0055aa, 0x001122, 1.5);
    this.scene.add(hemi);

    // Ambient — must be bright enough to see geometry in shadow
    this.scene.add(new THREE.AmbientLight(0x223355, 5));

    // Overhead fill light so the floor is always lit
    const fill = new THREE.DirectionalLight(0x334466, 1.5);
    fill.position.set(0, 20, 0);
    fill.target.position.set(0, 0, 0);
    this.scene.add(fill);
    this.scene.add(fill.target);

    // Coloured neon point lights spread around the arena
    const lights = [
      { color: 0x00f5ff, pos: [-15, 6, -15], intensity: 10 },
      { color: 0x00f5ff, pos: [ 15, 6,  15], intensity: 10 },
      { color: 0xff2d78, pos: [ 15, 6, -15], intensity: 10 },
      { color: 0xff2d78, pos: [-15, 6,  15], intensity: 10 },
      { color: 0x7b2fff, pos: [  0, 8,   0], intensity: 14 },
      // Extra mid-range fill lights
      { color: 0x00aaff, pos: [-30, 5,   0], intensity: 7 },
      { color: 0x00aaff, pos: [ 30, 5,   0], intensity: 7 },
      { color: 0xff4499, pos: [  0, 5, -30], intensity: 7 },
      { color: 0xff4499, pos: [  0, 5,  30], intensity: 7 },
    ];
    lights.forEach(({ color, pos, intensity }) => {
      const light = new THREE.PointLight(color, intensity, 40);
      light.position.set(...pos);
      this.scene.add(light);
    });
  }

  getCollidableMeshes() { return this.collidableMeshes; }
  getSpawnPoints()      { return this.spawnPoints; }
}
