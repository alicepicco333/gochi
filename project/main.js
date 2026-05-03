// =============================================================================
// 3D TAMAGOTCHI - WebGL Application
// =============================================================================
// This application renders a 3D creature (loaded from OBJ file) with:
// - Vertex colors from Blender sculpt mode
// - Mood and hunger systems that affect appearance
// - Touch controls for rotating the scene
// - Grass ground plane with texture
// 
// EXTERNAL LIBRARIES USED:
// - dat.GUI (dat.gui.js): Provides a floating control panel for adjusting
//   rotation and enabling auto-rotate. Used in the "dat.GUI controls" section.
// - webgl-utils (webgl-utils.js): Helper functions for WebGL setup.
//   Used for createProgramFromSources() and createBufferFromTypedArray().
// =============================================================================

// ---------- Matrix multiplication helper ----------
// Multiplies two 4x4 matrices in column-major order (standard for WebGL)
function mat4Mul(a, b) {
  // Multiplies two 4x4 matrices (column-major)
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
// ---------- Matrix identity helper ----------
// Returns a 4x4 identity matrix (no transformation)
function mat4Identity() {
  return new Float32Array([
    1,0,0,0,
    0,1,0,0,
    0,0,1,0,
    0,0,0,1
  ]);
}
// ---------- Canvas resize helper ----------
// Resizes the canvas to match display size, accounting for device pixel ratio
// This ensures crisp rendering on high-DPI displays (Retina, etc.)
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
// ====== Minimal WebGL Tamagotchi (no libraries) ======

// ====== DOM Element References ======
// Get references to HTML elements for the UI
const canvas = document.getElementById("webglcanvas");
const feedBtn = document.getElementById("feedBtn");
const hungerBar = document.getElementById("hungerBar");  // Progress bar element
const moodBar = document.getElementById("moodBar");      // Progress bar element
const sizeVal = document.getElementById("sizeVal");
const timeVal = document.getElementById("timeVal");

// ====== WebGL Context ======
// Try to get WebGL2 first, fall back to WebGL1 for broader compatibility
const gl =
  canvas.getContext("webgl2", { antialias: true }) ||
  canvas.getContext("webgl", { antialias: true }) ||
  canvas.getContext("experimental-webgl");



// ---------- Matrix Transform Functions ----------
// These functions create 4x4 transformation matrices for 3D graphics

// Creates a translation matrix (moves objects in 3D space)
function mat4Translate(tx, ty, tz) {
  const m = mat4Identity();
  m[12] = tx; m[13] = ty; m[14] = tz;
  return m;
}

// Creates a scale matrix (resizes objects)
function mat4Scale(sx, sy, sz) {
  const m = mat4Identity();
  m[0] = sx; m[5] = sy; m[10] = sz;
  return m;
}

// Creates a rotation matrix around Y axis (left/right rotation)
function mat4RotateY(rad) {
  const c = Math.cos(rad), s = Math.sin(rad);
  return new Float32Array([
     c,0,-s,0,
     0,1, 0,0,
     s,0, c,0,
     0,0, 0,1
  ]);
}

// Creates a rotation matrix around X axis (up/down tilt)
function mat4RotateX(rad) {
  const c = Math.cos(rad), s = Math.sin(rad);
  return new Float32Array([
    1,0, 0,0,
    0,c, s,0,
    0,-s,c,0,
    0,0, 0,1
  ]);
}

// Creates a perspective projection matrix (3D depth effect)
// fovy: field of view in radians, aspect: width/height ratio
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

// ---------- Vector Math Helpers ----------
// Used for camera "look at" calculations

// Normalizes a 3D vector to unit length
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

// Creates a view matrix that positions camera at 'eye' looking at 'center'
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
  out[14] =  (f[0]*eye[0] + f[1]*eye[1] + f[2]*eye[2]);  // dot(f, eye), no negation

  return out;
}

// ---------- Utility Functions ----------
function clamp01(x) { return Math.max(0, Math.min(1, x)); }  // Clamps value to 0-1 range
function lerp(a,b,t){ return a + (b-a)*t; }  // Linear interpolation between a and b

