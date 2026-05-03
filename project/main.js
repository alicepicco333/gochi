
// ---------- Helper per la moltiplicazione di matrici ----------
// Moltiplica due matrici 4x4 in ordine column-major (standard per WebGL)
function mat4Mul(a, b) {
  // Moltiplica due matrici 4x4 (column-major)
  const out = new Float32Array(16);
  for (let col = 0; col < 4; ++col) {
    for (let row = 0; row < 4; ++row) {
      let sum = 0.0;
      for (let k = 0; k < 4; ++k) {
        sum += a[row + k*4] * b[k + col*4];
      }
      out[row + col*4] = sum;
    }
  }
  return out;
}
// ---------- Helper per la matrice identità ----------
// Restituisce una matrice identità 4x4 (nessuna trasformazione)
function mat4Identity() {
  return new Float32Array([
    1,0,0,0,
    0,1,0,0,
    0,0,1,0,
    0,0,0,1
  ]);
}
// ---------- Helper per il ridimensionamento del canvas ----------
// Ridimensiona il canvas per adattarsi allo schermo, tenendo conto del device pixel ratio
// Garantisce un rendering nitido su display ad alta densità (Retina, ecc.)
function resizeCanvasToDisplaySize() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const w = Math.floor(canvas.clientWidth * dpr);
  const h = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  }
}
// ====== Tamagotchi WebGL minimale (senza librerie) ======

// ====== Riferimenti agli elementi del DOM ======
// Recupera i riferimenti agli elementi HTML per l'interfaccia
const canvas = document.getElementById("webglcanvas");
const feedBtn = document.getElementById("feedBtn");
const hungerBar = document.getElementById("hungerBar");  // Elemento barra di avanzamento
const moodBar = document.getElementById("moodBar");      // Elemento barra di avanzamento
const sizeVal = document.getElementById("sizeVal");
const timeVal = document.getElementById("timeVal");

// ====== Contesto WebGL ======
// Tenta prima WebGL2, poi fallback a WebGL1 per maggiore compatibilità
const gl =
  canvas.getContext("webgl2", { antialias: true }) ||
  canvas.getContext("webgl", { antialias: true }) ||
  canvas.getContext("experimental-webgl");

// Impedisce i gesti di zoom del browser (pizzico trackpad / ctrl+rotella) sull'app
window.addEventListener("wheel", (e) => {
  if (e.ctrlKey) e.preventDefault();
}, { passive: false });

window.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
window.addEventListener("gesturechange", (e) => e.preventDefault(), { passive: false });
window.addEventListener("gestureend", (e) => e.preventDefault(), { passive: false });



// ---------- Funzioni di trasformazione matriciale ----------
// Queste funzioni creano matrici di trasformazione 4x4 per la grafica 3D

// Crea una matrice di traslazione (sposta oggetti nello spazio 3D)
function mat4Translate(tx, ty, tz) {
  const m = mat4Identity();
  m[12] = tx; m[13] = ty; m[14] = tz;
  return m;
}

// Crea una matrice di scala (ridimensiona oggetti)
function mat4Scale(sx, sy, sz) {
  const m = mat4Identity();
  m[0] = sx; m[5] = sy; m[10] = sz;
  return m;
}

// Crea una matrice di rotazione attorno all'asse Y (rotazione sinistra/destra)
function mat4RotateY(rad) {
  const c = Math.cos(rad), s = Math.sin(rad);
  return new Float32Array([
     c,0,-s,0,
     0,1, 0,0,
     s,0, c,0,
     0,0, 0,1
  ]);
}

// Crea una matrice di rotazione attorno all'asse X (inclinazione su/giù)
function mat4RotateX(rad) {
  const c = Math.cos(rad), s = Math.sin(rad);
  return new Float32Array([
    1,0, 0,0,
    0,c, s,0,
    0,-s,c,0,
    0,0, 0,1
  ]);
}

// Crea una matrice di proiezione prospettica (effetto profondità 3D)
// fovy: campo visivo in radianti, aspect: rapporto larghezza/altezza
function mat4Perspective(fovy, aspect, near, far) {
  const f = 1.0 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = (2 * far * near) * nf;
  return out;
}

// ---------- Funzioni matematiche vettoriali ----------
// Usate per i calcoli della camera "look at"

// Normalizza un vettore 3D a lunghezza unitaria
function vec3Normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0]/len, v[1]/len, v[2]/len];
}

function vec3Cross(a, b) {
  return [
    a[1]*b[2] - a[2]*b[1],
    a[2]*b[0] - a[0]*b[2],
    a[0]*b[1] - a[1]*b[0]
  ];
}

function vec3Sub(a, b) {
  return [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
}

// Crea una matrice vista con la camera in 'eye' puntata verso 'center'
function mat4LookAt(eye, center, up) {
  const f = vec3Normalize(vec3Sub(center, eye));
  const s = vec3Normalize(vec3Cross(f, up));
  const u = vec3Cross(s, f);

  const out = mat4Identity();
  out[0] = s[0]; out[4] = s[1]; out[8]  = s[2];
  out[1] = u[0]; out[5] = u[1]; out[9]  = u[2];
  out[2] = -f[0];out[6] = -f[1];out[10] = -f[2];

  out[12] = -(s[0]*eye[0] + s[1]*eye[1] + s[2]*eye[2]);
  out[13] = -(u[0]*eye[0] + u[1]*eye[1] + u[2]*eye[2]);
  out[14] =  (f[0]*eye[0] + f[1]*eye[1] + f[2]*eye[2]);  // prodotto scalare(f, eye), senza negazione

  return out;
}

// Trasforma un punto 3D con una matrice 4x4 (column-major)
function mat4TransformPoint(m, p) {
  const x = p[0], y = p[1], z = p[2];
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14]
  ];
}

// ---------- Funzioni di utilità ----------
function clamp01(x) { return Math.max(0, Math.min(1, x)); }  // Limita il valore all'intervallo 0-1
function lerp(a,b,t){ return a + (b-a)*t; }  // Interpolazione lineare tra a e b

// =============================================================================
// VERTEX SHADER (VS) - Eseguito per ogni vertice
// =============================================================================
// Trasforma le posizioni 3D in coordinate schermo e passa i dati al fragment shader
// Attributi: aPos (posizione), aNor (normale), aCol (colore vertice da Blender)
// Uniform: uMVP (matrice trasformazione combinata), uModel (matrice modello per illuminazione)
// =============================================================================
const VS = `
attribute vec3 aPos;
attribute vec3 aNor;
attribute vec3 aCol;

uniform mat4 uMVP;
uniform mat4 uModel;

varying vec3 vN;
varying vec4 vPos;
varying vec3 vCol;

void main() {
  vN = mat3(uModel) * aNor;
  vPos = uModel * vec4(aPos, 1.0);
  vCol = aCol;
  // Usa proiezione*vista*modello completa (uMVP) per posizionare i vertici nel clip space
  gl_Position = uMVP * vec4(aPos, 1.0);
}
`;

