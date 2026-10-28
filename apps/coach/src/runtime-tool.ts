import { z } from "zod";

import { failed } from "./tool-result";

export type ToolResult = {
  content: (
    | { type: "text"; text: string }
    | { type: "image"; mimeType: string; data: string }
  )[];
  isError?: boolean;
};

export function tool<S extends z.ZodRawShape, R extends ToolResult>(
  name: string,
  description: string,
  inputSchema: S,
  run: (input: z.infer<z.ZodObject<S>>) => Promise<R>,
  options?: { annotations: { readOnlyHint: boolean } },
) {
  return {
    name,
    description,
    inputSchema,
    options,
    async handler(
      input: unknown,
      _extra?: unknown,
    ): Promise<(R | ReturnType<typeof failed>) & { isError?: boolean }> {
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
