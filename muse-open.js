import * as THREE from 'three';

const SUN = new THREE.Vector3(-24, 40, 18);
const WIDTH = 20.4;
const LENGTH = 37.1;
const SHADOW_CASTERS = new Set([
  'roof_shadow', 'roof_metal', 'concrete', 'pale', 'green', 'steel', 'screen_frame', 'wood', 'cedar', 'fabric', 'burgundy'
]);
const MATERIAL_GRAIN = new Map([
  ['concrete', .14], ['concrete_dark', .11], ['pale', .095], ['roof_shadow', .09], ['green', .055]
]);
const ASSET = './assets/muse-open-';
let assets;

function seededRandom(seed) {
  return () => ((seed = Math.imul(seed, 1664525) + 1013904223 | 0) >>> 0) / 4294967296;
}

export function loadMuseOpen(map, loader) {
  assets ??= Promise.all([
    loader.loadAsync(map.glb),
    fetch(ASSET + 'seats.bin').then(response => {
      if (!response.ok) throw new Error('Tribünenplan ist nicht verfügbar');
      return response.arrayBuffer();
    }),
    new THREE.TextureLoader().loadAsync(ASSET + 'crowd.webp')
  ]).then(([stadium, layout, atlas]) => {
    atlas.colorSpace = THREE.SRGBColorSpace;
    atlas.anisotropy = 4;
    return { stadium, layout: new DataView(layout), atlas };
  }).catch(error => { assets = null; throw error; });
  return assets;
}

export function applyMuseOpenAtmosphere(scene, renderer, controls) {
  scene.background = new THREE.Color(0x9ab6d0);
  scene.fog = new THREE.Fog(0xb3c1cb, 89, 170);
  renderer.toneMappingExposure = 1.12;
  controls.maxDistance = 73;
  controls.minDistance = 5;
}

