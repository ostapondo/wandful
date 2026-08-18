import { api } from "../api/tauri";
import { useApp } from "../state/app";

export function PermissionBanner() {
  const show = useApp((s) => s.needsAccessibility);
  if (!show) return null;
  return (
    <div className="banner">
      <span>
        Wandful needs <b>Accessibility</b> to type shortcuts and to record them without other apps' hotkeys firing.
        Enable <b>Wandful</b> in System Settings → Privacy &amp; Security → Accessibility, then restart.
      </span>
      <span className="banner-actions">
        <button className="ghost" onClick={() => api.openAccessibilitySettings()}>
          Open settings
        </button>
        <button className="ghost" onClick={() => api.restartApp()}>
          Restart app
        </button>
      </span>
    </div>
  );
}
