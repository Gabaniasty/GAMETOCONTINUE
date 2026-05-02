export function buildCharacterModel(classColor) {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x0d0d22,
    emissive: classColor,
    emissiveIntensity: 0.4,
  });
  const lineMat = new THREE.LineBasicMaterial({
    color: classColor,
    transparent: true,
    opacity: 0.8,
  });

  function addPart(geo, x, y, z) {
    const mesh = new THREE.Mesh(geo, bodyMat.clone());
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);

    const edges = new THREE.EdgesGeometry(geo);
    const line  = new THREE.LineSegments(edges, lineMat.clone());
    line.position.set(x, y, z);
    group.add(line);
  }

  addPart(new THREE.BoxGeometry(0.5,  0.5,  0.5),   0,     1.5,  0);  // head
  addPart(new THREE.BoxGeometry(0.7,  0.8,  0.35),  0,     0.9,  0);  // torso
  addPart(new THREE.BoxGeometry(0.2,  0.6,  0.2),  -0.45,  0.9,  0);  // L arm
  addPart(new THREE.BoxGeometry(0.2,  0.6,  0.2),   0.45,  0.9,  0);  // R arm
  addPart(new THREE.BoxGeometry(0.28, 0.7,  0.28), -0.2,   0.25, 0);  // L leg
  addPart(new THREE.BoxGeometry(0.28, 0.7,  0.28),  0.2,   0.25, 0);  // R leg

  // Gun on right arm
  const gunGroup = new THREE.Group();
  const gunMat   = new THREE.MeshStandardMaterial({ color: 0x222233, emissive: 0x00f5ff, emissiveIntensity: 0.6 });
  const gunBody  = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.35), gunMat);
  const barrel   = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.2),  gunMat.clone());
  barrel.position.set(0, 0.03, -0.275);
  gunGroup.add(gunBody, barrel);
  gunGroup.position.set(0.45, 0.85, -0.2);
  group.add(gunGroup);

  return group;
}
