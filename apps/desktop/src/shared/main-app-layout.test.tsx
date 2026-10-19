import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Outlet: () => <div data-testid="outlet" />,
  useNavigate: () => vi.fn(),
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({}),
}));

vi.mock("@anlg/plugin-windows", () => ({
  events: {},
}));

vi.mock("./useNewNote", () => ({
  openNewNoteAndListen: vi.fn(),
  openSessionAndListen: vi.fn(),
  useNewNote: () => vi.fn(),
}));

vi.mock("~/stt/unsupported-local-stt-repair", () => ({
  UnsupportedLocalSttRepair: () => <div data-testid="stt-repair" />,
}));

vi.mock("~/session/queries", () => ({
  getOrCreateSessionForEventId: vi.fn(),
}));

vi.mock("@anlg/ui/hooks/use-mount-effect", () => ({
  useMountEffect: vi.fn(),
}));

vi.mock("~/sidebar/toast/undo-delete-toast", () => ({
  UndoDeleteToast: () => null,
}));

vi.mock("~/store/zustand/tabs", () => ({
  isTabInputSupported: vi.fn(),
  useTabs: () => vi.fn(),
}));

import MainAppLayout from "./main-app-layout";

describe("MainAppLayout", () => {
  afterEach(cleanup);

  it("mounts the routed content and the STT repair", () => {
    render(<MainAppLayout />);

    expect(screen.getByTestId("outlet")).toBeTruthy();
    expect(screen.getByTestId("stt-repair")).toBeTruthy();
  });
});
