import React, {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, delayRender, continueRender} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import vo from './tap_vo.json';
import {C, EASE, v3, clamp01, envAt, Key, CameraRig, projectAt, canvasTex, glowTex, Captions, Label, SeriesTag, EndCard, Grade} from './lib';

const FPS = 30;
const L = vo.lines.map((l: any) => [l.start, l.end] as [number, number]);
const wt = (re: RegExp, line: number) => (vo.words as any[]).find((w) => w.line === line && re.test(w.w))!.s as number;
const END = vo.total + 2.6;
export const TAP_DURATION = Math.ceil(END * FPS);

// 1 scene unit ~ 1 inch (card is 3.37 x 2.13 in)
const CW = 3.37, CH = 2.13, CT = 0.03;
const TOP = 0.6;                                  // terminal top surface height
const HOVER = TOP + 1.5;                          // "about an inch and a half"
const XRAY0 = L[2][0] - 0.1;
const FIELD0 = L[3][0] + 0.2;
const MOVE0 = L[4][0], ARRIVE = wt(/^powers$/, 4);
const CODE0 = wt(/^creates$/, 5);
const STEAL = L[6][0];
const PHONE0 = L[7][0] - 0.1;

const KEYS: Key[] = [
  [0, v3(1.0, 4.2, 13.5), v3(0, 3.4, 0), 30],
  [L[1][1], v3(0.6, 4.0, 12.0), v3(0, 3.4, 0), 30],
  [L[2][0] + 1.2, v3(-1.0, 4.6, 12.4), v3(0, 3.4, 0), 30],
  [L[2][1], v3(-1.2, 4.4, 12.0), v3(0, 3.4, 0), 30],
  [L[3][0] + 1.6, v3(7.0, 9.0, 15.0), v3(0, 2.0, 0), 30],
  [L[3][1], v3(6.2, 8.0, 14.0), v3(0, 2.0, 0), 30],
  [ARRIVE + 0.3, v3(6.5, 6.0, 12.0), v3(0, 1.9, 0.2), 30],
  [L[5][1], v3(5.8, 5.5, 11.0), v3(0, 1.9, 0.2), 30],
  [L[6][1], v3(5.6, 5.8, 11.4), v3(0, 1.9, 0.2), 30],
  [PHONE0 + 1.2, v3(6.8, 7.0, 13.0), v3(0, 2.0, 0), 30],
  [END, v3(7.4, 7.5, 14.0), v3(0, 2.0, 0), 30],
];

// card pose
const cardPose = (t: number) => {
  const p0 = v3(0, 3.4, 0);
  const pH = v3(0, HOVER, 0.2);
  const k = EASE(clamp01((t - MOVE0) / (ARRIVE - MOVE0)));
  const away = EASE(clamp01((t - PHONE0) / 0.9));
  const pos = p0.clone().lerp(pH, k).add(v3(-6 * away, 1.5 * away, 0));
  const spin = (1 - EASE(clamp01((t - 0.1) / (XRAY0 - 0.1)))) * 0.9;
  // face camera early (stand up), lie flat over the reader later
  const stand = 1 - EASE(clamp01((t - L[3][0]) / 1.4));
  const rx = -Math.PI / 2 * (1 - stand) + 0.15 * stand;
  return {pos, rot: new THREE.Euler(rx, spin + 0.08 * Math.sin(t * 0.8) * stand, 0.04 * Math.sin(t * 0.6))};
};
const phonePose = (t: number) => {
  const k = EASE(clamp01((t - PHONE0 - 0.3) / 1.0));
  return v3(6 * (1 - k), HOVER + 0.2 + 1.2 * (1 - k), 0.2);
};

// field strength at the card (0..1) -> powers chip
const powerAt = (t: number) => clamp01((t - (ARRIVE - 0.6)) / 0.5) * (1 - clamp01((t - PHONE0) / 0.4));

