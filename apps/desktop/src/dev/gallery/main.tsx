import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "../../styles/globals.css";

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";

import { Gallery } from "./gallery";

// Source strings only: the gallery shows shared components, not copy.
i18n.load("en", {});
i18n.activate("en");

// Dev-only component gallery, served at /dev/gallery by the Vite dev server
// (see `devGallery` in vite.config.ts). It is not part of the app bundle.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <I18nProvider i18n={i18n}>
      <Gallery />
    </I18nProvider>
  </StrictMode>,
);
