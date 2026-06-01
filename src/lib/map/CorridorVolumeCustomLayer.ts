import mapboxgl from "mapbox-gl";
import type { Feature, Polygon } from "geojson";

// 1:1 real metres — consistent with model-translation z and fill-extrusion-height
const ALTITUDE_SCALE = 1.0;

// Green tint matching the 2D fill layer (#22c55e)
const CORRIDOR_RGB: [number, number, number] = [0.133, 0.773, 0.369];
const ALPHA_CENTER = 0.45; // high-confidence spine — most opaque
const ALPHA_EDGE   = 0.04; // low-confidence outer edge — nearly invisible

// Vertex buffer stride: [x, y, z, t]
//   t = 0  → centre spine  (high confidence)
//   t = 1  → outer edge    (low confidence)
const STRIDE = 4;

type Mesh = { buf: WebGLBuffer; count: number };

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

/**
 * Renders the transit corridor as a single 3D volume whose opacity fades from the
 * centre spine (highest confidence) to the outer walls (lowest confidence).
 * Only the outermost ("low") boundary feature is consumed; the gradient is produced
 * by a WebGL varying `v_t` passed from the vertex shader.
 *
 * Top caps are intentionally omitted — the 2D fill layer handles the ground
 * footprint, so nested volumes never occlude each other.
 */
export class CorridorVolumeCustomLayer {
  readonly id = "corridor-volume-custom";
  readonly type = "custom" as const;
  readonly renderingMode = "3d" as const;

  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private aPos = -1;
  private aTVal = -1;
  private uMatrix: WebGLUniformLocation | null = null;
  private uRgb: WebGLUniformLocation | null = null;
  private uAlphaCenter: WebGLUniformLocation | null = null;
  private uAlphaEdge: WebGLUniformLocation | null = null;
  private meshes: Mesh[] = [];
  private pendingFeatures: readonly Feature[] | null = null;

  onAdd(_map: mapboxgl.Map, gl: WebGLRenderingContext): void {
    this.gl = gl;

    const vs = compileShader(gl, gl.VERTEX_SHADER, `
      attribute vec3 a_pos;
      attribute float a_t;
      uniform mat4 u_matrix;
      varying float v_t;
      void main() {
        gl_Position = u_matrix * vec4(a_pos, 1.0);
        v_t = a_t;
      }
    `);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, `
      precision mediump float;
      uniform vec3 u_rgb;
      uniform float u_alphaCenter;
      uniform float u_alphaEdge;
      varying float v_t;
      void main() {
        /* Quadratic falloff: fade accelerates toward the outer edge */
        float alpha = mix(u_alphaCenter, u_alphaEdge, v_t * v_t);
        gl_FragColor = vec4(u_rgb, alpha);
      }
    `);

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    this.program = prog;
    this.aPos   = gl.getAttribLocation(prog, "a_pos");
    this.aTVal  = gl.getAttribLocation(prog, "a_t");
    this.uMatrix      = gl.getUniformLocation(prog, "u_matrix");
    this.uRgb         = gl.getUniformLocation(prog, "u_rgb");
    this.uAlphaCenter = gl.getUniformLocation(prog, "u_alphaCenter");
    this.uAlphaEdge   = gl.getUniformLocation(prog, "u_alphaEdge");

