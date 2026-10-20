import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { CoachView } from "../../src/ui/app";
import { fixtureState, isScenario } from "../../src/ui/fixtures";
import type { CoachApi } from "../../src/ui/use-coach";
import { type DataSet, dataSetState, isDataSet } from "./worst-case";

const params = new URLSearchParams(location.search);
const name = params.get("state") ?? "idle";
const connection = params.get("connection");
const data = params.get("data");
const phase = params.get("phase") === "ended" ? "ended" : "live";

if (params.get("dir") === "rtl") document.documentElement.dir = "rtl";
const zoom = Number(params.get("zoom"));
if (zoom > 0) document.documentElement.style.setProperty("zoom", String(zoom));

const state = isDataSet(data)
  ? dataSetState(data, phase)
  : fixtureState(
      isScenario(name) ? name : "idle",
      connection === "lost" || connection === "connecting" ? connection : "open",
    );

const ok = async () => ({ ok: true as const });
const api: CoachApi = {
  ask: ok,
  checkItem: ok,
  addItemToNote: ok,
  open: ok,
  stop: ok,
  checkIn: ok,
  newChat: ok,
  answer: ok,
  dismiss: ok,
  undo: ok,
  chooseSeriesFolder: ok,
  useDefaultFolder: ok,
  addActionItems: ok,
  logToClients: ok,
  signIn: ok,
  chooseProjectFolder: ok,
  retrySetup: ok,
  notify: (message) => console.info("notice", message),
};

const SEGMENTS: Array<{ id: DataSet | "demo"; label: string }> = [
  { id: "demo", label: "Demo data" },
  { id: "worst", label: "Worst case" },
  { id: "empty", label: "Empty" },
  { id: "one", label: "One" },
  { id: "huge", label: "Huge" },
  { id: "rich", label: "Rich blocks" },
  { id: "coaching", label: "Coaching" },
];

function select(id: DataSet | "demo") {
  const next = new URLSearchParams(location.search);
  if (id === "demo") next.delete("data");
  else next.set("data", id);
  location.search = next.toString();
}

function DataToggle() {
  const current = isDataSet(data) ? data : "demo";
  return (
    <div
      style={{
        position: "fixed",
        bottom: 8,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        display: "flex",
        gap: 2,
        padding: 2,
        borderRadius: 8,
        background: "#d4d4d4",
        font: "11px -apple-system, system-ui, sans-serif",
        direction: "ltr",
      }}
    >
      {SEGMENTS.map((segment) => (
        <button
          key={segment.id}
          type="button"
          onClick={() => select(segment.id)}
          style={{
            border: 0,
            borderRadius: 6,
            padding: "3px 8px",
            background: segment.id === current ? "#fff" : "transparent",
            color: "#111",
            cursor: "pointer",
          }}
        >
          {segment.label}
        </button>
      ))}
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <CoachView state={state} api={api} />
      {params.get("chrome") !== "0" && <DataToggle />}
    </StrictMode>,
  );
}
