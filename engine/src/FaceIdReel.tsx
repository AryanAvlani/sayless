import React, {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, delayRender, continueRender} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import vo from './faceid_vo.json';
import {C, EASE, v3, clamp01, envAt, Key, CameraRig, canvasTex, glowTex, Captions, Label, SeriesTag, EndCard, Grade, Flash} from './lib';

const FPS = 30;
const L = vo.lines.map((l: any) => [l.start, l.end] as [number, number]);
const wt = (re: RegExp, line: number) => (vo.words as any[]).find((w) => w.line === line && re.test(w.w))!.s as number;
const END = vo.total + 2.6;
export const FACEID_DURATION = Math.ceil(END * FPS);

// timeline
const PHOTO1 = L[1][0];               // photo shown as the question
const HEAD2 = L[2][0];                // back to the real face
const FIRE = wt(/^fires$/, 2);        // dots launch
const DEPTH = wt(/^builds$/, 4);      // depth colors on
const PHOTO2 = L[5][0];               // flat photo test
const HEAD3 = L[6][0];                // on-device
const ODDS = L[7][0];

const PHONE_Z = 2.6;
const PROJ = v3(0.12, 0.05, PHONE_Z - 0.05);   // dot projector position (top of phone, facing the face)

const BACK = v3(-3.0, 1.2, -4.2), BACK_LOOK = v3(0.3, 0.1, 2.6);
const KEYS: Key[] = [
  [0, BACK, BACK_LOOK, 30],
  [L[0][1] - 0.2, v3(-2.7, 1.1, -3.7), BACK_LOOK, 30],
  [PHOTO1 + 0.9, v3(5.6, 1.3, 6.6), v3(0, 0, 1.0), 32],
  [L[1][1], v3(5.4, 1.2, 6.2), v3(0, 0, 1.0), 32],
  [FIRE + 0.6, v3(7.4, 2.1, 5.4), v3(0, 0, 1.2), 32],
  [L[2][1], v3(6.8, 1.8, 5.0), v3(0, 0, 1.0), 32],
  [L[3][1], v3(3.8, 1.8, 5.0), v3(0, 0, 0.4), 32],
  [(L[3][1] + DEPTH) / 2 + 0.3, v3(0, 4.0, 5.0), v3(0, 0, 0.4), 32],
  [DEPTH + 0.6, v3(-3.9, 0.9, 4.6), v3(0, 0, 0.3), 32],
  [L[4][1], v3(-4.6, 1.2, 3.6), v3(0, 0, 0.3), 32],
  [PHOTO2 + 0.8, v3(4.4, 0.9, 5.6), v3(0, 0, 0.9), 32],
  [L[5][1], v3(4.0, 0.8, 5.2), v3(0, 0, 0.9), 32],
  [HEAD3 + 1.0, v3(-3.1, 1.2, -4.4), BACK_LOOK, 30],
  [END, v3(-3.4, 1.4, -5.2), BACK_LOOK, 30],
];

// which subject is in front of the phone: 1 = head, 0 = photo
const headAt = (t: number) => {
  if (t < PHOTO1) return 1;
  if (t < HEAD2) return 0;
  if (t < PHOTO2) return 1;
  if (t < HEAD3) return 0;
  return 1;
};

// ---------------- face surface ----------------
// unit-sphere direction -> radius, front of face is +z (toward phone)
const g2 = (x: number, y: number, cx: number, cy: number, sx: number, sy: number) => Math.exp(-(((x - cx) / sx) ** 2) - (((y - cy) / sy) ** 2));
const faceR = (d: THREE.Vector3) => {
  const front = Math.max(0, d.z);
  const {x, y} = d;
  let r = 1;
  r += 0.32 * g2(x, y, 0, -0.08, 0.11, 0.26) * front;            // nose ridge
  r += 0.12 * g2(x, y, 0, -0.28, 0.16, 0.08) * front;            // nose tip
  r += 0.07 * g2(x, y, 0, 0.32, 0.5, 0.07) * front;              // brow
  r -= 0.09 * (g2(x, y, -0.3, 0.16, 0.13, 0.08) + g2(x, y, 0.3, 0.16, 0.13, 0.08)) * front; // eye sockets
  r += 0.06 * (g2(x, y, -0.4, -0.18, 0.18, 0.15) + g2(x, y, 0.4, -0.18, 0.18, 0.15)) * front; // cheeks
  r += 0.05 * g2(x, y, 0, -0.5, 0.2, 0.06) * front;              // lips
  r += 0.06 * g2(x, y, 0, -0.72, 0.22, 0.1) * front;             // chin
  return r;
};
const SCALE = v3(0.82, 1.08, 0.92);
const buildFace = () => {
  const geo = new THREE.SphereGeometry(1, 160, 160);
  const p = geo.attributes.position as THREE.BufferAttribute; const d = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    d.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    const r = faceR(d);
    p.setXYZ(i, d.x * r * SCALE.x, d.y * r * SCALE.y, d.z * r * SCALE.z);
  }
  geo.computeVertexNormals();
  return geo;
};

