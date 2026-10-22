// Importing from a database (spec §20, db_import_on_request; §21, settings_db_connections). The database is a SQLite
// file in the vault, so nothing is set up and nothing reaches the network, on desktop and mobile alike. The command
// opens a dialog on the note in front. The user picks the file, names the graph and writes the queries. Nothing is read
// until Import is pressed. Then the rows are written at the end of the note, as a graph block of text that keeps no
// live link.
import { Modal, Notice, Setting } from 'obsidian';
import type { TFile } from 'obsidian';
import { readInHostDirection } from '@thoughtknot/core/display/host';
import { importedBlock, isDbFile, withImport, word } from '@thoughtknot/core';
import type ThoughtKnotPlugin from '../main';
import { noteToRewrite } from '../reading-view';
import { changeVaultNote } from '../storage/plugin-notes';

/** The command's id and name. */
export const IMPORT_COMMAND = {
  id: 'import-from-database',
  get name(): string {
    return word('host.command.import');
  },
};

/** Opens the import dialog on the note in front; or says why not: no database file is in the vault. */
export function importFromDatabase(plugin: ThoughtKnotPlugin): void {
  const files = plugin.app.vault
    .getFiles()
    .filter((f) => isDbFile(f.path))
    .sort((a, b) => a.path.localeCompare(b.path));
  if (!files.length) {
    new Notice(word('db.none'));
    return;
  }
  // the rows are written into the note, so a note in reading view is refused, as any command that writes is
  const front = noteToRewrite(plugin.app.workspace, word('host.to-import'));
  if (front) new ImportDialog(plugin, front.file, files).open();
}

/** Today, as YYYY-MM-DD in the device's own time zone. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The dialog: the database file, the graph's name and the queries. Only Import reads the file, once. */
class ImportDialog extends Modal {
  private chosen = 0;
  private graph = '';
  private things = '';
  private links = '';
  private running = false;

  constructor(
    private readonly plugin: ThoughtKnotPlugin,
    private readonly file: TFile,
    private readonly files: TFile[],
  ) {
    super(plugin.app);
  }

  override onOpen(): void {
    readInHostDirection(this.modalEl);
    this.setTitle(word('import.title'));
    const el = this.contentEl;
    new Setting(el)
      .setName(word('import.file'))
      .setDesc(word('import.file.sentence'))
      .addDropdown((d) => {
        for (const [i, f] of this.files.entries()) d.addOption(String(i), f.path);
        d.setValue('0').onChange((v) => {
          this.chosen = Number(v);
        });
      });
    new Setting(el)
      .setName(word('import.graph'))
      .setDesc(word('import.graph.sentence'))
      .addText((t) =>
        t.onChange((v) => {
          this.graph = v.trim();
        }),
      );
    new Setting(el)
      .setName(word('import.things'))
      .setDesc(word('import.things.sentence'))
      .addTextArea((t) =>
        t.onChange((v) => {
          this.things = v;
        }),
      );
    new Setting(el)
      .setName(word('import.links'))
      .setDesc(word('import.links.sentence'))
      .addTextArea((t) =>
        t.onChange((v) => {
          this.links = v;
        }),
      );
    el.createEl('p', { text: word('import.copy') });
    new Setting(el)
      .addButton((b) =>
        b
          .setButtonText(word('import.run'))
          .setCta()
          .onClick(() => void this.run()),
      )
      .addButton((b) => b.setButtonText(word('import.cancel')).onClick(() => this.close()));
  }

  /** Reads the database file, once, and writes what it returned into the note; or says why nothing was written. */
  private async run(): Promise<void> {
    const db = this.files[this.chosen];
    if (!db || this.running) return;
    this.running = true;
    const failed = (why: string) => new Notice(word('import.failed', { file: db.basename, why }));
    try {
      const queries = this.links.trim() ? [this.things, this.links] : [this.things];
      const [things = [], links = []] = await this.plugin.queryDatabase(await this.app.vault.readBinary(db), queries);
      const made = importedBlock(this.graph, things, links, { file: db.basename, date: today() });
      if ('refused' in made) {
        failed(made.refused);
        return;
      }
      await changeVaultNote(this.app, this.file.path, (now) => withImport(now, made.block));
      new Notice(word('import.done', { graph: this.graph, file: db.basename, note: this.file.basename }));
      this.close();
    } catch (e) {
      failed(e instanceof Error ? e.message : String(e));
    } finally {
      this.running = false;
    }
  }
}
