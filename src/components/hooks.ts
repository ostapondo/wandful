import { useEffect, type RefObject } from "react";

/** requestAnimationFrame loop with dt (ms, capped at 50). Stops on unmount. */
export function useFrameLoop(fn: (dt: number, now: number) => void) {
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      fn(dt, now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * React's onChange fires on every keystroke/drag; the native `change` event
 * fires once the value is committed (slider released, colour picker closed).
 * Use this when a change should hit the backend only on commit.
 */
export function useNativeChange(ref: RefObject<HTMLInputElement | null>, onCommit: (value: string) => void) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = () => onCommit(el.value);
    el.addEventListener("change", h);
    return () => el.removeEventListener("change", h);
  }, [ref, onCommit]);
}