// heat colors for depth (near = warm, far = blue)
const depthColor = (k: number) => {
  const c = new THREE.Color();
  c.setHSL(0.66 - 0.62 * clamp01(k), 1, 0.58);
  return c;
};

type Dots = {hits: Float32Array; flat: Float32Array; depthK: Float32Array; n: number};
const buildDots = (face: THREE.Mesh): Dots => {
  const rc = new THREE.Raycaster(); const plane = new THREE.Plane(v3(0, 0, 1), -0.75);
  const hitsA: number[] = [], flatA: number[] = [], kA: number[] = [];
  const NX = 64, NY = 80;
  for (let iy = 0; iy < NY; iy++) for (let ix = 0; ix < NX; ix++) {
    // pseudo-random jitter so the pattern looks like a real dot field, not a grid
    const jx = Math.sin(ix * 12.9898 + iy * 78.233) * 0.5, jy = Math.sin(ix * 39.346 + iy * 11.135) * 0.5;
    const tx = -1.05 + 2.1 * (ix + 0.5 + jx * 0.8) / NX, ty = -1.35 + 2.7 * (iy + 0.5 + jy * 0.8) / NY;
    const target = v3(tx, ty, 0);
    const dir = target.clone().sub(PROJ).normalize();
    rc.set(PROJ, dir);
    const h = rc.intersectObject(face, false)[0];
    const fp = new THREE.Vector3(); rc.ray.intersectPlane(plane, fp);
    if (!h) continue;
    const nrm = h.face ? h.face.normal.clone().transformDirection(face.matrixWorld) : dir.clone().negate();
    hitsA.push(h.point.x + nrm.x * 0.03, h.point.y + nrm.y * 0.03, h.point.z + nrm.z * 0.03);
    flatA.push(fp.x, fp.y, fp.z);
    kA.push(clamp01((h.point.z + 0.2) / 1.35));
  }
  return {hits: new Float32Array(hitsA), flat: new Float32Array(flatA), depthK: new Float32Array(kA), n: kA.length};
};

const useMats = () => useMemo(() => {
  const photo = canvasTex(640, 820, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 820); gr.addColorStop(0, '#2b3242'); gr.addColorStop(1, '#141822');
    g.fillStyle = gr; g.fillRect(0, 0, 640, 820);
    // simple painted portrait
    g.fillStyle = '#c99a7c'; g.beginPath(); g.ellipse(320, 400, 190, 250, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2a1c16'; g.beginPath(); g.ellipse(320, 230, 205, 120, 0, Math.PI, Math.PI * 2); g.fill();
    g.fillStyle = '#3a2620'; [[245, 370], [395, 370]].forEach(([x, y]) => { g.beginPath(); g.ellipse(x, y, 28, 14, 0, 0, Math.PI * 2); g.fill(); });
    g.strokeStyle = '#9c6f57'; g.lineWidth = 8; g.lineCap = 'round';
    g.beginPath(); g.moveTo(320, 380); g.lineTo(305, 470); g.lineTo(330, 478); g.stroke();
    g.strokeStyle = '#8a4a44'; g.lineWidth = 10; g.beginPath(); g.moveTo(270, 545); g.quadraticCurveTo(320, 570, 370, 545); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, 0, 640, 820);
    g.strokeStyle = '#f4f2ec'; g.lineWidth = 36; g.strokeRect(0, 0, 640, 820);
  });
  const lock = (open: boolean) => canvasTex(400, 860, (g) => {
    g.fillStyle = '#05070d'; g.fillRect(0, 0, 400, 860);
    g.fillStyle = 'rgba(244,247,255,0.9)'; g.textAlign = 'center'; g.font = '800 92px Inter, sans-serif'; g.fillText('9:41', 200, 230);
    g.strokeStyle = open ? '#5fd0ff' : 'rgba(244,247,255,0.85)'; g.lineWidth = 14; g.lineCap = 'round';
    g.beginPath(); g.arc(200, open ? 430 : 455, 46, Math.PI, 0); g.stroke();
    if (open) { g.beginPath(); g.moveTo(246, 430); g.lineTo(246, 470); g.stroke(); }
    g.fillStyle = open ? '#5fd0ff' : 'rgba(244,247,255,0.85)'; g.beginPath(); (g as any).roundRect(130, 470, 140, 110, 18); g.fill();
    g.font = '600 34px Inter, sans-serif'; g.fillStyle = 'rgba(244,247,255,0.7)'; g.fillText(open ? 'Unlocked' : 'Locked', 200, 680);
  });
  return {
    skin: new THREE.MeshPhysicalMaterial({color: '#c9a48c', roughness: 0.55, metalness: 0, sheen: 0.4, sheenColor: new THREE.Color('#ffd9c0'), transparent: true}),
    wire: new THREE.MeshBasicMaterial({color: C.accent, wireframe: true, transparent: true, opacity: 0, toneMapped: false}),
    photo: new THREE.MeshStandardMaterial({map: photo, roughness: 0.6, transparent: true}),
    phone: new THREE.MeshPhysicalMaterial({color: '#2b2f36', metalness: 0.85, roughness: 0.28, clearcoat: 0.6}),
    locked: new THREE.MeshBasicMaterial({map: lock(false), toneMapped: false}),
    unlocked: new THREE.MeshBasicMaterial({map: lock(true), toneMapped: false}),
    glowW: glowTex('255,120,140'), glowC: glowTex('95,208,255'),
    floor: new THREE.MeshStandardMaterial({color: '#07090f', roughness: 0.9}),
  };
}, []);

