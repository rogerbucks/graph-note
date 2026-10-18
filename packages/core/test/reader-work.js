// The work a step gives the reader and the drawing, counted for the core's speed tests (spec §9, layout_contained and
// reading_contained), where what is held is really work: a text never read, a block read again only within the budget,
// drawing instructions never written. A count is the same on every machine and under any load, as no time is.
import gs from '@thoughtknot/graph-spec';

/**
 * Runs a step with the reader watched: what the step gave, how many times a block was handed to the reader to apply
 * (every read and every read again, each trial among them), the UTF-16 units handed to it in all, and the most at once.
 */
export function readerWork(step) {
  const apply = gs.Store.prototype.apply;
  const work = { calls: 0, units: 0, longest: 0 };
  gs.Store.prototype.apply = function (block) {
    work.calls++;
    work.units += block.length;
    work.longest = Math.max(work.longest, block.length);
    return apply.call(this, block);
  };
  try {
    return { out: step(), ...work };
  } finally {
    gs.Store.prototype.apply = apply;
  }
}

/**
 * A box of a drawing whose every property read is counted in `reads`, by name: a drawing instruction names its box by
 * its key, so a box whose key was never read was never written.
 */
export function watchedBox(box, reads) {
  return new Proxy(box, {
    get(target, name, receiver) {
      reads[name] = (reads[name] ?? 0) + 1;
      return Reflect.get(target, name, receiver);
    },
  });
}
