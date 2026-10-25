import { TemplateView } from "./template-body";

import { StandardContentWrapper } from "~/shared/main";
import { type Tab } from "~/store/zustand/tabs";
import { TabType } from "~/store/zustand/tabs/enums";

export { BUNDLED_WEB_TEMPLATES } from "./bundled";
export type { WebTemplate } from "./codec";
export {
  useCreateTemplate,
  useUserTemplate,
  useUserTemplates,
} from "./queries";
export type { UserTemplate, UserTemplateDraft } from "./queries";
export { DEFAULT_TEMPLATE_ICON, TemplateIconGlyph } from "./template-icon";
export type { TemplateIcon } from "./template-icon";
export { useOpenTemplatesTab } from "./use-open-templates-tab";
export { filterWebTemplatesAgainstUserTemplates } from "./utils";
export { TemplatesSidebarContent } from "./template-sidebar";

export function TabContentTemplate({
  tab,
}: {
  tab: Extract<Tab, { type: TabType.Templates }>;
}) {
  return (
    <StandardContentWrapper>
      <TemplateView tab={tab} />
    </StandardContentWrapper>
  );
}
