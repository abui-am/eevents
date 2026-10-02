import { z } from "zod";
import { isValidTimeZone } from "./time-zone";
import { localDateTimeToDate, type ScheduleReference } from "./zoned-schedule";

const passwordByteLimit = (value: string) =>
  new TextEncoder().encode(value).byteLength <= 72;

export const signupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(100, "Use at most 100 characters."),
  email: z.string().trim().toLowerCase().pipe(z.email({ error: "Enter a valid email address." }).max(320, "Use at most 320 characters.")),
  password: z
    .string()
    .min(12, "Use at least 12 characters.")
    .max(72, "Use at most 72 characters.")
    .refine(passwordByteLimit, "Password must be at most 72 UTF-8 bytes"),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email({ error: "Enter a valid email address." }).max(320, "Use at most 320 characters.")),
  password: z
    .string()
    .min(1, "Enter your password.")
    .max(72, "Use at most 72 characters.")
    .refine(passwordByteLimit, "Password must be at most 72 UTF-8 bytes"),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export const EVENT_CONTENT_LIMITS = {
  coverKey: 300,
  venueName: 160,
  venueAddress: 300,
  mapUrl: 1000,
  hostName: 100,
  biography: 500,
  publicEmail: 320,
  avatarKey: 300,
  maxHosts: 10,
} as const;

const URI_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.length > 0;
  } catch {
    return false;
  }
}

function isStoredObjectKey(value: string): boolean {
  return !URI_SCHEME.test(value) && !value.startsWith("//") && !/\s/u.test(value);
}

function blankableText(max: number) {
  return z.union([
    z
      .string()
      .trim()
      .max(max, `Use at most ${max} characters.`)
      .transform((value) => (value.length === 0 ? null : value)),
    z.null(),
  ]);
}

const httpsMapUrlText = z
  .string()
  .trim()
  .max(EVENT_CONTENT_LIMITS.mapUrl, "Use at most 1,000 characters.")
  .refine(
    (value) => value.length === 0 || isHttpsUrl(value),
    "Enter an HTTPS map link.",
  )
  .transform((value) => (value.length === 0 ? null : value));

/** Empty or null clears the link. Only https URLs with a host are stored. */
export const mapUrlValueSchema = z.union([httpsMapUrlText, z.null()]);

const publicEmailText = z
  .string()
  .trim()
  .toLowerCase()
  .max(EVENT_CONTENT_LIMITS.publicEmail, "Use at most 320 characters.")
  .refine(
    (value) => value.length === 0 || z.email().safeParse(value).success,
    "Enter a valid email address.",
  )
  .transform((value) => (value.length === 0 ? null : value));

/** Empty or null clears the address. This is never copied from a user account. */
export const publicEmailValueSchema = z.union([publicEmailText, z.null()]);

const storedObjectKeyText = z
  .string()
  .trim()
  .max(EVENT_CONTENT_LIMITS.avatarKey)
  .refine(
    (value) => value.length === 0 || isStoredObjectKey(value),
    "Store an object key.",
  )
  .transform((value) => (value.length === 0 ? null : value));

/** Empty or null clears the key. Signed and remote URLs are rejected. */
export const storedObjectKeySchema = z.union([storedObjectKeyText, z.null()]).optional();

export const eventVenueSchema = z.object({
  venueName: blankableText(EVENT_CONTENT_LIMITS.venueName).optional(),
  venueAddress: blankableText(EVENT_CONTENT_LIMITS.venueAddress).optional(),
  mapUrl: mapUrlValueSchema.optional(),
});

export const hostInputSchema = z.object({
  name: z.string().trim().min(1, "Enter the host’s name.").max(EVENT_CONTENT_LIMITS.hostName, "Use at most 100 characters."),
  biography: blankableText(EVENT_CONTENT_LIMITS.biography),
  publicEmail: publicEmailValueSchema,
  avatarKey: storedObjectKeySchema,
});

export type EventVenueInput = z.infer<typeof eventVenueSchema>;
export type HostInput = z.infer<typeof hostInputSchema>;

const dateTimeLocalSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter a valid date and time.")
  .refine((value) => {
    const date = new Date(`${value}:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 16) === value;
  }, "Enter a real date and time.");

export function createEventInputSchema(reference?: ScheduleReference) {
  return z
  .object({
    title: z.string().trim().min(3, "Use at least 3 characters for the title.").max(160, "Use at most 160 characters."),
    description: z.string().trim().min(1, "Enter a description.").max(10_000, "Use at most 10,000 characters."),
    location: z.string().trim().max(200, "Use at most 200 characters.").transform((value) => value || null),
    startsAt: dateTimeLocalSchema,
    endsAt: dateTimeLocalSchema,
    timeZone: z.string().max(100, "Choose a valid timezone.").refine(isValidTimeZone, "Choose a valid timezone.").default("UTC"),
    capacity: z.coerce.number().int("Enter a whole number.").positive("Enter at least 1 place.").max(100_000, "Use at most 100,000 places."),
    status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED"]),
  })
  .extend(eventVenueSchema.shape)
  .transform((input, context) => {
    const dates: Record<"startsAt" | "endsAt", Date> = { startsAt: new Date(NaN), endsAt: new Date(NaN) };
    for (const field of ["startsAt", "endsAt"] as const) {
      try {
        dates[field] = localDateTimeToDate(input[field], input.timeZone, reference?.[field]);
      } catch {
        context.addIssue({ code: "custom", path: [field], message: "This time is skipped or repeated when clocks change. Choose another time, or enter the intended time in UTC." });
      }
    }
    return { ...input, ...dates };
  })
  .refine((input) => input.endsAt > input.startsAt, {
    path: ["endsAt"],
    message: "End time must be later than start time.",
  });
}

export const eventInputSchema = createEventInputSchema();
