import React, {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, delayRender, continueRender} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import vo from './microwave_vo.json';
import {C, EASE, v3, clamp01, envAt, Key, CameraRig, canvasTex, glowTex, Captions, Label, SeriesTag, EndCard, Grade, Flash} from './lib';

const FPS = 30;
const L = vo.lines.map((l: any) => [l.start, l.end] as [number, number]);
const wt = (re: RegExp, line: number) => (vo.words as any[]).find((w) => w.line === line && re.test(w.w))!.s as number;
const END = vo.total + 2.6;
export const MICROWAVE_DURATION = Math.ceil(END * FPS);

const XRAY0 = L[2][0];
const MAG = wt(/^magnetron$/, 2);
const BOUNCE = L[3][0];
const MOL0 = L[4][0];            // cut into the food (molecule world)
const TWIST = L[5][0];
const HEAT = L[6][0];
const BACK = L[7][0];            // cut back to the oven

// oven cavity (inside): x [-CX,CX], y [0,CY], z [-CZ,CZ]
const CX = 1.7, CY = 2.2, CZ = 1.6;
const FOOD = v3(0, 0.55, 0);
const MW = v3(400, 0, 0);       // molecule world origin

const KEYS: Key[] = [
  [0, v3(5.5, 6.5, 17.5), v3(0.6, 1.2, 0), 30],
  [L[0][1], v3(4.2, 5.6, 15.5), v3(0.6, 1.2, 0), 30],
  [L[1][1], v3(2.6, 5.0, 13.0), v3(0.5, 1.1, 0), 30],
  [MAG + 0.4, v3(7.5, 7.5, 11.5), v3(0.8, 1.1, 0), 30],
  [L[2][1], v3(6.8, 7.0, 10.8), v3(0.6, 1.0, 0), 30],
  [L[3][1], v3(-5.0, 7.0, 11.5), v3(0, 0.9, 0), 30],
  [MOL0 - 0.01, v3(-4.6, 6.6, 10.8), v3(0, 0.9, 0), 30],
  [MOL0, v3(MW.x + 0.6, 1.4, 14.0), v3(MW.x, 0, 0), 30],
  [TWIST + 0.3, v3(MW.x + 1.6, 1.8, 12.0), v3(MW.x, 0, 0), 30],
  [L[5][1], v3(MW.x - 1.0, 1.2, 10.5), v3(MW.x, 0, 0), 30],
  [BACK - 0.01, v3(MW.x - 1.4, 1.0, 9.5), v3(MW.x, 0, 0), 30],
  [BACK, v3(4.0, 6.0, 10.5), v3(0, 0.8, 0), 30],
  [END, v3(3.0, 5.4, 12.5), v3(0.2, 0.9, 0), 30],
];
const inMol = (t: number) => t >= MOL0 && t < BACK;

// reflected ray paths inside the cavity, launched from the waveguide opening (right wall, high up)
const ORIGIN = v3(CX - 0.02, CY - 0.5, -0.4);
const bouncePath = (seed: number) => {
  const pts = [ORIGIN.clone()];
  let p = ORIGIN.clone();
  let d = v3(-1, -0.35 + 0.5 * Math.sin(seed * 3.1), 0.6 * Math.cos(seed * 5.7)).normalize();
  for (let b = 0; b < 5; b++) {
    let best = Infinity, axis = -1;
    const lim = [[-CX, CX], [0.02, CY], [-CZ, CZ]];
    [d.x, d.y, d.z].forEach((dv, a) => {
      if (Math.abs(dv) < 1e-6) return;
      const pv = [p.x, p.y, p.z][a]; const wall = dv > 0 ? lim[a][1] : lim[a][0];
      const s = (wall - pv) / dv; if (s > 1e-4 && s < best) { best = s; axis = a; }
    });
    p = p.clone().addScaledVector(d, best); pts.push(p.clone());
    if (axis === 0) d.x *= -1; else if (axis === 1) d.y *= -1; else d.z *= -1;
  }
  pts.push(FOOD.clone().add(v3(0.25 * Math.sin(seed), 0.15, 0.25 * Math.cos(seed))));
  return pts;
};
const pathAt = (pts: THREE.Vector3[], u: number) => {
  const segs = pts.slice(1).map((p, i) => p.distanceTo(pts[i])); const tot = segs.reduce((a, b) => a + b, 0);
  let d = clamp01(u) * tot;
  for (let i = 0; i < segs.length; i++) { if (d <= segs[i]) return pts[i].clone().lerp(pts[i + 1], d / segs[i]); d -= segs[i]; }
  return pts[pts.length - 1].clone();
};

