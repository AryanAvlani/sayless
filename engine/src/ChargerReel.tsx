import React, {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, delayRender, continueRender} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import vo from './charger_vo.json';
import {C, EASE, v3, clamp01, envAt, Key, CameraRig, projectAt, canvasTex, glowTex, Captions, Label, SeriesTag, EndCard, Grade, Flash} from './lib';

const FPS = 30;
const L = vo.lines.map((l: any) => [l.start, l.end] as [number, number]);
const wt = (re: RegExp, line: number) => (vo.words as any[]).find((w) => w.line === line && re.test(w.w))!.s as number;
const END = vo.total + 2.6;
export const CHARGER_DURATION = Math.ceil(END * FPS);

// timing
const XRAY0 = wt(/^switches$/, 0) - 0.2;
const BATT = wt(/^battery$/, 2);
const RECT0 = L[3][0];
const SW0 = wt(/^switch$/, 4);
const XF0 = wt(/^transformer$/, 4);
const CUT_CMP = L[5][0] - 0.2;          // to the transformer comparison
const CUT_BACK = L[6][0] - 0.2;         // back to the charger
const HEAT0 = wt(/^heat\.?$/, 6) - 1.2;
const THERMAL = L[7][0] - 0.2;

// layout: charger at origin, comparison at W
const W = v3(60, 0, 0);
const S = 2.6;                           // charger cube size
const P_RECT = v3(0, -0.55, -0.75), P_CAP = v3(-0.55, 0.15, -0.35), P_SW = v3(0.55, -0.35, -0.2), P_XF = v3(0.05, 0.1, 0.35), P_OUT = v3(0, -0.2, 1.05);
const PATH = [v3(-0.35, -0.3, -1.8), P_RECT, P_CAP, P_SW, P_XF, P_OUT, v3(0, -0.2, 1.6)];

const KEYS: Key[] = [
  [0, v3(7.5, 4.5, 10.5), v3(0, 0, 0), 30],
  [XRAY0 + 1.2, v3(6.0, 3.6, 9.0), v3(0, -0.2, 0), 30],
  [L[1][1], v3(8.5, 4.2, 7.0), v3(0, -0.2, 0), 30],
  [BATT, v3(9.5, 3.8, -4.5), v3(0, -0.3, -0.4), 30],
  [L[2][1], v3(8.5, 4.0, 5.5), v3(0, -0.2, 0.2), 30],
  [L[3][1], v3(6.0, 6.0, -6.0), v3(0, -0.5, -0.4), 30],
  [XF0, v3(6.5, 4.8, 6.5), v3(0.1, -0.3, 0.1), 30],
  [CUT_CMP - 0.02, v3(5.8, 4.2, 6.0), v3(0.1, -0.3, 0.2), 30],
  [CUT_CMP, W.clone().add(v3(0.5, 4.0, 13.0)), W.clone().add(v3(0, 0.4, 0)), 30],
  [CUT_BACK - 0.02, W.clone().add(v3(-0.4, 3.4, 11.5)), W.clone().add(v3(0, 0.4, 0)), 30],
  [CUT_BACK, v3(7.5, 4.0, 9.0), v3(0, -0.2, 0), 30],
  [THERMAL, v3(6.5, 3.4, 8.2), v3(0, 0, 0.1), 30],
  [END, v3(7.5, 4.0, 9.5), v3(0, 0, 0), 30],
];

const hi = (t: number, a: number, b: number) => envAt(t, a, b, 0.4, 0.5);
const heatAt = (t: number) => clamp01((t - HEAT0) / 1.2);