const Face: React.FC<{t: number; mats: any; geo: THREE.BufferGeometry}> = ({t, mats, geo}) => {
  const h = headAt(t);
  const scan = envAt(t, DEPTH - 0.2, PHOTO2, 0.6, 0.2);
  const dark = envAt(t, FIRE, HEAD3 + 0.3, 0.6, 0.6);
  const sk = mats.skin as THREE.MeshPhysicalMaterial;
  sk.color.set('#c9a48c').lerp(new THREE.Color('#2a2624'), 0.85 * dark); sk.opacity = 1 - 0.8 * scan; sk.sheen = 0.4 * (1 - dark); sk.envMapIntensity = 1 - 0.9 * dark;
  (mats.wire as THREE.MeshBasicMaterial).opacity = 0.08 * scan;
  return (
    <group visible={h === 1} rotation={[0, 0.12 * Math.sin(t * 0.5), 0]}>
      <mesh geometry={geo} material={mats.skin} />
      {scan > 0.01 ? <mesh geometry={geo} material={mats.wire} scale={[1.002, 1.002, 1.002]} /> : null}
      {/* neck */}
      <mesh position={[0, -1.35, -0.15]} material={mats.skin}><cylinderGeometry args={[0.42, 0.5, 0.9, 48]} /></mesh>
    </group>
  );
};

const Photo: React.FC<{t: number; mats: any}> = ({t, mats}) => { (mats.photo as THREE.MeshStandardMaterial).color.set('#ffffff').multiplyScalar(1 - 0.7 * envAt(t, PHOTO2 + 0.2, HEAD3, 0.5, 0.2)); return (
  <group visible={headAt(t) === 0} position={[0, 0, 0.75]}>
    <mesh material={mats.photo}><planeGeometry args={[1.9, 2.45]} /></mesh>
  </group>
); };

const Phone: React.FC<{t: number; mats: any}> = ({t, mats}) => {
  const body = useMemo(() => new RoundedBoxGeometry(0.9, 1.9, 0.09, 6, 0.12), []);
  const open = t > L[0][0] + 1.0 && t < PHOTO1 || t > ODDS + 0.6;
  return (
    <group position={[0, 0.05, PHONE_Z]} rotation={[0, Math.PI, 0]}>
      <mesh geometry={body} material={mats.phone} />
      <mesh position={[0, 0, 0.047]}><planeGeometry args={[0.84, 1.84]} /><primitive object={open ? mats.unlocked : mats.locked} attach="material" /></mesh>
      {/* TrueDepth bar */}
      <mesh position={[0, 0.82, 0.049]}><planeGeometry args={[0.28, 0.07]} /><meshBasicMaterial color="#000" /></mesh>
    </group>
  );
};

