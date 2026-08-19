// The parts of the Ctrl+Alt+Del menu an app is allowed to reach. Windows only:
// the sequence itself belongs to the kernel and can be neither recorded nor
// sent, so these call the APIs behind its menu items instead.
//
// The ids are the contract: a spell stores one as a plain string, and
// `system_action_kind` in src-tauri/src/win.rs is what turns it back into a
// call. An id only one side knows about saves happily and fails at cast time,
// which is why that file has a test naming these five.

export const SYSTEM_ACTIONS = [
  { id: "lock", label: "Lock the screen" },
  { id: "taskmgr", label: "Task Manager" },
  { id: "switchuser", label: "Switch user" },
  { id: "signout", label: "Sign out" },
  { id: "sleep", label: "Sleep" },
] as const;

export type SystemAction = (typeof SYSTEM_ACTIONS)[number]["id"];

export const systemLabel = (id: string): string => SYSTEM_ACTIONS.find((a) => a.id === id)?.label ?? id;
