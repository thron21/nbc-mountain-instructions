import {WebGLRenderer,Scene,PerspectiveCamera,Color,HemisphereLight,DirectionalLight,BufferGeometry,BufferAttribute,
  MeshLambertMaterial,MeshBasicMaterial,LineBasicMaterial,InstancedMesh,Matrix4,Group,LineSegments,Mesh,DoubleSide,Box3,Vector3} from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';

const COLORS={0:0x1B2A34,15:0xF4F4F4,27:0xA5CA18,71:0x969696,72:0x646464};
const PALE=0xC9CFDA, HL=0xffd60a, BG=0xd5c7ac;
let parts=null, renderer=null, scene=null, camera=null, controls=null, root=null, cur=null, ro=null, raf=0;
let model=null, hlObjs=[];

function decodeParts(){
  const P=window.MTN3D_PARTS, bin=atob(P.b64), buf=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) buf[i]=bin.charCodeAt(i);
  const ab=buf.buffer;
  parts=P.meta.map(m=>{
    const q=new Int16Array(ab,m.v,m.nv*3), pos=new Float32Array(m.nv*3);
    for(let i=0;i<pos.length;i++) pos[i]=q[i]/8;
    const g=new BufferGeometry(); g.setAttribute('position',new BufferAttribute(pos,3));
    g.setIndex(new BufferAttribute(new Uint16Array(ab,m.t,m.nt*3).slice(),1));
    g.computeBoundingSphere();
    const ei=new Uint16Array(ab,m.e,m.ne*2), ep=new Float32Array(m.ne*6);
    for(let i=0;i<ei.length;i++){ep[i*3]=pos[ei[i]*3];ep[i*3+1]=pos[ei[i]*3+1];ep[i*3+2]=pos[ei[i]*3+2];}
    return {geo:g,edges:ep};
  });
  model=window.MTN3D_MODEL;
}
function pieceMatrix(p){const m=new Matrix4();m.set(p[5],p[6],p[7],p[2],p[8],p[9],p[10],p[3],p[11],p[12],p[13],p[4],0,0,0,1);return m;}
function edgesFor(list){
  let n=0; for(const p of list) n+=parts[p[0]].edges.length;
  const out=new Float32Array(n); let o=0; const e=new Float32Array(16);
  for(const p of list){
    const src=parts[p[0]].edges, x=p[2],y=p[3],z=p[4];
    const a=p[5],b=p[6],c=p[7],d=p[8],f=p[9],g=p[10],h=p[11],i_=p[12],j=p[13];
    for(let k=0;k<src.length;k+=3){const X=src[k],Y=src[k+1],Z=src[k+2];
      out[o++]=a*X+b*Y+c*Z+x; out[o++]=d*X+f*Y+g*Z+y; out[o++]=h*X+i_*Y+j*Z+z;}
  }
  const gg=new BufferGeometry(); gg.setAttribute('position',new BufferAttribute(out,3)); return gg;
}
const mats={};
function M(){
  if(mats.pale) return mats;
  mats.pale=new MeshLambertMaterial({color:PALE,flatShading:true,side:DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
  mats.cur=new MeshLambertMaterial({color:0xffffff,flatShading:true,side:DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
  mats.paleEdge=new LineBasicMaterial({color:0x7d8594,transparent:true,opacity:.55});
  mats.curEdge=new LineBasicMaterial({color:0x1d2329,transparent:true,opacity:.8});
  mats.hl=new MeshLambertMaterial({color:HL,emissive:0x8a6a00,flatShading:true,side:DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-4});
  mats.xray=new MeshBasicMaterial({color:HL,transparent:true,opacity:.28,depthTest:false,depthWrite:false,side:DoubleSide});
  mats.hlEdge=new LineBasicMaterial({color:0xb8860b,depthTest:false,transparent:true,opacity:.95});
  return mats;
}
function instanced(list,mat,colored){
  const by=new Map(); for(const p of list){if(!by.has(p[0]))by.set(p[0],[]);by.get(p[0]).push(p);}
  const out=[];
  for(const [pi,ps] of by){
    const im=new InstancedMesh(parts[pi].geo,mat,ps.length);
    ps.forEach((p,i)=>{im.setMatrixAt(i,pieceMatrix(p)); if(colored) im.setColorAt(i,new Color(COLORS[p[1]]??0x888888));});
    im.instanceMatrix.needsUpdate=true; if(im.instanceColor) im.instanceColor.needsUpdate=true;
    im.computeBoundingBox&&im.computeBoundingBox(); im.computeBoundingSphere&&im.computeBoundingSphere();
    out.push(im);
  }
  return out;
}
function render(){ if(renderer&&cur) renderer.render(scene,camera); }
function req(){ if(!raf) raf=requestAnimationFrame(()=>{raf=0;render();}); }
function resize(){
  if(!cur) return; const w=cur.el.clientWidth,h=cur.el.clientHeight; if(!w||!h) return;
  renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); req();
}
function clearScene(){
  if(!root) return;
  root.traverse(o=>{ if(o.isInstancedMesh) o.dispose(); else if(o.isLineSegments) o.geometry.dispose(); });
  scene.remove(root); root=null; hlObjs=[];
}
function setKey(key){
  if(!cur) return;
  for(const o of hlObjs){ root.remove(o); if(o.isLineSegments) o.geometry.dispose(); }
  hlObjs=[];
  const sec=model[cur.sec], idx=key!=null?sec.k[key]:undefined;
  if(idx!=null){
    const p=sec.p[idx], m=pieceMatrix(p), g=parts[p[0]].geo;
    const a=new Mesh(g,mats.hl); a.matrixAutoUpdate=false; a.matrix.copy(m);
    const b=new Mesh(g,mats.xray); b.matrixAutoUpdate=false; b.matrix.copy(m); b.renderOrder=10;
    const e=new LineSegments(edgesFor([p]),mats.hlEdge); e.renderOrder=11;
    hlObjs=[a,b,e]; hlObjs.forEach(o=>root.add(o));
  }
  cur.key=key; req();
}
function frame(reset){
  const sec=model[cur.sec], [ , s0, s1]=cur.range;
  const box=new Box3(), v=new Vector3();
  for(let i=s0;i<s1;i++){const p=sec.p[i]; v.set(p[2],-p[3],-p[4]); box.expandByPoint(v);}
  const c=box.getCenter(new Vector3()), size=box.getSize(new Vector3()).length();
  const dist=Math.min(2600,Math.max(330,size*1.9+220));
  const az=35*Math.PI/180, el=33*Math.PI/180;
  camera.position.set(c.x-dist*Math.sin(az)*Math.cos(el), c.y+dist*Math.sin(el), c.z+dist*Math.cos(az)*Math.cos(el));
  controls.target.copy(c); camera.near=5; camera.far=12000; camera.updateProjectionMatrix(); controls.update(); req();
}
function open(el,secId,stepId,key){
  if(!parts) decodeParts();
  M();
  if(!renderer){
    renderer=new WebGLRenderer({antialias:true,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    scene=new Scene(); scene.background=new Color(BG);
    scene.add(new HemisphereLight(0xffffff,0x8a8070,1.6));
    const d=new DirectionalLight(0xffffff,1.6); d.position.set(-0.5,1,0.8); scene.add(d);
    camera=new PerspectiveCamera(30,1,5,12000);
    renderer.domElement.style.cssText='display:block;width:100%;height:100%;touch-action:none';
    controls=new OrbitControls(camera,renderer.domElement);
    controls.screenSpacePanning=true; controls.minDistance=40; controls.maxDistance=5000; controls.zoomSpeed=1.2;
    controls.addEventListener('change',req);
    ro=new ResizeObserver(resize);
  }
  close();
  const sec=model[secId], si=sec.s.findIndex(s=>s[0]===stepId); if(si<0) return false;
  cur={el,sec:secId,range:sec.s[si]};
  clearScene(); root=new Group(); root.rotation.x=Math.PI; scene.add(root);
  const [ ,s0,s1]=cur.range, prior=sec.p.slice(0,s0), now=sec.p.slice(s0,s1);
  instanced(prior,mats.pale,false).forEach(o=>root.add(o));
  instanced(now,mats.cur,true).forEach(o=>root.add(o));
  if(prior.length) root.add(new LineSegments(edgesFor(prior),mats.paleEdge));
  root.add(new LineSegments(edgesFor(now),mats.curEdge));
  el.appendChild(renderer.domElement); ro.observe(el);
  frame(); resize(); setKey(key);
  return true;
}
function close(){
  if(!cur) return; ro.unobserve(cur.el);
  if(renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  clearScene(); cur=null; renderer.renderLists.dispose();
}
window.MTN3D={open,close,setKey,reset:()=>{if(cur)frame();},stats:()=>renderer&&renderer.info};
