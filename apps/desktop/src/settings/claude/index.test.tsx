import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { ClaudeConnector, McpServer } from "@anlg/plugin-coach";

const coach = vi.hoisted(() => ({
  settings: {
    project: "/work/northwind" as string | null,
    model: "sonnet" as "sonnet" | "opus" | "haiku",
    nudges: true,
    nudge_limit_cents: 50,
    mcp_servers: [] as McpServer[],
    claude_connectors: [] as ClaudeConnector[],
    instructions: "",
    knowledge: [] as string[],
    web_access: true,
  },
  getSettings: vi.fn(),
  setSettings: vi.fn(),
  chooseProject: vi.fn(),
  probeMcpServer: vi.fn(),
  setMcpSecret: vi.fn(),
  mcpStatuses: vi.fn(),
  findClaudeConnectors: vi.fn(),
  addKnowledge: vi.fn(),
  claudeSignedIn: vi.fn(),
  signInToClaude: vi.fn(),
  claudeCodeStatus: vi.fn(),
  updateClaudeCode: vi.fn(),
  claudeSetup: vi.fn(),
  retryClaudeSetup: vi.fn(),
}));

vi.mock("@anlg/plugin-coach", () => ({
  commands: {
    getSettings: coach.getSettings,
    setSettings: coach.setSettings,
    chooseProject: coach.chooseProject,
    probeMcpServer: coach.probeMcpServer,
    setMcpSecret: coach.setMcpSecret,
    mcpStatuses: coach.mcpStatuses,
    findClaudeConnectors: coach.findClaudeConnectors,
    addKnowledge: coach.addKnowledge,
    claudeSignedIn: coach.claudeSignedIn,
    signInToClaude: coach.signInToClaude,
    claudeCodeStatus: coach.claudeCodeStatus,
    updateClaudeCode: coach.updateClaudeCode,
    claudeSetup: coach.claudeSetup,
    retryClaudeSetup: coach.retryClaudeSetup,
  },
}));

vi.mock("~/settings/queries", () => ({ useSettingsReady: () => true }));
vi.mock("~/shared/config", () => ({
  useConfigValues: () => ({ intelligence_disabled: false }),
}));

import { SettingsClaude } from ".";

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SettingsClaude />
    </QueryClientProvider>,
  );
}

