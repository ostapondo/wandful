import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { resetStores } from "../../test/fixtures";
import { ActionLabel } from "../Keys";

describe("<ActionLabel>", () => {
  beforeEach(() => resetStores());

  it("names the system action a spell runs", () => {
    render(<ActionLabel action="system" system="taskmgr" />);
    expect(screen.getByText(/Task Manager/)).toBeInTheDocument();
  });

  /** A spellbook can name an action this build does not know — one written by
   *  a newer version, or edited by hand. Showing the id beats showing nothing. */
  it("falls back to the id it was given", () => {
    render(<ActionLabel action="system" system="hibernate" />);
    expect(screen.getByText(/hibernate/)).toBeInTheDocument();
  });

  it("shows a shortcut as keys", () => {
    render(<ActionLabel action="shortcut" shortcut="Cmd+Shift+S" />);
    expect(screen.getAllByText(/⌘|⇧|S/).length).toBeGreaterThan(0);
  });
});