const useMats = () => useMemo(() => {
  const panel = canvasTex(256, 900, (g) => {
    g.fillStyle = '#15181d'; g.fillRect(0, 0, 256, 900);
    g.fillStyle = '#0b2b1f'; g.fillRect(28, 50, 200, 90);
    g.fillStyle = '#62ffb0'; g.font = '500 64px "JetBrains Mono", monospace'; g.textAlign = 'center'; g.fillText('1:30', 128, 118);
    g.fillStyle = '#2a2f37';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { g.beginPath(); (g as any).roundRect(34 + c * 66, 200 + r * 82, 54, 60, 10); g.fill(); }
    g.fillStyle = '#5fd0ff'; g.beginPath(); (g as any).roundRect(34, 560, 186, 80, 14); g.fill();
    g.fillStyle = '#05070d'; g.font = '700 34px Inter, sans-serif'; g.fillText('START', 128, 612);
  });
  const mesh = canvasTex(512, 512, (g) => {
    g.fillStyle = 'rgba(10,12,16,0.85)'; g.fillRect(0, 0, 512, 512);
    g.fillStyle = 'rgba(0,0,0,1)'; for (let y = 6; y < 512; y += 14) for (let x = 6; x < 512; x += 14) { g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); }
  });
  return {
    shell: new THREE.MeshPhysicalMaterial({color: '#d9dde3', metalness: 0.6, roughness: 0.35, clearcoat: 0.5, transparent: true}),
    cavity: new THREE.MeshStandardMaterial({color: '#59626e', metalness: 0.9, roughness: 0.32, side: THREE.BackSide, transparent: true}),
    door: new THREE.MeshPhysicalMaterial({map: mesh, color: '#ffffff', metalness: 0.2, roughness: 0.15, transparent: true, opacity: 0.85}),
    panel: new THREE.MeshBasicMaterial({map: panel, toneMapped: false}),
    mag: new THREE.MeshStandardMaterial({color: '#5a5f68', metalness: 0.9, roughness: 0.3, emissive: new THREE.Color('#ff8a3d'), emissiveIntensity: 0}),
    fins: new THREE.MeshStandardMaterial({color: '#8a9099', metalness: 1, roughness: 0.25}),
    plate: new THREE.MeshPhysicalMaterial({color: '#e8f0f6', roughness: 0.05, transmission: 0.6, thickness: 0.1, transparent: true, opacity: 0.8}),
    bowl: new THREE.MeshPhysicalMaterial({color: '#f2efe8', roughness: 0.3, clearcoat: 0.6}),
    veg: new THREE.MeshStandardMaterial({color: '#3f9b46', roughness: 0.7, emissive: new THREE.Color('#ff7a2a'), emissiveIntensity: 0}),
    carrot: new THREE.MeshStandardMaterial({color: '#f08a2c', roughness: 0.6, emissive: new THREE.Color('#ff7a2a'), emissiveIntensity: 0}),
    wave: new THREE.MeshBasicMaterial({color: C.accent, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false}),
    O: new THREE.MeshPhysicalMaterial({color: '#ff4d5e', roughness: 0.25, clearcoat: 0.8, emissive: new THREE.Color('#ff7a2a'), emissiveIntensity: 0}),
    H: new THREE.MeshPhysicalMaterial({color: '#f4f7ff', roughness: 0.25, clearcoat: 0.8, emissive: new THREE.Color('#ff9a4a'), emissiveIntensity: 0}),
    floor: new THREE.MeshStandardMaterial({color: '#0c0e13', roughness: 0.8, metalness: 0.2}),
    glowC: glowTex('95,208,255'), glowW: glowTex('255,181,71'), steam: glowTex('235,240,255'),
  };
}, []);

