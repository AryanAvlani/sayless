import React, {useMemo} from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, staticFile, Easing, delayRender, continueRender} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-800.css';
import '@fontsource/inter/latin-900.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import vo from './gps_vo.json';

const FPS = 30;
const C = {accent: '#5fd0ff', warm: '#ffb547', text: '#f4f7ff', dim: 'rgba(225,235,255,0.7)'};
const EASE = Easing.bezier(0.45, 0, 0.2, 1);
const R = 2;                       // Earth radius (scene units)
const ORBIT = R * 26560 / 6371;    // GPS orbit radius, to scale (~8.34)

// ---------- geometry helpers ----------
const llToLocal = (lat: number, lon: number, r: number) => {
  const u = (lon + 180) / 360, v = (90 - lat) / 180;
  return new THREE.Vector3(-r * Math.cos(u * 2 * Math.PI) * Math.sin(v * Math.PI), r * Math.cos(v * Math.PI), r * Math.sin(u * 2 * Math.PI) * Math.sin(v * Math.PI));
};
// orient Earth so Mumbai faces +Z (towards default camera), slightly up-left
const MUM_LOCAL = llToLocal(19.08, 72.88, R);
const ROT_Y = Math.atan2(-MUM_LOCAL.x, MUM_LOCAL.z);
const zAfterY = -MUM_LOCAL.x * Math.sin(ROT_Y) + MUM_LOCAL.z * Math.cos(ROT_Y);
const ROT_X = Math.atan2(MUM_LOCAL.y, zAfterY);
const MUMBAI = new THREE.Vector3(0, 0, R); // world position after orientation

// constellation: 6 planes x 5 sats, 55 deg inclination
type Sat = {plane: number; slot: number};
const SATS: Sat[] = [];
for (let p = 0; p < 6; p++) for (let s = 0; s < 5; s++) SATS.push({plane: p, slot: s});
const satPos = (i: number, t: number) => {
  const {plane, slot} = SATS[i];
  const raan = plane * Math.PI / 3 + 0.3;
  const inc = 55 * Math.PI / 180;
  const a = slot * (2 * Math.PI / 5) + plane * 0.55 + t * 0.035;
  const v = new THREE.Vector3(Math.cos(a) * ORBIT, 0, Math.sin(a) * ORBIT);
  v.applyAxisAngle(new THREE.Vector3(1, 0, 0), inc);
  v.applyAxisAngle(new THREE.Vector3(0, 1, 0), raan);
  return v;
};
// the four "hero" satellites visible above Mumbai (fixed, hand-placed in the sky dome above +Z)
const HERO_DIRS = [[0.52, 0.55, 0.65], [-0.62, 0.32, 0.71], [0.25, -0.52, 0.82], [-0.38, -0.33, 0.86]];
const HERO = HERO_DIRS.map((d) => new THREE.Vector3(...(d as [number, number, number])).normalize().multiplyScalar(ORBIT));
const HERO_A = HERO[0];

// ---------- timeline (seconds) from the voiceover ----------
const L = vo.lines.map((l: any) => [l.start, l.end]);
const END = vo.total + 2.6;
export const GPS_DURATION = Math.ceil(END * FPS);