function pick(comboboxName: string, optionName: string) {
  const trigger = screen.getByRole("combobox", { name: comboboxName });
  fireEvent.pointerDown(trigger, {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });
  fireEvent.click(screen.getByRole("option", { name: optionName }));
}

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  coach.settings = {
    project: "/work/northwind",
    model: "sonnet",
    nudges: true,
    nudge_limit_cents: 50,
    mcp_servers: [],
    claude_connectors: [],
    instructions: "",
    knowledge: [],
    web_access: true,
  };
  coach.findClaudeConnectors.mockResolvedValue({ status: "ok", data: [] });
  coach.claudeSignedIn.mockResolvedValue({ status: "ok", data: true });
  coach.signInToClaude.mockResolvedValue({ status: "ok", data: null });
  coach.claudeSetup.mockResolvedValue({
    status: "ok",
    data: { state: "ready" },
  });
  coach.claudeCodeStatus.mockResolvedValue({
    status: "ok",
    data: { using: "cue", installed: null, min_version: "2.1.302" },
  });
  coach.getSettings.mockImplementation(async () => ({
    status: "ok",
    data: { ...coach.settings },
  }));
  coach.setSettings.mockImplementation(async (next) => {
    coach.settings = next;
    return { status: "ok", data: null };
  });
  coach.chooseProject.mockImplementation(async () => {
    coach.settings = { ...coach.settings, project: "/work/widget" };
    return { status: "ok", data: "/work/widget" };
  });
  coach.setMcpSecret.mockResolvedValue({ status: "ok", data: null });
  coach.mcpStatuses.mockImplementation(async () => ({
    status: "ok",
    data: coach.settings.mcp_servers.map((server) => ({
      name: server.name,
      state: "ready",
    })),
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SettingsClaude", () => {
  it("says when Claude isn't signed in, starts the sign-in, and picks up the new sign-in", async () => {
    coach.claudeSignedIn.mockResolvedValue({ status: "ok", data: false });
    renderPage();

    expect(await screen.findByText("Not signed in")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(coach.signInToClaude).toHaveBeenCalledTimes(1));

    coach.claudeSignedIn.mockResolvedValue({ status: "ok", data: true });
    expect(
      await screen.findByText("Signed in", {}, { timeout: 5000 }),
    ).not.toBeNull();
  });

  it("while Claude downloads, the sign-in row shows the progress instead of checking, then the sign-in", async () => {
    coach.claudeSetup.mockResolvedValue({
      status: "ok",
      data: { state: "preparing", percent: 45 },
    });
    renderPage();

    expect(await screen.findByText("Setting up Claude… 45%")).not.toBeNull();
    expect(screen.queryByText("Checking…")).toBeNull();
    expect(coach.claudeSignedIn).not.toHaveBeenCalled();

    coach.claudeSetup.mockResolvedValue({
      status: "ok",
      data: { state: "ready" },
    });
    expect(
      await screen.findByText("Signed in", {}, { timeout: 5000 }),
    ).not.toBeNull();
    expect(coach.claudeSignedIn).toHaveBeenCalled();
  });

  it("a failed Claude download says why and Retry starts it again", async () => {
    coach.claudeSetup.mockResolvedValue({
      status: "ok",
      data: {
        state: "failed",
        message: "The coach needs a one-time download of Claude Code. Offline.",
      },
    });
    coach.retryClaudeSetup.mockResolvedValue({
      status: "ok",
      data: { state: "preparing", percent: null },
    });
    renderPage();

    expect(
      await screen.findByText(
        "The coach needs a one-time download of Claude Code. Offline.",
      ),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(coach.retryClaudeSetup).toHaveBeenCalledTimes(1),
    );
    expect(await screen.findByText("Setting up Claude…")).not.toBeNull();
    expect(coach.claudeSignedIn).not.toHaveBeenCalled();
  });

  it("says the coach uses your own Claude Code when it is new enough, with nothing to update", async () => {
    const installed = {
      executable_path: "/Users/me/.local/share/claude/versions/2.1.310",
      command_path: "/Users/me/.local/bin/claude",
      version: "2.1.310",
    };
    coach.claudeCodeStatus.mockResolvedValue({
      status: "ok",
      data: { using: "installed", installed, min_version: "2.1.302" },
    });
    renderPage();

    expect(
      await screen.findByText("Uses your Claude Code 2.1.310."),
    ).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: "Update Claude Code" }),
    ).toBeNull();
  });

  it("without an install, the coach uses Cue's copy and offers no update", async () => {
    renderPage();

    expect(
      await screen.findByText(
        /Uses Cue's copy of Claude Code 2\.1\.302\. Install Claude Code/,
      ),
    ).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: "Update Claude Code" }),
    ).toBeNull();
  });

  it("an install older than the coach needs is updated only when Update is pressed", async () => {
    const installed = {
      executable_path: "/Users/me/.local/share/claude/versions/2.1.250",
      command_path: "/Users/me/.local/bin/claude",
      version: "2.1.250",
    };
    coach.claudeCodeStatus.mockResolvedValue({
      status: "ok",
      data: { using: "cue", installed, min_version: "2.1.302" },
    });
    coach.updateClaudeCode.mockResolvedValue({
      status: "ok",
      data: {
        output: "Successfully updated from 2.1.250 to version 2.1.320",
        status: {
          using: "installed",
          installed: { ...installed, version: "2.1.320" },
          min_version: "2.1.302",
        },
      },
    });
    renderPage();

    expect(
      await screen.findByText(
        /Your Claude Code 2\.1\.250 is older than 2\.1\.302; update it to use yours\./,
      ),
    ).not.toBeNull();
    expect(coach.updateClaudeCode).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Update Claude Code" }));

    expect(
      await screen.findByText("Uses your Claude Code 2.1.320."),
    ).not.toBeNull();
    expect(coach.updateClaudeCode).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", { name: "Update Claude Code" }),
    ).toBeNull();
  });

  it("an update that lands below the minimum says so", async () => {
    const installed = {
      executable_path: "/Users/me/.local/share/claude/versions/2.1.250",
      command_path: "/Users/me/.local/bin/claude",
      version: "2.1.250",
    };
    coach.claudeCodeStatus.mockResolvedValue({
      status: "ok",
      data: { using: "cue", installed, min_version: "2.1.302" },
    });
    coach.updateClaudeCode.mockResolvedValue({
      status: "ok",
      data: {
        output: "Successfully updated from 2.1.250 to version 2.1.290",
        status: {
          using: "cue",
          installed: { ...installed, version: "2.1.290" },
          min_version: "2.1.302",
        },
      },
    });
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Update Claude Code" }),
    );
    expect(
      await screen.findByText(
        "Claude Code updated to 2.1.290, which is still older than 2.1.302.",
      ),
    ).not.toBeNull();
  });

  it("shows the saved model, project, nudges switch and spend limit", async () => {
    coach.settings = { ...coach.settings, nudge_limit_cents: 125 };
    renderPage();

    expect(
      (await screen.findByRole("combobox", { name: "Model" })).textContent,
    ).toBe("Sonnet");
    expect(screen.getByText("/work/northwind")).not.toBeNull();
    expect(
      screen
        .getByRole("switch", { name: "Nudges" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen.getByRole<HTMLInputElement>("textbox", {
        name: "Spend limit per meeting",
      }).value,
    ).toBe("1.25");
  });

  it("saves a new model without touching the project or nudges", async () => {
    renderPage();
    await screen.findByRole("combobox", { name: "Model" });

    pick("Model", "Opus");

    await waitFor(() =>
      expect(coach.setSettings).toHaveBeenCalledWith({
        project: "/work/northwind",
        model: "opus",
        nudges: true,
        nudge_limit_cents: 50,
        mcp_servers: [],
        claude_connectors: [],
        instructions: "",
        knowledge: [],
        web_access: true,
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Model" }).textContent).toBe(
        "Opus",
      ),
    );
  });

  it("turns nudges off, which also locks the spend limit", async () => {
    renderPage();
    const nudges = await screen.findByRole("switch", { name: "Nudges" });
    const limit = screen.getByRole<HTMLInputElement>("textbox", {
      name: "Spend limit per meeting",
    });
    expect(limit.disabled).toBe(false);

    fireEvent.click(nudges);

    await waitFor(() =>
      expect(coach.setSettings).toHaveBeenCalledWith({
        project: "/work/northwind",
        model: "sonnet",
        nudges: false,
        nudge_limit_cents: 50,
        mcp_servers: [],
        claude_connectors: [],
        instructions: "",
        knowledge: [],
        web_access: true,
      }),
    );
    await waitFor(() => expect(limit.disabled).toBe(true));
  });

  it("saves a spend limit typed in dollars as cents, and refuses one it can't read", async () => {
    renderPage();
    const limit = await screen.findByRole<HTMLInputElement>("textbox", {
      name: "Spend limit per meeting",
    });

    fireEvent.change(limit, { target: { value: "abc" } });
    fireEvent.blur(limit);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Enter an amount from $0.01 to $100.",
    );
    expect(coach.setSettings).not.toHaveBeenCalled();

    fireEvent.change(limit, { target: { value: "$1.5" } });
    fireEvent.blur(limit);

    await waitFor(() =>
      expect(coach.setSettings).toHaveBeenCalledWith(
        expect.objectContaining({ nudges: true, nudge_limit_cents: 150 }),
      ),
    );
    await waitFor(() => expect(limit.value).toBe("1.50"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("turns web access off and keeps everything else", async () => {
    renderPage();
    const web = await screen.findByRole("switch", { name: "Web access" });
    expect(web.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(web);

    await waitFor(() =>
      expect(coach.setSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          web_access: false,
          model: "sonnet",
          nudges: true,
        }),
      ),
    );
  });

  it("changes the coach project through the folder picker and shows the new path", async () => {
    renderPage();
    await screen.findByText("/work/northwind");

    fireEvent.click(screen.getByRole("button", { name: "Coach project" }));

    expect(await screen.findByText("/work/widget")).not.toBeNull();
    expect(coach.chooseProject).toHaveBeenCalledOnce();
    expect(screen.queryByText("/work/northwind")).toBeNull();
  });

  it("shows why saving failed and keeps the previous choice", async () => {
    coach.setSettings.mockResolvedValueOnce({
      status: "error",
      error: "/gone is not a folder",
    });
    renderPage();
    await screen.findByRole("combobox", { name: "Model" });

    pick("Model", "Haiku");

    expect((await screen.findByRole("alert")).textContent).toBe(
      "/gone is not a folder",
    );
    expect(screen.getByRole("combobox", { name: "Model" }).textContent).toBe(
      "Sonnet",
    );
  });
});

describe("SettingsClaude tools", () => {
  const clients: McpServer = {
    name: "clients",
    url: "http://127.0.0.1:7777/mcp",
    auth: { kind: "bearer" },
    allow_changes: false,
    enabled: true,
  };

  function fill(label: string, value: string) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }

  async function check(url: string, probe: unknown) {
    coach.probeMcpServer.mockResolvedValueOnce({ status: "ok", data: probe });
    renderPage();
    await screen.findByRole("combobox", { name: "Model" });
    fill("Tool address", url);
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    await waitFor(() => expect(coach.probeMcpServer).toHaveBeenCalledWith(url));
  }

  it("adds a server that needs no sign-in under the name it reports", async () => {
    await check("http://127.0.0.1:7777/mcp", {
      kind: "none",
      server_name: "clients",
      server_version: "1.0.0",
    });

    expect(await screen.findByText(/Found clients/)).not.toBeNull();
    expect(screen.queryByLabelText("Access token")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add server" }));

    await waitFor(() =>
      expect(coach.setSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          mcp_servers: [{ ...clients, auth: { kind: "none" } }],
        }),
      ),
    );
    expect(coach.setMcpSecret).not.toHaveBeenCalled();
  });

  it("asks for a token when the server wants one and keeps it out of the settings file", async () => {
    await check("http://127.0.0.1:7777/mcp", {
      kind: "bearer",
      browser_sign_in: false,
    });

    fill("Tool name", "clients");
    fill("Access token", "secret-token");
    fireEvent.click(screen.getByRole("button", { name: "Add server" }));

    await waitFor(() =>
      expect(coach.setMcpSecret).toHaveBeenCalledWith("clients", {
        kind: "token",
        token: "secret-token",
      }),
    );
    expect(coach.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ mcp_servers: [clients] }),
    );
    expect(JSON.stringify(coach.setSettings.mock.calls)).not.toContain(
      "secret-token",
    );
    expect(await screen.findByText("clients")).not.toBeNull();
    expect(document.body.textContent).not.toContain("secret-token");
  });

  it("asks for a token, with a hint, when the server normally signs in through a browser", async () => {
    await check("https://mcp.linear.app/mcp", {
      kind: "bearer",
      browser_sign_in: true,
    });

    expect(
      await screen.findByText(/usually signs in through a browser/),
    ).not.toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>("Tool name").value).toBe(
      "linear",
    );
    fill("Access token", "lin_api_x");
    fireEvent.click(screen.getByRole("button", { name: "Add server" }));

    await waitFor(() =>
      expect(coach.setMcpSecret).toHaveBeenCalledWith("linear", {
        kind: "token",
        token: "lin_api_x",
      }),
    );
    expect(coach.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        mcp_servers: [
          {
            name: "linear",
            url: "https://mcp.linear.app/mcp",
            auth: { kind: "bearer" },
            allow_changes: false,
            enabled: true,
          },
        ],
      }),
    );
  });

  it("stores a user name in settings and the password as a secret for basic auth", async () => {
    await check("http://127.0.0.1:9000/mcp", { kind: "basic" });

    fill("Tool name", "wiki");
    fill("User name", "falta");
    fill("Password", "pw");
    fireEvent.click(screen.getByRole("button", { name: "Add server" }));

    await waitFor(() =>
      expect(coach.setMcpSecret).toHaveBeenCalledWith("wiki", {
        kind: "basic",
        password: "pw",
      }),
    );
    expect(coach.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        mcp_servers: [
          expect.objectContaining({
            auth: { kind: "basic", username: "falta" },
          }),
        ],
      }),
    );
  });

  it("can send the secret in a custom header instead", async () => {
    await check("http://127.0.0.1:9000/mcp", {
      kind: "bearer",
      browser_sign_in: false,
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Use a custom header instead" }),
    );
    fill("Tool name", "keyed");
    fill("Header name", "X-API-Key");
    fill("Header value", "k1");
    fireEvent.click(screen.getByRole("button", { name: "Add server" }));

    await waitFor(() =>
      expect(coach.setMcpSecret).toHaveBeenCalledWith("keyed", {
        kind: "header",
        value: "k1",
      }),
    );
    expect(coach.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        mcp_servers: [
          expect.objectContaining({
            auth: { kind: "header", name: "X-API-Key" },
          }),
        ],
      }),
    );
  });

  it.each([
    [
      { kind: "unreachable", reason: "nothing is listening" },
      "nothing is listening",
    ],
    [
      { kind: "not_mcp", status: 404, message: "check the path" },
      "check the path",
    ],
  ])("explains %o and offers nothing to add", async (probe, message) => {
    await check("http://127.0.0.1:1/mcp", probe);

    expect((await screen.findByRole("alert")).textContent).toContain(message);
    expect(screen.queryByRole("button", { name: "Add server" })).toBeNull();
    expect(screen.getByRole("button", { name: "Check" })).not.toBeNull();
  });

  it("refuses an address that isn't http before checking it", async () => {
    renderPage();
    await screen.findByRole("combobox", { name: "Model" });

    fill("Tool address", "ftp://example.com");
    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "http or https",
    );
    expect(coach.probeMcpServer).not.toHaveBeenCalled();
  });

  it.each([
    ["Clients", "Use lowercase letters"],
    ["meeting", "reserved"],
    ["clients", "already exists"],
  ])("refuses the name %s without saving", async (name, message) => {
    coach.settings = { ...coach.settings, mcp_servers: [clients] };
    await check("http://127.0.0.1:8888/mcp", {
      kind: "none",
      server_name: null,
      server_version: null,
    });

    fill("Tool name", name);
    fireEvent.click(screen.getByRole("button", { name: "Add server" }));

    expect((await screen.findByRole("alert")).textContent).toContain(message);
    expect(coach.setSettings).not.toHaveBeenCalled();
  });

  it("shows which servers still need a secret and saves a new one from the row", async () => {
    coach.settings = { ...coach.settings, mcp_servers: [clients] };
    coach.mcpStatuses.mockResolvedValue({
      status: "ok",
      data: [{ name: "clients", state: "needs_secret" }],
    });
    renderPage();

    expect(await screen.findByText("Needs a secret")).not.toBeNull();
    expect(screen.getByText(/· Token/)).not.toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Change the secret for clients" }),
    );
    fill("New secret for clients", "rotated");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(coach.setMcpSecret).toHaveBeenCalledWith("clients", {
        kind: "token",
        token: "rotated",
      }),
    );
    expect(coach.setSettings).not.toHaveBeenCalled();
  });

  it("toggles allow-changes and on/off for one server, keeping the others", async () => {
    const docs: McpServer = {
      ...clients,
      name: "docs",
      auth: { kind: "none" },
    };
    coach.settings = { ...coach.settings, mcp_servers: [clients, docs] };
    renderPage();
    await screen.findByText("docs");

    fireEvent.click(
      screen.getByRole("switch", { name: "Allow clients to make changes" }),
    );
    await waitFor(() =>
      expect(coach.setSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({
          mcp_servers: [{ ...clients, allow_changes: true }, docs],
        }),
      ),
    );

    await waitFor(() =>
      expect(
        screen.getByRole<HTMLButtonElement>("switch", { name: "Use docs" })
          .disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("switch", { name: "Use docs" }));
    await waitFor(() =>
      expect(coach.setSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({
          mcp_servers: [
            { ...clients, allow_changes: true },
            { ...docs, enabled: false },
          ],
        }),
      ),
    );
  });

  it("removes a server", async () => {
    coach.settings = { ...coach.settings, mcp_servers: [clients] };
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Remove clients" }),
    );

    await waitFor(() =>
      expect(coach.setSettings).toHaveBeenCalledWith(
        expect.objectContaining({ mcp_servers: [] }),
      ),
    );
    await waitFor(() => expect(screen.queryByText("clients")).toBeNull());
  });
});