// =============================================================================
// VERTEX SHADER (VS) - Runs for each vertex
// =============================================================================
// Transforms 3D positions to screen coordinates and passes data to fragment shader
// Attributes: aPos (position), aNor (normal), aCol (vertex color from Blender)
// Uniforms: uMVP (combined transform matrix), uModel (model transform for lighting)
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
  // Use full projection*view*model (uMVP) so vertices are placed in clip space
  gl_Position = uMVP * vec4(aPos, 1.0);
}
`;

// =============================================================================
// FRAGMENT SHADER (FS) - Runs for each pixel
// =============================================================================
// Calculates final pixel color using:
// - Vertex colors (from Blender sculpt paint)
// - Directional lighting (simple diffuse)
// - Mood tints (sad makes colors cooler, hunger adds red tint)
// =============================================================================
const FS = `
precision mediump float;

varying vec3 vN;
varying vec4 vPos;
varying vec3 vCol;

uniform float uSad;      // 0..1
uniform float uHunger;   // 0..1

void main() {
  vec3 n = normalize(vN);
  
  // Basic directional lighting
  vec3 lightDir = normalize(vec3(0.5, 1.0, 0.5));
  float diffuse = max(0.0, dot(n, lightDir));
  float light = 0.3 + 0.7 * diffuse;
  
  // Use vertex color from material
  vec3 col = vCol;
  col *= light;
  
  // Mood effects: sad => cooler / darker, hunger => stronger reddish
  vec3 sadTint = mix(vec3(1.0), vec3(0.75, 0.85, 1.15), uSad);
  vec3 hungerTint = mix(vec3(1.0), vec3(2.4, 0.7, 0.7), uHunger);
  
  col *= sadTint;
  col *= hungerTint;
  
  // If very sad, add slight desaturation
  float gray = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(gray), uSad * 0.35);
  
  gl_FragColor = vec4(col, 1.0);
}
`;

// =============================================================================
// TEXTURED SHADERS - Used for grass plane with texture
// =============================================================================
// Separate shader pair for rendering textured objects (grass)
// Uses UV coordinates and samples from a texture instead of vertex colors
const VS_TEX = `
attribute vec3 aPos;
attribute vec3 aNor;
attribute vec2 aUV;

uniform mat4 uMVP;
uniform mat4 uModel;

varying vec3 vN;
varying vec2 vUV;

void main() {
  vN = mat3(uModel) * aNor;
  vUV = aUV;
  gl_Position = uMVP * vec4(aPos, 1.0);
}
`;

const FS_TEX = `
precision mediump float;

varying vec3 vN;
varying vec2 vUV;

uniform sampler2D uTexture;

void main() {
  vec3 n = normalize(vN);
  
  // Basic directional lighting
  vec3 lightDir = normalize(vec3(0.5, 1.0, 0.5));
  float diffuse = max(0.0, dot(n, lightDir));
  float light = 0.4 + 0.6 * diffuse;
  
  // Sample texture
  vec4 texColor = texture2D(uTexture, vUV);
  
  // Alpha test for grass blades
  if (texColor.a < 0.5) discard;
  
  vec3 col = texColor.rgb * light;
  
  gl_FragColor = vec4(col, texColor.a);
}
`;

// =============================================================================
// SHADER PROGRAM CREATION
// =============================================================================
// WEBGL-UTILS USAGE: If webgl-utils.js is loaded, uses createProgramFromSources()
// This helper function compiles vertex and fragment shaders and links them.
// Falls back to manual shader compilation if webgl-utils is not available.
// =============================================================================
let program = null;
if (window.webglUtils && webglUtils.createProgramFromSources) {
  // >>> WEBGL-UTILS: createProgramFromSources(gl, [vertexShaderSource, fragmentShaderSource])
  // Compiles both shaders and links them into a program in one call
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

// Create textured shader program
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

// =============================================================================
// TEXTURE LOADING HELPER
// =============================================================================
// Loads an image and creates a WebGL texture from it
// Returns a Promise that resolves with the texture object
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
// OBJ/MTL FILE LOADERS
// =============================================================================
// These functions parse Wavefront OBJ and MTL files exported from Blender

// Fetches a text file from URL
async function loadText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load: ${url}`);
  return await res.text();
}

// Parses MTL (Material) file to extract diffuse colors (Kd) for each material
// Returns an object mapping material names to their properties
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
      materials[currentMat] = { kd: [0.8, 0.8, 0.8] }; // default gray
    } else if (tag === "Kd" && currentMat) {
      materials[currentMat].kd = [+parts[1], +parts[2], +parts[3]];
    }
  }
  return materials;
}

