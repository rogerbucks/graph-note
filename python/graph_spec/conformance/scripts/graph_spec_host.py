#!/usr/bin/env python3
"""Points the conformance suite's scripts at this repository's own graph-spec libraries.

Usage:
  import graph_spec_host            # the four pointer modules do it: gql_profile, graph_rules, graph_svg, graph_spec

Writes: the built JavaScript checker and layout program, to a temporary folder, once per run.

The suite came from the owner's vault (GS1, spec §51), where it ran a vendored release. Here it runs
the code as it stands:
- Python: python/graph_spec/src.
- JavaScript: packages/graph-spec, built by its own esbuild script, and the layout program from
  packages/core. GRAPH_SPEC_VENDOR names the folder, so the Node helpers find the same build.

The library leaves three things to its host. The destination matrix is a made-up test note,
Standards/Information classification.md. The stamps a joined graph is written with are the ones the
case data was recorded with.
"""
import os, sys, atexit, subprocess, tempfile, shutil, importlib.util
HERE = os.path.dirname(os.path.abspath(__file__))
SUITE = os.path.abspath(os.path.join(HERE, '..'))
REPO = os.path.abspath(os.path.join(SUITE, '..', '..', '..'))
VENDOR_PY = os.path.join(REPO, 'python', 'graph_spec', 'src')


def build():
    """Build the JavaScript checker and the layout program once, into GRAPH_SPEC_VENDOR."""
    vendor = os.environ.get('GRAPH_SPEC_VENDOR')
    if vendor and os.path.exists(os.path.join(vendor, 'js', 'graph-spec-check.js')):
        return vendor
    vendor = tempfile.mkdtemp(prefix='graph-spec-build-')
    atexit.register(shutil.rmtree, vendor, True)   # the run that built it removes it; the helpers it starts reuse it
    os.makedirs(os.path.join(vendor, 'js'))
    check = os.path.join(vendor, 'js', 'graph-spec-check.js')
    subprocess.run(['node', 'esbuild.check.mjs', check], cwd=os.path.join(REPO, 'packages', 'graph-spec'), check=True)
    subprocess.run(['node', 'esbuild.layout.mjs'], cwd=os.path.join(REPO, 'packages', 'core'), check=True)
    shutil.copy(os.path.join(REPO, 'packages', 'core', 'dist', 'layout-source-node.cjs'), os.path.join(vendor, 'js'))
    os.environ['GRAPH_SPEC_VENDOR'] = vendor
    return vendor


VENDOR = build()
VENDOR_JS = os.path.join(VENDOR, 'js', 'graph-spec-check.js')


def _configure(name, mod):
    if name == 'graph_spec':
        mod.CLASSIFICATION_NOTE = os.path.join(SUITE, 'Standards', 'Information classification.md')
        mod.OWNER_ENGINE, mod.WRITTEN_BY = 'engine:mac14', 'ea/sara@mac14'


def use(name):
    """Load python/graph_spec/src/<name>.py as the module <name>, once, configured for the suite."""
    mod = sys.modules.get(name)
    if mod is not None and getattr(mod, '__file__', '').startswith(VENDOR_PY): return mod
    if VENDOR_PY not in sys.path:
        if HERE not in sys.path: sys.path.insert(0, HERE)
        sys.path.append(VENDOR_PY)   # after the pointer modules, so `import graph_rules` still means the one here
    spec = importlib.util.spec_from_file_location(name, os.path.join(VENDOR_PY, f'{name}.py'))
    mod = importlib.util.module_from_spec(spec); sys.modules[name] = mod
    spec.loader.exec_module(mod); _configure(name, mod)
    return mod
