import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "../../styles/globals.css";

import { StrictMode } from "react";
import ReactDOM from "react-dom/client";

import { Gallery } from "./gallery";

// Dev-only component gallery, served at /dev/gallery by the Vite dev server
// (see `devGallery` in vite.config.ts). It is not part of the app bundle.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <Gallery />
  </StrictMode>,
);
