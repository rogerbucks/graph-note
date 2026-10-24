// Walked paths in a drawing (spec §7, record_and_play, path_no_steps, steps_numbered). A strip below the bar has Play
// for each path written in the note. Play steps through it on its own, one thing at a time, marked on the drawing. Each
// step is said to screen readers (path-play.ts, path_autoplay). A path with no steps is said to have none, never played
// as an empty story. While the card is edited, Record takes the boxes tapped in order and writes the path. Each box is
// numbered on the drawing as it is tapped. The strip's controls are built once for each thing it is doing. Only their
// words change as it goes, so the focus stays where it is; one live region says each step. For each process the graph
// holds, Debug steps a test run of it (process-debug.ts, process_debugger).
import { PathPlayer, PathRecorder, indentText, pathBlock, pathsOf, word } from '@thoughtknot/core';
import type { WalkedPath } from '@thoughtknot/core';
import { cornerOf } from './parked';
import { PathPlay } from './path-play';
import { ProcessDebug, debuggableProcesses } from './process-debug';
import { button } from './view-bar';
import type { ViewOptions } from './view-options';

const SVG = 'http://www.w3.org/2000/svg';

/** What the strip is doing: offering Play, Record and Debug, recording, playing, or debugging a process. */
type Doing = 'offering' | 'recording' | 'playing' | 'debugging';

/** The walk strip of one drawing: Play, Record, and what is playing or being recorded. */
export class Walk {
  private readonly el: HTMLElement;
  private readonly controls: HTMLElement;
  private readonly said: HTMLElement;
  private recorder: PathRecorder | null = null;
  /** The path chosen to play, and its playing once the strip is built for it. */
  private path: WalkedPath | null = null;
  private player: PathPlay | null = null;
  /** The process chosen to debug, and its test run once the strip is built for it. */
  private process: string | null = null;
  private debugger: ProcessDebug | null = null;
  private doing: Doing | null = null;
  /** The controls whose state changes as the strip goes: kept, so they are updated in place. */
  private kept: { alert?: HTMLElement } = {};

