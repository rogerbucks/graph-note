// How an animated image starts, and when it may play (editor spec §18, §11): the limits it is held to are stated
// (`IMAGE_LIMITS`, said in `LIMITS_SAID`), so a large image never slows the drawing. Within them it moves, unless the
// system asks for reduced motion, when it starts still, its first frame, until the user plays it
// (motion_reduced_respected); past one it is shown as its first frame, saying why, and playing it is refused with the
// same reason (animated_image_limited); and no more than `IMAGE_LIMITS.moving` move at once in one drawing, the rest held
// still until another is paused. Pure: the host counts what moves, and says the words.
import type { ImageFacts } from './image-facts.ts';

/**
 * The limits an animated image moves within: its size on disk, the pixels of one frame, its frames, and how many move at
 * once in one drawing, its details among them. An image past any of them is shown as its first frame.
 */
export const IMAGE_LIMITS = { bytes: 5 * 1024 * 1024, pixels: 2_000_000, frames: 500, moving: 6 } as const;

/** A whole number with its thousands marked, as the limits are said. */
const counted = (n: number): string => String(n).replace(/\B(?=(\d{3})+$)/g, ',');

/** A size in megabytes, to one decimal place where it has one. */
const megabytes = (bytes: number): string => `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;

/** The limits in one sentence, for the settings page, the guide and a device check. */
export const LIMITS_SAID =
  `An animated image moves when it is at most ${megabytes(IMAGE_LIMITS.bytes)}, at most ` +
  `${counted(IMAGE_LIMITS.pixels)} pixels a frame and at most ${counted(IMAGE_LIMITS.frames)} frames, and at most ` +
  `${IMAGE_LIMITS.moving} move at once in one drawing.`;

/** What an image still under reduced motion says (motion_reduced_respected). */
export const REDUCED_WORDS = 'Still, as the system asks for reduced motion. Press Play to move it.';

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
   * Null when it was not read, being over the size limit: it may move, so it is held as one that does, unless its type
   * never moves (`neverMoves`). Facts of no known format may move too, so are held as moving ones are (an AVIF the
   * reader does not know, say), with a control and still under reduced motion.
   */
  facts: ImageFacts | null;
  size: number;
  /** For an image not read: set when its type, by its name, never moves (a JPEG), so it is shown as it is. */
  neverMoves?: boolean;
}

/** Why an animated image is past a limit, in words after "Shown as its first frame: ", or null when it is within them. */
export function pastLimit({ facts, size }: ImageAt): string | null {
  const most = IMAGE_LIMITS;
  if (size > most.bytes) return `it is ${megabytes(size)}, over the ${megabytes(most.bytes)} an animated image may be`;
  if (facts && facts.width * facts.height > most.pixels)
    return `each frame is ${facts.width} by ${facts.height} pixels, over the ${counted(most.pixels)} pixels a frame an animated image may have`;
  if (facts && facts.frames > most.frames)
    return `it has ${counted(facts.frames)} frames, over the ${counted(most.frames)} an animated image may have`;
  return null;
}

/** Why an image waits, still, while as many as may move at once already do. */
const countWords = (): string =>
  `Shown as its first frame: ${IMAGE_LIMITS.moving} animated images are already moving here. Pause one of them to play this one.`;

/**
 * How an image starts in a drawing or its details, where `moving` images already move: still and as it is when it does
 * not move; not shown, saying why, when it was not read, being over the size limit (Play refused); its first frame,
 * saying why, when past a limit (Play refused) or under reduced motion (Play allowed); still
 * while as many as may move at once already do; and otherwise moving.
 */
export function startOf(x: ImageAt & { reduced: boolean; moving: number }): Start {
  const still = x.facts ? x.facts.format !== null && !x.facts.animated : !!x.neverMoves;
  if (still) return { moving: false, playable: false, why: '', plain: true };
  const past = pastLimit(x);
  if (past && !x.facts) return { moving: false, playable: false, why: `Not shown: ${past}, so it is not read.` };
  if (past) return { moving: false, playable: false, why: `Shown as its first frame: ${past}.` };
  if (x.reduced) return { moving: false, playable: true, why: REDUCED_WORDS };
  if (x.moving >= IMAGE_LIMITS.moving) return { moving: false, playable: true, why: countWords() };
  return { moving: true };
}

/** Why pressing Play on an image that started as `start` is refused while `moving` images move, or null when it may play. */
export function playRefusal(start: Start, moving: number): string | null {
  if (!start.moving && !start.playable) return start.why;
  return moving >= IMAGE_LIMITS.moving ? countWords() : null;
}
