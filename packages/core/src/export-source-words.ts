// The words of the export form, of making an export and of writing it, in UK English (editor spec §16 and §42, words_catalogue). They are
// said when an export is made, shared or written into the vault, and when a link makes a note.
// source-words.ts keeps them with every other word.

/** The words of exporting, by key, in UK English. */
export const EXPORT_SOURCE_WORDS = {
  // the export form
  'export.form': 'Export',
  'export.data-gql': 'Data as a GQL block',
  'export.data-csv': 'Data as CSV',
  'export.data-graphml': 'Data as GraphML',
  'export.view': 'View {name}',
  'export.view-in-context': 'View {name}, with the rest faded',
  'export.whole': 'The whole diagram',
  'export.path': 'Path {title}, played as an animated SVG',
  'export.what': 'What to export',
  'export.format': 'Format',
  'export.pace': 'Pace',
  'export.pace-half': 'Half a second a step',
  'export.pace-seconds': { one: '{count} second a step', other: '{count} seconds a step' },
  // why there is nothing to export (export-scope.ts)
  'export.scope.graph-empty': 'Graph {graph} has no things in this note: add some, or pick another graph',
  'export.scope.view-empty': 'View {view} matches nothing: {why}',
  'export.scope.view-empty-plain': 'View {view} matches nothing: change the view',
  // why an export is not made, or asked about first (export.ts, export-plan.ts)
  'export.nothing': 'There is nothing to export: {why}',
  'export.scope-empty': 'the scope is empty',
  'export.animation-not-made': 'The animated SVG was not made: {why}. {fix}.',
  'export.ask.unknown':
    '{note} is classified "{given}", which is not one of the classifications set ({levels}), so it counts as above every level, {level} included.',
  'export.ask.level-gone':
    '{note} is classified {given}, and the level set for asking before an export, {level}, is no longer one of the classifications, so every classified note is asked about.',
  'export.ask.above': '{note} is classified {given}, above {level}, the level set for asking before an export.',
  'export.ask.anyway': 'Export it anyway?',
  'export.graphml.not-held':
    '{where} holds a character GraphML cannot hold (U+{code}), so it cannot be exported as GraphML without losing it: export it as a GQL block or as CSV, which hold it',
  'export.graphml.thing-id': 'A thing’s id, {id},',
  'export.graphml.thing-property': 'Thing {id}’s {name}',
  'export.graphml.link-property': 'The link {from} {type} {to}’s {name}',
  // what an image's frame says, in UK English as its bytes (sourceWord), and the same in the notice (export.ts)
  'export.footer': 'From {note}, exported {date}',
  'export.reading-faded': '{reading} (the rest of the graph is faded)',
  // what was done with each picture on a box (export-pictures.ts)
  'export.picture.not-drawn': '{thing}: not drawn, as {why}',
  'export.picture.too-large': '{thing}: {name} left out, as it is {size}, over {most}',
  'export.picture.not-embedded': '{thing}: not drawn, as {name} is not of an image type an export embeds',
  'export.picture.png': 'a PNG cannot move',
  'export.picture.moving-already': '{moving} animated images already move in it',
  'export.picture.moving': '{thing}: {name} kept moving, and still under reduced motion',
  'export.picture.moving-always':
    '{thing}: {name} kept moving, and moving under reduced motion too, as its first frame could not be made',
  'export.picture.first-frame': '{thing}: {name} reduced to its first frame, as {why}',
  'export.picture.left-out': '{thing}: {name} left out, as {why} and its first frame could not be made',
  'export.animated-images': 'Animated images: {said}.',
  'export.theme': 'Theme',
  'export.anyway': 'Export anyway',
  'export.do-not': 'Do not export',
  'export.ready': '{name} is ready.',
  'export.share': 'Share',
  'export.it': 'Export it',
  // making the export and writing it
  'write.cause.full': 'the disk is full',
  'write.cause.refused': 'permission was refused',
  'write.cause.read-only': 'the folder cannot be written to',
  'write.cause.no-folder': 'the folder is not there',
  'write.cause.long-name': 'the file name is too long',
  'write.cause.in-use': 'the file is in use by another program',
  'write.cause.none': 'the host gave no reason',
  'write.cause.empty': 'there is nothing to write',
  'write.cause.temp-is-target': 'the temporary file would be the target itself',
  'write.failed': 'The export could not be written: {cause}.',
  'write.failed-left':
    'The export could not be written: {cause}. The temporary file {temp} could not be removed, so delete it by hand.',
  'write.no-source': 'there is no {name} to move',
  'exporting.nothing-saved': 'Nothing was saved.',
  'exporting.no-path': 'The path {id} is not in the note with a step to play, so nothing was exported.',
  'exporting.svg-only': 'A played path is exported as an animated SVG only. Nothing was saved. Choose SVG.',
  'exporting.bad-pace':
    'The animated SVG was not made: {pace} is not a pace a path plays at. Nothing was saved. Choose one of {paces}.',
  'exporting.failed': 'The export could not be made: {why}',
  'exporting.no-note': 'The note is not there any more, so nothing was exported.',
  'exporting.plan-changed': 'the plan changed while the pages were drawn',
  'exporting.on-pages': { one: '{name} on {count} page', other: '{name} on {count} pages' },
  'exporting.shared': 'Shared {name}.',
  'exporting.share-closed': 'Not shared: the share sheet was closed. Nothing was saved.',
  'exporting.share-failed': 'Not shared: {why}. Nothing was saved.',
  'exporting.no-page-kept': 'None of its pages was kept.',
  'exporting.left': '{paths} could not be taken away again: delete it by hand.',
  'exporting.left-many': '{paths} could not be taken away again: delete them by hand.',
  'exporting.earlier-kept': 'An earlier export of that name was kept.',
  'exporting.pages': '{count} pages, {first} to {last}',
  'exporting.done': 'Exported {what}.',
  'exporting.done-in-vault': 'Exported {what}, saved in the vault, as this phone cannot share a file of this kind.',
  'exporting.note-failed.data': 'The data was saved at {what}, but its companion note could not be written: {cause}.',
  'exporting.note-failed.image': 'The image was saved at {what}, but its companion note could not be written: {cause}.',
  'exporting.note-failed.pages':
    'The pages were saved at {what}, but its companion note could not be written: {cause}.',
  'exporting.note-failed.data-vault':
    'The data was saved at {what} in the vault, as this phone cannot share a file of this kind, but its companion note could not be written: {cause}.',
  'exporting.note-failed.image-vault':
    'The image was saved at {what} in the vault, as this phone cannot share a file of this kind, but its companion note could not be written: {cause}.',
  'exporting.note-failed.pages-vault':
    'The pages were saved at {what} in the vault, as this phone cannot share a file of this kind, but its companion note could not be written: {cause}.',
  'exporting.too-large-to-animate': 'The animated SVG was not made: {why}. Nothing was saved. To make it fit, {fix}.',
  'exporting.unloaded':
    'The export was stopped: ThoughtKnot was unloaded before the layout finished. Nothing was saved. Try again once ThoughtKnot is enabled again.',
  'exporting.too-large-png':
    'The drawing is too large to draw as a PNG on this device ({width} by {height}), even across pages; export it as SVG.',
  'exporting.page-unnamed': 'page {number} has no name',
  'exporting.png-too-large': 'the image is too large for this device to draw as a PNG; export it as SVG',
  'exporting.png-failed': 'the PNG could not be drawn',
  'exporting.png-unreadable': 'the drawing could not be read as an image',
  'images.not-in-vault': '{link} is not in the vault',
  'links.note-failed': 'The note {path} could not be made: {why}',
  'links.note-made': 'Created the note {path}.',
} as const;