// camera keyframes: [time, position, lookAt, fov]
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const OUT = HERO_A.clone().normalize();
const SIDE = new THREE.Vector3(0, 1, 0).cross(OUT).normalize();
const camNearSat = HERO_A.clone().add(OUT.clone().multiplyScalar(1.5)).add(SIDE.clone().multiplyScalar(0.7)).add(v3(0, 0.35, 0));
const KEYS: [number, THREE.Vector3, THREE.Vector3, number][] = [
  [0, camNearSat.clone().add(OUT.clone().multiplyScalar(0.5)), HERO_A.clone().lerp(MUMBAI, 0.12), 40],
  [L[1][1] - 0.2, camNearSat, HERO_A.clone().lerp(MUMBAI, 0.2), 40],
  [L[2][0] + 1.2, v3(4, 7, 30), v3(0, 0.6, 0), 30],
  [L[2][1] - 0.1, v3(-6, 4, 28), v3(0, 0.4, 0), 30],
  [L[3][0] + 1.0, HERO_A.clone().add(SIDE.clone().multiplyScalar(-2.0)).add(OUT.clone().multiplyScalar(1.2)).add(v3(0, 0.5, 0)), HERO_A.clone().add(v3(0, -0.2, 0)), 32],
  [L[3][1] - 0.2, HERO_A.clone().add(SIDE.clone().multiplyScalar(-1.6)).add(OUT.clone().multiplyScalar(1.5)).add(v3(0, 0.3, 0)), HERO_A.clone().add(v3(0, -0.2, 0)), 32],
  [L[4][0] + 1.0, v3(5.5, 3.2, 13.5), v3(0.5, 1.6, 3.5), 34],
  [L[4][1], v3(5.0, 3.0, 13.0), v3(0.5, 1.4, 3.5), 34],
  [L[5][0] + 1.2, v3(0.5, 1.2, 25), v3(0, 0.5, 3), 32],
  [L[6][0] + 0.2, v3(-1.0, 0.8, 23), v3(0, 0.3, 2.5), 32],
  [L[7][0] + 0.3, v3(0.6, 0.9, 8.6), v3(0, 0.05, 2), 30],
  [END, v3(0.3, 0.6, 7.2), v3(0, 0.0, 2), 30],
];
const camAt = (t: number) => {
  let i = 0;
  while (i < KEYS.length - 2 && t > KEYS[i + 1][0]) i++;
  const [t0, p0, l0, f0] = KEYS[i], [t1, p1, l1, f1] = KEYS[i + 1];
  const k = EASE(Math.min(1, Math.max(0, (t - t0) / (t1 - t0))));
  return {pos: p0.clone().lerp(p1, k), look: l0.clone().lerp(l1, k), fov: f0 + (f1 - f0) * k};
};