const Oven: React.FC<{t: number; mats: any}> = ({t, mats}) => {
  const shellGeo = useMemo(() => new RoundedBoxGeometry(2 * CX + 1.6, CY + 0.5, 2 * CZ + 0.4, 5, 0.18), []);
  const paths = useMemo(() => Array.from({length: 7}, (_, i) => bouncePath(i + 1)), []);
  const tubes = useMemo(() => paths.map((p) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p, false, 'catmullrom', 0), 160, 0.018, 6, false)), [paths]);
  if (inMol(t)) return null;
  const xray = envAt(t, XRAY0, MOL0 + 1, 0.9, 0.3);
  const back = clamp01((t - BACK) / 0.6);
  const xr = Math.max(xray, 0.9 * back);
  (mats.shell as THREE.MeshPhysicalMaterial).opacity = 1 - 0.95 * xr; (mats.shell as any).depthWrite = xr < 0.5;
  (mats.door as THREE.MeshPhysicalMaterial).opacity = 0.85 * (1 - xr);
  (mats.cavity as THREE.MeshStandardMaterial).opacity = 1 - 0.55 * xr;
  const magOn = clamp01((t - (MAG - 0.2)) / 0.5) * (t < MOL0 ? 1 : 0) + (t > BACK ? 0.6 : 0);
  (mats.mag as THREE.MeshStandardMaterial).emissiveIntensity = 1.4 * magOn * (0.85 + 0.15 * Math.sin(t * 30));
  const waveOp = envAt(t, wt(/^makes$/, 2), MOL0, 0.5, 0.2) + (t > BACK ? 0.45 : 0);
  (mats.wave as THREE.MeshBasicMaterial).opacity = (t >= BOUNCE ? 0.35 : 0.12) * waveOp;
  const hot = t > BACK ? clamp01((t - BACK) / 1.5) : 0;
  (mats.veg as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 * hot * (0.8 + 0.2 * Math.sin(t * 4));
  (mats.carrot as THREE.MeshStandardMaterial).emissiveIntensity = 0.4 * hot;
  const spin = t * 0.6;
  return (
    <group>
      {/* outer shell, offset right to make room for the control panel */}
      <mesh geometry={shellGeo} material={mats.shell} position={[0.65, CY / 2, 0]} />
      {/* cavity (inside walls) */}
      <mesh position={[0, CY / 2, 0]} material={mats.cavity}><boxGeometry args={[2 * CX, CY, 2 * CZ]} /></mesh>
      {/* door glass */}
      <mesh position={[0, CY / 2 + 0.05, CZ + 0.21]} material={mats.door}><planeGeometry args={[2 * CX - 0.1, CY - 0.2]} /></mesh>
      {/* control panel */}
      <mesh position={[CX + 0.85, CY / 2 + 0.1, CZ + 0.211]} material={mats.panel}><planeGeometry args={[0.95, CY - 0.1]} /></mesh>
      {/* magnetron + waveguide on the right side */}
      <group position={[CX + 0.7, CY - 0.55, -0.4]}>
        <mesh material={mats.mag}><cylinderGeometry args={[0.32, 0.32, 0.55, 32]} /></mesh>
        {[0, 1, 2, 3, 4].map((i) => <mesh key={i} position={[0, -0.2 + i * 0.1, 0]} material={mats.fins}><boxGeometry args={[0.85, 0.025, 0.85]} /></mesh>)}
        <mesh position={[-0.45, 0.0, 0]} material={mats.fins}><boxGeometry args={[0.5, 0.25, 0.4]} /></mesh>
        {magOn > 0 ? <sprite scale={[1.6 * magOn, 1.6 * magOn, 1]}><spriteMaterial map={mats.glowW} transparent opacity={0.6 * magOn} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite> : null}
      </group>
      {/* turntable + bowl + vegetables */}
      <group position={[0, 0.06, 0]} rotation={[0, spin, 0]}>
        <mesh material={mats.plate}><cylinderGeometry args={[1.25, 1.25, 0.05, 64]} /></mesh>
        <mesh position={[0, 0.28, 0]} material={mats.bowl}><cylinderGeometry args={[0.8, 0.5, 0.5, 48, 1, true]} /></mesh>
        <mesh position={[0, 0.04, 0]} material={mats.bowl}><cylinderGeometry args={[0.5, 0.5, 0.04, 48]} /></mesh>
        {Array.from({length: 9}, (_, i) => {
          const a = i * 2.4, r = 0.18 + 0.32 * ((i * 37) % 10) / 10;
          return <mesh key={i} position={[r * Math.cos(a), 0.42 + 0.06 * (i % 3), r * Math.sin(a)]} material={i % 3 === 0 ? mats.carrot : mats.veg}>
            {i % 3 === 0 ? <cylinderGeometry args={[0.09, 0.09, 0.08, 20]} /> : <icosahedronGeometry args={[0.16, 1]} />}
          </mesh>;
        })}
      </group>
      {/* microwave paths */}
      {waveOp > 0 ? tubes.map((g, i) => <mesh key={i} geometry={g} material={mats.wave} />) : null}
      {waveOp > 0 ? paths.map((p, i) => Array.from({length: 4}, (_, j) => {
        const u = ((t - wt(/^makes$/, 2)) * 0.32 + j / 4 + i * 0.11) % 1;
        const q = pathAt(p, u);
        return <sprite key={`${i}-${j}`} position={q.toArray()} scale={[0.32, 0.32, 1]}><spriteMaterial map={mats.glowC} transparent opacity={Math.min(1, waveOp) * 0.9} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite>;
      })) : null}
      {/* steam at the end */}
      {hot > 0 ? Array.from({length: 14}, (_, i) => {
        const u = ((t - BACK) * 0.35 + i / 14) % 1;
        return <sprite key={'s' + i} position={[0.4 * Math.sin(i * 2.1 + u * 3), 0.7 + u * 1.3, 0.4 * Math.cos(i * 1.7)]} scale={[0.5 + u * 0.6, 0.5 + u * 0.6, 1]}><spriteMaterial map={mats.steam} transparent opacity={0.35 * hot * Math.sin(Math.PI * u)} depthWrite={false} /></sprite>;
      }) : null}
    </group>
  );
};

