# Links and attachments (spec §18)

Purpose: finding and judging the links and attachments written in a note, making their Markdown safe, and following renames. Part of the [core guide](../GUIDE.md).

The core finds and judges links; the host says which files the vault holds, and opens, previews and renders through its
own handlers. Nothing here reaches the network.

- `links.ts` — the entry for §18, re-exporting the three below: `linksHeld` (every link in a thing's or relationship's
  text properties, by property), `attachmentsOf` (a thing's files, by name and type, each once), `noteOf` (a thing whose
  id is a global note id, `note:` and the note's name as graph spec §10 writes it, or a link to a note, stands for it),
  and `brokenLinks` (each written link found from where the last of the same was, what it meant worked out once per
  target) (each link to a note or file the host's `LinkVault` does not
  hold: a warning on the line it is written, its fix in words, Create the note or Put the file in the vault, or change it
  to what it most likely meant — a file of the same name with another extension, else the nearest names — with the
  place to change; `withMeant` writes that change into the block).
- `link-scan.ts` — `linksIn`, one linear pass over each line (every search for a closing mark goes on from where the
  last stopped): wikilinks with heading and alias, embeds, Markdown links and images, bare web and mail addresses, each
  with where its target is written; `linkKind` (only notes, files, web and mail addresses are opened; any other scheme,
  however disguised by controls or entities, is refused); `linkTo` (a host's rendered link, judged alike);
  `leavingWords` (said before a link leaves the host) and `refusedWords`; `attachmentType`.
- `link-markdown.ts` — `safeMarkdown`: what a host renders for a thing's details, with an image from outside the vault,
  Markdown or HTML, made a link showing its address (nothing remote loaded), a Markdown link or reference definition the
  user may not open escaped to text (its address on its own line or the next), other raw HTML escaped, inside maths too,
  a note embed made a link, and only an image, a sound, a video or a PDF of the vault left embedded (a canvas, a base or
  any other file embedded is a link); code spans and fences untouched, told apart as CommonMark tells them (an escaped
  backtick opens no span; a backtick fence's words hold no backtick; a fence closes on its marks alone). `embedParts`
  cuts out each note embedded, for the host to read itself, and `embeddedMarkdown` is that note's text made safe, front
  matter left out, only the section a heading embed names (offline_and_mobile_apis).
- `link-renames.ts` — `renamedLinks`, the changes that follow a renamed note or file in every link inside a note's
  graph blocks (never prose), keeping each link's alias, heading and form; a link that still finds a file, or whose new
  name a block could not hold, is left; `applyChanges` makes them.