describe("Claude connectors", () => {
  const gmail = {
    name: "Gmail",
    id: "mcpsrv_01gmail",
    url: "https://gmailmcp.googleapis.com/mcp/v1",
  };
  const calendar = {
    name: "Google Calendar",
    id: "mcpsrv_01calendar",
    url: "https://calendarmcp.googleapis.com/mcp/v1",
  };

  const toggle = (name: string) =>
    screen.getByRole<HTMLButtonElement>("switch", { name });

  it("lists the account's connectors switched off and turns on only the one chosen, read-only", async () => {
    coach.findClaudeConnectors.mockResolvedValue({
      status: "ok",
      data: [gmail, calendar],
    });
    renderPage();
    await screen.findByText("Google Calendar");

    expect(toggle("Use Gmail").getAttribute("aria-checked")).toBe("false");
    expect(toggle("Use Google Calendar").getAttribute("aria-checked")).toBe(
      "false",
    );
    expect(toggle("Allow Gmail to make changes").disabled).toBe(true);

    fireEvent.click(toggle("Use Gmail"));

    await waitFor(() =>
      expect(coach.setSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({
          claude_connectors: [{ ...gmail, allow_changes: false }],
        }),
      ),
    );
    await waitFor(() =>
      expect(toggle("Allow Gmail to make changes").disabled).toBe(false),
    );
    fireEvent.click(toggle("Allow Gmail to make changes"));
    await waitFor(() =>
      expect(coach.setSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({
          claude_connectors: [{ ...gmail, allow_changes: true }],
        }),
      ),
    );
  });

  it("keeps a connector that is on but no longer found, so it can be turned off", async () => {
    coach.settings = {
      ...coach.settings,
      claude_connectors: [{ ...gmail, allow_changes: false }],
    };
    coach.findClaudeConnectors.mockResolvedValue({
      status: "ok",
      data: [calendar],
    });
    renderPage();
    await screen.findByText("Google Calendar");

    expect(toggle("Use Gmail").getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle("Use Gmail"));

    await waitFor(() =>
      expect(coach.setSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ claude_connectors: [] }),
      ),
    );
  });
});

