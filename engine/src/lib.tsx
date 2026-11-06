// Shared building blocks for Sayless "how it works" reels.
import React, {useMemo} from 'react';
import {AbsoluteFill, Easing, delayRender, continueRender, staticFile} from 'remotion';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-800.css';
import '@fontsource/inter/latin-900.css';
import '@fontsource/jetbrains-mono/latin-500.css';

export const C = {accent: '#5fd0ff', warm: '#ffb547', text: '#f4f7ff', dim: 'rgba(225,235,255,0.7)'};
export const EASE = Easing.bezier(0.45, 0, 0.2, 1);
export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** 0 outside [a,b], fades in over fi and out over fo */
export const envAt = (t: number, a: number, b: number, fi = 0.4, fo = 0.4) => Math.max(0, Math.min(1, (t - a) / fi, (b - t) / fo));

export type Voice = {lines: {text: string; start: number; end: number}[]; total: number; words: {w: string; s: number; e: number; line: number}[]};
export type Key = [number, THREE.Vector3, THREE.Vector3, number];   // time, position, lookAt, fov

export const camAt = (keys: Key[], t: number) => {
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const [t0, p0, l0, f0] = keys[i], [t1, p1, l1, f1] = keys[i + 1];
  const k = t1 - t0 < 1e-3 ? 1 : EASE(clamp01((t - t0) / (t1 - t0)));
  return {pos: p0.clone().lerp(p1, k), look: l0.clone().lerp(l1, k), fov: f0 + (f1 - f0) * k};
};

export const CameraRig: React.FC<{keys: Key[]; t: number; exposure?: number}> = ({keys, t, exposure = 1}) => {
  const {camera, scene, gl} = useThree();
  React.useMemo(() => {
    const pm = new THREE.PMREMGenerator(gl);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = exposure;
  }, [gl, scene, exposure]);
  const c = camAt(keys, t);
  const cam = camera as THREE.PerspectiveCamera;
  cam.position.copy(c.pos); cam.fov = c.fov; cam.near = 0.005; cam.far = 500; cam.updateProjectionMatrix(); cam.lookAt(c.look);
  return null;
};

export const projectAt = (keys: Key[], p: THREE.Vector3, t: number, w: number, h: number) => {
  const c = camAt(keys, t);
  const cam = new THREE.PerspectiveCamera(c.fov, w / h, 0.005, 500);
  cam.position.copy(c.pos); cam.lookAt(c.look); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const v = p.clone().project(cam);
  return {x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h};
};

