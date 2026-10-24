// The WebGPU painter of the 3D view (editor spec §53, scale_space_view). It is tried first. It paints as the WebGL 2
// painter does (space-painter.ts). Each block is one copy of a cube, shaded by how it faces the light. Its edges are in
// its outline colour. Blocks and lines are sent to the graphics chip once; a turn of the camera sends 16 numbers.
import type { SpaceMarks } from '../../space-view.ts';
import type { Paints } from './mark-painter.ts';
import {
  BLOCK_NUMBERS,
  LIGHT,
  SHAPE_POINT_NUMBERS,
  SPACE_POINT_NUMBERS,
  ballPoints,
  cubePoints,
  spaceNumbers,
} from './space-painter.ts';
import type { SpacePainter } from './space-painter.ts';

/** The shaders. The camera's matrix gives depth from -1 to 1, as WebGL reads it; WebGPU reads 0 to 1, so it is moved. */
const SHADERS = `
struct View { matrix: mat4x4f, light: vec4f };
@group(0) @binding(0) var<uniform> view: View;

fn placed(at: vec3f) -> vec4f {
  var p = view.matrix * vec4f(at, 1.0);
  p.z = (p.z + p.w) * 0.5;
  return p;
}

struct BlockOut {
  @builtin(position) position: vec4f,
  @location(0) local: vec3f,
  @location(1) facing: vec3f,
  @location(2) fill: vec4f,
  @location(3) line: vec4f,
};

@vertex fn blockVertex(@location(0) corner: vec3f, @location(1) facing: vec3f, @location(2) place: vec3f,
    @location(3) size: vec3f, @location(4) fill: vec4f, @location(5) line: vec4f) -> BlockOut {
  var o: BlockOut;
  o.position = placed(place + corner * size);
  o.local = corner;
  o.facing = facing;
  o.fill = fill;
  o.line = line;
  return o;
}

@fragment fn blockFragment(i: BlockOut) -> @location(0) vec4f {
  let near = min(i.local, vec3f(1.0) - i.local) / max(fwidth(i.local), vec3f(1e-5));
  let least = min(near.x, min(near.y, near.z));
  let most = max(near.x, max(near.y, near.z));
  let edge = near.x + near.y + near.z - least - most;
  let facing = normalize(i.facing);
  let lit = max(dot(facing, view.light.xyz), 0.0);
  var c = i.fill.rgb * (0.62 + 0.38 * lit);
  if (edge < 1.0) { c = i.line.rgb; }
  // a ball (light.w is 1) has no edges: it is lit smoothly, with a shine where the light meets it
  if (view.light.w > 0.5) { c = i.fill.rgb * (0.55 + 0.45 * lit) + vec3f(0.25) * pow(lit, 24.0); }
  return vec4f(c, 1.0);
}

struct LineOut { @builtin(position) position: vec4f, @location(0) tint: vec4f };

@vertex fn lineVertex(@location(0) point: vec3f, @location(1) tint: vec4f) -> LineOut {
  var o: LineOut;
  o.position = placed(point);
  o.tint = tint;
  return o;
}

@fragment fn lineFragment(i: LineOut) -> @location(0) vec4f {
  return vec4f(i.tint.rgb * i.tint.a, i.tint.a);
}
`;

/** WebGPU's flags, by their numbers in the standard, as not every browser's types name them. */
const VERTEX_STAGE = 0x1,
  FRAGMENT_STAGE = 0x2,
  COPY_IN_USE = 0x8,
  VERTEX_USE = 0x20,
  UNIFORM_USE = 0x40,
  DRAW_TARGET = 0x10;

