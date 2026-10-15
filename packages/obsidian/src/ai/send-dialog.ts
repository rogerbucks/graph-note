// The send dialog (spec §19, user_chooses_what, seen_before_sent, never_in_background): the user chooses what of the
// note's graph is sent — the whole graph, a view, or the things they tick — the model, and the question; Show what will
// be sent puts the exact request on screen, with the model and its address; and only Send, pressed on exactly that,
// sends it, once. Any change takes the yes away until it is shown again. The answer is written into the note as a change
// set beside the graph, and every send is recorded in the plugin's data, whatever came of it.
import { Modal, Notice, Setting } from 'obsidian';
import type { ButtonComponent, TFile } from 'obsidian';
import {
  confirmSend,
  gqlBlocks,
  modelChoices,
  noteWithProposal,
  prepareSend,
  readNote,
  sendPrepared,
  viewsOf,
} from '@graph-note/core';
import type { MatrixRow, PreparedSend, ScopeChoice } from '@graph-note/core';
import type GraphNotePlugin from '../main';
import { readMatrix } from './matrix-note';
import { obsidianTransport } from './send';

/** The purpose a send from this dialog is for: the model set up for it is offered first. */
const PURPOSE = 'Proposing changes';
const QUESTION = 'Propose the changes that would make this graph more complete and correct.';

type What = ScopeChoice['what'];

/** One thing of a graph, as the dialog lists it to be ticked. */
interface Listed {
  key: string;
  text: string;
}

/** The dialog for one note: what of it to send, to which model, shown exactly before Send. */
export class SendDialog extends Modal {
  private graph: string;
  private what: What = 'graph';
  private view = '';
  private readonly ticked = new Set<string>();
  private model: string;
  private question = QUESTION;
  private prepared: PreparedSend | null = null;
  private refusal: string | null = null;
  private sending = false;
  private readonly things: Map<string, Listed[]>;
  private readonly views: Map<string, string[]>;
  private shownEl: HTMLElement | null = null;
  private sendButton: ButtonComponent | null = null;

  constructor(
    private readonly plugin: GraphNotePlugin,
    private readonly file: TFile,
    private readonly note: string,
    /** The note's classification, read each time it is asked, against the classifications as they are then. */
    private readonly levelOf: () => string | null,
    private readonly shared: string[],
  ) {
    super(plugin.app);
    const reading = readNote(
      gqlBlocks(note).map((b) => b.text),
      undefined,
      shared,
    );
    this.things = new Map(
      [...reading.graphs]
        .filter(([, d]) => d.boxes.length)
        .map(([g, d]) => [g, d.boxes.map((b) => ({ key: b.key, text: b.text || b.key }))]),
    );
    this.views = new Map();
    for (const v of viewsOf(reading.texts))
      if (!v.fault) this.views.set(v.graph, [...(this.views.get(v.graph) ?? []), v.name]);
    this.graph = [...this.things.keys()][0] ?? '';
    this.model = modelChoices(plugin.settings, PURPOSE)[0]?.name ?? '';
  }

