// An icon button, as every panel and bar of the display layer makes one (spec §3). It lives in the shell, below the
// graph view. So the progress banner and the export form reach it without importing the graph view.
import { setIcon } from './host';

/** An icon button named for screen readers, with words beside the icon when given. */
export function button(
  parent: HTMLElement,
  label: string,
  icon: string,
  onClick: () => void,
  text?: string,
): HTMLButtonElement {
  const b = parent.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': label, type: 'button' } });
  setIcon(b, icon);
  if (text) b.createSpan({ cls: 'thoughtknot-badge-text', text });
  b.addEventListener('click', onClick);
  return b;
}
