import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Primary: Ferrari SF-25 by Abu Saif (Sketchfab) — CC Attribution
 * https://sketchfab.com/3d-models/ferrari-sf-25-11b53fd8dc324ab7b7fed6b43c62e398
 *
 * Fallback: F1 2022 by Blender458 — CC BY 4.0
 */
export const MODEL_ATTRIBUTION = {
  'ferrari-sf-25': {
    name: 'Ferrari SF-25',
    author: 'Abu Saif (@abuhossain844)',
    url: 'https://sketchfab.com/3d-models/ferrari-sf-25-11b53fd8dc324ab7b7fed6b43c62e398',
    license: 'CC Attribution',
  },
  'f1-2022': {
    name: 'F1 2022',
    author: 'Blender458',
    url: 'https://sketchfab.com/Blender458',
    license: 'CC BY 4.0',
  },
};

/** Try live / deployed URLs in order (same origin on Render — not localhost-only). */
export function getModelCandidates() {
  const fromEnv = import.meta.env.VITE_MODEL_URL;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return [
    fromEnv,
    origin ? `${origin}/models/ferrari-sf-25.glb` : null,
    '/models/ferrari-sf-25.glb',
    origin ? `${origin}/models/f1-2022.glb` : null,
    '/models/f1-2022.glb',
  ].filter(Boolean);
}

/** glTF mesh faces +Z along the car length (tuned per asset). */
export const MODEL_FORWARD = new THREE.Vector3(0, 0, 1);

export const TEAM_SKINS = {
  mercedes: {
    id: 'mercedes',
    name: 'Mercedes',
    primary: 0x00d2be,
    secondary: 0xc0c0c0,
    emissive: 0x003330,
    tint: 0.32,
  },
  ferrari: {
    id: 'ferrari',
    name: 'Ferrari',
    primary: 0xdc0000,
    secondary: 0xffeedd,
    emissive: 0x330000,
    tint: 0.38,
  },
  mclaren: {
    id: 'mclaren',
    name: 'McLaren',
    primary: 0xff8000,
    secondary: 0x005aff,
    emissive: 0x331800,
    tint: 0.35,
  },
  audi: {
    id: 'audi',
    name: 'Audi',
    primary: 0xe8e8e8,
    secondary: 0xbb0a30,
    emissive: 0x222222,
    tint: 0.22,
  },
  redbull: {
    id: 'redbull',
    name: 'Red Bull',
    primary: 0x1e41ff,
    secondary: 0xcc0000,
    emissive: 0x001133,
    tint: 0.34,
  },
};

let baseScene = null;
let loadPromise = null;
let loadedModelId = 'f1-2022';

export function getLoadedModelId() {
  return loadedModelId;
}

export function getModelAttribution() {
  return MODEL_ATTRIBUTION[loadedModelId] ?? MODEL_ATTRIBUTION['f1-2022'];
}

function normalizeModel(scene) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const length = Math.max(size.x, size.y, size.z);
  const scale = 2.1 / length;
  scene.scale.setScalar(scale);

  scene.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(scene);
  scene.position.set(-center.x * scale, -box2.min.y, -center.z * scale);
}

function cloneModel(source) {
  const clone = source.clone(true);
  clone.traverse((child) => {
    if (child.isMesh && child.material) {
      if (Array.isArray(child.material)) {
        child.material = child.material.map((m) => m.clone());
      } else {
        child.material = child.material.clone();
      }
    }
  });
  return clone;
}

function isTyreMesh(name) {
  const n = (name || '').toLowerCase();
  return n.includes('tyre') || n.includes('tire') || n.includes('wheel') || n.includes('rim')
    || n.includes('brake disc') || n.includes('caliper');
}

function isCarbonMesh(name) {
  const n = (name || '').toLowerCase();
  return n.includes('carbon') || n.includes('underbody') || n.includes('floor')
    || n.includes('diffuser') || n.includes('skid');
}

function isBodyPanel(name) {
  const n = (name || '').toLowerCase();
  if (isTyreMesh(name) || isCarbonMesh(name)) return false;
  return (
    n.includes('body')
    || n.includes('nose')
    || n.includes('cockpit')
    || n.includes('chassis')
    || n.includes('sidepod')
    || n.includes('engine')
    || n.includes('halo')
    || n.includes('monocoque')
    || n.includes('fairing')
  );
}

