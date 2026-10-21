// The one fetch of a plug-in file from a link (spec §13, offline_and_mobile_apis; §54, plugin_outside_file). It runs
// only when the person presses Add beside the link they typed. It fetches that one address, once. Only
// outside-plugins.ts reaches it, which checks the text before it is kept, off.
import { requestUrl } from 'obsidian';

/** The text at the https address `url`. */
export async function fetchPluginFile(url: string): Promise<string> {
  return (await requestUrl({ url })).text;
}
