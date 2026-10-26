export enum SourceKind {
  Web = "web",
  Email = "email",
}

export type Source = {
  kind: SourceKind;
  url: string;
  label: string;
  title: string;
};
