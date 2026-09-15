import * as THREE from 'three/webgpu';
import { color, vertexColor } from 'three/tsl';
import exterior from '../models/ranch-remodel.json';
import interior from '../models/ranch-interior.json';

/** Material-batched Blender geometry in house-local metres. A batch with a
 * `color` attribute is tinted per face: the batch's material is cloned and
 * its colour multiplied by the vertex colour. */
function batched(name, model, materials) {
  const group = new THREE.Group();
  group.name = name;
  // Quantized models store integers (millimetres, hundredths of a tint) and
  // no normals: their faces share no vertices, so recomputed normals are flat.
  const units = model.units ?? { position: 1, color: 1 };
  const scaled = (values, k) => (k === 1 ? values : Float32Array.from(values, (v) => v * k));
  for (const [kind, data] of Object.entries(model.batches)) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(scaled(data.position, units.position), 3));
    if (data.uv) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uv, 2));
    let material = materials[kind];
    if (!material) throw new Error(`${name}: no material for batch "${kind}"`);
    if (data.color) {
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(scaled(data.color, units.color), 3));
      material = material.clone();
      material.colorNode = (material.colorNode ?? color(material.color)).mul(vertexColor());
    }
    geometry.setIndex(data.index);
    if (data.normal) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normal, 3));
    else geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${name}.${kind}`;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/** Blender-authored exterior (scripts/blender-ranch/remodel.py). The kit keeps
 * the openings, collision and standable porch surfaces. */
export function ranchRemodel(materials) {
  return batched('ranchRemodel', exterior, materials);
}

/** Blender-authored interior (scripts/blender-ranch/interior.py): floorboards
 * (the walking surface the kit's decks register), finishes, stair, fireplace
 * and dressing. */
export function ranchInterior(materials) {
  return batched('ranchInterior', interior, materials);
}