function concreteGrain(material, amount) {
  const result = material.clone();
  result.onBeforeCompile = shader => {
    shader.uniforms.grainStrength = { value: amount };
    shader.vertexShader = 'varying vec3 stadiumPosition;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\nstadiumPosition = position;'
    );
    shader.fragmentShader = 'varying vec3 stadiumPosition; uniform float grainStrength;\n' +
      shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        vec3 d = stadiumPosition;
        float speckle = fract(sin(dot(floor(d * 37.0), vec3(27.1, 11.7, 71.9))) * 4543.7);
        float broad = sin(d.x * 1.1 + sin(d.z * 2.6) + d.y * 7.5) * sin(d.x * 1.9 + d.z * 2.75);
        diffuseColor.rgb *= 1.0 + grainStrength * ((speckle - .5) * .48 + broad * .54);
      `);
  };
  return result;
}

function clayTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1536;
  const ctx = canvas.getContext('2d');
  const random = seededRandom(8226);
  const w = canvas.width, h = canvas.height;
  const image = ctx.createImageData(w, h);
  const columns = 64;
  const smudges = Array.from({ length: columns * 97 }, () => random() - .5);
  for (let y = 0; y < h; y++) {
    const gy = y / 16, row = Math.floor(gy);
    const relativeY = Math.abs(y / h - .5);
    for (let x = 0; x < w; x++) {
      const gx = x * (columns - 1) / w, col = Math.floor(gx), cell = row * columns + col;
      const streak = .9 * Math.sin(x * .115) + .6 * Math.sin(x * .031 + y * .01);
      const left = THREE.MathUtils.lerp(smudges[cell], smudges[cell + columns], gy - row);
      const right = THREE.MathUtils.lerp(smudges[cell + 1], smudges[cell + 1 + columns], gy - row);
      const aggregate = (random() - .5) * 12 + THREE.MathUtils.lerp(left, right, gx - col) * 9;
      const apron = Math.max(0, Math.abs(x / w - .5) - .36) * 61 + Math.max(0, relativeY - .42) * 76;
      const wear = Math.max(0, 1 - Math.abs(relativeY - .322) / .055) * (2 + 2 * Math.sin(x * .018));
      const value = aggregate + streak + wear - apron;
      const i = (y * w + x) * 4;
      image.data[i] = 172 + value;
      image.data[i + 1] = 91 + value * .8;
      image.data[i + 2] = 54 + value * .61;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  for (let i = 0; i < 480; i++) {
    const x = .2 * w + random() * .6 * w;
    const y = (i % 2 ? h * .18 : h * .82) + (random() - .5) * h * .16;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((random() - .5) * 3.3);
    ctx.fillStyle = i % 2 ? 'rgba(236,146,100,.08)' : 'rgba(83,38,24,.075)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 2 + random() * 3.8, 4 + random() * 5.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function addSky(root) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, toneMapped: false,
    uniforms: {
      horizon: { value: new THREE.Color(0xd7e3ed) },
      top: { value: new THREE.Color(0x74a9d9) }
    },
    vertexShader: `
      varying vec3 ray;
      void main() { ray = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
      varying vec3 ray;
      uniform vec3 horizon, top;
      float hash(vec2 c) { return fract(sin(dot(c, vec2(12.9898,78.233))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
      }
      void main() {
        vec3 d = normalize(ray);
        vec3 color = mix(horizon, top, smoothstep(.01,.72,d.y));
        vec2 p = d.xz * 4.9 / max(.21,d.y) + vec2(3.0, 1.2);
        float cloud = .53*noise(p) + .26*noise(p*2.1) + .13*noise(p*4.19) + .08*noise(p*8.33);
        float density = smoothstep(.57,.78,cloud) * smoothstep(.1,.31,d.y);
        color = mix(color, vec3(.97,.975,.991), density * .84);
        gl_FragColor = vec4(color, 1);
        #include <colorspace_fragment>
      }
    `
  }));
  sky.renderOrder = 90;
  root.add(sky);
}

function addSun(root, mobile) {
  root.add(new THREE.HemisphereLight(0xe0ecff, 0x8b8176, 1.33));
  const sun = new THREE.DirectionalLight(0xffeddb, 2.77);
  sun.position.copy(SUN);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(mobile ? 2048 : 4096);
  Object.assign(sun.shadow.camera, { left: -31, right: 31, top: 34, bottom: -34, near: 1, far: 105 });
  sun.shadow.normalBias = .021;
  sun.shadow.bias = -.00006;
  sun.shadow.radius = 2;
  root.add(sun);
}

function addCrowd(root, { layout, atlas }) {
  const count = layout.byteLength / 8;
  const seats = new THREE.InstancedMesh(new THREE.BoxGeometry(.445, .43, .11),
    new THREE.MeshStandardMaterial({ roughness: .76, color: 0xffffff }), count);
  seats.name = 'museOpenSeatBacks';
  const card = new THREE.PlaneGeometry(.86, 1.37);
  card.translate(0, .67, 0);
  const regions = new Float32Array(count * 3);
  card.setAttribute('spectatorTile', new THREE.InstancedBufferAttribute(regions, 3));
  const material = new THREE.MeshStandardMaterial({
    map: atlas, alphaTest: .46, side: THREE.DoubleSide, roughness: .88, color: 0xf1e8df
  });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute vec3 spectatorTile;\n' + shader.vertexShader.replace(
      '#include <uv_vertex>', `#include <uv_vertex>
      vMapUv = spectatorTile.xy + vec2(mix(uv.x,1.0-uv.x,spectatorTile.z),uv.y) * vec2(.125,.3125);`
    ).replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 center = (modelMatrix * instanceMatrix * vec4(0.,0.,0.,1.)).xyz;
      vec3 view = cameraPosition - center;
      vec3 facing = normalize(mat3(modelMatrix * instanceMatrix) * vec3(0.,0.,-1.));
      vec2 toCamera = normalize(view.xz + vec2(.0001));
      if (dot(toCamera, facing.xz) < 0.0) toCamera *= -1.0;
      vec2 glance = normalize(mix(facing.xz,toCamera,.77));
      vec3 horizontal = vec3(-glance.y,0.,glance.x);
      vec3 right = normalize(instanceMatrix[0].xyz);
      vec3 front = normalize(instanceMatrix[2].xyz);
      transformed.x = position.x * dot(right,horizontal);
      transformed.z = position.x * dot(front,horizontal);`);
  };
  const spectators = new THREE.InstancedMesh(card, material, count);
  spectators.name = 'museOpenSpectators';
  spectators.receiveShadow = seats.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const colors = [0x364944, 0x54675a, 0x67777a, 0x827a6d, 0x53646a, 0x405a4e];
  const random = seededRandom(761);
  let persons = 0;
  for (let i = 0; i < count; i++) {
    const at = i * 8;
    const x = layout.getInt16(at, true) / 100, y = layout.getInt16(at + 2, true) / 100;
    const z = layout.getInt16(at + 4, true) / 100, yaw = layout.getInt16(at + 6, true) / 1000;
    dummy.rotation.set(-.075, yaw, 0, 'YXZ');
    dummy.scale.set(1, 1, 1);
    dummy.position.set(x + Math.sin(yaw) * .24, y + .45, z + Math.cos(yaw) * .24);
    dummy.updateMatrix();
    seats.setMatrixAt(i, dummy.matrix);
    seats.setColorAt(i, color.setHex(colors[Math.floor(random() * colors.length)]));
    if (random() < .062) continue;
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(.91 + random() * .14, .92 + random() * .13, 1);
    dummy.position.set(x + (random() - .5) * .065, y + .004, z + (random() - .5) * .063);
    dummy.updateMatrix();
    spectators.setMatrixAt(persons, dummy.matrix);
    const shade = .77 + random() * .23;
    spectators.setColorAt(persons, color.setRGB(shade, shade, shade));
    const variant = Math.floor(random() * 18);
    regions[persons * 3] = (variant % 8) / 8;
    regions[persons * 3 + 1] = 1 - (Math.floor(variant / 8) + 1) * 160 / 512;
    regions[persons * 3 + 2] = Number(random() < .5);
    persons++;
  }
  spectators.count = persons;
  seats.computeBoundingSphere();
  spectators.computeBoundingSphere();
  root.add(seats, spectators);
}

function addBoards(root) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  for (const end of [-1, 1]) {
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(6.13, 2.59), material);
    screen.position.set(0, 16.42, end * 34.714);
    screen.rotation.y = end === -1 ? 0 : Math.PI;
    root.add(screen);
  }
  function syncScore({ pName = 'VOGEL', aName = 'OTTER', pS = 0, aS = 0, pG = 0, aG = 0, pPts = '0', aPts = '0' } = {}) {
    ctx.fillStyle = '#102f26';
    ctx.fillRect(0, 0, 768, 320);
    ctx.fillStyle = '#efead8';
    ctx.fillRect(22, 22, 724, 48);
    ctx.fillStyle = '#143931';
    ctx.font = 'bold 30px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('M U S E   O P E N', 384, 55);
    ctx.fillStyle = '#bfcabf';
    ctx.font = '20px system-ui';
    ['SATZ', 'SPIELE', 'PUNKTE'].forEach((label, i) => ctx.fillText(label, 413 + i*124, 111));
    for (const [row, [name, sets, games, points]] of [[pName, pS, pG, pPts], [aName, aS, aG, aPts]].entries()) {
      const rowY = 128 + row * 79;
      ctx.fillStyle = row ? '#173b30' : '#22493b';
      ctx.fillRect(22, rowY, 724, 66);
      ctx.fillStyle = '#eff0dd';
      ctx.font = 'bold 31px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(name, 56, rowY + 43);
      ctx.textAlign = 'center';
      [sets, games, points].forEach((n, i) => ctx.fillText(n, 413 + i*124, rowY+43));
    }
    texture.needsUpdate = true;
  }
  syncScore();
  return syncScore;
}

