import React, {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, delayRender, continueRender} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import * as THREE from 'three';
import vo from './anc_vo.json';
import {C, v3, clamp01, envAt, Key, CameraRig, glowTex, Captions, Label, SeriesTag, EndCard, Grade} from './lib';

const FPS = 30;
const L = vo.lines.map((l: any) => [l.start, l.end] as [number, number]);
const wt = (re: RegExp, line: number) => (vo.words as any[]).find((w) => w.line === line && re.test(w.w))!.s as number;
const END = vo.total + 2.6;
export const ANC_DURATION = Math.ceil(END * FPS);

const MIC = wt(/^microphone$/, 2);
const COPY = wt(/^copy$/, 3);
const FLIP = wt(/^flipped$/, 3);
const PUSH = wt(/^pushes$/, 4), PULL = wt(/^pulls/, 4);
const CANCEL = wt(/^cancel$/, 5);
const INNER = wt(/^second$/, 6), INNER_CANCEL = wt(/^cancels$/, 6);
const LOW = L[7][0];

// layout (world units): engine far left, earbud at x≈1.9, ear canal x 2.4 → 4.6, eardrum at 4.6
const ENG = v3(-7.5, 0, -0.6);
const BUD = v3(1.9, 0, 0);
const CANAL0 = 2.45, DRUM = 4.6;
const OUT_MIC = v3(1.38, 0.32, 0.35);
const IN_MIC = v3(2.52, 0.0, 0.25);

const KEYS: Key[] = [
  [0, v3(-5.4, 1.2, 10.5), v3(-6.2, 0, 0), 30],
  [L[0][1], v3(-4.0, 1.0, 9.5), v3(-3.6, 0, 0), 30],
  [L[1][1], v3(-1.6, 1.2, 14.5), v3(-1.6, 0, 0), 30],
  [MIC + 0.5, v3(1.0, 0.6, 5.2), v3(1.6, 0.1, 0), 30],
  [L[2][1], v3(1.2, 0.5, 4.8), v3(1.7, 0.1, 0), 30],
  [FLIP + 0.4, v3(3.0, 0.5, 6.8), v3(3.2, 0, 0), 30],
  [L[3][1], v3(3.2, 0.4, 6.4), v3(3.4, 0, 0), 30],
  [PULL + 0.3, v3(4.3, 0.3, 4.4), v3(4.1, 0, 0), 30],
  [L[4][1], v3(4.2, 0.3, 4.6), v3(4.0, 0, 0), 30],
  [L[5][1], v3(3.3, 0.5, 6.6), v3(3.4, 0, 0), 30],
  [INNER_CANCEL, v3(3.0, 0.3, 4.8), v3(3.1, 0, 0), 30],
  [L[6][1], v3(2.8, 0.4, 5.4), v3(2.9, 0, 0), 30],
  [END, v3(-1.0, 1.4, 15.5), v3(-1.0, 0, 0), 30],
];

const K = (2 * Math.PI) / 1.5, W = 2 * Math.PI * 0.9;      // noise wavelength 1.5, shown slowed down
const noise = (x: number, t: number) => Math.sin(K * x - W * t) + 0.35 * Math.sin(2.3 * K * x - 2.3 * W * t + 1);

// a flat ribbon following y = f(x), updated every frame
const Ribbon: React.FC<{x0: number; x1: number; f: (x: number) => number; y0?: number; z?: number; w?: number; color: string; op: number}> = ({x0, x1, f, y0 = 0, z = 0, w = 0.05, color, op}) => {
  const N = 220;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((N + 1) * 2 * 3), 3));
    const idx: number[] = []; for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx); return g;
  }, []);
  if (op <= 0.001) return null;
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i <= N; i++) {
    const x = x0 + (x1 - x0) * (i / N), y = y0 + f(x);
    const dx = (x1 - x0) / N, dy = f(x + dx * 0.5) - f(x - dx * 0.5);
    const len = Math.hypot(dx, dy); const nx = -dy / len * w, ny = dx / len * w;
    p.setXYZ(i * 2, x + nx, y + ny, z); p.setXYZ(i * 2 + 1, x - nx, y - ny, z);
  }
  p.needsUpdate = true;
  return <mesh geometry={geo}><meshBasicMaterial color={color} transparent opacity={op} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} /></mesh>;
};

