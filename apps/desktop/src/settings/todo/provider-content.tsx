import { useLingui } from "@lingui/react/macro";

import {
  AccessPermissionRow,
  TroubleShootingLink,
} from "~/calendar/components/apple/permission";
import { usePermission } from "~/shared/hooks/usePermissions";

export function AppleRemindersProviderContent() {
  const { t } = useLingui();
  const reminders = usePermission("reminders");

  if (reminders.status !== "authorized") {
    return (
      <AccessPermissionRow
        title={t`Reminders`}
        status={reminders.status}
        isPending={reminders.isPending}
        onOpen={reminders.open}
        onRequest={reminders.request}
        onReset={reminders.reset}
      />
    );
  }

  return (
    <TroubleShootingLink
      onRequest={reminders.request}
      onReset={reminders.reset}
      onOpen={reminders.open}
      isPending={reminders.isPending}
    />
  );
}
