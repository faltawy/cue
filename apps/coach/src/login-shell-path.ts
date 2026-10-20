import { type ChildProcess, spawn } from "node:child_process";
import os from "node:os";

const START = "__CUE_LOGIN_PATH_START__";
const END = "__CUE_LOGIN_PATH_END__";
const TIMEOUT_MS = 5000;

/**
 * The PATH the person's interactive login shell has: where Homebrew and
 * other installers add theirs. An app started from the Dock inherits only
 * launchd's PATH. `printenv` prints the exported value whatever the shell,
 * between markers on lines of their own, so whatever a profile prints
 * around them is ignored. The shell runs in a session of its own with no
 * terminal and no input, and the whole process group is killed once the
 * answer is in or the timeout passes.
 */
export function readLoginShellPath(options: { shell?: string; timeoutMs?: number } = {}): Promise<string | undefined> {
  const shell = options.shell || process.env.SHELL || safeUserShell() || "/bin/zsh";
  return new Promise((resolve) => {
    let output = "";
    let child: ChildProcess | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const finish = (value: string | undefined) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child?.pid && child.exitCode === null && child.signalCode === null) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          // Already gone.
        }
      }
      resolve(value);
    };
    const answer = () => {
      const lines = output.split(/\r?\n/);
      const start = lines.lastIndexOf(START);
      if (start === -1 || lines[start + 2] !== END) return undefined;
      return lines[start + 1]?.trim() || undefined;
    };
    try {
      child = spawn(shell, ["-ilc", `printf '\\n${START}\\n'; printenv PATH; printf '${END}\\n'`], {
        stdio: ["ignore", "pipe", "ignore"],
        detached: true,
      });
    } catch {
      finish(undefined);
      return;
    }
    timer = setTimeout(() => finish(undefined), options.timeoutMs ?? TIMEOUT_MS);
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      output += chunk;
      if (output.includes(END)) {
        const value = answer();
        if (value !== undefined) finish(value);
      }
    });
    child.on("error", () => finish(undefined));
    child.on("exit", () => {
      setTimeout(() => finish(answer()), 50);
    });
  });
}

function safeUserShell(): string | undefined {
  try {
    return os.userInfo().shell ?? undefined;
  } catch {
    return undefined;
  }
}

let loginPath: Promise<string | undefined> | undefined;

/** The login shell's PATH, read once per process. */
export function loginShellPath(): Promise<string | undefined> {
  loginPath ??= readLoginShellPath();
  return loginPath;
}
