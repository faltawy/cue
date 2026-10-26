import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@anlg/assistant/ui/app";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
