// Stands in for @viz-js/viz in the mod's bundle: a mod's environment has no WebAssembly, so the engine cannot start there.
export function instance(): never {
  throw new Error('Graphviz needs WebAssembly, which a mod has not');
}
