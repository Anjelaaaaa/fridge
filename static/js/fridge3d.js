// 3D-холодильник для hero. Подключение: <script type="module" src="/static/js/fridge3d.js"></script>
// Ищет <canvas id="fridge3d">. Клик по дверце/ящику — открывает/закрывает.
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export function mountFridge(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x24324a, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(4, 7, 6); scene.add(key);
  const rim = new THREE.PointLight(0x5b93ff, 50, 30); rim.position.set(-6, 3, -1); scene.add(rim);
  const fill = new THREE.PointLight(0x1e5eff, 14, 25); fill.position.set(4, -3, 5); scene.add(fill);

  const M = {
    body: new THREE.MeshPhysicalMaterial({ color: 0xf2f4f7, metalness: 0.05, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    door: new THREE.MeshPhysicalMaterial({ color: 0xf7f8fa, metalness: 0.05, roughness: 0.22, clearcoat: 0.9, clearcoatRoughness: 0.12 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x141a22, metalness: 0.8, roughness: 0.3 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0xe4e8ee, roughness: 0.85 }),
    white: new THREE.MeshStandardMaterial({ color: 0xeef2f7, roughness: 0.65 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe3e9f0, metalness: 0.35, roughness: 0.3 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xcfe6ff, roughness: 0.04, transparent: true, opacity: 0.35, depthWrite: false }),
    frost: new THREE.MeshPhysicalMaterial({ color: 0xdfeeff, roughness: 0.4, transparent: true, opacity: 0.6 }),
    led: new THREE.MeshBasicMaterial({ color: 0xbfe0ff }),
    blue: new THREE.MeshBasicMaterial({ color: 0x5b93ff }),
    screen: new THREE.MeshBasicMaterial({ color: 0x07101c }),
  };
  const box = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); return b; };
  const cyl = (r, h, x, y, z, m, seg = 20) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m); b.position.set(x, y, z); return b; };
  const rrect = (w, h, r) => {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
  };
  const slab = (w, h, d, r, mat, bevel = 0.025) => {
    const g = new THREE.ExtrudeGeometry(rrect(w, h, r), { depth: d, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 10 });
    g.translate(0, 0, -d / 2); return new THREE.Mesh(g, mat);
  };

  // размеры
  const W = 2.4, H = 5.4, D = 1.8, F = D / 2, wall = 0.1, split = -1.2; // split — верх морозилки
  const fridge = new THREE.Group();

  // корпус
  const shell = new THREE.Group();
  shell.add(box(W, H, wall, 0, 0, -F + wall / 2, M.body));
  shell.add(box(wall, H, D, -W / 2 + wall / 2, 0, 0, M.body));
  shell.add(box(wall, H, D, W / 2 - wall / 2, 0, 0, M.body));
  shell.add(box(W, wall, D, 0, H / 2 - wall / 2, 0, M.body));
  shell.add(box(W, wall, D, 0, -H / 2 + wall / 2, 0, M.body));
  shell.add(box(W, 0.08, D, 0, split, 0, M.body));
  fridge.add(shell);

  // внутреннее пространство холодильника
  const iw = W - wall * 2, idp = D - wall, topH = H / 2 - split - wall;
  const inner = new THREE.Group();
  inner.add(box(iw, topH, 0.02, 0, split + topH / 2 + 0.04, -F + wall + 0.01, M.white));
  inner.add(box(0.02, topH, idp, -iw / 2 + 0.01, split + topH / 2 + 0.04, wall / 2, M.white));
  inner.add(box(0.02, topH, idp, iw / 2 - 0.01, split + topH / 2 + 0.04, wall / 2, M.white));
  inner.add(box(iw, 0.02, idp, 0, H / 2 - wall - 0.01, wall / 2, M.white));
  // LED-линии по бокам + сверху
  inner.add(box(0.025, topH - 0.4, 0.025, -iw / 2 + 0.04, split + topH / 2 + 0.05, F - 0.28, M.led));
  inner.add(box(0.025, topH - 0.4, 0.025, iw / 2 - 0.04, split + topH / 2 + 0.05, F - 0.28, M.led));
  inner.add(box(iw - 0.3, 0.02, 0.02, 0, H / 2 - wall - 0.03, F - 0.35, M.led));
  const innerLight = new THREE.PointLight(0xcfe3ff, 0, 5); innerLight.position.set(0, 0.6, 0.2); inner.add(innerLight);
  // стеклянные полки с хром-кромкой
  const shelfY = [1.7, 0.85, 0.0];
  shelfY.forEach(y => {
    inner.add(box(iw - 0.04, 0.025, idp - 0.3, 0, y, wall / 2 - 0.1, M.glass));
    inner.add(box(iw - 0.04, 0.035, 0.03, 0, y, F - 0.28, M.chrome));
  });
  // ящики для овощей (2 шт) внизу камеры
  [-0.55, 0.55].forEach(x => {
    inner.add(box(iw / 2 - 0.1, 0.55, idp - 0.4, x, split + 0.36, wall / 2 - 0.12, M.frost));
    inner.add(box(iw / 2 - 0.2, 0.05, 0.05, x, split + 0.6, F - 0.3, M.chrome));
  });
  // ---- продукты ----
  const food = (c, r = 0.5) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const glassy = (c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.08, transparent: true, opacity: 0.92 });
  const sph = (r, x, y, z, m, sx = 1, sy = 1, sz = 1) => { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), m); s.position.set(x, y, z); s.scale.set(sx, sy, sz); return s; };
  const grp = (x, y, z, ...kids) => { const g = new THREE.Group(); g.position.set(x, y, z); kids.forEach(k => g.add(k)); return g; };
  // текстура-этикетка с текстом
  const labelTex = (text, bg, fg = '#ffffff', accent = null) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
    if (accent) { g.fillStyle = accent; g.fillRect(0, 200, 512, 56); g.fillRect(0, 0, 512, 22); }
    g.fillStyle = fg; g.fillRect(96, 100, 320, 12); g.fillRect(150, 130, 212, 8);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  };
  const labelMat = (text, bg, fg, accent) => new THREE.MeshStandardMaterial({ map: labelTex(text, bg, fg, accent), roughness: 0.6 });
  // пакет молока с крышей и этикеткой
  const milk = (x, y, z, c = 0x2f6fff, text = 'МОЛОКО') => {
    const hex = '#' + c.toString(16).padStart(6, '0');
    const side = labelMat(text, '#ffffff', hex, hex), plain = food(0xffffff, 0.6);
    const bodyM = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.5, 0.26), [plain, plain, plain, plain, side, plain]); bodyM.position.y = 0.25;
    const g = grp(x, y, z, bodyM);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.0, 0.185, 0.14, 4, 1), plain); roof.rotation.y = Math.PI / 4; roof.position.y = 0.57; roof.scale.z = 0.7; g.add(roof);
    g.add(box(0.27, 0.02, 0.02, 0, 0.64, 0, plain));
    g.add(cyl(0.035, 0.03, 0, 0.62, 0.06, food(c), 12)); return g;
  };
  // бутылка с этикеткой и рифлёной крышкой
  const bottle = (x, y, z, liquid, label = 0xffffff, h = 0.5, r = 0.08, text = 'СОК') => {
    const hex = '#' + label.toString(16).padStart(6, '0'), lq = '#' + liquid.toString(16).padStart(6, '0');
    const lab = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.06, r * 1.06, h * 0.34, 24, 1, true), labelMat(text, hex, lq, lq)); lab.position.y = h * 0.42; lab.rotation.y = Math.PI / 2;
    return grp(x, y, z,
      cyl(r, h, 0, h / 2, 0, glassy(liquid), 24), lab,
      (() => { const n = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.4, r, h * 0.16, 24), glassy(liquid)); n.position.y = h + h * 0.08; return n; })(),
      cyl(r * 0.42, 0.05, 0, h + h * 0.16 + 0.025, 0, food(0x1a1a1a, 0.4), 16),
      cyl(r * 0.45, 0.012, 0, h + h * 0.16 + 0.056, 0, food(0x1a1a1a, 0.4), 16));
  };
  // банка с крышкой и этикеткой
  const jar = (x, y, z, content, lid = 0xb8860b, h = 0.3, r = 0.13, text = 'ДЖЕМ') => {
    const lq = '#' + content.toString(16).padStart(6, '0');
    const lab = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.06, r * 1.06, h * 0.36, 26, 1, true), labelMat(text, '#fffaf0', lq, lq)); lab.position.y = h * 0.5; lab.rotation.y = Math.PI / 2;
    const lidM = new THREE.MeshStandardMaterial({ color: lid, metalness: 0.75, roughness: 0.3 });
    return grp(x, y, z, cyl(r, h, 0, h / 2, 0, glassy(content), 26), lab,
      cyl(r * 0.95, 0.045, 0, h + 0.022, 0, lidM, 26), cyl(r * 0.8, 0.012, 0, h + 0.05, 0, lidM, 26));
  };
  // яблоко с листиком / апельсин с пупком
  const apple = (x, y, z, c) => grp(x, y, z, sph(0.12, 0, 0.11, 0, food(c, 0.3), 1, 0.9, 1), sph(0.05, 0, 0.2, 0, food(c, 0.3), 1, 0.4, 1),
    cyl(0.01, 0.07, 0, 0.24, 0, food(0x4a3320), 8),
    (() => { const l = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), food(0x3fae5a, 0.7)); l.scale.set(1.6, 0.25, 0.8); l.position.set(0.05, 0.25, 0); l.rotation.z = 0.4; return l; })());
  const orange = (x, y, z) => grp(x, y, z, sph(0.12, 0, 0.12, 0, food(0xff8c2a, 0.85)), cyl(0.02, 0.006, 0, 0.243, 0, food(0x3fae5a, 0.8), 10));
  // лоток яиц с ячейками
  const eggs = (x, y, z) => {
    const g = grp(x, y, z, box(0.62, 0.05, 0.34, 0, 0.025, 0, food(0xd9d0c4, 0.95)));
    for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) {
      g.add(cyl(0.048, 0.05, -0.25 + i * 0.1, 0.075, -0.08 + j * 0.16, food(0xcfc6b9, 0.95), 14));
      g.add(sph(0.05, -0.25 + i * 0.1, 0.11, -0.08 + j * 0.16, food(i % 2 ? 0xf6efe4 : 0xe9d3b7, 0.55), 1, 1.3, 1));
    }
    return g;
  };
  // йогурт с этикеткой и фольгой
  const yog = (x, y, z, c) => {
    const hex = '#' + c.toString(16).padStart(6, '0');
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.065, 0.16, 20), labelMat('', '#ffffff', hex, hex)); cup.position.y = 0.08;
    return grp(x, y, z, cup, cyl(0.088, 0.012, 0, 0.166, 0, new THREE.MeshStandardMaterial({ color: 0xd9dde3, metalness: 0.9, roughness: 0.25 }), 20),
      sph(0.02, 0, 0.11, 0.075, food(c, 0.5), 1, 1, 0.3));
  };
  // сыр с дырками
  const cheese = (x, y, z) => {
    const g = grp(x, y, z); const w = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 24, 1, false, 0, Math.PI / 2.4), food(0xffd75e, 0.6)); w.position.y = 0.06; w.rotation.y = -0.6; g.add(w);
    [[0.09, 0.03, 0.08], [0.14, 0.08, 0.02], [0.05, 0.09, 0.14], [0.17, 0.05, 0.1]].forEach(([px, py, pz]) => g.add(sph(0.018, px, py, pz, food(0xe0b840, 0.7))));
    const rind = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.12, 24, 1, true, 0, Math.PI / 2.4), food(0xf0b83a, 0.7)); rind.position.y = 0.06; rind.rotation.y = -0.6; g.add(rind);
    return g;
  };
  // контейнер с крышкой и ручкой-защёлкой
  const tub = (x, y, z, c, w = 0.42, h = 0.2, d = 0.3) => grp(x, y, z,
    box(w, h, d, 0, h / 2, 0, new THREE.MeshPhysicalMaterial({ color: 0xe8f2ff, roughness: 0.1, transparent: true, opacity: 0.6 })),
    box(w * 1.04, 0.035, d * 1.04, 0, h + 0.017, 0, food(c, 0.5)),
    box(w * 0.5, 0.012, d * 0.5, 0, h + 0.04, 0, food(c, 0.5)),
    box(0.04, 0.05, 0.02, w / 2 + 0.01, h - 0.01, 0, food(c, 0.5)), box(0.04, 0.05, 0.02, -w / 2 - 0.01, h - 0.01, 0, food(c, 0.5)));
  // салат — листья-полусферы
  const lettuce = (x, y, z) => {
    const g = grp(x, y, z);
    for (let i = 0; i < 7; i++) { const a = i * 0.9; const l = sph(0.11, Math.cos(a) * 0.05, 0.1 + i * 0.012, Math.sin(a) * 0.05, food([0x6bc453, 0x8ad66b, 0x5fb54a, 0xa2e07f][i % 4], 0.85), 1.25, 0.8, 1.1); l.rotation.set(Math.sin(a) * 0.4, a, Math.cos(a) * 0.4); g.add(l); }
    return g;
  };
  // морковь
  const carrot = (x, y, z, rot) => {
    const g = new THREE.Group(); g.position.set(x, y + 0.045, z); g.rotation.y = rot;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, 0.42, 14), food(0xf07a1f, 0.7)); body.rotation.z = Math.PI / 2; g.add(body);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), food(0xf07a1f, 0.7)); tip.position.x = 0.21; g.add(tip);
    [0.35, -0.35, 0].forEach((k, i) => { const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.14, 8), food(0x3fae5a, 0.8)); leaf.rotation.z = -Math.PI / 2 + k; leaf.position.set(0.31, k * 0.06, i * 0.02); g.add(leaf); });
    for (let i = 0; i < 4; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.031 + i * 0.006, 0.003, 6, 16), food(0xd8650f, 0.8)); ring.rotation.y = Math.PI / 2; ring.position.x = -0.12 + i * 0.09; g.add(ring); }
    return g;
  };
  // помидор с плодоножкой
  const tomato = (x, y, z) => grp(x, y, z, sph(0.09, 0, 0.085, 0, food(0xe83a2f, 0.3), 1, 0.9, 1),
    ...[0, 1.26, 2.51, 3.77, 5.03].map(a => { const l = sph(0.03, Math.cos(a) * 0.03, 0.165, Math.sin(a) * 0.03, food(0x3fae5a, 0.8), 1.4, 0.3, 0.6); l.rotation.y = -a; return l; }),
    cyl(0.008, 0.03, 0, 0.18, 0, food(0x3fae5a, 0.8), 8));
  // ---- раскладка в камере ----
  const zS = 0.05; // центр полки по z
  // верхняя полка (1.5)
  inner.add(milk(-0.78, 1.7, zS - 0.05));
  inner.add(milk(-0.5, 1.7, zS + 0.1, 0xff5c7a, 'КЕФИР'));
  inner.add(jar(-0.1, 1.7, zS + 0.05, 0xd42a2a, 0xc9a23a, 0.3, 0.13, 'ДЖЕМ'));
  inner.add(jar(0.22, 1.7, zS - 0.1, 0xffc93c, 0xb0b0b0, 0.24, 0.11, 'МЁД'));
  inner.add(tub(0.68, 1.7, zS, 0x1e5eff));
  // средняя полка (0.75)
  inner.add(eggs(-0.55, 0.85, zS));
  inner.add(cheese(0.1, 0.85, zS + 0.05));
  inner.add(yog(0.5, 0.85, zS + 0.12, 0xff6b6b)); inner.add(yog(0.68, 0.85, zS + 0.12, 0x5bc0eb)); inner.add(yog(0.59, 0.85, zS - 0.08, 0x8bd17c));
  inner.add(tub(0.5, 1.04, zS, 0xffffff, 0.34, 0.12, 0.26));
  // нижняя полка (0.0)
  inner.add(apple(-0.75, 0.0, zS, 0xd62839)); inner.add(apple(-0.5, 0.0, zS + 0.12, 0x7cc243)); inner.add(apple(-0.62, 0.0, zS - 0.15, 0xd62839));
  inner.add(orange(-0.18, 0.0, zS)); inner.add(orange(0.05, 0.0, zS + 0.12));
  inner.add(tub(0.55, 0.0, zS, 0xff8c2a, 0.5, 0.22, 0.36));
  inner.add(bottle(0.22, 0.0, zS - 0.15, 0xb8f0ff, 0x1e5eff, 0.6, 0.07));
  // ящики для овощей
  inner.add(lettuce(-0.7, split + 0.1, zS)); inner.add(tomato(-0.38, split + 0.1, zS + 0.1)); inner.add(tomato(-0.3, split + 0.1, zS - 0.12));
  inner.add(carrot(0.55, split + 0.1, zS + 0.1, 0.1)); inner.add(carrot(0.6, split + 0.1, zS - 0.05, -0.15)); inner.add(carrot(0.45, split + 0.19, zS, 0.05));
  fridge.add(inner);

  // морозильная камера (полость)
  const botH = split - (-H / 2 + wall) - 0.04;
  const freezer = new THREE.Group();
  freezer.add(box(iw, botH, 0.02, 0, -H / 2 + wall + botH / 2, -F + wall + 0.01, M.white));
  freezer.add(box(0.02, botH, idp, -iw / 2 + 0.01, -H / 2 + wall + botH / 2, wall / 2, M.white));
  freezer.add(box(0.02, botH, idp, iw / 2 - 0.01, -H / 2 + wall + botH / 2, wall / 2, M.white));
  const frzLight = new THREE.PointLight(0xcfe3ff, 0, 5, 1.2); frzLight.position.set(0, -H / 2 + wall + botH - 0.15, 0.55); freezer.add(frzLight);
  freezer.add(box(iw - 0.3, 0.02, 0.02, 0, -H / 2 + wall + botH - 0.08, F - 0.35, M.led));
  fridge.add(freezer);

  // ---- ДВЕРИ ----
  const controls = [];
  const gap = 0.05, dTh = 0.16;
  const doorW = W - gap * 2, doorH = H / 2 - split - gap * 2;
  const doorY = split + gap + doorH / 2;

  // одна широкая дверь, петля слева
  const dl = new THREE.Group(); dl.position.set(-W / 2, doorY, F);
  {
    const d = slab(doorW, doorH, dTh, 0.03, M.door, 0.012); d.position.set(W / 2, 0, dTh / 2); dl.add(d);
    const bx = W / 2;
    dl.add(box(doorW - 0.14, doorH - 0.14, 0.02, bx, 0, -0.006, M.white));
    // уплотнитель — рамка из четырёх брусков, выступает над панелью
    const rt = 0.06, rd = 0.035;
    dl.add(box(doorW - 0.04, rt, rd, bx, doorH / 2 - 0.02 - rt / 2, -rd / 2, M.rubber));
    dl.add(box(doorW - 0.04, rt, rd, bx, -doorH / 2 + 0.02 + rt / 2, -rd / 2, M.rubber));
    dl.add(box(rt, doorH - 0.04, rd, bx - doorW / 2 + 0.02 + rt / 2, 0, -rd / 2, M.rubber));
    dl.add(box(rt, doorH - 0.04, rd, bx + doorW / 2 - 0.02 - rt / 2, 0, -rd / 2, M.rubber));
    // дверные полки
    [-1.55, -0.55, 0.35, 1.25].forEach(y => {
      dl.add(box(doorW - 0.24, 0.03, 0.22, bx, y, -0.13, M.glass));
      dl.add(box(doorW - 0.24, 0.16, 0.015, bx, y + 0.09, -0.245, M.glass));
    });
    dl.add(bottle(bx - 0.8, -1.55, -0.13, 0x2f7bff, 0xffffff, 0.55, 0.075, 'ВОДА'));
    dl.add(bottle(bx - 0.5, -1.55, -0.13, 0xff9f1c, 0xfff2c9, 0.5, 0.075));
    dl.add(bottle(bx - 0.2, -1.55, -0.13, 0x3d9b45, 0xffffff, 0.6, 0.07, 'ЛИМОНАД'));
    dl.add(milk(bx + 0.25, -1.55, -0.13, 0x2f6fff, 'МОЛОКО'));
    dl.add(bottle(bx + 0.7, -1.55, -0.13, 0xb8f0ff, 0x1e5eff, 0.6, 0.07));
    dl.add(milk(bx - 0.7, -0.55, -0.13, 0x8bd17c, 'СЛИВКИ'));
    dl.add(jar(bx - 0.25, -0.55, -0.13, 0xf5e04a, 0xc0392b, 0.22, 0.1, 'ГОРЧИЦА'));
    dl.add(jar(bx + 0.1, -0.55, -0.13, 0xd42a2a, 0xc9a23a, 0.26, 0.11, 'КЕТЧУП'));
    dl.add(tub(bx + 0.62, -0.55, -0.13, 0xff6b6b, 0.36, 0.16, 0.18));
    dl.add(yog(bx - 0.75, 1.25, -0.13, 0xff6b6b)); dl.add(yog(bx - 0.55, 1.25, -0.13, 0x5bc0eb)); dl.add(yog(bx - 0.35, 1.25, -0.13, 0x8bd17c));
    dl.add(jar(bx + 0.2, 1.25, -0.13, 0x8e2a3c, 0xb8860b, 0.2, 0.09, 'ВАРЕНЬЕ'));
    dl.add(eggs(bx + 0.62, 1.25, -0.13));
    dl.add(tub(bx - 0.6, 0.35, -0.13, 0x5bc0eb, 0.4, 0.14, 0.18));
    dl.add(bottle(bx - 0.15, 0.35, -0.13, 0xffc93c, 0xffffff, 0.42, 0.06));
    dl.add(bottle(bx + 0.05, 0.35, -0.13, 0xd42a2a, 0xfff2c9, 0.4, 0.06));
    dl.add(jar(bx + 0.5, 0.35, -0.13, 0x8bd17c, 0xb0b0b0, 0.2, 0.09, 'СОУС'));
    // ручка — вертикальная у правого края
    const hx = W - gap - 0.2;
    const handle = cyl(0.025, doorH * 0.55, hx, 0, dTh + 0.07, M.dark, 14); dl.add(handle);
    [-1, 1].forEach(k => dl.add(box(0.03, 0.03, 0.08, hx, k * doorH * 0.26, dTh + 0.035, M.dark)));
    const disp = new THREE.Group(); dl.add(disp);
    // дисплей — вертикальная стеклянная панель по центру двери
    const sx = bx, sy = 0.55, sz = dTh + 0.03;
    const panel = slab(0.5, 1.5, 0.012, 0.06, new THREE.MeshPhysicalMaterial({ color: 0x0a1220, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.04 }), 0.004);
    panel.position.set(sx, sy, sz); disp.add(panel);
    const z2 = sz + 0.012, dim = new THREE.MeshBasicMaterial({ color: 0x2a4a78 }), lbl = new THREE.MeshBasicMaterial({ color: 0x3a5c8f });
    // семисегментная цифра
    const digit = (x, y, n, m = M.led, s = 0.055) => {
      const map = { 0: [1,1,1,1,1,1,0], 1: [0,1,1,0,0,0,0], 4: [0,1,1,0,0,1,1], 8: [1,1,1,1,1,1,1] }[n];
      const t = s * 0.22, hh = s;
      const segs = [[0, hh, s, t], [s / 2, hh / 2, t, hh], [s / 2, -hh / 2, t, hh], [0, -hh, s, t], [-s / 2, -hh / 2, t, hh], [-s / 2, hh / 2, t, hh], [0, 0, s, t]];
      segs.forEach(([dx, dy, w, h], i) => { if (map[i]) disp.add(box(w, h, 0.002, sx + x + dx, y + dy, z2, m)); });
    };
    const deg = (x, y, m) => disp.add(cyl(0.012, 0.002, sx + x, y, z2, m, 12).rotateX(Math.PI / 2));
    // верх: морозилка −18°
    disp.add(box(0.3, 0.008, 0.002, sx, sy + 0.62, z2, lbl));
    disp.add(box(0.05, 0.016, 0.002, sx - 0.14, sy + 0.45, z2, M.led));
    digit(-0.05, sy + 0.45, 1); digit(0.05, sy + 0.45, 8); deg(0.14, sy + 0.52, M.led);
    disp.add(box(0.18, 0.008, 0.002, sx, sy + 0.3, z2, lbl));
    // разделитель
    disp.add(box(0.34, 0.004, 0.002, sx, sy + 0.16, z2, dim));
    // середина: холодильник +4°
    disp.add(box(0.3, 0.008, 0.002, sx, sy + 0.03, z2, lbl));
    disp.add(box(0.05, 0.016, 0.002, sx - 0.14, sy - 0.14, z2, M.blue)); disp.add(box(0.016, 0.05, 0.002, sx - 0.14, sy - 0.14, z2, M.blue));
    digit(0.0, sy - 0.14, 4, M.blue); deg(0.1, sy - 0.07, M.blue);
    disp.add(box(0.18, 0.008, 0.002, sx, sy - 0.29, z2, lbl));
    disp.add(box(0.34, 0.004, 0.002, sx, sy - 0.4, z2, dim));
    // низ: сенсорные кнопки 2×2 (режимы)
    [[-0.09, -0.5], [0.09, -0.5], [-0.09, -0.64], [0.09, -0.64]].forEach(([x, y], i) => {
      disp.add(cyl(0.035, 0.002, sx + x, sy + y, z2, i === 0 ? M.blue : dim, 20).rotateX(Math.PI / 2));
      disp.add(cyl(0.028, 0.002, sx + x, sy + y, z2 + 0.001, new THREE.MeshBasicMaterial({ color: 0x0a1220 }), 20).rotateX(Math.PI / 2));
      disp.add(box(0.02, 0.02, 0.002, sx + x, sy + y, z2 + 0.002, i === 0 ? M.blue : lbl));
    });
    var digits = panel;
    disp.children.forEach(o => { o.position.x -= bx; o.position.y -= 0.55; });
    disp.scale.set(0.6, 0.6, 1); disp.position.set(bx, 0.5, 0);
    dl.traverse(o => { if (o.isMesh) o.userData.ctl = dl; });
    dl.userData = { open: false, cur: 0, target: 0, sign: -1, kind: 'door' };
    fridge.add(dl); controls.push(dl);
  }
  const dr = dl;

  // ---- МОРОЗИЛКА: распашная дверь + корзины внутри ----
  const frW = W - gap * 2, frH = split - 0.02 - (-H / 2 + gap);
  const frY = split - 0.02 - frH / 2;
  const basketMat = new THREE.MeshStandardMaterial({ color: 0xe6f0fa, transparent: true, opacity: 0.4, roughness: 0.25, depthWrite: false });
  const fy0 = -H / 2 + wall, bz = wall / 2 - 0.05, bw = iw - 0.16, bd = idp - 0.35;
  const basket = (y, h) => {
    const g = new THREE.Group(); g.position.set(0, y, bz);
    g.add(box(bw, 0.03, bd, 0, 0.015, 0, basketMat));
    g.add(box(bw, h, 0.03, 0, h / 2, -bd / 2, basketMat));
    g.add(box(0.03, h, bd, -bw / 2, h / 2, 0, basketMat));
    g.add(box(0.03, h, bd, bw / 2, h / 2, 0, basketMat));
    g.add(box(bw, h, 0.03, 0, h / 2, bd / 2, basketMat));
    g.add(box(bw, 0.04, 0.05, 0, h, bd / 2, M.chrome));          // фронтальная кромка
    g.add(box(0.5, 0.05, 0.06, 0, h - 0.06, bd / 2 + 0.02, M.chrome)); // ручка корзины
    return g;
  };
  const bh1 = botH * 0.29, bh2 = bh1, bh3 = bh1, step = botH * 0.315;
  const k1 = basket(fy0 + 0.04, bh1), k2 = basket(fy0 + 0.04 + step, bh2), k3 = basket(fy0 + 0.04 + step * 2, bh3);
  // направляющие
  [k1, k2, k3].forEach(k => [-1, 1].forEach(s => freezer.add(box(0.03, 0.03, bd, s * (bw / 2 + 0.03), k.position.y + 0.02, bz, M.chrome))));
  // содержимое
  const fyA = 0.03;
  const film = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.12 });
  const frostM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, transparent: true, opacity: 0.35 });
  // мягкий пакет (скруглённый) с цветной полосой и зажимом
  const bag = (x, z, w, h, d, c, band, rotY = 0) => {
    const g = grp(x, fyA, z); g.rotation.y = rotY;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(d / 2, h - d, 6, 14), food(c, 0.85)); body.scale.x = w / d; body.position.y = h / 2; g.add(body);
    const stripe = new THREE.Mesh(new THREE.CapsuleGeometry(d / 2 + 0.004, 0.08, 4, 14), food(band, 0.85)); stripe.scale.x = w / d; stripe.position.y = h * 0.6; g.add(stripe);
    g.add(box(w * 0.9, 0.025, 0.02, 0, h + 0.01, 0, food(0xffffff, 0.9)));
    return g;
  };
  // картонная коробка с полосой и «окошком»
  const carton = (x, z, w, h, d, c, band, rotY = 0) => {
    const g = grp(x, fyA, z); g.rotation.y = rotY;
    g.add(box(w, h, d, 0, h / 2, 0, food(c, 0.8)));
    g.add(box(w + 0.006, h * 0.28, d + 0.006, 0, h * 0.62, 0, food(band, 0.8)));
    g.add(box(w * 0.55, h * 0.3, 0.004, 0, h * 0.28, d / 2 + 0.003, food(0xfff4dc, 0.9)));
    return g;
  };
  // лоток с плёнкой
  const trayPack = (x, z, w, d, c, rotY = 0) => {
    const g = grp(x, fyA, z); g.rotation.y = rotY;
    g.add(box(w, 0.1, d, 0, 0.05, 0, food(0xf3f6fa, 0.9)));
    g.add(box(w * 0.85, 0.1, d * 0.8, 0, 0.14, 0, food(c, 0.5)));
    g.add(box(w, 0.004, d, 0, 0.192, 0, new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.12 })));
    g.add(box(w * 0.4, 0.06, 0.004, 0, 0.05, d / 2 + 0.004, food(0xd62839, 0.8)));
    return g;
  };

  // ---- нижний ящик: крупное ----
  k1.add(carton(-0.6, 0.02, 0.5, 0.42, 0.34, 0x2f6fff, 0xffffff, 0.08));                         // коробка пельменей
  { const ice = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.26, 26, 1, true), labelMat('', '#fff4dc', '#d62839', '#d62839')); ice.position.y = 0.13; ice.rotation.y = Math.PI / 2;
    k1.add(grp(0.05, fyA, -0.15, ice, cyl(0.19, 0.26, 0, 0.13, 0, food(0xfff4dc, 0.6), 26), cyl(0.205, 0.05, 0, 0.285, 0, food(0xd62839, 0.5), 26), cyl(0.15, 0.01, 0, 0.315, 0, food(0xd62839, 0.5), 26))); }
  k1.add(bag(0.6, 0.0, 0.34, 0.36, 0.16, 0x2e9e4f, 0xffffff, -0.15));                              // горошек
  k1.add(bag(0.05, 0.22, 0.3, 0.3, 0.14, 0xffb020, 0xd62839, 0.5));                                // кукуруза
  // ---- средний ящик ----
  { const pm = food(0xd62839, 0.7), top = labelMat('', '#d62839', '#ffffff');
    const pz = (y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.05, 0.5), [pm, pm, top, pm, pm, pm]); m.position.y = y; return m; };
    k2.add(grp(0.3, fyA, -0.15, pz(0.025), pz(0.08))); }
  k2.add(trayPack(-0.55, -0.05, 0.4, 0.28, 0xe07a8a, 0.05));                                        // мясо
  k2.add(carton(0.75, -0.2, 0.24, 0.24, 0.2, 0xffa41c, 0x1e5eff, 0.2));                             // коробка котлет
  // ---- верхний ящик: мелкое ----
  const iceMat = new THREE.MeshPhysicalMaterial({ color: 0xdff4ff, roughness: 0.15, transparent: true, opacity: 0.85 });
  const tray = grp(-0.55, fyA, 0.05, box(0.5, 0.07, 0.24, 0, 0.035, 0, food(0x6fa8ff, 0.5)));
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { const cube = box(0.085, 0.085, 0.085, -0.17 + i * 0.115, 0.1, -0.06 + j * 0.12, iceMat); cube.rotation.y = (i + j) * 0.3; tray.add(cube); }
  k3.add(tray);
  const berries = bag(0.1, -0.12, 0.32, 0.3, 0.14, 0x5b2a86, 0xffffff, 0.1);
  [[-0.08, 0.3], [0.05, 0.31], [0.11, 0.29], [-0.02, 0.33]].forEach(([px, py]) => berries.add(sph(0.028, px, py, 0.06, food(0x7b3fa0, 0.6))));
  k3.add(berries);
  k3.add(trayPack(0.55, 0.05, 0.4, 0.28, 0xe07a8a, -0.08));
  // эскимо в обёртках
  [[-0.1, 0.24, 0xff6b6b], [0.02, 0.26, 0x5bc0eb], [0.14, 0.24, 0xffd166]].forEach(([px, pz, c], i) => {
    const e = grp(px, fyA, pz); e.rotation.y = 0.9 + i * 0.05;
    const w = box(0.1, 0.045, 0.3, 0, 0.022, 0, food(c, 0.8)); e.add(w);
    e.add(box(0.11, 0.05, 0.05, 0, 0.022, -0.1, food(0xffffff, 0.8)));
    e.add(cyl(0.008, 0.12, 0, 0.022, 0.2, food(0xd9c8a5, 0.9), 8).rotateX(Math.PI / 2));
    k3.add(e);
  });
  // инеевый налёт на дне ящиков
  [k1, k2, k3].forEach(k => k.add(box(bw - 0.06, 0.006, bd - 0.06, 0, 0.035, 0, frostM)));
  freezer.add(k1, k2, k3);

  // дверь морозилки
  const drawer = new THREE.Group(); drawer.position.set(-W / 2, frY, F);
  {
    const d = slab(frW, frH, dTh, 0.03, M.door, 0.012); d.position.set(W / 2, 0, dTh / 2); drawer.add(d);
    const bx = W / 2;
    drawer.add(box(frW - 0.14, frH - 0.14, 0.02, bx, 0, -0.006, M.white));
    const rt = 0.06, rd = 0.035;
    drawer.add(box(frW - 0.04, rt, rd, bx, frH / 2 - 0.02 - rt / 2, -rd / 2, M.rubber));
    drawer.add(box(frW - 0.04, rt, rd, bx, -frH / 2 + 0.02 + rt / 2, -rd / 2, M.rubber));
    drawer.add(box(rt, frH - 0.04, rd, bx - frW / 2 + 0.02 + rt / 2, 0, -rd / 2, M.rubber));
    drawer.add(box(rt, frH - 0.04, rd, bx + frW / 2 - 0.02 - rt / 2, 0, -rd / 2, M.rubber));
    // ручка — в линию с верхней
    const hx = W - gap - 0.2;
    drawer.add(cyl(0.025, frH * 0.5, hx, 0, dTh + 0.07, M.dark, 14));
    [-1, 1].forEach(k => drawer.add(box(0.03, 0.03, 0.08, hx, k * frH * 0.22, dTh + 0.035, M.dark)));
    drawer.traverse(o => { if (o.isMesh) o.userData.ctl = drawer; });
    drawer.userData = { open: false, cur: 0, target: 0, sign: -1, kind: 'door' };
    fridge.add(drawer); controls.push(drawer);
  }

  // решётка внизу
  const grille = new THREE.Group();
  const grilleMat = new THREE.MeshStandardMaterial({ color: 0xc7cfd8, metalness: 0.3, roughness: 0.5 });
  grille.add(box(W - 0.2, 0.14, 0.05, 0, -H / 2 + 0.07, F - 0.03, grilleMat));
  for (let i = 0; i < 5; i++) grille.add(box(W - 0.4, 0.012, 0.02, 0, -H / 2 + 0.03 + i * 0.024, F + 0.0, M.white));
  fridge.add(grille);
  // ножки
  [[-1.0, 0.65], [1.0, 0.65], [-1.0, -0.65], [1.0, -0.65]].forEach(([x, z]) => fridge.add(cyl(0.09, 0.12, x, -H / 2 - 0.06, z, M.dark, 16)));
  // логотип-полоска сверху
  fridge.add(box(0.5, 0.02, 0.01, 0, H / 2 - 0.25, F + 0.005, M.dark));

  fridge.position.y = 0.05;
  scene.add(fridge);

  const halo = new THREE.Mesh(new THREE.CircleGeometry(2.0, 48), new THREE.MeshBasicMaterial({ color: 0x1e5eff, transparent: true, opacity: 0.18 }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = -H / 2 - 0.13; scene.add(halo);

  // ---- взаимодействие ----
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  let tx = 0, ty = 0;
  const pick = e => {
    const r = canvas.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(controls, true).find(h => h.object.userData.ctl);
    return hit ? hit.object.userData.ctl : null;
  };
  canvas.addEventListener('pointermove', e => { canvas.style.cursor = pick(e) ? 'pointer' : 'grab'; });
  window.addEventListener('pointermove', e => { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; });
  canvas.addEventListener('click', e => {
    const c = pick(e); if (!c) return;
    const u = c.userData; u.open = !u.open;
    u.target = u.kind === 'door' ? (u.open ? u.sign * 1.3 : 0) : (u.open ? 1.05 : 0);
  });

  const resize = () => {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // camX сдвигает кадр влево: дверь открывается только в эту сторону,
    // и при 0 её край выходил за границу canvas и срезался.
    // camY опущен: светящийся овал под корпусом лежит ниже ножек и выходит
    // вперёд к камере, из-за перспективы его ближний край уходил за низ кадра.
    const halfH = 3.35, halfW = 2.7, camX = -0.41, camY = -0.15;
    camera.position.set(camX, camY, Math.max(halfH / tanH, halfW / (tanH * camera.aspect)));
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas); resize();

  let ry = -0.4, rx = 0;
  const clock = new THREE.Clock();
  (function loop() {
    const t = clock.getElapsedTime();
    const anyOpen = controls.some(c => c.userData.open);
    const auto = anyOpen ? 0 : Math.sin(t * 0.3) * 0.25;
    ry += ((-0.4 + auto + tx * 0.8) - ry) * 0.05;
    // наклон вперёд-назад за курсором по вертикали убран — холодильник
    // больше не «ездит» вверх-вниз, остаётся только поворот вокруг оси
    rx = -0.02;
    fridge.rotation.set(rx, ry, 0); halo.rotation.z = ry;
    fridge.position.y = 0.05;
    controls.forEach(c => {
      const u = c.userData; u.cur += (u.target - u.cur) * 0.08;
      if (u.kind === 'door') c.rotation.y = u.cur; else c.position.z = u.cur;
    });
    innerLight.intensity += ((dl.userData.open ? 9 : 0) - innerLight.intensity) * 0.1;
    frzLight.intensity += ((drawer.userData.open ? 5 : 0) - frzLight.intensity) * 0.1;
    M.led.color.setHSL(0.58, 0.9, 0.78 + Math.sin(t * 2) * 0.06);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  })();
}

const el = document.getElementById('fridge3d');
if (el) mountFridge(el);
