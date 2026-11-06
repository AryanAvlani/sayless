import React, {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, delayRender, continueRender} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import vo from './touch_vo.json';
import {C, EASE, v3, clamp01, envAt, Key, CameraRig, projectAt, canvasTex, glowTex, Captions, Label, SeriesTag, EndCard, Grade, Flash} from './lib';

const FPS = 30;
const L = vo.lines.map((l: any) => [l.start, l.end] as [number, number]);
const wt = (re: RegExp, line: number) => (vo.words as any[]).find((w) => w.line === line && re.test(w.w))!.s as number;
const END = vo.total + 2.6;
export const TOUCH_DURATION = Math.ceil(END * FPS);

// ---------------- timing ----------------
const TAP = wt(/^feel$/, 0) + 0.15;            // finger meets the phone screen
const EXPLODE0 = L[2][0] + 0.3;                 // layers separate
const CUT_IN = L[4][0] - 0.25;                  // phone -> macro grid
const TOUCH = wt(/^touch$/, 4) + 0.1;           // finger reaches the glass in macro
const STEAL = wt(/^steals$/, 4);
const SCAN0 = L[5][0];
const FOUND = wt(/^finds$/, 5);
const TEN = wt(/^ten$/, 6);
const GLOVE0 = L[7][0] - 0.2;
const GLOVE_TOUCH = wt(/^ignores$/, 7);

// ---------------- macro world layout ----------------
const W = v3(100, 0, 0);
const N = 13, P = 0.5;                          // 13 x 13 crossings, 0.5 pitch
const coord = (i: number) => (i - (N - 1) / 2) * P;
const Y_ROW = 0.0, Y_COL = 0.14, Y_GLASS0 = 0.32, Y_GLASS1 = 0.72, Y_PANEL = -0.32;
const CONTACT = v3(0.35, Y_GLASS1, 0.25);       // finger contact point (local)
const TEN_PTS: [number, number][] = [[-1.3, -2.6], [-0.4, -2.9], [0.5, -2.7], [1.3, -2.2], [-1.4, -1.1], [-1.3, 1.1], [-0.4, 1.6], [0.5, 1.5], [1.35, 1.1], [1.4, 2.7]];

const KEYS: Key[] = [
  [0, v3(0.9, 0.35, 3.6), v3(0, 0.05, 0), 30],
  [TAP, v3(0.55, 0.25, 3.0), v3(0.05, 0.1, 0), 30],
  [L[1][1], v3(0.35, 0.2, 2.75), v3(0.05, 0.1, 0), 30],
  [L[2][1], v3(2.1, 1.0, 1.9), v3(0, 0.05, 0.15), 30],
  [L[3][0] + 2.5, v3(1.8, 0.9, 1.7), v3(0, 0.1, 0.18), 30],
  [CUT_IN - 0.02, v3(0.8, 0.55, 0.95), v3(0.02, 0.15, 0.2), 30],
  [CUT_IN, W.clone().add(v3(7.4, 4.6, 7.6)), W.clone().add(v3(0.3, 0.9, 0.2)), 30],
  [TOUCH, W.clone().add(v3(6.6, 3.6, 6.8)), W.clone().add(v3(0.3, 0.7, 0.2)), 30],
  [L[4][1], W.clone().add(v3(5.6, 3.0, 5.8)), W.clone().add(v3(0.3, 0.5, 0.25)), 30],
  [SCAN0 + 1.4, W.clone().add(v3(0.6, 10.5, 3.2)), W.clone().add(v3(0.1, 0, 0.15)), 34],
  [FOUND, W.clone().add(v3(0.5, 9.8, 2.9)), W.clone().add(v3(0.1, 0, 0.15)), 34],
  [L[6][1], W.clone().add(v3(0.2, 10.6, 3.0)), W.clone().add(v3(0, 0, 0.1)), 34],
  [GLOVE0 + 0.8, W.clone().add(v3(6.4, 3.6, 6.6)), W.clone().add(v3(0.3, 0.7, 0.2)), 30],
  [END, W.clone().add(v3(7.2, 4.2, 7.4)), W.clone().add(v3(0.2, 0.6, 0.2)), 30],
];

