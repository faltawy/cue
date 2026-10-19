import { Icon } from "@iconify-icon/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

import { commands as openerCommands } from "@anlg/plugin-opener2";
import { Buildings, Envelope } from "@anlg/ui/components/icons";
import { Button } from "@anlg/ui/components/ui/button";
import { Input } from "@anlg/ui/components/ui/input";

import {
  AvatarUploadButton,
  ContactImage,
  persistContactAvatar,
} from "./contact-avatar";
import { ContactPageHeader } from "./contact-page-header";
import {
  type HumanRecord,
  type OrganizationRecord,
  toggleContactPin,
  updateOrganization,
} from "./queries";
import { ContactFacehash } from "./shared";

export function OrganizationDetailsColumn({
  organization,
  humans,
  onPersonClick,
  onDelete,
}: {
  organization: OrganizationRecord | null;
  humans: HumanRecord[];
  onPersonClick?: (personId: string) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useLingui();
  const [showCompactIdentity, setShowCompactIdentity] = useState(false);
  const peopleInOrg = organization
    ? humans.filter((human) => human.organizationId === organization.id)
    : [];

  return (
    <div className="flex h-full flex-1 flex-col">
      {organization ? (
        <>
          <ContactPageHeader
            title={organization.name || t`Unnamed`}
            compactIdentity={
              organization.avatarDataUrl ? (
                <ContactImage src={organization.avatarDataUrl} size={24} />
              ) : (
                <div className="bg-muted flex size-6 shrink-0 items-center justify-center rounded-full">
                  <Buildings className="text-muted-foreground size-3" />
                </div>
              )
            }
            showCompactIdentity={showCompactIdentity}
            pinned={Boolean(organization.pinned)}
            onTogglePin={() => {
              void toggleContactPin("organization", organization.id).catch(
                (error) => {
                  console.error(
                    "[contacts] failed to toggle contact pin",
                    error,
                  );
                },
              );
            }}
            onDelete={() => onDelete(organization.id)}
            onRemoveAvatar={
              organization.avatarDataUrl
                ? () => {
                    persistContactAvatar("organization", organization.id, null);
                  }
                : undefined
            }
          />

          <div
            className="flex-1 overflow-y-auto"
            onScroll={(event) => {
              setShowCompactIdentity(event.currentTarget.scrollTop > 0);
            }}
          >
            <div className="border-border flex items-center justify-center border-b py-6">
              <AvatarUploadButton
                label={t`Change photo`}
                onUpload={(dataUrl) => {
                  persistContactAvatar(
                    "organization",
                    organization.id,
                    dataUrl,
                  );
                }}
              >
                {organization.avatarDataUrl ? (
                  <ContactImage src={organization.avatarDataUrl} size={64} />
                ) : (
                  <div className="bg-accent flex h-16 w-16 items-center justify-center rounded-full">
                    <Buildings className="text-muted-foreground h-8 w-8" />
                  </div>
                )}
              </AvatarUploadButton>
            </div>

            <div>
              <div className="border-border flex items-center border-b px-4 py-3">
                <div className="text-muted-foreground text-body w-28">
                  <Trans>Name</Trans>
                </div>
                <div className="flex-1">
                  <EditableOrganizationNameField
                    key={organization.id}
                    organization={organization}
                  />
                </div>
              </div>
            </div>

            <div className="p-6">
              <h3 className="text-muted-foreground text-body mb-4 font-medium">
                <Trans>People</Trans>
                <span className="text-muted-foreground font-normal">
                  {" "}
                  &middot;{" "}
                  <span className="tabular-nums">
                    <Plural
                      value={peopleInOrg.length}
                      one="# member"
                      other="# members"
                    />
                  </span>
                </span>
              </h3>
              <div>
                {peopleInOrg.length > 0 ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-4">
                    {peopleInOrg.map((human) => {
                      return (
                        <div
                          key={human.id}
                          className="border-border hover:bg-muted cursor-pointer rounded-lg border p-3 transition-colors duration-100"
                          onClick={() => onPersonClick?.(human.id)}
                        >
                          <div className="flex h-full flex-col items-center gap-3 text-center">
                            {human.avatarDataUrl ? (
                              <ContactImage
                                src={human.avatarDataUrl}
                                size={48}
                              />
                            ) : (
                              <ContactFacehash
                                name={String(
                                  human.name || human.email || human.id,
                                )}
                                size={48}
                              />
                            )}
                            <div className="w-full">
                              <div
                                title={human.name || human.email}
                                className="text-body truncate font-semibold [unicode-bidi:plaintext]"
                              >
                                {human.name || human.email || t`Unnamed`}
                              </div>
                              {human.jobTitle && (
                                <div
                                  title={human.jobTitle}
                                  className="text-muted-foreground text-label mt-1 truncate"
                                >
                                  {human.jobTitle}
                                </div>
                              )}
                            </div>
                            <div className="mt-auto flex gap-2">
                              {human.email && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void openerCommands.openUrl(
                                      `mailto:${human.email}`,
                                      null,
                                    );
                                  }}
                                  title={t`Send email`}
                                >
                                  <Envelope className="size-4" />
                                </Button>
                              )}
                              {human.linkedinUsername && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const v = String(human.linkedinUsername);
                                    const href = /^https?:\/\//i.test(v)
                                      ? v
                                      : `https://www.linkedin.com/in/${v.replace(/^@/, "")}`;
                                    void openerCommands.openUrl(href, null);
                                  }}
                                  title={t`View LinkedIn profile`}
                                >
                                  <Icon icon="logos:linkedin-icon" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-body">
                    <Trans>No people in this organization</Trans>
                  </p>
                )}
              </div>
            </div>

            <div className="pb-96" />
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground text-body">
            <Trans>Select an organization to view details</Trans>
          </p>
        </div>
      )}
    </div>
  );
}

function EditableOrganizationNameField({
  organization,
}: {
  organization: OrganizationRecord;
}) {
  const { t } = useLingui();

  return (
    <Input
      defaultValue={organization.name}
      onChange={(event) => {
        void updateOrganization(organization.id, {
          name: event.target.value,
        }).catch((error) => {
          console.error("[contacts] failed to update organization", error);
        });
      }}
      placeholder={t`Organization name`}
      className="text-body h-7 border-none p-0"
    />
  );
}