// ---------------- geometry helpers ----------------
const coilPath = (loops: number) => {
  const pts: THREE.Vector3[] = [];
  for (let l = 0; l < loops; l++) {
    const ix = CW / 2 - 0.16 - l * 0.07, iy = CH / 2 - 0.16 - l * 0.07;
    pts.push(v3(-ix, iy, 0), v3(ix, iy, 0), v3(ix, -iy, 0), v3(-ix, -iy, 0), v3(-ix, iy - 0.07, 0));
  }
  return pts;
};
const pathLen = (pts: THREE.Vector3[]) => { let s = 0; for (let i = 1; i < pts.length; i++) s += pts[i].distanceTo(pts[i - 1]); return s; };
const pathAt = (pts: THREE.Vector3[], u: number) => {
  const total = pathLen(pts); let d = ((u % 1) + 1) % 1 * total;
  for (let i = 1; i < pts.length; i++) { const seg = pts[i].distanceTo(pts[i - 1]); if (d <= seg) return pts[i - 1].clone().lerp(pts[i], d / seg); d -= seg; }
  return pts[pts.length - 1].clone();
};
// dipole field line r = R sin^2(theta), around vertical axis, from the reader coil
const fieldLine = (R: number, phi: number) => {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 60; i++) {
    const th = 0.16 + (Math.PI - 0.32) * (i / 60);
    const r = R * Math.sin(th) ** 2;
    pts.push(v3(r * Math.sin(th) * Math.cos(phi), TOP + r * Math.cos(th), r * Math.sin(th) * Math.sin(phi)));
  }
  return pts.filter((p) => p.y > TOP - 0.05);
};

// ---------------- materials ----------------
const useMats = () => useMemo(() => {
  const face = canvasTex(1024, 648, (g) => {
    const gr = g.createLinearGradient(0, 0, 1024, 648); gr.addColorStop(0, '#10213f'); gr.addColorStop(0.6, '#1c1f4d'); gr.addColorStop(1, '#3a1d52');
    g.fillStyle = gr; g.fillRect(0, 0, 1024, 648);
    g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 2;
    for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(900, 80, 120 + i * 40, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.92)'; g.font = '800 54px Inter, sans-serif'; g.fillText('northwind', 70, 110);
    // chip contact pad
    const cg = g.createLinearGradient(120, 250, 250, 350); cg.addColorStop(0, '#f3d27a'); cg.addColorStop(0.5, '#c9a245'); cg.addColorStop(1, '#f0cf78');
    g.fillStyle = cg; g.beginPath(); (g as any).roundRect(110, 240, 150, 116, 18); g.fill();
    g.strokeStyle = 'rgba(80,60,10,0.6)'; g.lineWidth = 3;
    [[110, 298, 260, 298], [185, 240, 185, 280], [185, 316, 185, 356], [150, 280, 220, 280], [150, 316, 220, 316], [150, 280, 150, 316], [220, 280, 220, 316]].forEach(([a, b, c, d]) => { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); });
    // contactless symbol
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 7; g.lineCap = 'round';
    for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(300 + i * 16, 298, 14 + i * 16, -0.9, 0.9); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.font = '500 58px "JetBrains Mono", monospace'; g.fillText('••••  ••••  ••••  4417', 70, 480);
    g.font = '600 32px Inter, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillText('CARDHOLDER', 70, 570);
  });
  const screen = canvasTex(512, 900, (g) => {
    g.fillStyle = '#0a0f1c'; g.fillRect(0, 0, 512, 900);
    g.fillStyle = '#f4f7ff'; g.textAlign = 'center'; g.font = '800 120px Inter, sans-serif'; g.fillText('$4.50', 256, 230);
    g.font = '600 40px Inter, sans-serif'; g.fillStyle = 'rgba(244,247,255,0.7)'; g.fillText('Tap to pay', 256, 300);
    g.strokeStyle = '#5fd0ff'; g.lineWidth = 16; g.lineCap = 'round';
    for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(190 + i * 30, 560, 30 + i * 32, -0.85, 0.85); g.stroke(); }
  });
  const phoneUI = canvasTex(700, 1530, (g) => {
    g.fillStyle = '#05070d'; g.fillRect(0, 0, 700, 1530);
    g.fillStyle = 'rgba(255,255,255,0.75)'; g.font = '600 44px Inter, sans-serif'; g.textAlign = 'center'; g.fillText('Hold near reader', 350, 1150);
    g.strokeStyle = '#5fd0ff'; g.lineWidth = 12; g.lineCap = 'round';
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(330 + i * 22, 1300, 26 + i * 26, -0.85, 0.85); g.stroke(); }
  });
  const ring = canvasTex(256, 256, (g) => { g.strokeStyle = 'rgba(200,240,255,1)'; g.lineWidth = 6; g.beginPath(); g.arc(128, 128, 118, 0, Math.PI * 2); g.stroke(); });
  const counter = canvasTex(1024, 1024, (g) => {
    g.fillStyle = '#17181c'; g.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; g.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2); }
  });
  counter.wrapS = counter.wrapT = THREE.RepeatWrapping; counter.repeat.set(3, 3);
  return {
    cardFace: new THREE.MeshPhysicalMaterial({map: face, roughness: 0.35, metalness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.2, transparent: true}),
    cardEdge: new THREE.MeshPhysicalMaterial({color: '#141a2e', roughness: 0.4, metalness: 0.3, transparent: true}),
    copper: new THREE.MeshStandardMaterial({color: '#d98a4a', metalness: 1, roughness: 0.3, emissive: new THREE.Color('#ff8a3d'), emissiveIntensity: 0}),
    die: new THREE.MeshStandardMaterial({color: '#20242c', metalness: 0.4, roughness: 0.4, emissive: new THREE.Color(C.accent), emissiveIntensity: 0}),
    term: new THREE.MeshPhysicalMaterial({color: '#202329', roughness: 0.45, metalness: 0.4, clearcoat: 0.4}),
    termScreen: new THREE.MeshBasicMaterial({map: screen, toneMapped: false}),
    keys: new THREE.MeshStandardMaterial({color: '#30343c', roughness: 0.6, metalness: 0.2}),
    counter: new THREE.MeshStandardMaterial({map: counter, roughness: 0.75, metalness: 0.1}),
    field: new THREE.MeshBasicMaterial({color: C.accent, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false}),
    phone: new THREE.MeshPhysicalMaterial({color: '#2b2f36', metalness: 0.85, roughness: 0.28, clearcoat: 0.6}),
    phoneUI: new THREE.MeshBasicMaterial({map: phoneUI, toneMapped: false}),
    ring, glowC: glowTex('95,208,255'), glowW: glowTex('255,181,71'), glowS: glowTex('235,250,255'),
  };
}, []);