// finger axis (from tip toward the hand)
const AX = v3(0.55, 0.75, 0.38).normalize();
const FR = 0.62, FLEN = 3.2;                    // macro finger radius / length

// macro finger: how far the tip is above the glass (0 = touching)
const fingerLift = (t: number) => {
  if (t < GLOVE0) {
    const down = EASE(clamp01((t - (CUT_IN + 0.3)) / (TOUCH - CUT_IN - 0.3)));
    const up = EASE(clamp01((t - (TEN - 0.6)) / 0.6));
    return (1 - down) * 3.0 + up * 6;
  }
  const down = EASE(clamp01((t - GLOVE0) / (GLOVE_TOUCH - GLOVE0)));
  return (1 - down) * 3.0;
};

// charge at crossing (x,z) in [0,1]; 1 = full field
const touches = (t: number): {p: [number, number]; k: number}[] => {
  const out: {p: [number, number]; k: number}[] = [];
  if (t < GLOVE0) {
    const lift = fingerLift(t);
    const k = clamp01(1 - lift / 0.5);
    if (k > 0) out.push({p: [CONTACT.x, CONTACT.z], k});
  }
  const ten = envAt(t, TEN, GLOVE0 - 0.1, 0.5, 0.4);
  if (ten > 0) TEN_PTS.forEach(([x, z], i) => { const k = clamp01((t - TEN - i * 0.04) / 0.25) * ten; if (k > 0) out.push({p: [x, z], k}); });
  return out;
};
const chargeAt = (x: number, z: number, t: number) => {
  let v = 1;
  for (const {p, k} of touches(t)) {
    const d2 = (x - p[0]) ** 2 + (z - p[1]) ** 2;
    v -= 0.85 * k * Math.exp(-d2 / (2 * 0.42 * 0.42));
  }
  return Math.max(0.08, v);
};