// =============================================================================
// OBJ PARSER
// =============================================================================
// Parses Wavefront OBJ file format into WebGL-ready arrays
// Supports: v (vertices with optional colors), vt (UVs), vn (normals), f (faces)
// Also handles usemtl for material switching
// Returns: { pos, uv, nor, col, vertCount } - all as Float32Arrays
function parseOBJ(objText, materials = {}) {
  const positions = [];  // Each entry: [x, y, z]
  const vertColors = []; // Each entry: [r, g, b] or null if no vertex color
  const uvs = [];
  const normals = [];

  const outPos = [];
  const outUV = [];
  const outNor = [];
  const outCol = [];

  // Default material color (gray)
  let currentColor = [0.8, 0.8, 0.8];

  const lines = objText.split("\n");
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;

    const parts = line.split(/\s+/);
    const tag = parts[0];

    if (tag === "v") {
      positions.push([+parts[1], +parts[2], +parts[3]]);
      // Check for vertex colors (v x y z r g b)
      if (parts.length >= 7) {
        vertColors.push([+parts[4], +parts[5], +parts[6]]);
      } else {
        vertColors.push(null); // No vertex color for this vertex
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
      // triangulate fan: f a b c d => (a b c) (a c d)
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
            // OBJ vt origin is bottom-left often; WebGL textures often expect flipped Y
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

          // Use vertex color if available, otherwise fall back to material color
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
    // OBJ allows negative indices
    const idx = parseInt(str, 10);
    return idx >= 0 ? (idx - 1) : (len + idx);
  }
}

// =============================================================================
// WEBGL BUFFER CREATION
// =============================================================================
// Creates GPU buffers to store vertex data (positions, normals, colors, UVs)

// Creates a WebGL buffer from typed array data
// WEBGL-UTILS USAGE: If available, uses createBufferFromTypedArray()
// Otherwise falls back to manual buffer creation
function createArrayBuffer(data) {
  if (window.webglUtils && webglUtils.createBufferFromTypedArray) {
    // >>> WEBGL-UTILS: createBufferFromTypedArray(gl, typedArray, type, usage)
    // Creates and fills a buffer in one call
    return webglUtils.createBufferFromTypedArray(gl, data, gl.ARRAY_BUFFER, gl.STATIC_DRAW);
  }
  // Fallback: manual buffer creation
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return buf;
}

// Binds a buffer to a shader attribute (connects data to shader variable)
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
// SHADER UNIFORM LOCATIONS
// =============================================================================
// Get references to shader variables so we can update them each frame
const uMVP = gl.getUniformLocation(program, "uMVP");     // Model-View-Projection matrix
const uModel = gl.getUniformLocation(program, "uModel"); // Model matrix (for lighting)
const uSad = gl.getUniformLocation(program, "uSad");     // Sadness level 0-1
const uHunger = gl.getUniformLocation(program, "uHunger"); // Hunger level 0-1

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
  sad: 0.0,       // rises if you rotate too fast
  moodLevel: 0,   // 0=Happy, 1=Meh, 2=Sad (changes every 5s)
  nextMoodAtMs: Date.now() + 5000, // next wall-clock ms when mood changes

  // Size grows when fed
  size: 1.0,
  targetSize: 1.0,

  // Touch-driven rotation
  rotY: 0,
  rotX: 0.2,

  // Camera position
  camX: 0,
  camY: 0,
  camZ: 5,

  // For sadness based on rotation velocity
  rotSpeedAccum: 0, // accumulates per second
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
// KEYBOARD CONTROLS
// =============================================================================
// Allows rotating the scene using arrow keys
const KEYBOARD_ROTATION_SPEED = 0.05; // radians per key press

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
      state.rotX = Math.max(-0.6, Math.min(0.9, state.rotX)); // clamp
      e.preventDefault();
      break;
    case "ArrowDown":
      state.rotX += KEYBOARD_ROTATION_SPEED;
      state.rotX = Math.max(-0.6, Math.min(0.9, state.rotX)); // clamp
      e.preventDefault();
      break;
  }
});

// =============================================================================
// BUTTON HANDLERS
// =============================================================================