// =============================================================================
// FRAGMENT SHADER (FS) - Eseguito per ogni pixel
// =============================================================================
// Calcola il colore finale del pixel usando:
// - Colori vertice (da Blender sculpt paint)
// - Illuminazione direzionale (diffuse semplice)
// - Tinte umore (triste rende i colori più freddi, fame aggiunge tinta rossa)
// =============================================================================
const FS = `
precision mediump float;

varying vec3 vN;
varying vec4 vPos;
varying vec3 vCol;

uniform float uSad;      // 0..1
uniform float uHunger;   // 0..1
uniform vec3 uLightPos;
uniform vec3 uLightPos2;
uniform vec3 uLightColor;
uniform vec3 uLightColor2;
uniform vec3 uAmbientColor;
uniform vec3 uFillLightColor;

void main() {
  vec3 n = normalize(vN);
  
  // Due luci puntuali: sole + luna
  vec3 lightDir = normalize(uLightPos - vPos.xyz);
  vec3 lightDir2 = normalize(uLightPos2 - vPos.xyz);
  float diffuse = max(0.0, dot(n, lightDir));
  float diffuse2 = max(0.0, dot(n, lightDir2));
  float fillDiffuse = max(0.0, dot(n, normalize(vec3(0.0, 1.0, 0.35))));
  vec3 light = uAmbientColor + (uLightColor * diffuse) + (uLightColor2 * diffuse2) + (uFillLightColor * fillDiffuse);
  
  // Usa il colore vertice del materiale
  vec3 col = vCol;
  col *= light;
  
  // Effetti umore: triste => più freddo/scuro, fame => più rossastro
  vec3 sadTint = mix(vec3(1.0), vec3(0.75, 0.85, 1.15), uSad);
  vec3 hungerTint = mix(vec3(1.0), vec3(2.4, 0.7, 0.7), uHunger);
  
  col *= sadTint;
  col *= hungerTint;
  
  // Se molto triste, aggiunge leggera desaturazione
  float gray = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(gray), uSad * 0.35);
  
  gl_FragColor = vec4(col, 1.0);
}
`;

// =============================================================================
// SHADER CON TEXTURE - Usati per il piano dell'erba
// =============================================================================
// Coppia di shader separata per il rendering di oggetti texturizzati (erba)
// Usa coordinate UV e campiona da una texture invece dei colori vertice
const VS_TEX = `
attribute vec3 aPos;
attribute vec3 aNor;
attribute vec2 aUV;

uniform mat4 uMVP;
uniform mat4 uModel;

varying vec3 vN;
varying vec2 vUV;
varying vec3 vWorldPos;

void main() {
  vN = mat3(uModel) * aNor;
  vUV = aUV;
  vWorldPos = (uModel * vec4(aPos, 1.0)).xyz;
  gl_Position = uMVP * vec4(aPos, 1.0);
}
`;

const FS_TEX = `
precision mediump float;

varying vec3 vN;
varying vec2 vUV;
varying vec3 vWorldPos;

uniform vec3 uLightPos;
uniform vec3 uLightPos2;
uniform vec3 uLightColor;
uniform vec3 uLightColor2;
uniform vec3 uAmbientColor;
uniform vec3 uFillLightColor;

uniform sampler2D uTexture;

void main() {
  vec3 n = normalize(vN);
  
  // Due luci puntuali: sole + luna
  vec3 lightDir = normalize(uLightPos - vWorldPos);
  vec3 lightDir2 = normalize(uLightPos2 - vWorldPos);
  float diffuse = max(0.0, dot(n, lightDir));
  float diffuse2 = max(0.0, dot(n, lightDir2));
  float fillDiffuse = max(0.0, dot(n, normalize(vec3(0.0, 1.0, 0.35))));
  vec3 light = uAmbientColor + (uLightColor * diffuse) + (uLightColor2 * diffuse2) + (uFillLightColor * fillDiffuse);
  
  // Campiona la texture
  vec4 texColor = texture2D(uTexture, vUV);
  
  // Test alfa per i fili d'erba
  if (texColor.a < 0.5) discard;
  
  vec3 col = texColor.rgb * light;
  
  gl_FragColor = vec4(col, texColor.a);
}
`;

  // Shader sole: sfera emissiva usata come fonte di luce visibile
  const VS_SUN = `
  attribute vec3 aPos;
  uniform mat4 uMVP;
  void main() {
    gl_Position = uMVP * vec4(aPos, 1.0);
  }
  `;

  const FS_SUN = `
  precision mediump float;
  uniform vec3 uSunColor;
  void main() {
    gl_FragColor = vec4(uSunColor, 1.0);
  }
  `;

// =============================================================================
// CREAZIONE DEI PROGRAMMI SHADER
// =============================================================================
// USO WEBGL-UTILS: Se webgl-utils.js è caricato, usa createProgramFromSources()
// Questa funzione helper compila i vertex e fragment shader e li collega.
// Fallback alla compilazione manuale se webgl-utils non è disponibile.
// =============================================================================
let program = null;
if (window.webglUtils && webglUtils.createProgramFromSources) {
  // >>> WEBGL-UTILS: createProgramFromSources(gl, [vertexShaderSource, fragmentShaderSource])
  // Compila entrambi gli shader e li collega in un programma in un'unica chiamata
  program = webglUtils.createProgramFromSources(gl, [VS, FS]);
  if (!program) throw new Error('Failed to create program via webglUtils');
} else {
  function compileShader(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const msg = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      console.error("Shader compile error:", msg);
      throw new Error(msg);
    }
    return sh;
  }
  function createProgram(vsSrc, fsSrc) {
    const vs = compileShader(gl.VERTEX_SHADER, vsSrc);
    const fs = compileShader(gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const msg = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error(msg);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return prog;
  }
  program = createProgram(VS, FS);
}
gl.useProgram(program);

// Crea il programma shader con texture
let texProgram = null;
{
  function compileShader(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const msg = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      console.error("Shader compile error:", msg);
      throw new Error(msg);
    }
    return sh;
  }
  function createProg(vsSrc, fsSrc) {
    const vs = compileShader(gl.VERTEX_SHADER, vsSrc);
    const fs = compileShader(gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const msg = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error(msg);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return prog;
  }
  texProgram = createProg(VS_TEX, FS_TEX);
}

// Crea il programma shader del sole
let sunProgram = null;
{
  function compileShader(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const msg = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      console.error("Shader compile error:", msg);
      throw new Error(msg);
    }
    return sh;
  }
  function createProg(vsSrc, fsSrc) {
    const vs = compileShader(gl.VERTEX_SHADER, vsSrc);
    const fs = compileShader(gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const msg = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error(msg);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return prog;
  }
  sunProgram = createProg(VS_SUN, FS_SUN);
}

