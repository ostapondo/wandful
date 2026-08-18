import { describe, expect, it, vi } from "vitest";
import { replayRune } from "../replay";
import type { Wand } from "../wand";

function fakeWand() {
  return {
    visible: false,
    cursor: { x: 0, y: 0 },
    clear: vi.fn(),
    start: vi.fn(),
    addPoint: vi.fn(),
    end: vi.fn(),
  } as unknown as Wand & Record<string, any>;
}

describe("replayRune", () => {
  it("finishes immediately for a degenerate rune", () => {
    const w = fakeWand();
    const done = vi.fn();
    replayRune(w, [{ x: 1, y: 1 }], done);
    expect(w.clear).toHaveBeenCalled();
    expect(done).toHaveBeenCalled();
    expect(w.start).not.toHaveBeenCalled();
  });

  it("feeds every point to the wand and calls end + onDone", async () => {
    vi.useFakeTimers();
    const w = fakeWand();
    const done = vi.fn();
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    replayRune(w, pts, done);
    expect(w.start).toHaveBeenCalledWith(pts[0]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(w.addPoint).toHaveBeenCalledTimes(2);
    expect(w.end).toHaveBeenCalledWith(null);
    expect(done).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("cancel stops the animation before it ends", async () => {
    vi.useFakeTimers();
    const w = fakeWand();
    const done = vi.fn();
    const r = replayRune(
      w,
      [
        { x: 0, y: 0 },
        { x: 500, y: 0 },
      ],
      done,
    );
    r.cancel();
    await vi.advanceTimersByTimeAsync(2000);
    expect(w.end).not.toHaveBeenCalled();
    expect(done).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
