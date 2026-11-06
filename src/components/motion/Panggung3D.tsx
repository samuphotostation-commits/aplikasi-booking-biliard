/**
 * PANGGUNG 3D — dunia tempat kamera berjalan, digambar shader tanpa berkas model.
 *
 *   bola   bola 8
 *   meja   meja biliar: kamera mengikuti bola menyusuri garis bidik sampai lubang
 *   lorong lorong asap dan bara Smokehouse
 *
 * Kanvas berhenti menggambar saat tab disembunyikan. Kalau WebGL gagal, `onGagal`
 * dipanggil dan pemanggil memakai latar biasa.
 */
import { useEffect, useRef } from "react";
import { useMotionValueEvent, type MotionValue } from "framer-motion";
import { bola } from "../../lib/jamPanggung";

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

const MEJA = `precision highp float;
varying vec2 v;uniform vec2 uUkuran;uniform float uMaju;uniform float uWaktu;
const float PANJANG=15.;const float JARAK_LUBANG=1.45;
float acak(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec4 BOLA_L[6];
void main(){
  BOLA_L[0]=vec4(-.2,-2.2,.058,0.);BOLA_L[1]=vec4(.23,-4.6,.058,1.);BOLA_L[2]=vec4(-.27,-6.8,.058,2.);
  BOLA_L[3]=vec4(.19,-9.2,.058,3.);BOLA_L[4]=vec4(-.21,-11.4,.058,1.);BOLA_L[5]=vec4(.26,-13.6,.058,0.);
  float rasio=uUkuran.x/uUkuran.y;
  float lebar=max(.42,rasio*.46);
  float z0=-uMaju*PANJANG;
  vec3 ro=vec3(0.,.55,z0);
  vec3 rd=normalize(vec3(v.x*rasio,v.y-.38,-1.));
  vec3 c=vec3(.012,.018,.016);
  c+=vec3(.05,.12,.09)*exp(-abs(v.y-.42)*5.);
  float tP=rd.y<0.?-ro.y/rd.y:-1.;
  float tDekat=1e5;
  if(tP>0.){
    tDekat=tP;
    vec3 p=ro+rd*tP;
    float s=abs(p.x);
    float lampu=.42+.58*exp(-pow(mod(p.z,3.)-1.5,2.)*1.1);
    float serat=acak(floor(p.xz*260.))*.05;
    vec3 kain=mix(vec3(.05,.23,.155),vec3(.085,.36,.245),lampu)+serat;
    float bayang=0.;
    for(int i=0;i<6;i++){vec2 d=p.xz-BOLA_L[i].xy;bayang=max(bayang,exp(-dot(d,d)*260.));}
    vec2 dB=p.xz-vec2(0.,z0-.54);
    bayang=max(bayang,exp(-dot(dB,dB)*150.));
    kain*=1.-.6*bayang;
    float depan=z0-.54;
    float lubangZ=-PANJANG-JARAK_LUBANG;
    if(s<.0075&&p.z<depan&&p.z>lubangZ+.1){
      float putus=step(.5,fract(p.z*5.5+uWaktu*.7));
      kain=mix(kain,vec3(.94,.64,.05),putus*.9);
    }
    if(s<lebar){c=kain;}
    else if(s<lebar+.07){c=vec3(.07,.27,.19)*(.7+.5*lampu);}
    else{
      c=mix(vec3(.13,.06,.035),vec3(.24,.11,.06),lampu);
      float titik=length(vec2(mod(p.z,.9)-.45,s-lebar-.14));
      c=mix(vec3(.94,.7,.2),c,smoothstep(.012,.018,titik));
    }
    vec2 dL=p.xz-vec2(0.,lubangZ);
    float rL=length(dL);
    c=mix(vec3(.004),c,smoothstep(.1,.115,rL));
    c=mix(vec3(.94,.64,.05),c,smoothstep(.0,.006,abs(rL-.128))*.999+.001);
    c=mix(vec3(.012,.018,.016),c,exp(-tP*.11));
  }
  for(int i=0;i<6;i++){
    vec3 pos=vec3(BOLA_L[i].x,BOLA_L[i].z,BOLA_L[i].y);
    vec3 oc=ro-pos;float b=dot(oc,rd);float d=b*b-dot(oc,oc)+BOLA_L[i].z*BOLA_L[i].z;
    if(d>0.){
      float t=-b-sqrt(d);
      if(t>0.&&t<tDekat){
        tDekat=t;
        vec3 n=normalize(ro+rd*t-pos);
        float k=BOLA_L[i].w;
        vec3 w=k<.5?vec3(.94,.64,.05):k<1.5?vec3(.6,.13,.07):k<2.5?vec3(.17,.3,.61):vec3(.48,.18,.55);
        vec3 L=normalize(vec3(-.3,.9,.4));
        float dif=max(dot(n,L),0.);
        float kil=pow(max(dot(reflect(rd,n),L),0.),60.);
        c=w*(.25+.85*dif)+vec3(1.)*kil*.7;
      }
    }
  }
  gl_FragColor=vec4(c,1.);
}`;

