import { beforeEach, describe, expect, it, vi } from "vitest";
import { installRecorder, startRecording, stopRecording, toggleRecording, recorderStore } from "../recorder";

// The backend's events never arrive in jsdom (`listen` is a no-op without
// Tauri), so hold on to the handlers and fire them by hand.
const handlers = vi.hoisted(() => new Map<string, (payload: unknown) => void>());
vi.mock("../../api/tauri", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/tauri")>();
  return {
    ...actual,
    listen: (event: string, handler: (payload: unknown) => void) => {
      handlers.set(event, handler);
      return Promise.resolve(() => {});
    },
  };
});
const captureEnded = () => handlers.get("wand:capture-ended")?.(undefined);

const key = (init: KeyboardEventInit) =>
  window.dispatchEvent(new KeyboardEvent("keydown", { ...init, cancelable: true }));

describe("chord recorder", () => {
  beforeEach(() => {
    installRecorder();
    stopRecording();
  });

  it("only one button records at a time", () => {
    startRecording("a", () => {});
    expect(recorderStore.getState().recordingId).toBe("a");
    startRecording("b", () => {});
    expect(recorderStore.getState().recordingId).toBe("b");
    toggleRecording("b", () => {});
    expect(recorderStore.getState().recordingId).toBeNull();
  });

  it("delivers a chord from a keydown and stops", () => {
    const got = vi.fn();
    startRecording("a", got);
    key({ key: "Meta" }); // modifier alone: ignored
    expect(got).not.toHaveBeenCalled();
    key({ key: "s", code: "KeyS", metaKey: true, shiftKey: true });
    expect(got).toHaveBeenCalledWith("Cmd+Shift+S");
    expect(recorderStore.getState().recordingId).toBeNull();
  });

  it("Escape cancels without a chord", () => {
    const got = vi.fn();
    startRecording("a", got);
    key({ key: "Escape" });
    expect(got).not.toHaveBeenCalled();
    expect(recorderStore.getState().recordingId).toBeNull();
  });

  it("window blur cancels", () => {
    startRecording("a", () => {});
    window.dispatchEvent(new Event("blur"));
    expect(recorderStore.getState().recordingId).toBeNull();
  });

  /** The backend stops swallowing the keyboard after 30s. Without this the
   *  button goes on saying "Press keys…" over a keyboard nobody is reading. */
  it("stops when the backend says the capture ended", () => {
    startRecording("a", () => {});
    expect(recorderStore.getState().recordingId).toBe("a");
    captureEnded();
    expect(recorderStore.getState().recordingId).toBeNull();
  });

  it("ignores keys when nobody is recording", () => {
    const e = new KeyboardEvent("keydown", { key: "a", code: "KeyA", cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });
});
