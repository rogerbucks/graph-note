// The WebGPU painter (editor spec §53, scale_gpu_painters; wiki/Massive-graphs-design.md, way E, step 4). It is the
// fastest painter, and the first one tried. Desktop Chrome and Edge have WebGPU, and so does Safari from iOS 26 and
// macOS 26. It paints as the WebGL 2 painter does (gl-painter.ts). Each box is one copy of a single square, and links
// and arrowheads are lines and triangles. Each run of boxes, or of lines, in a row is one draw call.
//
// It paints shapes only. The 2D canvas painter paints the text on a canvas laid over this one (mark-painter.ts).
import type { DrawMark } from '../../drawing-marks.ts';
import type { MarkPoint } from '../../plugin-diagrams.ts';
import { colourReader, linePoints } from './gl-painter.ts';
import type { MarkPainter } from './mark-painter.ts';

/** The shaders: a box is placed and coloured as in the WebGL 2 painter; a line's or triangle's point keeps its tint. */
const SHADERS = `
struct View { camera: vec4f, screen: vec4f };
@group(0) @binding(0) var<uniform> view: View;

fn placed(at: vec2f) -> vec4f {
  let p = (at - view.camera.xy) * view.camera.z;
  return vec4f(p.x / view.screen.x * 2.0 - 1.0, 1.0 - p.y / view.screen.y * 2.0, 0.0, 1.0);
}

struct BoxOut {
  @builtin(position) position: vec4f,
  @location(0) inBox: vec2f,
  @location(1) pixels: vec2f,
  @location(2) fill: vec4f,
  @location(3) line: vec4f,
  @location(4) @interpolate(flat) shape: f32,
};

@vertex fn boxVertex(@builtin(vertex_index) v: u32, @location(0) box: vec4f, @location(1) fill: vec4f,
    @location(2) line: vec4f, @location(3) shape: f32) -> BoxOut {
  let corner = vec2f(f32(v & 1u), f32(v >> 1u));
  var o: BoxOut;
  // half a pixel more on every side, as an outline is painted across the box's edge
  o.position = placed(box.xy + corner * box.zw + (corner * 2.0 - 1.0) * (0.5 / view.camera.z));
  o.pixels = box.zw * view.camera.z;
  o.inBox = corner * (o.pixels + 1.0) - 0.5;
  o.fill = fill;
  o.line = line;
  o.shape = shape;
  return o;
}

@fragment fn boxFragment(i: BoxOut) -> @location(0) vec4f {
  let near = min(i.inBox, i.pixels - i.inBox);
  var edge = min(near.x, near.y);
  let centred = abs(i.inBox / i.pixels * 2.0 - 1.0);
  let radius = min(i.pixels.x, i.pixels.y) / 2.0;
  if (i.shape > 0.5 && i.shape < 1.5) { edge = (1.0 - length(centred)) * radius; }
  if (i.shape > 1.5) { edge = (1.0 - centred.x - centred.y) * radius; }
  var c = i.fill;
  if (edge < 0.5 && i.line.a > 0.0) { c = i.line; }
  if (edge < -0.5 || c.a <= 0.0) { discard; }
  return vec4f(c.rgb * c.a, c.a);
}

struct LineOut { @builtin(position) position: vec4f, @location(0) tint: vec4f };

@vertex fn lineVertex(@location(0) point: vec2f, @location(1) tint: vec4f) -> LineOut {
  var o: LineOut;
  o.position = placed(point);
  o.tint = tint;
  return o;
}

@fragment fn lineFragment(i: LineOut) -> @location(0) vec4f {
  return vec4f(i.tint.rgb * i.tint.a, i.tint.a);
}
`;

/** Numbers in each box: where it is (4), its fill (4), its outline (4) and its shape (1). */
const BOX_NUMBERS = 13;
/** Numbers in each point of a line or triangle: where it is (2) and its tint (4). */
const POINT_NUMBERS = 6;