// ---------------- materials ----------------
const useMats = () => useMemo(() => {
  const ui = canvasTex(700, 1530, (g) => {
    const gr = g.createLinearGradient(0, 0, 700, 1530); gr.addColorStop(0, '#0b1d3a'); gr.addColorStop(0.55, '#16365f'); gr.addColorStop(1, '#2a1c49');
    g.fillStyle = gr; g.fillRect(0, 0, 700, 1530);
    g.fillStyle = 'rgba(255,255,255,0.92)'; g.font = '600 150px Inter, sans-serif'; g.textAlign = 'center';
    g.fillText('9:41', 350, 330);
    g.font = '500 40px Inter, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillText('Friday, November 6', 350, 410);
    const cols = ['#ff7a59', '#ffb547', '#5fd0ff', '#7ee08a', '#b9a6ff', '#ff6fa8', '#4f8cff', '#f4f7ff'];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      g.fillStyle = cols[(r * 4 + c) % cols.length]; g.globalAlpha = 0.9;
      g.beginPath(); (g as any).roundRect(70 + c * 150, 560 + r * 170, 110, 110, 28); g.fill();
    }
    g.globalAlpha = 1;
  });
  const lines = (vertical: boolean, rgb: string) => canvasTex(512, 1024, (g) => {
    g.clearRect(0, 0, 512, 1024);
    g.fillStyle = `rgba(${rgb},0.95)`;
    if (vertical) for (let i = 0; i < 9; i++) g.fillRect(28 + i * 57 - 3, 0, 6, 1024);
    else for (let i = 0; i < 18; i++) g.fillRect(0, 28 + i * 57 - 3, 512, 6);
  });
  const dots = canvasTex(512, 1024, (g) => {
    g.clearRect(0, 0, 512, 1024);
    for (let i = 0; i < 9; i++) for (let j = 0; j < 18; j++) {
      const x = 28 + i * 57, y = 28 + j * 57; const gr = g.createRadialGradient(x, y, 0, x, y, 22);
      gr.addColorStop(0, 'rgba(230,248,255,1)'); gr.addColorStop(0.35, 'rgba(95,208,255,0.7)'); gr.addColorStop(1, 'rgba(95,208,255,0)');
      g.fillStyle = gr; g.fillRect(x - 22, y - 22, 44, 44);
    }
  });
  const ring = canvasTex(256, 256, (g) => {
    g.strokeStyle = 'rgba(200,240,255,1)'; g.lineWidth = 10; g.beginPath(); g.arc(128, 128, 110, 0, Math.PI * 2); g.stroke();
  });
  const pixels = canvasTex(512, 512, (g) => {
    g.fillStyle = '#05070c'; g.fillRect(0, 0, 512, 512);
    for (let x = 0; x < 512; x += 8) for (let y = 0; y < 512; y += 8) {
      g.fillStyle = 'rgba(255,60,60,0.25)'; g.fillRect(x + 1, y + 1, 1.6, 5);
      g.fillStyle = 'rgba(60,255,120,0.25)'; g.fillRect(x + 3.2, y + 1, 1.6, 5);
      g.fillStyle = 'rgba(70,120,255,0.3)'; g.fillRect(x + 5.4, y + 1, 1.6, 5);
    }
  });
  pixels.wrapS = pixels.wrapT = THREE.RepeatWrapping; pixels.repeat.set(4, 4);
  const knit = canvasTex(256, 256, (g) => {
    g.fillStyle = '#2b2e35'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 8) for (let x = 0; x < 256; x += 8) {
      g.fillStyle = (x / 8 + y / 8) % 2 ? '#3a3e47' : '#24272d'; g.beginPath(); g.ellipse(x + 4, y + 4, 3.2, 4.2, 0.5, 0, Math.PI * 2); g.fill();
    }
  });
  knit.wrapS = knit.wrapT = THREE.RepeatWrapping; knit.repeat.set(6, 3);
  return {
    body: new THREE.MeshPhysicalMaterial({color: '#2b2f36', metalness: 0.85, roughness: 0.28, clearcoat: 0.6}),
    screen: new THREE.MeshBasicMaterial({map: ui, toneMapped: false, transparent: true}),
    glass: new THREE.MeshPhysicalMaterial({color: '#cfefff', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.18, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide}),
    rowsTex: lines(false, '95,208,255'), colsTex: lines(true, '255,181,71'), dots, ring,
    skin: new THREE.MeshPhysicalMaterial({color: '#d99a7c', roughness: 0.48, metalness: 0, sheen: 0.6, sheenColor: new THREE.Color('#ffd2bf'), sheenRoughness: 0.5, clearcoat: 0.15, transparent: true}),
    nail: new THREE.MeshPhysicalMaterial({color: '#f0c9bb', roughness: 0.2, clearcoat: 1, transparent: true}),
    glove: new THREE.MeshStandardMaterial({map: knit, roughness: 0.95, metalness: 0, transparent: true}),
    panel: new THREE.MeshStandardMaterial({map: pixels, roughness: 0.6, metalness: 0.2, emissiveMap: pixels, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.06}),
    rowMat: new THREE.MeshStandardMaterial({color: '#0f2c38', emissive: new THREE.Color(C.accent), emissiveIntensity: 0.12, metalness: 0.1, roughness: 0.7}),
    rowScan: new THREE.MeshStandardMaterial({color: '#e8f8ff', emissive: new THREE.Color('#bfeaff'), emissiveIntensity: 1.4, metalness: 0.2, roughness: 0.3}),
    colMat: new THREE.MeshStandardMaterial({color: '#3a2810', emissive: new THREE.Color(C.warm), emissiveIntensity: 0.12, metalness: 0.1, roughness: 0.7}),
    glassMacro: new THREE.MeshPhysicalMaterial({color: '#cfefff', roughness: 0.05, transparent: true, opacity: 0.07, clearcoat: 1, depthWrite: false}),
    glowC: glowTex('95,208,255'), glowW: glowTex('255,181,71'), glowS: glowTex('235,250,255'),
  };
}, []);

