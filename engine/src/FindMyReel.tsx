import React, {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, delayRender, continueRender} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import vo from './findmy_vo.json';
import {C, EASE, v3, clamp01, envAt, Key, CameraRig, projectAt, canvasTex, glowTex, Captions, Label, SeriesTag, EndCard, Grade, Flash} from './lib';

const FPS = 30;
const L = vo.lines.map((l: any) => [l.start, l.end] as [number, number]);
const wt = (re: RegExp, line: number) => (vo.words as any[]).find((w) => w.line === line && re.test(w.w))!.s as number;
const END = vo.total + 2.6;
export const FINDMY_DURATION = Math.ceil(END * FPS);

const PULSE0 = L[2][0];
const WALK0 = L[3][0] - 1.2;
const HEAR = wt(/^hear$/, 3);
const ADD = wt(/^adds$/, 4), LOCK = wt(/^locks$/, 4), SEND = wt(/^sends$/, 4);
const ANON = L[5][0];
const ROT = L[6][0], ROT_SWAP = wt(/^ID$/, 6) + 0.3;
const MAP = L[7][0];

const TAG = v3(0.0, 0.66, 0.12);          // tag sitting on a bag on a bench
const STREET_Z = 1.9;
const CLOUD = v3(1.5, 9, -2);
const OWNER = v3(-14, 0, -12);          // the owner's phone, far away
const RANGE = 3.2;                       // visual Bluetooth reach (scene units)

// pedestrians: [start x, speed, has phone, delay]
const PEDS: [number, number, number][] = [[-14, 1.4, 0.0], [-5.6, 1.3, 0.6], [9, -1.2, 0.3]];
const FINDER = 1;
const pedRaw = (i: number, t: number) => { const [x0, sp, d] = PEDS[i]; return v3(x0 + sp * Math.max(0, t - WALK0 - d), 0, STREET_Z + (i === 2 ? 0.9 : 0)); };
// time the finder's phone first comes into range
const FIND_T = (() => { for (let t = WALK0; t < WALK0 + 20; t += 0.02) if (pedRaw(FINDER, t).distanceTo(v3(TAG.x, 0, TAG.z)) < RANGE) return t; return HEAR; })();
// the finder slows right down once in range, so we can watch its phone do the work
const pedPos = (i: number, t: number) => {
  if (i !== FINDER || t <= FIND_T + 0.8) return pedRaw(i, t);
  const [, sp] = PEDS[i];
  return pedRaw(i, FIND_T + 0.8).add(v3(0.18 * sp * (t - FIND_T - 0.8), 0, 0));
};
const FA = pedPos(FINDER, ADD).add(v3(0.3, 1.3, 0.25));
const KEYS: Key[] = [
  [0, v3(1.4, 1.3, 3.2), v3(0, 0.62, 0.1), 30],
  [L[0][1], v3(1.1, 1.2, 2.7), v3(0, 0.62, 0.1), 30],
  [L[1][1], v3(-1, 28, 19), v3(-7, 0, -6), 34],
  [PULSE0 + 1.0, v3(3.5, 7.5, 12.0), v3(0, 0.5, 0.5), 30],
  [L[2][1], v3(3.2, 7.0, 11.4), v3(0, 0.5, 0.5), 30],
  [L[3][1], v3(-1.5, 4.5, 10.0), v3(-1.0, 0.9, 1.2), 30],
  [ADD + 0.4, v3(FA.x + 2.2, FA.y + 1.6, FA.z + 4.4), FA, 30],
  [SEND, v3(FA.x + 2.6, FA.y + 1.8, FA.z + 5.0), FA, 30],
  [L[4][1], v3(1.5, 7.5, 15.0), v3(1.4, 6.0, -1), 30],
  [L[5][1], v3(1.6, 9.5, 8.5), v3(1.5, 8.5, -2), 30],
  [ROT + 1.0, v3(1.8, 2.4, 4.8), v3(0, 0.6, 0), 30],
  [MAP - 0.01, v3(1.6, 2.2, 4.4), v3(0, 0.6, 0), 30],
  [MAP, v3(OWNER.x + 0.5, 2.0, OWNER.z + 6.4), v3(OWNER.x, 1.5, OWNER.z), 30],
  [END, v3(OWNER.x + 0.2, 1.9, OWNER.z + 5.6), v3(OWNER.x, 1.5, OWNER.z), 30],
];

