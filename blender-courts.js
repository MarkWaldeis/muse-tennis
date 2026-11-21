import * as THREE from 'three';

const looks = {
  harbor: {
    floor: '#203e47', surface: '#267d9b', edge: '#196178',
    horizon: 0x637388, zenith: 0x09142f, low: 0x1d3349, fog: 0x4e657f,
    sun: 0xe5f5ff, fill: 0x88b9ff, shadow: 0x2d5361, exposure: 1.14, night: true
  },
  alpine: {
    floor: '#684e3b', surface: '#b95f37', edge: '#985738',
    horizon: 0xffd8aa, zenith: 0x74acd1, low: 0x597884, fog: 0xbcc4c2,
    sun: 0xffe2bc, fill: 0xd9ebff, shadow: 0x50644e, exposure: 1.12, night: false
  }
};
const imports = new Map();

function buildWaterMaterial(source, clock) {
  const material = source.clone();
  material.onBeforeCompile = shader => {
    shader.uniforms.waterTime = clock;
    shader.vertexShader = 'varying vec2 waterPosition;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\nwaterPosition = position.xz;'
    );
    shader.fragmentShader = 'varying vec2 waterPosition; uniform float waterTime;\n' +
      shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        float swells = sin(waterPosition.y * 1.2 + sin(waterPosition.x * .66) + waterTime * .62);
        float ripples = sin(waterPosition.y * 3.9 + waterPosition.x * .25 - waterTime * 1.7);
        float glints = pow(max(0., swells * .55 + ripples * .45), 7.0);
        diffuseColor.rgb *= .94 + .15 * swells;
        diffuseColor.rgb += vec3(.04,.09,.13) * glints;
      `);
  };
  return material;
}

export function loadBlenderCourt(map, loader) {
  if (!imports.has(map.id)) {
    imports.set(map.id, loader.loadAsync(map.glb).catch(error => {
      imports.delete(map.id);
      throw error;
    }));
  }
  return imports.get(map.id);
}

export function applyBlenderAtmosphere(scene, renderer, controls, id) {
  const look = looks[id];
  scene.background = new THREE.Color(look.horizon);
  scene.fog = new THREE.FogExp2(look.fog, look.night ? .007 : .0059);
  renderer.toneMappingExposure = look.exposure;
  controls.maxDistance = 90;
  controls.minDistance = 5;
}

function paintSurface(look, dimensions) {
  const c = document.createElement('canvas');
  c.width = 768;
  c.height = 1024;
  const ctx = c.getContext('2d');
  const w = c.width, h = c.height;
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, look.floor);
  gradient.addColorStop(1, look.edge);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  const x = (32 - dimensions.width) / 64 * w;
  const y = (41 - dimensions.length) / 82 * h;
  ctx.fillStyle = look.surface;
  ctx.fillRect(x, y, w - 2 * x, h - 2 * y);
  let state = 95;
  const random = () => ((state = Math.imul(state, 1664525) + 1013904223 | 0) >>> 0) / 4294967296;
  for (let i = 0; i < 22000; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(255,244,219,.09)' : 'rgba(19,26,27,.13)';
    ctx.fillRect(random() * w, random() * h, 1 + random() * 2.4, .65 + random() * 1.8);
  }
  for (let i = 0; i < 74; i++) {
    const sx = x + random() * (w - 2 * x);
    const sy = y + random() * (h - 2 * y);
    ctx.strokeStyle = look.night ? 'rgba(190,231,245,.05)' : 'rgba(81,37,18,.13)';
    ctx.lineWidth = .8 + random() * 1.4;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(sx + 6, sy - 4, sx + 14 + random() * 12, sy - 6);
    ctx.stroke();
  }
  ctx.fillStyle = look.night ? '#a0d7dc' : '#edbf94';
  ctx.textAlign = 'center';
  ctx.font = '700 26px system-ui';
  ctx.globalAlpha = .82;
  for (const flip of [false, true]) {
    ctx.save();
    ctx.translate(w / 2, flip ? h - 64 : 64);
    if (flip) ctx.rotate(Math.PI);
    ctx.fillText(look.night ? 'H A F E N  ·  A R E N A' : 'A L P E N  ·  C L U B', 0, 0);
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function createBlenderCourt(scene, dimensions, id, gltf, mobile) {
  const look = looks[id];
  const root = new THREE.Group();
  root.name = id + 'Arena';
  root.userData.arenaDecor = true;
  if (gltf) {
    const set = gltf.scene.clone(true);
    set.traverse(mesh => {
      if (!mesh.isMesh) return;
      mesh.receiveShadow = mesh.name === 'concrete';
      if (mesh.name === 'water') {
        root.userData.waterTime = { value: 0 };
        mesh.material = buildWaterMaterial(mesh.material, root.userData.waterTime);
      }
    });
    root.add(set);
  }

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(32, 41), new THREE.MeshStandardMaterial({
    map: paintSurface(look, dimensions), roughness: .93
  }));
  floor.name = 'courtSurface';
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = .001;
  floor.receiveShadow = true;
  root.add(floor);

  const sky = new THREE.Mesh(new THREE.SphereGeometry(255, 28, 14), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      horizon: { value: new THREE.Color(look.horizon) },
      zenith: { value: new THREE.Color(look.zenith) },
      low: { value: new THREE.Color(look.low) },
      night: { value: Number(look.night) }
    },
    vertexShader: `
      varying vec3 vDir;
      void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 horizon, zenith, low;
      uniform float night;
      void main() {
        vec3 d = normalize(vDir);
        vec3 sky = mix(horizon, zenith, smoothstep(0.0, .75, d.y));
        sky = mix(sky, low, smoothstep(.0, .19, -d.y));
        float glow = max(0.0, dot(d, normalize(vec3(-.62, .34, -.82))));
        sky += vec3(1.0,.66,.36) * pow(glow, 20.0) * (.28 - night * .22);
        sky += mix(vec3(1.0,.88,.63), vec3(.71,.87,1.0), night) * smoothstep(.9983, .9991, glow);
        vec2 grid = vec2(atan(d.z, d.x), asin(d.y)) * vec2(102.0, 115.0);
        float noise = fract(sin(dot(floor(grid), vec2(12.9898, 78.233))) * 43758.5453);
        sky += night * smoothstep(.13, .42, d.y) * step(.985, noise) *
          (1.0 - smoothstep(.04, .16, distance(fract(grid), vec2(.5)))) * vec3(.55,.64,.82);
        gl_FragColor = vec4(sky, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  }));
  sky.renderOrder = -100;
  root.add(sky);

  root.add(new THREE.HemisphereLight(look.fill, look.shadow, look.night ? 1.06 : 1.78));
  const key = new THREE.DirectionalLight(look.sun, look.night ? 2.18 : 2.75);
  key.position.set(-15, look.night ? 18 : 25, -22);
  key.castShadow = true;
  key.shadow.mapSize.setScalar(mobile ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -15, right: 15, top: 20, bottom: -20, near: 1, far: 66 });
  key.shadow.normalBias = .035;
  root.add(key);
  const rim = new THREE.DirectionalLight(look.fill, look.night ? 1.5 : .62);
  rim.position.set(16, 12, 18);
  root.add(rim);
  scene.add(root);
  return root;
}

export function updateBlenderCourt(arena, elapsed) {
  const time = arena?.userData?.waterTime;
  if (time) time.value = elapsed;
}
