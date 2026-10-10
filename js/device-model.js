window.Oraviu = window.Oraviu || {};

(() => {
  const { THREE } = window;

  // The photographed prototype establishes the enclosure silhouette. Internal
  // construction follows the patent-style drawing where it is specified; the
  // exact board layout and connectors are labelled as proposed architecture.
  // The text shown for each part lives in i18n.js under the device.* keys.
  const PARTS = [
    { id: "housing", name: "Enclosure", system: "mechanical", basis: "photoSlide5" },
    { id: "lens", name: "Optical stack", system: "imaging", basis: "slide5" },
    { id: "led", name: "Spectral LED ring", system: "illumination", basis: "slides5and28" },
    { id: "camera", name: "Camera PCB + sensor", system: "imaging", basis: "slide5" },
    { id: "fpc", name: "Flex video cable", system: "signal", basis: "slide5" },
    { id: "zif", name: "FPC connector", system: "connector", basis: "proposed" },
    { id: "pcb", name: "Main PCB", system: "electronics", basis: "slide5Proposed" },
    { id: "soc", name: "Wi-Fi / BLE SoC", system: "wireless", basis: "slide5" },
    { id: "battery", name: "Li-Po battery", system: "power", basis: "slide5" },
    { id: "batteryplug", name: "Battery connector", system: "connector", basis: "proposed" },
    { id: "charge", name: "Charging interface", system: "connector", basis: "proposed" },
    { id: "controls", name: "Buttons + indicators", system: "input", basis: "photoSlide5" }
  ];

  const M = (color, roughness = 0.35, metalness = 0, extra = {}) =>
    new THREE.MeshPhysicalMaterial({
      color,
      roughness,
      metalness,
      clearcoat: 0.38,
      clearcoatRoughness: 0.25,
      ...extra
    });
  const pearl = M(0x6fc2c8, 0.32, 0.03),
    shellInner = M(0x57a5ab, 0.46, 0.02),
    seam = M(0x408a93, 0.4, 0.08);
  const rubber = M(0x314b53, 0.75, 0.01),
    dark = M(0x102a36, 0.24, 0.2),
    glass = M(0x07141d, 0.06, 0.25, { clearcoat: 1 });
  const metal = M(0xbccad0, 0.22, 0.78),
    gold = M(0xcaa556, 0.24, 0.68),
    pcbMat = M(0x205e59, 0.76, 0.08),
    copper = M(0xa98242, 0.3, 0.67);
  const black = M(0x20262d, 0.58, 0.02),
    white = M(0xf4fbf6, 0.23, 0),
    blue = M(0x256ad0, 0.22, 0),
    red = M(0xda4233, 0.22, 0),
    yellow = M(0xe4b837, 0.22, 0);

  function createDevice() {
    const root = new THREE.Group();
    root.name = "ORALVIU — detailed engineering concept";
    const groups = {};
    for (const p of PARTS) {
      const group = new THREE.Group();
      group.name = p.name;
      group.userData.part = p.id;
      groups[p.id] = group;
      root.add(group);
    }
    const components = [];
    function mesh(group, geometry, material, name, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
      const o = new THREE.Mesh(geometry, material);
      o.name = name;
      o.position.set(x, y, z);
      o.rotation.set(rx, ry, rz);
      o.userData.part = group.userData.part;
      group.add(o);
      components.push(o);
      return o;
    }
    function box(g, w, h, d, m, n, x, y, z) {
      return mesh(g, new THREE.BoxGeometry(w, h, d), m, n, x, y, z);
    }
    function cyl(g, rt, rb, h, m, n, x, y, z, rx = 0, ry = 0, rz = 0, s = 32) {
      return mesh(g, new THREE.CylinderGeometry(rt, rb, h, s), m, n, x, y, z, rx, ry, rz);
    }
    function ball(g, r, m, n, x, y, z) {
      return mesh(g, new THREE.SphereGeometry(r, 20, 14), m, n, x, y, z);
    }
    function torus(g, r, t, m, n, x, y, z, rx = 0) {
      return mesh(g, new THREE.TorusGeometry(r, t, 10, 48), m, n, x, y, z, rx);
    }
    function tube(g, points, r, m, n) {
      const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
      return mesh(g, new THREE.TubeGeometry(curve, Math.max(16, points.length * 6), r, 6, false), m, n);
    }

    // Dimensions are deliberately model units. The deck gives a Ø12 callout at
    // the optical tip but no complete dimension chain for the prototype.
    const profile = [
      [0.105, -3.04],
      [0.17, -3.0],
      [0.22, -2.86],
      [0.27, -2.48],
      [0.32, -1.95],
      [0.355, -1.33],
      [0.36, -0.7],
      [0.345, -0.12],
      [0.315, 0.22],
      [0.22, 0.64],
      [0.12, 0.92],
      [0.097, 1.15],
      [0.093, 1.8],
      [0.097, 2.48],
      [0.13, 2.67]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const backShell = mesh(
      groups.housing,
      new THREE.LatheGeometry(profile, 64, Math.PI, Math.PI),
      pearl.clone(),
      "Rear molded shell"
    );
    const frontShell = mesh(
      groups.housing,
      new THREE.LatheGeometry(profile, 64, 0, Math.PI),
      pearl.clone(),
      "Front molded shell"
    );
    backShell.rotation.y = Math.PI / 2;
    frontShell.rotation.y = Math.PI / 2;
    frontShell.userData.frontShell = true;
    const inner = mesh(
      groups.housing,
      new THREE.LatheGeometry(
        profile.map((v) => new THREE.Vector2(Math.max(0.04, v.x - 0.022), v.y)),
        48
      ),
      shellInner,
      "Inner wall"
    );
    inner.material = inner.material.clone();
    inner.material.side = THREE.BackSide;
    inner.userData.frontShell = true;
    for (const [y, r] of [
      [-2.52, 0.265],
      [-1.75, 0.325],
      [-0.85, 0.359]
    ])
      torus(groups.housing, r, 0.006, seam, "Shell seam / gasket", 0, y, 0, Math.PI / 2);
    for (const y of [-2.55, -1.12, 0.1]) {
      cyl(groups.housing, 0.055, 0.055, 0.05, shellInner, "Screw boss", -0.19, y, -0.08, Math.PI / 2);
      cyl(groups.housing, 0.024, 0.024, 0.056, metal, "Fastener", -0.19, y, -0.114, Math.PI / 2);
      box(groups.housing, 0.22, 0.035, 0.035, shellInner, "Cross rib", 0, y, -0.09);
    }
    // The shell remains closed around the camera head; the forward annular trim
    // is detachable in the exploded view.
    mesh(groups.housing, new THREE.CapsuleGeometry(0.164, 0.17, 8, 32), pearl, "Camera-head cap", 0, 2.63, 0);
    cyl(groups.housing, 0.157, 0.157, 0.072, seam, "Head rim", 0, 2.73, 0.126, Math.PI / 2);

    // Camera optical assembly and front glass.
    cyl(groups.lens, 0.092, 0.105, 0.095, metal, "Machined lens barrel", 0, 2.73, 0.176, Math.PI / 2);
    cyl(groups.lens, 0.068, 0.075, 0.02, dark, "Front lens retainer", 0, 2.73, 0.232, Math.PI / 2);
    ball(groups.lens, 0.055, glass, "Curved optical element", 0, 2.73, 0.244);
    torus(groups.lens, 0.084, 0.008, rubber, "Lens O-ring", 0, 2.73, 0.239);
    ball(groups.lens, 0.013, M(0x5fc6d9, 0.04, 0.08), "Lens reflection", -0.019, 2.749, 0.284);

    // Annular multi-spectral board. These emitter colors illustrate slide 28;
    // optical power and wavelengths are deliberately not asserted.
    cyl(groups.led, 0.151, 0.151, 0.025, pcbMat, "Ring light PCB", 0, 2.73, 0.165, Math.PI / 2);
    torus(groups.led, 0.121, 0.013, white, "Diffuser ring", 0, 2.73, 0.186);
    const spectra = [white, white, red, white, blue, white, yellow, white];
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4,
        x = Math.sin(a) * 0.12,
        y = 2.73 + Math.cos(a) * 0.12;
      box(groups.led, 0.031, 0.025, 0.012, spectra[i], `LED ${i + 1}`, x, y, 0.193);
      box(groups.led, 0.041, 0.006, 0.004, gold, "LED copper pads", x, y - 0.02, 0.188);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + 0.4;
      ball(groups.led, 0.009, metal, "LED board screw", Math.sin(a) * 0.146, 2.73 + Math.cos(a) * 0.146, 0.187);
    }

    // Separate camera sensor PCB and imager, behind the optical train.
    cyl(groups.camera, 0.125, 0.125, 0.027, pcbMat, "Circular camera PCB", 0, 2.73, 0.016, Math.PI / 2);
    box(groups.camera, 0.104, 0.104, 0.022, black, "Image sensor package", 0, 2.73, 0.05);
    box(groups.camera, 0.052, 0.052, 0.004, glass, "Sensor die", 0, 2.73, 0.064);
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      ball(groups.camera, 0.006, gold, "Sensor board via", Math.sin(a) * 0.095, 2.73 + Math.cos(a) * 0.095, 0.043);
    }
    box(groups.camera, 0.092, 0.025, 0.032, dark, "Camera-board flex socket", 0, 2.57, -0.028);

    // Amber FPC and visible copper conductors from the camera tip to the
    // control board. A folded boot shows the strain relief at each end.
    const flex = M(0xb87936, 0.47, 0.08, { transparent: true, opacity: 0.88 });
    box(groups.fpc, 0.085, 2.22, 0.012, flex, "Polyimide flex substrate", 0, 1.35, -0.012);
    for (let i = -3; i <= 3; i++)
      box(groups.fpc, 0.004, 2.12, 0.002, copper, `Video / control trace ${i + 4}`, i * 0.011, 1.35, -0.003);
    box(groups.fpc, 0.108, 0.18, 0.015, flex, "Lower flex fold", 0, 0.22, 0.015);
    box(groups.fpc, 0.1, 0.15, 0.014, flex, "Tip flex fold", 0, 2.53, -0.01);
    for (const y of [0.22, 2.52]) box(groups.fpc, 0.097, 0.035, 0.009, gold, "FPC contact fingers", 0, y, 0.027);

    // Main PCB: proposed component placement and illustrative routing.
    const boardGreen = M(0x123e32, 0.66, 0.04);
    const pcbSolder = M(0xcbd1d5, 0.24, 0.8);
    const pcbCeramic = M(0xb9a17b, 0.62, 0.02);
    const silkMaterial = M(0xe4eee3, 0.85, 0);
    const pcbTrace = M(0x719266, 0.55, 0.22);

    // Rounded FR-4 board, real through-holes and a beveled perimeter.
    const outline = new THREE.Shape();
    const bw = 0.145,
      bh = 0.845,
      br = 0.025;
    outline.moveTo(-bw + br, -bh);
    outline.lineTo(bw - br, -bh);
    outline.quadraticCurveTo(bw, -bh, bw, -bh + br);
    outline.lineTo(bw, bh - br);
    outline.quadraticCurveTo(bw, bh, bw - br, bh);
    outline.lineTo(-bw + br, bh);
    outline.quadraticCurveTo(-bw, bh, -bw, bh - br);
    outline.lineTo(-bw, -bh + br);
    outline.quadraticCurveTo(-bw, -bh, -bw + br, -bh);
    for (const x of [-0.106, 0.106])
      for (const y of [-0.765, 0.765]) {
        const hole = new THREE.Path();
        hole.absarc(x, y, 0.011, 0, Math.PI * 2, true);
        outline.holes.push(hole);
      }
    mesh(
      groups.pcb,
      new THREE.ExtrudeGeometry(outline, {
        depth: 0.037,
        bevelEnabled: true,
        bevelSize: 0.002,
        bevelThickness: 0.002,
        bevelSegments: 2,
        steps: 1,
        curveSegments: 12
      }),
      boardGreen,
      "Rounded FR-4 main board",
      0,
      -0.81,
      -0.026
    );

    // Copper annuli around the mounting holes.
    for (const x of [-0.106, 0.106])
      for (const y of [-1.575, -0.045])
        torus(groups.pcb, 0.014, 0.0025, gold, "Mounting-hole plated annulus", x, y, 0.015);

    function pcbRoute(name, points, width = 0.003) {
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i];
        const dx = b[0] - a[0],
          dy = b[1] - a[1];
        const segment = box(
          groups.pcb,
          Math.hypot(dx, dy),
          width,
          0.0015,
          pcbTrace,
          name,
          (a[0] + b[0]) / 2,
          (a[1] + b[1]) / 2,
          0.017
        );
        segment.rotation.z = Math.atan2(dy, dx);
      }
    }
    function pcbVia(x, y, name = "Plated ground via") {
      torus(groups.pcb, 0.0038, 0.0011, gold, name, x, y, 0.017);
      cyl(groups.pcb, 0.0025, 0.0025, 0.001, dark, "Via drill opening", x, y, 0.017, Math.PI / 2);
    }
    function pcbPassive(name, x, y, w = 0.018, h = 0.011, material = pcbCeramic) {
      for (const side of [-1, 1]) {
        box(groups.pcb, 0.007, h + 0.004, 0.002, gold, name + " copper land", x + side * w * 0.48, y, 0.017);
        box(groups.pcb, 0.004, h + 0.001, 0.006, pcbSolder, name + " solder fillet", x + side * w * 0.48, y, 0.021);
      }
      box(groups.pcb, w * 0.72, h, 0.009, material, name + " body", x, y, 0.025);
      for (const side of [-1, 1])
        box(groups.pcb, 0.003, h, 0.01, pcbSolder, name + " end termination", x + side * w * 0.36, y, 0.025);
    }
    function pcbIC(name, x, y, w, h, pins) {
      box(groups.pcb, w, h, 0.017, black, name + " molded package", x, y, 0.03);
      cyl(
        groups.pcb,
        0.003,
        0.003,
        0.001,
        silkMaterial,
        name + " pin-one mark",
        x - w * 0.32,
        y + h * 0.3,
        0.039,
        Math.PI / 2
      );
      for (let i = 0; i < pins; i++) {
        const offset = (i - (pins - 1) / 2) * ((h * 0.75) / pins);
        for (const side of [-1, 1]) {
          box(
            groups.pcb,
            0.018,
            0.005,
            0.002,
            gold,
            name + " landing pad",
            x + side * (w / 2 + 0.007),
            y + offset,
            0.017
          );
          box(
            groups.pcb,
            0.014,
            0.004,
            0.006,
            pcbSolder,
            name + " gull-wing lead",
            x + side * (w / 2 + 0.004),
            y + offset,
            0.022
          );
        }
      }
      for (let i = 0; i < 2; i++)
        box(groups.pcb, w * 0.58, 0.0015, 0.001, silkMaterial, name + " etched marking", x, y + i * 0.006, 0.039);
    }

    // Compact printed identifiers, built as exportable vector geometry.
    const pcbFont = {
      U: "101/101/101/101/111",
      R: "110/101/110/101/101",
      C: "111/100/100/100/111",
      L: "100/100/100/100/111",
      Y: "101/101/010/010/010",
      J: "001/001/001/101/111",
      T: "111/010/010/010/010",
      P: "110/101/110/100/100",
      0: "111/101/101/101/111",
      1: "010/110/010/010/111",
      2: "110/001/010/100/111",
      3: "110/001/010/001/110",
      4: "101/101/111/001/001",
      5: "111/100/110/001/110",
      6: "011/100/111/101/111",
      7: "111/001/010/010/010",
      8: "111/101/111/101/111",
      9: "111/101/111/001/110"
    };
    function pcbLabel(text, x, y) {
      const vertices = [],
        pixel = 0.0016;
      [...text].forEach((ch, k) => {
        (pcbFont[ch] || "000/000/000/000/000").split("/").forEach((row, r) => {
          [...row].forEach((bit, c) => {
            if (bit !== "1") return;
            const xx = x + (k * 4 + c) * pixel,
              yy = y - r * pixel,
              s = pixel * 0.8,
              z = 0.019;
            vertices.push(xx, yy, z, xx + s, yy, z, xx + s, yy + s, z, xx, yy, z, xx + s, yy + s, z, xx, yy + s, z);
          });
        });
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      geometry.computeVertexNormals();
      mesh(groups.pcb, geometry, silkMaterial, "Silkscreen " + text);
    }

    // RF area: printed antenna, matching parts and crystal.
    pcbRoute(
      "Printed RF antenna",
      [
        [-0.085, -0.1],
        [-0.085, -0.065],
        [0.06, -0.065],
        [0.06, -0.09],
        [-0.04, -0.09],
        [-0.04, -0.115],
        [0.085, -0.115]
      ],
      0.0045
    );
    for (let i = 0; i < 3; i++) {
      pcbPassive(
        "RF matching component " + (i + 1),
        -0.06 + i * 0.055,
        -0.2,
        0.014,
        0.008,
        i === 1 ? black : pcbCeramic
      );
      pcbLabel("C" + (i + 1), -0.068 + i * 0.055, -0.225);
    }
    box(groups.pcb, 0.058, 0.032, 0.012, metal, "Y1 metal-can crystal", 0.05, -0.32, 0.025);
    for (const x of [0.021, 0.079])
      box(groups.pcb, 0.009, 0.018, 0.004, pcbSolder, "Crystal solder pad", x, -0.32, 0.02);
    pcbLabel("Y1", 0.033, -0.353);
    pcbIC("U2 camera interface", -0.045, -0.415, 0.059, 0.066, 5);
    pcbLabel("U2", -0.062, -0.465);

    // Power section: regulator, shielded inductor, diode and capacitors.
    pcbIC("U3 power-management IC", 0.048, -1.175, 0.062, 0.076, 6);
    pcbLabel("U3", 0.035, -1.229);
    box(groups.pcb, 0.057, 0.055, 0.029, dark, "L1 shielded power inductor", -0.059, -1.055, 0.032);
    box(groups.pcb, 0.029, 0.025, 0.001, metal, "Inductor top marking", -0.059, -1.055, 0.047);
    for (const side of [-1, 1])
      box(groups.pcb, 0.009, 0.038, 0.004, pcbSolder, "Inductor solder terminal", -0.059 + side * 0.031, -1.055, 0.019);
    pcbLabel("L1", -0.071, -1.095);
    pcbPassive("Power diode", 0.069, -1.032, 0.028, 0.014, black);
    box(groups.pcb, 0.003, 0.014, 0.001, silkMaterial, "Diode polarity stripe", 0.076, -1.032, 0.031);

    const pcbParts = [
      ["C4", -0.08, -0.3],
      ["C5", -0.086, -0.515],
      ["C6", 0.083, -0.495],
      ["C7", -0.091, -0.95],
      ["C8", 0.062, -0.95],
      ["C9", -0.072, -1.18],
      ["C10", -0.057, -1.27],
      ["C11", 0.069, -1.46],
      ["R1", -0.06, -1.49],
      ["R2", -0.012, -1.49],
      ["R3", -0.08, -1.4],
      ["R4", 0.09, -0.395]
    ];
    for (const [name, x, y] of pcbParts) {
      pcbPassive(name, x, y, 0.019, 0.011, name[0] === "R" ? black : pcbCeramic);
      pcbLabel(name, x - 0.012, y - 0.024);
    }

    // Representative routing between the connector and functional regions.
    pcbRoute("Camera interface route", [
      [0, -0.012],
      [-0.13, -0.012],
      [-0.13, -0.415],
      [-0.085, -0.415]
    ]);
    pcbRoute("RF feed", [
      [0.085, -0.115],
      [0.085, -0.2],
      [0.13, -0.2],
      [0.13, -0.56],
      [0.1, -0.56]
    ]);
    pcbRoute(
      "Module supply route",
      [
        [0.1, -0.87],
        [0.13, -0.87],
        [0.13, -1.175],
        [0.093, -1.175]
      ],
      0.005
    );
    pcbRoute(
      "Regulator to inductor",
      [
        [0.003, -1.175],
        [-0.025, -1.175],
        [-0.025, -1.055]
      ],
      0.006
    );
    pcbRoute(
      "Battery supply route",
      [
        [0, -1.36],
        [0.124, -1.36],
        [0.124, -1.2],
        [0.093, -1.2]
      ],
      0.006
    );
    pcbRoute(
      "Charging supply route",
      [
        [0.09, -1.635],
        [0.09, -1.48],
        [0.124, -1.48],
        [0.124, -1.36]
      ],
      0.006
    );
    pcbRoute("Camera signal route A", [
      [-0.085, -0.4],
      [-0.112, -0.4],
      [-0.112, -0.55],
      [-0.09, -0.55]
    ]);
    pcbRoute("Camera signal route B", [
      [-0.085, -0.425],
      [-0.12, -0.425],
      [-0.12, -0.57],
      [-0.09, -0.57]
    ]);
    pcbRoute("Control route", [
      [0.105, -0.3],
      [0.119, -0.3],
      [0.119, -0.49],
      [0.105, -0.49]
    ]);

    // Edge stitching, labeled test pads and connector identification.
    for (let y = -1.5; y < -0.15; y += 0.082) {
      pcbVia(-0.135, y);
      pcbVia(0.135, y);
    }
    for (const [i, x, y] of [
      [1, -0.06, -1.535],
      [2, 0, -1.535],
      [3, 0.06, -1.535]
    ]) {
      cyl(groups.pcb, 0.007, 0.007, 0.002, gold, "TP" + i + " exposed test pad", x, y, 0.018, Math.PI / 2);
      pcbLabel("TP" + i, x - 0.01, y - 0.02);
    }
    pcbLabel("J1", -0.035, -0.035);
    pcbLabel("J2", -0.025, -1.42);
    // Main wireless SoC: proposed module construction, not a selected part.
    const moduleBoard = M(0x173d36, 0.65, 0.05);
    const solder = M(0xd5d8db, 0.28, 0.8);
    const ceramic = M(0xbda781, 0.65, 0.02);
    const chipInk = M(0xadb4b5, 0.8, 0);
    box(groups.soc, 0.258, 0.344, 0.018, moduleBoard, "Wireless module substrate", 0, -0.72, 0.052);

    // QFN package, exposed thermal pad, pin-one mark and etched legends.
    box(groups.soc, 0.148, 0.154, 0.026, black, "Wireless SoC QFN package", 0, -0.705, 0.089);
    box(groups.soc, 0.086, 0.092, 0.003, solder, "Underside thermal ground pad", 0, -0.705, 0.074);
    cyl(groups.soc, 0.005, 0.005, 0.001, chipInk, "Pin-one orientation mark", -0.059, -0.647, 0.103, Math.PI / 2);
    for (let i = 0; i < 3; i++)
      box(
        groups.soc,
        0.086 - i * 0.015,
        0.002,
        0.001,
        chipInk,
        "Laser-etched package legend",
        -0.007,
        -0.678 - i * 0.012,
        0.103
      );
    for (let i = 0; i < 7; i++)
      box(groups.soc, 0.003, 0.005, 0.001, chipInk, "Package lot-code mark", -0.04 + i * 0.011, -0.739, 0.103);

    // Separate pads, contacts and solder fillets around all four edges.
    for (let i = 0; i < 10; i++) {
      const p = (i - 4.5) * 0.013;
      for (const side of [-1, 1]) {
        box(groups.soc, 0.008, 0.022, 0.002, gold, "North/south PCB landing pad", p, -0.705 + side * 0.085, 0.062);
        box(groups.soc, 0.007, 0.013, 0.009, solder, "North/south solder joint", p, -0.705 + side * 0.08, 0.07);
        box(groups.soc, 0.022, 0.008, 0.002, gold, "East/west PCB landing pad", side * 0.082, -0.705 + p, 0.062);
        box(groups.soc, 0.013, 0.007, 0.009, solder, "East/west solder joint", side * 0.077, -0.705 + p, 0.07);
      }
    }

    // Decoupling capacitors with metal end caps; nearby resistor bank.
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 0.037;
      box(groups.soc, 0.019, 0.012, 0.009, ceramic, "Decoupling capacitor body", x, -0.823, 0.067);
      for (const end of [-1, 1])
        box(groups.soc, 0.004, 0.014, 0.01, solder, "Capacitor termination", x + end * 0.009, -0.823, 0.067);
      box(groups.soc, 0.015, 0.008, 0.007, black, "Configuration resistor", x, -0.855, 0.066);
      for (const end of [-1, 1])
        box(groups.soc, 0.003, 0.009, 0.008, solder, "Resistor termination", x + end * 0.007, -0.855, 0.066);
    }
    box(groups.soc, 0.041, 0.022, 0.012, metal, "Shielded reference crystal", 0.078, -0.595, 0.069);
    box(groups.soc, 0.024, 0.002, 0.001, dark, "Crystal etched marking", 0.078, -0.595, 0.076);
    for (let i = 0; i < 4; i++)
      box(
        groups.soc,
        0.009,
        0.013,
        0.008,
        i % 2 ? ceramic : black,
        "RF matching component",
        -0.074 + i * 0.028,
        -0.595,
        0.067
      );

    // Ground stitching and fine module routing.
    for (let i = 0; i < 11; i++) {
      for (const side of [-1, 1]) {
        cyl(
          groups.soc,
          0.0035,
          0.0035,
          0.001,
          gold,
          "Ground-stitch via",
          side * 0.117,
          -0.865 + i * 0.028,
          0.062,
          Math.PI / 2
        );
      }
    }
    for (let i = 0; i < 6; i++) {
      box(groups.soc, 0.003, 0.026, 0.001, copper, "Module signal trace", (i - 2.5) * 0.025, -0.793, 0.062);
    }

    // Soldered shield frame and independently movable lid.
    for (const side of [-1, 1]) {
      box(groups.soc, 0.006, 0.33, 0.035, metal, "RF shield side wall", side * 0.126, -0.72, 0.078);
      box(groups.soc, 0.252, 0.006, 0.035, metal, "RF shield end wall", 0, -0.72 + side * 0.162, 0.078);
    }
    box(groups.soc, 0.26, 0.348, 0.008, metal, "Removable RF shield lid", 0, -0.72, 0.142);
    // Flip-lock camera FPC termination on the PCB.
    box(groups.zif, 0.18, 0.083, 0.047, white, "ZIF connector body", 0, 0.055, 0.053);
    box(groups.zif, 0.18, 0.025, 0.012, dark, "Hinged locking bar", 0, 0.095, 0.082);
    for (let i = -5; i <= 5; i++) box(groups.zif, 0.007, 0.045, 0.003, gold, "ZIF contact", i * 0.013, 0.045, 0.078);
    box(groups.zif, 0.1, 0.026, 0.012, flex, "Inserted flex tongue", 0, 0.007, 0.077);

    // Battery pouch, protection tab, leads and mating service connector.
    const pouch = M(0xaab9c5, 0.49, 0.48),
      label = M(0xe8eff1, 0.67, 0.05);
    box(groups.battery, 0.28, 1.12, 0.152, pouch, "Lithium-polymer pouch cell", 0, -2.22, -0.07);
    box(groups.battery, 0.238, 0.94, 0.003, label, "Battery label panel", 0, -2.22, 0.011);
    box(groups.battery, 0.13, 0.075, 0.045, black, "Battery protection board", 0, -1.62, -0.05);
    tube(
      groups.battery,
      [
        [-0.045, -1.66, 0.028],
        [-0.064, -1.5, 0.06],
        [-0.085, -1.36, 0.07]
      ],
      0.012,
      red,
      "Battery positive lead"
    );
    tube(
      groups.battery,
      [
        [0.045, -1.66, 0.028],
        [0.064, -1.5, 0.06],
        [0.085, -1.36, 0.07]
      ],
      0.012,
      black,
      "Battery negative lead"
    );
    box(groups.batteryplug, 0.134, 0.068, 0.054, white, "Keyed battery plug", 0, -1.36, 0.072);
    box(groups.batteryplug, 0.151, 0.083, 0.038, metal, "PCB battery receptacle", 0, -1.36, 0.033);
    for (const x of [-0.038, 0.038])
      box(groups.batteryplug, 0.02, 0.025, 0.008, gold, "Battery connector contact", x, -1.36, 0.104);

    // USB-C-like connector and surrounding elastomer gasket. This remains a
    // concept because no charging connector is identified in the source deck.
    box(groups.charge, 0.183, 0.063, 0.1, metal, "Charging receptacle shell", 0, -2.986, 0.034);
    box(groups.charge, 0.136, 0.03, 0.022, dark, "Connector cavity", 0, -3.02, 0.083);
    box(groups.charge, 0.108, 0.008, 0.014, white, "Connector tongue", 0, -3.019, 0.095);
    for (let i = -3; i <= 3; i++)
      box(groups.charge, 0.008, 0.003, 0.003, gold, "Charging pin", i * 0.014, -3.013, 0.104);
    torus(groups.charge, 0.127, 0.012, rubber, "Port seal", 0, -2.99, 0.082, Math.PI / 2);
    box(groups.charge, 0.22, 0.025, 0.11, seam, "Base strain and splash lip", 0, -2.97, -0.013);

    // Three circular exterior buttons echo the real photographed prototype.
    const controls = [
      ["POWER", -0.04],
      ["CAPTURE", -0.57],
      ["COLOR", -1.12]
    ];
    for (const [name, y] of controls) {
      cyl(groups.controls, 0.087, 0.087, 0.022, seam, `${name} bezel`, 0, y, 0.349, Math.PI / 2);
      cyl(groups.controls, 0.064, 0.064, 0.018, pearl, `${name} button`, 0, y, 0.369, Math.PI / 2);
      torus(groups.controls, 0.035, 0.003, dark, `${name} engraved ring`, 0, y, 0.383);
      box(groups.controls, 0.092, 0.045, 0.026, black, `${name} tactile switch`, 0, y, 0.117);
      box(groups.controls, 0.125, 0.055, 0.008, metal, `${name} switch contact`, 0, y, 0.103);
    }
    for (let i = 0; i < 2; i++) {
      ball(groups.controls, 0.018, i === 0 ? blue : yellow, "Status light pipe", 0, -1.52 - i * 0.13, 0.343);
      box(groups.controls, 0.037, 0.038, 0.018, white, "Indicator LED", 0, -1.52 - i * 0.13, 0.122);
    }
    // Debossed marks (fine geometric details, not substitute for real legends).
    box(groups.controls, 0.008, 0.031, 0.003, dark, "Power glyph stem", 0, -0.027, 0.385);
    torus(groups.controls, 0.018, 0.003, dark, "Capture glyph", 0, -0.57, 0.385);
    ball(groups.controls, 0.009, dark, "Color-mode glyph", 0, -1.12, 0.385);

    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    const basePositions = Object.fromEntries(Object.entries(groups).map(([id, g]) => [id, g.position.clone()]));
    return { root, groups, components, frontShell, backShell, basePositions };
  }

  window.Oraviu.deviceModel = { PARTS, createDevice };
})();
