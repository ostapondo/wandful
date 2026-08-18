#!/bin/sh
# Writes the Homebrew cask for a published release to stdout.
#
#   sh scripts/make-cask.sh 0.1.0 > Casks/wandful.rb
#
# It downloads both macOS .dmg files from the GitHub release v<version> and
# hashes them, so the release must be published (or at least uploaded) first.
# The release workflow runs this on `release: published` and pushes the result
# to github.com/ostapondo/homebrew-tap; by hand it needs `gh` logged in.
set -eu

VERSION=${1:?usage: make-cask.sh <version>}
REPO=${WANDFUL_REPO:-ostapondo/wandful}
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

sha() {
  gh release download "v$VERSION" -R "$REPO" -p "Wandful_${VERSION}_$1.dmg" -D "$TMP" --clobber >&2
  shasum -a 256 "$TMP/Wandful_${VERSION}_$1.dmg" | cut -d' ' -f1
}
ARM=$(sha aarch64)
INTEL=$(sha x64)

cat <<RUBY
cask "wandful" do
  arch arm: "aarch64", intel: "x64"

  version "$VERSION"
  sha256 arm:   "$ARM",
         intel: "$INTEL"

  url "https://github.com/$REPO/releases/download/v#{version}/Wandful_#{version}_#{arch}.dmg",
      verified: "github.com/$REPO/"
  name "Wandful"
  desc "Magic wand for the desktop: draw a rune, cast a keyboard shortcut"
  homepage "https://github.com/$REPO"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: :catalina

  app "Wandful.app"

  zap trash: [
    "~/Library/Application Support/com.ostap.wandful",
    "~/Library/Caches/com.ostap.wandful",
    "~/Library/Preferences/com.ostap.wandful.plist",
    "~/Library/Saved Application State/com.ostap.wandful.savedState",
    "~/Library/WebKit/com.ostap.wandful",
  ]

  caveats <<~EOS
    Wandful is not notarized yet, so the first launch needs
    right-click → Open (or: xattr -d com.apple.quarantine /Applications/Wandful.app).

    It also needs Accessibility to type shortcuts into other apps:
    System Settings → Privacy & Security → Accessibility → enable Wandful.
  EOS
end
RUBY
