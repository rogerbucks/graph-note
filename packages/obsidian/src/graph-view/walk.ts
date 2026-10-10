// Walked paths in a drawing (spec §7, record_and_play, path_no_steps, steps_numbered): a strip below the bar with Play
// for each path written in the note, which steps through it one thing at a time, marked on the drawing and said to
// screen readers; a path with no steps said to have none, never played as an empty story; and, while the card is edited,
// Record, which takes the boxes tapped in order — each numbered on the drawing as it is tapped — and writes the path.
// The strip's controls are built once for each thing it is doing, and only their words change as it goes, so the focus
// stays where it is; one live region says each step.
import { PathPlayer, PathRecorder, indentText, pathBlock, pathsOf } from '@graph-note/core';
import type { WalkedPath } from '@graph-note/core';
import { cornerOf } from './parked';
import { button } from './view-bar';
import type { ViewOptions } from './view-options';

const SVG = 'http://www.w3.org/2000/svg';

/** What the strip is doing: offering Play and Record, recording, or playing. */
type Doing = 'offering' | 'recording' | 'playing';

/** The walk strip of one drawing: Play, Record, and what is playing or being recorded. */
export class Walk {
  private readonly el: HTMLElement;
  private readonly controls: HTMLElement;
  private readonly said: HTMLElement;
  private recorder: PathRecorder | null = null;
  private player: PathPlayer | null = null;
  private doing: Doing | null = null;
  /** The controls whose state changes as the strip goes: kept, so they are updated in place. */
  private kept: { back?: HTMLButtonElement; on?: HTMLButtonElement; alert?: HTMLElement } = {};

  constructor(
    parent: HTMLElement,
    private readonly o: ViewOptions,
    /** The drawing, once it is on the card: the strip is built above it, before it is drawn. */
    private readonly drawing: () => SVGSVGElement | undefined,
  ) {
    this.el = parent.createDiv({ cls: 'graph-note-walk', attr: { role: 'group', 'aria-label': 'Walked paths' } });
    this.controls = this.el.createDiv({ cls: 'graph-note-walk-controls' });
    this.said = this.el.createSpan({ cls: 'graph-note-walk-said', attr: { 'aria-live': 'polite' } });
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

  /** The strip as things stand, built again only when what it is doing changed; a recording ends when editing does. */
  show(): void {
    const editing = !!this.o.editing?.()?.session;
    if (this.recorder && !editing) {
      this.recorder = null;
      this.numberSteps();
      this.said.setText('The recording ended with the editing: nothing was written.');
    }
    const doing: Doing = this.recorder ? 'recording' : this.player ? 'playing' : 'offering';
    if (doing !== this.doing || doing === 'offering') this.build(doing, editing);
    this.update();
  }

  private build(doing: Doing, editing: boolean): void {
    this.doing = doing;
    this.kept = {};
    const el = this.controls;
    el.empty();
    if (doing === 'recording') {
      el.createEl('input', { attr: { type: 'text', 'aria-label': 'Path title', placeholder: 'Path title' } });
      button(el, 'Undo step', 'undo', () => {
        this.recorder?.undo();
        this.numberSteps();
        this.show();
      });
      button(el, 'Save path', 'check', () => this.save());
      button(el, 'Cancel recording', 'x', () =>
        this.stopRecording('The recording was cancelled: nothing was written.'),
      );
      this.kept.alert = el.createDiv({ attr: { role: 'alert' } });
    } else if (doing === 'playing') {
      this.kept.back = button(el, 'Previous step', 'chevron-left', () => this.step(() => this.player?.previous()));
      this.kept.on = button(el, 'Next step', 'chevron-right', () => this.step(() => this.player?.next()));
      button(el, 'Stop playing', 'square', () => {
        this.player = null;
        this.markCurrent(null);
        this.said.setText('');
        this.show();
      });
    } else {
      for (const p of pathsOf(this.o.reading, this.o.graph)) {
        const why = PathPlayer.refusal(p);
        if (why) el.createSpan({ cls: 'graph-note-walk-note', text: `⚠ ${why}` });
        else button(el, `Play ${p.title}`, 'play', () => this.play(p), `Play ${p.title}`);
      }
      if (editing) button(el, 'Record a path', 'circle-dot', () => this.record(), 'Record a path');
    }
  }

  /** The words and states that change as the strip goes, changed in place. */
  private update(): void {
    const player = this.player,
      rec = this.recorder;
    if (player) {
      if (this.kept.back) this.kept.back.disabled = player.atStart;
      if (this.kept.on) this.kept.on.disabled = player.atEnd;
      this.said.setText(player.sentence);
      this.markCurrent(player.current.missing ? null : player.current.key);
    } else if (rec) {
      const n = rec.steps.length,
        last = rec.steps.at(-1);
      const name = last
        ? (this.o.reading.graphs.get(this.o.graph)?.boxes.find((b) => b.key === last)?.text ?? last)
        : '';
      this.said.setText(
        `Recording: ${n} step${n === 1 ? '' : 's'}${last ? `, the last ${name}` : ''}. Tap the boxes of the walk in order.`,
      );
    }
    this.el.hidden = !this.controls.childElementCount && !this.said.textContent;
  }

  private play(p: WalkedPath): void {
    this.player = new PathPlayer(p);
    this.show();
  }

  private step(move: () => boolean | undefined): void {
    if (move()) this.update();
  }

  /** The step now playing, marked on the drawing: only that one. */
  private markCurrent(key: string | null): void {
    for (const g of this.nodes())
      g.classList.toggle('graph-note-step-current', key !== null && g.getAttribute('data-key') === key);
  }

  private record(): void {
    this.recorder = new PathRecorder();
    this.show();
    this.controls.querySelector('input')?.focus();
  }

  /** Writes the path into the text being edited, and only then ends the recording; or says why not, keeping it. */
  private save(): void {
    const rec = this.recorder,
      ed = this.o.editing?.(),
      block = ed?.session?.text;
    const title = this.controls.querySelector('input')?.value ?? '';
    const alert = this.kept.alert;
    if (!rec || !ed || block === undefined) {
      alert?.setText('The block is no longer being edited, so the path cannot be written.');
      return;
    }
    const indent = indentText(this.o.indent ?? 'four');
    const r = pathBlock(this.o.reading, this.o.graph, block, title, [...rec.steps], indent);
    if ('refused' in r) {
      alert?.setText(r.refused);
      return;
    }
    ed.replace(r.text);
    this.stopRecording(`The path ${title} was written, with ${rec.steps.length} steps.`);
  }

  private stopRecording(said: string): void {
    this.recorder = null;
    this.numberSteps();
    this.said.setText(said);
    this.show();
  }

  /** Each recorded step's number on its box, at its top left, as it is tapped (steps_numbered); a box visited twice has both. */
  private numberSteps(): void {
    for (const t of Array.from(this.drawing()?.querySelectorAll('.graph-note-step-number') ?? [])) t.remove();
    const steps = this.recorder?.steps ?? [];
    for (const g of this.nodes()) {
      const key = g.getAttribute('data-key');
      const numbers = steps.flatMap((s, i) => (s === key ? [String(i + 1)] : []));
      const label = (g.getAttribute('aria-label') ?? '').replace(/, step [\d, ]+$/, '');
      g.setAttribute('aria-label', numbers.length ? `${label}, step ${numbers.join(', ')}` : label);
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
