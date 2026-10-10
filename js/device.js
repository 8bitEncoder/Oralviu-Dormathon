(() => {
  const { THREE } = window;
  const { i18n, ui, deviceModel } = window.Oraviu;
  const { t } = i18n;
  const { el } = ui;
  const { PARTS, createDevice } = deviceModel;

  const HOME_VIEW = [3.2, 0.55, 17.5];
  const FRONT_VIEW = [0, 0.15, 17.5];
  const SIDE_VIEW = [17.5, 0.15, 0];
  const CAMERA_EASING = 0.075;

  // Parts that can be seen with the shell closed. Selecting any other part opens the cutaway.
  const EXTERIOR_PARTS = ["housing", "lens", "led", "controls"];

  // How far each assembly moves at 100% explode, in model units.
  const SPREAD = {
    housing: [0, 0, 0],
    lens: [0, 0.55, 1.25],
    led: [0, 0.29, 0.73],
    camera: [-0.12, 0.13, -0.52],
    fpc: [-0.57, 0, 0.21],
    zif: [-0.47, -0.07, 0.57],
    pcb: [-0.4, -0.2, 0.34],
    soc: [0.42, -0.36, 1.04],
    battery: [0.48, -0.64, -0.22],
    batteryplug: [0.77, -0.38, 0.43],
    charge: [0, -0.7, 0.61],
    controls: [0.36, 0.08, 0.68]
  };

  // Camera distance after selecting a part. Parts not listed are small enough for the default.
  const ZOOM_DISTANCE = { housing: 17.5, pcb: 3.5, fpc: 5.2, battery: 5.2 };
  const DEFAULT_ZOOM_DISTANCE = 1.65;

  const viewer = document.querySelector("#viewer");
  const viewCaption = document.querySelector("#view-caption");
  const partList = document.querySelector("#part-list");
  const partCount = document.querySelector("#part-count");
  const partNumber = document.querySelector("#part-number");
  const partSystem = document.querySelector("#part-system");
  const partName = document.querySelector("#part-name");
  const partDetail = document.querySelector("#part-detail");
  const partBasis = document.querySelector("#part-basis");
  const isolateButton = document.querySelector("#isolate-button");
  const assemblyButton = document.querySelector("#assembly-button");
  const cutawayButton = document.querySelector("#cutaway-button");
  const explodeSlider = document.querySelector("#explode");
  const explodeValue = document.querySelector("#explode-value");
  const rotateButton = document.querySelector("#rotate-button");
  const blueprintDialog = document.querySelector("#blueprint-dialog");
  const blueprintImage = document.querySelector("#blueprint-image");

  const state = { selected: "housing", cutaway: false, isolate: false, explode: 0 };

  let renderer;

  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (error) {
    document.querySelector("#viewer-error").hidden = false;
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  viewer.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(...HOME_VIEW);

  const orbit = new THREE.OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.065;
  orbit.minDistance = 1.2;
  orbit.maxDistance = 24;
  orbit.autoRotateSpeed = 0.7;

  // The camera eases towards these two points on every frame unless the user is dragging.
  const cameraGoal = camera.position.clone();
  const targetGoal = new THREE.Vector3();

  const addLight = (color, intensity, position, castShadow = false) => {
    const light = new THREE.DirectionalLight(color, intensity);

    light.position.set(...position);
    light.castShadow = castShadow;

    if (castShadow) {
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.camera.left = -6;
      light.shadow.camera.right = 6;
      light.shadow.camera.top = 8;
      light.shadow.camera.bottom = -8;
      light.shadow.bias = -0.0007;
    }

    scene.add(light);
  };

  scene.add(new THREE.HemisphereLight(0xffffff, 0x55747a, 2.1));
  addLight(0xffffff, 3.2, [-3, 6, 6], true);
  addLight(0x95dce3, 1.8, [4, 2, 3]);
  addLight(0xffffff, 1.3, [2, 1, -5]);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.11 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -3.11;
  floor.receiveShadow = true;
  scene.add(floor);

  const rig = createDevice();
  scene.add(rig.root);

  const meshNamed = (name) => rig.components.find((mesh) => mesh.name === name);
  const shellMeshes = [rig.frontShell, rig.backShell, meshNamed("Inner wall"), meshNamed("Camera-head cap")];
  const shieldLid = meshNamed("Removable RF shield lid");

  const partButtons = PARTS.map((part, index) => {
    const label = el("span", { class: "part-list__label" });
    const button = el("button", { class: "part-list__item", type: "button" }, [
      el("span", { class: "part-list__number", text: String(index + 1).padStart(2, "0") }),
      label,
      el("span", { class: "part-list__marker", "aria-hidden": "true", text: "↗" })
    ]);

    button.addEventListener("click", () => {
      select(part.id);
      zoomTo(part.id);
    });
    partList.append(button);
    return { id: part.id, button, label };
  });

  const captionKey = () => {
    if (state.isolate) {
      return "device.caption.isolated";
    }

    if (state.cutaway) {
      return "device.caption.cutaway";
    }

    return state.explode > 0.01 ? "device.caption.exploded" : "device.caption.assembled";
  };

  const render = () => {
    const index = PARTS.findIndex((part) => part.id === state.selected);
    const part = PARTS[index];

    Object.entries(rig.groups).forEach(([id, group]) => {
      const [x, y, z] = SPREAD[id];

      group.position.set(x * state.explode, y * state.explode, z * state.explode);
      group.visible = !state.isolate || id === state.selected;
    });
    shellMeshes.forEach((mesh) => {
      mesh.visible = !state.cutaway;
    });

    // The lid comes off in the cutaway so the chip under it shows, and lifts clear of it when exploded.
    shieldLid.visible = !state.cutaway || state.explode > 0.01;
    shieldLid.position.set(state.explode * 0.25, -0.72, 0.142 + state.explode * 0.45);

    partButtons.forEach(({ id, button, label }) => {
      label.textContent = t(`device.part.${id}.label`);
      button.setAttribute("aria-pressed", String(id === state.selected));
    });
    partCount.textContent = t("device.tree.count", { n: PARTS.length });
    partNumber.textContent = `${String(index + 1).padStart(2, "0")} / ${PARTS.length}`;
    partSystem.textContent = t(`device.system.${part.system}`);
    partName.textContent = t(`device.part.${part.id}.label`);
    partDetail.textContent = t(`device.part.${part.id}.detail`);
    partBasis.textContent = t(`device.basis.${part.basis}`);

    isolateButton.textContent = t(state.isolate ? "device.inspector.showAll" : "device.inspector.isolate");
    isolateButton.setAttribute("aria-pressed", String(state.isolate));
    assemblyButton.setAttribute("aria-pressed", String(!state.cutaway));
    cutawayButton.setAttribute("aria-pressed", String(state.cutaway));
    explodeSlider.value = String(Math.round(state.explode * 100));
    explodeValue.textContent = `${Math.round(state.explode * 100)}%`;
    viewCaption.textContent = t(captionKey());
    blueprintImage.alt = t("device.blueprint.alt");
  };

  const holdCamera = () => {
    cameraGoal.copy(camera.position);
    targetGoal.copy(orbit.target);
  };

  const setRotating = (rotating) => {
    // Rotation moves the camera away from its goal, so stopping must not ease it back there.
    if (orbit.autoRotate && !rotating) {
      holdCamera();
    }

    orbit.autoRotate = rotating;
    rotateButton.setAttribute("aria-pressed", String(rotating));
  };

  const moveCamera = (position) => {
    setRotating(false);
    cameraGoal.set(...position);
    targetGoal.set(0, 0, 0);
  };

  const zoomTo = (id) => {
    const group = rig.groups[id];

    group.updateWorldMatrix(true, false);

    const centre = new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3());
    const direction = camera.position.clone().sub(orbit.target).normalize();

    targetGoal.copy(centre);
    cameraGoal.copy(centre).addScaledVector(direction, ZOOM_DISTANCE[id] ?? DEFAULT_ZOOM_DISTANCE);
  };

  const select = (id) => {
    state.selected = id;

    if (!EXTERIOR_PARTS.includes(id)) {
      state.cutaway = true;
    }

    setRotating(false);
    render();
  };

  assemblyButton.addEventListener("click", () => {
    state.cutaway = false;
    state.isolate = false;
    render();
  });

  cutawayButton.addEventListener("click", () => {
    state.cutaway = true;
    state.isolate = false;
    render();
  });

  isolateButton.addEventListener("click", () => {
    state.isolate = !state.isolate;
    render();
  });

  explodeSlider.addEventListener("input", () => {
    state.explode = Number(explodeSlider.value) / 100;
    render();
  });

  rotateButton.addEventListener("click", () => setRotating(!orbit.autoRotate));
  document.querySelector("#front-button").addEventListener("click", () => moveCamera(FRONT_VIEW));
  document.querySelector("#side-button").addEventListener("click", () => moveCamera(SIDE_VIEW));
  document.querySelector("#blueprint-button").addEventListener("click", () => blueprintDialog.showModal());

  document.querySelector("#reset-button").addEventListener("click", () => {
    Object.assign(state, { selected: "housing", cutaway: false, isolate: false, explode: 0 });
    render();
    moveCamera(HOME_VIEW);
  });

  blueprintDialog.addEventListener("click", (event) => {
    if (event.target === blueprintDialog) {
      blueprintDialog.close();
    }
  });

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pressPoint = null;
  let dragging = false;

  renderer.domElement.addEventListener("pointerdown", (event) => {
    pressPoint = [event.clientX, event.clientY];
    dragging = true;
    holdCamera();
  });

  renderer.domElement.addEventListener("pointerup", (event) => {
    dragging = false;
    holdCamera();

    // A press that moved is an orbit drag, not a click on a part.
    if (!pressPoint || Math.hypot(event.clientX - pressPoint[0], event.clientY - pressPoint[1]) > 5) {
      return;
    }

    const bounds = renderer.domElement.getBoundingClientRect();

    pressPoint = null;
    pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1
    );
    raycaster.setFromCamera(pointer, camera);

    const visibleMeshes = rig.components.filter((mesh) => mesh.visible && mesh.parent.visible);
    const [hit] = raycaster.intersectObjects(visibleMeshes, false);

    // Picking on the model selects the part where it is; only the assembly tree zooms in.
    if (hit) {
      select(hit.object.userData.part);
    }
  });

  orbit.addEventListener("end", () => {
    dragging = false;
    holdCamera();
  });

  const resize = () => {
    camera.aspect = viewer.clientWidth / viewer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(viewer.clientWidth, viewer.clientHeight, false);
  };

  const frame = () => {
    requestAnimationFrame(frame);

    if (!dragging && !orbit.autoRotate) {
      camera.position.lerp(cameraGoal, CAMERA_EASING);
      orbit.target.lerp(targetGoal, CAMERA_EASING);
    }

    orbit.update();
    renderer.render(scene, camera);
  };

  new ResizeObserver(resize).observe(viewer);
  i18n.onChange(render);

  resize();
  render();
  frame();
})();