const useMats = () => useMemo(() => {
  const pcbTex = canvasTex(512, 512, (g) => {
    g.fillStyle = '#0d3b2c'; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = 'rgba(212,175,55,0.55)'; g.lineWidth = 4;
    for (let i = 0; i < 26; i++) { g.beginPath(); const x = (i * 97) % 512, y = (i * 61) % 512; g.moveTo(x, y); g.lineTo(x + 120, y); g.lineTo(x + 160, y + 60); g.stroke(); }
  });
  const thermal = canvasTex(256, 256, (g) => {
    const gr = g.createRadialGradient(150, 120, 10, 128, 128, 180);
    gr.addColorStop(0, '#fff2b0'); gr.addColorStop(0.25, '#ffb547'); gr.addColorStop(0.55, '#ff5a2a'); gr.addColorStop(0.8, '#a01d6a'); gr.addColorStop(1, '#3a1060');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  });
  return {
    shell: new THREE.MeshPhysicalMaterial({color: '#d9dce1', roughness: 0.4, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.25, transparent: true}),
    thermal: new THREE.MeshBasicMaterial({map: thermal, transparent: true, opacity: 0, toneMapped: false}),
    prong: new THREE.MeshStandardMaterial({color: '#cfd4da', metalness: 1, roughness: 0.22}),
    port: new THREE.MeshStandardMaterial({color: '#111316', metalness: 0.5, roughness: 0.5}),
    pcb: new THREE.MeshStandardMaterial({map: pcbTex, roughness: 0.6, metalness: 0.2}),
    blackPkg: new THREE.MeshStandardMaterial({color: '#16181c', roughness: 0.55, metalness: 0.2, emissive: new THREE.Color(C.accent), emissiveIntensity: 0}),
    swPkg: new THREE.MeshStandardMaterial({color: '#16181c', roughness: 0.45, metalness: 0.3, emissive: new THREE.Color(C.accent), emissiveIntensity: 0}),
    capBody: new THREE.MeshStandardMaterial({color: '#1d3f8a', roughness: 0.4, metalness: 0.4, emissive: new THREE.Color(C.accent), emissiveIntensity: 0}),
    capTop: new THREE.MeshStandardMaterial({color: '#c9ced6', roughness: 0.3, metalness: 1}),
    ferrite: new THREE.MeshStandardMaterial({color: '#3b3d42', roughness: 0.7, metalness: 0.3}),
    copper: new THREE.MeshStandardMaterial({color: '#d98a4a', metalness: 1, roughness: 0.3, emissive: new THREE.Color('#ff8a3d'), emissiveIntensity: 0}),
    planar: new THREE.MeshStandardMaterial({color: '#c27a3e', metalness: 0.9, roughness: 0.3}),
    floor: new THREE.MeshStandardMaterial({color: '#0b0d12', roughness: 0.85, metalness: 0.1}),
    glowC: glowTex('95,208,255'), glowW: glowTex('255,181,71'), glowR: glowTex('255,90,42'),
  };
}, []);

// E-core transformer: two E halves + bobbin winding. size s, thickness th
const Transformer: React.FC<{s: number; th: number; mats: any; planar?: boolean}> = ({s, th, mats, planar}) => (
  <group>
    {planar ? (
      <>
        <mesh material={mats.ferrite} position={[0, th * 0.42, 0]}><boxGeometry args={[s, th * 0.16, s * 0.7]} /></mesh>
        <mesh material={mats.ferrite} position={[0, -th * 0.42, 0]}><boxGeometry args={[s, th * 0.16, s * 0.7]} /></mesh>
        {[-1, 0, 1].map((k) => <mesh key={k} material={mats.ferrite} position={[k * s * 0.4, 0, 0]}><boxGeometry args={[s * 0.16, th * 0.7, s * 0.7]} /></mesh>)}
        {[0, 1, 2, 3].map((k) => <mesh key={'p' + k} material={mats.planar} position={[0, -th * 0.25 + k * th * 0.16, 0]}><boxGeometry args={[s * 0.62, th * 0.06, s * 0.6]} /></mesh>)}
      </>
    ) : (
      <>
        <mesh material={mats.ferrite} position={[0, th * 0.44, 0]}><boxGeometry args={[s, th * 0.12, s * 0.55]} /></mesh>
        <mesh material={mats.ferrite} position={[0, -th * 0.44, 0]}><boxGeometry args={[s, th * 0.12, s * 0.55]} /></mesh>
        {[-1, 1].map((k) => <mesh key={k} material={mats.ferrite} position={[k * s * 0.44, 0, 0]}><boxGeometry args={[s * 0.12, th * 0.8, s * 0.55]} /></mesh>)}
        <mesh material={mats.copper}><cylinderGeometry args={[s * 0.27, s * 0.27, th * 0.76, 40]} /></mesh>
        <mesh material={mats.ferrite}><cylinderGeometry args={[s * 0.12, s * 0.12, th * 0.8, 24]} /></mesh>
      </>
    )}
  </group>
);