const DotField: React.FC<{t: number; mats: any; dots: Dots}> = ({t, mats, dots}) => {
  const {geo, pos, col} = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(dots.n * 3), col = new Float32Array(dots.n * 3);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return {geo: g, pos, col};
  }, [dots]);
  const on = (t >= FIRE && t < HEAD3 + 0.6);
  if (!on) return null;
  const flat = headAt(t) === 0;
  const target = flat ? dots.flat : dots.hits;
  const t0 = flat ? PHOTO2 + 0.15 : FIRE;
  const depthOn = flat ? 0 : clamp01((t - DEPTH) / 0.8);
  const ir = new THREE.Color('#ff6a86');
  const fade = 1 - clamp01((t - HEAD3) / 0.5);
  for (let i = 0; i < dots.n; i++) {
    const delay = ((i * 7919) % 1000) / 1000 * 0.9;
    const k = EASE(clamp01((t - t0 - delay) / 0.45));
    const tx = target[i * 3], ty = target[i * 3 + 1], tz = target[i * 3 + 2];
    pos[i * 3] = PROJ.x + (tx - PROJ.x) * k; pos[i * 3 + 1] = PROJ.y + (ty - PROJ.y) * k; pos[i * 3 + 2] = PROJ.z + (tz - PROJ.z) * k + 0.01;
    const dc = flat ? new THREE.Color('#7f8aa3') : depthColor(dots.depthK[i]);
    const c = ir.clone().lerp(dc, depthOn).multiplyScalar(k > 0 ? fade * 1.9 : 0);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
  return (
    <points geometry={geo} frustumCulled={false}>
      <pointsMaterial size={0.05} map={mats.glowW} vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} color="#ffffff" sizeAttenuation />
    </points>
  );
};

// thin beam cone from the projector while firing
const Beam: React.FC<{t: number}> = ({t}) => {
  const op = envAt(t, FIRE - 0.1, FIRE + 1.6, 0.2, 0.8) + envAt(t, PHOTO2, PHOTO2 + 1.3, 0.2, 0.6);
  if (op <= 0) return null;
  return (
    <mesh position={[PROJ.x, PROJ.y, PROJ.z - 1.55]} rotation={[Math.PI / 2, 0, 0]}>
      <coneGeometry args={[1.25, 3.1, 48, 1, true]} />
      <meshBasicMaterial color="#ff6a86" transparent opacity={0.07 * op} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </mesh>
  );
};

const Scene: React.FC<{t: number}> = ({t}) => {
  const mats = useMats();
  const geo = useMemo(() => buildFace(), []);
  const dots = useMemo(() => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial()); m.updateMatrixWorld(); return buildDots(m);
  }, [geo]);
  return (
    <>
      <ambientLight intensity={0.25} />
      <directionalLight position={[3, 4, 6]} intensity={1.6} color="#fff1e4" />
      <directionalLight position={[-5, 2, -3]} intensity={1.0} color="#7aa8ff" />
      <pointLight position={[0, 0.2, PHONE_Z - 0.3]} intensity={2.2} distance={5} color="#9fb8ff" />
      <Face t={t} mats={mats} geo={geo} />
      <Photo t={t} mats={mats} />
      <Phone t={t} mats={mats} />
      <Beam t={t} />
      <DotField t={t} mats={mats} dots={dots} />
      <CameraRig keys={KEYS} t={t} exposure={1.0} />
    </>
  );
};