// Feed button - reduces hunger by 1 (can go negative to "store" food)
feedBtn.addEventListener("click", () => {
  // Feeding reduces integer hunger by 1 (can go negative to store food)
  state.hungerInt = state.hungerInt - 1;
  state.hunger = clamp01(state.hungerInt / 20);
});

// Cheer button - instantly restores mood to Happy
const cheerBtn = document.getElementById("cheerBtn");
cheerBtn.addEventListener("click", () => {
  state.moodLevel = 0; // Happy
  state.sad = 0.0;
  state.nextMoodAtMs = Date.now() + 5000; // Reset timer
});

// =============================================================================
// DAT.GUI CONTROLS
// =============================================================================
// >>> DAT.GUI LIBRARY USAGE
// dat.GUI creates a floating control panel in the top-right corner
// Allows runtime adjustment of rotation and auto-rotate toggle
// The library is loaded from dat.gui.js in index.html
// =============================================================================
if (window.dat && dat.GUI) {
  // Create a new GUI panel
  const gui = new dat.GUI();
  
  // Control values object (dat.GUI reads/writes to this)
  const controls = {
    rotY: state.rotY,
    rotX: state.rotX,
    autoRotate: state.autoRotateEnabled,
    camX: state.camX,
    camY: state.camY,
    camZ: state.camZ,
  };

  // >>> gui.add(object, property, min, max) - Creates a slider control
  // .step(0.01) - Sets slider increment
  // .name('Label') - Display name in GUI
  // .onChange(callback) - Called when value changes
  gui.add(controls, 'rotY', -Math.PI * 2, Math.PI * 2).step(0.01).name('Rotate Y').onChange(v => { state.rotY = v; });
  gui.add(controls, 'rotX', -0.6, 0.9).step(0.01).name('Rotate X').onChange(v => { state.rotX = v; });
  
  // >>> gui.add(object, booleanProperty) - Creates a checkbox
  gui.add(controls, 'autoRotate').name('Auto-rotate').onChange(v => { state.autoRotateEnabled = !!v; });

  // Camera position controls
  gui.add(controls, 'camX', -10, 10).step(0.1).name('Cam X').onChange(v => { state.camX = v; });
  gui.add(controls, 'camY', -10, 10).step(0.1).name('Cam Y').onChange(v => { state.camY = v; });
  gui.add(controls, 'camZ', 1, 20).step(0.1).name('Cam Z').onChange(v => { state.camZ = v; });
}

// =============================================================================
// ASSET LOADING AND INITIALIZATION
// =============================================================================
// Global variables for loaded meshes and GPU buffers
let mesh = null;  // Main creature mesh
let bufPos = null, bufUV = null, bufNor = null, bufCol = null;  // Creature buffers

// Grass mesh (loaded from grass.obj)
let grassMesh = null;
let grassBufPos = null, grassBufNor = null, grassBufCol = null, grassBufUV = null;
let grassTexture = null;  // Grass texture (grass.jpg)

// Async initialization function - loads all assets and starts render loop
(async function init() {
  try {
    // Load MTL file first for material colors
    console.log("Loading MTL from: assets/creature.mtl");
    const mtlText = await loadText("assets/creature.mtl");
    const materials = parseMTL(mtlText);
    console.log("Materials loaded:", Object.keys(materials));

    console.log("Loading OBJ from: assets/creature.obj");
    const objText = await loadText("assets/creature.obj");
    console.log("OBJ loaded, parsing...");
    mesh = parseOBJ(objText, materials);
    console.log("OBJ parsed. Vertices:", mesh.vertCount);
    console.log("mesh.pos sample:", mesh.pos.slice(0, 12));

    const b = computeBounds(mesh.pos);
    console.log("Bounds:", b);
    window.__OBJ_BOUNDS__ = b;

    bufPos = createArrayBuffer(mesh.pos);
    bufUV = createArrayBuffer(mesh.uv);
    bufNor = createArrayBuffer(mesh.nor);
    bufCol = createArrayBuffer(mesh.col);
    console.log("bufPos valid:", !!bufPos, "bufNor valid:", !!bufNor, "bufCol valid:", !!bufCol);

    // Load grass model
    console.log("Loading grass MTL from: assets/grass.mtl");
    const grassMtlText = await loadText("assets/grass.mtl");
    const grassMaterials = parseMTL(grassMtlText);
    // Override grass material with green color (since texture is missing)
    for (const matName in grassMaterials) {
      grassMaterials[matName].kd = [0.2, 0.6, 0.15]; // Green grass color
    }
    console.log("Grass materials loaded:", Object.keys(grassMaterials));

    console.log("Loading grass OBJ from: assets/grass.obj");
    const grassObjText = await loadText("assets/grass.obj");
    grassMesh = parseOBJ(grassObjText, grassMaterials);
    console.log("Grass parsed. Vertices:", grassMesh.vertCount);

    grassBufPos = createArrayBuffer(grassMesh.pos);
    grassBufNor = createArrayBuffer(grassMesh.nor);
    grassBufCol = createArrayBuffer(grassMesh.col);
    grassBufUV = createArrayBuffer(grassMesh.uv);
    console.log("Grass buffers created");

    // Load grass texture
    grassTexture = await loadTexture("assets/grass.jpg");
    console.log("Grass texture loaded");

    // GL setup
    gl.enable(gl.DEPTH_TEST);
    // Disable face culling to avoid hiding the mesh if winding is inconsistent
    gl.disable(gl.CULL_FACE);
    console.log("GL state setup complete, starting render loop");

    requestAnimationFrame(loop);
  } catch (err) {
    console.error("Init error:", err);
    document.body.innerHTML = `<pre style="color:white; padding:12px">Error: ${String(err)}</pre>`;
  }
})();

