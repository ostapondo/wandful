#!/bin/sh
# Re-signs the built app with the stable "Wandful Dev" identity (if present) so
# Accessibility permission survives rebuilds. Ad-hoc signatures change every build.
APP="src-tauri/target/release/bundle/macos/Wandful.app"
if security find-identity -v -p codesigning 2>/dev/null | grep -q "Wandful Dev"; then
  codesign --force --deep --options runtime --sign "Wandful Dev" "$APP" && echo "signed $APP with Wandful Dev"
else
  echo "no 'Wandful Dev' identity — app stays ad-hoc signed (run: sh scripts/make-signing-cert.sh once)"
fi
