// The WebGL 2 painter (editor spec §53, scale_gpu_painters; wiki/Massive-graphs-design.md, way E, step 4). It paints
// marks on the graphics chip, for a device with no WebGPU. Every box is one copy of a single square, placed and coloured
// by numbers, so thousands of boxes take one call. Links and arrowheads are painted as lines and triangles.
//
// It paints shapes only. The 2D canvas painter paints the text on a canvas laid over this one (mark-painter.ts).
// Marks are painted in the order given. Each run of boxes, or of lines, in a row is painted in one call.
import type { DrawMark } from '../../drawing-marks.ts';
import type { MarkPoint } from '../../plugin-diagrams.ts';
import { rgbaOf } from '../../colour-numbers.ts';
import type { Rgba } from '../../colour-numbers.ts';
import type { Camera, MarkPainter, Paints } from './mark-painter.ts';

/** Places a box's square on the screen, and gives the fragment its place in the box and the box's size, in pixels. */
const BOX_VERTEX = `#version 300 es
in vec2 corner;
in vec4 box;
in vec4 fill;
in vec4 line;
in float shape;
uniform vec3 camera;
uniform vec2 screen;
out vec2 inBox;
out vec2 pixels;
out vec4 vFill;
out vec4 vLine;
out float vShape;
void main() {
  // half a pixel more on every side, as an outline is painted across the box's edge
  vec2 at = ((box.xy + corner * box.zw) - camera.xy) * camera.z + (corner * 2.0 - 1.0) * 0.5;
  gl_Position = vec4(at / screen * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;
  pixels = box.zw * camera.z;
  inBox = corner * (pixels + 1.0) - 0.5;
  vFill = fill;
  vLine = line;
  vShape = shape;
}`;

/** Colours a box: its outline one pixel wide across its edge, as a 2D canvas strokes it, and its inside in the fill. */
const BOX_FRAGMENT = `#version 300 es
precision highp float;
in vec2 inBox;
in vec2 pixels;
in vec4 vFill;
in vec4 vLine;
in float vShape;
out vec4 colour;
void main() {
  vec2 near = min(inBox, pixels - inBox);
  float edge = min(near.x, near.y);
  vec2 centred = abs(inBox / pixels * 2.0 - 1.0);
  float radius = min(pixels.x, pixels.y) / 2.0;
  if (vShape > 0.5 && vShape < 1.5) edge = (1.0 - length(centred)) * radius;
  if (vShape > 1.5) edge = (1.0 - centred.x - centred.y) * radius;
  if (edge < -0.5) discard;
  vec4 c = edge < 0.5 && vLine.a > 0.0 ? vLine : vFill;
  if (c.a <= 0.0) discard;
  colour = vec4(c.rgb * c.a, c.a);
}`;

/** Places a point of a line or a triangle on the screen. */
const LINE_VERTEX = `#version 300 es
in vec2 point;
in vec4 tint;
uniform vec3 camera;
uniform vec2 screen;
out vec4 vTint;
void main() {
  vec2 at = (point - camera.xy) * camera.z;
  gl_Position = vec4(at / screen * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;
  vTint = tint;
}`;

const LINE_FRAGMENT = `#version 300 es
precision highp float;
in vec4 vTint;
out vec4 colour;
void main() {
  colour = vec4(vTint.rgb * vTint.a, vTint.a);
}`;

/**
 * Reads any colour a theme names as four numbers, through a 2D canvas, which writes each back in one of three plain
 * forms (colour-numbers.ts). Each colour is read once.
 */
export function colourReader(): (css: string | undefined) => Rgba {
  const probe = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(1, 1).getContext('2d') : null;
  const colours = new Map<string, Rgba>();
  return (css) => {
    if (!css) return [0, 0, 0, 0];
    let c = colours.get(css);
    if (!c) {
      if (probe) {
        probe.fillStyle = 'transparent';
        probe.fillStyle = css;
      }
      c = rgbaOf(probe && typeof probe.fillStyle === 'string' ? probe.fillStyle : css);
      colours.set(css, c);
    }
    return c;
  };
}

/** How many points a curve's every part is painted with. */
const CURVE_STEPS = 8;

/** The points of a link as straight lines: a curve's parts are cut into short straight pieces. */
export function linePoints(points: readonly MarkPoint[], curve: boolean): MarkPoint[] {
  if (!curve) return [...points];
  const [first] = points;
  if (!first) return [];
  const out: MarkPoint[] = [first];
  for (let i = 1; i + 2 < points.length; i += 3) {
    const [p0, p1, p2, p3] = points.slice(i - 1, i + 3) as [MarkPoint, MarkPoint, MarkPoint, MarkPoint];
    for (let s = 1; s <= CURVE_STEPS; s++) {
      const t = s / CURVE_STEPS,
        u = 1 - t;
      const at = (k: 0 | 1) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k];
      out.push([at(0), at(1)]);
    }
  }
  return out;
}

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

/** One attribute of a program, fed from its own buffer: its place, how many numbers, and once per box or per point. */
function feed(gl: WebGL2RenderingContext, prog: WebGLProgram, name: string, size: number, perBox: boolean) {
  const place = gl.getAttribLocation(prog, name);
  const buffer = gl.createBuffer();
  return {
    set(data: Float32Array) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(place);
      gl.vertexAttribPointer(place, size, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(place, perBox ? 1 : 0);
    },
    destroy: () => gl.deleteBuffer(buffer),
  };
}

/** The shape number a box's fragment reads: 0 a rectangle, 1 an ellipse, 2 a diamond. */
const SHAPE_NUMBER: Partial<Record<string, number>> = { ellipse: 1, diamond: 2 };

