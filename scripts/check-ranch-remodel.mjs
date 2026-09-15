/** Handwritten shutter coordinates silently mirrored side-wall positions and omitted
 * rear windows. Verify actual exported geometry against kit frames, offline. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three/webgpu';
globalThis.document={createElement:()=>({width:256,height:256,getContext:()=>new Proxy({},{get:()=>()=>({addColorStop(){}})})})};
const {bakeHeightfield}=await import('../src/heightfield.js');
const {createRanch}=await import('../src/buildings.js');
const layout=JSON.parse(readFileSync(new URL('./blender-ranch/walls-layout.json',import.meta.url)));
bakeHeightfield();
const ranch=createRanch();ranch.updateMatrixWorld(true);
const remodel=ranch.getObjectByName('ranchRemodel');
const cladding=remodel.children.filter(m=>m.name.startsWith('ranchRemodel.wall'));
assert.equal(cladding.length,3);
let rays=0,covered=0,shutterRays=0;
const shutters=remodel.children.filter(m=>m.name==='ranchRemodel.shutter');
const expectedShutters=[];
const ray=new THREE.Raycaster();ray.far=0.36;
for(const root of ranch.children.filter(o=>['ranchHouse','ranchEll'].includes(o.userData.name))){
 for(const wall of root.children.filter(o=>o.userData.role==='wall'&&o.userData.height>4)){
  const local=wall.matrixWorld.clone();local.elements[12]-=remodel.position.x;local.elements[13]-=remodel.position.y;local.elements[14]-=remodel.position.z;
  const source=layout.find(w=>w.structure===root.userData.name&&w.matrix.every((v,i)=>Math.abs(v-local.elements[i])<1e-6));
  assert.ok(source,'Blender wall frame must match the kit; regenerate layout after changing footprint');
  assert.deepEqual(source.openings,wall.userData.openings,'Regenerate cladding after changing openings');
  const direction=new THREE.Vector3(0,0,-1).transformDirection(wall.matrixWorld);
  for(const o of wall.userData.openings){
   if(o.fromFloor>0.5){
    expectedShutters.push({o,inverse:wall.matrixWorld.clone().invert(),name:root.userData.name});
    for(const side of [-1,1])for(const board of [0.27,0.45,0.63])for(const fy of [0.1,0.5,0.9]){
     ray.set(new THREE.Vector3(o.x+side*(o.w/2+board),o.fromFloor+o.h*fy,0.4).applyMatrix4(wall.matrixWorld),direction);
     assert.ok(ray.intersectObjects(shutters,false).length>0,`${root.userData.name} window at wall-local x=${o.x}, y=${o.fromFloor}: missing/misplaced shutter; rebuild build_windows() and export() in Blender.`);
     shutterRays++;
    }
   }
   for(const fx of [0.01,0.25,0.5,0.75,0.99])for(const fy of [0.01,0.25,0.5,0.75,0.99]){
    ray.set(new THREE.Vector3(o.x+o.w*(fx-0.5),o.fromFloor+o.h*fy,0.4).applyMatrix4(wall.matrixWorld),direction);
    assert.equal(ray.intersectObjects(cladding,false).length,0,`${root.userData.name}: siding obstructs aperture`);rays++;
   }
  }
  // Sample each wall's solid area to catch missing or inward-facing boards.
  let wallHits=0;
  for(let x=-source.length/2+0.19;x<source.length/2;x+=0.64){
   const y=1.08;
   if(source.openings.some(o=>Math.abs(x-o.x)<o.w/2+0.03&&y>o.fromFloor&&y<o.fromFloor+o.h))continue;
   ray.set(new THREE.Vector3(x,y,0.4).applyMatrix4(wall.matrixWorld),direction);
   assert.ok(ray.intersectObjects(cladding,false).length>0,`${root.userData.name}: missing exterior siding at ${x}`);wallHits++;
  }
  assert.ok(wallHits>0);covered+=wallHits;
 }
}
for(const mesh of shutters){
 const p=mesh.geometry.attributes.position;
 for(let i=0;i<p.count;i++){
  const world=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);
  assert.ok(expectedShutters.some(({o,inverse})=>{
   const v=world.clone().applyMatrix4(inverse);const dx=Math.abs(v.x-o.x);
   return dx>=o.w/2+0.18&&dx<=o.w/2+0.72&&v.y>=o.fromFloor-0.001&&v.y<=o.fromFloor+o.h+0.001&&v.z>=0.159&&v.z<=0.231;
  }),`Stray shutter vertex ${world.toArray()}: rebuild build_windows() and export() in Blender.`);
 }
}
// A porch used to cross the upstairs glazing; test the approach to each sill.
const roofs=[];
ranch.traverse(o=>{if(o.userData.role==='roof')o.traverse(m=>{if(m.isMesh)roofs.push(m);});});
let upperWindows=0;
for(const {o,inverse} of expectedShutters){
 if(o.fromFloor<3)continue;
 const frame=inverse.clone().invert();
 ray.far=5.05;
 ray.set(new THREE.Vector3(o.x,o.fromFloor+0.05,5.2).applyMatrix4(frame),new THREE.Vector3(0,0,-1).transformDirection(frame));
 assert.equal(ray.intersectObjects(roofs,false).length,0,'Porch roof crosses upstairs window: keep ranch roofPitch at 0.025 or verify new sill clearance.');upperWindows++;
}
let junctionRays=0;
function sealed(origin,direction,distance,label){
 ray.far=distance;ray.set(new THREE.Vector3(...origin).add(remodel.position),new THREE.Vector3(...direction));
 assert.ok(ray.intersectObjects(remodel.children,false).length>0,`${label} is open: rebuild build_roof_closures() and export() in Blender.`);junctionRays++;
}
for(const x of [4.5,6,8,10,11.5])for(const y of [5.15,5.55,6.0])sealed([x,y,-5.8],[0,0,1],0.8,'Kitchen/main high-wall junction');
for(const z of [7.5,8.5,9.5]){
 sealed([-11,3.445,z],[1,0,0],0.5,'Front porch west rake');
 sealed([12.6,3.445,z],[-1,0,0],0.5,'Front porch east rake');
}
for(const z of [-2.5,7.7])sealed([13,3.445,z],[0,0,z<0?1:-1],0.6,'East porch rake');
for(const x of [-2.6,2.6])sealed([x,3.5,9],[x<0?1:-1,0,0],0.5,'Entry cheek');
sealed([0.8,4.2,12.2],[0,0,-1],0.5,'Entry pediment');
console.log(`PASS: ${junctionRays} roof junction rays closed, ${upperWindows} upper windows clear; ${expectedShutters.length} windows, ${shutterRays} shutter rays, no stray shutters; ${rays} aperture rays clear; ${covered} exterior samples clad; all 8 wall frames match the kit.`);
