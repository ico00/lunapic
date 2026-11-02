import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { AboutStoryContext } from "./aboutStoryWidgets";

type SceneLabel = {
  el: HTMLDivElement;
  obj: THREE.Object3D;
  offset: THREE.Vector3;
  v: THREE.Vector3;
  show: boolean;
  fn: (() => string) | null;
};
type ScenePacket = {
  s: THREE.Sprite;
  curve: THREE.Curve<THREE.Vector3>;
  t0: number | null;
  dur: number;
  onDone?: () => void;
};
type SceneFlight = {
  cs: string;
  km: number;
  A: THREE.Vector3;
  B: THREE.Vector3;
  per: number;
  off: number;
};
type FleetEntry = {
  f: SceneFlight;
  y: number;
  col: number;
  obj: THREE.Group;
  drop: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  dropGeo: THREE.BufferGeometry;
  shadow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  lbl: SceneLabel;
  hero: boolean;
};

function disposeObject(o: THREE.Object3D) {
  const { geometry, material } = o as THREE.Mesh;
  geometry?.dispose();
  for (const m of Array.isArray(material) ? material : material ? [material] : []) {
    (m as THREE.MeshBasicMaterial).map?.dispose();
    m.dispose();
  }
}

/**
 * Dvije 3D scene stranice About: put signala (hero) i geometrija tranzita (karta).
 * Modul se učitava dinamički, da `three` ne uđe u bundle planera. Vraća čišćenje,
 * jer klijentska navigacija ne smije ostaviti WebGL kontekst ni rAF petlju.
 */
