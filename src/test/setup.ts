import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom has no canvas: give every 2d context a no-op stub so Wand code runs.
const ctxStub = new Proxy({} as CanvasRenderingContext2D, {
  get: (t, k) => (k in t ? (t as any)[k] : k === "createRadialGradient" ? () => ({ addColorStop() {} }) : () => {}),
  set: () => true,
});
HTMLCanvasElement.prototype.getContext = (() => ctxStub) as any;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
if (!("PointerEvent" in window)) (window as any).PointerEvent = MouseEvent;

vi.stubGlobal(
  "requestAnimationFrame",
  (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16) as unknown as number,
);
vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));

afterEach(() => cleanup());
