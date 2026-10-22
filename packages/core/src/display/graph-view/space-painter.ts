// Painting the 3D view (editor spec §53, scale_space_view). The view's numbers live in core space-view.ts; this file
// paints them. As in 2D (mark-painter.ts), the device picks the painter by trying each: WebGPU (space-gpu-painter.ts),
// then WebGL 2, then the plain 2D canvas (space-canvas-painter.ts), which paints blocks far ones first.
//
// Each block is one copy of a single cube, placed and coloured by numbers, so thousands of blocks take one call. The
// blocks and lines are sent to the graphics chip once; turning the camera only sends its 16 numbers.
// Text is painted by the 2D canvas on a canvas laid over this one (space-canvas-painter.ts, paintSpaceLabels).
import type { SpaceMarks, Vec3 } from '../../space-view.ts';
import { colourReader } from './gl-painter.ts';
import type { PainterKind, Paints } from './mark-painter.ts';

/** Something that paints the 3D view onto one canvas. */
export interface SpacePainter {
  readonly kind: PainterKind;
  /** The canvas's size in CSS pixels, and the device's pixels in each. Call it when the canvas is resized. */
  resize(width: number, height: number, ratio: number): void;
  /** Paints `space` as `matrix` (space-view.ts, spaceMatrix) sees it. Each call paints a whole new frame. */
  paint(space: SpaceMarks, matrix: Float32Array, paints: Paints): void;
  /** Resolves once the graphics chip has finished the frames sent, so the canvas can be read. */
  painted(): Promise<void>;
  /** Lets go of what the painter holds. */
  destroy(): void;
}

/** A way to make a 3D painter for a canvas, or null where the device cannot. */
export type SpacePainterMaker = (canvas: HTMLCanvasElement) => SpacePainter | null | Promise<SpacePainter | null>;

/** Where the light comes from: above, a little to the front and the left, so tops are brightest and sides differ. */
export const LIGHT: Vec3 = [-0.35, -0.55, 0.76];

/** The 36 points of a cube's 12 triangles, each as its corner (0 or 1 on each line) and its face's outward line. */
export function cubePoints(): Float32Array {
  // each face: its outward line, then two lines across it, so its four corners come out in order
  const faces: [Vec3, Vec3, Vec3][] = [
    [
      [0, 0, 1],
      [1, 0, 0],
      [0, 1, 0],
    ],
    [
      [0, 0, -1],
      [0, 1, 0],
      [1, 0, 0],
    ],
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    [
      [-1, 0, 0],
      [0, 0, 1],
      [0, 1, 0],
    ],
    [
      [0, 1, 0],
      [0, 0, 1],
      [1, 0, 0],
    ],
    [
      [0, -1, 0],
      [1, 0, 0],
      [0, 0, 1],
    ],
  ];
  const out: number[] = [];
  for (const [n, u, v] of faces) {
    const base = n.map((c) => (c > 0 ? 1 : 0));
    const corner = (a: number, b: number) => base.map((c, k) => c + a * (u[k] ?? 0) + b * (v[k] ?? 0));
    for (const [a, b] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
      [1, 1],
      [0, 1],
    ] as const)
      out.push(...corner(a, b), ...n);
  }
  return new Float32Array(out);
}

/** Numbers in each block: its corner and floor (3), its width, depth and height (3), its fill (4) and outline (4). */
export const BLOCK_NUMBERS = 14;
/** Numbers in each point of a line: where it is (3) and its tint (4). */
export const SPACE_POINT_NUMBERS = 7;

/** The numbers the graphics chip reads: one row per block, and one per end of each straight piece of line. */
export function spaceNumbers(space: SpaceMarks, paints: Paints): { blocks: Float32Array; lines: Float32Array } {
  const numbersOf = colourReader();
  const blocks = new Float32Array(space.blocks.length * BLOCK_NUMBERS);
  space.blocks.forEach((b, i) => {
    const paint = paints(b.style);
    const fill = numbersOf(paint.fill ?? paint.line),
      line = numbersOf(paint.line ?? paint.fill);
    blocks.set([b.x, b.y, b.floor, b.width, b.depth, b.tall, ...fill, ...line], i * BLOCK_NUMBERS);
  });
  const points: number[] = [];
  for (const l of space.lines) {
    const tint = numbersOf(paints(l.style).line);
    for (let i = 1; i < l.points.length; i++)
      points.push(...(l.points[i - 1] as Vec3), ...tint, ...(l.points[i] as Vec3), ...tint);
  }
  return { blocks, lines: new Float32Array(points) };
}

const BLOCK_VERTEX = `#version 300 es
in vec3 corner;
in vec3 facing;
in vec3 place;
in vec3 size;
in vec4 fill;
in vec4 line;
uniform mat4 matrix;
out vec3 local;
out vec3 vFacing;
out vec4 vFill;
out vec4 vLine;
void main() {
  gl_Position = matrix * vec4(place + corner * size, 1.0);
  local = corner;
  vFacing = facing;
  vFill = fill;
  vLine = line;
}`;

/** Shades a block's face by how it faces the light, and paints its edges a pixel wide in its outline colour. */
const BLOCK_FRAGMENT = `#version 300 es
precision highp float;
in vec3 local;
in vec3 vFacing;
in vec4 vFill;
in vec4 vLine;
uniform vec3 light;
out vec4 colour;
void main() {
  vec3 near = min(local, 1.0 - local) / max(fwidth(local), vec3(1e-5));
  float least = min(near.x, min(near.y, near.z));
  float most = max(near.x, max(near.y, near.z));
  float edge = near.x + near.y + near.z - least - most;
  float shade = 0.62 + 0.38 * max(dot(vFacing, light), 0.0);
  vec3 c = edge < 1.0 ? vLine.rgb : vFill.rgb * shade;
  colour = vec4(c, 1.0);
}`;

