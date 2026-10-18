// Bundles the plugin into main.js at the repository root, where the Obsidian
// plugin store expects it. Obsidian and CodeMirror come from the app at run
// time, so they are left out of the bundle.
import esbuild from 'esbuild';
import { renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Writes each output to a file of its own, then renames it into place. So whatever reads main.js sees the old build or
// the new one, never half of one. Readers include tests building in parallel, or Obsidian while `npm run dev` rebuilds.
const swapIn = {
  name: 'swap-in',
  setup(build) {
    build.onEnd((result) => {
      for (const f of result.outputFiles ?? []) {
        const part = `${f.path}.${process.pid}.part`;
        writeFileSync(part, f.contents);
        renameSync(part, f.path);
      }
    });
  },
};

// The layout worker (spec §9, layout_contained). src/layout-worker/worker-entry.ts is bundled on its own, the Graphviz
// WebAssembly inside it. It is handed to the plugin as the body of one function, `layoutWorker`, from the module
// 'thoughtknot:layout-worker'. main.js holds it once. The worker is started from the function's own text. The page
// calls the function where no worker can run (src/layout-worker/layout-worker.ts says why). Rebuilt with every build, and
// watched with the rest in --watch. The worker's last build is kept in `workerBuild`, so scripts/quality-metrics.mjs can
// say what is inside that one function, the engine among it.
export const workerBuild = { metafile: null };
export const layoutWorker = {
  name: 'layout-worker',
  setup(build) {
    build.onResolve({ filter: /^thoughtknot:layout-worker$/ }, (a) => ({ path: a.path, namespace: 'layout-worker' }));
    build.onLoad({ filter: /.*/, namespace: 'layout-worker' }, async () => {
      const inner = await esbuild.build({
        absWorkingDir: here,
        entryPoints: ['src/layout-worker/worker-entry.ts'],
        bundle: true,
        platform: 'browser',
        format: 'iife',
        globalName: 'thoughtknotLayoutWorker',
        target: 'es2022',
        legalComments: 'inline',
        write: false,
        metafile: true,
        logLevel: 'warning',
      });
      workerBuild.metafile = inner.metafile;
      const code = inner.outputFiles[0].text;
      return {
        contents: `export function layoutWorker(scope) {\n${code}\nreturn thoughtknotLayoutWorker;\n}\n`,
        loader: 'js',
        resolveDir: here,
        watchFiles: Object.keys(inner.metafile.inputs).map((f) => join(here, f)),
      };
    });
  },
};

// Exported so scripts/quality-metrics.mjs measures the bundle this build makes, not a copy of its settings.
export const options = {
  absWorkingDir: here,
  entryPoints: ['src/main.ts'],
  outfile: join(here, '..', '..', 'main.js'),
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2022',
  external: ['obsidian', '@codemirror/*', '@lezer/*'],
  legalComments: 'inline',
  sourcemap: false,
  minify: false,
  logLevel: 'info',
  write: false,
  plugins: [layoutWorker, swapIn],
};

// --watch (npm run dev): rebuild on every save, for installing into a test vault. Only when run, never when imported.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--watch')) await (await esbuild.context(options)).watch();
  else await esbuild.build(options);
}