console.log("Init function started, waiting for async load...");



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
// GAME LOOP
// =============================================================================
// Main animation loop - called every frame via requestAnimationFrame
// Handles timing, updates game state, and renders the scene
function loop(tsMs) {
  // Resize canvas if window size changed
  resizeCanvasToDisplaySize();

  // Convert timestamp to seconds
  const t = tsMs * 0.001;
  if (!state.lastT) {
    state.lastT = t;
    console.log("Loop started, mesh:", mesh ? "loaded" : "not loaded");
  }
  const dt = Math.min(0.05, Math.max(0.0001, t - state.lastT)); // clamp dt
  state.lastT = t;
  state.t = t;

  update(dt);
  render();

  requestAnimationFrame(loop);
}

// =============================================================================
// UPDATE FUNCTION
// =============================================================================
// Updates game state each frame: hunger, mood, size, and UI
function update(dt) {
  // --- HUNGER SYSTEM ---
  // Hunger increases by 1 every 5 seconds, max 20
  const nowMs = Date.now();
  const HUNGER_MAX = 20;
  if (nowMs >= state.nextHungerAtMs) {
    const steps = Math.floor((nowMs - state.nextHungerAtMs) / 5000) + 1;
    state.hungerInt = Math.min(HUNGER_MAX, state.hungerInt + steps);
    state.nextHungerAtMs += steps * 5000;
  }

  // continuous hunger for shaders (map integer to 0..1 over 20 units)
  state.hunger = clamp01(state.hungerInt / 20);

  // Mood degrades every 5 seconds (0=Happy, 1=Meh, 2=Sad)
  if (nowMs >= state.nextMoodAtMs) {
    state.moodLevel = Math.min(2, state.moodLevel + 1);
    state.nextMoodAtMs = nowMs + 5000;
  }
  // Update sad value based on mood level for shader
  state.sad = state.moodLevel / 2.0; // 0, 0.5, or 1.0

  // Smooth size toward target size (time-based)
  // derive desired size from hunger (higher hunger => smaller size)
  const MIN_SIZE = 0.15;
  const MAX_SIZE = 0.35;
  // Use faster scaling for size (hunger 0-20 gives full effect)
  const sizeHunger = clamp01(state.hungerInt / 20);
  // invert mapping so hunger=20+ => MIN_SIZE, hunger=0 => MAX_SIZE
  state.targetSize = lerp(MIN_SIZE, MAX_SIZE, 1 - sizeHunger);
  const k = 1 - Math.exp(-RATES.sizeSmoothPerSec * dt);
  state.size = lerp(state.size, state.targetSize, k);

  // HUD - Update progress bars
  // Hunger bar: 0% when hungerInt=0, 100% when hungerInt=20
  const hungerPercent = Math.min(100, (state.hungerInt / HUNGER_MAX) * 100);
  hungerBar.style.width = hungerPercent + '%';
  // Shift gradient based on hunger level (green -> yellow -> red)
  hungerBar.style.backgroundPosition = hungerPercent + '% 0';
  
  // Mood bar: 100% when happy (moodLevel=0), 50% when meh, 0% when sad
  const moodPercent = 100 - (state.moodLevel * 50);
  moodBar.style.width = moodPercent + '%';
  
  sizeVal.textContent = state.size.toFixed(2);
  timeVal.textContent = state.t.toFixed(1);

  // Auto-rotate when enabled
  if (state.autoRotateEnabled) {
    state.rotY += dt * 0.9; // radians per second
  }
}



