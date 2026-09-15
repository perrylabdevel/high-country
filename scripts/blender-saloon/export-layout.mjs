/** Snapshot the saloon lot (kit shell, interior shell, boardwalk) in lot-local
 * metres for Blender. Writes layout.json; --reference also writes the kit
 * meshes Blender imports as an alignment shell. */
import {writeFileSync} from 'node:fs';
import * as THREE from 'three/webgpu';
globalThis.document={createElement:()=>({width:256,height:256,getContext:()=>new Proxy({},{get:()=>()=>({addColorStop(){}})})})};
const {bakeHeightfield}=await import('../../src/heightfield.js');
const {createLandmarks,ENTERABLE_LOTS}=await import('../../src/landmarks.js');
const {createInteriors}=await import('../../src/interiors.js');
const {SALOON}=await import('../../src/buildings/saloon.js');
bakeHeightfield();
const scene=new THREE.Scene();
createLandmarks(scene);createInteriors(scene);
scene.updateMatrixWorld(true);
const lot=ENTERABLE_LOTS.find(l=>l.name==='saloon');
const st=lot.group;
const inverse=st.matrixWorld.clone().invert();
const local=(o)=>inverse.clone().multiply(o.matrixWorld);
const walls=[];
st.traverse(o=>{if(o.userData.role==='wall'){const {length,height,thickness,openings}=o.userData;walls.push({length,height,thickness,openings,interior:!st.children.includes(o),matrix:local(o).toArray()});}});
writeFileSync(new URL('./layout.json',import.meta.url),JSON.stringify({saloon:SALOON,lot:{w:lot.w,h:lot.h,d:lot.d,yaw:lot.yaw,x:lot.x,z:lot.z,placementY:st.userData.placementY},walls},null,1));
console.log(`saloon at ${lot.x.toFixed(2)},${lot.z.toFixed(2)} yaw ${lot.yaw.toFixed(4)} y ${st.userData.placementY.toFixed(3)}; ${walls.length} wall frames`);
if(process.argv.includes('--reference')){
 const meshes=[];
 const add=(o,tag)=>{if(!o.isMesh||/^saloon/.test(o.name))return;const g=o.geometry,m=local(o),pts=[];
  for(let i=0;i<g.attributes.position.count;i++)pts.push(...new THREE.Vector3().fromBufferAttribute(g.attributes.position,i).applyMatrix4(m).toArray().map(v=>+v.toFixed(4)));
  meshes.push({name:o.name||o.userData.role||tag,tag,position:pts,index:g.index?Array.from(g.index.array):Array.from({length:g.attributes.position.count},(_,i)=>i)});};
 st.traverse(o=>add(o,'kit'));
 // Boardwalk and any street geometry within 12 m of the lot centre.
 const c=new THREE.Vector3(lot.x,st.userData.placementY,lot.z);
 scene.traverse(o=>{if(!o.isMesh)return;let p=o;while(p){if(p===st)return;p=p.parent;}
  o.geometry.computeBoundingSphere();const s=o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld);
  if(s.distanceTo(c)<12&&o.geometry.boundingSphere.radius<20)add(o,'street');});
 writeFileSync('/private/tmp/claude-501/saloon-context.json',JSON.stringify(meshes));
 console.log(`${meshes.length} reference meshes`);
}
