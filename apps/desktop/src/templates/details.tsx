import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

import { DotsThree, Heart } from "@anlg/ui/components/icons";
import { Button } from "@anlg/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@anlg/ui/components/ui/dropdown-menu";
import { cn } from "@anlg/utils";

import { AutoTemplateDetails } from "./auto-form";
import { type WebTemplate } from "./codec";
import { type UserTemplate, type UserTemplateDraft } from "./queries";
import { SectionsList } from "./sections-editor";
import { TemplateForm } from "./template-form";
import { TemplateIconGlyph } from "./template-icon";
import { getTemplateCreatorLabel } from "./utils";

import { EmptyState } from "~/shared/ui/empty-state";
import { ResourcePreviewHeader } from "~/shared/ui/resource-list";

export function TemplateDetailsColumn({
  isAutoSelected,
  isWebMode,
  selectedMineTemplate,
  selectedWebTemplate,
  handleCreateTemplate,
  handleDeleteTemplate,
  handleDuplicateTemplate,
  handleCloneTemplate,
  handleFavoriteTemplate,
  handleSetDefaultTemplate,
}: {
  isAutoSelected: boolean;
  isWebMode: boolean;
  selectedMineTemplate: UserTemplate | null;
  selectedWebTemplate: WebTemplate | null;
  handleCreateTemplate: () => void;
  handleDeleteTemplate: (id: string) => void;
  handleDuplicateTemplate: (id: string) => void;
  handleCloneTemplate: (template: UserTemplateDraft) => void;
  handleFavoriteTemplate: (template: UserTemplateDraft) => void;
  handleSetDefaultTemplate: (template: UserTemplateDraft) => void;
}) {
  if (isAutoSelected) {
    return <AutoTemplateDetails />;
  }

  if (isWebMode) {
    if (!selectedWebTemplate) {
      return (
        <EmptyState title={<Trans>No community templates available</Trans>} />
      );
    }
    return (
      <WebTemplatePreview
        template={selectedWebTemplate}
        onClone={handleCloneTemplate}
        onFavorite={handleFavoriteTemplate}
        onSetDefault={handleSetDefaultTemplate}
      />
    );
  }

  if (!selectedMineTemplate) {
    return <TemplateDetailEmpty onCreate={handleCreateTemplate} />;
  }

  return (
    <TemplateForm
      key={selectedMineTemplate.id}
      template={selectedMineTemplate}
      handleDeleteTemplate={handleDeleteTemplate}
      handleDuplicateTemplate={handleDuplicateTemplate}
    />
  );
}

function TemplateDetailEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <EmptyState
      title={<Trans>No templates yet</Trans>}
      description={
        <Trans>Templates shape how your meeting notes are written.</Trans>
      }
      action={{ label: <Trans>New template</Trans>, onClick: onCreate }}
    />
  );
}

function WebTemplatePreview({
  template,
  onClone,
  onFavorite,
  onSetDefault,
}: {
  template: WebTemplate;
  onClone: (template: UserTemplateDraft) => void;
  onFavorite: (template: UserTemplateDraft) => void;
  onSetDefault: (template: UserTemplateDraft) => void;
}) {
  const { t } = useLingui();
  const nextTemplate: UserTemplateDraft = {
    title: template.title ?? "",
    description: template.description ?? "",
    category: template.category,
    icon: template.icon,
    targets: template.targets,
    sections: template.sections ?? [],
  };
  const [actionsOpen, setActionsOpen] = useState(false);

  return (
    <div className="flex h-full flex-1 flex-col">
      <ResourcePreviewHeader
        icon={
          <TemplateIconGlyph
            icon={template.icon}
            className="text-body size-4"
          />
        }
        title={template.title || t`Untitled`}
        description={template.description}
        targets={template.targets}
        titleMeta={
          <span className="text-muted-foreground text-label shrink-0 font-normal whitespace-nowrap">
            {getTemplateCreatorLabel({
              isUserTemplate: false,
              format: "short",
            })}
          </span>
        }
        footer={null}
        actions={
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onSetDefault(nextTemplate)}
              className="shrink-0"
            >
              <Trans>Set as default</Trans>
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => onFavorite(nextTemplate)}
              className="text-muted-foreground hover:text-foreground"
              title={t`Favorite template`}
              aria-label={t`Favorite template`}
            >
              <Heart className="size-4" />
            </Button>
            <DropdownMenu open={actionsOpen} onOpenChange={setActionsOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className={cn([
                    "text-muted-foreground hover:text-foreground",
                    actionsOpen && "bg-muted text-foreground hover:bg-accent",
                  ])}
                  aria-label={t`Template actions`}
                >
                  <DotsThree className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => onClone(nextTemplate)}
                  className="cursor-pointer"
                >
                  <Trans>Duplicate</Trans>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      >
        <div className="mt-6">
          <SectionsList
            disabled={true}
            items={template.sections ?? []}
            onChange={() => {}}
          />
        </div>
      </ResourcePreviewHeader>
    </div>
  );
}
