export default {
  getReleaseLine(changeset, type) {
    if (type === "major") {
      throw new Error(
        `Changeset "${changeset.id}" is major; Cue releases are patch or minor only.`,
      );
    }
    const [first, ...rest] = changeset.summary.trim().split("\n");
    return [`- ${first}`, ...rest.map((line) => `  ${line}`)].join("\n");
  },
  getDependencyReleaseLine() {
    return "";
  },
};