// =============================================================================
// RENDER FUNCTION  
// =============================================================================
// Draws the scene each frame: creature + grass ground
function render() {
  // Clear screen with light blue sky color
  gl.clearColor(0.53, 0.81, 0.92, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Enable depth testing (closer objects occlude farther ones)
  gl.enable(gl.DEPTH_TEST);
  // Disable face culling to show both sides of polygons
  gl.disable(gl.CULL_FACE);

  if (!mesh) {
    console.log("No mesh yet");
    return;
  }

  if (!window.__render_logged) {
    console.log("First render call, mesh exists with", mesh.vertCount, "vertices");
    window.__render_logged = true;
  }

  // Bind attributes
  const locPos = bindAttrib("aPos", 3, bufPos);
  const locNor = bindAttrib("aNor", 3, bufNor);
  const locCol = bindAttrib("aCol", 3, bufCol);

  // Debug logs to help diagnose missing mesh
  if (!window.__debug_logged) {
    console.log('Debug: mesh.vertCount=', mesh.vertCount, 'bufPos=', !!bufPos, 'bufNor=', !!bufNor);
    window.__debug_logged = true;
  }
  console.log('Attrib locations: aPos=', locPos, 'aNor=', locNor);
  // Peek first few position values if available
  try {
    if (mesh && mesh.pos) {
      console.log('pos[0..5]=', mesh.pos.slice(0,6));
    }
  } catch (e) {}
  // Additional GL state checks (log once)
  if (!window.__gl_state_logged) {
    try {
      gl.bindBuffer(gl.ARRAY_BUFFER, bufPos);
      const posSize = gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufNor);
      const norSize = gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE);
      console.log('GL buffers sizes (bytes): pos=', posSize, 'nor=', norSize);
      if (locPos >= 0) {
        console.log('aPos enabled=', gl.getVertexAttrib(locPos, gl.VERTEX_ATTRIB_ARRAY_ENABLED), 'buffer=', gl.getVertexAttrib(locPos, gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING));
      }
      if (locNor >= 0) {
        console.log('aNor enabled=', gl.getVertexAttrib(locNor, gl.VERTEX_ATTRIB_ARRAY_ENABLED), 'buffer=', gl.getVertexAttrib(locNor, gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING));
      }
    } catch (e) { console.warn('GL debug probe failed', e); }
    window.__gl_state_logged = true;
  }

  // Uniforms
  gl.uniform1f(uSad, state.sad);
  gl.uniform1f(uHunger, state.hunger);

  // --- SAFE DEFAULT CAMERA/PROJECTION ---
  const aspectRatio = canvas.width / canvas.height;
  const projectionMatrix = mat4Perspective(Math.PI / 4, aspectRatio, 0.1, 100.0); // 45 deg fov
  const camEye = [state.camX, state.camY, state.camZ];
  const camLook = [0, 0, 0];
  const camUp = [0, 1, 0];
  const viewMatrix = mat4LookAt(camEye, camLook, camUp);
  // Debug one-time probe of transforms
  if (!window.__render_probe_logged) {
    try {
      console.log('Canvas size (pixels):', canvas.width, canvas.height);
      console.log('GL viewport:', gl.getParameter(gl.VIEWPORT));
      console.log('Eye:', camEye);
      const debugVP = mat4Mul(projectionMatrix, viewMatrix);
      console.log('vp[0]=', debugVP[0], 'proj[0]=', projectionMatrix[0], 'view[0]=', viewMatrix[0]);
    } catch (e) { console.warn('render probe failed', e); }
    window.__render_probe_logged = true;
  }

  // Log mesh.vertCount and bounds for debug
  if (!window.__mesh_debugged) {
    console.log('mesh.vertCount =', mesh.vertCount);
    if (window.__OBJ_BOUNDS__) console.log('OBJ bounds =', window.__OBJ_BOUNDS__);
    window.__mesh_debugged = true;
  }

  // --- Scene rotation from touch controls (rotates entire scene) ---
  const sceneRotY = mat4RotateY(state.rotY);
  const sceneRotX = mat4RotateX(state.rotX);
  const sceneRotation = mat4Mul(sceneRotX, sceneRotY);

  // Build view-projection with scene rotation applied
  const viewProjection = mat4Mul(projectionMatrix, viewMatrix);
  const rotatedVP = mat4Mul(viewProjection, sceneRotation);

  // --- Build creature model matrix: scale + position on plane ---
  const meshScale = state.size; // Hunger affects size: more hungry = smaller
  const planeY = -1.5;
  // Grass surface is slightly above planeY (grass height ~10 units * 0.08 scale = 0.8)
  const grassSurfaceY = planeY + 0.8;
  // Use bounds to place creature's bottom on the grass surface
  const bounds = window.__OBJ_BOUNDS__ || { minY: 0 };
  const creatureBottomOffset = bounds.minY * meshScale;
  
  // --- IDLE ANIMATION ---
  // Makes the creature feel alive with subtle continuous movement:
  // - Bobbing: gentle up/down oscillation (like floating)
  // - Breathing: subtle scale pulse (like inhaling/exhaling)
  const idleTime = state.t;
  const bobAmount = 0.02;     // Vertical bob amplitude (units)
  const bobSpeed = 2.0;       // Bob frequency (radians per second)
  const breatheAmount = 0.015; // Scale pulse amplitude (percentage)
  const breatheSpeed = 1.5;    // Breathe frequency (radians per second)
  
  // Calculate animation offsets using sine waves
  const bobOffset = Math.sin(idleTime * bobSpeed) * bobAmount;
  const breatheScale = 1.0 + Math.sin(idleTime * breatheSpeed) * breatheAmount;
  
  const creatureY = grassSurfaceY - creatureBottomOffset + bobOffset;
  const animatedScale = meshScale * breatheScale;
  const creatureModel = mat4Mul(mat4Translate(0, creatureY, 0), mat4Scale(animatedScale, animatedScale, animatedScale));
  const creatureMVP = mat4Mul(rotatedVP, creatureModel);

  gl.uniformMatrix4fv(uModel, false, mat4Mul(sceneRotation, creatureModel));
  if (uMVP) gl.uniformMatrix4fv(uMVP, false, creatureMVP);

  // Draw creature mesh
  gl.drawArrays(gl.TRIANGLES, 0, mesh.vertCount);

  // --- Draw grass underneath the creature ---
  if (grassMesh && grassBufPos && grassBufNor && grassBufUV && grassTexture) {
    // Switch to textured shader
    gl.useProgram(texProgram);
    
    // Bind attributes for textured shader
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

    // Grass model is in XY plane with large coords (~140 units), need to:
    // 1. Scale down to fit scene
    // 2. Rotate -90 deg around X to lay flat in XZ plane
    // 3. Position at planeY
    const grassScale = 0.08; // Scale factor - large to fill bottom of scene
    const scaleM = mat4Scale(grassScale, grassScale, grassScale);
    const rotX90 = mat4RotateX(-Math.PI / 2); // Rotate to XZ plane
    const translateM = mat4Translate(0, planeY, 0);
    const grassModel = mat4Mul(translateM, mat4Mul(rotX90, scaleM));
    const grassMVP = mat4Mul(rotatedVP, grassModel);

    // Set uniforms for textured shader
    const texUMVP = gl.getUniformLocation(texProgram, "uMVP");
    const texUModel = gl.getUniformLocation(texProgram, "uModel");
    const texUTexture = gl.getUniformLocation(texProgram, "uTexture");
    
    gl.uniformMatrix4fv(texUModel, false, mat4Mul(sceneRotation, grassModel));
    gl.uniformMatrix4fv(texUMVP, false, grassMVP);
    
    // Bind texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, grassTexture);
    gl.uniform1i(texUTexture, 0);

    gl.drawArrays(gl.TRIANGLES, 0, grassMesh.vertCount);
    
    // Switch back to main shader
    gl.useProgram(program);
  }

  const err = gl.getError();
  if (err !== 0) console.warn('GL error after draw:', err);
}