function addSignage(root) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 104;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e4dfcc';
  ctx.textAlign = 'center';
  ctx.font = '700 55px system-ui';
  ctx.fillText('M U S E   O P E N', 384, 72);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, alphaTest: .12, roughness: .9 });
  for (const end of [-1, 1]) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.1, .56), material);
    sign.position.set(0, .77, end*18.143);
    sign.rotation.y = end > 0 ? Math.PI : 0;
    sign.receiveShadow = true;
    root.add(sign);
  }
}

export function createMuseOpen(scene, data, mobile) {
  const root = new THREE.Group();
  root.name = 'museOpenStadium';
  root.userData.arenaDecor = true;
  const architecture = data.stadium.scene.clone(true);
  architecture.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.castShadow = SHADOW_CASTERS.has(mesh.name);
    mesh.receiveShadow = true;
    const grain = MATERIAL_GRAIN.get(mesh.name);
    if (grain) mesh.material = concreteGrain(mesh.material, grain);
  });
  root.add(architecture);
  const clay = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, LENGTH), new THREE.MeshStandardMaterial({
    map: clayTexture(), roughness: .95
  }));
  clay.name = 'museOpenClay';
  clay.rotation.x = -Math.PI / 2;
  clay.position.y = .002;
  clay.receiveShadow = true;
  root.add(clay);
  addSky(root);
  addSun(root, mobile);
  addCrowd(root, data);
  addSignage(root);
  const syncScore = addBoards(root);
  scene.add(root);
  return { root, syncScore };
}
