// Walked paths in a drawing (spec §7, record_and_play, path_no_steps, steps_numbered): a strip below the bar with Play
// for each path written in the note, which steps through it one thing at a time, marked on the drawing and said to
// screen readers; a path with no steps said to have none, never played as an empty story; and, while the card is edited,
// Record, which takes the boxes tapped in order — each numbered on the drawing as it is tapped — and writes the path.
import { PathPlayer, PathRecorder, indentText, pathBlock, pathsOf } from '@graph-note/core';
import type { WalkedPath } from '@graph-note/core';
import { cornerOf } from './parked';
import { button } from './view-bar';
import type { ViewOptions } from './view-options';

const SVG = 'http://www.w3.org/2000/svg';

/** The walk strip of one drawing: Play, Record, and what is playing or being recorded. */
export class Walk {
  private readonly el: HTMLElement;
  private recorder: PathRecorder | null = null;
  private player: PathPlayer | null = null;

  constructor(
    parent: HTMLElement,
    private readonly o: ViewOptions,
    /** The drawing, once it is on the card: the strip is built above it, before it is drawn. */
    private readonly drawing: () => SVGSVGElement | undefined,
  ) {
    this.el = parent.createDiv({ cls: 'graph-note-walk', attr: { role: 'group', 'aria-label': 'Walked paths' } });
    this.show();
  }

  private nodes(): Element[] {
    return Array.from(this.drawing()?.querySelectorAll('g.node') ?? []);
  }

  /** A box tapped: while recording, the next step, and true; otherwise false, and the tap opens its details. */
  tap(key: string): boolean {
    if (!this.recorder) return false;
    this.recorder.tap(key);
    this.numberSteps();
    this.show();
    return true;
  }

  /** The strip as things stand: what is recording or playing, else Play for each path and, while edited, Record. */
  show(): void {
    const el = this.el;
    el.empty();
    if (this.recorder) return this.showRecording();
    if (this.player) return this.showPlaying();
    const paths = pathsOf(this.o.reading, this.o.graph);
    for (const p of paths) {
      const why = PathPlayer.refusal(p);
      if (why) el.createSpan({ cls: 'graph-note-walk-note', text: `⚠ ${why}` });
      else button(el, `Play ${p.title}`, 'play', () => this.play(p), `Play ${p.title}`);
    }
    if (this.o.editing?.()?.session) button(el, 'Record a path', 'circle-dot', () => this.record(), 'Record a path');
    el.hidden = !el.childElementCount;
  }

  private play(p: WalkedPath): void {
    this.player = new PathPlayer(p);
    this.show();
  }

  private showPlaying(): void {
    const player = this.player;
    if (!player) return;
    const el = this.el;
    el.hidden = false;
    const back = button(el, 'Previous step', 'chevron-left', () => this.step(() => player.previous()));
    back.disabled = player.atStart;
    el.createSpan({ cls: 'graph-note-walk-said', text: player.sentence, attr: { 'aria-live': 'polite' } });
    const on = button(el, 'Next step', 'chevron-right', () => this.step(() => player.next()));
    on.disabled = player.atEnd;
    button(el, 'Stop playing', 'square', () => {
      this.player = null;
      this.markCurrent(null);
      this.show();
    });
    this.markCurrent(player.current.missing ? null : player.current.key);
  }

  private step(move: () => boolean): void {
    if (move()) this.show();
  }

  /** The step now playing, marked on the drawing: only that one. */
  private markCurrent(key: string | null): void {
    for (const g of this.nodes())
      g.classList.toggle('graph-note-step-current', key !== null && g.getAttribute('data-key') === key);
  }

  private record(): void {
    this.recorder = new PathRecorder();
    this.show();
  }

  private showRecording(): void {
    const rec = this.recorder;
    if (!rec) return;
    const el = this.el;
    el.hidden = false;
    const n = rec.steps.length;
    el.createSpan({
      cls: 'graph-note-walk-said',
      text: `Recording: ${n} step${n === 1 ? '' : 's'}. Tap the boxes of the walk in order.`,
      attr: { 'aria-live': 'polite' },
    });
    const title = el.createEl('input', {
      attr: { type: 'text', 'aria-label': 'Path title', placeholder: 'Path title' },
    });
    const said = el.createDiv({ attr: { role: 'alert' } });
    button(el, 'Undo step', 'undo', () => {
      rec.undo();
      this.numberSteps();
      this.show();
    });
    button(el, 'Save path', 'check', () => {
      const ed = this.o.editing?.();
      const block = ed?.session?.text;
      if (!ed || block === undefined) return;
      const r = pathBlock(
        this.o.reading,
        this.o.graph,
        block,
        title.value || 'Walk',
        [...rec.steps],
        indentText(this.o.indent ?? 'four'),
      );
      if ('refused' in r) {
        said.setText(r.refused);
        return;
      }
      this.stopRecording();
      ed.replace(r.text);
    });
    button(el, 'Cancel recording', 'x', () => this.stopRecording());
  }

  private stopRecording(): void {
    this.recorder = null;
    this.numberSteps();
    this.show();
  }

  /** Each recorded step's number on its box, at its top left, as it is tapped (steps_numbered); a box visited twice has both. */
  private numberSteps(): void {
    for (const t of Array.from(this.drawing()?.querySelectorAll('.graph-note-step-number') ?? [])) t.remove();
    const steps = this.recorder?.steps ?? [];
    for (const g of this.nodes()) {
      const key = g.getAttribute('data-key');
      const numbers = steps.flatMap((s, i) => (s === key ? [String(i + 1)] : []));
      const at = numbers.length ? cornerOf(g) : null;
      if (!at) continue;
      const mark = g.appendChild(activeDocument.createElementNS(SVG, 'text'));
      mark.setAttribute('class', 'graph-note-step-number');
      mark.setAttribute('x', String(at.left + 4));
      mark.setAttribute('y', String(at.top + 12));
      mark.textContent = numbers.join(', ');
    }
  }
}
