const BODY  = 0x1a1a2e;
const METAL = 0x2a2a3e;
const EMISS = { SOLDIER: 0x00f5ff, GHOST: 0xff2d78, WRAITH: 0x7b2fff };

function mat(color, emissive = 0, intensity = 0) {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity });
}

function add(group, geo, material, x, y, z, rotX = 0, ec) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  if (rotX) mesh.rotation.x = rotX;
  group.add(mesh);

  if (ec !== undefined) {
    const el = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: ec, transparent: true, opacity: 0.4 })
    );
    el.position.set(x, y, z);
    if (rotX) el.rotation.x = rotX;
    group.add(el);
  }
  return mesh;
}

function buildAK47() {
  const g = new THREE.Group();
  const ec = EMISS.SOLDIER;

  add(g, new THREE.BoxGeometry(0.055, 0.07, 0.32),  mat(BODY, ec, 0.15),       0,      0,      -0.05,  0,    ec);
  add(g, new THREE.BoxGeometry(0.022, 0.022, 0.28), mat(METAL, ec, 0.3),       0,      0.015,  -0.32,  0,    ec);
  add(g, new THREE.BoxGeometry(0.032, 0.032, 0.04), mat(METAL),                0,      0.015,  -0.46,  0,    ec);
  add(g, new THREE.BoxGeometry(0.04, 0.038, 0.16),  mat(0x3d1a00),             0,      -0.012, -0.22,  0,    ec);
  add(g, new THREE.BoxGeometry(0.015, 0.015, 0.18), mat(METAL),                0,      0.04,   -0.22,  0,    ec);
  // Curved magazine (3 stacked boxes)
  add(g, new THREE.BoxGeometry(0.038, 0.07, 0.055), mat(BODY),                 0,      -0.085, -0.04,  0,    ec);
  add(g, new THREE.BoxGeometry(0.035, 0.04, 0.048), mat(BODY),                 0,      -0.13,  -0.03,  0.12, ec);
  add(g, new THREE.BoxGeometry(0.032, 0.025, 0.04), mat(BODY),                 0,      -0.16,  -0.01,  0.2,  ec);
  // Pistol grip
  add(g, new THREE.BoxGeometry(0.038, 0.075, 0.045), mat(0x1a0a00),            0,      -0.075,  0.06,  0.2,  ec);
  // Stock
  add(g, new THREE.BoxGeometry(0.038, 0.042, 0.19), mat(0x3d1a00),             0,       0.005,  0.18,  0,    ec);
  add(g, new THREE.BoxGeometry(0.038, 0.065, 0.02), mat(0x3d1a00),             0,      -0.02,   0.27,  0,    ec);
  // Iron sights
  add(g, new THREE.BoxGeometry(0.008, 0.025, 0.008), mat(METAL),               0,       0.055, -0.38,  0,    ec);
  add(g, new THREE.BoxGeometry(0.01, 0.018, 0.008),  mat(METAL),              -0.006,   0.052,  0.01,  0,    ec);
  add(g, new THREE.BoxGeometry(0.01, 0.018, 0.008),  mat(METAL),               0.006,   0.052,  0.01,  0,    ec);
  // Neon accent strip
  add(g, new THREE.BoxGeometry(0.004, 0.004, 0.28), mat(ec, ec, 0.9),          0.028,   0,     -0.05,  0,    ec);

  return g;
}

function buildSMG() {
  const g = new THREE.Group();
  const ec = EMISS.GHOST;

  add(g, new THREE.BoxGeometry(0.055, 0.072, 0.22),  mat(BODY, ec, 0.15),  0,     0,      -0.02, 0,    ec);
  add(g, new THREE.BoxGeometry(0.02, 0.02, 0.15),    mat(METAL, ec, 0.4),  0,     0.016,  -0.195,0,    ec);
  add(g, new THREE.BoxGeometry(0.03, 0.03, 0.025),   mat(METAL),           0,     0.016,  -0.27, 0,    ec);
  add(g, new THREE.BoxGeometry(0.048, 0.04, 0.12),   mat(BODY),            0,    -0.01,   -0.14, 0,    ec);
  // Vent cuts
  [-0.11, -0.14, -0.17].forEach(z =>
    add(g, new THREE.BoxGeometry(0.05, 0.006, 0.012), mat(0x080810),        0,    -0.01,    z,    0,    ec));
  // Magazine
  add(g, new THREE.BoxGeometry(0.04, 0.1, 0.042),    mat(BODY),            0,    -0.1,    -0.01, 0,    ec);
  // Grip
  add(g, new THREE.BoxGeometry(0.042, 0.072, 0.044), mat(0x100820),        0,    -0.075,   0.07, 0.15, ec);
  // Wire stock
  add(g, new THREE.BoxGeometry(0.008, 0.008, 0.15),  mat(METAL),          -0.018, 0.01,    0.16, 0,    ec);
  add(g, new THREE.BoxGeometry(0.008, 0.008, 0.15),  mat(METAL),           0.018, 0.01,    0.16, 0,    ec);
  add(g, new THREE.BoxGeometry(0.044, 0.008, 0.008), mat(METAL),           0,     0.01,    0.23, 0,    ec);
  // Dual neon stripes
  add(g, new THREE.BoxGeometry(0.004, 0.004, 0.20),  mat(ec, ec, 1.0),     0.028, 0.012,  -0.02, 0,    ec);
  add(g, new THREE.BoxGeometry(0.004, 0.004, 0.20),  mat(ec, ec, 1.0),    -0.028, 0.012,  -0.02, 0,    ec);

  return g;
}