// ---------------- objects ----------------
const Card: React.FC<{t: number; mats: any}> = ({t, mats}) => {
  const geo = useMemo(() => new RoundedBoxGeometry(CW, CH, CT, 4, 0.12), []);
  const coil = useMemo(() => coilPath(4), []);
  const {pos, rot} = cardPose(t);
  const xray = envAt(t, XRAY0, PHONE0 + 0.5, 0.8, 0.6);
  const pw = powerAt(t);
  (mats.cardFace as THREE.MeshPhysicalMaterial).opacity = 1 - 0.82 * xray; (mats.cardFace as any).depthWrite = xray < 0.5;
  (mats.cardEdge as THREE.MeshPhysicalMaterial).opacity = 1 - 0.82 * xray;
  (mats.copper as THREE.MeshStandardMaterial).emissiveIntensity = 0.15 * xray + 1.6 * pw * (0.8 + 0.2 * Math.sin(t * 20));
  (mats.die as THREE.MeshStandardMaterial).emissiveIntensity = 2.5 * pw;
  const segs: JSX.Element[] = [];
  for (let i = 1; i < coil.length; i++) {
    const a = coil[i - 1], b = coil[i]; const mid = a.clone().add(b).multiplyScalar(0.5); const len = a.distanceTo(b);
    const horiz = Math.abs(a.y - b.y) < 1e-4;
    segs.push(<mesh key={i} position={mid.toArray()} material={mats.copper}><boxGeometry args={horiz ? [len + 0.03, 0.03, 0.012] : [0.03, len + 0.03, 0.012]} /></mesh>);
  }
  const chipPos = v3(-CW / 2 + 0.68, 0.18, 0);
  return (
    <group position={pos.toArray()} rotation={rot}>
      <mesh geometry={geo} material={[mats.cardEdge, mats.cardEdge, mats.cardEdge, mats.cardEdge, mats.cardFace, mats.cardEdge]} />
      {xray > 0.01 ? (
        <group>
          {segs}
          {/* leads from coil to chip */}
          <mesh position={[-CW / 2 + 0.42, 0.18, 0]} material={mats.copper}><boxGeometry args={[0.4, 0.025, 0.012]} /></mesh>
          <mesh position={chipPos.toArray()} material={mats.die}><boxGeometry args={[0.22, 0.22, 0.02]} /></mesh>
          {pw > 0 ? Array.from({length: 26}, (_, i) => {
            const p = pathAt(coil, i / 26 + t * 0.35);
            return <sprite key={'e' + i} position={[p.x, p.y, 0.02]} scale={[0.22, 0.22, 1]}><spriteMaterial map={mats.glowW} transparent opacity={pw} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite>;
          }) : null}
          <sprite position={[chipPos.x, chipPos.y, 0.03]} scale={[1.3 * pw + 0.01, 1.3 * pw + 0.01, 1]}><spriteMaterial map={mats.glowC} transparent opacity={pw * 0.9} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite>
        </group>
      ) : null}
    </group>
  );
};