// ---------- textures ----------
const FILES = ['earth_day_4096.jpg', 'earth_night_4096.jpg', 'earth_specular_2048.jpg', 'earth_normal_2048.jpg', 'earth_clouds_4096.png'];
const useTextures = () => {
  const [tex, setTex] = React.useState<THREE.Texture[] | null>(null);
  const [h] = React.useState(() => delayRender('textures'));
  React.useEffect(() => {
    const l = new THREE.TextureLoader();
    Promise.all(FILES.map((f) => l.loadAsync(staticFile(f)))).then((t) => { setTex(t); continueRender(h); });
  }, [h]);
  return tex;
};
const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
};
const glowTex = (rgb: string) => canvasTex(128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.2, `rgba(${rgb},0.55)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});

// ---------- 3D pieces ----------
const CameraRig: React.FC<{t: number}> = ({t}) => {
  const {camera, scene, gl} = useThree();
  React.useMemo(() => {
    const pm = new THREE.PMREMGenerator(gl);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 0.95;
  }, [gl, scene]);
  const c = camAt(t);
  const cam = camera as THREE.PerspectiveCamera;
  cam.position.copy(c.pos); cam.fov = c.fov; cam.near = 0.02; cam.far = 400; cam.updateProjectionMatrix(); cam.lookAt(c.look);
  return null;
};

const Satellite: React.FC<{pos: THREE.Vector3; scale: number; spin: number; mats: any; highlight?: number}> = ({pos, scale, spin, mats, highlight = 0}) => {
  // orient panels roughly toward the sun direction, body toward Earth
  const q = useMemo(() => { const m = new THREE.Matrix4().lookAt(pos, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)); return new THREE.Quaternion().setFromRotationMatrix(m); }, [pos.x, pos.y, pos.z]);
  return (
    <group position={pos.toArray()} quaternion={q} scale={scale}>
      <group rotation={[0, 0, spin]}>
        <mesh material={mats.foil}><boxGeometry args={[0.62, 0.62, 0.8]} /></mesh>
        <mesh material={mats.white} position={[0, 0, 0.42]}><boxGeometry args={[0.5, 0.5, 0.04]} /></mesh>
        <mesh material={mats.white} position={[0, 0.33, 0.1]}><boxGeometry args={[0.3, 0.06, 0.3]} /></mesh>
        {/* L-band antenna array faces Earth (-Z) */}
        <mesh material={mats.white} position={[0, 0, -0.42]}><boxGeometry args={[0.56, 0.56, 0.04]} /></mesh>
        {[-0.17, 0, 0.17].map((x) => [-0.17, 0, 0.17].map((y) => (
          <mesh key={`${x}${y}`} material={mats.white} position={[x, y, -0.5]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.03, 0.04, 0.12, 14]} /></mesh>
        )))}
        {[-1, 1].map((s) => (
          <group key={s}>
            <mesh material={mats.white} position={[s * 0.6, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.022, 0.022, 0.6, 10]} /></mesh>
            <group position={[s * 1.75, 0, 0]} rotation={[0.55, 0, 0]}>
              <mesh material={mats.frame}><boxGeometry args={[2.0, 0.86, 0.025]} /></mesh>
              <mesh material={mats.panel} position={[0, 0, 0.014]}><planeGeometry args={[1.94, 0.8]} /></mesh>
              <mesh material={mats.panel} position={[0, 0, -0.014]} rotation={[0, Math.PI, 0]}><planeGeometry args={[1.94, 0.8]} /></mesh>
            </group>
          </group>
        ))}
      </group>
      {highlight > 0 ? <sprite scale={[3.2, 3.2, 1]}><spriteMaterial map={mats.glowC} transparent opacity={0.55 * highlight} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite> : null}
    </group>
  );
};

const Beam: React.FC<{from: THREE.Vector3; to: THREE.Vector3; progress: number; opacity: number; mats: any}> = ({from, to, progress, opacity, mats}) => {
  if (opacity <= 0.001 || progress <= 0) return null;
  const p = Math.min(1, progress);
  const end = from.clone().lerp(to, p);
  const mid = from.clone().lerp(end, 0.5);
  const len = from.distanceTo(end);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  return (
    <>
      <mesh position={mid.toArray()} quaternion={q}><cylinderGeometry args={[0.012, 0.012, len, 6]} /><meshBasicMaterial color={C.accent} transparent opacity={0.55 * opacity} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
      {p < 1 ? <sprite position={end.toArray()} scale={[0.55, 0.55, 1]}><spriteMaterial map={mats.glowC} transparent opacity={opacity} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite> : null}
    </>
  );
};

const RangeSphere: React.FC<{c: THREE.Vector3; r: number; opacity: number; mat: THREE.ShaderMaterial}> = ({c, r, opacity, mat}) => {
  const m = useMemo(() => mat.clone(), [mat]);
  if (opacity <= 0.001 || r <= 0.001) return null;
  m.uniforms.op.value = opacity;
  return <mesh position={c.toArray()} scale={r}><sphereGeometry args={[1, 96, 96]} /><primitive object={m} attach="material" /></mesh>;
};

const Scene: React.FC<{t: number; tex: THREE.Texture[]}> = ({t, tex}) => {
  const [day, night, spec, normal, clouds] = tex;
  day.colorSpace = THREE.SRGBColorSpace; night.colorSpace = THREE.SRGBColorSpace; [day, night, clouds, normal, spec].forEach((x) => { x.anisotropy = 16; });
  const mats = useMemo(() => {
    const foilT = canvasTex(256, 256, (g) => {
      g.fillStyle = '#b8862c'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 2600; i++) { const v = 110 + Math.random() * 140; g.fillStyle = `rgba(${v + 40},${v},${v * 0.35},0.22)`; g.save(); g.translate(Math.random() * 256, Math.random() * 256); g.rotate(Math.random() * 3); g.fillRect(0, 0, 3 + Math.random() * 12, 2 + Math.random() * 7); g.restore(); }
    });
    const panelT = canvasTex(512, 224, (g) => {
      g.fillStyle = '#0b1a44'; g.fillRect(0, 0, 512, 224);
      for (let x = 0; x < 16; x++) for (let y = 0; y < 7; y++) {
        const gr = g.createLinearGradient(0, y * 32, 0, y * 32 + 30); gr.addColorStop(0, '#22408f'); gr.addColorStop(1, '#13286a');
        g.fillStyle = gr; g.fillRect(x * 32 + 2, y * 32 + 2, 28, 28);
      }
    });
    const bumpT = canvasTex(512, 512, (g) => {
      g.fillStyle = '#808080'; g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 1400; i++) { const v = Math.floor(60 + Math.random() * 140); g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); const x = Math.random() * 512, y = Math.random() * 512; g.moveTo(x, y); for (let k = 0; k < 3; k++) g.lineTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 60); g.closePath(); g.globalAlpha = 0.35; g.fill(); }
      g.globalAlpha = 1;
    });
    bumpT.colorSpace = THREE.NoColorSpace;
    return {
      frame: new THREE.MeshStandardMaterial({color: '#c9ced6', metalness: 0.9, roughness: 0.3}),
      foil: new THREE.MeshStandardMaterial({map: foilT, bumpMap: bumpT, bumpScale: 2.5, metalness: 1, roughness: 0.2, color: '#ffcf7a', envMapIntensity: 2.0}),
      panel: new THREE.MeshStandardMaterial({map: panelT, metalness: 0.75, roughness: 0.18, envMapIntensity: 1.8, side: THREE.FrontSide}),
      white: new THREE.MeshStandardMaterial({color: '#dfe3ea', metalness: 0.3, roughness: 0.45}),
      dark: new THREE.MeshStandardMaterial({color: '#222', metalness: 0.8, roughness: 0.4}),
      glowC: glowTex('95,208,255'), glowW: glowTex('255,181,71'),
      atmo: new THREE.ShaderMaterial({
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
        vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vP=mv.xyz; gl_Position=projectionMatrix*mv; }`,
        fragmentShader: `varying vec3 vN; varying vec3 vP; void main(){ float i=pow(1.0-abs(dot(vN,normalize(-vP))),4.0); gl_FragColor=vec4(0.35,0.62,1.0,1.)*i*1.3; }`,
      }),
      shell: new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: {op: {value: 1}},
        vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vP=mv.xyz; gl_Position=projectionMatrix*mv; }`,
        fragmentShader: `uniform float op; varying vec3 vN; varying vec3 vP; void main(){ float f=1.0-abs(dot(vN,normalize(-vP))); gl_FragColor=vec4(0.37,0.82,1.0,1.)*(pow(f,2.5)*0.9+0.03)*op; }`,
      }),
    };
  }, []);
  const stars = useMemo(() => {
    const n = 2500, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(150 + Math.random() * 80); a.set([v.x, v.y, v.z], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3)); return g;
  }, []);
  const orbits = useMemo(() => [0, 1, 2, 3, 4, 5].map((p) => {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 128; k++) { const a = k / 128 * Math.PI * 2; const v = new THREE.Vector3(Math.cos(a) * ORBIT, 0, Math.sin(a) * ORBIT); v.applyAxisAngle(new THREE.Vector3(1, 0, 0), 55 * Math.PI / 180); v.applyAxisAngle(new THREE.Vector3(0, 1, 0), p * Math.PI / 3 + 0.3); pts.push(v); }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }), []);

  // phase envelopes
  const env = (a: number, b: number, fi = 0.6, fo = 0.6) => Math.max(0, Math.min(1, (t - a) / fi, (b - t) / fo));
  const constellation = env(L[2][0], L[5][0] + 0.8, 0.8, 0.8);
  const listenRings = env(L[1][0] - 0.1, L[2][0] + 0.6, 0.3, 0.6);
  const beamOne = t > L[4][0] ? (t - L[4][0] - 0.4) / 1.8 : 0;
  const beamOneOp = env(L[4][0], L[5][0] + 0.5, 0.3, 0.6);
  const beamsAll = (i: number) => t > L[5][0] ? (t - L[5][0] - 0.3 - i * 0.35) / 1.4 : 0;
  const beamsAllOp = env(L[5][0], L[7][0] + 0.3, 0.3, 0.5);
  const sphereK = (i: number) => EASE(Math.max(0, Math.min(1, (t - (L[5][1] - 1.6 + i * 0.25)) / 1.6)));
  const spheresOp = env(L[5][1] - 1.6, L[7][0] + 0.6, 0.4, 0.8);
  const heroHi = (i: number) => (i === 0 ? env(L[3][0], L[5][1], 0.4, 0.4) * 0.6 : 0) + env(L[5][0] + i * 0.35, L[7][0], 0.4, 0.5);
  const pin = env(L[6][0] + 0.6, END + 5, 0.6, 1);
  const earthSpin = t * 0.004;

  return (
    <>
      <ambientLight intensity={0.03} />
      <directionalLight position={[8, 3, 6]} intensity={2.3} color="#fff1dc" />
      <directionalLight position={[-6, -2, -4]} intensity={0.25} color="#6d8cff" />
      <points geometry={stars}><pointsMaterial color="#cfe0ff" size={0.55} sizeAttenuation transparent opacity={0.75} depthWrite={false} /></points>
      {/* Earth oriented so Mumbai faces +Z */}
      <group rotation={[ROT_X, 0, 0]}>
        <group rotation={[0, ROT_Y + earthSpin * 0, 0]}>
          <mesh>
            <sphereGeometry args={[R, 160, 160]} />
            <meshPhongMaterial map={day} specularMap={spec} specular={new THREE.Color('#4a5a6e')} shininess={22}
              normalMap={normal} normalScale={new THREE.Vector2(0.7, 0.7)} emissiveMap={night} emissive={new THREE.Color('#ffc58a')} emissiveIntensity={0.9} />
          </mesh>
          <mesh rotation={[0, t * 0.01, 0]}>
            <sphereGeometry args={[R * 1.008, 160, 160]} />
            <meshPhongMaterial map={clouds} transparent opacity={0.75} depthWrite={false} />
          </mesh>
        </group>
      </group>
      <mesh scale={R * 1.025}><sphereGeometry args={[1, 96, 96]} /><primitive object={mats.atmo} attach="material" /></mesh>
      {/* constellation */}
      {orbits.map((g, i) => (
        <lineLoop key={i} geometry={g}><lineBasicMaterial color="#7fc8ff" transparent opacity={0.28 * constellation} depthWrite={false} /></lineLoop>
      ))}
      {constellation > 0.01 ? SATS.map((_, i) => (
        <group key={i}>
          <Satellite pos={satPos(i, t)} scale={0.16} spin={0} mats={mats} />
          <sprite position={satPos(i, t).toArray()} scale={[0.7, 0.7, 1]}><spriteMaterial map={mats.glowC} transparent opacity={0.7 * constellation} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite>
        </group>
      )) : null}
      {/* hero satellites */}
      {HERO.map((p, i) => (i === 0 || t > L[5][0] - 0.5) ? <Satellite key={i} pos={p} scale={i === 0 ? 0.26 : 0.2} spin={0.15 * Math.sin(t * 0.3 + i)} mats={mats} highlight={heroHi(i)} /> : null)}
      {/* "it only listens" broadcast rings from hero A */}
      {listenRings > 0 ? [0, 1, 2].map((k) => {
        const ph = ((t - L[1][0]) * 0.7 + k / 3) % 1;
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), MUMBAI.clone().sub(HERO_A).normalize());
        return <mesh key={k} position={HERO_A.clone().lerp(MUMBAI, ph * 0.9).toArray()} quaternion={q}><ringGeometry args={[0.25 + ph * 1.6, 0.27 + ph * 1.6, 96]} /><meshBasicMaterial color={C.accent} transparent opacity={(1 - ph) * 0.8 * listenRings} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>;
      }) : null}
      {/* one beam (time of flight) */}
      <Beam from={HERO_A} to={MUMBAI} progress={beamOne} opacity={beamOneOp} mats={mats} />
      {/* four beams */}
      {HERO.map((p, i) => <Beam key={i} from={p} to={MUMBAI} progress={beamsAll(i)} opacity={beamsAllOp} mats={mats} />)}
      {/* range spheres */}
      {HERO.map((p, i) => <RangeSphere key={i} c={p} r={p.distanceTo(MUMBAI) * sphereK(i)} opacity={spheresOp * 0.9} mat={mats.shell} />)}
      {/* Mumbai pin */}
      {pin > 0 ? (
        <>
          <sprite position={MUMBAI.clone().multiplyScalar(1.004).toArray()} scale={[0.45 + 0.05 * Math.sin(t * 5), 0.45 + 0.05 * Math.sin(t * 5), 1]}><spriteMaterial map={mats.glowW} transparent opacity={pin} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite>
          {[0, 1].map((k) => { const ph = (t * 0.8 + k * 0.5) % 1; return (
            <mesh key={k} position={MUMBAI.clone().multiplyScalar(1.003).toArray()}><ringGeometry args={[0.03 + ph * 0.35, 0.04 + ph * 0.35, 64]} /><meshBasicMaterial color={C.warm} transparent opacity={(1 - ph) * pin} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
          ); })}
        </>
      ) : null}
      <CameraRig t={t} />
    </>
  );
};

// ---------- 2D overlays ----------
const project = (p: THREE.Vector3, t: number, w: number, h: number) => {
  const c = camAt(t);
  const cam = new THREE.PerspectiveCamera(c.fov, w / h, 0.02, 400);
  cam.position.copy(c.pos); cam.lookAt(c.look); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const v = p.clone().project(cam);
  return {x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, front: v.z < 1};
};

const Captions: React.FC<{t: number}> = ({t}) => {
  // group words into chunks of <= 4 words, breaking on punctuation
  const chunks = useMemo(() => {
    const out: any[][] = []; let cur: any[] = [];
    vo.words.forEach((w: any, i: number) => {
      cur.push(w);
      const next = vo.words[i + 1] as any;
      if (cur.length >= 4 || /[,.:]$/.test(w.w) || !next || next.line !== w.line) { out.push(cur); cur = []; }
    });
    return out;
  }, []);
  const ci = chunks.findIndex((c) => t >= c[0].s - 0.05 && t < c[c.length - 1].e + 0.12);
  if (ci < 0) return null;
  const ch = chunks[ci];
  const pop = Math.min(1, (t - ch[0].s + 0.05) / 0.12);
  return (
    <div style={{position: 'absolute', left: 60, right: 60, top: 1230, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px 18px',
      transform: `scale(${0.94 + 0.06 * pop})`, opacity: pop}}>
      {ch.map((w: any, i: number) => {
        const active = t >= w.s && t < w.e + 0.05;
        const said = t >= w.s;
        const hl = /satellites|listens|thirty|atomic|time|seven|four|distance|you\.|five/i.test(w.w);
        return (
          <span key={i} style={{fontFamily: 'Inter', fontWeight: 900, fontSize: 82, letterSpacing: -2, lineHeight: 1.08,
            color: hl && said ? (w.w.match(/you|five/i) ? C.warm : C.accent) : C.text, opacity: said ? 1 : 0.45,
            textShadow: '0 4px 28px rgba(0,0,0,0.85), 0 2px 6px rgba(0,0,0,0.9)', transform: `translateY(${active ? -4 : 0}px)`}}>{w.w.replace(/[:]/g, '')}</span>
        );
      })}
    </div>
  );
};

const Label: React.FC<{x: number; y: number; op: number; children: React.ReactNode; color?: string; size?: number}> = ({x, y, op, children, color = C.text, size = 34}) =>
  op <= 0 ? null : (
    <div style={{position: 'absolute', left: x, top: y, transform: `translate(-50%,-50%) translateY(${(1 - op) * 12}px)`, opacity: op, fontFamily: 'JetBrains Mono', fontWeight: 500, fontSize: size, color,
      letterSpacing: 1, whiteSpace: 'nowrap', textShadow: '0 2px 14px rgba(0,0,0,0.9)', background: 'rgba(5,10,24,0.55)', padding: '8px 16px', borderRadius: 10, border: `1px solid ${color}55`}}>{children}</div>
  );

export const GpsReel: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const t = frame / fps;
  const tex = useTextures();
  const env = (a: number, b: number, fi = 0.35, fo = 0.35) => Math.max(0, Math.min(1, (t - a) / fi, (b - t) / fo));

  // labels
  const altOp = env(L[2][0] + 2.4, L[3][0] + 0.2);
  const clockOp = env(L[3][0] + 0.8, L[3][1] + 0.3);
  const tofOp = env(L[4][0] + 0.6, L[5][0] + 0.4);
  const youOp = env(L[7][0] + 0.2, END + 5);
  const accOp = env(L[7][0] + 1.3, END + 5);
  const endOp = env(vo.total + 0.15, END + 5, 0.4);
  const sec = t + 5 * 3600 + 32 * 60 + 11; // fake but running clock display
  const us = Math.floor((t * 1e6 + frame * 137911) % 1e6).toString().padStart(6, '0');
  const tof = Math.min(0.0674, Math.max(0, (t - L[4][0] - 0.4) / 1.8) * 0.0674);
  const mum = project(MUMBAI, t, width, height);
  const hA = project(HERO_A, t, width, height);

  return (
    <AbsoluteFill style={{background: '#02040a'}}>
      <AbsoluteFill>
        <ThreeCanvas width={width} height={height} gl={{antialias: true}} camera={{fov: 34, position: [0, 0, 20]}}>
          {tex ? <Scene t={t} tex={tex} /> : null}
        </ThreeCanvas>
      </AbsoluteFill>
      {/* top series tag */}
      <div style={{position: 'absolute', top: 210, width: '100%', textAlign: 'center', fontFamily: 'JetBrains Mono', fontSize: 28, letterSpacing: 8, color: 'rgba(200,225,255,0.75)', opacity: Math.min(1, t / 0.4) * (1 - endOp)}}>HOW IT WORKS · GPS</div>
      {/* labels */}
      <Label x={width / 2} y={380} op={altOp} color={C.accent} size={38}>20,200 km above you</Label>
      <Label x={width / 2} y={400} op={clockOp} color={C.accent} size={34}>
        <div>ATOMIC CLOCK</div><div style={{fontSize: 46, color: C.text}}>{new Date(sec * 1000).toISOString().slice(11, 19)}.{us}</div>
      </Label>
      <Label x={width / 2} y={380} op={tofOp} color={C.accent} size={44}>travel time {tof.toFixed(4)} s</Label>
      <Label x={mum.x + 150} y={mum.y - 120} op={youOp} color={C.warm} size={40}>YOU · Mumbai</Label>
      <Label x={mum.x} y={mum.y + 150} op={accOp} color={C.warm} size={34}>± 5 m</Label>
      <Captions t={t} />
      <AbsoluteFill style={{opacity: endOp, background: 'linear-gradient(180deg, rgba(2,4,10,0.85) 0%, rgba(2,4,10,0.55) 35%, transparent 60%)'}} />
      {/* end card */}
      {endOp > 0 ? (
        <div style={{position: 'absolute', top: 360, width: '100%', textAlign: 'center', opacity: endOp, transform: `translateY(${(1 - endOp) * 20}px)`}}>
          <div style={{fontFamily: 'Inter', fontWeight: 900, fontSize: 76, color: C.text, letterSpacing: -2, lineHeight: 1.05, textShadow: '0 4px 30px rgba(0,0,0,0.8)'}}>How your stuff<br /><span style={{color: C.accent}}>actually works.</span></div>
          <div style={{marginTop: 26, fontFamily: 'Inter', fontWeight: 600, fontSize: 38, color: C.dim}}>Follow @sayless_verb</div>
        </div>
      ) : null}
      {/* grade: vignette + grain */}
      <AbsoluteFill style={{background: 'radial-gradient(85% 65% at 50% 50%, transparent 55%, rgba(0,0,0,0.6) 100%)', pointerEvents: 'none'}} />
      <AbsoluteFill style={{opacity: 0.05, mixBlendMode: 'overlay', backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='${frame % 8}'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`}} />
    </AbsoluteFill>
  );
};
