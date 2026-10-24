// Playing a walked path in a drawing (spec §7, path_autoplay). The core's `PathAutoplay` steps through it on its own at
// the pace the user chooses. It has Pause and Play on, Previous and Next (a step by hand pauses it) and Stop. The step
// now on is outlined with a moving highlight. A dot runs the link from the step before when a link joins them. Each
// step is said in the strip's one live region. Whenever the system asks for reduced motion, each step is marked at once
// and no dot runs (motion_reduced_respected). `styles.css` stops the highlight's movement there too. Export as an
// animated SVG opens the Export form on this path at this pace (path_animation_export). The timer is the window's,
// cancelled when the playing stops or its card goes.
import { DEFAULT_PACE, PATH_PACES, PathAutoplay, PathPlayer, pathsOf, word } from '@thoughtknot/core';
import type { NoteReading, PathStep, WalkedPath } from '@thoughtknot/core';
import { openExportForm, paceOffered } from '../export/export-form';
import { reducedMotion } from './details-nav';
import { linkGroups, runnerOn } from './flow-marks';
import { button } from '../button';
import { pacingIndicator, startPace } from './profile-shown';
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
    this.toggle = button(controls, word('path.pause'), 'pause', () => {
      if (this.auto.playing) this.auto.pause();
      else this.auto.play();
      this.update();
    });
    this.back = button(controls, word('path.previous'), 'chevron-left', () => {
      paced('stepped-back');
      this.auto.previous();
      this.update();
    });
    this.on = button(controls, word('path.next'), 'chevron-right', () => {
      if (this.auto.playing) paced('skipped-ahead');
      this.auto.next();
      this.update();
    });
    button(controls, word('path.stop'), 'square', stop);
    const pace = controls
      .createEl('label', { cls: 'thoughtknot-walk-pace', text: word('export.pace') })
      .createEl('select', { attr: { 'aria-label': word('export.pace') } });
    for (const ms of PATH_PACES) pace.createEl('option', { text: paceOffered(ms), attr: { value: String(ms) } });
    pace.value = String(startPace(o, DEFAULT_PACE));
    this.auto.setPace(Number(pace.value));
    pace.addEventListener('change', () => this.auto.setPace(Number(pace.value)));
    // the pace this session shows, with its reason, and one tap back to the usual (§39, pacing_automatic)
    const paced = pacingIndicator(controls, o, (ms) => {
      pace.value = String(ms);
      this.auto.setPace(ms);
    });
    const exporting = o.exporting;
    if (exporting)
      // always opens the form on this path, in place of one already open, never closing it
      button(controls, word('path.export'), 'download', () =>
        openExportForm(card, {
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
    this.toggle.setAttribute('aria-label', word(playing ? 'path.pause' : 'path.play-on'));
    this.toggle.empty();
    this.toggle.createSpan({ cls: 'thoughtknot-badge-text', text: word(playing ? 'path.pause' : 'path.play-on') });
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
      g.classList.toggle('thoughtknot-step-current', key !== null && g.getAttribute('data-key') === key);
    for (const r of Array.from(svg?.querySelectorAll('.thoughtknot-path-runner') ?? [])) r.remove();
  }

  /** A dot running the link that joins two steps, forwards along the walk, whichever way the link and its line go. */
  private run(from: PathStep, to: PathStep): void {
    if (from.missing || to.missing) return;
    const links = this.o.reading.graphs.get(this.o.graph)?.links ?? [];
    const n = links.findIndex(
      (l) => (l.from === from.key && l.to === to.key) || (l.from === to.key && l.to === from.key),
    );
    // a link merged into a trunk (§25) is drawn as two lines: the dot runs both
    const gs = n < 0 ? [] : linkGroups(this.svg(), n);
    if (!gs.length) return;
    const along = links[n]?.from === from.key,
      back = along === (this.o.motion?.reversed ?? []).includes(n);
    this.card.setCssProps({ '--thoughtknot-run': `${Math.min(this.auto.pace, RUN_MOST_MS)}ms` });
    for (const g of gs) runnerOn(g, 'thoughtknot-path-runner', back ? 'thoughtknot-path-runner-back' : '');
  }
}
