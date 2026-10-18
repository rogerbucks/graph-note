# H-12 No picture loaded from an embed

**You should see:** With the phone online, the Pictures box stands for a note you make below, which holds two pictures from the web, one written as Markdown and one as HTML, and embeds the sample note. Its details show that note's words, but each picture only as a link reading its address, with no picture drawn and nothing fetched; the sample note it embeds is shown as a link to it, not read in.

**Test diagram:**

```gql
// graph: no_remote_pictures · SOURCE
(pictures:Doc {id: 'note:Pictures from the web', name: 'Pictures'})
```

<!-- expect: clean -->

**Do this:**

1. Turn aeroplane mode off for this check, and on again after it.
2. Make a note named Pictures from the web, and type into it the three lines in the block below.
3. Back in this note, tap Pictures: its details show "Two pictures follow.", then two links, each reading its picture's address, and a link to Sample graph note. No picture is drawn.
4. Delete the note Pictures from the web afterwards.

```text
Two pictures follow.
![](https://obsidian.md/images/banner.png) <img src="https://obsidian.md/favicon.ico">
![[Sample graph note]]
```

**Checklist line:**

> **H-12** With the phone online, take a thing that stands for a note holding a picture from the web, written as Markdown and as HTML. Its details show each picture only as a link with its address, and no picture is loaded. A note that note embeds is a link too.

**Back to the checklist:** [H-12 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for H-12 in its list.
