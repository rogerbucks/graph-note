// Playing a walked path in a drawing (spec §7, path_autoplay): the core's `PathAutoplay` stepping through it on its own
// at the pace the user chooses, with Pause and Play on, Previous and Next (a step by hand pauses it) and Stop; the step
// now on outlined with a moving highlight, and a dot running the link from the step before when a link joins them; each
// step said in the strip's one live region. Whenever the system asks for reduced motion each step is marked at once and
// no dot runs (motion_reduced_respected); `styles.css` stops the highlight's movement there too. Export as an animated
// SVG opens the Export form on this path at this pace (path_animation_export). The timer is the window's, cancelled
// when the playing stops or its card goes.
import { DEFAULT_PACE, PATH_PACES, PathAutoplay, PathPlayer, paceSaid, pathsOf } from '@graph-note/core';
import type { NoteReading, PathStep, WalkedPath } from '@graph-note/core';
import { toggleExportForm } from '../export/export-form';
import { reducedMotion } from './details-nav';
import { runnerOn } from './flow-marks';
import { button } from './view-bar';
import type { ViewOptions } from './view-options';

/** The paths of a graph that can be played, by id and title: those with a step. */
export const playablePaths = (reading: NoteReading, graph: string): { id: string; title: string }[] =>
  pathsOf(reading, graph)
    .filter((p) => !PathPlayer.refusal(p))
    .map((p) => ({ id: p.id, title: p.title }));

/** How long a dot takes to run the link from the step before: the pace, but never more than a second and a half. */
const RUN_MOST_MS = 1500;

/** One path playing in a drawing's walk strip: its controls, built once, and the marks on the drawing. */
export class PathPlay {
  private readonly auto: PathAutoplay;
  private readonly toggle: HTMLButtonElement;
  private readonly back: HTMLButtonElement;
  private readonly on: HTMLButtonElement;
  private was = -1;

  constructor(
    controls: HTMLElement,
    private readonly said: HTMLElement,
    path: WalkedPath,
    private readonly o: ViewOptions,
    private readonly svg: () => SVGSVGElement | undefined,
    private readonly card: HTMLElement,
    stop: () => void,
  ) {
    const win = activeWindow;
    this.auto = new PathAutoplay(new PathPlayer(path), {
      after: (ms, run) => win.setTimeout(run, ms),
      cancel: (handle) => win.clearTimeout(handle as number),
    });
    this.auto.onStep = () => this.update();
    this.toggle = button(controls, 'Pause', 'pause', () => {
      if (this.auto.playing) this.auto.pause();
      else this.auto.play();
      this.update();
    });
    this.back = button(controls, 'Previous step', 'chevron-left', () => {
      this.auto.previous();
      this.update();
    });
    this.on = button(controls, 'Next step', 'chevron-right', () => {
      this.auto.next();
      this.update();
    });
    button(controls, 'Stop playing', 'square', stop);
    const pace = controls
      .createEl('label', { cls: 'graph-note-walk-pace', text: 'Pace' })
      .createEl('select', { attr: { 'aria-label': 'Pace' } });
    for (const ms of PATH_PACES) pace.createEl('option', { text: paceSaid(ms), attr: { value: String(ms) } });
    pace.value = String(DEFAULT_PACE);
    pace.addEventListener('change', () => this.auto.setPace(Number(pace.value)));
    const exporting = o.exporting;
    if (exporting)
      button(controls, 'Export as an animated SVG', 'download', () =>
        toggleExportForm(card, {
          ...exporting,
          paths: playablePaths(o.reading, o.graph),
          walk: { id: path.id, pace: this.auto.pace },
        }),
      );
    this.auto.play();
  }

  /** The controls' states, the step said, and the drawing marked, as the playing stands. */
  update(): void {
    const { player } = this.auto;
    this.back.disabled = player.atStart;
    this.on.disabled = player.atEnd;
    const playing = this.auto.playing;
    this.toggle.setAttribute('aria-label', playing ? 'Pause' : 'Play on');
    this.toggle.empty();
    this.toggle.createSpan({ cls: 'graph-note-badge-text', text: playing ? 'Pause' : 'Play on' });
    this.said.setText(player.sentence);
    this.mark();
  }

  /** Stops for good: no step waits on the clock, and nothing stays marked. */
  stop(): void {
    this.auto.stop();
    this.marks(null);
  }

  /** The step now on outlined, alone, and a dot along the link from the step before when it was stepped to from there. */
  private mark(): void {
    const { player } = this.auto,
      now = player.index,
      step = player.current;
    this.marks(step.missing ? null : step.key);
    const before = player.path.steps[now - 1];
    if (now === this.was + 1 && before && !reducedMotion(activeWindow)) this.run(before, step);
    this.was = now;
  }

  private marks(key: string | null): void {
    const svg = this.svg();
    for (const g of Array.from(svg?.querySelectorAll('g.node') ?? []))
      g.classList.toggle('graph-note-step-current', key !== null && g.getAttribute('data-key') === key);
    for (const r of Array.from(svg?.querySelectorAll('.graph-note-path-runner') ?? [])) r.remove();
  }

  /** A dot running the link that joins two steps, forwards along the walk, whichever way the link and its line go. */
  private run(from: PathStep, to: PathStep): void {
    if (from.missing || to.missing) return;
    const links = this.o.reading.graphs.get(this.o.graph)?.links ?? [];
    const n = links.findIndex(
      (l) => (l.from === from.key && l.to === to.key) || (l.from === to.key && l.to === from.key),
    );
    const g = n < 0 ? null : this.svg()?.querySelector(`g.edge[data-link="${n}"]`);
    if (!g) return;
    const along = links[n]?.from === from.key,
      back = along === (this.o.motion?.reversed ?? []).includes(n);
    this.card.setCssProps({ '--graph-note-run': `${Math.min(this.auto.pace, RUN_MOST_MS)}ms` });
    runnerOn(g, 'graph-note-path-runner', back ? 'graph-note-path-runner-back' : '');
  }
}
