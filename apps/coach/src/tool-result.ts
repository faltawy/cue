export function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

export function failed(error: unknown) {
  return { ...text(error instanceof Error ? error.message : String(error)), isError: true };
}
