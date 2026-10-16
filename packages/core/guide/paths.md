# Paths (spec §7; graph spec §22)

Purpose: walked paths, written into a note, played step by step, exported as an animated SVG, and kept numbered when a step is taken out. Part of the [core guide](../GUIDE.md).

- `paths.ts` — walked paths. `PathRecorder` takes the boxes tapped in order (the last step tapped again is ignored; an
  earlier one is added again, as a walk may revisit). `pathBlock` writes the walk at the end of a block as a `Path` node
  with `STEP` edges numbered 1 to n, comma-joined, with a fresh id in the graph's style, and refuses with a reason when
  there are no steps or no title, a step is not a fact in the graph, or a locked graph does not declare Path and STEP.
  `pathsOf` gives each path as data: its steps in seq order, each marked `missing` when the thing is not in the graph
  (the reader leaves such a STEP out and reports it; `paths.ts` finds it again in the problem's `dropped` text), and the
  path marked `empty` when it has no steps. `PathPlayer` plays one path step by step with a screen-reader sentence for
  each ("Step 2 of 5: …"); a missing step is stopped on and announced as missing, and a path with no steps is refused
  (`PathPlayer.refusal`), never played as an empty story. `pathProblems` reports a STEP through something removed, on the
  STEP's own line with its fix and, where the step sits on one line, the edit that removes it, and a path with no steps;
  `mergePathProblems` is what `readNote` uses to put them in `NoteReading.problems`, replacing the reader's own report of
  the same STEP, so the badge counts each once.
- `path-play.ts` — `PathAutoplay`: Play stepping through a path on its own (path_autoplay), around a `PathPlayer`
  (which also says where it is, `index`, and goes back to the first step, `restart`): from the step it is on, one step at
  the pace set (`PATH_PACES`, `DEFAULT_PACE`, said by `paceSaid`), until the last; paused or stopped at any step, played
  on from where it paused, a step taken by hand pausing it. The host hands in its timer (`Scheduler`), so the core never
  waits on a clock and a host clears it when its card goes.
- `path-animation.ts` — a played path exported as an animated SVG (path_animation_export): `pathPlan` (each step's
  thing, by Graphviz's node number, and a dot for each two steps in a row a drawn link joins, forwards along the walk),
  `pathBody` (each step's number on its thing, and the dots' runners) and `pathCss` (a heavier outline moving from step
  to step at the pace, round and round, by `step-end` keyframes; every step outlined when still; all of it stopped under
  reduced motion); `pathSubtitle` says the walk in order. `animationFits` refuses one too large for the device
  (`ANIMATION_LIMITS`: steps, and an estimate of its bytes), saying why and what would make it fit, before anything is
  laid out (animation_export_fits); `exportWithLayout` gives that refusal back as a `TooLargeToAnimate`.
- `path-edits.ts` — a step taken out numbers the later steps of its path again (`stepsAfter`), carried as the removing
  fix's further edits (`Problem.also`), so the path keeps §22's steps 1 to n.
