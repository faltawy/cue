import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { CoachView } from "@anlg/assistant/ui/app";
import { Connection } from "@anlg/assistant/ui/state";
import { type CoachApi } from "@anlg/assistant/ui/use-coach";

import { fixtureState, isScenario } from "../../src/ui/fixtures";
import { DataSet, dataSetState, isDataSet, Phase } from "./worst-case";

enum PreviewTab {
  Demo = "demo",
}

const params = new URLSearchParams(location.search);
const name = params.get("state") ?? "idle";
const connection = params.get("connection");
const data = params.get("data");
const phase = params.get("phase") === Phase.Ended ? Phase.Ended : Phase.Live;

if (params.get("dir") === "rtl") document.documentElement.dir = "rtl";
const zoom = Number(params.get("zoom"));
if (zoom > 0) document.documentElement.style.setProperty("zoom", String(zoom));

const state = isDataSet(data)
  ? dataSetState(data, phase)
  : fixtureState(
      isScenario(name) ? name : "idle",
      connection === Connection.Lost
        ? Connection.Lost
        : connection === Connection.Connecting
          ? Connection.Connecting
          : Connection.Open,
    );

const ok = async () => ({ ok: true as const });
const api: CoachApi = {
  ask: ok,
  checkItem: ok,
  addItemToNote: ok,
  open: ok,
  openEvidence: ok,
  feedback: ok,
  resetFeedback: ok,
  setCoaching: ok,
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

const SEGMENTS: Array<{ id: DataSet | PreviewTab; label: string }> = [
  { id: PreviewTab.Demo, label: "Demo data" },
  { id: DataSet.Worst, label: "Worst case" },
  { id: DataSet.Empty, label: "Empty" },
  { id: DataSet.One, label: "One" },
  { id: DataSet.Huge, label: "Huge" },
  { id: DataSet.Rich, label: "Rich blocks" },
  { id: DataSet.Coaching, label: "Coaching" },
];

function select(id: DataSet | PreviewTab) {
  const next = new URLSearchParams(location.search);
  if (id === PreviewTab.Demo) next.delete("data");
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