// ---------------- molecule world ----------------
const N_MOL = 18;
const molSeeds = Array.from({length: N_MOL}, (_, i) => ({
  p: v3(((i * 37) % 13) / 13 * 6.4 - 3.2, ((i * 53) % 11) / 11 * 5.2 - 2.6, ((i * 29) % 7) / 7 * 2.0 - 1.0),
  a0: (i * 2.39996) % (Math.PI * 2), lag: 0.12 + ((i * 17) % 10) / 60, ph: i * 0.7,
}));
const FLIP_HZ = 1.1;   // shown slowed down: the real field flips ~5 billion times a second
const fieldDir = (t: number) => (Math.sin(2 * Math.PI * FLIP_HZ * (t - MOL0)) >= 0 ? 1 : -1);
// smoothed field direction seen by a molecule (follows with a lag)
const follow = (t: number, lag: number) => {
  const tt = t - MOL0; if (tt <= 0) return 0;
  const k = 2 * Math.PI * FLIP_HZ;
  return Math.max(-1, Math.min(1, 1.6 * Math.sin(k * (tt - lag))));
};

const Molecules: React.FC<{t: number; mats: any}> = ({t, mats}) => {
  if (!inMol(t)) return null;
  const align = clamp01((t - TWIST + 0.3) / 1.0);
  const heat = clamp01((t - HEAT) / 1.8);
  (mats.O as THREE.MeshPhysicalMaterial).emissiveIntensity = 0.9 * heat;
  (mats.H as THREE.MeshPhysicalMaterial).emissiveIntensity = 0.7 * heat;
  const fieldOn = clamp01((t - MOL0 - 0.6) / 0.4);
  const dir = fieldDir(t);
  const HA = (104.5 / 2) * Math.PI / 180;
  return (
    <group position={MW.toArray()}>
      {molSeeds.map((m, i) => {
        // dipole points toward +x or -x with the field (O end leads); before TWIST they drift randomly
        const f = follow(t, m.lag);
        const target = f >= 0 ? 0 : Math.PI;
        const rand = m.a0 + 0.4 * Math.sin(t * 0.7 + m.ph);
        const ang = rand + (target + 0.25 * (f >= 0 ? 1 - f : -1 - f) - rand) * align;
        const jig = 0.06 * heat;
        return (
          <group key={i} position={[m.p.x + jig * Math.sin(t * 23 + i), m.p.y + jig * Math.cos(t * 19 + i), m.p.z]} rotation={[0.3 * Math.sin(m.ph), 0.4 * Math.cos(m.ph), ang]}>
            <mesh material={mats.O}><sphereGeometry args={[0.3, 32, 24]} /></mesh>
            <mesh position={[-0.33 * Math.cos(HA), 0.33 * Math.sin(HA), 0]} material={mats.H}><sphereGeometry args={[0.18, 24, 16]} /></mesh>
            <mesh position={[-0.33 * Math.cos(HA), -0.33 * Math.sin(HA), 0]} material={mats.H}><sphereGeometry args={[0.18, 24, 16]} /></mesh>
          </group>
        );
      })}
      {/* field arrows */}
      {fieldOn > 0 ? [-1.2, 0, 1.2].map((y, i) => (
        <group key={i} position={[0, y * 1.5, -2.2]} scale={[dir, 1, 1]}>
          <mesh rotation={[0, 0, -Math.PI / 2]} position={[0, 0, 0]}><cylinderGeometry args={[0.05, 0.05, 6.4, 12]} /><meshBasicMaterial color={C.accent} transparent opacity={0.55 * fieldOn} toneMapped={false} /></mesh>
          <mesh rotation={[0, 0, -Math.PI / 2]} position={[3.3, 0, 0]}><coneGeometry args={[0.18, 0.45, 16]} /><meshBasicMaterial color={C.accent} transparent opacity={0.8 * fieldOn} toneMapped={false} /></mesh>
        </group>
      )) : null}
      {heat > 0 ? <sprite position={[0, 0, -1]} scale={[11 * heat, 7 * heat, 1]}><spriteMaterial map={mats.glowW} transparent opacity={0.25 * heat} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite> : null}
    </group>
  );
};

