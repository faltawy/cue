import { findViolations } from "./scripts/cue-design-classes.mjs";

const awaitTauriCommands = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Enforce await on Tauri IPC commands to prevent race conditions and freezes",
    },
    fixable: "code",
    messages: {
      missingAwait:
        "Tauri command '{{name}}' must be awaited. Unawaited IPC calls can cause race conditions and freezes.",
    },
  },
  createOnce(context) {
    let tauriCommandImports;

    return {
      before() {
        tauriCommandImports = new Set();
      },

      ImportDeclaration(node) {
        const source = node.source.value;

        const isTauriCommands =
          source.startsWith("@anlg/plugin-") || source.endsWith("/tauri.gen");

        if (isTauriCommands) {
          for (const specifier of node.specifiers) {
            if (
              specifier.type === "ImportSpecifier" &&
              specifier.imported.name === "commands"
            ) {
              tauriCommandImports.add(specifier.local.name);
            }
          }
        }
      },

      CallExpression(node) {
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.object.type === "Identifier" &&
          tauriCommandImports.has(node.callee.object.name)
        ) {
          const methodName = node.callee.property.name;
          const current = node.parent;

          if (current.type === "AwaitExpression") {
            return;
          }

          if (
            current.type === "ReturnStatement" ||
            current.type === "ArrowFunctionExpression"
          ) {
            return;
          }

          if (current.type === "ArrayExpression") {
            return;
          }

          context.report({
            node,
            messageId: "missingAwait",
            data: { name: methodName },
            fix(fixer) {
              if (current.type === "ExpressionStatement") {
                const sourceCode =
                  context.sourceCode || context.getSourceCode();
                const callText = sourceCode.getText(node);
                return fixer.replaceText(node, `await ${callText}`);
              }
              return null;
            },
          });
        }
      },
    };
  },
};

const noRawTinybase = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Prevent TinyBase from being reintroduced into the SQLite-backed desktop app.",
    },
    messages: {
      bannedImport:
        "TinyBase import '{{source}}' is not allowed. Use the canonical SQLite domain queries and mutations instead.",
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (typeof source !== "string") return;

        if (
          source === "tinybase" ||
          source.startsWith("tinybase/") ||
          source === "@anlg/tinybase-utils" ||
          source.startsWith("@anlg/tinybase-utils/") ||
          source.startsWith("~/store/tinybase/")
        ) {
          context.report({
            node,
            messageId: "bannedImport",
            data: { source },
          });
        }
      },
    };
  },
};

const CLASS_CALLEES = new Set(["cn", "cva", "clsx", "twMerge", "cx"]);
const CLASS_NAME = /class/i;

function inClassContext(node) {
  for (let current = node.parent; current; current = current.parent) {
    switch (current.type) {
      case "JSXAttribute":
        return CLASS_NAME.test(current.name?.name ?? "");
      case "CallExpression":
        if (CLASS_CALLEES.has(current.callee?.name)) return true;
        break;
      case "VariableDeclarator":
        return CLASS_NAME.test(current.id?.name ?? "");
      case "Property":
        if (CLASS_NAME.test(current.key?.name ?? current.key?.value ?? ""))
          return true;
        break;
      case "FunctionDeclaration":
      case "Program":
        return false;
    }
  }
  return false;
}

// docs/design/cue.md as a lint: raw palette colours, off-scale text sizes,
// shadows outside floating layers, blur, painted gradients and radii off the
// 4/6/8/12/full scale. Warn-only until the screens are restyled; count with
// `pnpm exec oxlint -A all -W anlg/cue-design apps/desktop/src packages/ui/src`.
const cueDesign = {
  meta: {
    type: "suggestion",
    docs: { description: "Keep class names on the Cue design scale" },
    messages: {
      offScale:
        "{{category}}: `{{token}}` is off the Cue design scale (docs/design/cue.md).",
    },
  },
  create(context) {
    const file = context.filename ?? context.getFilename();
    if (/\.test\.[jt]sx?$/.test(file)) return {};
    const check = (node, text) => {
      if (!text || !inClassContext(node)) return;
      for (const { category, token } of findViolations(text, file)) {
        context.report({
          node,
          messageId: "offScale",
          data: { category, token },
        });
      }
    };
    return {
      Literal(node) {
        if (typeof node.value === "string") check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value?.cooked);
      },
    };
  },
};

const plugin = {
  meta: {
    name: "anlg",
    version: "1.0.0",
  },
  rules: {
    "await-tauri-commands": awaitTauriCommands,
    "no-raw-tinybase": noRawTinybase,
    "cue-design": cueDesign,
  },
};

export default plugin;
