import { beforeEach, describe, expect, it, vi } from "vitest";
import { installRecorder, startRecording, stopRecording, toggleRecording, recorderStore } from "../recorder";

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

  it("ignores keys when nobody is recording", () => {
    const e = new KeyboardEvent("keydown", { key: "a", code: "KeyA", cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });
});