export const FaceIdReel: React.FC = () => {
  const [ready, setReady] = React.useState(false);
  const [h] = React.useState(() => delayRender('fonts'));
  React.useEffect(() => { Promise.all([document.fonts.load('800 92px Inter'), document.fonts.load('600 34px Inter'), document.fonts.load('500 30px "JetBrains Mono"')]).then(() => { setReady(true); continueRender(h); }); }, [h]);
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const t = frame / fps;
  const endOp = envAt(t, vo.total + 0.15, END + 5, 0.4);
  const unlocked = envAt(t, L[0][0] + 1.0, PHOTO1 - 0.1, 0.3, 0.2);
  const photoQ = envAt(t, PHOTO1 + 0.3, HEAD2, 0.3, 0.2);
  const dotsL = envAt(t, wt(/^thirty$/, 2), L[3][0], 0.3, 0.3);
  const irL = envAt(t, wt(/^infrared$/, 2), L[3][0], 0.3, 0.3);
  const feat = L[3];
  const depthL = envAt(t, DEPTH, L[5][0], 0.4, 0.3);
  const flatL = envAt(t, wt(/^flat/, 5), L[6][0], 0.3, 0.3);
  const rejL = envAt(t, wt(/^pass/, 5) - 0.2, L[6][0], 0.2, 0.3);
  const devL = envAt(t, wt(/^phone$/, 6) - 0.2, L[7][0], 0.3, 0.3);
  const cloudL = envAt(t, wt(/^cloud/, 6) - 0.3, L[7][0], 0.3, 0.3);
  const odds = envAt(t, wt(/^Less$/, 7) - 0.1, vo.total + 0.3, 0.3, 0.3);
  return (
    <AbsoluteFill style={{background: '#03050b'}}>
      <AbsoluteFill>
        <ThreeCanvas width={width} height={height} gl={{antialias: true}} camera={{fov: 30, position: [0, 0, 7]}}>
          {ready ? <Scene t={t} /> : null}
        </ThreeCanvas>
      </AbsoluteFill>
      <Flash t={t} at={PHOTO1} dur={0.4} />
      <Flash t={t} at={HEAD2} dur={0.4} />
      <Flash t={t} at={PHOTO2} dur={0.4} />
      <Flash t={t} at={HEAD3} dur={0.4} />
      <SeriesTag text="HOW IT WORKS · FACE ID" op={Math.min(1, t / 0.4) * (1 - endOp)} />
      <Label x={width / 2} y={420} op={unlocked} color={C.accent} size={38}>face match → unlocked</Label>
      <Label x={width / 2} y={420} op={photoQ} color={C.warm} size={38}>just a photo?</Label>
      <Label x={width / 2} y={400} op={dotsL} color={'#ff8fa3'} size={38}>30,000+ invisible dots</Label>
      <Label x={width / 2} y={470} op={irL} color={C.dim} size={30}>infrared · your eyes can't see it</Label>
      <Label x={width / 2} y={420} op={envAt(t, wt(/^nose/, 3), feat[1] + 0.3, 0.2, 0.3)} color={C.text} size={36}>
        {t < wt(/^cheeks/, 3) ? 'nose' : t < wt(/^brow/, 3) ? 'nose · cheeks' : 'nose · cheeks · brow'}
      </Label>
      <Label x={width / 2} y={420} op={depthL} color={C.accent} size={38}>3D depth map</Label>
      {depthL > 0 ? (
        <div style={{position: 'absolute', left: 340, right: 340, top: 480, height: 16, borderRadius: 8, opacity: depthL,
          background: 'linear-gradient(90deg, hsl(223,100%,55%), hsl(150,100%,50%), hsl(60,100%,55%), hsl(25,100%,55%))'}}>
          <div style={{position: 'absolute', left: 0, top: 22, fontFamily: 'JetBrains Mono', fontSize: 24, color: C.dim}}>far</div>
          <div style={{position: 'absolute', right: 0, top: 22, fontFamily: 'JetBrains Mono', fontSize: 24, color: C.dim}}>near</div>
        </div>
      ) : null}
      <Label x={width / 2} y={420} op={flatL * (1 - rejL)} color={C.warm} size={38}>depth: flat</Label>
      <Label x={width / 2} y={420} op={rejL} color={'#ff7a7a'} size={40}>no depth → rejected ✕</Label>
      <Label x={width / 2} y={400} op={devL} color={C.accent} size={36}>matched on the phone</Label>
      <Label x={width / 2} y={470} op={cloudL} color={'#ff7a7a'} size={32}>sent to the cloud: never</Label>
      {odds > 0 ? (
        <div style={{position: 'absolute', top: 330, width: '100%', textAlign: 'center', opacity: odds, transform: `scale(${0.92 + 0.08 * odds})`}}>
          <div style={{fontFamily: 'Inter', fontWeight: 900, fontSize: 120, color: C.warm, letterSpacing: -3, textShadow: '0 4px 30px rgba(0,0,0,0.8)'}}>1 in 1,000,000</div>
          <div style={{fontFamily: 'JetBrains Mono', fontSize: 30, color: C.dim, marginTop: 6}}>chance a random person unlocks it</div>
        </div>
      ) : null}
      <Captions vo={vo as any} t={t} hi={/dots|infrared|camera|depth|3D|map|phone/i} warm={/photo|flat\.?|pass\.?$|million\.?$|cloud\.?$/i} />
      <EndCard op={endOp} />
      <Grade frame={frame} />
    </AbsoluteFill>
  );
};
