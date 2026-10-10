// The types of core.js, the core's bundle (build.mjs): only what register.tsx uses, as packages/core/src declares them.
export type Box = { key: string; kind: string; text: string }
export type Link = { from: string; type: string; reading: string; to: string }
export type GraphDrawing = { graph: string; boxes: Box[]; links: Link[] }
export type Direction = { rankdir: string; dot: string }
export function gqlBlocks(note: string): { text: string; line: number }[]
export function readNote(blocks: string[]): { graphs: Map<string, GraphDrawing> }
export function directions(drawing: GraphDrawing): Direction[]
export function chosen(laidOut: Direction[], svgs: string[]): { svg: string; rankdir: string; width: number; height: number }