// ---------------- phone world ----------------
const Phone: React.FC<{t: number; mats: any}> = ({t, mats}) => {
  const body = useMemo(() => new RoundedBoxGeometry(0.76, 1.6, 0.085, 6, 0.1), []);
  const ex = EASE(clamp01((t - EXPLODE0) / 1.6));
  const scr = mats.screen as THREE.MeshBasicMaterial; scr.opacity = 1 - 0.75 * ex;
  const rowsOp = ex * (0.35 + 0.65 * envAt(t, L[3][0] - 0.1, CUT_IN + 1, 0.4, 0.3));
  const colsOp = ex * (0.35 + 0.65 * envAt(t, wt(/^columns$/, 3) - 0.1, CUT_IN + 1, 0.4, 0.3));
  const dotsOp = envAt(t, wt(/^Every$/, 3), CUT_IN + 1, 0.5, 0.3) * (0.75 + 0.25 * Math.sin(t * 7));
  const ripple = clamp01((t - TAP) / 0.9);
  const tip = v3(0.08, 0.15, 0.045);
  // phone-world finger: approaches, taps, leaves
  const fIn = EASE(clamp01((t - 0.2) / (TAP - 0.2))), fOut = EASE(clamp01((t - L[1][1] + 0.2) / 0.8));
  const lift = (1 - fIn) * 0.9 + fOut * 1.4;
  const fAx = v3(0.45, -0.35, 0.82).normalize();
  const fLen = 0.75, fR = 0.062;
  const fc = tip.clone().add(v3(0, 0, 0.0)).add(fAx.clone().multiplyScalar(fLen / 2 + fR + lift));
  const fq = new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), fAx);
  const contactGlow = envAt(t, TAP, L[1][1], 0.15, 0.5) * (0.6 + 0.4 * Math.sin(t * 11));
  return (
    <group rotation={[0.05, -0.28 + Math.sin(t * 0.35) * 0.05, 0]}>
      <mesh geometry={body} material={mats.body} />
      <mesh position={[0, 0, 0.0435]}><planeGeometry args={[0.7, 1.53]} /><primitive object={scr} attach="material" /></mesh>
      {/* exploded layers: column layer, row layer, cover glass */}
      <mesh position={[0, 0, 0.046 + ex * 0.12]}><planeGeometry args={[0.7, 1.53]} /><meshBasicMaterial map={mats.colsTex} transparent opacity={colsOp} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>
      <mesh position={[0, 0, 0.047 + ex * 0.24]}><planeGeometry args={[0.7, 1.53]} /><meshBasicMaterial map={mats.rowsTex} transparent opacity={rowsOp} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>
      <mesh position={[0, 0, 0.048 + ex * 0.18]}><planeGeometry args={[0.7, 1.53]} /><meshBasicMaterial map={mats.dots} transparent opacity={dotsOp * ex} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>
      <mesh position={[0, 0, 0.05 + ex * 0.38]}><boxGeometry args={[0.72, 1.56, 0.01]} /><primitive object={mats.glass} attach="material" /></mesh>
      {ripple > 0 && ripple < 1 ? (
        <sprite position={[tip.x, tip.y, 0.05]} scale={[0.05 + ripple * 0.5, 0.05 + ripple * 0.5, 1]}><spriteMaterial map={mats.ring} transparent opacity={(1 - ripple) * 0.8} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite>
      ) : null}
      <sprite position={[tip.x, tip.y, 0.06]} scale={[0.35, 0.35, 1]}><spriteMaterial map={mats.glowC} transparent opacity={contactGlow} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite>
      {lift < 1.3 ? (
        <group position={fc.toArray()} quaternion={fq}>
          <mesh material={mats.skin}><capsuleGeometry args={[fR, fLen, 12, 32]} /></mesh>
        </group>
      ) : null}
    </group>
  );
};