  constructor(
    private readonly parent: HTMLElement,
    private readonly o: ViewOptions,
    /** The drawing, once it is on the card: the strip is built above it, before it is drawn. */
    private readonly drawing: () => SVGSVGElement | undefined,
    /** Where the strip sits in the card, its row of tools; the card itself when not given. */
    at: HTMLElement = parent,
  ) {
    this.el = at.createDiv({ cls: 'thoughtknot-walk', attr: { role: 'group', 'aria-label': word('walk.group') } });
    this.controls = this.el.createDiv({ cls: 'thoughtknot-walk-controls' });
    this.said = this.el.createSpan({ cls: 'thoughtknot-walk-said', attr: { 'aria-live': 'polite' } });
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
      this.said.setText(word('walk.ended'));
    }
    const doing: Doing = this.recorder ? 'recording' : this.path ? 'playing' : this.process ? 'debugging' : 'offering';
    if (doing !== this.doing || doing === 'offering') this.build(doing, editing);
    this.update();
  }

  private build(doing: Doing, editing: boolean): void {
    this.doing = doing;
    this.kept = {};
    const el = this.controls;
    el.empty();
    if (doing === 'recording') {
      el.createEl('input', {
        attr: { type: 'text', 'aria-label': word('walk.title'), placeholder: word('walk.title') },
      });
      button(el, word('walk.undo'), 'undo', () => {
        this.recorder?.undo();
        this.numberSteps();
        this.show();
      });
      button(el, word('walk.save'), 'check', () => this.save());
      button(el, word('walk.cancel'), 'x', () => this.stopRecording(word('walk.cancelled')));
      this.kept.alert = el.createDiv({ attr: { role: 'alert' } });
    } else if (doing === 'playing' && this.path) {
      this.player = new PathPlay(el, this.said, this.path, this.o, this.drawing, this.parent, () => this.stop());
    } else if (doing === 'debugging' && this.process) {
      this.debugger = new ProcessDebug(el, this.said, this.process, this.o, this.drawing, () => this.stopDebugging());
    } else {
      for (const p of pathsOf(this.o.reading, this.o.graph)) {
        const why = PathPlayer.refusal(p);
        if (why) el.createSpan({ cls: 'thoughtknot-walk-note', text: `⚠ ${why}` });
        else
          button(
            el,
            word('walk.play', { title: p.title }),
            'play',
            () => this.play(p),
            word('walk.play', { title: p.title }),
          );
      }
      for (const p of debuggableProcesses(this.o)) {
        const label = word('debug.start', { process: p.name });
        button(el, label, 'bug', () => this.debug(p.id), label);
      }
      if (editing) button(el, word('walk.record'), 'circle-dot', () => this.record(), word('walk.record'));
    }
  }

  /** The words and states that change as the strip goes, changed in place. */
  private update(): void {
    const player = this.player,
      rec = this.recorder;
    if (player) player.update();
    else if (this.debugger) this.debugger.update();
    else if (rec) {
      const n = rec.steps.length,
        last = rec.steps.at(-1);
      const name = last
        ? (this.o.reading.graphs.get(this.o.graph)?.boxes.find((b) => b.key === last)?.text ?? last)
        : '';
      this.said.setText(last ? word('walk.recording-last', { count: n, name }) : word('walk.recording', { count: n }));
    }
    this.el.hidden = !this.controls.childElementCount && !this.said.textContent;
  }

  private play(p: WalkedPath): void {
    this.path = p;
    this.show();
  }

  /**
   * Stops a path playing or a process being debugged, if one is: nothing waits on the clock and nothing stays marked;
   * Play and Debug are offered again.
   */
  stop(): void {
    this.stopDebugging();
    if (!this.player && !this.path) return;
    this.player?.stop();
    this.player = null;
    this.path = null;
    this.said.setText('');
    this.show();
  }

  private debug(process: string): void {
    this.process = process;
    this.show();
  }

  /** Stops debugging, if it is: the test run is thrown away and nothing stays marked; Debug is offered again. */
  stopDebugging(): void {
    if (!this.debugger && !this.process) return;
    this.debugger?.stop();
    this.debugger = null;
    this.process = null;
    this.said.setText('');
    this.show();
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
      alert?.setText(word('walk.not-editing'));
      return;
    }
    const indent = indentText(this.o.indent ?? 'four');
    // checked against the note as it is now, with what is typed, never the drawing, which can be older (§4)
    const r = pathBlock(ed.session?.current() ?? this.o.reading, this.o.graph, block, title, [...rec.steps], indent);
    if ('refused' in r) {
      alert?.setText(r.refused);
      return;
    }
    ed.replace(r.text);
    this.stopRecording(word('walk.written', { title, count: rec.steps.length }));
  }

  private stopRecording(said: string): void {
    this.recorder = null;
    this.numberSteps();
    this.said.setText(said);
    this.show();
  }

  /** Each recorded step's number on its box, at its top left, as it is tapped (steps_numbered); a box visited twice has both. */
  private numberSteps(): void {
    for (const t of Array.from(this.drawing()?.querySelectorAll('.thoughtknot-step-number') ?? [])) t.remove();
    const steps = this.recorder?.steps ?? [];
    for (const g of this.nodes()) {
      const key = g.getAttribute('data-key');
      const numbers = steps.flatMap((s, i) => (s === key ? [String(i + 1)] : []));
      // the box's own name is kept beside the one with its steps, so the steps are taken off in any language
      const shown = g.getAttribute('aria-label') ?? '';
      const label = shown === g.getAttribute('data-step-label') ? (g.getAttribute('data-plain-label') ?? '') : shown;
      const said = numbers.length ? word('walk.box-steps', { label, steps: numbers.join(', ') }) : label;
      g.setAttribute('aria-label', said);
      g.setAttribute('data-plain-label', label);
      g.setAttribute('data-step-label', said);
      const at = numbers.length ? cornerOf(g) : null;
      if (!at) continue;
      const mark = g.appendChild(activeDocument.createElementNS(SVG, 'text'));
      mark.setAttribute('class', 'thoughtknot-step-number');
      mark.setAttribute('x', String(at.left + 4));
      mark.setAttribute('y', String(at.top + 12));
      mark.textContent = numbers.join(', ');
    }
  }
}