const LORONG = `precision highp float;
varying vec2 v;uniform vec2 uUkuran;uniform float uMaju;uniform float uWaktu;
float acak(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float bising(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(acak(i),acak(i+vec2(1.,0.)),f.x),mix(acak(i+vec2(0.,1.)),acak(i+vec2(1.,1.)),f.x),f.y);}
float awan(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*bising(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return s;}
void main(){
  vec2 c=v;c.x*=uUkuran.x/uUkuran.y;
  c.y+=.12;
  float r=length(c)+.001;float a=atan(c.y,c.x);
  float z=.42/r+uMaju*11.+uWaktu*.09;
  vec2 q=vec2(cos(a),sin(a))*1.5;
  float f=awan(q+vec2(z*.8,-z*.5));
  f=awan(q*1.1+vec2(f*1.4+z*.5,z*.4));
  float dalam=smoothstep(1.3,.08,r);
  vec3 w=mix(vec3(.075,.022,.016),vec3(.42,.14,.07),f);
  w+=vec3(.46,.38,.32)*smoothstep(.5,.82,f)*(.3+.5*dalam);
  w+=vec3(1.,.5,.12)*pow(dalam,3.)*.34;
  vec2 g=vec2(a*5.,z*3.2);vec2 id=floor(g);vec2 h=fract(g);
  float n=acak(id);
  float bara=step(.82,n)*smoothstep(.08,.0,abs(h.x-.5))*smoothstep(.0,.3,h.y)*smoothstep(.75,.3,h.y);
  w+=vec3(1.,.56,.13)*bara*smoothstep(.1,.6,r)*(.6+.4*sin(uWaktu*3.+n*40.));
  w*=1.-smoothstep(.75,1.7,r)*.55;
  gl_FragColor=vec4(w,1.);
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

/** Rotasi sudut `s` mengelilingi sumbu: arah gelindingnya mengikuti arah jalannya. */
function putaran(s: number, [x, y, z]: readonly [number, number, number]): Float32Array {
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
  jenis: "bola" | "meja" | "lorong";
  /** Bola: sudut putar. Meja dan lorong: kemajuan kamera 0 sampai 1. */
  nilai: MotionValue<number>;
  className?: string;
  onGagal?: () => void;
};

export default function Panggung3D({ jenis, nilai, className = "", onGagal }: Sifat) {
  const kanvas = useRef<HTMLCanvasElement>(null);
  const skala = useRef(nilai.get());
  const minta = useRef<() => void>(() => {});

  useMotionValueEvent(nilai, "change", (x) => {
    skala.current = x;
    minta.current();
  });

  useEffect(() => {
    const k = kanvas.current;
    if (!k) return;
    const adaBola = jenis === "bola";
    const gl = k.getContext("webgl", { alpha: adaBola, premultipliedAlpha: true, antialias: adaBola, powerPreference: "low-power" });
    if (!gl) { onGagal?.(); return; }

    let p: WebGLProgram;
    try { p = program(gl, adaBola ? BOLA : jenis === "meja" ? MEJA : LORONG); }
    catch { onGagal?.(); return; }
    if (adaBola) teksturAngka(gl);

    const lok = (n: string) => gl.getUniformLocation(p, n);
    const uPutar = lok("uPutar"), uUkuran = lok("uUkuran"), uWaktu = lok("uWaktu"), uMaju = lok("uMaju");

    const ukur = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, adaBola ? 2 : 1.25);
      const faktor = adaBola ? 1 : 0.75;
      k.width = Math.max(2, Math.round(k.clientWidth * dpr * faktor));
      k.height = Math.max(2, Math.round(k.clientHeight * dpr * faktor));
      gl.viewport(0, 0, k.width, k.height);
      if (uUkuran) gl.uniform2f(uUkuran, k.width, k.height);
    };
    ukur();
    const ro = new ResizeObserver(ukur);
    ro.observe(k);

    let rAF = 0;
    const mulai = performance.now();
    const gambar = (kini: number) => {
      rAF = 0;
      if (document.hidden) return;
      const dtk = (kini - mulai) / 1000;
      if (adaBola) gl.uniformMatrix3fv(uPutar, false, putaran(skala.current, bola.sumbu));
      else { gl.uniform1f(uMaju, skala.current); gl.uniform1f(uWaktu, dtk); }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      rAF = requestAnimationFrame(gambar);
    };
    minta.current = () => { if (!rAF) rAF = requestAnimationFrame(gambar); };

    const padaTab = () => minta.current();
    document.addEventListener("visibilitychange", padaTab);
    const hilang = (e: Event) => { e.preventDefault(); onGagal?.(); };
    k.addEventListener("webglcontextlost", hilang);
    minta.current();

    return () => {
      cancelAnimationFrame(rAF);
      ro.disconnect();
      document.removeEventListener("visibilitychange", padaTab);
      k.removeEventListener("webglcontextlost", hilang);
      // Konteks tidak dimatikan: kanvas yang sama bisa dipasang ulang.
    };
  }, [jenis]); // eslint-disable-line react-hooks/exhaustive-deps

  return <canvas ref={kanvas} aria-hidden className={`block h-full w-full ${className}`} />;
}