const useMats = () => useMemo(() => ({
  bud: new THREE.MeshPhysicalMaterial({color: '#f3f4f6', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1}),
  tip: new THREE.MeshPhysicalMaterial({color: '#dfe3e8', roughness: 0.7}),
  grille: new THREE.MeshStandardMaterial({color: '#1d2026', roughness: 0.6, emissive: new THREE.Color(C.accent), emissiveIntensity: 0}),
  grille2: new THREE.MeshStandardMaterial({color: '#1d2026', roughness: 0.6, emissive: new THREE.Color(C.accent), emissiveIntensity: 0}),
  chip: new THREE.MeshStandardMaterial({color: '#20242c', metalness: 0.5, roughness: 0.4, emissive: new THREE.Color(C.accent), emissiveIntensity: 0}),
  skin: new THREE.MeshStandardMaterial({color: '#6e4a3e', roughness: 0.75}),
  canal: new THREE.MeshStandardMaterial({color: '#1e1214', roughness: 0.9}),
  drum: new THREE.MeshPhysicalMaterial({color: '#e8b8a4', roughness: 0.4, transmission: 0.2, side: THREE.DoubleSide}),
  nacelle: new THREE.MeshPhysicalMaterial({color: '#b9c0c8', metalness: 0.9, roughness: 0.3, clearcoat: 0.6, side: THREE.DoubleSide}),
  fan: new THREE.MeshStandardMaterial({color: '#3a3f47', metalness: 0.9, roughness: 0.35}),
  glowC: glowTex('95,208,255'), glowW: glowTex('255,181,71'),
}), []);

const Engine: React.FC<{t: number; mats: any}> = ({t, mats}) => (
  <group position={ENG.toArray()} rotation={[0, Math.PI / 2 - 0.35, 0]}>
    <mesh material={mats.nacelle} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[1.6, 1.35, 3.4, 64, 1, true]} /></mesh>
    <group position={[0, 0, 1.2]} rotation={[0, 0, t * 9]}>
      {Array.from({length: 18}, (_, i) => (
        <mesh key={i} rotation={[0.35, 0, (i / 18) * Math.PI * 2]} position={[0, 0, 0]} material={mats.fan}>
          <boxGeometry args={[0.16, 2.8, 0.03]} />
        </mesh>
      ))}
      <mesh material={mats.nacelle}><sphereGeometry args={[0.38, 32, 24]} /></mesh>
    </group>
  </group>
);

const Ear: React.FC<{mats: any; drumX: number}> = ({mats, drumX}) => (
  <group>
    {/* cutaway head side: skin above and below the canal */}
    <mesh position={[4.5, 1.9, -1.1]} material={mats.skin}><boxGeometry args={[4.2, 3.2, 1.2]} /></mesh>
    <mesh position={[4.5, -1.9, -1.1]} material={mats.skin}><boxGeometry args={[4.2, 3.2, 1.2]} /></mesh>
    <mesh position={[3.55, 0, -1.45]} material={mats.canal}><boxGeometry args={[2.3, 0.6, 0.5]} /></mesh>
    <mesh position={[6.0, 0, -1.1]} material={mats.skin}><boxGeometry args={[1.2, 0.6, 1.2]} /></mesh>
    {/* eardrum */}
    <mesh position={[DRUM + drumX, 0, -0.3]} rotation={[0, Math.PI / 2, 0]} material={mats.drum}><circleGeometry args={[0.32, 48]} /></mesh>
  </group>
);

