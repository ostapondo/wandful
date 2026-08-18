/** "/Applications/Spotify.app" → "Spotify"; "C:\Foo\bar.exe" → "bar". */
export function appBaseName(path: string): string {
  const last =
    path
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .pop() ?? path;
  return last.replace(/\.(app|exe|lnk)$/i, "");
}