const LINE_VERTEX = `#version 300 es
in vec3 point;
in vec4 tint;
uniform mat4 matrix;
out vec4 vTint;
void main() {
  gl_Position = matrix * vec4(point, 1.0);
  vTint = tint;
}`;

const LINE_FRAGMENT = `#version 300 es
precision highp float;
in vec4 vTint;
out vec4 colour;
void main() {
  colour = vec4(vTint.rgb * vTint.a, vTint.a);
}`;

/** A program made of two shaders, or why it could not be made. */
function program(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const made = gl.createProgram();
  for (const [kind, source] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const) {
    const shader = gl.createShader(kind);
    if (!shader) throw new Error('the graphics chip made no shader');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(`a shader did not compile: ${gl.getShaderInfoLog(shader) ?? ''}`);
    gl.attachShader(made, shader);
  }
  gl.linkProgram(made);
  if (!gl.getProgramParameter(made, gl.LINK_STATUS))
    throw new Error(`the shaders did not link: ${gl.getProgramInfoLog(made) ?? ''}`);
  return made;
}

/** The WebGL 2 painter of the 3D view for `canvas`, or null where the device has no WebGL 2. */
export function webgl2SpacePainter(canvas: HTMLCanvasElement): SpacePainter | null {
  const found = canvas.getContext('webgl2', { antialias: true, premultipliedAlpha: true, depth: true });
  if (!found) return null;
  const gl: WebGL2RenderingContext = found;
  const blocks = program(gl, BLOCK_VERTEX, BLOCK_FRAGMENT),
    lines = program(gl, LINE_VERTEX, LINE_FRAGMENT);
  const buffers: WebGLBuffer[] = [];
  /** Points `names` of `prog` at `data`: each name with its count of numbers, read once per block or per point. */
  const attach = (prog: WebGLProgram, data: Float32Array, names: [string, number][], perBlock: boolean) => {
    const buffer = gl.createBuffer();
    buffers.push(buffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const stride = names.reduce((n, [, size]) => n + size, 0) * 4;
    let offset = 0;
    for (const [name, size] of names) {
      const place = gl.getAttribLocation(prog, name);
      if (place >= 0) {
        gl.enableVertexAttribArray(place);
        gl.vertexAttribPointer(place, size, gl.FLOAT, false, stride, offset);
        gl.vertexAttribDivisor(place, perBlock ? 1 : 0);
      }
      offset += size * 4;
    }
    return buffer;
  };
  const blockVao = gl.createVertexArray(),
    lineVao = gl.createVertexArray();
  gl.bindVertexArray(blockVao);
  attach(
    blocks,
    cubePoints(),
    [
      ['corner', 3],
      ['facing', 3],
    ],
    false,
  );
  const blockNames: [string, number][] = [
    ['place', 3],
    ['size', 3],
    ['fill', 4],
    ['line', 4],
  ];
  let blockBuffer = attach(blocks, new Float32Array(BLOCK_NUMBERS), blockNames, true);
  gl.bindVertexArray(lineVao);
  const lineNames: [string, number][] = [
    ['point', 3],
    ['tint', 4],
  ];
  let lineBuffer = attach(lines, new Float32Array(SPACE_POINT_NUMBERS), lineNames, false);
  gl.bindVertexArray(null);
  let sent: { space: SpaceMarks; paints: Paints; blocks: number; points: number } | null = null;

  /** Sends `space`'s numbers to the graphics chip, only when the drawing or its colours change. */
  const send = (space: SpaceMarks, paints: Paints) => {
    if (sent && sent.space === space && sent.paints === paints) return sent;
    const numbers = spaceNumbers(space, paints);
    for (const b of [blockBuffer, lineBuffer]) gl.deleteBuffer(b);
    gl.bindVertexArray(blockVao);
    blockBuffer = attach(blocks, numbers.blocks, blockNames, true);
    gl.bindVertexArray(lineVao);
    lineBuffer = attach(lines, numbers.lines, lineNames, false);
    gl.bindVertexArray(null);
    sent = {
      space,
      paints,
      blocks: space.blocks.length,
      points: numbers.lines.length / SPACE_POINT_NUMBERS,
    };
    return sent;
  };
  return {
    kind: 'webgl2',
    resize(w, h, ratio) {
      canvas.width = Math.max(1, Math.round(w * ratio));
      canvas.height = Math.max(1, Math.round(h * ratio));
      gl.viewport(0, 0, canvas.width, canvas.height);
    },
    paint(space, matrix, paints) {
      const counts = send(space, paints);
      gl.clearColor(0, 0, 0, 0);
      gl.clearDepth(1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.BLEND);
      gl.useProgram(blocks);
      gl.uniformMatrix4fv(gl.getUniformLocation(blocks, 'matrix'), false, matrix);
      gl.uniform3f(gl.getUniformLocation(blocks, 'light'), ...LIGHT);
      gl.bindVertexArray(blockVao);
      if (counts.blocks) gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, counts.blocks);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(lines);
      gl.uniformMatrix4fv(gl.getUniformLocation(lines, 'matrix'), false, matrix);
      gl.bindVertexArray(lineVao);
      if (counts.points) gl.drawArrays(gl.LINES, 0, counts.points);
      gl.bindVertexArray(null);
    },
    painted() {
      gl.finish();
      return Promise.resolve();
    },
    destroy() {
      for (const b of buffers) gl.deleteBuffer(b);
      gl.deleteVertexArray(blockVao);
      gl.deleteVertexArray(lineVao);
      gl.deleteProgram(blocks);
      gl.deleteProgram(lines);
      canvas.width = canvas.height = 0;
    },
  };
}
