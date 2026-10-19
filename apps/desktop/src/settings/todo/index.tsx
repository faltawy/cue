import { Trans } from "@lingui/react/macro";

import { CaretDown } from "@anlg/ui/components/icons";
import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTriggerPrimitive,
} from "@anlg/ui/components/ui/accordion";
import { cn } from "@anlg/utils";

import { AppleRemindersProviderContent } from "./provider-content";
import { TODO_PROVIDERS } from "./shared";

import { SettingsPageTitle } from "~/settings/page-title";

export function SettingsTodo() {
  return (
    <div className="flex flex-col gap-6">
      <SettingsPageTitle title={<Trans>Ticket</Trans>} />
      <Accordion type="multiple">
        {TODO_PROVIDERS.map((provider) => (
          <AccordionItem
            key={provider.id}
            value={provider.id}
            className="group/provider border-border border-b last:border-none"
          >
            <div className="group hover:bg-accent grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-md">
              <AccordionHeader className="min-w-0">
                <AccordionTriggerPrimitive className="text-ui flex w-full min-w-0 items-center gap-2 py-3 text-start font-medium transition-all hover:no-underline">
                  {provider.icon}
                  <span>{provider.displayName}</span>
                </AccordionTriggerPrimitive>
              </AccordionHeader>
              <CaretDown
                className={cn([
                  "text-muted-foreground size-4 shrink-0 opacity-0 transition-all duration-200 group-hover:opacity-100 focus-within:opacity-100",
                  "group-data-[state=open]/provider:rotate-180",
                ])}
              />
            </div>
            <AccordionContent className="pb-3">
              <div className="flex flex-col gap-3">
                <AppleRemindersProviderContent />
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
