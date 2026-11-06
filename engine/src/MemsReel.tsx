import React, {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, delayRender, continueRender} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import vo from './mems_vo.json';
import {C, EASE, v3, clamp01, envAt, Key, CameraRig, projectAt, canvasTex, glowTex, Captions, Label, SeriesTag, EndCard, Grade, Flash} from './lib';

const FPS = 30;
const L = vo.lines.map((l: any) => [l.start, l.end] as [number, number]);
const END = vo.total + 2.6;
export const MEMS_DURATION = Math.ceil(END * FPS);

// ---------------- layout ----------------
const W = v3(100, 0, 0);               // MEMS world origin (far from the phone world)
const CHIP = v3(0.17, 0.42, 0.012);     // accelerometer package on the phone's board (1 unit = 100 mm)
const CUT_IN = L[2][0] - 0.25;          // phone -> MEMS
const CUT_OUT = L[7][0] - 0.15;         // MEMS -> phone

const KEYS: Key[] = [
  [0, v3(1.6, 0.5, 3.8), v3(0, -0.05, 0), 30],
  [L[0][1], v3(1.1, 0.35, 3.3), v3(0, -0.05, 0), 30],
  [L[1][0] + 1.0, v3(0.6, 0.75, 1.55), v3(0.1, 0.36, 0), 30],
  [CUT_IN - 0.02, CHIP.clone().add(v3(0.012, 0.02, 0.07)), CHIP.clone(), 30],
  [CUT_IN, W.clone().add(v3(0.4, 11, 7.5)), W.clone().add(v3(0, -0.2, 0.2)), 30],
  [L[2][1], W.clone().add(v3(-0.8, 7.2, 6.0)), W.clone().add(v3(0, -0.2, 0)), 30],
  [L[3][0] + 0.9, W.clone().add(v3(1.6, 1.25, -0.2)), W.clone().add(v3(0.2, 0, -1.6)), 34],
  [L[3][1], W.clone().add(v3(0.8, 1.05, -0.5)), W.clone().add(v3(-0.1, 0, -1.6)), 34],
  [L[4][0] + 0.8, W.clone().add(v3(0, 9.5, 6.5)), W.clone().add(v3(0, -0.2, 0.3)), 30],
  [L[4][1], W.clone().add(v3(0.3, 9.0, 6.0)), W.clone().add(v3(0, -0.2, 0.3)), 30],
  [L[5][0] + 0.8, W.clone().add(v3(0.25, 2.6, -0.4)), W.clone().add(v3(0.0, 0, -1.55)), 32],
  [L[5][1], W.clone().add(v3(0.05, 2.3, -0.6)), W.clone().add(v3(0.0, 0, -1.55)), 32],
  [L[6][0] + 0.9, W.clone().add(v3(-2.5, 7.5, 7.5)), W.clone().add(v3(0, -0.5, 0.8)), 30],
  [CUT_OUT - 0.02, W.clone().add(v3(-2.0, 7.0, 7.0)), W.clone().add(v3(0, -0.5, 0.8)), 30],
  [CUT_OUT, v3(0, 0.05, 3.7), v3(0, 0, 0), 30],
  [END, v3(0, 0.0, 3.45), v3(0, 0, 0), 30],
];

// tilt angle of the phone/chip (radians) and the resulting proof-mass shift (scene units)
const tiltAt = (t: number) => {
  const a = EASE(clamp01((t - L[4][0] - 0.6) / 1.4)) - EASE(clamp01((t - L[6][0] + 0.3) / 1.0));
  return a * 0.42;
};
const massShift = (t: number) => {
  let d = Math.sin(tiltAt(t)) * 0.095;
  // jitter: always moving slightly ("never sits still"), bigger during the 3-axis section
  const j = 0.004 + 0.02 * envAt(t, L[6][0], CUT_OUT, 0.5, 0.3);
  d += j * (Math.sin(t * 23.1) * 0.6 + Math.sin(t * 37.7 + 1) * 0.4);
  return d;
};

