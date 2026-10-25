import { type ReactNode, type RefCallback, useMemo } from "react";

import { cn } from "@anlg/utils";

import { TimelineItemComponent } from "./item";
import { CurrentTimeIndicator, useCurrentTimeMs } from "./realtime";
import { type SidebarUpcomingMeetingStatus } from "./upcoming-meeting";
import {
  calculateTodayIndicatorPlacement,
  getItemTimestamp,
  type TimelineBucket,
  type TimelineIndicatorPlacement,
  type TimelineItem,
} from "./utils";

import {
  TimelineIndicatorPlacementType,
  TimelineDividerVariant,
  type TimelinePrecision,
  NoteSortOrder as TimelineSortOrder,
} from "~/sidebar/enums";

export function TimelineBuckets({
  bucketHeaderTopClassName,
  buckets,
  emptyTodayLabel,
  getFlatItemKeys,
  hasActiveVisibleSession,
  hasToday,
  indicatorIndex,
  registerIndicator,
  selectedIds,
  selectedNodeRef,
  selectedSessionId,
  showCurrentTimeIndicator = true,
  sortOrder = TimelineSortOrder.Newest,
  timezone,
  upcomingMeetingStatus,
  upcomingNodeRef,
}: {
  bucketHeaderTopClassName: string;
  buckets: TimelineBucket[];
  emptyTodayLabel: ReactNode;
  getFlatItemKeys: () => string[];
  hasActiveVisibleSession: boolean;
  hasToday: boolean;
  indicatorIndex: number;
  registerIndicator: (node: HTMLDivElement | null) => void;
  selectedIds: string[];
  selectedNodeRef: RefCallback<HTMLDivElement>;
  selectedSessionId: string | undefined;
  showCurrentTimeIndicator?: boolean;
  sortOrder?: TimelineSortOrder;
  timezone?: string;
  upcomingMeetingStatus: SidebarUpcomingMeetingStatus | null;
  upcomingNodeRef: RefCallback<HTMLDivElement>;
}) {
  return (
    <>
      {buckets.map((bucket, index) => {
        const isToday = bucket.label === "Today";
        const shouldPlaceIndicatorBefore =
          showCurrentTimeIndicator && !hasToday && indicatorIndex === index;
        const shouldRenderIndicatorBefore =
          shouldPlaceIndicatorBefore && !hasActiveVisibleSession;
        const shouldRenderIndicatorAnchorBefore =
          shouldPlaceIndicatorBefore && hasActiveVisibleSession;
        const isTopIndicator = shouldRenderIndicatorBefore && index === 0;

        return (
          <div key={bucket.label} className={cn([isTopIndicator && "pt-3"])}>
            {shouldRenderIndicatorBefore && (
              <div data-sidebar-current-time-header-gap className="py-3">
                <CurrentTimeIndicator
                  ref={registerIndicator}
                  timezone={timezone}
                />
              </div>
            )}
            {shouldRenderIndicatorAnchorBefore && (
              <CurrentTimeAnchor registerIndicator={registerIndicator} />
            )}
            <div
              data-sidebar-timeline-bucket-header
              className={cn([
                "sticky z-20",
                bucketHeaderTopClassName,
                "bg-background ps-2.5 pe-1 pt-2 pb-1",
              ])}
            >
              <div className="text-muted-foreground text-label font-medium">
                <bdi>{bucket.label}</bdi>
              </div>
            </div>
            {isToday ? (
              <TodayBucket
                items={bucket.items}
                precision={bucket.precision}
                emptyLabel={emptyTodayLabel}
                registerIndicator={registerIndicator}
                selectedSessionId={selectedSessionId}
                selectedNodeRef={selectedNodeRef}
                sortOrder={sortOrder}
                suppressCurrentTimeIndicator={hasActiveVisibleSession}
                timezone={timezone}
                selectedIds={selectedIds}
                getFlatItemKeys={getFlatItemKeys}
                upcomingItemKey={upcomingMeetingStatus?.itemKey}
                upcomingItemLabel={upcomingMeetingStatus?.label}
                upcomingItemProgress={upcomingMeetingStatus?.progress}
                upcomingItemNodeRef={upcomingNodeRef}
              />
            ) : (
              bucket.items.map((item) => {
                const itemKey = `${item.type}-${item.id}`;
                const selected =
                  item.type === "session" && item.id === selectedSessionId;
                return (
                  <TimelineItemComponent
                    key={itemKey}
                    item={item}
                    precision={bucket.precision}
                    selected={selected}
                    timezone={timezone}
                    multiSelected={selectedIds.includes(itemKey)}
                    getFlatItemKeys={getFlatItemKeys}
                    selectedNodeRef={selected ? selectedNodeRef : undefined}
                    itemNodeRef={
                      itemKey === upcomingMeetingStatus?.itemKey
                        ? upcomingNodeRef
                        : undefined
                    }
                    isUpcoming={itemKey === upcomingMeetingStatus?.itemKey}
                    upcomingLabel={
                      itemKey === upcomingMeetingStatus?.itemKey
                        ? upcomingMeetingStatus.label
                        : undefined
                    }
                    upcomingProgress={
                      itemKey === upcomingMeetingStatus?.itemKey
                        ? upcomingMeetingStatus.progress
                        : undefined
                    }
                  />
                );
              })
            )}
          </div>
        );
      })}
      {showCurrentTimeIndicator &&
        !hasToday &&
        (indicatorIndex === -1 || indicatorIndex === buckets.length) &&
        (hasActiveVisibleSession ? (
          <CurrentTimeAnchor registerIndicator={registerIndicator} />
        ) : (
          <CurrentTimeIndicator ref={registerIndicator} timezone={timezone} />
        ))}
    </>
  );
}