const useMats = () => useMemo(() => {
  const ground = canvasTex(2048, 2048, (g) => {
    g.fillStyle = '#05070b'; g.fillRect(0, 0, 2048, 2048);
    g.fillStyle = '#0b0e15';
    for (let by = 0; by < 16; by++) for (let bx = 0; bx < 16; bx++) { g.beginPath(); (g as any).roundRect(bx * 128 + 14, by * 128 + 14, 100, 100, 10); g.fill(); }
    g.fillStyle = '#121826'; for (let i = 0; i < 16; i++) { g.fillRect(i * 128 - 2, 0, 4, 2048); g.fillRect(0, i * 128 - 2, 2048, 4); }
  });
  ground.wrapS = ground.wrapT = THREE.RepeatWrapping; ground.repeat.set(4, 4);
  const back = canvasTex(256, 256, (g) => {
    const gr = g.createRadialGradient(128, 110, 10, 128, 128, 128); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#c8ccd2'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  });
  const mapUI = canvasTex(500, 1080, (g) => {
    g.fillStyle = '#0f1420'; g.fillRect(0, 0, 500, 1080);
    g.strokeStyle = '#26304a'; g.lineWidth = 10; for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(0, 80 + i * 120); g.lineTo(500, 40 + i * 130); g.stroke(); g.beginPath(); g.moveTo(40 + i * 70, 0); g.lineTo(i * 60, 1080); g.stroke(); }
    g.fillStyle = '#1a3d2a'; g.beginPath(); g.ellipse(360, 300, 90, 60, 0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(15,20,32,0.92)'; g.fillRect(0, 820, 500, 260);
    g.fillStyle = '#f4f7ff'; g.font = '800 44px Inter, sans-serif'; g.fillText('Backpack', 36, 890);
    g.fillStyle = 'rgba(244,247,255,0.65)'; g.font = '600 30px Inter, sans-serif'; g.fillText('Seen just now · 3.2 mi', 36, 940);
  });
  return {
    ground: new THREE.MeshStandardMaterial({map: ground, roughness: 0.9, envMapIntensity: 0.15}),
    tagFront: new THREE.MeshPhysicalMaterial({color: '#f6f7f9', roughness: 0.15, clearcoat: 1}),
    tagBack: new THREE.MeshStandardMaterial({map: back, metalness: 0.95, roughness: 0.2}),
    bag: new THREE.MeshStandardMaterial({color: '#2c3b55', roughness: 0.8}),
    bench: new THREE.MeshStandardMaterial({color: '#6b4a30', roughness: 0.7}),
    metal: new THREE.MeshStandardMaterial({color: '#30343c', metalness: 0.8, roughness: 0.4}),
    ped: new THREE.MeshStandardMaterial({color: '#5c6a85', roughness: 0.7}),
    pedHi: new THREE.MeshStandardMaterial({color: '#8fa2c7', roughness: 0.6}),
    phone: new THREE.MeshPhysicalMaterial({color: '#2b2f36', metalness: 0.85, roughness: 0.28, clearcoat: 0.6}),
    screenOff: new THREE.MeshBasicMaterial({color: '#0a0d14'}),
    screenOn: new THREE.MeshBasicMaterial({color: C.accent, toneMapped: false}),
    mapUI: new THREE.MeshBasicMaterial({map: mapUI, toneMapped: false}),
    cloud: new THREE.MeshPhysicalMaterial({color: '#dde6f5', roughness: 0.4, clearcoat: 0.4, transparent: true, opacity: 0.95}),
    ring: canvasTex(256, 256, (g) => { g.strokeStyle = 'rgba(200,240,255,1)'; g.lineWidth = 5; g.beginPath(); g.arc(128, 128, 120, 0, Math.PI * 2); g.stroke(); }),
    glowC: glowTex('95,208,255'), glowW: glowTex('255,181,71'),
    pin: canvasTex(256, 256, (g) => {
      g.fillStyle = '#ffb547'; g.beginPath(); g.arc(128, 100, 70, Math.PI, 0); g.lineTo(128, 236); g.closePath(); g.fill();
      g.beginPath(); g.arc(128, 100, 70, 0, Math.PI); g.fill(); g.fillStyle = '#1a1206'; g.beginPath(); g.arc(128, 100, 28, 0, Math.PI * 2); g.fill();
    }),
    lock: canvasTex(256, 256, (g) => {
      g.strokeStyle = '#ffb547'; g.lineWidth = 22; g.lineCap = 'round'; g.beginPath(); g.arc(128, 104, 52, Math.PI, 0); g.lineTo(180, 130); g.moveTo(76, 104); g.lineTo(76, 130); g.stroke();
      g.fillStyle = '#ffb547'; g.beginPath(); (g as any).roundRect(50, 124, 156, 112, 18); g.fill();
      g.fillStyle = '#1a1206'; g.beginPath(); g.arc(128, 174, 16, 0, Math.PI * 2); g.fill();
    }),
  };
}, []);

const Tag: React.FC<{mats: any}> = ({mats}) => (
  <group position={TAG.toArray()} rotation={[Math.PI / 2 - 0.45, 0.25, 0]} scale={[1.15, 1.15, 1.15]}>
    <mesh material={mats.tagFront} scale={[1, 0.32, 1]} position={[0, 0.03, 0]}><sphereGeometry args={[0.16, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
    <mesh material={mats.tagBack} scale={[1, 0.32, 1]} rotation={[Math.PI, 0, 0]} position={[0, 0.03, 0]}><sphereGeometry args={[0.16, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
  </group>
);

const Bench: React.FC<{mats: any}> = ({mats}) => {
  const bag = useMemo(() => new RoundedBoxGeometry(0.8, 0.55, 0.4, 5, 0.14), []);
  return (
    <group>
      <mesh position={[0, 0.3, -0.1]} material={mats.bench}><boxGeometry args={[2.6, 0.08, 0.8]} /></mesh>
      {[-1.1, 1.1].map((x) => <mesh key={x} position={[x, 0.15, -0.1]} material={mats.metal}><boxGeometry args={[0.08, 0.3, 0.7]} /></mesh>)}
      <mesh position={[0.15, 0.6, -0.15]} material={mats.bag} geometry={bag} />
    </group>
  );
};

const Person: React.FC<{t: number; i: number; mats: any}> = ({t, i, mats}) => {
  const p = pedPos(i, t);
  const [, sp] = PEDS[i];
  const step = Math.sin(t * 7 + i);
  const isFinder = i === FINDER;
  const lit = isFinder ? clamp01((t - FIND_T) / 0.3) * (1 - clamp01((t - ANON) / 0.6)) : 0;
  return (
    <group position={[p.x, 0, p.z]} rotation={[0, sp > 0 ? Math.PI / 2 : -Math.PI / 2, 0]}>
      <mesh position={[0, 1.05, 0]} material={isFinder ? mats.pedHi : mats.ped}><capsuleGeometry args={[0.24, 0.7, 8, 16]} /></mesh>
      <mesh position={[0, 1.72, 0]} material={isFinder ? mats.pedHi : mats.ped}><sphereGeometry args={[0.2, 24, 16]} /></mesh>
      <mesh position={[0.12, 0.38, 0.05 * step]} material={mats.ped}><capsuleGeometry args={[0.09, 0.5, 6, 10]} /></mesh>
      <mesh position={[-0.12, 0.38, -0.05 * step]} material={mats.ped}><capsuleGeometry args={[0.09, 0.5, 6, 10]} /></mesh>
      {/* phone in hand */}
      <group position={[0.32, 1.05, 0.25]} rotation={[-0.9, 0, 0]}>
        <mesh material={mats.phone}><boxGeometry args={[0.16, 0.3, 0.02]} /></mesh>
        <mesh position={[0, 0, 0.011]} material={lit > 0.5 ? mats.screenOn : mats.screenOff}><planeGeometry args={[0.14, 0.27]} /></mesh>
        {lit > 0 ? <sprite scale={[0.9 * lit, 0.9 * lit, 1]}><spriteMaterial map={mats.glowC} transparent opacity={0.8 * lit} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite> : null}
      </group>
    </group>
  );
};

const Pulses: React.FC<{t: number; mats: any}> = ({t, mats}) => {
  const op = envAt(t, PULSE0 - 0.1, MAP - 0.2, 0.4, 0.4);
  if (op <= 0) return null;
  return (
    <group position={[TAG.x, 0.05, TAG.z]}>
      {[0, 1, 2].map((k) => {
        const u = ((t - PULSE0) * 0.55 + k / 3) % 1;
        return <mesh key={k} rotation={[-Math.PI / 2, 0, 0]} scale={[0.3 + u * RANGE * 2, 0.3 + u * RANGE * 2, 1]}><planeGeometry args={[1, 1]} /><meshBasicMaterial map={mats.ring} transparent opacity={op * 0.7 * (1 - u)} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>;
      })}
      <sprite position={[0, 0.6, 0]} scale={[0.9, 0.9, 1]}><spriteMaterial map={mats.glowC} transparent opacity={op * (0.5 + 0.3 * Math.sin(t * 6))} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite>
    </group>
  );
};

// encrypted location packet: finder's phone → cloud
const packetPos = (t: number) => {
  const from = pedPos(FINDER, Math.min(t, SEND)).add(v3(0.3, 1.3, 0.25));
  const k = EASE(clamp01((t - SEND) / 1.4));
  const mid = from.clone().lerp(CLOUD, 0.5).add(v3(0, 2.5, 0));
  const a = from.clone().lerp(mid, k), b = mid.clone().lerp(CLOUD, k);
  return a.lerp(b, k);
};

const Cloud: React.FC<{t: number; mats: any}> = ({t, mats}) => {
  const op = clamp01((t - (SEND - 0.6)) / 0.6) * (1 - clamp01((t - L[6][0]) / 0.3));
  if (op <= 0) return null;
  (mats.cloud as THREE.MeshPhysicalMaterial).opacity = 0.95 * op;
  return (
    <group position={CLOUD.toArray()} scale={[0.7 * op, 0.7 * op, 0.7 * op]}>
      {[[0, 0, 0, 1.1], [-1.1, -0.25, 0, 0.8], [1.1, -0.2, 0, 0.85], [0.4, 0.5, 0, 0.8]].map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]} material={mats.cloud}><sphereGeometry args={[r, 32, 24]} /></mesh>
      ))}
    </group>
  );
};

const OwnerPhone: React.FC<{t: number; mats: any}> = ({t, mats}) => {
  const body = useMemo(() => new RoundedBoxGeometry(1.25, 2.6, 0.1, 6, 0.16), []);
  const pin = clamp01((t - (MAP + 0.6)) / 0.4);
  return (
    <group position={[OWNER.x, 1.5, OWNER.z]} rotation={[-0.1, 0.05, 0]}>
      <mesh geometry={body} material={mats.phone} />
      <mesh position={[0, 0, 0.052]} material={mats.mapUI}><planeGeometry args={[1.17, 2.52]} /></mesh>
      {pin > 0 ? (
        <group position={[0.05, 0.25, 0.06]} scale={[pin, pin, pin]}>
          <mesh><circleGeometry args={[0.13, 32]} /><meshBasicMaterial color="#ffffff" toneMapped={false} /></mesh>
          <mesh position={[0, 0, 0.001]}><circleGeometry args={[0.1, 32]} /><meshBasicMaterial color={C.accent} toneMapped={false} /></mesh>
          <sprite position={[0, 0, 0.01]} scale={[0.8, 0.8, 1]}><spriteMaterial map={mats.glowC} transparent opacity={0.6 * (0.7 + 0.3 * Math.sin(t * 5))} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite>
        </group>
      ) : null}
    </group>
  );
};

const Scene: React.FC<{t: number}> = ({t}) => {
  const mats = useMats();
  const pk = envAt(t, SEND, SEND + 1.6, 0.1, 0.3);
  const pp = packetPos(t);
  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[4, 9, 6]} intensity={1.2} color="#fff1e4" />
      <directionalLight position={[-6, 3, -4]} intensity={0.9} color="#7aa8ff" />
      <pointLight position={[0, 2.2, 1.2]} intensity={5} distance={8} color="#bcd8ff" />
      <pointLight position={[OWNER.x, 3, OWNER.z + 3]} intensity={10} distance={10} color="#ffffff" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-10, 0, -10]} material={mats.ground}><planeGeometry args={[120, 120]} /></mesh>
      <Bench mats={mats} />
      <Tag mats={mats} />
      <Pulses t={t} mats={mats} />
      {t >= WALK0 - 0.1 && t < ROT ? [0, 1, 2].map((i) => <Person key={i} t={t} i={i} mats={mats} />) : null}
      {pk > 0 ? <sprite position={pp.toArray()} scale={[1.4, 1.4, 1]}><spriteMaterial map={mats.glowW} transparent opacity={pk} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite> : null}
      {pk > 0 ? <sprite position={pp.toArray()} scale={[0.5, 0.5, 1]}><spriteMaterial map={mats.lock} transparent opacity={pk} depthWrite={false} /></sprite> : null}
      <Cloud t={t} mats={mats} />
      {/* owner far away: tall beacon while asking "miles away?" */}
      {envAt(t, L[1][0], L[2][0] + 0.4, 0.4, 0.4) > 0 ? (
        <group position={[OWNER.x, 0, OWNER.z]}>
          <mesh position={[0, 3, 0]}><cylinderGeometry args={[0.12, 0.12, 6, 16]} /><meshBasicMaterial color={C.accent} transparent opacity={0.7 * envAt(t, L[1][0], L[2][0] + 0.4, 0.4, 0.4)} toneMapped={false} /></mesh>
          <sprite position={[0, 6.2, 0]} scale={[3, 3, 1]}><spriteMaterial map={mats.glowC} transparent opacity={envAt(t, L[1][0], L[2][0] + 0.4, 0.4, 0.4)} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite>
        </group>
      ) : null}
      {envAt(t, L[1][0], L[2][0] + 0.4, 0.4, 0.4) > 0 ? (
        <sprite position={[TAG.x, 2.5, TAG.z]} scale={[2.2, 2.2, 1]}><spriteMaterial map={mats.glowW} transparent opacity={envAt(t, L[1][0], L[2][0] + 0.4, 0.4, 0.4)} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite>
      ) : null}
      {/* location pin, then lock, above the finder's phone */}
      {(() => {
        const base = pedPos(FINDER, Math.min(t, SEND)).add(v3(0.3, 1.75, 0.25));
        const pinOp = envAt(t, ADD, SEND + 0.2, 0.25, 0.3);
        const lockOp = envAt(t, LOCK, SEND + 0.2, 0.25, 0.3);
        return <>
          {pinOp > 0 ? <sprite position={[base.x - 0.25 * lockOp, base.y + 0.1, base.z]} scale={[0.5, 0.5, 1]}><spriteMaterial map={mats.pin} transparent opacity={pinOp} depthWrite={false} /></sprite> : null}
          {lockOp > 0 ? <sprite position={[base.x + 0.25, base.y + 0.1, base.z]} scale={[0.45 * lockOp, 0.45 * lockOp, 1]}><spriteMaterial map={mats.lock} transparent opacity={lockOp} depthWrite={false} /></sprite> : null}
        </>;
      })()}
      <OwnerPhone t={t} mats={mats} />
      <CameraRig keys={KEYS} t={t} exposure={1.0} />
    </>
  );
};