// ---------------- phone world ----------------
const Phone: React.FC<{t: number; mats: any; xray: number; rot: number}> = ({t, mats, xray, rot}) => {
  const body = useMemo(() => new RoundedBoxGeometry(0.76, 1.6, 0.085, 6, 0.1), []);
  const bodyMat = mats.body as THREE.MeshPhysicalMaterial;
  bodyMat.opacity = 1 - 0.85 * xray; bodyMat.transparent = xray > 0.001; bodyMat.depthWrite = xray < 0.5;
  const scr = mats.screen as THREE.MeshBasicMaterial;
  scr.opacity = 1 - xray; scr.transparent = true;
  const land = clamp01((t - (CUT_OUT + 1.2)) / 0.9);
  scr.map = land > 0.5 ? mats.uiLand : mats.uiPort;
  const wob = t < L[1][0] ? 0.03 * Math.sin(t * 2.1) : 0;
  return (
    <group rotation={[0.08 + wob, -0.35 + Math.sin(t * 0.4) * 0.12 * (t < CUT_IN ? 1 : 0), rot]}>
      <mesh geometry={body} material={bodyMat} />
      <mesh position={[0, 0, 0.0435]}><planeGeometry args={[0.7, 1.53]} /><primitive object={scr} attach="material" /></mesh>
      {/* camera bump on the back */}
      <mesh position={[-0.2, 0.6, -0.05]} material={bodyMat}><boxGeometry args={[0.26, 0.26, 0.02]} /></mesh>
      {/* internals, visible in x-ray */}
      {xray > 0.01 ? (
        <group>
          <mesh position={[0.02, 0.38, 0]} material={mats.pcb}><boxGeometry args={[0.62, 0.62, 0.012]} /></mesh>
          <mesh position={[-0.12, 0.43, 0.012]} material={mats.lid}><boxGeometry args={[0.15, 0.15, 0.012]} /></mesh>
          <mesh position={[0.08, 0.28, 0.01]} material={mats.chip}><boxGeometry args={[0.1, 0.07, 0.008]} /></mesh>
          <mesh position={[-0.12, 0.22, 0.01]} material={mats.chip}><boxGeometry args={[0.07, 0.05, 0.008]} /></mesh>
          {[0, 1, 2, 3, 4, 5].map((i) => <mesh key={i} position={[0.24, 0.2 + i * 0.05, 0.009]} material={mats.lid}><boxGeometry args={[0.02, 0.012, 0.006]} /></mesh>)}
          {/* the accelerometer */}
          <mesh position={CHIP.toArray()} material={mats.chip}><boxGeometry args={[0.02, 0.02, 0.0095]} /></mesh>
          <sprite position={CHIP.clone().add(v3(0, 0, 0.008)).toArray()} scale={[0.16, 0.16, 1]}><spriteMaterial map={mats.glowC} transparent opacity={xray * (0.6 + 0.3 * Math.sin(t * 6))} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite>
          <mesh position={[0, -0.35, 0]} material={mats.battery}><boxGeometry args={[0.6, 0.72, 0.03]} /></mesh>
        </group>
      ) : null}
    </group>
  );
};

// ---------------- MEMS world ----------------
const FX = Array.from({length: 9}, (_, i) => -1.36 + i * 0.34);   // finger x positions on the proof mass
const GAP0 = 0.06;                                                  // rest gap between finger edges
const FW = 0.06;                                                    // finger width

const Spring: React.FC<{x0: number; x1: number; mat: THREE.Material}> = ({x0, x1, mat}) => {
  const n = 7, segs: JSX.Element[] = [];
  for (let k = 0; k <= n; k++) {
    const x = x0 + (x1 - x0) * (k / n);
    segs.push(<mesh key={'v' + k} material={mat} position={[x, 0, 0]}><boxGeometry args={[0.035, 0.2, 1.0]} /></mesh>);
    if (k < n) {
      const xn = x0 + (x1 - x0) * ((k + 1) / n);
      const z = k % 2 === 0 ? 0.5 : -0.5;
      segs.push(<mesh key={'h' + k} material={mat} position={[(x + xn) / 2, 0, z]}><boxGeometry args={[Math.abs(xn - x) + 0.035, 0.2, 0.035]} /></mesh>);
    }
  }
  return <>{segs}</>;
};