export const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; return t;
};
export const glowTex = (rgb: string) => canvasTex(128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.2, `rgba(${rgb},0.55)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});

export const useTextureFiles = (files: string[]) => {
  const [tex, setTex] = React.useState<THREE.Texture[] | null>(files.length ? null : []);
  const [h] = React.useState(() => (files.length ? delayRender('textures') : null));
  React.useEffect(() => {
    if (!files.length) return;
    const l = new THREE.TextureLoader();
    Promise.all(files.map((f) => l.loadAsync(staticFile(f)))).then((t) => { setTex(t); if (h !== null) continueRender(h); });
  }, []);
  return tex;
};

/** Karaoke captions: chunks of <=4 words; highlight words matching `hi` (cyan) or `warm` (orange). */
export const Captions: React.FC<{vo: Voice; t: number; hi: RegExp; warm?: RegExp; top?: number}> = ({vo, t, hi, warm = /^$/, top = 1230}) => {
  const chunks = useMemo(() => {
    const out: any[][] = []; let cur: any[] = [];
    vo.words.forEach((w, i) => {
      cur.push(w);
      const next = vo.words[i + 1];
      if (cur.length >= 4 || /[,.:]$/.test(w.w) || !next || next.line !== w.line) { out.push(cur); cur = []; }
    });
    return out;
  }, [vo]);
  const ci = chunks.findIndex((c) => t >= c[0].s - 0.05 && t < c[c.length - 1].e + 0.12);
  if (ci < 0) return null;
  const ch = chunks[ci];
  const pop = clamp01((t - ch[0].s + 0.05) / 0.12);
  return (
    <div style={{position: 'absolute', left: 60, right: 60, top, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px 18px', transform: `scale(${0.94 + 0.06 * pop})`, opacity: pop}}>
      {ch.map((w: any, i: number) => {
        const said = t >= w.s;
        const isWarm = warm.test(w.w), isHi = hi.test(w.w);
        return (
          <span key={i} style={{fontFamily: 'Inter', fontWeight: 900, fontSize: 82, letterSpacing: -2, lineHeight: 1.08,
            color: said && isWarm ? C.warm : said && isHi ? C.accent : C.text, opacity: said ? 1 : 0.45,
            textShadow: '0 4px 28px rgba(0,0,0,0.85), 0 2px 6px rgba(0,0,0,0.9)'}}>{w.w.replace(/[:]/g, '')}</span>
        );
      })}
    </div>
  );
};

export const Label: React.FC<{x: number; y: number; op: number; children: React.ReactNode; color?: string; size?: number}> = ({x, y, op, children, color = C.text, size = 34}) =>
  op <= 0 ? null : (
    <div style={{position: 'absolute', left: x, top: y, transform: `translate(-50%,-50%) translateY(${(1 - op) * 12}px)`, opacity: op, fontFamily: 'JetBrains Mono', fontWeight: 500, fontSize: size, color,
      letterSpacing: 1, whiteSpace: 'nowrap', textShadow: '0 2px 14px rgba(0,0,0,0.9)', background: 'rgba(5,10,24,0.6)', padding: '8px 16px', borderRadius: 10, border: `1px solid ${color}55`}}>{children}</div>
  );

export const SeriesTag: React.FC<{text: string; op: number}> = ({text, op}) => (
  <div style={{position: 'absolute', top: 210, width: '100%', textAlign: 'center', fontFamily: 'JetBrains Mono', fontSize: 28, letterSpacing: 8, color: 'rgba(200,225,255,0.75)', opacity: op}}>{text}</div>
);

export const EndCard: React.FC<{op: number}> = ({op}) => op <= 0 ? null : (
  <>
    <AbsoluteFill style={{opacity: op, background: 'linear-gradient(180deg, rgba(2,4,10,0.88) 0%, rgba(2,4,10,0.6) 35%, transparent 62%)'}} />
    <div style={{position: 'absolute', top: 360, width: '100%', textAlign: 'center', opacity: op, transform: `translateY(${(1 - op) * 20}px)`}}>
      <div style={{fontFamily: 'Inter', fontWeight: 900, fontSize: 76, color: C.text, letterSpacing: -2, lineHeight: 1.05, textShadow: '0 4px 30px rgba(0,0,0,0.8)'}}>How your stuff<br /><span style={{color: C.accent}}>actually works.</span></div>
      <div style={{marginTop: 26, fontFamily: 'Inter', fontWeight: 600, fontSize: 38, color: C.dim}}>Follow @sayless_verb</div>
    </div>
  </>
);

export const Grade: React.FC<{frame: number}> = ({frame}) => (
  <>
    <AbsoluteFill style={{background: 'radial-gradient(85% 65% at 50% 50%, transparent 55%, rgba(0,0,0,0.6) 100%)', pointerEvents: 'none'}} />
    <AbsoluteFill style={{opacity: 0.05, mixBlendMode: 'overlay', backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='${frame % 8}'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`}} />
  </>
);

/** Full-screen flash used to hide a hard cut between worlds. */
export const Flash: React.FC<{t: number; at: number; dur?: number}> = ({t, at, dur = 0.5}) => {
  const k = 1 - Math.abs(t - at) / (dur / 2);
  return k <= 0 ? null : <AbsoluteFill style={{background: `radial-gradient(circle at 50% 50%, rgba(220,240,255,${k}) 0%, rgba(95,208,255,${k * 0.7}) 40%, rgba(2,4,10,${k}) 100%)`}} />;
};
