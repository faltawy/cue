import { CodexClient, prepareCodexHome, record } from "./codex-client";
import { DEFAULT_CODEX_HOME } from "./codex-session";

export async function codexAccount(
  executable: string,
  home = DEFAULT_CODEX_HOME,
): Promise<{ signedIn: boolean; email: string | null }> {
  await prepareCodexHome(home);
  const client = new CodexClient({ executable, home });
  try {
    await client.initialize();
    const result = await client.request("account/read", {
      refreshToken: false,
    });
    const account = record(result.account);
    return {
      signedIn: typeof account.type === "string",
      email: typeof account.email === "string" ? account.email : null,
    };
  } finally {
    client.close();
  }
}

export async function signInCodex(
  executable: string,
  home = DEFAULT_CODEX_HOME,
) {
  await prepareCodexHome(home);
  let loginId: string | undefined;
  let completed!: () => void;
  let failed!: (error: Error) => void;
  const login = new Promise<void>((resolve, reject) => {
    completed = resolve;
    failed = reject;
  });
  // The notification can arrive before the login/start response.
  const outcomes = new Map<string, Record<string, unknown>>();
  const settle = (params: Record<string, unknown>) => {
    if (params.success === true) completed();
    else
      failed(new Error(String(params.error ?? "Codex sign-in was cancelled.")));
  };
  const client = new CodexClient({
    executable,
    home,
    onFailure: failed,
    onNotification(method, params) {
      if (method !== "account/login/completed") return;
      const id = String(params.loginId ?? "");
      if (id === loginId) settle(params);
      else outcomes.set(id, params);
    },
  });
  const timer = setTimeout(
    () => failed(new Error("Codex sign-in timed out. Please try again.")),
    10 * 60_000,
  );
  void login.catch(() => {});
  try {
    await client.initialize();
    const result = await client.request("account/login/start", {
      type: "chatgpt",
    });
    loginId = String(result.loginId ?? "");
    const url = new URL(String(result.authUrl ?? ""));
    if (url.protocol !== "https:")
      throw new Error("Codex returned an invalid sign-in address.");
    const opener = Bun.spawn(["/usr/bin/open", url.href], {
      stdout: "ignore",
      stderr: "pipe",
    });
    if ((await opener.exited) !== 0)
      throw new Error("Could not open the Codex sign-in page.");
    const early = outcomes.get(loginId);
    if (early) settle(early);
    await login;
  } finally {
    clearTimeout(timer);
    client.close();
  }
}
