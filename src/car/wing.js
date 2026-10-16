import { ExtrudeGeometry, Group, Mesh, Shape } from "three";

// The deployable rear wing, shared by the procedural car and the GLB car.
// deckY is the height of the rear deck at z (body space). The game slides
// wing.position.y between userData.stowY (hidden in the deck) and upY.
function buildWing(material, deckY, z = -1.98) {
  const Z = new Group();
  Z.name = "Wing";
  const N = new Shape();
  N.moveTo(-0.1, 0),
    N.lineTo(0.06, 0),
    N.lineTo(0.02, 0.27),
    N.lineTo(-0.2, 0.31),
    N.lineTo(-0.2, 0.27),
    N.lineTo(-0.06, 0.24),
    N.closePath();
  const k = new ExtrudeGeometry(N, {
    depth: 0.012,
    bevelEnabled: !0,
    bevelSize: 0.004,
    bevelThickness: 0.004,
    bevelSegments: 1,
  });
  k.rotateY(Math.PI / 2);
  for (const Ce of [-1, 1]) {
    const Te = new Mesh(k, material);
    Te.position.set(Ce * 0.78 - 0.009, 0, 0), Z.add(Te);
  }
  const se = new Shape();
  se.moveTo(0.1, 0),
    se.quadraticCurveTo(-0.05, 0.045, -0.24, 0.03),
    se.lineTo(-0.24, 0.012),
    se.quadraticCurveTo(-0.05, 0.02, 0.1, 0);
  const te = new ExtrudeGeometry(se, {
    depth: 1.6,
    bevelEnabled: !1,
  });
  te.rotateY(Math.PI / 2), te.translate(-0.8, 0, 0);
  const Me = new Mesh(te, material);
  Me.position.set(0, 0.275, 0), Z.add(Me);
  for (const Ce of [-1, 1]) {
    const Te = new Shape();
    Te.moveTo(0.06, -0.3),
      Te.lineTo(0.12, -0.3),
      Te.quadraticCurveTo(0.1, 0.2, -0.02, 0.33),
      Te.lineTo(-0.1, 0.33),
      Te.quadraticCurveTo(0.03, 0.18, 0.06, -0.3);
    const Ye = new ExtrudeGeometry(Te, {
      depth: 0.022,
      bevelEnabled: !1,
    });
    Ye.rotateY(Math.PI / 2);
    const $ = new Mesh(Ye, material);
    $.position.set(Ce * 0.42 - 0.011, 0, 0), Z.add($);
  }
  Z.position.set(0, deckY - 0.34, z),
    (Z.userData = {
      stowY: deckY - 0.34,
      upY: deckY - 0.04,
    });
  return Z;
}

export { buildWing };
