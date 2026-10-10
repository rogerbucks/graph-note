// Spike: the harness's shim of Obsidian, with what the plugin's settings (merged after the shim was written) also need:
// a settings tab and a secret field that do nothing here, the plugin's setting-tab hook, and the vault's cached read and
// file list over the one note the page holds.
import { Plugin, app, files, TFile } from '../../packages/obsidian/harness/obsidian-shim.js';

export * from '../../packages/obsidian/harness/obsidian-shim.js';

/** A settings tab: the browser view has no settings page. */
export class PluginSettingTab {
  constructor(a, plugin) {
    this.app = a;
    this.plugin = plugin;
    this.containerEl = document.createElement('div');
  }
  display() {}
  hide() {}
}

/** A field for a secret: none is kept by the browser view. */
export class SecretComponent {
  constructor(_a, el) {
    this.inputEl = el.createEl('input', { type: 'password' });
  }
  setValue() {
    return this;
  }
  onChange() {
    return this;
  }
}

Plugin.prototype.addSettingTab = function () {};
// commands are Obsidian's palette; the browser view has none
Plugin.prototype.addCommand ??= function (c) {
  return c;
};
Plugin.prototype.registerEvent ??= function () {};
app.vault.cachedRead ??= async (f) => files.get(f.path);
app.vault.getMarkdownFiles ??= () => [...files.keys()].map((p) => new TFile(p));
app.workspace.getActiveFile ??= () => null;