const Terminal: React.FC<{t: number; mats: any}> = ({t, mats}) => {
  const geo = useMemo(() => new RoundedBoxGeometry(3.2, TOP, 6.2, 5, 0.22), []);
  const on = clamp01((t - (L[3][0] - 0.8)) / 0.8);
  const lines = useMemo(() => {
    const out: {pts: THREE.Vector3[]; geo: THREE.TubeGeometry}[] = [];
    [1.6, 2.6, 3.8].forEach((R) => {
      for (let k = 0; k < 8; k++) {
        const pts = fieldLine(R, (k / 8) * Math.PI * 2 + R);
        out.push({pts, geo: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.012, 6, false)});
      }
    });
    return out;
  }, []);
  const fieldOp = envAt(t, FIELD0, PHONE0 + 6, 0.8, 0.5);
  (mats.field as THREE.MeshBasicMaterial).opacity = 0.35 * fieldOp;
  return (
    <group position={[0, 0, 0]} scale={[on, on, on]}>
      <group position={[0, TOP / 2, 0.6]}>
        <mesh geometry={geo} material={mats.term} />
        <mesh position={[0, TOP / 2 + 0.002, -0.9]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[2.5, 4.0]} /><primitive object={mats.termScreen} attach="material" /></mesh>
        {[0, 1, 2].map((r) => [0, 1, 2].map((c) => (
          <mesh key={`${r}${c}`} position={[-0.8 + c * 0.8, TOP / 2 + 0.03, 1.6 + r * 0.42]} material={mats.keys}><boxGeometry args={[0.6, 0.06, 0.3]} /></mesh>
        )))}
      </group>
      {fieldOp > 0 ? lines.map((l, i) => <mesh key={i} geometry={l.geo} material={mats.field} />) : null}
      {fieldOp > 0 ? lines.map((l, i) => Array.from({length: 3}, (_, j) => {
        const u = ((t * 0.25 + j / 3 + i * 0.13) % 1);
        const idx = Math.floor(u * (l.pts.length - 1)); const p = l.pts[idx];
        return <sprite key={`${i}-${j}`} position={p.toArray()} scale={[0.18, 0.18, 1]}><spriteMaterial map={mats.glowS} transparent opacity={fieldOp * 0.85 * Math.sin(Math.PI * u)} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite>;
      })) : null}
      {/* expanding pulses from the reader */}
      {fieldOp > 0 ? [0, 1, 2].map((k) => {
        const u = (t * 0.6 + k / 3) % 1;
        return <mesh key={'r' + k} position={[0, TOP + 0.02, 0.2]} rotation={[-Math.PI / 2, 0, 0]} scale={[0.6 + u * 4.5, 0.6 + u * 4.5, 1]}><planeGeometry args={[1, 1]} /><meshBasicMaterial map={mats.ring} transparent opacity={fieldOp * 0.5 * (1 - u)} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>;
      }) : null}
    </group>
  );
};