const Scene: React.FC<{t: number}> = ({t}) => {
  const mats = useMats();
  return (
    <>
      <ambientLight intensity={0.25} />
      <directionalLight position={[4, 8, 6]} intensity={1.7} color="#fff4e6" />
      <directionalLight position={[-5, 3, -4]} intensity={0.8} color="#7aa8ff" />
      <pointLight position={[0, CY - 0.2, 0]} intensity={inMol(t) ? 0 : 6} distance={6} color="#ffe2b0" />
      <pointLight position={[MW.x, 3, 4]} intensity={inMol(t) ? 30 : 0} distance={14} color="#ffffff" />
      <mesh position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.floor}><planeGeometry args={[40, 40]} /></mesh>
      <Oven t={t} mats={mats} />
      <Molecules t={t} mats={mats} />
      <CameraRig keys={KEYS} t={t} exposure={1.0} />
    </>
  );
};

export const MicrowaveReel: React.FC = () => {
  const [ready, setReady] = React.useState(false);
  const [h] = React.useState(() => delayRender('fonts'));
  React.useEffect(() => { Promise.all([document.fonts.load('500 64px "JetBrains Mono"'), document.fonts.load('700 34px Inter')]).then(() => { setReady(true); continueRender(h); }); }, [h]);
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const t = frame / fps;
  const endOp = envAt(t, vo.total + 0.15, END + 5, 0.4);
  const noFlame = envAt(t, wt(/^flame$/, 0) - 0.2, L[1][1], 0.3, 0.3);
  const magL = envAt(t, MAG, wt(/^kind$/, 2), 0.3, 0.3);
  const radioL = envAt(t, wt(/^kind$/, 2), L[3][0], 0.3, 0.3);
  const bounceL = envAt(t, BOUNCE + 0.2, MOL0 - 0.1, 0.3, 0.2);
  const flipL = envAt(t, wt(/^flips$/, 4), L[5][0] + 0.8, 0.3, 0.3);
  const slowL = envAt(t, MOL0 + 0.8, BACK - 0.2, 0.3, 0.3);
  const waterL = envAt(t, wt(/^water$/, 5), HEAT, 0.3, 0.3);
  const heatL = envAt(t, wt(/^friction,?$/, 6), BACK - 0.1, 0.3, 0.2);
  const vegL = envAt(t, wt(/^watery$/, 7), vo.total + 0.3, 0.3, 0.3);
  return (
    <AbsoluteFill style={{background: '#03050b'}}>
      <AbsoluteFill>
        <ThreeCanvas width={width} height={height} gl={{antialias: true}} camera={{fov: 30, position: [0, 3, 10]}}>
          {ready ? <Scene t={t} /> : null}
        </ThreeCanvas>
      </AbsoluteFill>
      <Flash t={t} at={MOL0} dur={0.5} />
      <Flash t={t} at={BACK} dur={0.5} />
      <SeriesTag text="HOW IT WORKS · MICROWAVE" op={Math.min(1, t / 0.4) * (1 - endOp)} />
      <Label x={width / 2} y={420} op={noFlame} color={C.warm} size={38}>flame: none · hot coil: none</Label>
      <Label x={width / 2} y={420} op={magL} color={C.warm} size={40}>magnetron</Label>
      <Label x={width / 2} y={420} op={radioL} color={C.accent} size={36}>microwaves ≈ radio waves</Label>
      <Label x={width / 2} y={420} op={bounceL} color={C.accent} size={36}>metal walls reflect them</Label>
      <Label x={width / 2} y={400} op={flipL} color={C.accent} size={36}>field flips ~5 billion times / sec</Label>
      <Label x={width / 2} y={470} op={slowL * (1 - heatL)} color={C.dim} size={26}>shown slowed down</Label>
      <Label x={width / 2} y={540} op={waterL} color={C.text} size={34}>water molecule: H₂O</Label>
      <Label x={width / 2} y={420} op={heatL} color={C.warm} size={40}>motion → friction → heat</Label>
      <Label x={width / 2} y={420} op={vegL} color={C.warm} size={38}>more water → heats faster</Label>
      <Captions vo={vo as any} t={t} hi={/magnetron|microwaves|radio|wave\.?$|metal|walls|field|water|molecules|vegetables/i} warm={/flame|coil\.?$|heat\??\.?$|friction,?|fast\.?$|billion/i} />
      <EndCard op={endOp} />
      <Grade frame={frame} />
    </AbsoluteFill>
  );
};