const Earbud: React.FC<{t: number; mats: any}> = ({t, mats}) => {
  const outOn = envAt(t, MIC - 0.2, CANCEL + 1.2, 0.3, 0.6) + (t > LOW ? 0.6 : 0);
  const inOn = envAt(t, INNER, L[6][1] + 0.5, 0.3, 0.6) + (t > LOW ? 0.6 : 0);
  const chipOn = envAt(t, COPY - 0.2, CANCEL + 1.2, 0.3, 0.6) + (t > LOW ? 0.6 : 0);
  (mats.grille as THREE.MeshStandardMaterial).emissiveIntensity = 2.2 * outOn;
  (mats.grille2 as THREE.MeshStandardMaterial).emissiveIntensity = 2.2 * inOn;
  (mats.chip as THREE.MeshStandardMaterial).emissiveIntensity = 2.0 * chipOn * (0.8 + 0.2 * Math.sin(t * 25));
  return (
    <group>
      <group position={BUD.toArray()}>
        <mesh material={mats.bud} scale={[1, 0.92, 0.9]}><sphereGeometry args={[0.55, 64, 48]} /></mesh>
        {/* stem */}
        <mesh material={mats.bud} position={[-0.42, -0.85, 0.05]} rotation={[0, 0, -0.32]}><capsuleGeometry args={[0.16, 1.1, 12, 24]} /></mesh>
        {/* silicone tip into the canal */}
        <mesh material={mats.tip} position={[0.55, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.2, 0.3, 0.32, 40]} /></mesh>
        {/* chip inside (visible through x-ray glow) */}
        <mesh material={mats.chip} position={[0, 0, 0.42]}><boxGeometry args={[0.24, 0.24, 0.04]} /></mesh>
      </group>
      <mesh material={mats.grille} position={OUT_MIC.toArray()} rotation={[0, -0.7, 0]}><circleGeometry args={[0.09, 24]} /></mesh>
      <mesh material={mats.grille2} position={IN_MIC.toArray()} rotation={[0, 0, 0]}><circleGeometry args={[0.06, 24]} /></mesh>
      {outOn > 0 ? <sprite position={OUT_MIC.toArray()} scale={[0.9 * outOn, 0.9 * outOn, 1]}><spriteMaterial map={mats.glowC} transparent opacity={0.8 * Math.min(1, outOn)} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite> : null}
      {inOn > 0 ? <sprite position={IN_MIC.toArray()} scale={[0.7 * inOn, 0.7 * inOn, 1]}><spriteMaterial map={mats.glowC} transparent opacity={0.8 * Math.min(1, inOn)} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite> : null}
    </group>
  );
};

const Scene: React.FC<{t: number}> = ({t}) => {
  const mats = useMats();
  const ws = t;  // wave time
  const outOp = 0.9;
  const copyOn = clamp01((t - COPY) / 0.6) * (t > LOW ? 0.7 : 1);
  const flip = clamp01((t - FLIP) / 0.6);         // copy starts identical, then flips
  const cancel = clamp01((t - CANCEL) / 0.8);
  const show = t > LOW ? 0.4 : 1;
  const inNoise = (x: number) => 0.2 * noise(x, ws);
  const inAnti = (x: number) => -0.2 * noise(x, ws) * (flip * 2 - 1);
  const resid = envAt(t, INNER - 0.1, INNER_CANCEL + 0.6, 0.4, 0.6) * (1 - clamp01((t - INNER_CANCEL) / 0.6));
  const residF = (x: number) => 0.1 * resid * Math.sin(3.1 * K * x - 3.1 * W * ws);
  const sumF = (x: number) => (inNoise(x) * (1 - cancel) + residF(x));
  const drumX = 0.1 * sumF(DRUM) * (t >= COPY && t < CANCEL ? 1 : 1);
  const pre = t < CANCEL;   // before cancel, sum line hidden and inside noise shown
  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[3, 5, 8]} intensity={1.6} color="#fff1e4" />
      <directionalLight position={[-6, 2, -3]} intensity={0.8} color="#7aa8ff" />
      <pointLight position={[2.4, 0.6, 2.2]} intensity={1.5} distance={6} color="#bcd8ff" />
      <Engine t={t} mats={mats} />
      <Ear mats={mats} drumX={drumX} />
      <Earbud t={t} mats={mats} />
      {/* outside noise: engine → earbud */}
      <Ribbon x0={-5.8} x1={1.35} f={(x) => 0.45 * noise(x, ws)} z={0.2} w={0.045} color={C.warm} op={outOp} />
      {/* inside the canal */}
      <Ribbon x0={CANAL0} x1={DRUM} f={inNoise} z={0.0} w={0.035} color={C.warm} op={(pre ? 0.95 : 0.35) * show} />
      <Ribbon x0={CANAL0} x1={DRUM} f={inAnti} z={0.02} w={0.035} color={C.accent} op={copyOn * (pre ? 0.95 : 0.35) * show} />
      <Ribbon x0={CANAL0} x1={DRUM} f={sumF} z={0.04} w={0.04} color="#ffffff" op={clamp01((t - CANCEL + 0.1) / 0.4) * show} />
      {/* push / pull arrows at the eardrum */}
      {[[PUSH, C.warm, 1], [PULL, C.accent, -1]].map(([at, col, s], i) => {
        const op = envAt(t, at as number, L[5][0] + 0.2, 0.25, 0.3);
        if (op <= 0) return null;
        const y = i === 0 ? 0.55 : -0.55;
        return (
          <group key={i} position={[DRUM - 0.35 * (s as number), y, 0.1]} rotation={[0, 0, (s as number) > 0 ? -Math.PI / 2 : Math.PI / 2]}>
            <mesh position={[0, -0.15, 0]}><cylinderGeometry args={[0.035, 0.035, 0.5, 12]} /><meshBasicMaterial color={col as string} transparent opacity={op} toneMapped={false} /></mesh>
            <mesh position={[0, 0.17, 0]}><coneGeometry args={[0.1, 0.22, 16]} /><meshBasicMaterial color={col as string} transparent opacity={op} toneMapped={false} /></mesh>
          </group>
        );
      })}
      <CameraRig keys={KEYS} t={t} exposure={1.0} />
    </>
  );
};

