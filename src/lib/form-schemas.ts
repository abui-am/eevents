import { z } from "zod";
import { loginSchema, signupSchema, hostInputSchema, eventInputSchema } from "./validation";

function uploadSchema(field: string, types: readonly string[], maxBytes: number, help: string) {
  return z.object({ [field]: z.custom<FileList>((value) =>
    typeof value === "object" && value !== null && "length" in value && "item" in value,
    "Choose a file.",
  ).refine((files) => files.length === 1, "Choose one file.")
    .refine((files) => !files.length || (files[0].size > 0 && files[0].size <= maxBytes), help)
    .refine((files) => !files.length || types.includes(files[0].type), help) });
}

// Browser inputs remain strings/FileLists; server actions independently parse FormData.
export const formSchemas: Record<string, z.ZodType<Record<string, unknown>, Record<string, unknown>>> = {
  login: loginSchema,
  signup: signupSchema,
  event: eventInputSchema,
  host: hostInputSchema.omit({ avatarKey: true }),
  image: uploadSchema("image", ["image/jpeg", "image/png", "image/webp"], 2 * 1024 * 1024, "Choose a JPEG, PNG, or WebP image up to 2 MiB."),
  certificate: uploadSchema("certificate", ["application/pdf"], 5 * 1024 * 1024, "Choose a PDF up to 5 MB."),
  search: z.object({ q: z.string().trim().max(100, "Use at most 100 characters.") }),
};
export type FormSchemaName = "login" | "signup" | "event" | "host" | "image" | "certificate" | "search";
