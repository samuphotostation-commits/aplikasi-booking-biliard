/**
 * PANGGUNG 3D — bola 8 untuk SPL Sport, asap dan bara untuk Smokehouse.
 *
 * Keduanya digambar shader, bukan model: tidak ada berkas 3D yang harus
 * diunduh, jadi berkas ini kecil dan tanpa pustaka tambahan. Dimuat belakangan
 * lewat `lazy`, supaya tombol booking tidak pernah menunggu animasi.
 *
 * Kanvas berhenti menggambar saat keluar layar atau saat tab disembunyikan.
 * Kalau WebGL gagal, `onGagal` dipanggil dan pemanggil memakai cadangan 2D.
 */
import { useEffect, useRef } from "react";
import { useMotionValueEvent, type MotionValue } from "framer-motion";

const VERTEKS = `attribute vec2 a;varying vec2 v;void main(){v=a;gl_Position=vec4(a,0.,1.);}`;

const BOLA = `precision highp float;
varying vec2 v;uniform mat3 uPutar;uniform sampler2D uAngka;
const float R=.94;const float CAKRAM=.42;
void main(){
  float r2=dot(v,v)/(R*R);
  if(r2>1.){gl_FragColor=vec4(0.);return;}
  float tepi=1.-smoothstep(.975,1.,r2);
  vec3 n=vec3(v/R,sqrt(max(0.,1.-r2)));
  vec3 q=uPutar*n;
  float sudut=acos(clamp(q.z,-1.,1.));
  float cakram=1.-smoothstep(CAKRAM-.012,CAKRAM,sudut);
  vec2 st=q.xy/(2.*sin(CAKRAM))+.5;
  float angka=texture2D(uAngka,vec2(st.x,1.-st.y)).r*cakram;
  vec3 warna=mix(vec3(.02,.02,.024),vec3(.99,.94,.86),cakram);
  warna=mix(warna,vec3(.03),angka);
  vec3 L=normalize(vec3(-.42,.68,.72));
  float dif=max(dot(n,L),0.);
  vec3 P=reflect(vec3(0.,0.,-1.),n);
  vec2 lampu=P.xy-vec2(-.24,.52);
  float pantul=(1.-smoothstep(.2,.25,abs(lampu.x)))*(1.-smoothstep(.09,.13,abs(lampu.y)))*step(0.,P.z);
  float kilap=pow(max(dot(P,L),0.),70.);
  float pinggir=pow(1.-n.z,2.6);
  float bawah=max(-n.y,0.);
  vec3 c=warna*(.22+.9*dif);
  c+=vec3(1.,.93,.8)*pantul*.6+vec3(1.,.86,.6)*kilap*.7;
  c+=vec3(.14,.5,.33)*pinggir*bawah*2.+vec3(.94,.64,.1)*pinggir*max(n.y+.25,0.)*.75;
  gl_FragColor=vec4(c*tepi,tepi);
}`;

const ASAP = `precision mediump float;
varying vec2 v;uniform vec2 uUkuran;uniform float uWaktu;uniform float uKuat;uniform vec3 uGelap;uniform vec3 uTerang;uniform vec3 uBara;
float acak(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float bising(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(acak(i),acak(i+vec2(1.,0.)),f.x),mix(acak(i+vec2(0.,1.)),acak(i+vec2(1.,1.)),f.x),f.y);}
float awan(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*bising(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return s;}
void main(){
  vec2 uv=v*.5+.5;float rasio=uUkuran.x/uUkuran.y;
  vec2 p=vec2(uv.x*rasio,uv.y);float t=uWaktu*.07;
  vec2 q=p*2.1+vec2(sin(t)*.2,-t*2.6);
  float f=awan(q+awan(q*1.2+t)*1.1);
  float dasar=mix(.16+(1.-uv.y)*.85,1.,uKuat);
  float a=smoothstep(mix(.42,.1,uKuat),mix(.86,.5,uKuat),f)*dasar;
  vec3 warna=mix(uGelap,uTerang,f);
  vec2 g=vec2(p.x*13.,p.y*8.-uWaktu*.42);vec2 id=floor(g);vec2 h=fract(g);
  float n=acak(id);
  vec2 titik=vec2(.3+.4*acak(id+3.),.3+.4*acak(id+7.));
  float bara=step(.87,n)*smoothstep(.09,.0,length(h-titik))*(.5+.5*sin(uWaktu*3.+n*40.));
  vec3 api=uBara*bara*(1.-uv.y*.75);
  float alfa=clamp(a*.82+bara,0.,1.);
  gl_FragColor=vec4(warna*a*.82+api,alfa);
}`;