export const AncReel: React.FC = () => {
  const [ready, setReady] = React.useState(false);
  const [h] = React.useState(() => delayRender('fonts'));
  React.useEffect(() => { Promise.all([document.fonts.load('900 82px Inter'), document.fonts.load('500 34px "JetBrains Mono"')]).then(() => { setReady(true); continueRender(h); }); }, [h]);
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const t = frame / fps;
  const endOp = envAt(t, vo.total + 0.15, END + 5, 0.4);
  const jetL = envAt(t, wt(/^jet$/, 0) - 0.2, L[1][0], 0.3, 0.3);
  const addL = envAt(t, wt(/^adding$/, 1), L[2][0], 0.3, 0.3);
  const micL = envAt(t, MIC, L[3][0], 0.3, 0.3);
  const copyL = envAt(t, COPY, FLIP, 0.3, 0.2);
  const flipL = envAt(t, FLIP, PUSH - 0.1, 0.2, 0.3);
  const ppL = envAt(t, PUSH, L[5][0], 0.3, 0.3);
  const cancelL = envAt(t, CANCEL - 0.1, L[6][0], 0.3, 0.3);
  const innerL = envAt(t, INNER, L[7][0], 0.3, 0.3);
  const lowL = envAt(t, wt(/^low$/, 7) - 0.2, vo.total + 0.3, 0.3, 0.3);
  const slowL = envAt(t, L[1][0], L[7][0], 0.4, 0.3);
  return (
    <AbsoluteFill style={{background: '#03050b'}}>
      <AbsoluteFill>
        <ThreeCanvas width={width} height={height} gl={{antialias: true}} camera={{fov: 30, position: [0, 1, 10]}}>
          {ready ? <Scene t={t} /> : null}
        </ThreeCanvas>
      </AbsoluteFill>
      <SeriesTag text="HOW IT WORKS · NOISE CANCELLING" op={Math.min(1, t / 0.4) * (1 - endOp)} />
      <Label x={width / 2} y={420} op={jetL} color={C.warm} size={38}>engine noise → your ear</Label>
      <Label x={width / 2} y={420} op={addL} color={C.accent} size={38}>+ more sound = quiet?</Label>
      <Label x={width / 2} y={420} op={micL} color={C.accent} size={38}>outer microphone</Label>
      <Label x={width / 2} y={420} op={copyL} color={C.accent} size={38}>chip copies the wave</Label>
      <Label x={width / 2} y={420} op={flipL} color={C.accent} size={38}>same wave, flipped</Label>
      <Label x={width / 2} y={420} op={ppL} color={C.text} size={36}>
        <span style={{color: C.warm}}>noise pushes</span> · <span style={{color: C.accent}}>copy pulls</span>
      </Label>
      <Label x={width / 2} y={420} op={cancelL} color={C.text} size={36}>noise + anti-noise = quiet</Label>
      <Label x={width / 2} y={420} op={innerL} color={C.accent} size={38}>inner microphone</Label>
      <Label x={width / 2} y={420} op={lowL} color={C.warm} size={34}>best on steady, low hums</Label>
      <Label x={width / 2} y={490} op={slowL * (1 - lowL)} color={C.dim} size={24}>waves shown slowed down</Label>
      <Captions vo={vo as any} t={t} hi={/microphone|chip|copy|wave|flipped|second|inside/i} warm={/quiet\.?$|noise|pushes|pulls\.?$|cancel|hums,?|engines/i} />
      <EndCard op={endOp} />
      <Grade frame={frame} />
    </AbsoluteFill>
  );
};
