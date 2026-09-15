/** Snapshot the shipping ranch wall frames for Blender's cladding generator. */
import {writeFileSync} from 'node:fs';
import * as THREE from 'three/webgpu';
globalThis.document={createElement:()=>({width:256,height:256,getContext:()=>new Proxy({},{get:()=>()=>({addColorStop(){}})})})};
const {bakeHeightfield}=await import('../../src/heightfield.js');
const {createRanch,RANCH_HOUSE}=await import('../../src/buildings.js');
bakeHeightfield();
const ranch=createRanch();ranch.updateMatrixWorld(true);
const origin=ranch.getObjectByName('ranchRemodel').position;
const walls=[];
for(const root of ranch.children.filter(o=>['ranchHouse','ranchEll'].includes(o.userData.name))){
 for(const wall of root.children.filter(o=>o.userData.role==='wall'&&o.userData.height>4)){
  const matrix=wall.matrixWorld.clone();matrix.elements[12]-=origin.x;matrix.elements[13]-=origin.y;matrix.elements[14]-=origin.z;
  const {role,length,height,thickness,openings}=wall.userData;
  walls.push({structure:root.userData.name,role,length,height,thickness,openings,matrix:matrix.toArray()});
 }
}
writeFileSync(new URL('./walls-layout.json',import.meta.url),JSON.stringify(walls,null,2));
console.log(`Exported ${walls.length} exterior wall frames.`);

// Every wall face the interior dresses, partitions included, with the storey
// constants the kit builds from.
const interior=[];
for(const root of ranch.children.filter(o=>['ranchHouse','ranchEll'].includes(o.userData.name))){
 for(const wall of root.children.filter(o=>o.userData.role==='wall')){
  const matrix=wall.matrixWorld.clone();matrix.elements[12]-=origin.x;matrix.elements[13]-=origin.y;matrix.elements[14]-=origin.z;
  const {length,height,thickness,openings}=wall.userData;
  interior.push({structure:root.userData.name,exterior:height>4,length,height,thickness,openings,matrix:matrix.toArray()});
 }
}
writeFileSync(new URL('./interior-layout.json',import.meta.url),JSON.stringify({house:RANCH_HOUSE,walls:interior},null,1));
console.log(`Exported ${interior.length} interior wall frames.`);

if(process.argv.includes('--reference')){
 const meshes=[];
 for(const root of ranch.children.filter(o=>['ranchHouse','ranchEll'].includes(o.userData.name))){
  root.traverse(o=>{
   if(!o.isMesh)return;
   const g=o.geometry,pts=[];
   for(let i=0;i<g.attributes.position.count;i++){
    const v=new THREE.Vector3().fromBufferAttribute(g.attributes.position,i).applyMatrix4(o.matrixWorld).sub(origin);pts.push(...v.toArray());
   }
   meshes.push({position:pts,index:g.index?Array.from(g.index.array):Array.from({length:g.attributes.position.count},(_,i)=>i),color:o.material.color.toArray()});
  });
 }
 writeFileSync('/tmp/ranch-context.json',JSON.stringify(meshes));
 console.log(`Exported ${meshes.length} reference meshes to /tmp/ranch-context.json.`);
}
