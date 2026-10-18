// The stylesheet of the slice board (scripts/slice-board.mjs; spec §12, requirements_checked_in_ci). CSS only. Every
// colour is a custom property on :root, redefined for a dark scheme. The three altitudes are switched by radio inputs
// and `:checked ~` selectors. The layout holds at 400px. It makes no request: no font, image or import.

/** The three altitudes, as [id, label]: the id names the radio (`alt-<id>`) and the view (`view-<id>`). */
export const ALTITUDES = [
  ['overview', 'Overview'],
  ['working', 'Working'],
  ['full', 'Full'],
];

// Slightly hue-biased neutrals; proved, part and open are also told apart by the text label of their chip.
const LIGHT = {
  '--bg': '#f4f6f9',
  '--surface': '#ffffff',
  '--surface-2': '#e8ecf2',
  '--text': '#1a2030',
  '--muted': '#566074',
  '--border': '#d0d7e2',
  '--link': '#1f56c4',
  '--focus': '#1f56c4',
  '--proved': '#1b7f4d',
  '--proved-bg': '#d9f2e4',
  '--proved-text': '#0f4c2d',
  '--part': '#b36a00',
  '--part-bg': '#fdecc8',
  '--part-text': '#6b3f00',
  '--open': '#b4234a',
  '--open-bg': '#fbdbe3',
  '--open-text': '#7a1030',
  'color-scheme': 'light',
};
const DARK = {
  '--bg': '#10141b',
  '--surface': '#181d26',
  '--surface-2': '#232b38',
  '--text': '#e4e8f0',
  '--muted': '#9ba5b8',
  '--border': '#2e3748',
  '--link': '#8cb4ff',
  '--focus': '#8cb4ff',
  '--proved': '#3fbf82',
  '--proved-bg': '#14382a',
  '--proved-text': '#a6e9c8',
  '--part': '#e0a43a',
  '--part-bg': '#3d2d0e',
  '--part-text': '#f6d58f',
  '--open': '#ef6b8d',
  '--open-bg': '#411a27',
  '--open-text': '#f8b4c6',
  'color-scheme': 'dark',
};

const declarations = (tokens, indent) =>
  Object.entries(tokens)
    .map(([name, value]) => `${indent}${name}: ${value};`)
    .join('\n');

const altitudeRules = ALTITUDES.map(
  ([id]) => `#alt-${id}:checked ~ .view-${id} {
  display: block;
}
#alt-${id}:checked ~ .switch label[for="alt-${id}"] {
  background: var(--text);
  color: var(--bg);
}
#alt-${id}:focus-visible ~ .switch label[for="alt-${id}"] {
  outline: 3px solid var(--focus);
  outline-offset: 2px;
}`,
).join('\n');

const panelRules = ALTITUDES.map(([id]) => `#alt-${id}:checked ~ .prs`).join(',\n');

/** The whole stylesheet of the board, as the text between its `<style>` tags. */
export const BOARD_CSS = `:root {
${declarations(LIGHT, '  ')}
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${declarations(DARK, '    ')}
  }
}
:root[data-theme="dark"] {
${declarations(DARK, '  ')}
}
body {
  margin: 0;
  padding: 16px 0 48px;
  background: var(--bg);
  color: var(--text);
  font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
}
.banner,
.board {
  max-width: 72rem;
  margin: 0 auto;
  padding: 0 16px;
  box-sizing: border-box;
}
.banner {
  margin-bottom: 16px;
  color: var(--muted);
  font-size: 0.85rem;
  overflow-wrap: anywhere;
}
.alt {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}
.switch {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 16px;
}
.switch label {
  min-height: 44px;
  box-sizing: border-box;
  padding: 10px 18px;
  border: 2px solid var(--text);
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}
${altitudeRules}
h2 {
  margin: 0 0 12px;
  font-size: 1.25rem;
}
h3 {
  margin: 24px 0 8px;
  font-size: 1rem;
  color: var(--muted);
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  margin: 0 0 20px;
  padding: 0;
  list-style: none;
  font-size: 0.85rem;
  color: var(--muted);
}
.view {
  display: none;
}
.prs {
  display: none;
  margin: 0 0 24px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
}
${panelRules} {
  display: block;
}
.prs ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.pr {
  padding: 8px 0;
  border-top: 1px solid var(--border);
  overflow-wrap: anywhere;
}
.pr:first-child {
  border-top: 0;
}
.pr a {
  color: var(--link);
  font-weight: 600;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 4px;
  font-size: 0.85rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.ci-passed {
  color: var(--proved-text);
}
.ci-failed {
  color: var(--open-text);
}
.ci-running {
  color: var(--part-text);
}
.big {
  font-size: 2rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.counts,
.section-counts {
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}
svg.bar {
  display: block;
  width: 100%;
  max-width: 100%;
  height: 14px;
  border-radius: 7px;
  background: var(--surface-2);
}
.slice-bar svg.bar {
  height: 28px;
  border-radius: 14px;
}
.seg-proved {
  fill: var(--proved);
}
.seg-part {
  fill: var(--part);
}
.seg-open {
  fill: var(--open);
}
.section-rows {
  margin: 24px 0 0;
  padding: 0;
  list-style: none;
}
.section-row {
  display: grid;
  grid-template-columns: minmax(0, 18rem) minmax(0, 1fr) minmax(0, 14rem);
  gap: 4px 16px;
  align-items: center;
  padding: 10px 0;
  border-top: 1px solid var(--border);
}
.chip {
  display: inline-block;
  padding: 0 8px;
  border: 1px solid currentColor;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1.6;
}
.chip-proved,
.chip-written {
  background: var(--proved-bg);
  color: var(--proved-text);
}
.chip-part,
.chip-partial {
  background: var(--part-bg);
  color: var(--part-text);
}
.chip-open,
.chip-planned {
  background: var(--open-bg);
  color: var(--open-text);
}
.req {
  margin: 0 0 12px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-left-width: 6px;
  border-radius: 8px;
  background: var(--surface);
}
.req-proved {
  border-left-color: var(--proved);
}
.req-part {
  border-left-color: var(--part);
}
.req-open {
  border-left-color: var(--open);
}
.req-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
}
.id {
  font-weight: 700;
  overflow-wrap: anywhere;
}
.level {
  font-size: 0.85rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.rule,
.proves {
  overflow-wrap: anywhere;
}
.rule {
  margin: 6px 0;
}
.tests {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  font-size: 0.9rem;
}
.test {
  padding: 6px 0;
  border-top: 1px dashed var(--border);
}
.scroll {
  overflow-x: auto;
  max-width: 100%;
}
.files code {
  margin-right: 10px;
  white-space: nowrap;
  font-size: 0.82rem;
}
.where,
.no-test {
  color: var(--muted);
  font-size: 0.85rem;
}
@media (max-width: 40rem) {
  .section-row {
    grid-template-columns: minmax(0, 1fr);
  }
}`;
