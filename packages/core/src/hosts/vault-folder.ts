// The export folder rule, for the hosts that write an export (editor spec §21, §26): reached as
// `@thoughtknot/core/hosts/vault-folder`, so the browser editor's server refuses a folder the settings would never keep,
// by the very rule that keeps them. It is the core's own `vaultFolder`; no core module imports this file.
export { vaultFolder } from '../vault-folder.ts';
