// The process debugger in a drawing (editor spec §35, process_debugger, playback_controller). The walk strip offers
// Debug for each process the graph holds. It starts a test run on the live graph, thrown away when it stops. Play takes
// each transition at its natural pace; Step forward and Step back go one transition by hand, and pause Play first.
// A breakpoint written in the graph pauses Play where it is ON.
//
// Each stop is said in the strip's panel. It says the states the run is in and each guard tried with its reason. It
// lists the artefacts and resources involved, any certainty change and any side effect stubbed. The drawing outlines the current step and
// marks each failed guard. The drawing only shows the run: every press goes to the core's player, never to the SVG.
import { PlaybackController, TestRun, word } from '@thoughtknot/core';
import type { RunPause } from '@thoughtknot/core';
import { button } from '../button';
import type { ViewOptions } from './view-options';

/** What a process's properties hold that is not an input to its guards. */
const NOT_INPUTS = new Set(['id', 'name', 'title', 'running_rule', 'start']);

/** The processes of a drawing's graph that can be debugged: those with a state to start in, by id and name. */
export function debuggableProcesses(o: ViewOptions): { id: string; name: string }[] {
  const g = o.reading.world[o.graph];
  if (!g) return [];
  const states = g.labelled('State');
  if (!states.length) return [];
  return g.labelled('Process').map((id) => ({ id, name: nameOf(o, id) }));
}

/** A thing's name as drawn, else its id. */
function nameOf(o: ViewOptions, id: string): string {
  return o.reading.graphs.get(o.graph)?.boxes.find((b) => b.key === id)?.text ?? id;
}

/** One test run being debugged in a drawing's walk strip: its controls, its panel and its marks on the drawing. */
export class ProcessDebug {
  readonly player: PlaybackController;
  private readonly toggle: HTMLButtonElement;
  private readonly backButton: HTMLButtonElement;
  private readonly forwardButton: HTMLButtonElement;
  private readonly panel: HTMLElement;

  constructor(
    controls: HTMLElement,
    private readonly said: HTMLElement,
    process: string,
    private readonly o: ViewOptions,
    private readonly svg: () => SVGSVGElement | undefined,
    stop: () => void,
  ) {
    const read = () => o.reading.world[o.graph] as NonNullable<(typeof o.reading.world)[string]>;
    const props = read().p(process);
    const inputs = Object.fromEntries(Object.entries(props).filter(([k]) => !NOT_INPUTS.has(k)));
    const run = new TestRun(read, { id: `debug:${process}`, process, inputs });
    const win = activeWindow;
    this.player = new PlaybackController(run, {
      after: (ms, go) => win.setTimeout(go, ms),
      cancel: (handle) => win.clearTimeout(handle as number),
    });
    this.player.onStop = () => this.update();
    this.toggle = button(controls, word('debug.play'), 'play', () => {
      if (this.player.mode === 'autoplay') this.player.pause();
      else this.player.play();
      this.update();
    });
    this.backButton = button(controls, word('debug.back'), 'chevron-left', () => this.player.back());
    this.forwardButton = button(controls, word('debug.forward'), 'chevron-right', () => this.player.forward());
    button(controls, word('debug.stop'), 'square', stop);
    this.panel = controls.createDiv({
      cls: 'thoughtknot-debug',
      attr: { role: 'region', 'aria-label': word('debug.panel') },
    });
    this.update();
  }

  /** The controls, the panel, what is said and the drawing's marks, as the run stands. */
  update(): void {
    const pause = this.player.run.pause;
    const autoplay = this.player.mode === 'autoplay';
    this.toggle.setAttribute('aria-label', word(autoplay ? 'debug.pause' : 'debug.play'));
    this.toggle.disabled = pause.ended && !autoplay;
    this.backButton.disabled = !this.player.run.canGoBack;
    this.forwardButton.disabled = pause.ended;
    this.panel.empty();
    for (const line of this.lines(pause)) this.panel.createDiv({ cls: 'thoughtknot-debug-line', text: line });
    this.said.setText(this.lines(pause)[0] ?? '');
    this.mark(pause);
  }

  /** Stops for good: nothing waits on the clock, nothing stays marked, and the run is thrown away. */
  stop(): void {
    this.player.stop();
    this.player.run.discard();
    this.mark(null);
  }

  /** What a stop says, a line each. */
  private lines(pause: RunPause): string[] {
    const name = (id: string) => nameOf(this.o, id);
    const states = pause.states.map(name).join(', ');
    const out = [pause.step ? word('debug.at', { step: pause.step, states }) : word('debug.start-at', { states })];
    if (pause.breakpoint !== null) out.push(word('debug.breakpoint', { name: name(pause.breakpoint) }));
    for (const g of pause.guards) {
      if (g.why === 'none') continue;
      const guard = g.shown || name(g.guard ?? g.transition);
      if (g.why === 'holds') out.push(word('debug.guard-holds', { guard }));
      else if (g.why === 'fails') out.push(word('debug.guard-fails', { guard }));
      else out.push(word('debug.guard-refused', { guard, why: g.detail ?? '' }));
    }
    if (pause.artefacts.length) out.push(word('debug.artefacts', { names: pause.artefacts.map(name).join(', ') }));
    if (pause.resources.length) out.push(word('debug.resources', { names: pause.resources.map(name).join(', ') }));
    for (const c of pause.certainty) {
      const said = { thing: name(c.thing), from: c.from ?? word('debug.no-certainty'), to: c.to };
      out.push(word(c.applied ? 'debug.certainty-applied' : 'debug.certainty', said));
    }
    for (const effect of pause.stubbed) out.push(word('debug.stubbed', { effect }));
    if (pause.ended) out.push(word('debug.ended'));
    out.push(word('debug.test-run'));
    return out;
  }

  /** The current states outlined, and each guard that failed marked, with any promoted transition it guards. */
  private mark(pause: RunPause | null): void {
    const current = new Set(pause?.states ?? []);
    const failed = new Set(
      (pause?.guards ?? []).filter((g) => !g.passed).flatMap((g) => [g.guard ?? '', g.transition]),
    );
    for (const g of Array.from(this.svg()?.querySelectorAll('g.node') ?? [])) {
      const key = g.getAttribute('data-key') ?? '';
      g.classList.toggle('thoughtknot-step-current', current.has(key));
      g.classList.toggle('thoughtknot-guard-failed', failed.has(key));
    }
  }
}