  override onOpen(): void {
    this.setTitle('Ask an AI model to propose changes');
    this.draw();
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  /** The dialog drawn again from what is chosen: its rows, what is shown, and its buttons. */
  private draw(): void {
    const el = this.contentEl;
    el.empty();
    this.sendButton = null;
    if (!this.things.size) {
      el.createEl('p', { text: 'This note has no graph with things in it, so there is nothing to send.' });
      return;
    }
    new Setting(el).setName('Graph').addDropdown((d) => {
      for (const g of this.things.keys()) d.addOption(g, g);
      d.setValue(this.graph).onChange((v) => {
        this.graph = v;
        this.ticked.clear();
        this.view = '';
        this.changed(true);
      });
    });
    new Setting(el)
      .setName('What to send')
      .setDesc('Only this is sent, with your question: nothing else of the note or the vault.')
      .addDropdown((d) =>
        d
          .addOption('graph', 'The whole graph')
          .addOption('view', 'A view of it')
          .addOption('things', 'Only the things ticked')
          .setValue(this.what)
          .onChange((v) => {
            this.what = v as What;
            this.changed(true);
          }),
      );
    if (this.what === 'view') this.drawViews(el);
    if (this.what === 'things') this.drawThings(el);
    this.drawModel(el);
    new Setting(el)
      .setName('Your question')
      .setDesc('What you ask the model; it is sent with what you chose.')
      .addTextArea((t) =>
        t.setValue(this.question).onChange((v) => {
          this.question = v;
          this.changed(false);
        }),
      );
    this.shownEl = el.createDiv({ cls: 'graph-note-ai-shown' });
    new Setting(el)
      .addButton((b) => b.setButtonText('Show what will be sent').onClick(() => void this.show()))
      .addButton((b) => {
        this.sendButton = b
          .setButtonText('Send')
          .setCta()
          .onClick(() => void this.send());
      })
      .addButton((b) => b.setButtonText('Cancel').onClick(() => this.close()));
    this.drawShown();
  }

  /** The views of the graph to choose from, or that it has none. */
  private drawViews(el: HTMLElement): void {
    const names = this.views.get(this.graph) ?? [];
    if (!names.length) {
      el.createEl('p', {
        text: `Graph ${this.graph} has no view in this note: choose the whole graph or tick things.`,
      });
      return;
    }
    if (!names.includes(this.view)) this.view = names[0] ?? '';
    new Setting(el).setName('View').addDropdown((d) => {
      for (const n of names) d.addOption(n, n);
      d.setValue(this.view).onChange((v) => {
        this.view = v;
        this.changed(false);
      });
    });
  }

  /** A row for each thing of the graph, ticked to be sent. */
  private drawThings(el: HTMLElement): void {
    for (const t of this.things.get(this.graph) ?? [])
      new Setting(el)
        .setName(t.text)
        .setDesc(t.key)
        .addToggle((c) =>
          c.setValue(this.ticked.has(t.key)).onChange((on) => {
            if (on) this.ticked.add(t.key);
            else this.ticked.delete(t.key);
            this.changed(false);
          }),
        );
  }

  /** The models that may be asked, the one set up for proposing changes first. */
  private drawModel(el: HTMLElement): void {
    const choices = modelChoices(this.plugin.settings, PURPOSE);
    const chosen = this.plugin.settings.aiModels.find((m) => m.name === this.model);
    new Setting(el)
      .setName('Model')
      .setDesc(
        chosen
          ? `${chosen.purpose || 'No purpose given'}; ${chosen.matrixRow ? `held to the matrix row ${chosen.matrixRow}` : `sent notes up to ${chosen.ceiling}`}.`
          : '',
      )
      .addDropdown((d) => {
        for (const c of choices) d.addOption(c.name, c.forPurpose ? `${c.name}, for ${PURPOSE.toLowerCase()}` : c.name);
        d.setValue(this.model).onChange((v) => {
          this.model = v;
          this.changed(true);
        });
      });
  }

  /** Something chosen changed: what was shown is no longer what would be sent, so the yes waits until it is shown again. */
  private changed(redraw: boolean): void {
    this.prepared = null;
    this.refusal = null;
    if (redraw) this.draw();
    else this.drawShown();
  }

  /** The exact request for what is chosen, or why nothing may be sent. */
  private show(): void {
    // the matrix note is read now, so a model held to a row is held to the row as the note has it; with none named,
    // nothing is waited for
    const note = this.plugin.settings.aiMatrixNote.trim();
    if (!note) this.prepare([]);
    else void readMatrix(this.app, note).then((rows) => this.prepare(rows));
  }

  /** Makes the request against the matrix rows as read. */
  private prepare(matrix: MatrixRow[]): void {
    const things = (this.things.get(this.graph) ?? []).map((t) => t.key).filter((k) => this.ticked.has(k));
    const choice: ScopeChoice =
      this.what === 'view'
        ? { graph: this.graph, what: 'view', view: this.view }
        : this.what === 'things'
          ? { graph: this.graph, what: 'things', things }
          : { graph: this.graph, what: 'graph' };
    // every model's key is read only to make sure none is among what is sent, whichever model it goes to; none is kept
    const secrets = this.plugin.settings.aiModels.flatMap((m) => {
      const key = m.keyName ? this.app.secretStorage.getSecret(m.keyName) : null;
      return key ? [key] : [];
    });
    const p = prepareSend({
      settings: this.plugin.settings,
      model: this.model,
      note: this.note,
      notePath: this.file.path,
      // read now, never kept from when the dialog opened, so a classification changed meanwhile is never stale here
      level: this.levelOf(),
      choice,
      question: this.question,
      secrets,
      shared: this.shared,
      matrix,
    });
    this.prepared = 'refused' in p ? null : p;
    this.refusal = 'refused' in p ? p.refused : null;
    this.drawShown();
  }

  /** What will be sent, exactly, with the model, its address and the headers; or why nothing may be. */
  private drawShown(): void {
    const el = this.shownEl,
      p = this.prepared;
    this.sendButton?.setDisabled(!p || this.sending);
    if (!el) return;
    el.empty();
    if (this.refusal) el.createEl('p', { cls: 'graph-note-ai-refused', text: this.refusal });
    if (!p) return;
    for (const line of p.summary) el.createEl('p', { text: line });
    el.createEl('p', { text: 'Exactly this is sent, with these headers, and only once you choose to send it:' });
    const headers = Object.entries(p.headersShown).map(([k, v]) => `${k}: ${v}`);
    el.createEl('pre', { cls: 'graph-note-ai-headers', text: headers.join('\n') });
    el.createEl('pre', { cls: 'graph-note-ai-body', text: p.body });
  }

  /** Sends what was shown, once; records the send; writes a proposal into the note, or says why there is none. */
  private async send(): Promise<void> {
    const p = this.prepared;
    if (!p || this.sending) return;
    // the note's classification read once more as Send is pressed: if it is not what was shown, what was shown is
    // taken away and nothing goes, so a classification changed meanwhile is never sent under the old one
    const now = this.levelOf();
    if (now !== p.level) {
      const was = p.level ?? 'none',
        is = now ?? 'none';
      this.prepared = null;
      this.refusal = `The note’s classification has changed since what will be sent was shown (it was ${was}, it is now ${is}). Nothing was sent: press Show what will be sent again.`;
      this.drawShown();
      return;
    }
    this.sending = true;
    this.drawShown();
    const key = p.model.keyName ? this.app.secretStorage.getSecret(p.model.keyName) : null;
    const result = await sendPrepared(p, confirmSend(p), { transport: obsidianTransport, key });
    this.sending = false;
    this.prepared = null;
    if ('refused' in result) {
      this.refusal = result.refused;
      this.drawShown();
      return;
    }
    await this.plugin.recordAiSend(result.record);
    if ('failed' in result) {
      new Notice(result.failed);
      this.refusal = result.failed;
      this.drawShown();
      return;
    }
    const { proposal } = result,
      n = proposal.changes.length;
    try {
      await this.app.vault.process(this.file, (now) => noteWithProposal(now, proposal));
    } catch (e) {
      new Notice(
        `${p.model.name} answered, but its proposal could not be written into ${this.file.path} (${String(e)}).`,
      );
      return;
    }
    new Notice(
      `${p.model.name} proposed ${n} change${n === 1 ? '' : 's'}: they are in the note as a change set beside the graph, each waiting for you to accept or reject it.`,
    );
    this.close();
  }
}
