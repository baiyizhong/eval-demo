export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonObject
  | JsonArray;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];

export type ScoreDomain = {
  id: string;
  timestamp: Date | string;
  longStringValue?: string | null;
  [key: string]: unknown;
};

export function getIsCharOrUnderscore(value: string): boolean {
  const charOrUnderscore = /^[\p{L}\p{N}_]+$/u;

  return charOrUnderscore.test(value);
}

export const VARIABLE_REGEX = /^\p{L}[\p{L}\p{N}_]*$/u;
export const MUSTACHE_REGEX = /{{([^{}]*)}}/g;
export const MULTILINE_VARIABLE_REGEX = /{{[^{}]*\n[^{}]*}}/g;
export const UNCLOSED_VARIABLE_REGEX = /{{(?!{)(?![^{]*}})/g;

export function isValidVariableName(variable: string): boolean {
  return VARIABLE_REGEX.test(variable);
}

export function extractVariables(mustacheString: string): string[] {
  const matches = Array.from(mustacheString.matchAll(MUSTACHE_REGEX))
    .map((match) => match[1])
    .filter(isValidVariableName);

  return [...new Set(matches)];
}

export function stringifyValue(value: unknown) {
  switch (typeof value) {
    case "string":
      return value;
    case "number":
    case "boolean":
      return value.toString();
    default:
      return JSON.stringify(value);
  }
}

export const PromptDependencyRegex = /@@@langfusePrompt:(.*?)@@@/g;

export type ParsedPromptDependencyTag =
  | {
      name: string;
      type: "version";
      version: number;
    }
  | {
      name: string;
      type: "label";
      label: string;
    };

export function parsePromptDependencyTags(
  content: string | object,
): ParsedPromptDependencyTag[] {
  const matchedTags = JSON.stringify(content).match(PromptDependencyRegex);
  const validTags: ParsedPromptDependencyTag[] = [];

  for (const match of new Set(matchedTags ?? [])) {
    const innerContent = match.replace(/^@@@langfusePrompt:|@@@$/g, "");
    const parts = innerContent.split("|");
    const params: Record<string, string> = {};
    const firstPart = parts[0];

    if (!firstPart || !firstPart.startsWith("name=") || parts.length !== 2) {
      continue;
    }

    parts.forEach((part) => {
      const [key, value] = part.split("=");
      if (key && value) {
        params[key] = value;
      }
    });

    if (!params.name) {
      continue;
    }

    if (params.version) {
      const version = Number(params.version);

      if (Number.isFinite(version)) {
        validTags.push({
          name: params.name,
          type: "version",
          version,
        });
      }
    } else if (params.label) {
      validTags.push({
        name: params.name,
        type: "label",
        label: params.label,
      });
    }
  }

  return validTags;
}

type DeepParseOptions = {
  maxSize?: number;
  maxDepth?: number;
};

export function deepParseJson(value: unknown, options: DeepParseOptions = {}) {
  const maxDepth = options.maxDepth ?? 25;
  const maxSize = options.maxSize ?? Number.POSITIVE_INFINITY;

  const parse = (input: unknown, depth: number): unknown => {
    if (depth > maxDepth) return input;

    if (typeof input === "string") {
      if (input.length > maxSize) return input;
      const trimmed = input.trim();
      if (
        !trimmed ||
        !["{", "["].includes(trimmed[0]) ||
        !["}", "]"].includes(trimmed[trimmed.length - 1])
      ) {
        return input;
      }
      try {
        return parse(JSON.parse(trimmed), depth + 1);
      } catch {
        return input;
      }
    }

    if (Array.isArray(input)) {
      return input.map((item) => parse(item, depth + 1));
    }

    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input).map(([key, item]) => [key, parse(item, depth + 1)]),
      );
    }

    return input;
  };

  return parse(value, 0);
}