/** The WebGPU painter of the 3D view for `canvas`, or null where the device has no WebGPU. */
export async function webgpuSpacePainter(canvas: HTMLCanvasElement): Promise<SpacePainter | null> {
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
  const format: GPUTextureFormat = 'rgba8unorm';
  context.configure({ device, format, alphaMode: 'premultiplied' });
  const module = device.createShaderModule({ code: SHADERS });
  const layout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: VERTEX_STAGE | FRAGMENT_STAGE, buffer: {} }],
  });
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
  const f32 = (location: number, components: 3 | 4, offset: number): GPUVertexAttribute => ({
    shaderLocation: location,
    offset: offset * 4,
    format: components === 3 ? 'float32x3' : 'float32x4',
  });
  const depthStencil: GPUDepthStencilState = {
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less-equal',
  };
  const blend: GPUBlendState = {
    color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
  };
  const [blockPipeline, linePipeline] = await Promise.all([
    device.createRenderPipelineAsync({
      layout: pipelineLayout,
      vertex: {
        module,
        entryPoint: 'blockVertex',
        buffers: [
          { arrayStride: 6 * 4, attributes: [f32(0, 3, 0), f32(1, 3, 3)] },
          {
            arrayStride: BLOCK_NUMBERS * 4,
            stepMode: 'instance',
            attributes: [f32(2, 3, 0), f32(3, 3, 3), f32(4, 4, 6), f32(5, 4, 10)],
          },
        ],
      },
      fragment: { module, entryPoint: 'blockFragment', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
      depthStencil,
    }),
    device.createRenderPipelineAsync({
      layout: pipelineLayout,
      vertex: {
        module,
        entryPoint: 'lineVertex',
        buffers: [{ arrayStride: SPACE_POINT_NUMBERS * 4, attributes: [f32(0, 3, 0), f32(1, 4, 3)] }],
      },
      fragment: { module, entryPoint: 'lineFragment', targets: [{ format, blend }] },
      primitive: { topology: 'line-list' },
      depthStencil,
    }),
  ]);
  const viewBuffer = device.createBuffer({ size: 80, usage: UNIFORM_USE | COPY_IN_USE });
  const bindGroup = device.createBindGroup({ layout, entries: [{ binding: 0, resource: { buffer: viewBuffer } }] });
  const filled = (data: Float32Array) => {
    const buffer = device.createBuffer({ size: Math.max(16, data.byteLength), usage: VERTEX_USE | COPY_IN_USE });
    if (data.byteLength) device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  };
  const cube = filled(cubePoints()),
    ball = filled(ballPoints());
  const ballCorners = ballPoints().length / SHAPE_POINT_NUMBERS;
  let sent: { space: SpaceMarks; paints: Paints; blocks: GPUBuffer; lines: GPUBuffer; points: number } | null = null;
  let depth: GPUTexture | null = null;
  // held until destroyed: Chrome lost the device once nothing held its adapter
  let held: GPUAdapter | null = chip;
  return {
    kind: 'webgpu',
    resize(w, h, ratio) {
      canvas.width = Math.max(1, Math.round(w * ratio));
      canvas.height = Math.max(1, Math.round(h * ratio));
      depth?.destroy();
      depth = null;
    },
    paint(space, matrix, paints) {
      if (!held) return;
      if (!sent || sent.space !== space || sent.paints !== paints) {
        sent?.blocks.destroy();
        sent?.lines.destroy();
        const numbers = spaceNumbers(space, paints);
        sent = {
          space,
          paints,
          blocks: filled(numbers.blocks),
          lines: filled(numbers.lines),
          points: numbers.lines.length / SPACE_POINT_NUMBERS,
        };
      }
      depth ??= device.createTexture({
        size: [canvas.width, canvas.height],
        format: 'depth24plus',
        usage: DRAW_TARGET,
      });
      const numbers = new Float32Array(20);
      numbers.set(matrix);
      numbers.set([...LIGHT, space.round ? 1 : 0], 16);
      device.queue.writeBuffer(viewBuffer, 0, numbers);
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
        depthStencilAttachment: {
          view: depth.createView(),
          depthClearValue: 1,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        },
      });
      pass.setBindGroup(0, bindGroup);
      if (space.blocks.length) {
        pass.setPipeline(blockPipeline);
        pass.setVertexBuffer(0, space.round ? ball : cube);
        pass.setVertexBuffer(1, sent.blocks);
        pass.draw(space.round ? ballCorners : 36, space.blocks.length);
      }
      if (sent.points) {
        pass.setPipeline(linePipeline);
        pass.setVertexBuffer(0, sent.lines);
        pass.draw(sent.points);
      }
      pass.end();
      device.queue.submit([encoder.finish()]);
    },
    painted: () => device.queue.onSubmittedWorkDone(),
    destroy() {
      held = null;
      sent?.blocks.destroy();
      sent?.lines.destroy();
      cube.destroy();
      ball.destroy();
      depth?.destroy();
      viewBuffer.destroy();
      context.unconfigure();
      device.destroy();
      canvas.width = canvas.height = 0;
    },
  };
}
