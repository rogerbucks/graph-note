// Stand-ins for Obsidian's settings page (spec §21): a plugin's tab, its settings rows and their controls. Also the
// app's own secret store, where a key is kept by name outside the vault. A row is laid out as Obsidian lays one out.
// It has a name and a description beside its controls, so a test reads the page as a person does.

/** The settings classes, and the app's secret store added to `app`; every tab a plugin adds is kept in `state.settingTabs`. */
export function fakeSettings(state, app) {
  state.settingTabs = [];
  state.secrets = state.secrets ?? new Map();
  app.secretStorage = {
    setSecret: (id, secret) => state.secrets.set(id, secret),
    getSecret: (id) => state.secrets.get(id) ?? null,
    listSecrets: () => [...state.secrets.keys()],
  };

  /**
   * A plugin's tab, drawn from its declarative definitions as Obsidian 1.13 draws them.
   * - A group under its heading.
   * - A control in its row.
   * - An action as a row that can be clicked.
   * - A list with its add and delete buttons.
   * - A page as a row holding its own rows. Obsidian opens it as a page of its own.
   */
  class PluginSettingTab {
    constructor(app_, plugin) {
      this.app = app_;
      this.plugin = plugin;
      this.containerEl = globalThis.document.createElement('div');
    }
    display() {
      this.containerEl.empty();
      for (const item of this.getSettingDefinitions()) this.draw(this.containerEl, item);
    }
    update() {
      this.display();
    }
    hide() {}
    draw(el, item, index = 0, list = null) {
      if (item.type === 'group' || item.type === 'list') {
        if (item.heading) new Setting(el).setName(item.heading).setHeading();
        (item.items ?? []).forEach((x, i) => this.draw(el, x, i, item.type === 'list' ? item : null));
        if (item.addItem)
          new Setting(el).addButton((b) => b.setButtonText(item.addItem.name).onClick(item.addItem.action));
        return;
      }
      const row = new Setting(el).setName(item.name).setDesc(item.desc ?? '');
      if (item.type === 'page') (item.items ?? []).forEach((x) => this.draw(row.settingEl, x));
      if (list?.onDelete)
        row.addExtraButton((b) => b.setTooltip(`Delete ${item.name}`).onClick(() => list.onDelete(index)));
      if (item.action)
        row.addButton((b) => b.setButtonText(item.name).onClick(() => item.action(row.settingEl, index)));
      if (item.render) item.render(row, null);
      const c = item.control;
      if (!c) return;
      const value = this.getControlValue(c.key) ?? c.defaultValue;
      const set = (v) => this.setControlValue(c.key, v);
      if (c.type === 'dropdown')
        row.addDropdown((d) => {
          for (const [v, n] of Object.entries(c.options)) d.addOption(v, n);
          d.setValue(value).onChange(set);
        });
      else if (c.type === 'toggle') row.addToggle((t) => t.setValue(value).onChange(set));
      else if (c.type === 'textarea') row.addTextArea((t) => t.setValue(value).onChange(set));
      else row.addText((t) => t.setValue(value).onChange(set));
    }
  }

  const button = (el) => {
    const b = el.createEl('button');
    const c = {
      buttonEl: b,
      setButtonText: (t) => (b.setText(t), b.setAttribute('aria-label', t), c),
      setIcon: (i) => (b.setAttribute('data-icon', i), c),
      setTooltip: (t) => (b.setAttribute('aria-label', t), c),
      setCta: () => c,
      setWarning: () => c,
      setDisabled: (d) => ((b.disabled = d), c),
      onClick: (f) => (b.addEventListener('click', f), c),
    };
    return c;
  };

  class Setting {
    constructor(containerEl) {
      this.settingEl = containerEl.createDiv({ cls: 'setting-item' });
      this.infoEl = this.settingEl.createDiv({ cls: 'setting-item-info' });
      this.nameEl = this.infoEl.createDiv({ cls: 'setting-item-name' });
      this.descEl = this.infoEl.createDiv({ cls: 'setting-item-description' });
      this.controlEl = this.settingEl.createDiv({ cls: 'setting-item-control' });
    }
    setName(t) {
      this.nameEl.setText(t);
      return this;
    }
    setDesc(t) {
      this.descEl.setText(t);
      return this;
    }
    setHeading() {
      this.settingEl.addClass('setting-item-heading');
      return this;
    }
    setClass(c) {
      this.settingEl.addClass(c);
      return this;
    }
    addDropdown(cb) {
      const sel = this.controlEl.createEl('select');
      const c = {
        selectEl: sel,
        addOption: (v, n) => (sel.createEl('option', { text: n, attr: { value: v } }), c),
        setValue: (v) => ((sel.value = v), c),
        getValue: () => sel.value,
        onChange: (f) => (sel.addEventListener('change', () => f(sel.value)), c),
      };
      cb(c);
      return this;
    }
    addToggle(cb) {
      const t = this.controlEl.createEl('input', { attr: { type: 'checkbox' } });
      const c = {
        toggleEl: t,
        setValue: (v) => ((t.checked = !!v), c),
        getValue: () => !!t.checked,
        onChange: (f) => (t.addEventListener('change', () => f(!!t.checked)), c),
      };
      cb(c);
      return this;
    }
    addText(cb) {
      return this.field('input', cb);
    }
    addTextArea(cb) {
      return this.field('textarea', cb);
    }
    field(tag, cb) {
      const f = this.controlEl.createEl(tag);
      const c = {
        inputEl: f,
        setValue: (v) => ((f.value = v), c),
        getValue: () => f.value,
        setPlaceholder: (p) => (f.setAttribute('placeholder', p), c),
        onChange: (fn) => (f.addEventListener('input', () => fn(f.value)), c),
      };
      cb(c);
      return this;
    }
    addButton(cb) {
      cb(button(this.controlEl));
      return this;
    }
    addExtraButton(cb) {
      cb(button(this.controlEl));
      return this;
    }
  }

  /** The app's field for choosing a secret by name; `enter(name, secret)` is a person saving one through it. */
  class SecretComponent {
    constructor(app_, containerEl) {
      this.app = app_;
      this.el = containerEl.createDiv({ cls: 'fake-secret' });
      this.el.secretComponent = this;
      this.value = '';
    }
    setValue(v) {
      this.value = v;
      return this;
    }
    onChange(cb) {
      this.changed = cb;
      return this;
    }
    enter(name, secret) {
      this.app.secretStorage.setSecret(name, secret);
      this.value = name;
      this.changed?.(name);
    }
  }

  return { PluginSettingTab, Setting, SecretComponent };
}
