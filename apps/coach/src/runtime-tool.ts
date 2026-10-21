import { z } from "zod";

import { failed, text } from "./tool-result";

export function tool<S extends z.ZodRawShape>(
  name: string,
  description: string,
  inputSchema: S,
  run: (
    input: z.infer<z.ZodObject<S>>,
  ) => Promise<ReturnType<typeof text> & { isError?: boolean }>,
  options?: { annotations: { readOnlyHint: boolean } },
) {
  return {
    name,
    description,
    inputSchema,
    options,
    async handler(input: unknown, _extra?: unknown) {
      const parsed = z.object(inputSchema).safeParse(input);
      if (!parsed.success)
        return failed(new Error(z.prettifyError(parsed.error)));
      try {
        return await run(parsed.data);
      } catch (error) {
        return failed(error);
      }
    },
  };
}

export type RuntimeTool = ReturnType<typeof tool> & {
  jsonSchema?: Record<string, unknown>;
};