function CurrentTimeAnchor({
  progress = 0.5,
  registerIndicator,
  variant = TimelineDividerVariant.Seam,
}: {
  progress?: number;
  registerIndicator: (node: HTMLDivElement | null) => void;
  variant?: TimelineDividerVariant;
}) {
  return (
    <div
      ref={registerIndicator}
      aria-hidden
      data-sidebar-current-time-anchor
      className={cn([
        "pointer-events-none opacity-0",
        variant === TimelineDividerVariant.Inside
          ? "absolute inset-x-0 z-20 h-px"
          : "relative z-20 h-px",
      ])}
      style={
        variant === TimelineDividerVariant.Inside
          ? { top: `${(1 - progress) * 100}%` }
          : undefined
      }
    />
  );
}

function TodayBucket({
  emptyLabel,
  items,
  precision,
  registerIndicator,
  selectedSessionId,
  selectedNodeRef,
  sortOrder,
  suppressCurrentTimeIndicator,
  timezone,
  selectedIds,
  getFlatItemKeys,
  upcomingItemKey,
  upcomingItemLabel,
  upcomingItemProgress,
  upcomingItemNodeRef,
}: {
  emptyLabel: ReactNode;
  items: TimelineItem[];
  precision: TimelinePrecision;
  registerIndicator: (node: HTMLDivElement | null) => void;
  selectedSessionId: string | undefined;
  selectedNodeRef: RefCallback<HTMLDivElement>;
  sortOrder: TimelineSortOrder;
  suppressCurrentTimeIndicator: boolean;
  timezone?: string;
  selectedIds: string[];
  getFlatItemKeys: () => string[];
  upcomingItemKey?: string;
  upcomingItemLabel?: string;
  upcomingItemProgress?: number;
  upcomingItemNodeRef: RefCallback<HTMLDivElement>;
}) {
  const currentTimeMs = useCurrentTimeMs();

  const entries = useMemo(
    () =>
      items.map((timelineItem) => ({
        item: timelineItem,
        timestamp: getItemTimestamp(timelineItem),
      })),
    [items],
  );

  const indicatorPlacement = useMemo<TimelineIndicatorPlacement>(
    // currentTimeMs in deps triggers updates as time passes,
    // but we use fresh Date() so indicator positions correctly when entries change immediately (new note).
    () => calculateTodayIndicatorPlacement(entries, new Date(), sortOrder),
    [entries, currentTimeMs, sortOrder],
  );

  const renderedEntries = useMemo(() => {
    if (entries.length === 0) {
      return (
        <>
          {suppressCurrentTimeIndicator ? (
            <CurrentTimeAnchor registerIndicator={registerIndicator} />
          ) : (
            <CurrentTimeIndicator ref={registerIndicator} timezone={timezone} />
          )}
          {emptyLabel}
        </>
      );
    }

    const nodes: ReactNode[] = [];

    entries.forEach((entry, index) => {
      if (
        indicatorPlacement.type === TimelineIndicatorPlacementType.Before &&
        index === indicatorPlacement.index
      ) {
        nodes.push(
          suppressCurrentTimeIndicator ? (
            <CurrentTimeAnchor
              key="current-time-anchor"
              registerIndicator={registerIndicator}
            />
          ) : (
            <CurrentTimeIndicator
              ref={registerIndicator}
              key="current-time-indicator"
              timezone={timezone}
            />
          ),
        );
      }

      const itemKey = `${entry.item.type}-${entry.item.id}`;
      const selected =
        entry.item.type === "session" && entry.item.id === selectedSessionId;

      const itemNode = (
        <TimelineItemComponent
          key={itemKey}
          item={entry.item}
          precision={precision}
          selected={selected}
          timezone={timezone}
          multiSelected={selectedIds.includes(itemKey)}
          getFlatItemKeys={getFlatItemKeys}
          selectedNodeRef={selected ? selectedNodeRef : undefined}
          itemNodeRef={
            itemKey === upcomingItemKey ? upcomingItemNodeRef : undefined
          }
          isUpcoming={itemKey === upcomingItemKey}
          upcomingLabel={
            itemKey === upcomingItemKey ? upcomingItemLabel : undefined
          }
          upcomingProgress={
            itemKey === upcomingItemKey ? upcomingItemProgress : undefined
          }
        />
      );

      if (
        indicatorPlacement.type === TimelineIndicatorPlacementType.Inside &&
        index === indicatorPlacement.index
      ) {
        nodes.push(
          <div key={`${itemKey}-wrapper`} className="relative">
            {suppressCurrentTimeIndicator ? (
              <CurrentTimeAnchor
                registerIndicator={registerIndicator}
                variant={TimelineDividerVariant.Inside}
                progress={indicatorPlacement.progress}
              />
            ) : (
              <CurrentTimeIndicator
                ref={registerIndicator}
                key="current-time-indicator-inside"
                timezone={timezone}
                variant={TimelineDividerVariant.Inside}
                progress={indicatorPlacement.progress}
              />
            )}
            {itemNode}
          </div>,
        );
        return;
      }

      nodes.push(itemNode);
    });

    if (indicatorPlacement.type === TimelineIndicatorPlacementType.After) {
      nodes.push(
        suppressCurrentTimeIndicator ? (
          <CurrentTimeAnchor
            key="current-time-anchor-end"
            registerIndicator={registerIndicator}
          />
        ) : (
          <CurrentTimeIndicator
            ref={registerIndicator}
            key="current-time-indicator-end"
            timezone={timezone}
          />
        ),
      );
    }

    return <>{nodes}</>;
  }, [
    entries,
    emptyLabel,
    indicatorPlacement,
    precision,
    registerIndicator,
    selectedSessionId,
    selectedNodeRef,
    suppressCurrentTimeIndicator,
    timezone,
    selectedIds,
    getFlatItemKeys,
    upcomingItemKey,
    upcomingItemLabel,
    upcomingItemProgress,
    upcomingItemNodeRef,
  ]);

  return renderedEntries;
}