// ---------------- macro world ----------------
const Finger: React.FC<{t: number; mats: any; glove: boolean; op: number}> = ({t, mats, glove, op}) => {
  const lift = fingerLift(t);
  const tip = CONTACT.clone().add(v3(0, lift, 0));
  const center = tip.clone().add(AX.clone().multiplyScalar(FLEN / 2 + FR));
  const q = new THREE.Quaternion().setFromUnitVectors(v3(0, -1, 0), AX.clone().negate());
  const m = (glove ? mats.glove : mats.skin) as THREE.Material; m.opacity = op; (m as any).depthWrite = op > 0.9;
  (mats.nail as THREE.Material).opacity = op;
  if (op <= 0.01) return null;
  return (
    <group position={center.toArray()} quaternion={q}>
      <mesh material={m}><capsuleGeometry args={[FR, FLEN, 16, 40]} /></mesh>
    </group>
  );
};

const Grid: React.FC<{t: number; mats: any}> = ({t, mats}) => {
  const scanOn = envAt(t, SCAN0, FOUND + 0.5, 0.3, 0.3);
  const scanRow = Math.floor(((t - SCAN0) * 9) % N);
  const fieldOn = clamp01((t - CUT_IN) / 0.6);
  const steal = envAt(t, STEAL - 0.3, TEN - 0.4, 0.4, 0.4);
  const fin = touches(t);
  const fingerTip = CONTACT.clone().add(v3(0, fingerLift(t) + 0.15, 0));
  const parts = useMemo(() => Array.from({length: 46}, (_, i) => {
    const a = (i * 2.399) % (Math.PI * 2), r = 0.25 + ((i * 0.37) % 1) * 0.75;
    return {x: CONTACT.x + Math.cos(a) * r, z: CONTACT.z + Math.sin(a) * r, ph: (i * 0.618) % 1};
  }), []);
  return (
    <group position={W.toArray()}>
      {/* display panel (pixels) */}
      <mesh position={[0, Y_PANEL, 0]} material={mats.panel}><boxGeometry args={[8.2, 0.2, 8.2]} /></mesh>
      {/* rows */}
      {Array.from({length: N}, (_, i) => (
        <mesh key={'r' + i} position={[0, Y_ROW, coord(i)]} material={scanOn > 0 && i === scanRow ? mats.rowScan : mats.rowMat}><boxGeometry args={[7.2, 0.03, 0.075]} /></mesh>
      ))}
      {/* columns */}
      {Array.from({length: N}, (_, j) => (
        <mesh key={'c' + j} position={[coord(j), Y_COL, 0]} material={mats.colMat}><boxGeometry args={[0.075, 0.03, 7.2]} /></mesh>
      ))}
      {/* insulating sheet between layers */}
      <mesh position={[0, (Y_ROW + Y_COL) / 2, 0]}><boxGeometry args={[7.4, 0.02, 7.4]} /><meshStandardMaterial color="#9fb7d6" transparent opacity={0.08} depthWrite={false} /></mesh>
      {/* cover glass */}
      <mesh position={[0, (Y_GLASS0 + Y_GLASS1) / 2, 0]}><boxGeometry args={[7.6, Y_GLASS1 - Y_GLASS0, 7.6]} /><primitive object={mats.glassMacro} attach="material" /></mesh>
      {/* electric field at each crossing */}
      {Array.from({length: N * N}, (_, k) => {
        const i = Math.floor(k / N), j = k % N;
        const x = coord(j), z = coord(i);
        const v = chargeAt(x, z, t);
        const scanBoost = scanOn > 0 && i === scanRow ? 0.6 : 0;
        const s = (0.1 + 0.26 * v) * fieldOn;
        if (s <= 0.01) return null;
        const pulse = 0.85 + 0.15 * Math.sin(t * 5 + k * 0.7);
        return (
          <sprite key={k} position={[x, Y_COL + 0.1, z]} scale={[s, s, 1]}>
            <spriteMaterial map={v < 0.55 ? mats.glowW : mats.glowC} transparent opacity={Math.min(1, (v < 0.55 ? 0.9 : v * v * pulse + scanBoost) * fieldOn)} depthWrite={false} blending={THREE.AdditiveBlending} />
          </sprite>
        );
      })}
      {/* touch hotspots: where the charge dropped */}
      {fin.map(({p, k}, i) => (
        <group key={'h' + i} position={[p[0], Y_COL + 0.13, p[1]]} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh><planeGeometry args={[1.7, 1.7]} /><meshBasicMaterial map={mats.glowW} transparent opacity={0.9 * k} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>
          <mesh scale={[0.55 + 0.1 * Math.sin(t * 6 + i), 0.55 + 0.1 * Math.sin(t * 6 + i), 1]}><planeGeometry args={[1.7, 1.7]} /><meshBasicMaterial map={mats.ring} color={C.warm} transparent opacity={0.8 * k} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>
        </group>
      ))}
      {/* charge flowing up into the finger */}
      {steal > 0 && fin.length ? parts.map((p, i) => {
        const ph = (t * 0.9 + p.ph) % 1;
        const from = v3(p.x, Y_COL, p.z);
        const pos = from.clone().lerp(fingerTip, EASE(ph));
        return (
          <sprite key={'p' + i} position={pos.toArray()} scale={[0.3, 0.3, 1]}>
            <spriteMaterial map={mats.glowS} transparent opacity={steal * Math.sin(Math.PI * ph) * 0.95} depthWrite={false} blending={THREE.AdditiveBlending} />
          </sprite>
        );
      }) : null}
    </group>
  );
};

