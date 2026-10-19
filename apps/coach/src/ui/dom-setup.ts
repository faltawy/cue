import { afterAll, afterEach, beforeAll } from "bun:test";

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup } from "@testing-library/react";

export function useDom() {
  beforeAll(() => {
    if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: "http://127.0.0.1:4747/" });
  });
  afterEach(cleanup);
  afterAll(async () => {
    if (GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister();
  });
}