const Charger: React.FC<{t: number; mats: any}> = ({t, mats}) => {
  const shellGeo = useMemo(() => new RoundedBoxGeometry(S, S, S * 1.05, 8, 0.38), []);
  const xray = envAt(t, XRAY0, THERMAL, 0.9, 0.7);
  const therm = clamp01((t - THERMAL) / 0.8);
  const heat = heatAt(t);
  (mats.shell as THREE.MeshPhysicalMaterial).opacity = 1 - 0.86 * xray; (mats.shell as any).depthWrite = xray < 0.5;
  (mats.thermal as THREE.MeshBasicMaterial).opacity = therm * 0.92;
  const swBlink = (Math.sin(t * 90) > 0 ? 1 : 0.15);
  (mats.swPkg as THREE.MeshStandardMaterial).emissiveIntensity = (envAt(t, XRAY0 + 0.6, L[1][0]) + hi(t, SW0 - 0.2, XF0 + 1.5)) * 1.6 * swBlink + heat * 0.0;
  (mats.blackPkg as THREE.MeshStandardMaterial).emissiveIntensity = hi(t, RECT0 + 0.3, L[3][1] + 0.4) * 1.3;
  (mats.copper as THREE.MeshStandardMaterial).emissiveIntensity = hi(t, XF0 - 0.1, CUT_CMP) * 0.9;
  (mats.capBody as THREE.MeshStandardMaterial).emissiveIntensity = 0;
  const prongGlow = hi(t, L[2][0] + 0.4, BATT - 0.1);
  const flow = envAt(t, L[2][0] + 0.6, HEAT0 + 2, 0.5, 0.6) * xray;
  const flowColor = (u: number) => (u < 0.35 ? 'W' : u < 0.62 ? 'C' : 'C');
  return (
    <group rotation={[0, 0.15 * Math.sin(t * 0.3), 0]}>
      {/* shell */}
      <mesh geometry={shellGeo} material={mats.shell} />
      {therm > 0 ? <mesh geometry={shellGeo} material={mats.thermal} scale={[1.003, 1.003, 1.003]} /> : null}
      {/* prongs (US) */}
      {[-1, 1].map((k) => <mesh key={k} material={mats.prong} position={[k * 0.32, 0, -S * 0.525 - 0.38]}><boxGeometry args={[0.07, 0.36, 0.76]} /></mesh>)}
      {[-1, 1].map((k) => <sprite key={'g' + k} position={[k * 0.32, 0, -S * 0.525 - 0.5]} scale={[0.9, 0.9, 1]}><spriteMaterial map={mats.glowW} transparent opacity={prongGlow * 0.8} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite>)}
      {/* USB-C port */}
      <mesh material={mats.port} position={[0, -0.2, S * 0.525]}><boxGeometry args={[0.6, 0.2, 0.05]} /></mesh>
      {xray > 0.01 ? (
        <group>
          <mesh material={mats.pcb} position={[0, -0.85, 0]}><boxGeometry args={[S * 0.86, 0.05, S * 0.9]} /></mesh>
          {/* rectifier: 4 diodes */}
          {[[-0.18, -0.12], [0.18, -0.12], [-0.18, 0.12], [0.18, 0.12]].map(([x, z], i) => <mesh key={i} material={mats.blackPkg} position={[P_RECT.x + x, -0.72, P_RECT.z + z]}><boxGeometry args={[0.24, 0.16, 0.16]} /></mesh>)}
          {/* bulk capacitor */}
          <group position={[P_CAP.x, -0.3, P_CAP.z]}>
            <mesh material={mats.capBody}><cylinderGeometry args={[0.28, 0.28, 1.0, 32]} /></mesh>
            <mesh material={mats.capTop} position={[0, 0.505, 0]}><cylinderGeometry args={[0.27, 0.27, 0.02, 32]} /></mesh>
          </group>
          {/* switch chip */}
          <mesh material={mats.swPkg} position={[P_SW.x, -0.76, P_SW.z]}><boxGeometry args={[0.36, 0.08, 0.36]} /></mesh>
          {/* transformer */}
          <group position={[P_XF.x, -0.35, P_XF.z]}><Transformer s={0.95} th={0.9} mats={mats} /></group>
          {/* output caps */}
          {[-0.45, 0.45].map((x) => <mesh key={x} material={mats.capBody} position={[x, -0.6, 0.85]}><cylinderGeometry args={[0.12, 0.12, 0.42, 20]} /></mesh>)}
          {/* energy flow */}
          {flow > 0 ? Array.from({length: 22}, (_, i) => {
            const u = (t * 0.32 + i / 22) % 1;
            const seg = u * (PATH.length - 1); const k = Math.min(PATH.length - 2, Math.floor(seg));
            const p = PATH[k].clone().lerp(PATH[k + 1], seg - k);
            return <sprite key={'f' + i} position={p.toArray()} scale={[0.26, 0.26, 1]}><spriteMaterial map={flowColor(u) === 'W' ? mats.glowW : mats.glowC} transparent opacity={flow * 0.9} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite>;
          }) : null}
          {/* heat glows */}
          {heat > 0 ? [P_SW, P_XF, P_RECT, P_CAP].map((p, i) => (
            <sprite key={'h' + i} position={[p.x, p.y - 0.2, p.z]} scale={[1.6 + 0.2 * Math.sin(t * 3 + i), 1.6 + 0.2 * Math.sin(t * 3 + i), 1]}><spriteMaterial map={mats.glowR} transparent opacity={heat * (i < 2 ? 0.85 : 0.55)} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite>
          )) : null}
        </group>
      ) : null}
      {/* rising heat shimmer */}
      {heat > 0 ? Array.from({length: 30}, (_, i) => {
        const u = (t * 0.35 + i / 30) % 1;
        const x = Math.sin(i * 12.9) * 1.0 + Math.sin(t * 2 + i) * 0.12, z = Math.cos(i * 7.3) * 1.0;
        return <sprite key={'s' + i} position={[x, -0.4 + u * 3.6, z]} scale={[0.35, 0.35, 1]}><spriteMaterial map={mats.glowR} transparent opacity={heat * 0.6 * Math.sin(Math.PI * u)} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite>;
      }) : null}
    </group>
  );
};