function program(gl: WebGLRenderingContext, fragmen: string) {
  const bagian = (jenis: number, teks: string) => {
    const s = gl.createShader(jenis)!;
    gl.shaderSource(s, teks);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader gagal");
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, bagian(gl.VERTEX_SHADER, VERTEKS));
  gl.attachShader(p, bagian(gl.FRAGMENT_SHADER, fragmen));
  gl.linkProgram(p);
  gl.useProgram(p);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const a = gl.getAttribLocation(p, "a");
  gl.enableVertexAttribArray(a);
  gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
  return p;
}

/** Rotasi menggelinding: sudut `s` mengelilingi sumbu yang sedikit miring. */
function putaran(s: number): Float32Array {
  // Sumbu mendatar: bola yang turun di rel terlihat benar-benar menggelinding turun.
  const [x, y, z] = [0.94, 0.24, 0.24];
  const c = Math.cos(s), n = Math.sin(s), t = 1 - c;
  return new Float32Array([
    t * x * x + c, t * x * y + z * n, t * x * z - y * n,
    t * x * y - z * n, t * y * y + c, t * y * z + x * n,
    t * x * z + y * n, t * y * z - x * n, t * z * z + c,
  ]);
}

function teksturAngka(gl: WebGLRenderingContext) {
  const tx = gl.createTexture();
  const gambar = () => {
    const k = document.createElement("canvas");
    k.width = k.height = 256;
    const c = k.getContext("2d")!;
    c.fillStyle = "#000";
    c.fillRect(0, 0, 256, 256);
    c.fillStyle = "#fff";
    c.font = '900 176px "Emoland", Georgia, serif';
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("8", 128, 136);
    gl.bindTexture(gl.TEXTURE_2D, tx);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gl.LUMINANCE, gl.UNSIGNED_BYTE, k);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };
  gambar();
  void document.fonts?.ready.then(gambar);
}

type Sifat = {
  jenis: "bola" | "asap";
  /** Warna kabut: debu kapur hijau di Sport, asap dan bara di Smokehouse. */
  tema?: "sport" | "smokehouse";
  /** Bola: sudut putar tambahan. Asap: kekentalan 0 sampai 1. */
  nilai?: MotionValue<number>;
  className?: string;
  onGagal?: () => void;
};