const Scene: React.FC<{t: number}> = ({t}) => {
  const mats = useMats();
  const xr = envAt(t, SCAN0 + 0.6, GLOVE0, 0.6, 0.3);          // finger goes see-through for the top view
  const fingerOp = t < GLOVE0 ? 1 - 0.88 * xr : 1;
  const stars = useMemo(() => {
    const n = 1200, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(40 + Math.random() * 40); a.set([v.x, v.y, v.z], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3)); return g;
  }, []);
  return (
    <>
      <ambientLight intensity={0.18} />
      <directionalLight position={[3, 5, 4]} intensity={1.7} color="#fff4e6" />
      <directionalLight position={[-4, 2, -3]} intensity={0.8} color="#7aa8ff" />
      <directionalLight position={[W.x - 5, 6, -4]} intensity={1.2} color="#5fd0ff" />
      <pointLight position={[W.x + 3.5, 4, 3.5]} intensity={12} distance={16} color="#ffd9b8" />
      <points geometry={stars}><pointsMaterial color="#9fb7ff" size={0.06} transparent opacity={0.35} depthWrite={false} /></points>
      {t < CUT_IN + 0.3 ? <Phone t={t} mats={mats} /> : null}
      {t > CUT_IN - 0.3 ? (
        <>
          <Grid t={t} mats={mats} />
          <group position={W.toArray()}>
            {t < GLOVE0 ? <Finger t={t} mats={mats} glove={false} op={fingerOp} /> : <Finger t={t} mats={mats} glove op={1} />}
          </group>
        </>
      ) : null}
      <CameraRig keys={KEYS} t={t} exposure={1.0} />
    </>
  );
};