    if (this.pendingFeatures) {
      this._buildMeshes(this.pendingFeatures);
      this.pendingFeatures = null;
    }
  }

  updateFeatures(features: readonly Feature[]): void {
    if (!this.gl) {
      this.pendingFeatures = features;
      return;
    }
    this._buildMeshes(features);
  }

  private _buildMeshes(features: readonly Feature[]): void {
    const gl = this.gl!;
    for (const m of this.meshes) gl.deleteBuffer(m.buf);
    this.meshes = [];

    for (const f of features) {
      const props = f.properties as Record<string, unknown> | null;
      if (props?.kind !== "transitOpportunityCorridorVolume") continue;
      if (f.geometry.type !== "Polygon") continue;
      // Only consume the outermost ("low") boundary; gradient covers full width.
      if (String(props.confidence ?? "low") !== "low") continue;

      const height = (Number(props.volumeHeightMeters) || 0) * ALTITUDE_SCALE;
      const ring   = (f.geometry as Polygon).coordinates[0];
      if (ring.length < 5) continue;

      // ring = [nearLeft, nearRight, farRight, farLeft, nearLeft]  (closed)
      const mc = (i: number, z: number) =>
        mapboxgl.MercatorCoordinate.fromLngLat({ lng: ring[i]![0], lat: ring[i]![1] }, z);

      const nLb = mc(0, 0); const nLt = mc(0, height); // nearLeft  bottom / top
      const nRb = mc(1, 0); const nRt = mc(1, height); // nearRight
      const fRb = mc(2, 0); const fRt = mc(2, height); // farRight
      const fLb = mc(3, 0); const fLt = mc(3, height); // farLeft

      // Centre vertices for near- and far-face gradient tents (t = 0)
      const avgLng = (i: number, j: number) => (ring[i]![0] + ring[j]![0]) / 2;
      const avgLat = (i: number, j: number) => (ring[i]![1] + ring[j]![1]) / 2;

      const ncb = mapboxgl.MercatorCoordinate.fromLngLat({ lng: avgLng(0,1), lat: avgLat(0,1) }, 0);
      const nct = mapboxgl.MercatorCoordinate.fromLngLat({ lng: avgLng(0,1), lat: avgLat(0,1) }, height);
      const fcb = mapboxgl.MercatorCoordinate.fromLngLat({ lng: avgLng(2,3), lat: avgLat(2,3) }, 0);
      const fct = mapboxgl.MercatorCoordinate.fromLngLat({ lng: avgLng(2,3), lat: avgLat(2,3) }, height);

      // [x, y, z, t]
      const verts: number[] = [];
      const push = (c: mapboxgl.MercatorCoordinate, t: number) =>
        verts.push(c.x, c.y, c.z, t);
      const tri = (
        a: [mapboxgl.MercatorCoordinate, number],
        b: [mapboxgl.MercatorCoordinate, number],
        c: [mapboxgl.MercatorCoordinate, number],
      ) => { push(a[0], a[1]); push(b[0], b[1]); push(c[0], c[1]); };

      // Near face — gradient tent (left edge t=1, centre t=0, right edge t=1)
      tri([nLb,1], [ncb,0], [nLt,1]);  tri([nLt,1], [ncb,0], [nct,0]);
      tri([ncb,0], [nRb,1], [nct,0]);  tri([nct,0], [nRb,1], [nRt,1]);

      // Far face — gradient tent
      tri([fRb,1], [fcb,0], [fRt,1]);  tri([fRt,1], [fcb,0], [fct,0]);
      tri([fcb,0], [fLb,1], [fct,0]);  tri([fct,0], [fLb,1], [fLt,1]);

      // Right side wall (uniform t=1 — outer edge)
      tri([nRb,1], [fRb,1], [nRt,1]);  tri([nRt,1], [fRb,1], [fRt,1]);

      // Left side wall (uniform t=1 — outer edge)
      tri([fLb,1], [nLb,1], [fLt,1]);  tri([fLt,1], [nLb,1], [nLt,1]);

      const buf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
      this.meshes.push({ buf, count: verts.length / STRIDE });
    }
  }

  render(gl: WebGLRenderingContext, matrix: number[]): void {
    if (!this.program || this.meshes.length === 0) return;

    gl.useProgram(this.program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    // Don't write depth — aircraft model rendered after always wins
    gl.depthMask(false);

    gl.uniformMatrix4fv(this.uMatrix, false, matrix);
    gl.uniform3fv(this.uRgb, CORRIDOR_RGB);
    gl.uniform1f(this.uAlphaCenter!, ALPHA_CENTER);
    gl.uniform1f(this.uAlphaEdge!,   ALPHA_EDGE);

    const BYTES = 4;
    for (const { buf, count } of this.meshes) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(this.aPos);
      gl.vertexAttribPointer(this.aPos,  3, gl.FLOAT, false, STRIDE * BYTES, 0);
      gl.enableVertexAttribArray(this.aTVal);
      gl.vertexAttribPointer(this.aTVal, 1, gl.FLOAT, false, STRIDE * BYTES, 3 * BYTES);
      gl.drawArrays(gl.TRIANGLES, 0, count);
    }

    gl.depthMask(true);
    gl.disableVertexAttribArray(this.aPos);
    gl.disableVertexAttribArray(this.aTVal);
  }

  onRemove(_map: mapboxgl.Map, gl: WebGLRenderingContext): void {
    for (const m of this.meshes) gl.deleteBuffer(m.buf);
    this.meshes = [];
    if (this.program) {
      gl.deleteProgram(this.program);
      this.program = null;
    }
    this.gl = null;
  }
}
