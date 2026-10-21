// The core's own note storage as a plug-in (editor spec §43, plugin_interface). It sits apart from note-storage.ts, so
// the storage types load without the plug-in interface, which reads them.
import { memoryStorage } from './note-storage.ts';
import { PLUGIN_API } from './plugins.ts';
import type { ThoughtKnotPlugin } from './plugins.ts';

/**
 * The core's own storage, added through the plug-in interface as any plug-in's is (plugin_interface). It keeps notes in
 * memory, empty when opened, as a page or a test keeps them before it has a folder.
 */
export const CORE_STORAGE: ThoughtKnotPlugin = {
  id: 'thoughtknot.storage',
  version: '1.0.0',
  api: PLUGIN_API,
  uses: ['storage'],
  register: (points) => points.storage?.add({ name: 'memory', title: 'In memory', open: () => memoryStorage() }),
};