const Phone: React.FC<{t: number; mats: any}> = ({t, mats}) => {
  const body = useMemo(() => new RoundedBoxGeometry(2.8, 5.8, 0.32, 6, 0.36), []);
  if (t < PHONE0) return null;
  const p = phonePose(t);
  const pw = clamp01((t - (PHONE0 + 1.1)) / 0.4);
  return (
    <group position={p.toArray()} rotation={[-Math.PI / 2, 0, 0.25]}>
      <mesh geometry={body} material={mats.phone} />
      <mesh position={[0, 0, 0.165]}><planeGeometry args={[2.6, 5.6]} /><primitive object={mats.phoneUI} attach="material" /></mesh>
      <mesh position={[0, 0.9, 0.17]} material={mats.cardFace}><planeGeometry args={[CW * 0.72, CH * 0.72]} /></mesh>
      <sprite position={[0, 0, 0.3]} scale={[3 * pw + 0.01, 3 * pw + 0.01, 1]}><spriteMaterial map={mats.glowC} transparent opacity={0.5 * pw} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite>
    </group>
  );
};

const Scene: React.FC<{t: number}> = ({t}) => {
  const mats = useMats();
  return (
    <>
      <ambientLight intensity={0.2} />
      <directionalLight position={[4, 8, 6]} intensity={1.8} color="#fff4e6" />
      <directionalLight position={[-5, 3, -4]} intensity={0.9} color="#7aa8ff" />
      <pointLight position={[0, 4.5, 2]} intensity={8} distance={12} color="#5fd0ff" />
      <mesh position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.counter}><planeGeometry args={[60, 60]} /></mesh>
      <Terminal t={t} mats={mats} />
      <Card t={t} mats={mats} />
      <Phone t={t} mats={mats} />
      <CameraRig keys={KEYS} t={t} exposure={1.0} />
    </>
  );
};

// one-time code panel
const HEX = '0123456789ABCDEF';
const codeAt = (seed: number, t: number, lockAt: number) => {
  let s = '';
  for (let i = 0; i < 16; i++) {
    const locked = t > lockAt + i * 0.03;
    const r = locked ? Math.floor(Math.abs(Math.sin(seed * 91.7 + i * 12.9898) * 43758.5453) % 16) : Math.floor(Math.abs(Math.sin(t * 60 + i * 7.1 + seed) * 9999) % 16);
    s += HEX[r]; if (i % 4 === 3 && i < 15) s += ' ';
  }
  return s;
};
const CodePanel: React.FC<{t: number}> = ({t}) => {
  const op = envAt(t, CODE0 - 0.1, PHONE0, 0.3, 0.4);
  if (op <= 0) return null;
  const lock1 = CODE0 + 0.5;
  const used = clamp01((t - (STEAL + 0.3)) / 0.3);
  const next = clamp01((t - wt(/^next$/, 6)) / 0.3);
  const row = (txt: string, color: string, strike: number, tag: string) => (
    <div style={{display: 'flex', alignItems: 'center', gap: 18, marginTop: 10}}>
      <div style={{position: 'relative', fontFamily: 'JetBrains Mono', fontWeight: 500, fontSize: 52, color, letterSpacing: 2}}>
        {txt}
        {strike > 0 ? <div style={{position: 'absolute', left: 0, top: '52%', height: 6, width: `${strike * 100}%`, background: '#ff5a5a', borderRadius: 3}} /> : null}
      </div>
      <div style={{fontFamily: 'JetBrains Mono', fontSize: 26, color: strike > 0 ? '#ff7a7a' : C.dim}}>{tag}</div>
    </div>
  );
  return (
    <div style={{position: 'absolute', left: 70, right: 70, top: 300, opacity: op, background: 'rgba(5,10,24,0.72)', border: `1px solid ${C.warm}66`, borderRadius: 18, padding: '22px 30px'}}>
      <div style={{fontFamily: 'JetBrains Mono', fontSize: 28, color: C.warm, letterSpacing: 3}}>ONE-TIME CODE</div>
      {row(codeAt(1, t, lock1), C.text, used, used > 0 ? 'USED ✕' : 'this tap')}
      {next > 0 ? <div style={{opacity: next}}>{row(codeAt(2, t, wt(/^next$/, 6) + 0.3), C.accent, 0, 'next tap')}</div> : null}
    </div>
  );
};

