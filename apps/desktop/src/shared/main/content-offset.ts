import { useEffect, useState } from "react";

const MAIN_BODY_SELECTOR = "[data-main-body-panel-container]";

export function measureMainContentCenterOffset(
  dialogWidthPx = 0,
): number {
  const body = document.querySelector(MAIN_BODY_SELECTOR);
  if (!body) {
    return 0;
  }

  const rect = body.getBoundingClientRect();
  const offset = rect.left + rect.width / 2 - window.innerWidth / 2;
  const room = Math.max(0, (window.innerWidth - dialogWidthPx) / 2);
  return Math.max(-room, Math.min(room, offset));
}

export function useMainContentCenterOffset(
  active: boolean,
  dialogWidthPx?: number,
) {
  const [contentOffset, setContentOffset] = useState(0);

  useEffect(() => {
    if (!active) {
      return;
    }

    const computeOffset = () =>
      setContentOffset(measureMainContentCenterOffset(dialogWidthPx));

    computeOffset();
    window.addEventListener("resize", computeOffset);

    const body = document.querySelector(MAIN_BODY_SELECTOR);
    const resizeObserver = new ResizeObserver(computeOffset);
    if (body) {
      resizeObserver.observe(body);
    }

    return () => {
      window.removeEventListener("resize", computeOffset);
      resizeObserver.disconnect();
    };
  }, [active, dialogWidthPx]);

  return contentOffset;
}
