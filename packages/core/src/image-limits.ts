// How an animated image starts, and when it may play (editor spec §18, §11). The limits it is held to are stated
// (`IMAGE_LIMITS`, said by `limitsSaid`), so a large image never slows the drawing. Within them it moves, unless the
// system asks for reduced motion. Then it starts still, its first frame, until the user plays it
// (motion_reduced_respected). Past one it is shown as its first frame, saying why, and playing it is refused with the
// same reason (animated_image_limited). No more than `IMAGE_LIMITS.moving` move at once in one drawing; the rest are
// held still until another is paused. Pure: the host counts what moves, and says the words.
import type { ImageFacts } from './image-facts.ts';
import { word } from './words.ts';
import type { WordKey, WordValues } from './words.ts';

/** How words are said: in the reader's language (`word`), or in UK English for a file's bytes (`sourceWord`). */
export type Say = (key: WordKey, values?: WordValues) => string;

/**
 * The limits an animated image moves within: its size on disk, the pixels of one frame, and its frames. Also how many
 * move at once in one drawing, its details among them. An image past any of them is shown as its first frame.
 */
export const IMAGE_LIMITS = { bytes: 5 * 1024 * 1024, pixels: 2_000_000, frames: 500, moving: 6 } as const;

/** A whole number with its thousands marked, as the limits are said. */
const counted = (n: number): string => String(n).replace(/\B(?=(\d{3})+$)/g, ',');

/** A size in megabytes, to one decimal place where it has one. */
const megabytes = (bytes: number): string => `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;

/** The limits in one sentence, in the reader's language, for the settings page, the guide and a device check. */
export const limitsSaid = (): string =>
  word('images.limits', {
    size: megabytes(IMAGE_LIMITS.bytes),
    pixels: counted(IMAGE_LIMITS.pixels),
    frames: counted(IMAGE_LIMITS.frames),
    moving: String(IMAGE_LIMITS.moving),
  });

/** What an image still under reduced motion says (motion_reduced_respected), in the reader's language. */
export const reducedWords = (): string => word('images.reduced');

/** How an image starts: moving; or still, saying why, and whether pressing Play may move it. */
export type Start =
  | { moving: true }
  | {
      moving: false;
      playable: boolean;
      why: string;
      /** Set for an image that does not move at all: shown as it is, with no control and nothing to say. */
      plain?: true;
    };

/** What an image may be: its facts when it was read, and its size on disk. */
export interface ImageAt {
  /**
   * Null when it was not read, being over the size limit. It may move, so it is held as one that does, unless its type
   * never moves (`neverMoves`). Facts of no known format may move too (an AVIF the reader does not know, say). So they
   * are held as moving ones are, with a control and still under reduced motion.
   */
  facts: ImageFacts | null;
  size: number;
  /** For an image not read: set when its type, by its name, never moves (a JPEG), so it is shown as it is. */
  neverMoves?: boolean;
}

/**
 * Why an animated image is past a limit, in words after "Shown as its first frame: ", or null when it is within them.
 * They are in the reader's language, unless `say` is `sourceWord`, for a file's bytes.
 */
export function pastLimit({ facts, size }: ImageAt, say: Say = word): string | null {
  const most = IMAGE_LIMITS;
  if (size > most.bytes) return say('images.past.size', { size: megabytes(size), most: megabytes(most.bytes) });
  if (facts && facts.width * facts.height > most.pixels)
    return say('images.past.pixels', {
      width: String(facts.width),
      height: String(facts.height),
      most: counted(most.pixels),
    });
  if (facts && facts.frames > most.frames)
    return say('images.past.frames', { frames: counted(facts.frames), most: counted(most.frames) });
  return null;
}

/** Why an image waits, still, while as many as may move at once already do. */
const countWords = (): string => word('images.waits', { moving: String(IMAGE_LIMITS.moving) });

/**
 * How an image starts in a drawing or its details, where `moving` images already move:
 * - still and as it is, when it does not move;
 * - not shown, saying why, when it was not read, being over the size limit (Play refused);
 * - its first frame, saying why, when past a limit (Play refused) or under reduced motion (Play allowed);
 * - still, while as many as may move at once already do;
 * - otherwise moving.
 */
export function startOf(x: ImageAt & { reduced: boolean; moving: number }): Start {
  const still = x.facts ? x.facts.format !== null && !x.facts.animated : !!x.neverMoves;
  if (still) return { moving: false, playable: false, why: '', plain: true };
  const past = pastLimit(x);
  if (past && !x.facts) return { moving: false, playable: false, why: word('images.not-read', { why: past }) };
  if (past) return { moving: false, playable: false, why: word('images.first-frame', { why: past }) };
  if (x.reduced) return { moving: false, playable: true, why: reducedWords() };
  if (x.moving >= IMAGE_LIMITS.moving) return { moving: false, playable: true, why: countWords() };
  return { moving: true };
}

/** Why pressing Play on an image that started as `start` is refused while `moving` images move, or null when it may play. */
export function playRefusal(start: Start, moving: number): string | null {
  if (!start.moving && !start.playable) return start.why;
  return moving >= IMAGE_LIMITS.moving ? countWords() : null;
}
