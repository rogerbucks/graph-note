// The demo's Obsidian stand-in: the browser harness's, with each icon drawn as the browser editor's page draws it. Its
// picture is the same file under packages/claude-code/page/icons, painted in the text's colour (icons.css). A name with
// no picture is drawn as the harness's unknown icon.
export * from './obsidian-shim.js';

/** Obsidian's setIcon: a span painted with the named icon, first in `el`. */
export function setIcon(el, icon) {
  el.setAttribute('data-icon', icon);
  el.querySelector(':scope > .demo-icon')?.remove();
  const span = document.createElement('span');
  span.className = `demo-icon demo-icon-${icon}`;
  span.setAttribute('aria-hidden', 'true');
  el.prepend(span);
}