function isAccentPanel(name) {
  const n = (name || '').toLowerCase();
  return n.includes('wing') || n.includes('fin') || n.includes('barge') || n.includes('flap');
}

function brightenMaterial(mat, skin, meshName) {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return;

  if (isTyreMesh(meshName)) {
    mat.color.set(0x1a1a1a);
    mat.roughness = 0.85;
    mat.metalness = 0.05;
    mat.emissive.set(0x000000);
    mat.emissiveIntensity = 0;
    return;
  }

  const primary = new THREE.Color(skin.primary);
  const secondary = new THREE.Color(skin.secondary);
  const emissive = new THREE.Color(skin.emissive);
  const orig = mat.color.clone();
  let tint = skin.tint;

  if (isCarbonMesh(meshName)) {
    mat.color.set(0x242424);
    mat.roughness = 0.6;
    mat.metalness = 0.3;
    mat.emissive.set(0x000000);
    mat.emissiveIntensity = 0;
    return;
  }

  mat.color.copy(orig);

  if (isBodyPanel(meshName)) {
    mat.color.lerp(primary, tint);
  } else if (isAccentPanel(meshName)) {
    mat.color.lerp(secondary, tint * 0.45);
  }

  mat.color.lerp(new THREE.Color(0xffffff), 0.14);
  mat.roughness = THREE.MathUtils.clamp(mat.roughness * 0.85, 0.28, 0.68);
  mat.metalness = THREE.MathUtils.clamp(mat.metalness, 0.15, 0.45);
  mat.emissive.copy(emissive);
  mat.emissiveIntensity = isBodyPanel(meshName) ? 0.12 : 0.05;
}

function applyTeamLivery(root, teamId) {
  const skin = { ...(TEAM_SKINS[teamId] ?? TEAM_SKINS.audi) };

  // SF-25 is already Ferrari red — keep original livery for Ferrari players.
  if (loadedModelId === 'ferrari-sf-25' && teamId === 'ferrari') {
    skin.tint = 0.08;
  }

  root.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach((mat) => brightenMaterial(mat, skin, child.name));
  });

  return skin;
}

function loadFromUrl(url) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => resolve(gltf),
      undefined,
      reject
    );
  });
}

async function tryLoadModels() {
  const candidates = getModelCandidates();
  const seen = new Set();
  let lastError;

  for (const url of candidates) {
    if (seen.has(url)) continue;
    seen.add(url);

    try {
      const gltf = await loadFromUrl(url);
      loadedModelId = url.includes('ferrari-sf-25') ? 'ferrari-sf-25' : 'f1-2022';
      baseScene = gltf.scene;
      normalizeModel(baseScene);
      baseScene.traverse((c) => {
        if (c.isMesh) {
          c.castShadow = true;
          c.receiveShadow = true;
        }
      });
      console.info(`Loaded car model: ${loadedModelId} from ${url}`);
      return baseScene;
    } catch (err) {
      lastError = err;
      console.warn(`Model failed (${url}):`, err.message);
    }
  }

  throw lastError ?? new Error(
    'No car model available. Run: SKETCHFAB_TOKEN=xxx npm run download-model'
  );
}

export function loadF1Model() {
  if (loadPromise) return loadPromise;
  loadPromise = tryLoadModels();
  return loadPromise;
}

export function createCarModel(teamId = 'audi') {
  if (!baseScene) throw new Error('F1 model not loaded — call loadF1Model() first');
  const model = cloneModel(baseScene);
  const skin = applyTeamLivery(model, teamId);
  return { model, skin };
}

export function getBodyMaterials(root) {
  const mats = [];
  root.traverse((child) => {
    if (!child.isMesh || !child.material || isTyreMesh(child.name)) return;
    const list = Array.isArray(child.material) ? child.material : [child.material];
    list.forEach((m) => {
      if (m instanceof THREE.MeshStandardMaterial) mats.push(m);
    });
  });
  return mats;
}