const Mems: React.FC<{t: number; mats: any}> = ({t, mats}) => {
  const dx = massShift(t);
  const tilt = tiltAt(t);
  const charge = envAt(t, L[5][0] - 0.2, CUT_OUT, 0.6, 0.3);
  const hiFingers = envAt(t, L[3][0], L[3][1] + 0.3, 0.5, 0.5);
  const hiSprings = envAt(t, L[2][0] + 1.6, L[2][1] + 0.2, 0.5, 0.5);
  return (
    <group position={W.toArray()} rotation={[0, 0, -tilt]}>
      {/* substrate */}
      <mesh position={[0, -0.32, 0]} material={mats.substrate}><boxGeometry args={[9, 0.2, 7.2]} /></mesh>
      {/* anchors + fixed rails */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * 2.75, 0, 0]} material={mats.anchor}><boxGeometry args={[0.3, 0.3, 1.3]} /></mesh>
          <mesh position={[0, 0, s * 2.35]} material={mats.si}><boxGeometry args={[3.4, 0.2, 0.22]} /></mesh>
          <mesh position={[0, -0.05, s * 2.35]} material={mats.anchor}><boxGeometry args={[3.6, 0.3, 0.34]} /></mesh>
          {/* fixed fingers from rail toward mass, offset to one side of each moving finger */}
          {FX.map((x, i) => (
            <mesh key={i} position={[x + s * (GAP0 + FW), 0, s * 1.58]} material={mats.si}><boxGeometry args={[FW, 0.2, 1.3]} /></mesh>
          ))}
          {/* springs between mass edge and anchor */}
          <Spring x0={s * 1.55 + dx} x1={s * 2.6} mat={hiSprings > 0 ? mats.siHi : mats.si} />
        </group>
      ))}
      {/* proof mass (moves) */}
      <group position={[dx, 0, 0]}>
        <mesh material={mats.mass}><boxGeometry args={[3.1, 0.2, 1.7]} /></mesh>
        {[-1, 1].map((s) => FX.map((x, i) => (
          <mesh key={`${s}${i}`} position={[x, 0, s * 1.5]} material={hiFingers > 0 ? mats.siHi : mats.si}><boxGeometry args={[FW, 0.2, 1.3]} /></mesh>
        )))}
        {/* weight glow so the viewer can find it */}
        <sprite position={[0, 0.3, 0]} scale={[4, 2.6, 1]}><spriteMaterial map={mats.glowW} transparent opacity={0.22 * envAt(t, CUT_IN, L[3][0], 0.5, 0.6)} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite>
      </group>
      {/* electric field glow in the gaps: brighter where the gap is smaller */}
      {charge > 0 ? [-1, 1].map((s) => FX.map((x, i) => {
        const gap = Math.max(0.012, GAP0 - s * dx);          // top side (s=-1) closes for +dx? choose: s*dx
        const xm = x + dx + s * (FW / 2 + gap / 2);
        const inten = Math.min(1.6, Math.pow(GAP0 / gap, 2));
        return (
          <mesh key={`g${s}${i}`} position={[xm, 0, s * 1.58]}>
            <boxGeometry args={[gap * 0.95, 0.24, 1.2]} />
            <meshBasicMaterial color={s > 0 ? C.accent : C.warm} transparent opacity={Math.min(1, charge * 0.6 * inten)} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
        );
      })) : null}
    </group>
  );
};

