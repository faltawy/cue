import bundledWebTemplates from "./bundled-web-templates.json";
import { parseWebTemplates, type WebTemplate } from "./codec";

export const BUNDLED_WEB_TEMPLATES: WebTemplate[] =
  parseWebTemplates(bundledWebTemplates);