/** WebGPU's flags, by their numbers in the standard, as not every browser's types name them. */
const VERTEX_STAGE = 0x1,
  COPY_IN_USE = 0x8,
  VERTEX_USE = 0x20,
  UNIFORM_USE = 0x40;

/** The shape number a box's fragment reads: 0 a rectangle, 1 an ellipse, 2 a diamond. */
const SHAPE_NUMBER: Partial<Record<string, number>> = { ellipse: 1, diamond: 2 };

/** One draw: which pipeline, the numbers it reads, and how many points or boxes. */
interface Draw {
  pipeline: 'box' | 'line' | 'triangle';
  data: Float32Array;
  count: number;
}

/** The WebGPU painter for `canvas`, or null where the device has no WebGPU, or no graphics chip for it. */
export async function webgpuPainter(canvas: HTMLCanvasElement): Promise<MarkPainter | null> {
  const gpu = canvas.ownerDocument.defaultView?.navigator.gpu;
  if (!gpu) return null;
  const chip = await gpu.requestAdapter();
  if (!chip) return null;
  const device = await chip.requestDevice();
  const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
  if (!context) {
    device.destroy();
    return null;
  }
  // one channel order everywhere: read back, a preferred order of blue first came out with red and blue swapped
  const format: GPUTextureFormat = 'rgba8unorm';
  context.configure({ device, format, alphaMode: 'premultiplied' });
  const module = device.createShaderModule({ code: SHADERS });
  const blend: GPUBlendState = {
    color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
  };
  const layout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: VERTEX_STAGE, buffer: {} }],
  });
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
  const f32 = (location: number, components: 1 | 2 | 4, offset: number): GPUVertexAttribute => ({
    shaderLocation: location,
    offset: offset * 4,
    format: components === 1 ? 'float32' : components === 2 ? 'float32x2' : 'float32x4',
  });
  // made before the first frame, never while painting it
  const boxPipeline = device.createRenderPipelineAsync({
    layout: pipelineLayout,
    vertex: {
      module,
      entryPoint: 'boxVertex',
      buffers: [
        {
          arrayStride: BOX_NUMBERS * 4,
          stepMode: 'instance',
          attributes: [f32(0, 4, 0), f32(1, 4, 4), f32(2, 4, 8), f32(3, 1, 12)],
        },
      ],
    },
    fragment: { module, entryPoint: 'boxFragment', targets: [{ format, blend }] },
    primitive: { topology: 'triangle-strip' },
  });
  const pointPipeline = (topology: GPUPrimitiveTopology) =>
    device.createRenderPipelineAsync({
      layout: pipelineLayout,
      vertex: {
        module,
        entryPoint: 'lineVertex',
        buffers: [{ arrayStride: POINT_NUMBERS * 4, attributes: [f32(0, 2, 0), f32(1, 4, 2)] }],
      },
      fragment: { module, entryPoint: 'lineFragment', targets: [{ format, blend }] },
      primitive: { topology },
    });
  const [box, line, triangle] = await Promise.all([
    boxPipeline,
    pointPipeline('line-list'),
    pointPipeline('triangle-list'),
  ]);
  const pipelines = { box, line, triangle };
  const viewBuffer = device.createBuffer({ size: 32, usage: UNIFORM_USE | COPY_IN_USE });
  const bindGroup = device.createBindGroup({ layout, entries: [{ binding: 0, resource: { buffer: viewBuffer } }] });
  const numbersOf = colourReader();
  let width = 1,
    height = 1,
    vertexSize = 0;
  let vertices: GPUBuffer | undefined;
  // held until destroyed: Chrome lost the device once nothing held its adapter
  let held: GPUAdapter | null = chip;
  return {
    kind: 'webgpu',
    resize(w, h, ratio) {
      width = Math.max(1, w);
      height = Math.max(1, h);
      canvas.width = Math.max(1, Math.round(w * ratio));
      canvas.height = Math.max(1, Math.round(h * ratio));
    },
    paint(marks, camera, paints) {
      if (!held) return;
      const draws: Draw[] = [];
      let boxes: number[] = [],
        lines: number[] = [],
        triangles: number[] = [];
      const flush = () => {
        if (boxes.length)
          draws.push({ pipeline: 'box', data: new Float32Array(boxes), count: boxes.length / BOX_NUMBERS });
        if (lines.length)
          draws.push({ pipeline: 'line', data: new Float32Array(lines), count: lines.length / POINT_NUMBERS });
        if (triangles.length)
          draws.push({
            pipeline: 'triangle',
            data: new Float32Array(triangles),
            count: triangles.length / POINT_NUMBERS,
          });
        boxes = [];
        lines = [];
        triangles = [];
      };
      let last: 'box' | 'line' | null = null;
      for (const m of marks) {
        if (m.kind === 'label') continue;
        const kind = m.kind === 'box' || m.kind === 'group' ? 'box' : 'line';
        if (kind !== last) flush();
        last = kind;
        addMark(m, paints(m.style), boxes, lines, triangles);
      }
      flush();
      device.queue.writeBuffer(
        viewBuffer,
        0,
        new Float32Array([camera.x, camera.y, camera.scale, 0, width, height, 0, 0]),
      );
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      pass.setBindGroup(0, bindGroup);
      // every draw's numbers in one buffer, written once a frame; it grows to twice what is needed when too small
      const total = draws.reduce((n, d) => n + d.data.length, 0);
      if (total * 4 > vertexSize) {
        vertices?.destroy();
        vertexSize = Math.max(4096, 2 ** Math.ceil(Math.log2(total * 4)));
        vertices = device.createBuffer({ size: vertexSize, usage: VERTEX_USE | COPY_IN_USE });
      }
      const all = new Float32Array(total);
      let offset = 0;
      for (const d of draws) {
        all.set(d.data, offset);
        offset += d.data.length;
      }
      if (vertices && total) device.queue.writeBuffer(vertices, 0, all);
      offset = 0;
      for (const d of draws) {
        if (!vertices) break;
        pass.setPipeline(pipelines[d.pipeline]);
        pass.setVertexBuffer(0, vertices, offset * 4, d.data.byteLength);
        if (d.pipeline === 'box') pass.draw(4, d.count);
        else pass.draw(d.count);
        offset += d.data.length;
      }
      pass.end();
      device.queue.submit([encoder.finish()]);
    },
    painted: () => device.queue.onSubmittedWorkDone(),
    destroy() {
      held = null;
      viewBuffer.destroy();
      vertices?.destroy();
      context.unconfigure();
      device.destroy();
      canvas.width = canvas.height = 0;
    },
  };

  /** The numbers of mark `m`, painted with `paint`, added to the box, line or triangle numbers. */
  function addMark(
    m: DrawMark,
    paint: { fill?: string; line?: string },
    boxes: number[],
    lines: number[],
    triangles: number[],
  ) {
    const line = numbersOf(paint.line);
    if (m.kind === 'box' || m.kind === 'group') {
      const shape = m.kind === 'box' ? (SHAPE_NUMBER[m.shape ?? 'rect'] ?? 0) : 0;
      boxes.push(m.x, m.y, m.width, m.height, ...numbersOf(paint.fill), ...line, shape);
    } else if (m.kind === 'link') {
      const pts = linePoints(m.points, m.curve === true);
      for (let i = 1; i < pts.length; i++) {
        const [a, b] = [pts[i - 1], pts[i]] as [MarkPoint, MarkPoint];
        lines.push(a[0], a[1], ...line, b[0], b[1], ...line);
      }
    } else if (m.kind === 'arrowhead') {
      const turn = (m.angle * Math.PI) / 180,
        cos = Math.cos(turn),
        sin = Math.sin(turn);
      const back = (side: number) => [
        m.x - m.size * cos + (side * m.size * sin) / 2,
        m.y - m.size * sin - (side * m.size * cos) / 2,
      ];
      triangles.push(m.x, m.y, ...line, ...back(1), ...line, ...back(-1), ...line);
    }
  }
}