// ---------------- materials ----------------
const useMats = () => useMemo(() => {
  const ui = (land: boolean) => canvasTex(700, 1530, (g) => {
    if (land) { g.translate(0, 1530); g.rotate(-Math.PI / 2); }
    const w = land ? 1530 : 700, h = land ? 700 : 1530;
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#0b1d3a'); gr.addColorStop(0.55, '#16365f'); gr.addColorStop(1, '#2a1c49');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.92)'; g.font = `600 ${land ? 120 : 150}px Inter, sans-serif`; g.textAlign = 'center';
    g.fillText('10:24', land ? 330 : w / 2, land ? 300 : 380);
    g.font = '500 40px Inter, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillText('Friday, 6 November', land ? 330 : w / 2, land ? 370 : 460);
    const cw = land ? 760 : 560, ch = land ? 470 : 560, cx = land ? 680 : (w - cw) / 2, cy = land ? 115 : 640;
    const pg = g.createLinearGradient(cx, cy, cx + cw, cy + ch); pg.addColorStop(0, '#ff9a5a'); pg.addColorStop(1, '#5b3df5');
    g.fillStyle = pg; g.beginPath(); (g as any).roundRect(cx, cy, cw, ch, 36); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.arc(cx + cw * 0.7, cy + ch * 0.35, Math.min(cw, ch) * 0.18, 0, Math.PI * 2); g.fill();
  });
  const etch = canvasTex(620, 340, (g) => {
    g.fillStyle = '#9aa3ae'; g.fillRect(0, 0, 620, 340);
    for (let x = 10; x < 620; x += 20) for (let y = 10; y < 340; y += 20) { g.fillStyle = '#3a4048'; g.fillRect(x, y, 9, 9); }
  });
  return {
    body: new THREE.MeshPhysicalMaterial({color: '#2b2f36', metalness: 0.85, roughness: 0.28, clearcoat: 0.6}),
    screen: new THREE.MeshBasicMaterial({toneMapped: false}),
    uiPort: ui(false), uiLand: ui(true),
    pcb: new THREE.MeshStandardMaterial({color: '#0f2a22', metalness: 0.3, roughness: 0.55}),
    lid: new THREE.MeshStandardMaterial({color: '#c8ccd2', metalness: 1, roughness: 0.25}),
    chip: new THREE.MeshStandardMaterial({color: '#141518', metalness: 0.2, roughness: 0.6}),
    battery: new THREE.MeshStandardMaterial({color: '#20242a', metalness: 0.6, roughness: 0.4}),
    substrate: new THREE.MeshStandardMaterial({color: '#10161f', metalness: 0.6, roughness: 0.5}),
    anchor: new THREE.MeshStandardMaterial({color: '#4a525d', metalness: 0.8, roughness: 0.35}),
    si: new THREE.MeshStandardMaterial({color: '#8d97a4', metalness: 0.95, roughness: 0.3, envMapIntensity: 0.55}),
    siHi: new THREE.MeshStandardMaterial({color: '#bfeaff', metalness: 0.7, roughness: 0.25, emissive: new THREE.Color(C.accent), emissiveIntensity: 0.35}),
    mass: new THREE.MeshStandardMaterial({map: etch, metalness: 0.95, roughness: 0.3, color: '#c9d2dc', envMapIntensity: 0.7}),
    glowC: glowTex('95,208,255'), glowW: glowTex('255,181,71'),
  };
}, []);

const Scene: React.FC<{t: number}> = ({t}) => {
  const mats = useMats();
  const xray = envAt(t, L[1][0] + 0.2, CUT_IN + 0.2, 0.8, 0.01);
  const rot = t > CUT_OUT ? -EASE(clamp01((t - (CUT_OUT + 1.0)) / 1.1)) * Math.PI / 2 : 0;
  const stars = useMemo(() => {
    const n = 1200, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(40 + Math.random() * 40); a.set([v.x, v.y, v.z], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3)); return g;
  }, []);
  return (
    <>
      <ambientLight intensity={0.15} />
      <directionalLight position={[3, 5, 4]} intensity={1.6} color="#fff4e6" />
      <directionalLight position={[W.x - 6, 1.5, -5]} intensity={1.4} color="#5fd0ff" />
      <directionalLight position={[-4, 2, -3]} intensity={0.7} color="#7aa8ff" />
      <pointLight position={[W.x + 3, 2.5, 3]} intensity={18} distance={14} color="#ffb547" />
      <points geometry={stars}><pointsMaterial color="#9fb7ff" size={0.06} transparent opacity={0.35} depthWrite={false} /></points>
      <Phone t={t} mats={mats} xray={xray} rot={rot} />
      <Mems t={t} mats={mats} />
      <CameraRig keys={KEYS} t={t} exposure={1.0} />
    </>
  );
};

