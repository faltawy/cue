import { useCallback, useMemo } from "react";

import { BUNDLED_WEB_TEMPLATES } from "./bundled";
import { type WebTemplate } from "./codec";
import {
  useCreateTemplate,
  useDeleteTemplate,
  useToggleTemplateFavorite,
  useUserTemplates,
  type UserTemplate,
} from "./queries";

import { type Tab, useTabs } from "~/store/zustand/tabs";
import { TabType } from "~/store/zustand/tabs/enums";
import { TemplateTimestampFormat } from "~/templates/enums";

export const AUTO_TEMPLATE_ID = "__auto__";

export function resolveTemplateTabSelection({
  isWebMode,
  selectedMineId,
  selectedWebIndex,
  userTemplates,
  webTemplates,
}: {
  isWebMode: boolean | null | undefined;
  selectedMineId: string | null | undefined;
  selectedWebIndex: number | null | undefined;
  userTemplates: UserTemplate[];
  webTemplates: WebTemplate[];
}) {
  const hasUserTemplates = userTemplates.length > 0;
  const hasWebTemplates = webTemplates.length > 0;

  let effectiveIsWebMode = isWebMode ?? (hasWebTemplates && !hasUserTemplates);

  if (effectiveIsWebMode && !hasWebTemplates) {
    effectiveIsWebMode = false;
  }

  if (!effectiveIsWebMode && !hasUserTemplates && hasWebTemplates) {
    effectiveIsWebMode = true;
  }

  if (effectiveIsWebMode) {
    const effectiveSelectedWebIndex =
      selectedWebIndex !== null &&
      selectedWebIndex !== undefined &&
      selectedWebIndex >= 0 &&
      selectedWebIndex < webTemplates.length
        ? selectedWebIndex
        : hasWebTemplates
          ? 0
          : null;

    return {
      isWebMode: true,
      selectedMineId: null,
      selectedWebIndex: effectiveSelectedWebIndex,
      selectedWebTemplate:
        effectiveSelectedWebIndex !== null
          ? (webTemplates[effectiveSelectedWebIndex] ?? null)
          : null,
    };
  }

  return {
    isWebMode: false,
    selectedMineId:
      selectedMineId === AUTO_TEMPLATE_ID
        ? AUTO_TEMPLATE_ID
        : (userTemplates.find((template) => template.id === selectedMineId)
            ?.id ??
          userTemplates[0]?.id ??
          AUTO_TEMPLATE_ID),
    selectedWebIndex: null,
    selectedWebTemplate: null,
  };
}

export function getTemplateCreatorLabel({
  isUserTemplate,
  creatorName,
  format = TemplateTimestampFormat.Full,
}: {
  isUserTemplate: boolean;
  creatorName?: string | null;
  format?: TemplateTimestampFormat;
}) {
  const name = isUserTemplate ? creatorName?.trim() || "user" : "Cue";
  return format === TemplateTimestampFormat.Short
    ? `by ${name}`
    : `Created by ${name}`;
}

export function filterWebTemplatesAgainstUserTemplates({
  userTemplates,
  webTemplates,
}: {
  userTemplates: Array<{ title?: string | null }>;
  webTemplates: WebTemplate[];
}) {
  const userTemplateTitles = new Set(
    userTemplates.flatMap((template) => {
      const title = normalizeTemplateTitle(template.title);
      return title ? [title] : [];
    }),
  );

  if (userTemplateTitles.size === 0) {
    return webTemplates;
  }

  return webTemplates.filter((template) => {
    const title = normalizeTemplateTitle(template.title);
    return !title || !userTemplateTitles.has(title);
  });
}

export function useTemplateTab(tab: Extract<Tab, { type: TabType.Templates }>) {
  const updateTabState = useTabs((state) => state.updateTemplatesTabState);
  const userTemplates = useUserTemplates();
  const createTemplate = useCreateTemplate();
  const deleteTemplate = useDeleteTemplate();
  const toggleTemplateFavorite = useToggleTemplateFavorite();
  const webTemplates = useMemo(
    () =>
      filterWebTemplatesAgainstUserTemplates({
        userTemplates,
        webTemplates: BUNDLED_WEB_TEMPLATES,
      }),
    [userTemplates],
  );

  const { isWebMode, selectedMineId, selectedWebIndex, selectedWebTemplate } =
    resolveTemplateTabSelection({
      isWebMode: tab.state.isWebMode,
      selectedMineId: tab.state.selectedMineId,
      selectedWebIndex: tab.state.selectedWebIndex,
      userTemplates,
      webTemplates,
    });

  const setSelectedMineId = useCallback(
    (id: string | null) => {
      updateTabState(tab, {
        ...tab.state,
        isWebMode: false,
        selectedMineId: id,
        selectedWebIndex: null,
      });
    },
    [updateTabState, tab],
  );

  const setSelectedWebIndex = useCallback(
    (index: number | null) => {
      updateTabState(tab, {
        ...tab.state,
        isWebMode: true,
        selectedMineId: null,
        selectedWebIndex: index,
      });
    },
    [updateTabState, tab],
  );

  const createDefaultTemplate = useCallback(async () => {
    const id = await createTemplate({
      title: "New Template",
      description: "",
      sections: [],
    });

    if (id) {
      setSelectedMineId(id);
    }

    return id;
  }, [createTemplate, setSelectedMineId]);

  return {
    userTemplates,
    webTemplates,
    isWebMode,
    selectedMineId,
    selectedWebIndex,
    selectedWebTemplate,
    setSelectedMineId,
    setSelectedWebIndex,
    createTemplate,
    createDefaultTemplate,
    deleteTemplate,
    toggleTemplateFavorite,
  };
}

function normalizeTemplateTitle(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
