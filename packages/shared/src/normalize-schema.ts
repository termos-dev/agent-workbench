import type { FormSchema, FormQuestion, FormOption } from "./schema.js";

interface RawQuestion {
  question?: string;
  header?: string;
  options?: unknown[];
  placeholder?: string;
  multiSelect?: boolean;
  inputType?: string;
  validation?: string;
  [key: string]: unknown;
}

/**
 * Normalize various input formats to standard FormSchema.
 * Handles:
 * - Array of questions directly: [{question, header, options?}]
 * - Object with question:header mapping: {"What is your name?": "name"}
 * - Standard format: { questions: [...] }
 * - Auto-generates unique headers from question text if not provided
 */
export function normalizeFormSchema(input: unknown): FormSchema {
  // Handle array input
  if (Array.isArray(input)) {
    return normalizeFormSchema({ questions: input });
  }

  // Handle object-to-questions mapping (e.g., { "What is your name?": "name" })
  if (input && typeof input === "object" && !("questions" in input)) {
    const entries = Object.entries(input as Record<string, unknown>);
    const questions = entries.map(([question, value]) => {
      if (typeof value === "string") {
        return { question, header: value };
      }
      if (value && typeof value === "object") {
        return { question, ...value };
      }
      return { question };
    });
    return normalizeFormSchema({ questions });
  }

  // Process questions array
  const base = input as { questions?: RawQuestion[] };
  if (!Array.isArray(base.questions)) {
    return input as FormSchema;
  }

  const usedHeaders = new Set<string>();
  const questions = base.questions.map((q, idx) =>
    normalizeQuestion(q, idx, usedHeaders)
  );

  return { ...base, questions } as FormSchema;
}

function normalizeQuestion(
  q: RawQuestion,
  idx: number,
  usedHeaders: Set<string>
): FormQuestion {
  const result: Record<string, unknown> = { ...q };

  // Auto-generate unique header if not provided
  result.header = generateUniqueHeader(
    (result.question as string) || "",
    result.header as string | undefined,
    idx,
    usedHeaders
  );

  // Normalize options format (string -> {label: string})
  if (Array.isArray(result.options)) {
    result.options = (result.options as unknown[]).map(normalizeOption);
  }

  return result as FormQuestion;
}

function generateUniqueHeader(
  question: string,
  existingHeader: string | undefined,
  idx: number,
  used: Set<string>
): string {
  let header = existingHeader || slugify(question) || `q${idx + 1}`;
  let unique = header;
  let counter = 2;
  while (used.has(unique)) {
    unique = `${header}_${counter++}`;
  }
  used.add(unique);
  return unique;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeOption(opt: unknown): FormOption {
  if (typeof opt === "string" || typeof opt === "number") {
    return { label: String(opt) };
  }
  if (opt && typeof opt === "object" && "label" in opt) {
    const o = opt as { label?: unknown };
    return { ...opt, label: String(o.label ?? "") } as FormOption;
  }
  return { label: String(opt) };
}