// =============================================================================
// HELPER PER IL CARICAMENTO TEXTURE
// =============================================================================
// Carica un'immagine e crea una texture WebGL da essa
// Restituisce una Promise che si risolve con l'oggetto texture
function loadTexture(url) {
  return new Promise((resolve, reject) => {
    const texture = gl.createTexture();
    const image = new Image();
    image.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);
      console.log("Texture loaded:", url, image.width, "x", image.height);
      resolve(texture);
    };
    image.onerror = () => reject(new Error("Failed to load texture: " + url));
    image.src = url;
  });
}

// =============================================================================
// CARICATORI FILE OBJ/MTL
// =============================================================================
// Queste funzioni analizzano i file OBJ e MTL Wavefront esportati da Blender

// Recupera un file di testo da URL
async function loadText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load: ${url}`);
  return await res.text();
}

// Analizza il file MTL (Materiale) per estrarre i colori diffusi (Kd) per ogni materiale
// Restituisce un oggetto che mappa i nomi dei materiali alle loro proprietà
function parseMTL(mtlText) {
  const materials = {};
  let currentMat = null;

  const lines = mtlText.split("\n");
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;

    const parts = line.split(/\s+/);
    const tag = parts[0];

    if (tag === "newmtl") {
      currentMat = parts[1];
      materials[currentMat] = { kd: [0.8, 0.8, 0.8] }; // grigio predefinito
    } else if (tag === "Kd" && currentMat) {
      materials[currentMat].kd = [+parts[1], +parts[2], +parts[3]];
    }
  }
  return materials;
}

// =============================================================================
// PARSER OBJ
// =============================================================================
// Analizza il formato OBJ Wavefront in array pronti per WebGL
// Supporta: v (vertici con colori opzionali), vt (UV), vn (normali), f (facce)
// Gestisce anche usemtl per il cambio materiale
// Restituisce: { pos, uv, nor, col, vertCount } - tutti come Float32Arrays
function parseOBJ(objText, materials = {}) {
  const positions = [];  // Ogni voce: [x, y, z]
  const vertColors = []; // Ogni voce: [r, g, b] o null se assenza colore vertice
  const uvs = [];
  const normals = [];

  const outPos = [];
  const outUV = [];
  const outNor = [];
  const outCol = [];

  // Colore materiale predefinito (grigio)
  let currentColor = [0.8, 0.8, 0.8];

  const lines = objText.split("\n");
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;

    const parts = line.split(/\s+/);
    const tag = parts[0];

    if (tag === "v") {
      positions.push([+parts[1], +parts[2], +parts[3]]);
      // Controlla la presenza di colori vertice (v x y z r g b)
      if (parts.length >= 7) {
        vertColors.push([+parts[4], +parts[5], +parts[6]]);
      } else {
        vertColors.push(null); // Nessun colore vertice per questo vertice
      }
    } else if (tag === "vt") {
      uvs.push([+parts[1], +parts[2]]);
    } else if (tag === "vn") {
      normals.push([+parts[1], +parts[2], +parts[3]]);
    } else if (tag === "usemtl") {
      const matName = parts[1];
      if (materials[matName]) {
        currentColor = materials[matName].kd;
      } else {
        currentColor = [0.8, 0.8, 0.8];
      }
    } else if (tag === "f") {
      // triangolazione a ventaglio: f a b c d => (a b c) (a c d)
      const verts = parts.slice(1).map(v => v.split("/"));
      for (let i = 1; i + 1 < verts.length; i++) {
        const tri = [verts[0], verts[i], verts[i+1]];
        for (const v of tri) {
          const pi = parseIndex(v[0], positions.length);
          const ti = v[1] ? parseIndex(v[1], uvs.length) : -1;
          const ni = v[2] ? parseIndex(v[2], normals.length) : -1;

          const p = positions[pi];
          outPos.push(p[0], p[1], p[2]);

          if (ti >= 0) {
            const t = uvs[ti];
            // L'origine vt OBJ è spesso in basso a sinistra; WebGL di solito richiede Y invertita
            outUV.push(t[0], 1.0 - t[1]);
          } else {
            outUV.push(0, 0);
          }

          if (ni >= 0) {
            const n = normals[ni];
            outNor.push(n[0], n[1], n[2]);
          } else {
            outNor.push(0, 1, 0);
          }

          // Usa il colore vertice se disponibile, altrimenti ricade sul colore del materiale
          const vc = vertColors[pi];
          if (vc) {
            outCol.push(vc[0], vc[1], vc[2]);
          } else {
            outCol.push(currentColor[0], currentColor[1], currentColor[2]);
          }
        }
      }
    }
  }

  return {
    pos: new Float32Array(outPos),
    uv: new Float32Array(outUV),
    nor: new Float32Array(outNor),
    col: new Float32Array(outCol),
    vertCount: outPos.length / 3
  };

  function parseIndex(str, len) {
    // OBJ permette indici negativi
    const idx = parseInt(str, 10);
    return idx >= 0 ? (idx - 1) : (len + idx);
  }
}

// =============================================================================
// CREAZIONE DEI BUFFER WEBGL
// =============================================================================
// Crea buffer GPU per memorizzare i dati dei vertici (posizioni, normali, colori, UV)

// Crea un buffer WebGL da un typed array
// USO WEBGL-UTILS: Se disponibile, usa createBufferFromTypedArray()
// Altrimenti ricade sulla creazione manuale del buffer
function createArrayBuffer(data) {
  if (window.webglUtils && webglUtils.createBufferFromTypedArray) {
    // >>> WEBGL-UTILS: createBufferFromTypedArray(gl, typedArray, type, usage)
    // Crea e riempie un buffer in un'unica chiamata
    return webglUtils.createBufferFromTypedArray(gl, data, gl.ARRAY_BUFFER, gl.STATIC_DRAW);
  }
  // Fallback: creazione manuale del buffer
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return buf;
}

// Collega un buffer a un attributo shader (connette i dati alla variabile shader)
function bindAttrib(name, size, buffer) {
  const loc = gl.getAttribLocation(program, name);
  if (loc < 0) {
    console.warn("Attribute", name, "not found in shader");
    return;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  return loc;
}

// =============================================================================
// POSIZIONI DEGLI UNIFORM SHADER
// =============================================================================
// Ottieni riferimenti alle variabili shader per aggiornarle ogni frame
const uMVP = gl.getUniformLocation(program, "uMVP");     // Matrice Model-View-Projection
const uModel = gl.getUniformLocation(program, "uModel"); // Matrice modello (per illuminazione)
const uSad = gl.getUniformLocation(program, "uSad");     // Livello tristezza 0-1
const uHunger = gl.getUniformLocation(program, "uHunger"); // Livello fame 0-1
const uLightPos = gl.getUniformLocation(program, "uLightPos"); // Posizione luce sole
const uLightPos2 = gl.getUniformLocation(program, "uLightPos2"); // Posizione luce luna
const uLightColor = gl.getUniformLocation(program, "uLightColor");
const uLightColor2 = gl.getUniformLocation(program, "uLightColor2");
const uAmbientColor = gl.getUniformLocation(program, "uAmbientColor");
const uFillLightColor = gl.getUniformLocation(program, "uFillLightColor");

const DAY_DURATION_SEC = 60.0;
const ORBIT_RADIUS_X = 7.0;
const ORBIT_RADIUS_Y = 5.5;
const ORBIT_CENTER_Y = 0.2;
const CLOCK_START_HOUR = 8.0;

// =============================================================================
// GAME STATE
// =============================================================================
// Central state object tracking all game variables
const state = {
  // seconds
  t: 0,
  lastT: 0,

  // Creature stats (0..1)
  // continuous hunger 0..1 (kept for shading); use `hungerInt` as primary
  hunger: 0.0,
  hungerInt: 0,   // integer hunger counter, increments every 5s, max 20
  nextHungerAtMs: Date.now() + 5000, // next wall-clock ms when hunger should increment
  sad: 0.0,
  moodLevel: 0,   // integer mood: 0=Happy .. 20=Sad
  nextMoodAtMs: Date.now() + 5000, // next wall-clock ms when mood worsens

  // Size grows when fed
  size: 1.0,
  targetSize: 1.0,

  // Touch-driven rotation
  rotY: 0,
  rotX: 0.2,

  // Camera position
  camX: 0,
  camY: 0,
  camZ: 13.3,

  autoRotateEnabled: false,
};

// Tune these (all are “per second” rates)
const RATES = {
  hungerPerSec: 0.03,     // 0 -> 1 in ~33s
  hungerDecayOnFeed: 0.35,
  sizeGainOnFeed: 0.08,   // add to target size
  maxSize: 2.2,

  sadFromRotatePerSec: 0.75, // how strongly rotation speed creates sadness
  sadRecoverPerSec: 0.25,    // sadness decays when calm

  sizeSmoothPerSec: 3.0,  // lerp speed
};

// =============================================================================
// TOUCH CONTROLS
// =============================================================================
// Allows rotating the scene by dragging on the canvas (mobile-friendly)
let touching = false;
let lastTouchX = 0;
let lastTouchY = 0;

// Touch start - begin tracking
canvas.addEventListener("touchstart", (e) => {
  // ignore touches that start on the feed button area (button is pointer-events auto)
  touching = true;
  const t = e.touches[0];
  lastTouchX = t.clientX;
  lastTouchY = t.clientY;
}, { passive: false });

// Touch move - update rotation based on drag distance
canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  if (!touching) return;

  const t = e.touches[0];
  const dx = t.clientX - lastTouchX;
  const dy = t.clientY - lastTouchY;
  lastTouchX = t.clientX;
  lastTouchY = t.clientY;

  // rotation sensitivity (pixels -> radians)
  const s = 0.006;
  const prevY = state.rotY;
  const prevX = state.rotX;

  state.rotY += dx * s;
  state.rotX += dy * s;

  // clamp X so it doesn’t flip
  state.rotX = Math.max(-0.6, Math.min(0.9, state.rotX));

  // accumulate absolute rotation delta to compute "rotation speed" per second
  const drot = Math.abs(state.rotY - prevY) + Math.abs(state.rotX - prevX);
  state.rotSpeedAccum += drot; // later divided by dt
}, { passive: false });

// Touch end - stop tracking
canvas.addEventListener("touchend", () => { touching = false; });
canvas.addEventListener("touchcancel", () => { touching = false; });

// =============================================================================
// CONTROLLI TASTIERA
// =============================================================================
// Permette di ruotare la scena con i tasti freccia
const KEYBOARD_ROTATION_SPEED = 0.05; // radianti per pressione tasto

document.addEventListener("keydown", (e) => {
  switch (e.key) {
    case "ArrowLeft":
      state.rotY -= KEYBOARD_ROTATION_SPEED;
      e.preventDefault();
      break;
    case "ArrowRight":
      state.rotY += KEYBOARD_ROTATION_SPEED;
      e.preventDefault();
      break;
    case "ArrowUp":
      state.rotX -= KEYBOARD_ROTATION_SPEED;
      state.rotX = Math.max(-0.6, Math.min(0.9, state.rotX)); // limitazione
      e.preventDefault();
      break;
    case "ArrowDown":
      state.rotX += KEYBOARD_ROTATION_SPEED;
      state.rotX = Math.max(-0.6, Math.min(0.9, state.rotX)); // limitazione
      e.preventDefault();
      break;
  }
});

// =============================================================================
// GESTORI DEI PULSANTI
// =============================================================================

// Pulsante Nutri - riduce la fame di 1 (può diventare negativa per "accumulare" cibo)
feedBtn.addEventListener("click", () => {
  // Nutrire riduce la fame intera di 1 (può diventare negativa per accumulare cibo)
  state.hungerInt = state.hungerInt - 1;
  state.hunger = clamp01(state.hungerInt / 20);
});

// Pulsante Conforta - ripristina un passo dell'umore per clic
const cheerBtn = document.getElementById("cheerBtn");
cheerBtn.addEventListener("click", () => {
  state.moodLevel = Math.max(0, state.moodLevel - 1);
  // (stesso 1-passo-per-clic del pulsante Nutri)
  state.nextMoodAtMs = Date.now() + 5000;
});

// =============================================================================
// CONTROLLI DAT.GUI
// =============================================================================
// >>> USO LIBRERIA DAT.GUI
// dat.GUI crea un pannello di controllo flottante in alto a destra
// Permette di regolare rotazione e auto-rotazione in tempo reale
// La libreria è caricata da dat.gui.js in index.html
// =============================================================================
if (window.dat && dat.GUI) {
  // Crea un nuovo pannello GUI
  const gui = new dat.GUI();
  
  // Oggetto valori di controllo (dat.GUI legge/scrive qui)
  const controls = {
    rotY: state.rotY,
    rotX: state.rotX,
    autoRotate: state.autoRotateEnabled,
    camX: state.camX,
    camY: state.camY,
    camZ: state.camZ,
  };

  // >>> gui.add(oggetto, proprietà, min, max) - Crea un controllo slider
  // .step(0.01) - Imposta l'incremento dello slider
  // .name('Etichetta') - Nome visualizzato nella GUI
  // .onChange(callback) - Chiamato quando il valore cambia
  gui.add(controls, 'rotY', -Math.PI * 2, Math.PI * 2).step(0.01).name('Rotate Y').onChange(v => { state.rotY = v; });
  gui.add(controls, 'rotX', -0.6, 0.9).step(0.01).name('Rotate X').onChange(v => { state.rotX = v; });
  
  // >>> gui.add(oggetto, proprietàBooleana) - Crea una casella di controllo
  gui.add(controls, 'autoRotate').name('Auto-rotate').onChange(v => { state.autoRotateEnabled = !!v; });

  // Controlli posizione camera
  gui.add(controls, 'camX', -10, 10).step(0.1).name('Cam X').onChange(v => { state.camX = v; });
  gui.add(controls, 'camY', -10, 10).step(0.1).name('Cam Y').onChange(v => { state.camY = v; });
  gui.add(controls, 'camZ', 1, 20).step(0.1).name('Cam Z').onChange(v => { state.camZ = v; });
}

// =============================================================================
// CARICAMENTO ASSET E INIZIALIZZAZIONE
// =============================================================================
// Variabili globali per le mesh caricate e i buffer GPU
let mesh = null;  // Mesh principale della creatura
let bufPos = null, bufUV = null, bufNor = null, bufCol = null;  // Buffer creatura

// Mesh erba (caricata da grass.obj)
let grassMesh = null;
let grassBufPos = null, grassBufNor = null, grassBufCol = null, grassBufUV = null;
let grassTexture = null;  // Texture erba (grass.jpg)

// Pianeta distante (sfera primitiva con texture)
let planetBufPos = null, planetBufNor = null, planetBufUV = null;
let planetVertCount = 0;
let planetTexture = null;

// Sfera primitiva del sole (generata proceduralmente)
let sunBufPos = null;
let sunVertCount = 0;
let moonBufPos = null;
let moonVertCount = 0;

function createSphereMesh(radius, latBands, lonBands) {
  const positions = [];

  for (let lat = 0; lat < latBands; lat++) {
    const t0 = (lat / latBands) * Math.PI;
    const t1 = ((lat + 1) / latBands) * Math.PI;

    for (let lon = 0; lon < lonBands; lon++) {
      const p0 = (lon / lonBands) * Math.PI * 2;
      const p1 = ((lon + 1) / lonBands) * Math.PI * 2;

      const a = sph(radius, t0, p0);
      const b = sph(radius, t1, p0);
      const c = sph(radius, t1, p1);
      const d = sph(radius, t0, p1);

      positions.push(
        a[0], a[1], a[2],
        b[0], b[1], b[2],
        c[0], c[1], c[2],
        a[0], a[1], a[2],
        c[0], c[1], c[2],
        d[0], d[1], d[2]
      );
    }
  }

  return {
    pos: new Float32Array(positions),
    vertCount: positions.length / 3
  };

  function sph(r, theta, phi) {
    const sinT = Math.sin(theta);
    return [
      r * sinT * Math.cos(phi),
      r * Math.cos(theta),
      r * sinT * Math.sin(phi)
    ];
  }
}

// Crea una sfera con posizione, normale e UV per il rendering texturizzato
function createTexturedSphereMesh(radius, latBands, lonBands) {
  const positions = [];
  const normals = [];
  const uvs = [];

  for (let lat = 0; lat < latBands; lat++) {
    const t0 = (lat / latBands) * Math.PI;
    const t1 = ((lat + 1) / latBands) * Math.PI;
    const v0 = 1.0 - (lat / latBands);
    const v1 = 1.0 - ((lat + 1) / latBands);

    for (let lon = 0; lon < lonBands; lon++) {
      const p0 = (lon / lonBands) * Math.PI * 2;
      const p1 = ((lon + 1) / lonBands) * Math.PI * 2;
      const u0 = lon / lonBands;
      const u1 = (lon + 1) / lonBands;

      const a = sph(radius, t0, p0);
      const b = sph(radius, t1, p0);
      const c = sph(radius, t1, p1);
      const d = sph(radius, t0, p1);

      pushVertex(a, u0, v0);
      pushVertex(b, u0, v1);
      pushVertex(c, u1, v1);
      pushVertex(a, u0, v0);
      pushVertex(c, u1, v1);
      pushVertex(d, u1, v0);
    }
  }

  return {
    pos: new Float32Array(positions),
    nor: new Float32Array(normals),
    uv: new Float32Array(uvs),
    vertCount: positions.length / 3
  };

  function sph(r, theta, phi) {
    const sinT = Math.sin(theta);
    return [
      r * sinT * Math.cos(phi),
      r * Math.cos(theta),
      r * sinT * Math.sin(phi)
    ];
  }

  function pushVertex(p, u, v) {
    positions.push(p[0], p[1], p[2]);
    const invLen = 1.0 / (Math.hypot(p[0], p[1], p[2]) || 1.0);
    normals.push(p[0] * invLen, p[1] * invLen, p[2] * invLen);
    uvs.push(u, v);
  }
}

// Async initialization function - loads all assets and starts render loop
(async function init() {
  try {
    // Load MTL file first for material colors
    const mtlText = await loadText("assets/creature.mtl");
    const materials = parseMTL(mtlText);
    const objText = await loadText("assets/creature.obj");
    mesh = parseOBJ(objText, materials);
    window.__OBJ_BOUNDS__ = computeBounds(mesh.pos);

    bufPos = createArrayBuffer(mesh.pos);
    bufUV = createArrayBuffer(mesh.uv);
    bufNor = createArrayBuffer(mesh.nor);
    bufCol = createArrayBuffer(mesh.col);

    // Carica il modello dell'erba
    const grassMtlText = await loadText("assets/grass.mtl");
    const grassMaterials = parseMTL(grassMtlText);
    for (const matName in grassMaterials) {
      grassMaterials[matName].kd = [0.2, 0.6, 0.15];
    }
    const grassObjText = await loadText("assets/grass.obj");
    grassMesh = parseOBJ(grassObjText, grassMaterials);

    grassBufPos = createArrayBuffer(grassMesh.pos);
    grassBufNor = createArrayBuffer(grassMesh.nor);
    grassBufCol = createArrayBuffer(grassMesh.col);
    grassBufUV = createArrayBuffer(grassMesh.uv);

    grassTexture = await loadTexture("assets/grass.jpg");

    // Carica la texture del pianeta e genera la sua sfera texturizzata
    planetTexture = await loadTexture("assets/pianetarosmarino.jpeg");
    const planetMesh = createTexturedSphereMesh(1.0, 24, 24);
    planetBufPos = createArrayBuffer(planetMesh.pos);
    planetBufNor = createArrayBuffer(planetMesh.nor);
    planetBufUV = createArrayBuffer(planetMesh.uv);
    planetVertCount = planetMesh.vertCount;

    const sunMesh = createSphereMesh(1.0, 20, 20);
    sunBufPos = createArrayBuffer(sunMesh.pos);
    sunVertCount = sunMesh.vertCount;

    const moonMesh = createSphereMesh(1.0, 16, 16);
    moonBufPos = createArrayBuffer(moonMesh.pos);
    moonVertCount = moonMesh.vertCount;

    // Configurazione GL
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    requestAnimationFrame(loop);
  } catch (err) {
    console.error("Init error:", err);
    document.body.innerHTML = `<pre style="color:white; padding:12px">Error: ${String(err)}</pre>`;
  }
})();



function computeBounds(pos) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i+1], z = pos[i+2];
    if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
  }

  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const cz = (minZ + maxZ) * 0.5;

  const dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ;
  const radius = Math.max(dx, dy, dz) * 0.5;

  return { minX, minY, minZ, maxX, maxY, maxZ, cx, cy, cz, radius };
}




// =============================================================================
// CICLO DI GIOCO
// =============================================================================
// Loop di animazione principale - chiamato ogni frame tramite requestAnimationFrame
// Gestisce i tempi, aggiorna lo stato del gioco e renderizza la scena
function loop(tsMs) {
  // Ridimensiona il canvas se la finestra è cambiata
  resizeCanvasToDisplaySize();

  // Converti il timestamp in secondi
  const t = tsMs * 0.001;
  if (!state.lastT) state.lastT = t;
  const dt = Math.min(0.05, Math.max(0.0001, t - state.lastT)); // limita dt
  state.lastT = t;
  state.t = t;

  update(dt);
  render();

  requestAnimationFrame(loop);
}

// =============================================================================
// FUNZIONE DI AGGIORNAMENTO
// =============================================================================
// Aggiorna lo stato del gioco ogni frame: fame, umore, dimensione e UI
function update(dt) {
  // --- SISTEMA FAME ---
  // La fame aumenta di 1 ogni 5 secondi, max 20
  const nowMs = Date.now();
  const HUNGER_MAX = 20;
  if (nowMs >= state.nextHungerAtMs) {
    const steps = Math.floor((nowMs - state.nextHungerAtMs) / 5000) + 1;
    state.hungerInt = Math.min(HUNGER_MAX, state.hungerInt + steps);
    state.nextHungerAtMs += steps * 5000;
  }

  // fame continua per gli shader (mappa intero su 0..1 su 20 unità)
  state.hunger = clamp01(state.hungerInt / 20);

  // L'umore peggiora ogni 5 secondi (un passo alla volta, max 20)
  const MOOD_MAX = 20;
  if (nowMs >= state.nextMoodAtMs) {
    const steps = Math.floor((nowMs - state.nextMoodAtMs) / 5000) + 1;
    state.moodLevel = Math.min(MOOD_MAX, state.moodLevel + steps);
    state.nextMoodAtMs += steps * 5000;
  }

  // Tristezza shader dal livello umore discreto
  state.sad = state.moodLevel / MOOD_MAX;

  // Interpola la dimensione verso il target (basato sul tempo)
  // calcola la dimensione desiderata dalla fame (più fame => dimensione minore)
  const MIN_SIZE = 0.15;
  const MAX_SIZE = 0.35;
  // Usa scaling veloce per la dimensione (fame 0-20 dà l'effetto completo)
  const sizeHunger = clamp01(state.hungerInt / 20);
  // mappatura invertita: fame=20+ => MIN_SIZE, fame=0 => MAX_SIZE
  state.targetSize = lerp(MIN_SIZE, MAX_SIZE, 1 - sizeHunger);
  const k = 1 - Math.exp(-RATES.sizeSmoothPerSec * dt);
  state.size = lerp(state.size, state.targetSize, k);

  // HUD - Aggiorna le barre di avanzamento
  // Barra fame: 0% quando hungerInt=0, 100% quando hungerInt=20
  const hungerPercent = Math.min(100, (state.hungerInt / HUNGER_MAX) * 100);
  hungerBar.style.width = hungerPercent + '%';
  // Sposta il gradiente in base al livello di fame (verde -> giallo -> rosso)
  hungerBar.style.backgroundPosition = hungerPercent + '% 0';
  
  // Barra umore: 100% felice -> 0% triste, stessa scala della fame
  const moodPercent = 100 - Math.min(100, (state.moodLevel / 20) * 100);
  moodBar.style.width = moodPercent + '%';
  
  sizeVal.textContent = state.size.toFixed(2);
  const dayPhase = (state.t % DAY_DURATION_SEC) / DAY_DURATION_SEC;
  const clockHours = (dayPhase * 24.0 + CLOCK_START_HOUR) % 24.0;
  const totalMinutes = Math.floor(clockHours * 60.0);
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const mm = String(totalMinutes % 60).padStart(2, '0');
  let periodLabel = 'Night';
  if (clockHours >= 5.0 && clockHours < 8.0) periodLabel = 'Dawn';
  else if (clockHours >= 8.0 && clockHours < 17.0) periodLabel = 'Day';
  else if (clockHours >= 17.0 && clockHours < 20.0) periodLabel = 'Dusk';
  timeVal.textContent = `${hh}:${mm} ${periodLabel}`;

  // Auto-rotazione quando abilitata
  if (state.autoRotateEnabled) {
    state.rotY += dt * 0.9; // radianti al secondo
  }
}



// =============================================================================
// FUNZIONE DI RENDERING
// =============================================================================
// Disegna la scena ogni frame: creatura + piano erboso
function render() {
  if (!mesh) return;

  // Collega gli attributi
  bindAttrib("aPos", 3, bufPos);
  bindAttrib("aNor", 3, bufNor);
  bindAttrib("aCol", 3, bufCol);

  // Uniform
  gl.uniform1f(uSad, state.sad);
  gl.uniform1f(uHunger, state.hunger);

  // --- CAMERA E PROIEZIONE ---
  const aspectRatio = canvas.width / canvas.height;
  const projectionMatrix = mat4Perspective(Math.PI / 4, aspectRatio, 0.1, 100.0); // fov 45 gradi
  const camEye = [state.camX, state.camY, state.camZ];
  const camLook = [0, 0, 0];
  const camUp = [0, 1, 0];
  const viewMatrix = mat4LookAt(camEye, camLook, camUp);

  // --- Rotazione scena dai controlli touch (ruota l'intera scena) ---
  const sceneRotY = mat4RotateY(state.rotY);
  const sceneRotX = mat4RotateX(state.rotX);
  const sceneRotation = mat4Mul(sceneRotX, sceneRotY);

  // Moto orbitale giorno/notte per sole e luna (opposti tra loro)
  const dayPhase = (state.t % DAY_DURATION_SEC) / DAY_DURATION_SEC;
  const orbitAngle = dayPhase * Math.PI * 2.0 + Math.PI * 0.5;
  const moonAngle = orbitAngle + Math.PI;
  const sunBasePos = [
    Math.cos(orbitAngle) * ORBIT_RADIUS_X,
    ORBIT_CENTER_Y + Math.sin(orbitAngle) * ORBIT_RADIUS_Y,
    2.4
  ];
  const moonBasePos = [
    Math.cos(moonAngle) * ORBIT_RADIUS_X,
    ORBIT_CENTER_Y + Math.sin(moonAngle) * ORBIT_RADIUS_Y,
    -2.4
  ];

  const sunLightPos = mat4TransformPoint(sceneRotation, sunBasePos);
  const moonLightPos = mat4TransformPoint(sceneRotation, moonBasePos);

  // L'elevazione del sole guida la transizione giorno/notte
  const dayFactor = clamp01((sunBasePos[1] + ORBIT_RADIUS_Y * 0.15) / (ORBIT_RADIUS_Y * 1.15));
  const nightFactor = 1.0 - dayFactor;

  // Il cielo si scurisce di notte
  const daySky = [0.44, 0.62, 0.86];
  const nightSky = [0.04, 0.06, 0.12];
  const skyR = lerp(nightSky[0], daySky[0], dayFactor);
  const skyG = lerp(nightSky[1], daySky[1], dayFactor);
  const skyB = lerp(nightSky[2], daySky[2], dayFactor);
  gl.clearColor(skyR, skyG, skyB, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Abilita il depth testing (gli oggetti più vicini occludono quelli più lontani)
  gl.enable(gl.DEPTH_TEST);
  // Disabilita il face culling per mostrare entrambi i lati dei poligoni
  gl.disable(gl.CULL_FACE);

  // Due luci dinamiche: sole caldo + luna fredda
  const sunLightColor = [
    1.05 * dayFactor,
    0.95 * dayFactor,
    0.78 * dayFactor
  ];
  const moonLightColor = [
    0.24 * nightFactor,
    0.34 * nightFactor,
    0.54 * nightFactor
  ];
  const ambientColor = [
    lerp(0.06, 0.22, dayFactor),
    lerp(0.07, 0.24, dayFactor),
    lerp(0.10, 0.28, dayFactor)
  ];
  const fillLightColor = [
    lerp(0.20, 0.06, dayFactor),
    lerp(0.24, 0.07, dayFactor),
    lerp(0.32, 0.10, dayFactor)
  ];

  if (uLightPos) gl.uniform3fv(uLightPos, sunLightPos);
  if (uLightPos2) gl.uniform3fv(uLightPos2, moonLightPos);
  if (uLightColor) gl.uniform3fv(uLightColor, sunLightColor);
  if (uLightColor2) gl.uniform3fv(uLightColor2, moonLightColor);
  if (uAmbientColor) gl.uniform3fv(uAmbientColor, ambientColor);
  if (uFillLightColor) gl.uniform3fv(uFillLightColor, fillLightColor);

  // Costruisci view-projection con la rotazione scena applicata
  const viewProjection = mat4Mul(projectionMatrix, viewMatrix);
  const rotatedVP = mat4Mul(viewProjection, sceneRotation);

  // --- Costruisci la matrice modello della creatura: scala + posizione sul piano ---
  const meshScale = state.size; // La fame influenza la dimensione: più fame = più piccola
  const planeY = -1.5;
  // La superficie dell'erba è leggermente sopra planeY (altezza erba ~10 unità * 0.08 scala = 0.8)
  const grassSurfaceY = planeY + 0.8;
  // Usa i bounds per posizionare il fondo della creatura sulla superficie erbosa
  const bounds = window.__OBJ_BOUNDS__ || { minY: 0 };
  const creatureBottomOffset = bounds.minY * meshScale;
  
  // --- ANIMAZIONE IDLE ---
  // Rende la creatura viva con movimenti continui sottili:
  // - Oscillazione: oscillazione su/giù leggera (come galleggiare)
  // - Respiro: pulsazione di scala sottile (come inspirare/espirare)
  const idleTime = state.t;
  const bobAmount = 0.02;      // Ampiezza oscillazione verticale (unità)
  const bobSpeed = 2.0;        // Frequenza oscillazione (radianti al secondo)
  const breatheAmount = 0.015; // Ampiezza pulsazione scala (percentuale)
  const breatheSpeed = 1.5;    // Frequenza respiro (radianti al secondo)
  
  // Calcola gli offset di animazione con onde sinusoidali
  const bobOffset = Math.sin(idleTime * bobSpeed) * bobAmount;
  const breatheScale = 1.0 + Math.sin(idleTime * breatheSpeed) * breatheAmount;
  
  const creatureY = grassSurfaceY - creatureBottomOffset + bobOffset;
  const animatedScale = meshScale * breatheScale;
  const creatureModel = mat4Mul(mat4Translate(0, creatureY, 0), mat4Scale(animatedScale, animatedScale, animatedScale));
  const creatureMVP = mat4Mul(rotatedVP, creatureModel);

  gl.uniformMatrix4fv(uModel, false, mat4Mul(sceneRotation, creatureModel));
  if (uMVP) gl.uniformMatrix4fv(uMVP, false, creatureMVP);

  // Disegna la mesh della creatura
  gl.drawArrays(gl.TRIANGLES, 0, mesh.vertCount);

  // --- Disegna l'erba sotto la creatura ---
  if (grassMesh && grassBufPos && grassBufNor && grassBufUV && grassTexture) {
    // Passa allo shader con texture
    gl.useProgram(texProgram);
    
    // Collega gli attributi per lo shader con texture
    const texLocPos = gl.getAttribLocation(texProgram, "aPos");
    const texLocNor = gl.getAttribLocation(texProgram, "aNor");
    const texLocUV = gl.getAttribLocation(texProgram, "aUV");
    
    gl.bindBuffer(gl.ARRAY_BUFFER, grassBufPos);
    gl.enableVertexAttribArray(texLocPos);
    gl.vertexAttribPointer(texLocPos, 3, gl.FLOAT, false, 0, 0);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, grassBufNor);
    gl.enableVertexAttribArray(texLocNor);
    gl.vertexAttribPointer(texLocNor, 3, gl.FLOAT, false, 0, 0);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, grassBufUV);
    gl.enableVertexAttribArray(texLocUV);
    gl.vertexAttribPointer(texLocUV, 2, gl.FLOAT, false, 0, 0);

    // Il modello erba è nel piano XY con coordinate grandi (~140 unità), serve:
    // 1. Scalare per adattarsi alla scena
    // 2. Ruotare -90 gradi attorno a X per giacere nel piano XZ
    // 3. Posizionare a planeY
    const grassScale = 0.04; // Piano più piccolo così il moto sole/luna è visibile sopra l'orizzonte
    const scaleM = mat4Scale(grassScale, grassScale, grassScale);
    const rotX90 = mat4RotateX(-Math.PI / 2); // Ruota nel piano XZ
    const translateM = mat4Translate(0, planeY, 0);
    const grassModel = mat4Mul(translateM, mat4Mul(rotX90, scaleM));
    const grassMVP = mat4Mul(rotatedVP, grassModel);

    // Imposta gli uniform per lo shader con texture
    const texUMVP = gl.getUniformLocation(texProgram, "uMVP");
    const texUModel = gl.getUniformLocation(texProgram, "uModel");
    const texUTexture = gl.getUniformLocation(texProgram, "uTexture");
    const texULightPos = gl.getUniformLocation(texProgram, "uLightPos");
    const texULightPos2 = gl.getUniformLocation(texProgram, "uLightPos2");
    const texULightColor = gl.getUniformLocation(texProgram, "uLightColor");
    const texULightColor2 = gl.getUniformLocation(texProgram, "uLightColor2");
    const texUAmbientColor = gl.getUniformLocation(texProgram, "uAmbientColor");
    const texUFillLightColor = gl.getUniformLocation(texProgram, "uFillLightColor");
    
    gl.uniformMatrix4fv(texUModel, false, mat4Mul(sceneRotation, grassModel));
    gl.uniformMatrix4fv(texUMVP, false, grassMVP);
    if (texULightPos) gl.uniform3fv(texULightPos, sunLightPos);
    if (texULightPos2) gl.uniform3fv(texULightPos2, moonLightPos);
    if (texULightColor) gl.uniform3fv(texULightColor, sunLightColor);
    if (texULightColor2) gl.uniform3fv(texULightColor2, moonLightColor);
    if (texUAmbientColor) gl.uniform3fv(texUAmbientColor, ambientColor);
    if (texUFillLightColor) gl.uniform3fv(texUFillLightColor, fillLightColor);
    
    // Collega la texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, grassTexture);
    gl.uniform1i(texUTexture, 0);

    gl.drawArrays(gl.TRIANGLES, 0, grassMesh.vertCount);
    
    // Torna allo shader principale
    gl.useProgram(program);
  }

  // --- Disegna un pianeta distante texturizzato sullo sfondo ---
  if (planetBufPos && planetBufNor && planetBufUV && planetTexture && planetVertCount > 0) {
    gl.useProgram(texProgram);

    // Collega attributi posizione/normale/UV per la sfera del pianeta
    const texLocPos = gl.getAttribLocation(texProgram, "aPos");
    const texLocNor = gl.getAttribLocation(texProgram, "aNor");
    const texLocUV = gl.getAttribLocation(texProgram, "aUV");

    gl.bindBuffer(gl.ARRAY_BUFFER, planetBufPos);
    gl.enableVertexAttribArray(texLocPos);
    gl.vertexAttribPointer(texLocPos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, planetBufNor);
    gl.enableVertexAttribArray(texLocNor);
    gl.vertexAttribPointer(texLocNor, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, planetBufUV);
    gl.enableVertexAttribArray(texLocUV);
    gl.vertexAttribPointer(texLocUV, 2, gl.FLOAT, false, 0, 0);

    // Posizione lontana dalla scena principale per effetto "sfondo"
    // e rotazione lenta su se stesso
    const planetScale = 2.6;
    const planetSpin = mat4RotateY(state.t * 0.12);
    const planetModel = mat4Mul(
      mat4Translate(-16.0, 8.5, -26.0),
      mat4Mul(planetSpin, mat4Scale(planetScale, planetScale, planetScale))
    );
    const planetMVP = mat4Mul(rotatedVP, planetModel);

    const texUMVP = gl.getUniformLocation(texProgram, "uMVP");
    const texUModel = gl.getUniformLocation(texProgram, "uModel");
    const texUTexture = gl.getUniformLocation(texProgram, "uTexture");
    const texULightPos = gl.getUniformLocation(texProgram, "uLightPos");
    const texULightPos2 = gl.getUniformLocation(texProgram, "uLightPos2");
    const texULightColor = gl.getUniformLocation(texProgram, "uLightColor");
    const texULightColor2 = gl.getUniformLocation(texProgram, "uLightColor2");
    const texUAmbientColor = gl.getUniformLocation(texProgram, "uAmbientColor");
    const texUFillLightColor = gl.getUniformLocation(texProgram, "uFillLightColor");

    gl.uniformMatrix4fv(texUModel, false, mat4Mul(sceneRotation, planetModel));
    gl.uniformMatrix4fv(texUMVP, false, planetMVP);
    if (texULightPos) gl.uniform3fv(texULightPos, sunLightPos);
    if (texULightPos2) gl.uniform3fv(texULightPos2, moonLightPos);
    if (texULightColor) gl.uniform3fv(texULightColor, sunLightColor);
    if (texULightColor2) gl.uniform3fv(texULightColor2, moonLightColor);
    if (texUAmbientColor) gl.uniform3fv(texUAmbientColor, ambientColor);
    if (texUFillLightColor) gl.uniform3fv(texUFillLightColor, fillLightColor);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, planetTexture);
    gl.uniform1i(texUTexture, 0);

    gl.drawArrays(gl.TRIANGLES, 0, planetVertCount);

    // Torna allo shader principale per i draw successivi
    gl.useProgram(program);
  }

  // --- Disegna la sfera primitiva del sole visibile ---
  if (sunProgram && sunBufPos && sunVertCount > 0) {
    gl.useProgram(sunProgram);

    const sunScale = 0.35;
    const sunModel = mat4Mul(
      mat4Translate(sunBasePos[0], sunBasePos[1], sunBasePos[2]),
      mat4Scale(sunScale, sunScale, sunScale)
    );
    const sunMVP = mat4Mul(rotatedVP, sunModel);

    const sunPosLoc = gl.getAttribLocation(sunProgram, "aPos");
    gl.bindBuffer(gl.ARRAY_BUFFER, sunBufPos);
    gl.enableVertexAttribArray(sunPosLoc);
    gl.vertexAttribPointer(sunPosLoc, 3, gl.FLOAT, false, 0, 0);

    const sunUMVP = gl.getUniformLocation(sunProgram, "uMVP");
    const sunUColor = gl.getUniformLocation(sunProgram, "uSunColor");
    gl.uniformMatrix4fv(sunUMVP, false, sunMVP);
    gl.uniform3f(
      sunUColor,
      lerp(0.55, 1.0, dayFactor),
      lerp(0.55, 0.92, dayFactor),
      lerp(0.65, 0.52, dayFactor)
    );

    gl.drawArrays(gl.TRIANGLES, 0, sunVertCount);

    // Disegna la sfera della luna con lo stesso shader
    if (moonBufPos && moonVertCount > 0) {
      const moonScale = 0.28;
      const moonModel = mat4Mul(
        mat4Translate(moonBasePos[0], moonBasePos[1], moonBasePos[2]),
        mat4Scale(moonScale, moonScale, moonScale)
      );
      const moonMVP = mat4Mul(rotatedVP, moonModel);
      gl.bindBuffer(gl.ARRAY_BUFFER, moonBufPos);
      gl.vertexAttribPointer(sunPosLoc, 3, gl.FLOAT, false, 0, 0);
      gl.uniformMatrix4fv(sunUMVP, false, moonMVP);
      gl.uniform3f(
        sunUColor,
        lerp(0.65, 0.25, dayFactor),
        lerp(0.70, 0.32, dayFactor),
        lerp(0.82, 0.45, dayFactor)
      );
      gl.drawArrays(gl.TRIANGLES, 0, moonVertCount);
    }

    // Ripristina lo shader principale per il prossimo frame
    gl.useProgram(program);
  }

  const err = gl.getError();
  if (err !== 0) console.warn('GL error after draw:', err);
}