describe("Coach instructions and knowledge", () => {
  it("autosaves the instructions verbatim and warns past the soft limit", async () => {
    renderPage();
    const box = await screen.findByRole("textbox", {
      name: "Coach instructions",
    });
    const text = "I'm the CTO of Northwind.\n\n- prefer short answers";

    fireEvent.change(box, { target: { value: text } });

    await waitFor(
      () =>
        expect(coach.setSettings).toHaveBeenLastCalledWith(
          expect.objectContaining({ instructions: text, model: "sonnet" }),
        ),
      { timeout: 3000 },
    );
    expect(screen.getByText(`${text.length} / 4,000`)).not.toBeNull();
    expect(screen.queryByText(/use more of your Claude plan/)).toBeNull();

    fireEvent.change(box, { target: { value: "x".repeat(4001) } });
    expect(
      screen.getByText(/use more of your Claude plan/).className,
    ).toContain("text-destructive");
  });

  it("adds a folder through the picker and removes a knowledge entry", async () => {
    coach.addKnowledge.mockImplementation(async () => {
      coach.settings = { ...coach.settings, knowledge: ["/work/kb"] };
      return { status: "ok", data: "/work/kb" };
    });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Add folder…" }));

    expect(await screen.findByText("/work/kb")).not.toBeNull();
    expect(coach.addKnowledge).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "Remove /work/kb" }));
    await waitFor(() =>
      expect(coach.setSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ knowledge: [] }),
      ),
    );
  });
});