function buildSniper() {
  const g = new THREE.Group();
  const ec = EMISS.WRAITH;

  add(g, new THREE.BoxGeometry(0.055, 0.068, 0.28),  mat(BODY, ec, 0.15),  0,     0,       0.02,  0,    ec);
  add(g, new THREE.BoxGeometry(0.02, 0.02, 0.46),    mat(METAL, ec, 0.25), 0,     0.016,  -0.31,  0,    ec);
  add(g, new THREE.BoxGeometry(0.036, 0.028, 0.045), mat(METAL),           0,     0.016,  -0.535, 0,    ec);
  // Scope body
  add(g, new THREE.BoxGeometry(0.032, 0.032, 0.18),  mat(0x111120),        0,     0.065,  -0.04,  0,    ec);
  // Scope lenses
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x001133, emissive: 0x0033ff, emissiveIntensity: 0.8 });
  const lf = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.01, 12), lensMat);
  lf.rotation.x = Math.PI / 2; lf.position.set(0, 0.065, -0.13); g.add(lf);
  const lr = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.01, 12), lensMat.clone());
  lr.rotation.x = Math.PI / 2; lr.position.set(0, 0.065,  0.05); g.add(lr);
  // Scope mounts
  add(g, new THREE.BoxGeometry(0.05, 0.018, 0.022),  mat(METAL),           0,     0.048, -0.11,   0,    ec);
  add(g, new THREE.BoxGeometry(0.05, 0.018, 0.022),  mat(METAL),           0,     0.048,  0.03,   0,    ec);
  // Bolt handle + knob
  const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.055), mat(METAL));
  bolt.position.set(0.04, 0.008, 0.06); bolt.rotation.z = -0.5; g.add(bolt);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 6), mat(METAL));
  knob.position.set(0.062, 0.026, 0.06); g.add(knob);
  // Handguard + stock
  add(g, new THREE.BoxGeometry(0.042, 0.038, 0.2),   mat(0x2a1a0a),        0,    -0.01,  -0.18,   0,    ec);
  add(g, new THREE.BoxGeometry(0.04, 0.048, 0.28),   mat(0x2a1a0a),        0,    -0.004,  0.22,   0,    ec);
  add(g, new THREE.BoxGeometry(0.038, 0.025, 0.1),   mat(0x2a1a0a),        0,     0.035,  0.18,   0,    ec);
  // Bipod legs
  add(g, new THREE.BoxGeometry(0.008, 0.06, 0.008),  mat(METAL),          -0.022,-0.04,  -0.28,   0,    ec);
  add(g, new THREE.BoxGeometry(0.008, 0.06, 0.008),  mat(METAL),           0.022,-0.04,  -0.28,   0,    ec);
  // Magazine + grip
  add(g, new THREE.BoxGeometry(0.036, 0.055, 0.038), mat(BODY),            0,    -0.075,  0.0,    0,    ec);
  add(g, new THREE.BoxGeometry(0.038, 0.078, 0.044), mat(0x1a0a00),        0,    -0.078,  0.1,    0.18, ec);
  // Scope rail accent
  add(g, new THREE.BoxGeometry(0.004, 0.004, 0.26),  mat(ec, ec, 0.8),     0.028, 0.04,  -0.02,   0,    ec);

  return g;
}

export function buildWeapon(className) {
  switch ((className || '').toUpperCase()) {
    case 'GHOST':  return buildSMG();
    case 'WRAITH': return buildSniper();
    default:       return buildAK47();
  }
}