// 3-axis live chart (DOM) for "hundreds of times a second, in all three directions"
const AxisChart: React.FC<{t: number; op: number}> = ({t, op}) => {
  if (op <= 0) return null;
  const rows = [['X', C.accent, 1.0], ['Y', C.warm, 0.6], ['Z', '#b9a6ff', 0.4]] as const;
  const W2 = 860, H2 = 90;
  return (
    <div style={{position: 'absolute', left: 110, top: 300, width: W2, opacity: op, background: 'rgba(5,10,24,0.6)', border: '1px solid rgba(95,208,255,0.3)', borderRadius: 16, padding: '18px 22px'}}>
      <div style={{fontFamily: 'JetBrains Mono', fontSize: 26, color: C.dim, marginBottom: 6}}>LIVE · 800 readings / second</div>
      {rows.map(([n, col, amp], r) => {
        const pts: string[] = [];
        for (let i = 0; i <= 120; i++) {
          const tt = t - (120 - i) / 60;
          const y = H2 / 2 - (Math.sin(tt * (7 + r * 3)) * 0.5 + Math.sin(tt * (17 + r * 5) + r) * 0.3 + (r === 0 ? Math.sin(tiltAt(tt)) * 2 : 0)) * 26 * amp;
          pts.push(`${(i / 120) * (W2 - 60)},${y.toFixed(1)}`);
        }
        return (
          <div key={n} style={{display: 'flex', alignItems: 'center', gap: 12}}>
            <div style={{fontFamily: 'JetBrains Mono', fontSize: 30, color: col, width: 36}}>{n}</div>
            <svg width={W2 - 60} height={H2}><polyline points={pts.join(' ')} fill="none" stroke={col} strokeWidth={4} strokeLinejoin="round" /></svg>
          </div>
        );
      })}
    </div>
  );
};

export const MemsReel: React.FC = () => {
  const [ready, setReady] = React.useState(false);
  const [h] = React.useState(() => delayRender('fonts'));
  React.useEffect(() => { Promise.all([document.fonts.load('600 150px Inter'), document.fonts.load('500 40px Inter')]).then(() => { setReady(true); continueRender(h); }); }, [h]);
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const t = frame / fps;
  const chip = projectAt(KEYS, CHIP, t, width, height);
  const twoMm = envAt(t, L[1][0] + 1.0, CUT_IN - 0.1, 0.4, 0.2);
  const springLbl = envAt(t, L[2][0] + 1.7, L[2][1] + 0.1);
  const fingerLbl = envAt(t, L[3][0] + 1.0, L[3][1] + 0.1);
  const gravity = envAt(t, L[4][0] + 0.8, L[5][0] + 0.3);
  const cLbl = envAt(t, L[5][0] + 1.4, L[6][0]);
  const chart = envAt(t, L[6][0] + 0.6, CUT_OUT - 0.05, 0.4, 0.2);
  const steps = envAt(t, L[7][0] + 2.6, END + 5);
  const endOp = envAt(t, vo.total + 0.15, END + 5, 0.4);
  const stepN = Math.floor(6200 + clamp01((t - L[7][0] - 2.6) / 2) * 14);
  const dx = massShift(t);
  return (
    <AbsoluteFill style={{background: '#03050b'}}>
      <AbsoluteFill>
        <ThreeCanvas width={width} height={height} gl={{antialias: true}} camera={{fov: 30, position: [0, 0, 3]}}>
          {ready ? <Scene t={t} /> : null}
        </ThreeCanvas>
      </AbsoluteFill>
      <SeriesTag text="HOW IT WORKS · SCREEN ROTATION" op={Math.min(1, t / 0.4) * (1 - endOp)} />
      <Label x={chip.x + 140} y={chip.y - 90} op={twoMm} color={C.accent} size={40}>2 mm chip</Label>
      <Label x={width / 2} y={420} op={springLbl} color={C.accent} size={36}>silicon springs</Label>
      <Label x={width / 2} y={420} op={fingerLbl} color={C.accent} size={36}>fingers · a few microns wide</Label>
      <Label x={width / 2} y={420} op={gravity} color={C.warm} size={40}>tilt → gravity pulls the weight</Label>
      <Label x={width / 2} y={420} op={cLbl} color={C.text} size={36}>
        <span style={{color: C.accent}}>gap ↓ charge ↑</span>{'   '}<span style={{color: C.warm}}>gap ↑ charge ↓</span>
      </Label>
      <AxisChart t={t} op={chart} />
      <Label x={width / 2} y={420} op={steps} color={C.warm} size={44}>STEPS {stepN.toLocaleString('en-IN')}</Label>
      <Captions vo={vo as any} t={t} hi={/weight|chip|two|millimetres|silicon|springs|fingers|hair|gravity|charge|hundreds|three|rotate/i} warm={/steps\.?$/i} />
      <Flash t={t} at={CUT_IN} />
      <Flash t={t} at={CUT_OUT} />
      <EndCard op={endOp} />
      <Grade frame={frame} />
      <div style={{display: 'none'}}>{dx}</div>
    </AbsoluteFill>
  );
};