export const TouchReel: React.FC = () => {
  const [ready, setReady] = React.useState(false);
  const [h] = React.useState(() => delayRender('fonts'));
  React.useEffect(() => { Promise.all([document.fonts.load('600 150px Inter'), document.fonts.load('500 40px Inter')]).then(() => { setReady(true); continueRender(h); }); }, [h]);
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const t = frame / fps;
  const endOp = envAt(t, vo.total + 0.15, END + 5, 0.4);
  const ito = envAt(t, wt(/^see-through$/, 2) - 0.2, L[3][0] + 0.2);
  const rowsL = envAt(t, L[3][0], wt(/^Every$/, 3));
  const colsL = envAt(t, wt(/^columns$/, 3), wt(/^Every$/, 3));
  const fieldL = envAt(t, wt(/^Every$/, 3) + 0.3, CUT_IN - 0.1);
  const steal = envAt(t, STEAL, L[4][1] + 0.2);
  const rate = envAt(t, wt(/^240$/, 5) - 0.1, FOUND);
  const lock = envAt(t, FOUND + 0.3, TEN - 0.2, 0.25, 0.3);
  const tenL = envAt(t, TEN + 0.3, GLOVE0 - 0.1);
  const gloveL = envAt(t, GLOVE_TOUCH + 0.6, vo.total + 0.3, 0.4, 0.3);
  const contact = projectAt(KEYS, W.clone().add(v3(CONTACT.x, Y_COL, CONTACT.z)), t, width, height);
  const lockS = 1 + 0.6 * (1 - EASE(clamp01((t - FOUND - 0.3) / 0.4)));
  return (
    <AbsoluteFill style={{background: '#03050b'}}>
      <AbsoluteFill>
        <ThreeCanvas width={width} height={height} gl={{antialias: true}} camera={{fov: 30, position: [0, 0, 3]}}>
          {ready ? <Scene t={t} /> : null}
        </ThreeCanvas>
      </AbsoluteFill>
      <SeriesTag text="HOW IT WORKS · TOUCHSCREEN" op={Math.min(1, t / 0.4) * (1 - endOp)} />
      <Label x={width / 2} y={420} op={ito} color={C.accent} size={34}>indium tin oxide · transparent</Label>
      <Label x={width / 2} y={420} op={rowsL * (1 - colsL)} color={C.accent} size={38}>rows</Label>
      <Label x={width / 2} y={420} op={colsL} color={C.text} size={38}><span style={{color: C.accent}}>rows</span> + <span style={{color: C.warm}}>columns</span></Label>
      <Label x={width / 2} y={420} op={fieldL} color={C.accent} size={36}>an electric field at every crossing</Label>
      <Label x={width / 2} y={420} op={steal} color={C.warm} size={38}>charge ↓ under your finger</Label>
      <Label x={width / 2} y={420} op={rate} color={C.accent} size={40}>scanning · 240× per second</Label>
      {lock > 0 ? (
        <div style={{position: 'absolute', left: contact.x, top: contact.y, width: 170 * lockS, height: 170 * lockS, transform: 'translate(-50%,-50%)', opacity: lock, border: `4px solid ${C.warm}`, borderRadius: 18, boxShadow: `0 0 30px ${C.warm}88`}} />
      ) : null}
      <Label x={contact.x} y={contact.y - 150} op={lock} color={C.warm} size={34}>touch found here</Label>
      <Label x={width / 2} y={420} op={tenL} color={C.warm} size={40}>10 fingers · 10 dips</Label>
      <Label x={width / 2} y={420} op={gloveL} color={C.warm} size={36}>glove = insulator · no charge moves</Label>
      <Captions vo={vo as any} t={t} hi={/screen|electricity|grid|wires|conductor|rows|columns|cross|field|skin|charge|crossing|240|chip/i} warm={/finger\.?$|steals|ten|gloves\.?$|dropped\.?$/i} />
      <Flash t={t} at={CUT_IN} />
      <EndCard op={endOp} />
      <Grade frame={frame} />
    </AbsoluteFill>
  );
};