const hexId = (seed: number) => { let s = ''; for (let i = 0; i < 8; i++) s += '0123456789ABCDEF'[Math.floor(Math.abs(Math.sin(seed * 77.7 + i * 12.9898) * 43758.5453) % 16)]; return s.slice(0, 4) + ' ' + s.slice(4); };

export const FindMyReel: React.FC = () => {
  const [ready, setReady] = React.useState(false);
  const [h] = React.useState(() => delayRender('fonts'));
  React.useEffect(() => { Promise.all([document.fonts.load('800 44px Inter'), document.fonts.load('600 30px Inter'), document.fonts.load('500 34px "JetBrains Mono"')]).then(() => { setReady(true); continueRender(h); }); }, [h]);
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const t = frame / fps;
  const endOp = envAt(t, vo.total + 0.15, END + 5, 0.4);
  const noGps = envAt(t, wt(/^GPS$/, 0) - 0.2, L[1][1], 0.3, 0.3);
  const milesL = envAt(t, wt(/^miles$/, 1) - 0.3, L[2][0] + 0.3, 0.3, 0.3);
  const btL = envAt(t, wt(/^short-range$/, 2), L[3][0] + 0.4, 0.3, 0.3);
  const strangerL = envAt(t, FIND_T, L[4][0], 0.3, 0.3);
  const locL = envAt(t, ADD, LOCK, 0.3, 0.2);
  const lockL = envAt(t, LOCK, ANON, 0.2, 0.3);
  const anonL = envAt(t, ANON, L[6][0], 0.3, 0.3);
  const rotL = envAt(t, ROT, MAP - 0.1, 0.3, 0.3);
  const swap = clamp01((t - ROT_SWAP) / 0.5);
  const mapL = envAt(t, MAP + 0.5, vo.total + 0.3, 0.3, 0.3);
  const fp = projectAt(KEYS, pedPos(FINDER, t).add(v3(0, 2.3, 0)), t, width, height);
  return (
    <AbsoluteFill style={{background: '#03050b'}}>
      <AbsoluteFill>
        <ThreeCanvas width={width} height={height} gl={{antialias: true}} camera={{fov: 30, position: [0, 3, 10]}}>
          {ready ? <Scene t={t} /> : null}
        </ThreeCanvas>
      </AbsoluteFill>
      <Flash t={t} at={MAP} dur={0.5} />
      <SeriesTag text="HOW IT WORKS · FIND MY" op={Math.min(1, t / 0.4) * (1 - endOp)} />
      <Label x={width / 2} y={420} op={noGps} color={C.warm} size={38}>GPS: none · internet: none</Label>
      <Label x={width / 2} y={420} op={milesL} color={C.accent} size={38}>your phone: 3 miles away</Label>
      <Label x={width / 2} y={420} op={btL} color={C.accent} size={38}>Bluetooth · short range</Label>
      <Label x={Math.min(width - 200, Math.max(200, fp.x))} y={Math.max(380, fp.y)} op={strangerL} color={C.text} size={32}>a stranger's iPhone</Label>
      <Label x={width / 2} y={420} op={locL} color={C.warm} size={38}>+ its own location</Label>
      <Label x={width / 2} y={420} op={lockL} color={C.warm} size={36}>locked · only you can read it</Label>
      {anonL > 0 ? (
        <div style={{position: 'absolute', left: 120, right: 120, top: 330, opacity: anonL, background: 'rgba(5,10,24,0.72)', border: `1px solid ${C.accent}66`, borderRadius: 18, padding: '22px 30px', fontFamily: 'JetBrains Mono', fontSize: 34, color: C.text}}>
          <div style={{color: C.accent, fontSize: 26, letterSpacing: 3, marginBottom: 10}}>WHAT APPLE SEES</div>
          <div>who found it? <span style={{color: '#ff7a7a'}}>unknown</span></div>
          <div style={{marginTop: 6}}>whose is it? <span style={{color: '#ff7a7a'}}>unknown</span></div>
        </div>
      ) : null}
      {rotL > 0 ? (
        <div style={{position: 'absolute', left: 140, right: 140, top: 330, opacity: rotL, background: 'rgba(5,10,24,0.72)', border: `1px solid ${C.warm}66`, borderRadius: 18, padding: '22px 30px', fontFamily: 'JetBrains Mono', color: C.text}}>
          <div style={{color: C.warm, fontSize: 26, letterSpacing: 3}}>SIGNAL ID</div>
          <div style={{fontSize: 52, marginTop: 8, position: 'relative'}}>
            <span style={{opacity: 1 - swap, position: 'absolute', textDecoration: swap > 0 ? 'line-through' : 'none', color: swap > 0 ? '#ff7a7a' : C.text}}>{hexId(1)}</span>
            <span style={{opacity: swap, color: C.accent}}>{hexId(2)}</span>
          </div>
          <div style={{fontSize: 26, color: C.dim, marginTop: 8}}>new ID ≈ every 15 min</div>
        </div>
      ) : null}
      <Label x={width / 2} y={420} op={mapL} color={C.accent} size={38}>found · on your map</Label>
      <Captions vo={vo as any} t={t} hi={/Bluetooth|signal|iPhone|location|ID|map\.?$/i} warm={/GPS|internet|away\?|stranger's\.?|locks|Apple|fifteen|minutes,?/i} />
      <EndCard op={endOp} />
      <Grade frame={frame} />
    </AbsoluteFill>
  );
};