export function mountAboutScenes(story: AboutStoryContext): () => void {
  const cleanups: (() => void)[] = [];
  const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const onResize = (root: HTMLElement, fn: () => void) => {
    const ro = new ResizeObserver(fn);
    ro.observe(root);
    cleanups.push(() => {
      ro.disconnect();
    });
  };

  const C = { radio: 0xffa94d, data: 0x3fd6f5, ok: 0x57d68d, moon: 0xdfe3ec };
  const ALT = [0xf2c14e, 0xf08a4b, 0xe2557a, 0x9b6cf0, 0x4c8ff0];
  const altColor = (km: number) => ALT[Math.max(0, Math.min(4, Math.floor(km / 3)))];
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  function rng(seed: number) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- teksture ---------- */
  function canvasTex(
    w: number,
    h: number,
    draw: (g: CanvasRenderingContext2D, w: number, h: number) => void
  ) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d")!, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  const GLOW = canvasTex(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(0.22, "rgba(255,255,255,.5)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
  });
  const MOON = canvasTex(1024, 512, (g, w, h) => {
    const R = rng(7);
    g.fillStyle = "#c9c8c1";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      // mora
      g.fillStyle = "rgba(88,90,96,.38)";
      g.beginPath();
      g.ellipse(R() * w, h * (0.25 + R() * 0.5), 40 + R() * 110, 25 + R() * 70, R() * 3, 0, 7);
      g.fill();
    }
    for (let i = 0; i < 420; i++) {
      // krateri
      const x = R() * w,
        y = R() * h,
        r = 1.5 + Math.pow(R(), 3) * 22;
      g.fillStyle = "rgba(70,70,74,.28)";
      g.beginPath();
      g.arc(x, y, r, 0, 7);
      g.fill();
      g.strokeStyle = "rgba(245,245,238,.35)";
      g.lineWidth = Math.max(1, r * 0.18);
      g.beginPath();
      g.arc(x - r * 0.12, y - r * 0.12, r, 3.5, 5.6);
      g.stroke();
    }
  });
  const glow = (color: number, size: number, opacity = 1) => {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: GLOW,
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    s.scale.setScalar(size);
    return s;
  };
  function makeMoon(r: number, glowSize: number) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(r, 48, 32),
      new THREE.MeshBasicMaterial({ map: MOON })
    );
    m.rotation.y = 2.2;
    g.userData.surface = m;
    g.add(m);
    const halo = glow(0xcfd8ff, glowSize, 0.32);
    g.add(halo);
    g.userData.halo = halo;
    return g;
  }

  /* ---------- avion ---------- */
  function wing(
    rootLE: number,
    rootTE: number,
    tipLE: number,
    tipTE: number,
    span: number,
    s: number
  ) {
    const sh = new THREE.Shape();
    sh.moveTo(rootLE, 0);
    sh.lineTo(tipLE, s * span);
    sh.lineTo(tipTE, s * span);
    sh.lineTo(rootTE, 0);
    sh.closePath();
    return sh;
  }
  function makePlane(color: number, withLights = true) {
    const g = new THREE.Group(),
      body = new THREE.Group();
    g.add(body);
    body.rotation.y = -Math.PI / 2; // nos je +x unutar tijela, +z prema van, pa radi lookAt
    const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.32 });
    const ex = { depth: 0.08, bevelEnabled: false };
    const fus = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 5.2, 8, 24), mat);
    fus.rotation.z = Math.PI / 2;
    body.add(fus);
    for (const s of [1, -1]) {
      const w = new THREE.Mesh(
        new THREE.ExtrudeGeometry(wing(1.0, -0.6, -1.15, -1.85, 4.5, s), ex),
        mat
      );
      w.rotation.x = -Math.PI / 2;
      w.position.y = -0.18;
      body.add(w);
      const t = new THREE.Mesh(
        new THREE.ExtrudeGeometry(wing(-2.3, -3.0, -3.2, -3.6, 1.6, s), ex),
        mat
      );
      t.rotation.x = -Math.PI / 2;
      t.position.y = 0.12;
      body.add(t);
      const e = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 1.15, 20), mat);
      e.rotation.z = Math.PI / 2;
      e.position.set(0.3, -0.46, s * -1.65);
      body.add(e);
    }
    const finSh = new THREE.Shape();
    finSh.moveTo(-2.0, 0.3);
    finSh.lineTo(-3.25, 2.15);
    finSh.lineTo(-3.75, 2.15);
    finSh.lineTo(-3.45, 0.3);
    finSh.closePath();
    const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(finSh, ex), mat);
    fin.position.z = -0.04;
    body.add(fin);
    g.userData.mat = mat;
    g.userData.blink = [];
    if (withLights) {
      const add = (c: number, x: number, y: number, z: number, size: number, strobe?: boolean) => {
        const s = glow(c, size);
        s.position.set(x, y, z);
        body.add(s);
        if (strobe) g.userData.blink.push(s);
      };
      add(0xff4d4d, -1.5, -0.15, -4.5, 1.4);
      add(0x4dff8a, -1.5, -0.15, 4.5, 1.4);
      add(0xffffff, -3.7, 2.2, 0, 1.8, true);
      add(0xff3b3b, 0.2, -0.5, 0, 1.2, true);
    }
    return g;
  }
  function blink(p: THREE.Object3D, t: number) {
    p.userData.blink.forEach((s: THREE.Sprite, i: number) => {
      s.visible = (t * 0.8 + i * 0.37) % 1 < 0.07;
    });
  }

  /* ---------- zajednički okvir scene ---------- */
  function setup(root: HTMLElement, fov: number) {
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      root.classList.add("nogl");
      return null;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    root.prepend(renderer.domElement);
    cleanups.push(() => {
      renderer.domElement.remove();
    });
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 1200);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    const labelsEl = root.querySelector(".labels")!,
      labels: SceneLabel[] = [];
    cleanups.push(() => {
      labelsEl.replaceChildren();
      controls.dispose();
    });
    function addLabel(
      html: string | (() => string),
      obj: THREE.Object3D,
      offset?: THREE.Vector3,
      cls?: string
    ) {
      const el = document.createElement("div");
      el.className = "lbl3d" + (cls ? " " + cls : "");
      el.innerHTML = typeof html === "function" ? html() : html;
      labelsEl.appendChild(el);
      const l: SceneLabel = {
        el,
        obj,
        offset: offset || V(0, 0, 0),
        v: V(0, 0, 0),
        show: true,
        fn: typeof html === "function" ? html : null,
      };
      labels.push(l);
      return l;
    }
    cleanups.push(
      story.onLangChange(() => {
        labels.forEach((l) => {
          if (l.fn) l.el.innerHTML = l.fn();
        });
      })
    );
    function size() {
      const w = root.clientWidth,
        h = root.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    onResize(root, size);
    size();
    let visible = true;
    const io = new IntersectionObserver((es) => {
      visible = es[0].isIntersecting;
    });
    io.observe(root);
    cleanups.push(() => {
      io.disconnect();
    });
    function project() {
      const w = root.clientWidth,
        h = root.clientHeight;
      for (const l of labels) {
        l.obj.getWorldPosition(l.v);
        l.v.add(l.offset).project(camera);
        const on = l.show && l.v.z < 1 && Math.abs(l.v.x) < 1.05 && Math.abs(l.v.y) < 1.05;
        l.el.style.opacity = on ? "1" : "0";
        l.el.style.transform = `translate(${((l.v.x * 0.5 + 0.5) * w).toFixed(1)}px,${((-l.v.y * 0.5 + 0.5) * h).toFixed(1)}px) translate(-50%,-100%)`;
      }
    }
    function run(update: (t: number, dt: number) => void) {
      const clock = new THREE.Clock();
      let t = REDUCE ? 7.5 : 0;
      let raf = 0;
      cleanups.push(() => {
        cancelAnimationFrame(raf);
      });
      (function frame() {
        raf = requestAnimationFrame(frame);
        const dt = Math.min(clock.getDelta(), 0.05);
        if (!visible) return;
        if (!REDUCE) t += dt;
        update(t, dt);
        controls.update();
        renderer.render(scene, camera);
        project();
      })();
    }
    cleanups.push(() => {
      scene.traverse(disposeObject);
      renderer.dispose();
      renderer.forceContextLoss();
    });
    return { renderer, scene, camera, controls, addLabel, run };
  }
  const T = story.t;
  const L = (n: string, title: string, sub?: string) =>
    `${n ? `<span class="n">${n}</span>` : ""}<b>${title}</b>${sub ? `<span class="s">${sub}</span>` : ""}`;

  /* =========================================================
   HERO: put signala od aviona do mobitela
   ========================================================= */
  (function hero() {
    const root = story.root.querySelector<HTMLElement>("#hero3d");
    if (!root) return;
    const S = setup(root, 36);
    if (!S) return;
    const { scene, camera, controls } = S;
    controls.target.set(3, 8, 0);
    const fit = () => {
      const d = Math.max(60, 33 / (Math.tan(THREE.MathUtils.degToRad(18)) * camera.aspect));
      camera.position.copy(controls.target).add(V(-7, 9, 64).setLength(d));
    };
    fit();
    onResize(root, fit);
    controls.minPolarAngle = 0.95;
    controls.maxPolarAngle = 1.5;
    controls.minAzimuthAngle = -0.8;
    controls.maxAzimuthAngle = 0.8;
    scene.fog = new THREE.Fog(0x0b1122, 70, 190);

    scene.add(new THREE.HemisphereLight(0x8fa8ff, 0x0a0f1c, 0.75));
    const moonLight = new THREE.DirectionalLight(0xe2e8ff, 1.6);
    moonLight.position.set(40, 45, -70);
    scene.add(moonLight);
    const warm = new THREE.DirectionalLight(0xffb070, 0.45);
    warm.position.set(-30, 12, 40);
    scene.add(warm);

    // tlo s mrežom koja se gubi u daljini
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 420),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uBase: { value: new THREE.Color(0x0c1426) },
          uLine: { value: new THREE.Color(0x2f4a7a) },
        },
        vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
        fragmentShader: `uniform vec3 uBase; uniform vec3 uLine; varying vec3 vW;
      void main(){ vec2 c = vW.xz/5.; vec2 g = abs(fract(c-.5)-.5)/fwidth(c); float line = 1.-min(min(g.x,g.y),1.);
        float d = length(vW.xz); float fade = smoothstep(190.,30.,d);
        gl_FragColor = vec4(mix(uBase, uLine, line*.55), fade); }`,
      })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // svjetla grada
    {
      const R = rng(3),
        n = 1400,
        pos = new Float32Array(n * 3),
        centers = [
          [-30, 30],
          [20, 40],
          [60, -40],
          [-70, -50],
          [0, -20],
        ];
      for (let i = 0; i < n; i++) {
        const c = centers[i % centers.length],
          a = R() * 7,
          r = Math.pow(R(), 1.6) * 30;
        pos[i * 3] = c[0] + Math.cos(a) * r;
        pos[i * 3 + 1] = 0.05;
        pos[i * 3 + 2] = c[1] + Math.sin(a) * r;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      scene.add(
        new THREE.Points(
          geo,
          new THREE.PointsMaterial({
            color: 0xffc58a,
            size: 0.38,
            transparent: true,
            opacity: 0.75,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        )
      );
    }
    // zvijezde
    {
      const R = rng(11),
        n = 1100,
        pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const th = R() * Math.PI * 2,
          ph = Math.acos(R() * 0.92),
          r = 420;
        pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
        pos[i * 3 + 1] = r * Math.cos(ph) + 10;
        pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      scene.add(
        new THREE.Points(
          geo,
          new THREE.PointsMaterial({
            color: 0xffffff,
            size: 1.6,
            sizeAttenuation: false,
            transparent: true,
            opacity: 0.8,
            fog: false,
          })
        )
      );
    }
    // planine na horizontu
    {
      const R = rng(21),
        mat = new THREE.MeshStandardMaterial({ color: 0x141d33, roughness: 1, flatShading: true });
      for (let i = 0; i < 46; i++) {
        const a = -Math.PI * 0.95 + R() * Math.PI * 0.9,
          d = 120 + R() * 60,
          h = 8 + R() * 22;
        const m = new THREE.Mesh(
          new THREE.ConeGeometry(h * (1.2 + R()), h, 5 + Math.floor(R() * 3)),
          mat
        );
        m.position.set(Math.cos(a) * d, h / 2 - 1, Math.sin(a) * d);
        m.rotation.y = R() * 3;
        scene.add(m);
      }
    }
    const moon = makeMoon(7, 40);
    moon.position.set(36, 33, -120);
    scene.add(moon);
    moon.userData.surface.material.fog = false;

    // kuća s antenom
    const house = new THREE.Group();
    house.position.set(-19, 0, 10);
    scene.add(house);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x24304c, roughness: 0.8 });
    const walls = new THREE.Mesh(new THREE.BoxGeometry(7, 4.2, 5.4), wallMat);
    walls.position.y = 2.1;
    house.add(walls);
    const roofSh = new THREE.Shape();
    roofSh.moveTo(-3.9, 0);
    roofSh.lineTo(0, 2.8);
    roofSh.lineTo(3.9, 0);
    roofSh.closePath();
    const roof = new THREE.Mesh(
      new THREE.ExtrudeGeometry(roofSh, { depth: 6, bevelEnabled: false }),
      new THREE.MeshStandardMaterial({ color: 0x3a2f3c, roughness: 0.7 })
    );
    roof.position.set(0, 4.2, -3);
    house.add(roof);
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffc070 });
    [
      [-2, 2.3],
      [1.9, 2.3],
      [-2, 0.9],
    ].forEach(([x, y]) => {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.9), winMat);
      w.position.set(x, y, 2.71);
      house.add(w);
      const gw = glow(0xffb060, 3, 0.35);
      gw.position.set(x, y, 2.9);
      house.add(gw);
    });
    const door = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1.8),
      new THREE.MeshStandardMaterial({ color: 0x141b2d })
    );
    door.position.set(0.1, 0.9, 2.71);
    house.add(door);
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.09, 5.5, 12),
      new THREE.MeshStandardMaterial({ color: 0xd8dde8, metalness: 0.8, roughness: 0.3 })
    );
    mast.position.set(2.2, 6.6, 0);
    house.add(mast);
    const antTip = new THREE.Object3D();
    antTip.position.set(2.2, 9.4, 0);
    house.add(antTip);
    const antGlow = glow(C.radio, 3.2, 0.9);
    antTip.add(antGlow);
    const antRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.6, 0.05, 8, 40),
      new THREE.MeshBasicMaterial({ color: C.radio, transparent: true, opacity: 0 })
    );
    antRing.rotation.x = Math.PI / 2;
    antTip.add(antRing);

    // server
    const server = new THREE.Group();
    server.position.set(9, 0, -6);
    scene.add(server);
    const leds: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const u = new THREE.Mesh(
        new RoundedBoxGeometry(4.2, 1.25, 3.2, 3, 0.14),
        new THREE.MeshStandardMaterial({ color: 0x1a2440, metalness: 0.55, roughness: 0.35 })
      );
      u.position.y = 0.7 + i * 1.42;
      server.add(u);
      for (let k = 0; k < 4; k++) {
        const led = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 0.12, 0.05),
          new THREE.MeshBasicMaterial({ color: k === 0 ? C.ok : C.data })
        );
        led.position.set(-1.5 + k * 0.38, 0.7 + i * 1.42, 1.62);
        server.add(led);
        leds.push(led);
      }
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.06, 0.05),
        new THREE.MeshBasicMaterial({ color: 0x2a3a5c })
      );
      strip.position.set(0.9, 0.7 + i * 1.42, 1.62);
      server.add(strip);
    }
    const serverTop = new THREE.Object3D();
    serverTop.position.set(0, 4.6, 0);
    server.add(serverTop);
    const serverGlow = glow(C.data, 9, 0);
    serverGlow.position.y = 2.4;
    server.add(serverGlow);

    // javne mreže
    const cloud = new THREE.Group();
    cloud.position.set(12, 18, -30);
    scene.add(cloud);
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0x9fb3d9,
      transparent: true,
      opacity: 0.32,
      roughness: 1,
      depthWrite: false,
    });
    [
      [0, 0, 0, 2.6],
      [-2.6, -0.6, 0.4, 1.9],
      [2.7, -0.5, 0, 2.1],
      [1, 1.4, -0.5, 1.8],
      [-1.2, 1.1, 0.2, 1.6],
    ].forEach(([x, y, z, r]) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), cloudMat);
      s.position.set(x, y, z);
      cloud.add(s);
    });

    // mobitel
    const phone = new THREE.Group();
    phone.position.set(26, 8, 9);
    phone.rotation.y = -0.45;
    scene.add(phone);
    phone.add(
      new THREE.Mesh(
        new RoundedBoxGeometry(3.1, 6, 0.34, 4, 0.42),
        new THREE.MeshStandardMaterial({ color: 0x0e1424, metalness: 0.7, roughness: 0.25 })
      )
    );
    const screenTex = canvasTex(256, 500, (g, w, h) => {
      g.fillStyle = "#0b1324";
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "rgba(80,110,160,.25)";
      g.lineWidth = 1;
      for (let x = 0; x < w; x += 32) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, h);
        g.stroke();
      }
      for (let y = 0; y < h; y += 32) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
      g.strokeStyle = "rgba(40,90,130,.8)";
      g.lineWidth = 9;
      g.beginPath();
      g.moveTo(0, 330);
      g.bezierCurveTo(90, 300, 160, 380, 256, 340);
      g.stroke();
      g.strokeStyle = "rgba(230,235,245,.85)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(120, 300);
      g.lineTo(250, 150);
      g.stroke();
      g.setLineDash([5, 6]);
      g.strokeStyle = "rgba(79,209,232,.7)";
      g.beginPath();
      g.arc(120, 300, 110, 0, 7);
      g.stroke();
      g.setLineDash([]);
      (
        [
          ["#f2c14e", 50, 120],
          ["#9b6cf0", 200, 400],
          ["#e2557a", 70, 430],
          ["#4c8ff0", 40, 230],
        ] as [string, number, number][]
      ).forEach(([c, x, y]) => {
        g.fillStyle = c;
        g.beginPath();
        g.arc(x, y, 7, 0, 7);
        g.fill();
      });
      g.fillStyle = "#57d68d";
      g.beginPath();
      g.arc(196, 214, 9, 0, 7);
      g.fill();
      g.strokeStyle = "rgba(87,214,141,.5)";
      g.lineWidth = 3;
      g.beginPath();
      g.arc(196, 214, 17, 0, 7);
      g.stroke();
      g.fillStyle = "#4fd1e8";
      g.beginPath();
      g.arc(120, 300, 7, 0, 7);
      g.fill();
      g.fillStyle = "rgba(19,27,48,.95)";
      g.fillRect(0, 0, w, 54);
      g.fillStyle = "#eaeef7";
      g.font = "600 22px sans-serif";
      g.fillText("LunaPic", 18, 35);
    });
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(2.7, 5.3),
      new THREE.MeshBasicMaterial({ map: screenTex })
    );
    screen.position.z = 0.18;
    phone.add(screen);
    const phoneGlow = glow(C.ok, 12, 0);
    phoneGlow.position.z = 0.5;
    phone.add(phoneGlow);

    // vodovi podataka
    const P = (o: THREE.Object3D) => o.getWorldPosition(V(0, 0, 0));
    scene.updateMatrixWorld(true);
    const a0 = P(antTip),
      s0 = P(serverTop),
      c0 = cloud.position.clone().add(V(0, -2, 0)),
      ph0 = phone.position.clone().add(V(-1.6, 0, 0));
    const curveA = new THREE.CatmullRomCurve3([a0, V(-9, 15, 4), V(3, 10, -3), s0]);
    const curveB = new THREE.CatmullRomCurve3([c0, V(11, 11, -18), s0]);
    const curveC = new THREE.CatmullRomCurve3([s0, V(16, 10, 2), ph0]);
    const tube = (curve: THREE.Curve<THREE.Vector3>, op: number) =>
      scene.add(
        new THREE.Mesh(
          new THREE.TubeGeometry(curve, 80, 0.09, 8),
          new THREE.MeshBasicMaterial({
            color: 0x1fb8e0,
            toneMapped: false,
            transparent: true,
            opacity: op,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        )
      );
    tube(curveA, 0.55);
    tube(curveB, 0.3);
    tube(curveC, 0.55);

    // let aviona
    const path = new THREE.CatmullRomCurve3([
      V(-62, 14.5, -14),
      V(-30, 16.5, -9),
      V(4, 17.5, -4),
      V(38, 17, 3),
      V(72, 15, 10),
    ]);
    const plane = makePlane(0xf2f4f8);
    scene.add(plane);
    const trailN = 240,
      trailPos = new Float32Array(trailN * 3);
    for (let i = 0; i < trailN; i++) {
      const p = path.getPointAt(i / (trailN - 1));
      trailPos[i * 3] = p.x;
      trailPos[i * 3 + 1] = p.y - 0.2;
      trailPos[i * 3 + 2] = p.z;
    }
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
    const trail = new THREE.Line(
      trailGeo,
      new THREE.LineBasicMaterial({ color: 0xbfd0ff, transparent: true, opacity: 0.28 })
    );
    scene.add(trail);

    // radio ljuske (fresnel)
    const shellMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(C.radio) }, uOpacity: { value: 1 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(1.-abs(dot(vN,vV)), 2.6); gl_FragColor = vec4(uColor, f*uOpacity); }`,
    });
    const shellGeo = new THREE.SphereGeometry(1, 48, 32);
    const shells: {
      m: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
      t0: number;
      hit: boolean;
      o: THREE.Vector3;
    }[] = [];
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(shellGeo, shellMat.clone());
      m.visible = false;
      scene.add(m);
      shells.push({ m, t0: -99, hit: true, o: V(0, 0, 0) });
    }
    let lastShell = -9,
      si = 0,
      antFlash = -9,
      phoneFlash = -9,
      serverFlash = -9;

    // paketi
    const packets: ScenePacket[] = [];
    function packet(
      curve: THREE.Curve<THREE.Vector3>,
      dur: number,
      color: number,
      onDone?: () => void
    ) {
      const s = glow(color, 2.4, 1);
      const core = glow(0xffffff, 0.7, 1);
      s.add(core);
      scene.add(s);
      s.position.copy(curve.getPointAt(0));
      packets.push({ s, curve, t0: null, dur, onDone });
    }
    let lastExt = 0;

    // oznake
    S.addLabel(
      () => L("01", T("Avion", "Aircraft"), T("javlja GPS položaj", "reports GPS position")),
      plane,
      V(0, 3.2, 0)
    );
    S.addLabel(
      () => L("03", "LunaPic ADS-B", T("antena · Raspberry Pi", "antenna · Raspberry Pi")),
      antTip,
      V(0, 1.6, 0)
    );
    S.addLabel(
      () => L("04", "OpenSky · adsb.lol", T("javne mreže, po izboru", "public networks, optional")),
      cloud,
      V(0, 3.6, 0)
    );
    S.addLabel(
      () => L("05", "LunaPic server", T("baza i obrada", "database and processing")),
      serverTop,
      V(0, 2.4, 0)
    );
    S.addLabel(
      () => L("09", T("Vaš mobitel", "Your phone"), T("karta i obavijesti", "map and alerts")),
      phone,
      V(0, 3.9, 0)
    );
    S.addLabel(() => `<b>${T("Mjesec", "Moon")}</b>`, moon, V(0, 9, 0), "mini");

    const tmp = V(0, 0, 0);
    S.run((t) => {
      const u = REDUCE ? 0.46 : ((t + 11) / 32) % 1;
      const p = path.getPointAt(u);
      plane.position.copy(p);
      plane.lookAt(path.getPointAt(Math.min(0.999, u + 0.004)));
      if (u > 0.995) plane.lookAt(p.clone().add(V(1, 0, 0.15)));
      blink(plane, t);
      trailGeo.setDrawRange(0, Math.floor(u * trailN));

      if (REDUCE) {
        shells.slice(0, 3).forEach((s, i) => {
          s.m.visible = true;
          s.m.position.copy(p);
          s.m.scale.setScalar(10 + i * 14);
          s.m.material.uniforms.uOpacity.value = 0.7 - i * 0.2;
        });
      } else {
        if (t - lastShell > 1.1) {
          const s = shells[si++ % shells.length];
          s.t0 = t;
          s.hit = false;
          s.o.copy(p);
          s.m.position.copy(p);
          s.m.visible = true;
          lastShell = t;
        }
        const antPos = P(antTip);
        for (const s of shells) {
          if (!s.m.visible) continue;
          const r = (t - s.t0) * 9;
          if (r > 62) {
            s.m.visible = false;
            continue;
          }
          s.m.scale.setScalar(Math.max(0.01, r));
          s.m.material.uniforms.uOpacity.value = Math.pow(1 - r / 62, 1.5) * 0.8;
          if (!s.hit && r >= s.o.distanceTo(antPos)) {
            s.hit = true;
            antFlash = t;
            packet(curveA, 2.8, C.data, () => {
              serverFlash = performance.now() / 1000;
              packet(curveC, 2.2, C.data, () => {
                phoneFlash = performance.now() / 1000;
              });
            });
          }
        }
        if (t - lastExt > 6) {
          lastExt = t;
          packet(curveB, 3.2, C.data, () => {
            serverFlash = performance.now() / 1000;
          });
        }
      }
      const now = performance.now() / 1000;
      for (let i = packets.length - 1; i >= 0; i--) {
        const k = packets[i];
        if (k.t0 === null) k.t0 = now;
        const q = (now - k.t0) / k.dur;
        if (q >= 1) {
          scene.remove(k.s);
          k.s.traverse(disposeObject);
          packets.splice(i, 1);
          k.onDone?.();
          continue;
        }
        const e = q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
        k.curve.getPointAt(e, tmp);
        k.s.position.copy(tmp);
      }
      const af = Math.max(0, 1 - (t - antFlash) / 0.9);
      antGlow.scale.setScalar(3.2 + af * 5);
      antRing.material.opacity = af * 0.9;
      antRing.scale.setScalar(1 + (1 - af) * 3);
      const sf = Math.max(0, 1 - (now - serverFlash) / 1.2);
      serverGlow.material.opacity = sf * 0.6;
      leds.forEach((l, i) => {
        l.visible = REDUCE || (t * 0.8 + i * 0.61) % 1 > 0.25 || sf > 0.2;
      });
      const pf = Math.max(0, 1 - (now - phoneFlash) / 1.6);
      phoneGlow.material.opacity = pf * 0.9;
      phone.position.y = 8 + Math.sin(t * 0.5) * 0.3;
      cloud.position.y = 18 + Math.sin(t * 0.5) * 0.3;
    });
  })();

  /* =========================================================
   KARTA: geometrija tranzita u 3D
   ========================================================= */
  (function mapScene() {
    const root = story.root.querySelector<HTMLElement>("#map3d");
    if (!root) return;
    const S = setup(root, 38);
    if (!S) return;
    const { scene, camera, controls, renderer, addLabel } = S;
    renderer.setClearColor(0x0a0f1c, 1);
    scene.fog = new THREE.Fog(0x0a0f1c, 60, 140);
    controls.maxPolarAngle = 1.38;
    scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x0a0f1c, 1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(-20, 40, 20);
    scene.add(sun);

    // podloga karte
    const mapTex = canvasTex(1024, 1024, (g, w, h) => {
      const R = rng(5),
        c = w / 2;
      g.fillStyle = "#0d1629";
      g.fillRect(0, 0, w, h);
      const city = g.createRadialGradient(c - 40, c + 30, 0, c - 40, c + 30, 260);
      city.addColorStop(0, "rgba(60,80,120,.45)");
      city.addColorStop(1, "rgba(60,80,120,0)");
      g.fillStyle = city;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "rgba(70,95,140,.35)";
      for (let i = 0; i < 26; i++) {
        g.lineWidth = 1 + R() * 2.5;
        g.beginPath();
        let x = c - 40 + (R() - 0.5) * 120,
          y = c + 30 + (R() - 0.5) * 120;
        g.moveTo(x, y);
        const a = R() * 7;
        for (let k = 0; k < 9; k++) {
          x += Math.cos(a + (R() - 0.5) * 0.8) * 60;
          y += Math.sin(a + (R() - 0.5) * 0.8) * 60;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      g.strokeStyle = "rgba(40,95,140,.45)";
      g.lineWidth = 11;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(0, c + 140);
      g.bezierCurveTo(c - 200, c + 60, c + 60, c + 220, w, c + 120);
      g.stroke();
      g.strokeStyle = "rgba(90,130,190,.12)";
      g.lineWidth = 1;
      for (let x = 0; x < w; x += 64) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, h);
        g.stroke();
      }
      for (let y = 0; y < h; y += 64) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
      const fade = g.createRadialGradient(c, c, w * 0.3, c, c, w * 0.5);
      fade.addColorStop(0, "rgba(10,15,28,0)");
      fade.addColorStop(1, "rgba(10,15,28,1)");
      g.fillStyle = fade;
      g.fillRect(0, 0, w, h);
    });
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(36, 96),
      new THREE.MeshBasicMaterial({ map: mapTex })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    function ring(r: number, color: number, dashed: boolean, opacity: number) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 160; i++) {
        const a = (i / 160) * Math.PI * 2;
        pts.push(V(Math.cos(a) * r, 0.05, Math.sin(a) * r));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = dashed
        ? new THREE.LineDashedMaterial({
            color,
            dashSize: 0.7,
            gapSize: 0.5,
            transparent: true,
            opacity,
          })
        : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
      const l = new THREE.Line(geo, mat);
      if (dashed) l.computeLineDistances();
      scene.add(l);
      return l;
    }
    ring(20, C.data, true, 0.85);
    ring(25, 0x6b7a99, false, 0.35);
    const r80 = new THREE.Object3D();
    r80.position.set(-14.1, 0, 14.1);
    scene.add(r80);
    const r100 = new THREE.Object3D();
    r100.position.set(-17.7, 0, 17.7);
    scene.add(r100);

    // promatrač
    const obs = new THREE.Group();
    scene.add(obs);
    const pin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 1.4, 12),
      new THREE.MeshStandardMaterial({ color: C.data, emissive: C.data, emissiveIntensity: 0.5 })
    );
    pin.position.y = 0.7;
    obs.add(pin);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 24, 16),
      new THREE.MeshStandardMaterial({ color: C.data, emissive: C.data, emissiveIntensity: 0.8 })
    );
    head.position.y = 1.5;
    obs.add(head);
    const pulse = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.72, 48),
      new THREE.MeshBasicMaterial({
        color: C.data,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    pulse.rotation.x = -Math.PI / 2;
    pulse.position.y = 0.06;
    obs.add(pulse);

    // Mjesec i linija pogleda
    const az = (128 * Math.PI) / 180,
      el = (22 * Math.PI) / 180;
    const dirH = V(Math.sin(az), 0, -Math.cos(az)),
      dirS = dirH
        .clone()
        .multiplyScalar(Math.cos(el))
        .add(V(0, Math.sin(el), 0))
        .normalize();
    const moon = makeMoon(3.4, 20);
    moon.position.copy(dirS.clone().multiplyScalar(78));
    scene.add(moon);
    moon.userData.surface.material.fog = false;
    moon.userData.halo.material.fog = false;
    const azLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        V(0, 0.06, 0),
        dirH.clone().multiplyScalar(36).setY(0.06),
      ]),
      new THREE.LineBasicMaterial({ color: C.moon, transparent: true, opacity: 0.7 })
    );
    scene.add(azLine);
    const sight = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([V(0, 1.5, 0), dirS.clone().multiplyScalar(76)]),
      new THREE.LineDashedMaterial({
        color: C.moon,
        dashSize: 0.8,
        gapSize: 0.6,
        transparent: true,
        opacity: 0.55,
      })
    );
    sight.computeLineDistances();
    scene.add(sight);
    // put Mjeseca po nebu
    {
      const pts: THREE.Vector3[] = [];
      for (let a = 60; a <= 300; a += 3) {
        const A = (a * Math.PI) / 180,
          E = (Math.sin(((a - 60) / 240) * Math.PI) * 30 * Math.PI) / 180,
          d = V(Math.sin(A) * Math.cos(E), Math.sin(E), -Math.cos(A) * Math.cos(E));
        pts.push(d.multiplyScalar(78));
      }
      const l = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineDashedMaterial({
          color: C.moon,
          dashSize: 1.6,
          gapSize: 1.4,
          transparent: true,
          opacity: 0.3,
          fog: false,
        })
      );
      l.computeLineDistances();
      scene.add(l);
    }
    // zelena zona: cijev oko linije pogleda + traka na tlu
    const s1 = 5 / Math.cos(el),
      s2 = 20 / Math.cos(el),
      len = s2 - s1;
    const corridor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, len, 32, 1, true),
      new THREE.MeshBasicMaterial({
        color: C.ok,
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    corridor.position.copy(dirS.clone().multiplyScalar((s1 + s2) / 2)).add(V(0, 1.5, 0));
    corridor.quaternion.setFromUnitVectors(V(0, 1, 0), dirS);
    scene.add(corridor);
    const bandGeo = new THREE.PlaneGeometry(15, 2.2);
    bandGeo.rotateX(-Math.PI / 2);
    const band = new THREE.Mesh(
      bandGeo,
      new THREE.MeshBasicMaterial({
        color: C.ok,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      })
    );
    band.position.copy(dirH.clone().multiplyScalar(12.5)).setY(0.07);
    band.rotation.y = Math.atan2(-dirH.z, dirH.x);
    scene.add(band);

    // avioni
    const deco = [
      { cs: "CTN472", km: 10.5, a1: 200, a2: 40, per: 30, off: 0.1 },
      { cs: "DLH6TA", km: 3.5, a1: 300, a2: 120, per: 26, off: 0.5 },
      { cs: "RYR4TP", km: 11.6, a1: 20, a2: 230, per: 34, off: 0.3 },
      { cs: "WZZ1QK", km: 6.4, a1: 110, a2: 280, per: 28, off: 0.75 },
      { cs: "OKTVR", km: 1.6, a1: 250, a2: 330, per: 22, off: 0.2 },
    ];
    const fleet: FleetEntry[] = [];
    function addFlight(f: SceneFlight, hero: boolean) {
      const y = f.km * 0.75,
        col = altColor(f.km);
      const obj = makePlane(col, hero);
      obj.scale.setScalar(hero ? 0.34 : 0.3 - f.km * 0.011);
      scene.add(obj);
      const dropGeo = new THREE.BufferGeometry().setFromPoints([V(0, 0, 0), V(0, 0, 0)]);
      const drop = new THREE.Line(
        dropGeo,
        new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.4 })
      );
      scene.add(drop);
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(0.28, 20),
        new THREE.MeshBasicMaterial({
          color: col,
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
        })
      );
      shadow.rotation.x = -Math.PI / 2;
      scene.add(shadow);
      const lbl = addLabel(
        L("", f.cs, Math.round(f.km) + " km"),
        obj,
        V(0, 1.1, 0),
        hero ? "lead" : "small"
      );
      const o: FleetEntry = { f, y, col, obj, drop, dropGeo, shadow, lbl, hero };
      fleet.push(o);
      return o;
    }
    deco.forEach(({ a1, a2, ...f }) => {
      const A = (a1 * Math.PI) / 180,
        B = (a2 * Math.PI) / 180;
      addFlight(
        {
          ...f,
          A: V(Math.cos(A) * 32, 0, Math.sin(A) * 32),
          B: V(Math.cos(B) * 32, 0, Math.sin(B) * 32),
        },
        false
      );
    });
    const heroKm = 8,
      heroY = heroKm * 0.75,
      sCross = (heroY - 1.5) / Math.tan(el);
    const P0 = dirH.clone().multiplyScalar(sCross),
      perp = V(-dirH.z, 0, dirH.x);
    const hf: SceneFlight = {
      cs: "KLM1023",
      km: heroKm,
      A: P0.clone().addScaledVector(perp, -24),
      B: P0.clone().addScaledVector(perp, 24),
      per: 34,
      off: 0,
    };
    addFlight(hf, true);
    const predGeo = new THREE.BufferGeometry().setFromPoints([V(0, 0, 0), V(0, 0, 0)]);
    const pred = new THREE.Line(
      predGeo,
      new THREE.LineDashedMaterial({ color: C.ok, dashSize: 0.35, gapSize: 0.25 })
    );
    scene.add(pred);
    const predEnd = new THREE.Object3D();
    scene.add(predEnd);
    const predLbl = addLabel("<b>+90 s</b>", predEnd, V(0, 0.5, 0), "mini ok");
    const hit = glow(C.ok, 0, 0.9);
    scene.add(hit);

    addLabel(() => `<b>${T("vi", "you")}</b>`, head, V(0, 0.9, 0), "mini");
    addLabel(() => `<b>${T("Mjesec", "Moon")}</b>`, moon, V(0, 5.5, 0), "mini");
    addLabel("<b>80 km</b>", r80, V(0, 0.3, 0), "mini cy");
    addLabel("<b>100 km</b>", r100, V(0, 0.3, 0), "mini");

    // pogledi
    const VIEWS = {
      d3: {
        pos: dirH
          .clone()
          .multiplyScalar(-30)
          .add(V(0, 15, 0))
          .addScaledVector(V(-dirH.z, 0, dirH.x), 12),
        tgt: dirH
          .clone()
          .multiplyScalar(14)
          .add(V(0, 8.5, 0)),
      },
      top: { pos: V(0, 62, 0.01), tgt: V(0, 0, 0) },
    };
    let tween: {
        t0: number;
        p0: THREE.Vector3;
        q0: THREE.Vector3;
        to: { pos: THREE.Vector3; tgt: THREE.Vector3 };
      } | null = null,
      view: keyof typeof VIEWS = "d3";
    camera.position.copy(VIEWS.d3.pos);
    controls.target.copy(VIEWS.d3.tgt);
    const btn3d = root.querySelector("#m-3d"),
      btnTop = root.querySelector("#m-top");
    function go(k: keyof typeof VIEWS) {
      view = k;
      tween = {
        t0: performance.now(),
        p0: camera.position.clone(),
        q0: controls.target.clone(),
        to: VIEWS[k],
      };
      btn3d?.setAttribute("aria-pressed", String(k === "d3"));
      btnTop?.setAttribute("aria-pressed", String(k === "top"));
    }
    btn3d?.addEventListener(
      "click",
      () => {
        go("d3");
      },
      { signal: story.signal }
    );
    btnTop?.addEventListener(
      "click",
      () => {
        go("top");
      },
      { signal: story.signal }
    );

    const tmp = V(0, 0, 0),
      dir = V(0, 0, 0);
    const distToSight = (p: THREE.Vector3) => {
      const q = p.clone().sub(V(0, 1.5, 0));
      const along = q.dot(dirS);
      return along < 0 ? 99 : q.sub(dirS.clone().multiplyScalar(along)).length();
    };
    S.run((t) => {
      if (tween) {
        const q = Math.min(1, (performance.now() - tween.t0) / (REDUCE ? 1 : 1100)),
          e = 1 - Math.pow(1 - q, 3);
        camera.position.lerpVectors(tween.p0, tween.to.pos, e);
        controls.target.lerpVectors(tween.q0, tween.to.tgt, e);
        if (q >= 1) tween = null;
      }
      const pq = REDUCE ? 0.5 : (t * 0.45) % 1;
      pulse.scale.setScalar(1 + pq * 3);
      pulse.material.opacity = (1 - pq) * 0.8;
      for (const o of fleet) {
        const f = o.f,
          u = REDUCE
            ? o.hero
              ? 0.47
              : (f.off + 0.3) % 1
            : ((t + (o.hero ? 12 : 0)) / (f.per * (o.hero ? 1 : 1.8)) + f.off) % 1;
        tmp.lerpVectors(f.A, f.B, u).setY(o.y);
        o.obj.position.copy(tmp);
        dir.subVectors(f.B, f.A).normalize();
        o.obj.lookAt(tmp.clone().add(dir));
        const fade = Math.pow(Math.sin(Math.PI * u), 0.35);
        o.obj.visible = fade > 0.05;
        o.dropGeo.attributes.position.setXYZ(0, tmp.x, tmp.y, tmp.z);
        o.dropGeo.attributes.position.setXYZ(1, tmp.x, 0.05, tmp.z);
        o.dropGeo.attributes.position.needsUpdate = true;
        o.drop.material.opacity = 0.4 * fade;
        o.shadow.position.set(tmp.x, 0.06, tmp.z);
        o.shadow.material.opacity = 0.45 * fade;
        o.lbl.show = o.obj.visible && (o.hero || view === "top");
        if (o.hero) {
          blink(o.obj, t);
          const d = distToSight(tmp);
          let minAhead = 99;
          for (let k = 0; k <= 12; k++)
            minAhead = Math.min(minAhead, distToSight(tmp.clone().addScaledVector(dir, k * 0.5)));
          const transit = d < 0.85,
            cand = !transit && minAhead < 0.85;
          o.obj.userData.mat.color.setHex(transit || cand ? C.ok : o.col);
          o.drop.material.color.setHex(transit || cand ? C.ok : o.col);
          o.lbl.el.querySelector(".s")!.textContent = transit
            ? T("TRANZIT", "TRANSIT")
            : cand
              ? "Transit Candidate"
              : Math.round(f.km) + " km";
          o.lbl.el.classList.toggle("ok", transit || cand);
          pred.visible = cand || transit;
          predLbl.show = cand;
          const end = tmp.clone().addScaledVector(dir, 6);
          predGeo.attributes.position.setXYZ(0, tmp.x, tmp.y, tmp.z);
          predGeo.attributes.position.setXYZ(1, end.x, end.y, end.z);
          predGeo.attributes.position.needsUpdate = true;
          pred.computeLineDistances();
          predEnd.position.copy(end);
          hit.position.copy(tmp);
          hit.scale.setScalar(transit ? 4 + Math.sin(t * 6) * 0.6 : 0);
          moon.userData.halo.material.opacity = transit ? 0.7 : 0.32;
        }
      }
    });
  })();

  return () => {
    for (const fn of cleanups.reverse()) fn();
  };
}
