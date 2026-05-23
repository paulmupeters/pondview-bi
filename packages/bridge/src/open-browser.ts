import { spawn } from "node:child_process";

export type BrowserOpener = (url: string) => Promise<void>;

export const openBrowser: BrowserOpener = async (url) => {
  const command = openCommand(url);
  if (!command) {
    return;
  }

  const child = spawn(command[0] ?? "", command.slice(1), {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
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
