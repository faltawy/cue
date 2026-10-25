import { useCallback } from "react";

import type { ContactsSelection } from "@anlg/plugin-windows";

import { DetailsColumn } from "./details";
import { OrganizationDetailsColumn } from "./organization-details";
import { useHumans, useOrganizations } from "./queries";
import { useDeleteContact } from "./use-delete-contact";

import { ContactType } from "~/contacts/enums";
import { StandardContentWrapper } from "~/shared/main";
import { useOwnerUserId } from "~/shared/owner-user";
import { type Tab, useTabs } from "~/store/zustand/tabs";
import { TabType } from "~/store/zustand/tabs/enums";

export function TabContentContact({
  tab,
}: {
  tab: Extract<Tab, { type: TabType.Contacts }>;
}) {
  return (
    <StandardContentWrapper>
      <ContactView tab={tab} />
    </StandardContentWrapper>
  );
}

function ContactView({
  tab,
}: {
  tab: Extract<Tab, { type: TabType.Contacts }>;
}) {
  const updateContactsTabState = useTabs(
    (state) => state.updateContactsTabState,
  );
  const openCurrent = useTabs((state) => state.openCurrent);
  const deleteContact = useDeleteContact();

  const selected = tab.state.selected;
  const ownerUserId = useOwnerUserId();
  const humans = useHumans();
  const self = humans.find((human) => human.id === ownerUserId);
  const organizations = useOrganizations();

  const setSelected = useCallback(
    (value: ContactsSelection | null) => {
      updateContactsTabState(tab, { selected: value });
    },
    [updateContactsTabState, tab],
  );

  const handleSessionClick = useCallback(
    (id: string) => {
      openCurrent({ type: "sessions", id });
    },
    [openCurrent],
  );

  const handleDeletePerson = useCallback(
    (id: string) => {
      deleteContact(
        ContactType.Human,
        id,
        humans.find((human) => human.id === id)?.name ?? "",
      );
      setSelected(null);
    },
    [deleteContact, humans, setSelected],
  );

  const handleDeleteOrganization = useCallback(
    (id: string) => {
      deleteContact(
        ContactType.Organization,
        id,
        organizations.find((organization) => organization.id === id)?.name ??
          "",
      );
      setSelected(null);
    },
    [deleteContact, organizations, setSelected],
  );

  const effectiveSelection =
    selected ??
    (self ? ({ type: "person", id: self.id } as const) : null) ??
    (humans[0]
      ? ({ type: "person", id: humans[0].id } as const)
      : organizations[0]
        ? ({ type: "organization", id: organizations[0].id } as const)
        : null);

  return (
    <div className="h-full">
      {effectiveSelection?.type === "organization" ? (
        <OrganizationDetailsColumn
          key={effectiveSelection.id}
          organization={
            organizations.find(
              (organization) => organization.id === effectiveSelection.id,
            ) ?? null
          }
          humans={humans}
          onPersonClick={(personId) =>
            setSelected({ type: "person", id: personId })
          }
          onDelete={handleDeleteOrganization}
        />
      ) : (
        <DetailsColumn
          key={effectiveSelection?.id ?? "empty"}
          human={
            effectiveSelection?.type === "person"
              ? (humans.find((human) => human.id === effectiveSelection.id) ??
                null)
              : null
          }
          humans={humans}
          organizations={organizations}
          handleSessionClick={handleSessionClick}
          onDelete={handleDeletePerson}
        />
      )}
    </div>
  );
}
