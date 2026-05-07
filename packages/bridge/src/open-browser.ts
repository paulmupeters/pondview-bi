export type BrowserOpener = (url: string) => Promise<void>;

export const openBrowser: BrowserOpener = async (url) => {
  const command = openCommand(url);
  if (!command) {
    return;
  }

  Bun.spawn(command, {
    stdout: "ignore",
    stderr: "ignore",
  });
};

function openCommand(url: string): string[] | null {
  if (process.platform === "darwin") {
    return ["open", url];
  }

  if (process.platform === "win32") {
    return ["cmd", "/c", "start", "", url];
  }

  if (process.platform === "linux") {
    return ["xdg-open", url];
  }

  return null;
}