export const TapReel: React.FC = () => {
  const [ready, setReady] = React.useState(false);
  const [h] = React.useState(() => delayRender('fonts'));
  React.useEffect(() => { Promise.all([document.fonts.load('800 54px Inter'), document.fonts.load('500 58px "JetBrains Mono"'), document.fonts.load('600 40px Inter')]).then(() => { setReady(true); continueRender(h); }); }, [h]);
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const t = frame / fps;
  const endOp = envAt(t, vo.total + 0.15, END + 5, 0.4);
  const noBat = envAt(t, 0.9, L[1][1]);
  const coilL = envAt(t, wt(/^coil$/, 2), wt(/^connected$/, 2) + 0.2);
  const chipL = envAt(t, wt(/^connected$/, 2), L[3][0]);
  const fieldL = envAt(t, wt(/^invisible$/, 3), L[4][0]);
  const dist = envAt(t, wt(/^inch$/, 4) - 0.3, L[5][0] - 0.2);
  const powered = envAt(t, ARRIVE + 0.2, L[5][0] + 0.2);
  const phoneL = envAt(t, wt(/^never$/, 7) - 0.2, vo.total + 0.3, 0.3, 0.3);
  const cardP = projectAt(KEYS, cardPose(t).pos, t, width, height);
  const topP = projectAt(KEYS, v3(0, TOP, 0.2), t, width, height);
  return (
    <AbsoluteFill style={{background: '#03050b'}}>
      <AbsoluteFill>
        <ThreeCanvas width={width} height={height} gl={{antialias: true}} camera={{fov: 30, position: [0, 3, 9]}}>
          {ready ? <Scene t={t} /> : null}
        </ThreeCanvas>
      </AbsoluteFill>
      <SeriesTag text="HOW IT WORKS · TAP TO PAY" op={Math.min(1, t / 0.4) * (1 - endOp)} />
      <Label x={width / 2} y={420} op={noBat} color={C.warm} size={40}>battery: none</Label>
      <Label x={width / 2} y={420} op={coilL} color={C.warm} size={38}>copper antenna coil</Label>
      <Label x={width / 2} y={420} op={chipL} color={C.accent} size={38}>coil → chip</Label>
      <Label x={width / 2} y={420} op={fieldL} color={C.accent} size={36}>magnetic field · 13.56 MHz</Label>
      {dist > 0 ? (
        <div style={{position: 'absolute', left: topP.x + 230, top: cardP.y, height: Math.max(10, topP.y - cardP.y), width: 4, background: C.warm, opacity: dist, boxShadow: `0 0 12px ${C.warm}`}} />
      ) : null}
      <Label x={topP.x + 330} y={(cardP.y + topP.y) / 2} op={dist} color={C.warm} size={38}>~1.5 in</Label>
      <Label x={width / 2} y={420} op={powered * (1 - dist)} color={C.warm} size={40}>chip powered ⚡</Label>
      <CodePanel t={t} />
      <Label x={width / 2} y={380} op={phoneL} color={C.text} size={32}>
        <span style={{color: '#ff7a7a'}}>real card number: never sent</span>
      </Label>
      <Label x={width / 2} y={450} op={phoneL} color={C.text} size={32}>
        <span style={{color: C.accent}}>device-only number + one-time code</span>
      </Label>
      <Captions vo={vo as any} t={t} hi={/coil|wire|chip|magnetic|field|inch|half|code|phone/i} warm={/battery\.?$|tap\?$|once\.?$|useless|number\.?$/i} />
      <EndCard op={endOp} />
      <Grade frame={frame} />
    </AbsoluteFill>
  );
};