export default function Panggung3D({ jenis, tema = "smokehouse", nilai, className = "", onGagal }: Sifat) {
  const kanvas = useRef<HTMLCanvasElement>(null);
  const skala = useRef(nilai?.get() ?? 0);
  const minta = useRef<() => void>(() => {});

  useMotionValueEvent(nilai as MotionValue<number>, "change", (x) => {
    skala.current = x;
    minta.current();
  });

  useEffect(() => {
    const k = kanvas.current;
    if (!k) return;
    const gl = k.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: jenis === "bola", powerPreference: "low-power", preserveDrawingBuffer: true });
    if (!gl) { onGagal?.(); return; }

    let p: WebGLProgram;
    try { p = program(gl, jenis === "bola" ? BOLA : ASAP); }
    catch { onGagal?.(); return; }
    if (jenis === "bola") teksturAngka(gl);
    else {
      const sport = tema === "sport";
      gl.uniform3fv(gl.getUniformLocation(p, "uGelap"), sport ? [0.03, 0.13, 0.09] : [0.17, 0.08, 0.06]);
      gl.uniform3fv(gl.getUniformLocation(p, "uTerang"), sport ? [0.22, 0.42, 0.33] : [0.5, 0.4, 0.34]);
      gl.uniform3fv(gl.getUniformLocation(p, "uBara"), sport ? [0.75, 0.86, 0.8] : [1, 0.56, 0.13]);
    }

    const lok = (n: string) => gl.getUniformLocation(p, n);
    const uPutar = lok("uPutar"), uUkuran = lok("uUkuran"), uWaktu = lok("uWaktu"), uKuat = lok("uKuat");

    const ukur = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, jenis === "bola" ? 1.5 : 1);
      const faktor = jenis === "bola" ? 1 : 0.5;
      const l = Math.max(2, Math.round(k.clientWidth * dpr * faktor));
      const t = Math.max(2, Math.round(k.clientHeight * dpr * faktor));
      // Mengisi ulang ukuran kanvas menghapus isinya, jadi hanya kalau ukurannya berubah.
      if (l === k.width && t === k.height) return;
      k.width = l;
      k.height = t;
      gl.viewport(0, 0, l, t);
      if (uUkuran) gl.uniform2f(uUkuran, l, t);
      gambarSekarang();
    };
    let tampak = true, rAF = 0, terakhir = 0, bersih = false;
    const mulai = performance.now();
    const lukis = (kini: number) => {
      const dtk = (kini - mulai) / 1000;
      if (jenis === "bola") {
        gl.uniformMatrix3fv(uPutar, false, putaran(0.35 + dtk * 0.12 + skala.current));
      } else {
        gl.uniform1f(uWaktu, dtk);
        gl.uniform1f(uKuat, skala.current);
      }
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    function gambarSekarang() { lukis(performance.now()); }
    ukur();
    const ro = new ResizeObserver(ukur);
    ro.observe(k);

    const gambar = (kini: number) => {
      rAF = 0;
      if (!tampak || document.hidden) return;
      // Bola yang sedang tersembunyi tidak digambar. Geraknya membangunkan lagi lewat `nilai`.
      if (k.parentElement?.style.visibility === "hidden") return;
      // Asap cukup 30 fps: tidak terasa bedanya, dan HP tidak panas.
      if (jenis === "asap" && kini - terakhir < 32) { rAF = requestAnimationFrame(gambar); return; }
      // Kabut yang habis digambar sekali sampai bersih, lalu berhenti total sampai dibutuhkan.
      if (jenis === "asap" && skala.current < 0.01) {
        if (bersih) return;
        bersih = true;
      } else bersih = false;
      terakhir = kini;
      lukis(kini);
      rAF = requestAnimationFrame(gambar);
    };
    minta.current = () => { if (!rAF && tampak) rAF = requestAnimationFrame(gambar); };

    const io = new IntersectionObserver(([e]) => { tampak = e.isIntersecting; minta.current(); });
    io.observe(k);
    const padaTab = () => minta.current();
    document.addEventListener("visibilitychange", padaTab);
    const hilang = (e: Event) => { e.preventDefault(); onGagal?.(); };
    k.addEventListener("webglcontextlost", hilang);
    minta.current();

    return () => {
      cancelAnimationFrame(rAF);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", padaTab);
      k.removeEventListener("webglcontextlost", hilang);
      // Konteksnya sengaja tidak dimatikan: kanvas yang sama bisa dipasang ulang,
      // dan konteks mati membuat 3D diam-diam jatuh ke cadangan 2D.
    };
  }, [jenis]); // eslint-disable-line react-hooks/exhaustive-deps

  return <canvas ref={kanvas} aria-hidden className={`block h-full w-full ${className}`} />;
}
