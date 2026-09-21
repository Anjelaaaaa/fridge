// 3D-холодильник для hero. Подключение: <script type="module" src="/static/js/fridge3d.js"></script>
// Ищет <canvas id="fridge3d">. Клик по дверце/ящику — открывает/закрывает.
import * as THREE from './vendor/three.module.js';

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
    alu: new THREE.MeshStandardMaterial({ color: 0xc9d3dc, metalness: 0.75, roughness: 0.35 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xc8793a, metalness: 0.9, roughness: 0.25 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x1c2229, roughness: 0.7 }),
    heater: new THREE.MeshStandardMaterial({ color: 0xff9a3c, emissive: 0xff6a00, emissiveIntensity: 0.9, roughness: 0.3 }),
  };
  const box = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); return b; };
  const cyl = (r, h, x, y, z, m, seg = 20) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m); b.position.set(x, y, z); return b; };
  const hcyl = (r, len, x, y, z, m) => { const c = cyl(r, len, x, y, z, m, 14); c.rotation.z = Math.PI / 2; return c; };
  const bend = (r, tube, x, y, z, rotZ, m) => { const t = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 14, Math.PI), m); t.position.set(x, y, z); t.rotation.z = rotZ; return t; };
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

  // подписи узлов — HTML-слой поверх canvas, видны только при открытой двери
  const labelLayer = document.createElement('div');
  labelLayer.className = 'fridge-labels';
  labelLayer.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:3';
  canvas.parentElement.appendChild(labelLayer);
  const parts = [];
  // подсказка «откройте дверь»: маячок на ручке + плашка. Исчезает навсегда после
  // первого открытия (запоминаем в браузере; если хранилище недоступно — просто до перезагрузки)
  const hintAnchor = new THREE.Object3D();
  const hint = document.createElement('div');
  hint.className = 'fh';
  hint.innerHTML = '<i class="fh-ring"></i><span class="fh-text">'
    + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10m0-.5a1.5 1.5 0 0 1 3 0V11m0-.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1.2a5 5 0 0 1-3.9-1.9L4.6 15.2a1.5 1.5 0 0 1 2.3-1.9L9 15"/></svg>'
    + 'Откройте</span>';
  labelLayer.appendChild(hint);
  let hintDone = false;
  try { hintDone = localStorage.getItem('fridgeOpened') === '1'; } catch (e) { /* приватный режим */ }
  // после загрузки шрифта ширина подписей меняется — замерим заново
  if (document.fonts) document.fonts.ready.then(() => parts.forEach(p => { p.w = 0; }));
  const mark = (name, parent, x, y, z, when, side) => {
    const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o);
    // подпись-выноска: точка на детали → линия → стеклянная плашка (стили в main-page.css)
    const el = document.createElement('div');
    el.className = 'fl';
    el.innerHTML = '<i class="fl-dot"></i><i class="fl-line"></i><span class="fl-text">' + name + '</span>';
    labelLayer.appendChild(el);
    parts.push({ o, when, el, x, side });
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
  // ---- узлы для ремонта (вместо продуктов) ----
  const bz0 = -F + wall + 0.01;
  // кожух испарителя No Frost на задней стенке + вентилятор
  const evZ = bz0 + 0.04;
  inner.add(box(iw - 0.3, 0.95, 0.06, 0, 2.05, evZ, M.white));
  for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) inner.add(box(0.14, 0.018, 0.01, -0.75 + i * 0.3, 1.68 + r * 0.06, evZ + 0.035, M.plastic));
  const fan = (parent, x, y, z, R) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.02, 8, 32), M.plastic); ring.position.set(x, y, z); parent.add(ring);
    parent.add(cyl(R * 0.25, 0.03, x, y, z, M.plastic, 16).rotateX(Math.PI / 2));
    for (let i = 0; i < 5; i++) { const b = box(R * 0.75, R * 0.28, 0.012, 0, 0, 0, M.plastic); b.position.set(x + Math.cos(i * 1.2566) * R * 0.5, y + Math.sin(i * 1.2566) * R * 0.5, z); b.rotation.z = i * 1.2566; b.rotation.y = 0.5; parent.add(b); }
    for (let i = 0; i < 4; i++) parent.add(box(R * 2, 0.012, 0.008, x, y - R * 0.6 + i * R * 0.4, z + 0.02, M.plastic));
  };
  fan(inner, 0, 2.15, evZ + 0.035, 0.22);
  // точка на решётке испарителя, ниже вентилятора — подписи не слипаются
  mark('Испаритель No Frost', inner, -0.6, 1.71, evZ + 0.06, 'door');
  mark('Вентилятор обдува', inner, 0, 2.15, evZ + 0.08, 'door', 'left');
  // блок термостата под потолком
  inner.add(box(0.6, 0.16, 0.42, 0, 2.5, 0.05, M.white));
  inner.add(cyl(0.05, 0.03, 0.15, 2.5, 0.27, M.plastic, 20).rotateX(Math.PI / 2));
  inner.add(box(0.012, 0.05, 0.01, 0.15, 2.5, 0.29, M.blue));
  inner.add(box(0.2, 0.05, 0.01, -0.12, 2.5, 0.27, M.led));
  mark('Термостат и плата', inner, -0.2, 2.46, 0.3, 'door');
  // датчик температуры на боковой стенке
  inner.add(cyl(0.028, 0.16, iw / 2 - 0.05, 0.45, -0.2, M.plastic, 12));
  inner.add(box(0.008, 0.6, 0.008, iw / 2 - 0.03, 0.85, -0.2, M.plastic));
  mark('Датчик температуры', inner, iw / 2 - 0.08, 0.45, -0.15, 'door');
  // дренаж
  inner.add(box(iw - 0.4, 0.035, 0.06, 0, -0.5, bz0 + 0.04, M.white));
  inner.add(cyl(0.045, 0.02, 0, -0.44, bz0 + 0.02, M.plastic, 16).rotateX(Math.PI / 2));
  mark('Дренажное отверстие', inner, 0, -0.44, bz0 + 0.08, 'door', 'left');
  fridge.add(inner);

  // морозильная камера (полость)
  const botH = split - (-H / 2 + wall) - 0.04;
  const freezer = new THREE.Group();
  freezer.add(box(iw, botH, 0.02, 0, -H / 2 + wall + botH / 2, -F + wall + 0.01, M.white));
  freezer.add(box(0.02, botH, idp, -iw / 2 + 0.01, -H / 2 + wall + botH / 2, wall / 2, M.white));
  freezer.add(box(0.02, botH, idp, iw / 2 - 0.01, -H / 2 + wall + botH / 2, wall / 2, M.white));
  const frzLight = new THREE.PointLight(0xcfe3ff, 0, 5, 1.2); frzLight.position.set(0, -H / 2 + wall + botH - 0.15, 0.55); freezer.add(frzLight);
  freezer.add(box(iw - 0.3, 0.02, 0.02, 0, -H / 2 + wall + botH - 0.08, F - 0.35, M.led));
  // испаритель морозилки: пластинчатый блок + медный змеевик
  const zE = -F + wall + 0.01 + 0.09;
  freezer.add(box(iw - 0.5, 0.62, 0.08, 0, -1.78, zE - 0.04, M.alu));
  for (let i = 0; i < 12; i++) freezer.add(box(0.008, 0.62, 0.1, -0.85 + i * 0.155, -1.78, zE - 0.04, M.alu));
  const rows = 5, tl = iw - 0.7, y0 = -1.55;
  for (let i = 0; i < rows; i++) freezer.add(hcyl(0.022, tl, 0, y0 - i * 0.11, zE + 0.02, M.copper));
  for (let i = 0; i < rows - 1; i++) freezer.add(bend(0.055, 0.022, (i % 2 ? -1 : 1) * tl / 2, y0 - i * 0.11 - 0.055, zE + 0.02, i % 2 ? Math.PI / 2 : -Math.PI / 2, M.copper));
  mark('Испаритель морозилки', freezer, 0.55, -1.7, zE + 0.08, 'drawer');
  fan(freezer, 0, -1.34, zE + 0.02, 0.15);
  // ТЭН оттайки
  freezer.add(hcyl(0.018, tl + 0.1, 0, -2.16, zE + 0.02, M.heater));
  [-1, 1].forEach(s => freezer.add(cyl(0.035, 0.06, s * (tl / 2 + 0.05), -2.16, zE + 0.02, M.plastic, 12).rotateZ(Math.PI / 2)));
  mark('ТЭН оттайки', freezer, -0.5, -2.16, zE + 0.08, 'drawer');
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
    // ручка — вертикальная у правого края
    const hx = W - gap - 0.2;
    const handle = cyl(0.025, doorH * 0.55, hx, 0, dTh + 0.07, M.dark, 14); dl.add(handle);
    // точка для подсказки «откройте» — ровно по центру ручки
    hintAnchor.position.set(hx, 0, dTh + 0.1); dl.add(hintAnchor);
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
  const fy0 = -H / 2 + wall, bz = 0.12, bw = iw - 0.16, bd = idp - 0.6; // сзади место под испаритель
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
  const bh1 = botH * 0.29;
  const k1 = basket(fy0 + 0.04, bh1);
  // направляющие
  [k1].forEach(k => [-1, 1].forEach(s => freezer.add(box(0.03, 0.03, bd, s * (bw / 2 + 0.03), k.position.y + 0.02, bz, M.chrome))));
  freezer.add(k1);

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
    if (!hintDone) {
      hintDone = true;
      try { localStorage.setItem('fridgeOpened', '1'); } catch (e) { /* приватный режим */ }
    }
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
    // halfH и camY подняты на 0.25 вместе: низ кадра на прежнем месте, а сверху
    // запас под открытую дверь — она поворачивается к камере и из-за перспективы
    // поднимается выше корпуса. Canvas в CSS на столько же выше (margin-top < 0).
    const halfH = 3.6, halfW = 2.7, camX = -0.41, camY = 0.1;
    camera.position.set(camX, camY, Math.max(halfH / tanH, halfW / (tanH * camera.aspect)));
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas); resize();

  const lv = new THREE.Vector3();
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
    // подписи узлов: слой повторяет положение canvas, подпись видна, когда её дверь открыта
    const cw = canvas.clientWidth, chh = canvas.clientHeight;
    const showLabels = cw >= 320;
    labelLayer.style.left = canvas.offsetLeft + 'px';
    labelLayer.style.top = canvas.offsetTop + 'px';
    const frontVis = Math.max(0, Math.min(1, (Math.cos(ry) - 0.3) / 0.5));
    // подсказка: через 1.5 с после загрузки, пока дверь закрыта и холодильник смотрит на нас
    const hintVis = hintDone ? 0 : frontVis
      * Math.max(0, Math.min(1, (t - 1.5) / 0.6))
      * Math.max(0, 1 - Math.abs(dl.userData.cur) / 0.2);
    hint.style.opacity = hintVis.toFixed(2);
    if (hintVis > 0) {
      hintAnchor.getWorldPosition(lv); lv.project(camera);
      const hx = (lv.x + 1) / 2 * cw, hy = (1 - lv.y) / 2 * chh;
      // маячок на ручке, плашка справа от него; центр маячка (18px) — ровно на ручке
      const hh = hint.offsetHeight || 24;
      hint.style.transform = `translate(${(hx - 9).toFixed(1)}px,${(hy - hh / 2).toFixed(1)}px)`;
    }
    if (!showLabels) parts.forEach(p => { p.el.style.opacity = 0; });
    if (showLabels) {
      parts.forEach(p => {
        const d = p.when === 'door' ? dl : drawer;
        const vis = frontVis * Math.max(0, Math.min(1, (Math.abs(d.userData.cur) - 0.8) / 0.4));
        p.o.getWorldPosition(lv); lv.project(camera);
        const px = (lv.x + 1) / 2 * cw, py = (1 - lv.y) / 2 * chh;
        // размер плашки замеряем, когда слой уже виден (иначе offsetWidth = 0)
        if (!p.w && p.el.offsetWidth) { p.w = p.el.offsetWidth; p.h = p.el.offsetHeight; }
        const w = p.w || 140, h = p.h || 24;
        // сторона выноски — по положению детали внутри корпуса, а не по середине кадра
        // (кадр сдвинут под открытую дверь): у правой стенки плашка идёт влево,
        // остальные — вправо, внутрь камеры, не наезжая на дверь и плашки слева.
        // Центр точки (10px) ровно на детали.
        const flip = p.side ? p.side === 'left' : p.x > 0.25;
        p.el.classList.toggle('fl--flip', flip);
        p.el.style.transform = `translate(${(flip ? px - w + 5 : px - 5).toFixed(1)}px,${(py - h / 2).toFixed(1)}px)`;
        p.el.style.opacity = vis.toFixed(2);
      });
    }
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  })();
}

const el = document.getElementById('fridge3d');
if (el) mountFridge(el);