// transformer size comparison (Navitas: ~65 kHz silicon bobbin ~23 mm thick vs ~400 kHz GaN planar ~8 mm)
const Compare: React.FC<{t: number; mats: any}> = ({t, mats}) => {
  const grow = EASE(clamp01((t - CUT_CMP - 0.3) / 0.8));
  const gan = EASE(clamp01((t - wt(/^smaller$/, 5)) / 0.8));
  const spin = t * 0.3;
  return (
    <group position={W.toArray()}>
      <group position={[-1.5, 1.15, 0]} rotation={[0.25, spin, 0]} scale={[grow, grow, grow]}><Transformer s={2.3} th={2.3} mats={mats} /></group>
      <group position={[1.55, 0.45, 0]} rotation={[0.35, -spin, 0]} scale={[gan, gan, gan]}><Transformer s={1.7} th={0.8} mats={mats} planar /></group>
    </group>
  );
};

const Scene: React.FC<{t: number}> = ({t}) => {
  const mats = useMats();
  const inCmp = t >= CUT_CMP - 0.3 && t < CUT_BACK + 0.3;
  return (
    <>
      <ambientLight intensity={0.2} />
      <directionalLight position={[4, 7, 5]} intensity={1.9} color="#fff4e6" />
      <directionalLight position={[-5, 3, -4]} intensity={0.9} color="#7aa8ff" />
      <directionalLight position={[W.x - 4, 5, 6]} intensity={1.6} color="#fff4e6" />
      <pointLight position={[2.5, 3, 3]} intensity={6} distance={10} color="#5fd0ff" />
      <mesh position={[0, -S / 2 - 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.floor}><planeGeometry args={[200, 200]} /></mesh>
      {t < CUT_CMP + 0.3 || t > CUT_BACK - 0.3 ? <Charger t={t} mats={mats} /> : null}
      {inCmp ? <group position={[0, -S / 2, 0]}><Compare t={t} mats={mats} /></group> : null}
      <CameraRig keys={KEYS} t={t} exposure={1.0} />
    </>
  );
};

// waveform panel
type Mode = 'square' | 'ac' | 'dc4' | 'rect' | 'pulse';
const wave = (m: Mode, x: number, t: number) => {
  switch (m) {
    case 'square': return Math.sin((x * 9 + t * 40) * Math.PI) > 0 ? 0.8 : -0.1;
    case 'ac': return 0.85 * Math.sin((x * 2 + t * 0.8) * Math.PI * 2);
    case 'dc4': return 0.2;
    case 'rect': return 0.85 * Math.abs(Math.sin((x * 2 + t * 0.8) * Math.PI * 2));
    case 'pulse': return Math.sin((x * 14 + t * 30) * Math.PI) > 0.2 ? 0.85 : 0;
  }
};
const Wave: React.FC<{t: number; mode: Mode; color: string; title: string; sub: string; op: number; top?: number}> = ({t, mode, color, title, sub, op, top = 300}) => {
  if (op <= 0) return null;
  const Wd = 860, H = 170, pts: string[] = [];
  for (let i = 0; i <= 240; i++) { const x = i / 240; pts.push(`${(x * Wd).toFixed(1)},${(H / 2 - wave(mode, x, t) * H * 0.42).toFixed(1)}`); }
  return (
    <div style={{position: 'absolute', left: 110, top, width: Wd, opacity: op, transform: `translateY(${(1 - op) * 14}px)`, background: 'rgba(5,10,24,0.66)', border: `1px solid ${color}55`, borderRadius: 18, padding: '18px 0 10px'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', padding: '0 26px', fontFamily: 'JetBrains Mono', fontSize: 30, color}}><span>{title}</span><span style={{color: C.dim}}>{sub}</span></div>
      <svg width={Wd} height={H}>
        <line x1={0} x2={Wd} y1={H / 2} y2={H / 2} stroke="rgba(200,220,255,0.18)" strokeWidth={2} />
        <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={6} strokeLinejoin="round" />
      </svg>
    </div>
  );
};

export const ChargerReel: React.FC = () => {
  const [ready, setReady] = React.useState(false);
  const [h] = React.useState(() => delayRender('fonts'));
  React.useEffect(() => { document.fonts.load('500 30px "JetBrains Mono"').then(() => { setReady(true); continueRender(h); }); }, [h]);
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const t = frame / fps;
  const endOp = envAt(t, vo.total + 0.15, END + 5, 0.4);
  const cmp = (p: THREE.Vector3) => projectAt(KEYS, W.clone().add(v3(0, -S / 2, 0)).add(p), t, width, height);
  const siP = cmp(v3(-1.5, 2.7, 0)), ganP = cmp(v3(1.55, 1.3, 0));
  const lossW = 0.9;
  const lossOp = envAt(t, wt(/^loses$/, 6), L[7][0] + 0.2);
  return (
    <AbsoluteFill style={{background: '#03050b'}}>
      <AbsoluteFill>
        <ThreeCanvas width={width} height={height} gl={{antialias: true}} camera={{fov: 30, position: [4, 2, 6]}}>
          {ready ? <Scene t={t} /> : null}
        </ThreeCanvas>
      </AbsoluteFill>
      <SeriesTag text="HOW IT WORKS · PHONE CHARGER" op={Math.min(1, t / 0.4) * (1 - endOp)} />
      <Wave t={t} mode="square" color={C.accent} title="SWITCH" sub="on/off · 100,000+ / s" op={envAt(t, XRAY0 + 0.6, L[1][1])} />
      <Wave t={t} mode="ac" color={C.warm} title="OUTLET · 120 V AC" sub="flips 60× / s" op={envAt(t, wt(/^outlet$/, 2), BATT - 0.1)} />
      <Wave t={t} mode="dc4" color={C.accent} title="BATTERY · ~4 V DC" sub="one direction" op={envAt(t, BATT, L[3][0] - 0.1)} />
      <Wave t={t} mode="rect" color={C.warm} title="RECTIFIER" sub="one direction now" op={envAt(t, wt(/^turns$/, 3), L[4][0] - 0.1)} />
      <Wave t={t} mode="pulse" color={C.accent} title="SWITCH → TRANSFORMER" sub="fast pulses" op={envAt(t, SW0 - 0.1, CUT_CMP - 0.1)} />
      <Label x={siP.x} y={siP.y - 40} op={envAt(t, CUT_CMP + 0.5, CUT_BACK)} color={C.text} size={32}>silicon · ~65 kHz</Label>
      <Label x={ganP.x} y={ganP.y - 40} op={envAt(t, wt(/^smaller$/, 5) + 0.4, CUT_BACK)} color={C.accent} size={32}>GaN · ~400 kHz</Label>
      <Label x={width / 2} y={420} op={envAt(t, wt(/^gallium$/, 5) - 0.2, CUT_BACK)} color={C.accent} size={34}>faster switching → smaller parts</Label>
      {lossOp > 0 ? (
        <div style={{position: 'absolute', left: 110, top: 300, width: 860, opacity: lossOp, background: 'rgba(5,10,24,0.66)', border: `1px solid ${C.warm}55`, borderRadius: 18, padding: '20px 26px'}}>
          <div style={{fontFamily: 'JetBrains Mono', fontSize: 30, color: C.dim, marginBottom: 12}}>POWER IN → OUT</div>
          <div style={{display: 'flex', height: 54, borderRadius: 10, overflow: 'hidden'}}>
            <div style={{width: `${lossW * 100 * EASE(clamp01((t - wt(/^loses$/, 6)) / 0.8))}%`, background: C.accent}} />
            <div style={{flex: 1, background: '#ff5a2a', boxShadow: '0 0 24px #ff5a2a'}} />
          </div>
          <div style={{display: 'flex', justifyContent: 'space-between', marginTop: 10, fontFamily: 'JetBrains Mono', fontSize: 28}}>
            <span style={{color: C.accent}}>~90%+ to your phone</span><span style={{color: '#ff7a4a'}}>rest → heat</span>
          </div>
        </div>
      ) : null}
      <Captions vo={vo as any} t={t} hi={/switch|100,000|120|60|volts|4|direction|pulses|transformer|faster|smaller|gallium|nitride/i} warm={/heat\.?$|warmth|tenth/i} />
      <Flash t={t} at={CUT_CMP} />
      <Flash t={t} at={CUT_BACK} />
      <EndCard op={endOp} />
      <Grade frame={frame} />
    </AbsoluteFill>
  );
};
