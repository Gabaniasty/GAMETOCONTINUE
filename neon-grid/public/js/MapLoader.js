export class MapLoader {
  constructor(scene) {
    this.scene           = scene;
    this.collidableMeshes = [];
    this.spawnPoints     = [];
    this.loaded          = false;
  }

  load(path, onReady) {
    const loader = new THREE.GLTFLoader();
    loader.load(
      path,
      (gltf) => {
        const model = gltf.scene;

        // Scale and center to fit the game world (longest axis = 80 units)
        const box    = new THREE.Box3().setFromObject(model);
        const size   = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale  = 80 / maxDim;

        model.scale.setScalar(scale);
        model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

        // Apply cyberpunk material overrides + collect collidable meshes
        model.traverse((child) => {
          if (!child.isMesh) return;

          const origMap = child.material ? child.material.map : null;
          child.material = new THREE.MeshStandardMaterial({
            map:               origMap || null,
            color:             origMap ? 0xffffff : 0x0d1a2a,
            emissive:          new THREE.Color(0x001133),
            emissiveIntensity: 0.15,
            roughness:         0.85,
            metalness:         0.2,
          });

          const edges = new THREE.EdgesGeometry(child.geometry);
          const line  = new THREE.LineSegments(
            edges,
            new THREE.LineBasicMaterial({ color: 0x00f5ff, opacity: 0.08, transparent: true })
          );
          child.add(line);

          child.castShadow    = true;
          child.receiveShadow = true;

          child.userData.isMapGeometry = true;
          this.collidableMeshes.push(child);
        });

        this.scene.add(model);
        this.loaded = true;

        // Update progress bar to 100%
        const fill = document.getElementById('loadingFill');
        if (fill) fill.style.width = '100%';

        this._addAtmosphere();

        // Extract spawn points from the loaded model's bounding box
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
    this.scene.fog = new THREE.FogExp2(0x02020a, 0.022);
    this.scene.add(new THREE.AmbientLight(0x080818, 0.9));

    const lights = [
      { color: 0x00f5ff, pos: [-15, 6, -15] },
      { color: 0x00f5ff, pos: [ 15, 6,  15] },
      { color: 0xff2d78, pos: [ 15, 6, -15] },
      { color: 0xff2d78, pos: [-15, 6,  15] },
      { color: 0x7b2fff, pos: [  0, 8,   0] },
    ];
    lights.forEach(({ color, pos }) => {
      const light = new THREE.PointLight(color, 3, 28);
      light.position.set(...pos);
      this.scene.add(light);
    });
  }

  getCollidableMeshes() { return this.collidableMeshes; }
  getSpawnPoints()      { return this.spawnPoints; }
}