/** The WebGL 2 painter for `canvas`, or null where the device has no WebGL 2. */
export function webgl2Painter(canvas: HTMLCanvasElement): MarkPainter | null {
  const found = canvas.getContext('webgl2', { antialias: true, premultipliedAlpha: true });
  if (!found) return null;
  const gl: WebGL2RenderingContext = found;
  const boxes = program(gl, BOX_VERTEX, BOX_FRAGMENT),
    lines = program(gl, LINE_VERTEX, LINE_FRAGMENT);
  const boxVao = gl.createVertexArray(),
    lineVao = gl.createVertexArray();
  gl.bindVertexArray(boxVao);
  const corner = feed(gl, boxes, 'corner', 2, false),
    box = feed(gl, boxes, 'box', 4, true),
    fill = feed(gl, boxes, 'fill', 4, true),
    line = feed(gl, boxes, 'line', 4, true),
    shape = feed(gl, boxes, 'shape', 1, true);
  corner.set(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]));
  gl.bindVertexArray(lineVao);
  const point = feed(gl, lines, 'point', 2, false),
    tint = feed(gl, lines, 'tint', 4, false);
  gl.bindVertexArray(null);
  const numbersOf = colourReader();
  let width = 1,
    height = 1;
  const uniforms = (prog: WebGLProgram, camera: Camera) => {
    gl.useProgram(prog);
    gl.uniform3f(gl.getUniformLocation(prog, 'camera'), camera.x, camera.y, camera.scale);
    gl.uniform2f(gl.getUniformLocation(prog, 'screen'), width, height);
  };
  return {
    kind: 'webgl2',
    resize(w, h, ratio) {
      width = Math.max(1, w);
      height = Math.max(1, h);
      canvas.width = Math.max(1, Math.round(w * ratio));
      canvas.height = Math.max(1, Math.round(h * ratio));
      gl.viewport(0, 0, canvas.width, canvas.height);
    },
    paint(marks, camera, paints) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      let run: DrawMark[] = [];
      let runKind: 'box' | 'line' | null = null;
      const flush = () => {
        if (runKind === 'box') paintBoxes(run, camera, paints);
        if (runKind === 'line') paintLines(run, camera, paints);
        run = [];
      };
      for (const m of marks) {
        if (m.kind === 'label') continue;
        const kind = m.kind === 'box' || m.kind === 'group' ? 'box' : 'line';
        if (kind !== runKind) flush();
        runKind = kind;
        run.push(m);
      }
      flush();
    },
    painted() {
      gl.finish();
      return Promise.resolve();
    },
    destroy() {
      for (const f of [corner, box, fill, line, shape, point, tint]) f.destroy();
      gl.deleteVertexArray(boxVao);
      gl.deleteVertexArray(lineVao);
      gl.deleteProgram(boxes);
      gl.deleteProgram(lines);
      canvas.width = canvas.height = 0;
    },
  };

  function paintBoxes(run: readonly DrawMark[], camera: Camera, paints: Paints) {
    const n = run.length,
      at = new Float32Array(n * 4),
      fills = new Float32Array(n * 4),
      outlines = new Float32Array(n * 4),
      shapes = new Float32Array(n);
    run.forEach((m, i) => {
      if (m.kind !== 'box' && m.kind !== 'group') return;
      at.set([m.x, m.y, m.width, m.height], i * 4);
      const paint = paints(m.style);
      fills.set(numbersOf(paint.fill), i * 4);
      outlines.set(numbersOf(paint.line), i * 4);
      shapes[i] = m.kind === 'box' ? (SHAPE_NUMBER[m.shape ?? 'rect'] ?? 0) : 0;
    });
    uniforms(boxes, camera);
    gl.bindVertexArray(boxVao);
    box.set(at);
    fill.set(fills);
    line.set(outlines);
    shape.set(shapes);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    gl.bindVertexArray(null);
  }

  function paintLines(run: readonly DrawMark[], camera: Camera, paints: Paints) {
    const segments: number[] = [],
      segmentTints: number[] = [],
      triangles: number[] = [],
      triangleTints: number[] = [];
    for (const m of run) {
      const c = numbersOf(paints(m.style).line);
      if (m.kind === 'link') {
        const pts = linePoints(m.points, m.curve === true);
        for (let i = 1; i < pts.length; i++) {
          const [a, b] = [pts[i - 1], pts[i]] as [MarkPoint, MarkPoint];
          segments.push(a[0], a[1], b[0], b[1]);
          segmentTints.push(...c, ...c);
        }
      } else if (m.kind === 'arrowhead') {
        const turn = (m.angle * Math.PI) / 180,
          cos = Math.cos(turn),
          sin = Math.sin(turn);
        const back = (side: number) => [
          m.x - m.size * cos + (side * m.size * sin) / 2,
          m.y - m.size * sin - (side * m.size * cos) / 2,
        ];
        triangles.push(m.x, m.y, ...back(1), ...back(-1));
        triangleTints.push(...c, ...c, ...c);
      }
    }
    uniforms(lines, camera);
    gl.bindVertexArray(lineVao);
    if (segments.length) {
      point.set(new Float32Array(segments));
      tint.set(new Float32Array(segmentTints));
      gl.drawArrays(gl.LINES, 0, segments.length / 2);
    }
    if (triangles.length) {
      point.set(new Float32Array(triangles));
      tint.set(new Float32Array(triangleTints));
      gl.drawArrays(gl.TRIANGLES, 0, triangles.length / 2);
    }
    gl.bindVertexArray(null);
  }
}
