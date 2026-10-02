import {
  EVENT_MEDIA_ERROR_MESSAGES,
  type EventMediaErrorCode,
} from "@/lib/event-media-error";
import { EVENT_CONTENT_LIMITS } from "@/lib/validation";
import { ADMIN_ERROR_MESSAGES } from "@/services/admin-event-service";
import { EVENT_HOST_ERROR_MESSAGES } from "@/services/event-host-service";

const MAP_URL_ERROR = "Enter an HTTPS map link, or leave the map URL blank.";

const HOST_FORM_ERRORS = {
  invalid_name: "Enter a host name up to 100 characters.",
  invalid_biography: "Biography must be 500 characters or fewer.",
  invalid_email: "Enter a valid email address, or leave public email blank.",
} as const;

const EVENT_FORM_LIMITS = {
  title: 161,
  description: 10_001,
  location: 201,
  startsAt: 16,
  endsAt: 16,
  timeZone: 100,
  capacity: 8,
  status: 20,
  venueName: EVENT_CONTENT_LIMITS.venueName + 1,
  venueAddress: EVENT_CONTENT_LIMITS.venueAddress + 1,
  mapUrl: EVENT_CONTENT_LIMITS.mapUrl + 1,
} as const;

const DESCRIPTION_REDIRECT_LIMIT = 1_200;

const HOST_FIELD_LIMITS = {
  name: EVENT_CONTENT_LIMITS.hostName + 1,
  biography: EVENT_CONTENT_LIMITS.biography + 1,
  publicEmail: EVENT_CONTENT_LIMITS.publicEmail + 1,
} as const;

type QueryValue = string | string[] | undefined;

export type EnteredEventFields = {
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  capacity: string;
  status: string;
  venueName: string;
  venueAddress: string;
  mapUrl: string;
};

export type EnteredHostFields = {
  name: string;
  biography: string;
  publicEmail: string;
};

export const BLANK_EVENT_FORM: EnteredEventFields = {
  title: "",
  description: "",
  location: "",
  startsAt: "",
  endsAt: "",
  timeZone: "UTC",
  capacity: "",
  status: "DRAFT",
  venueName: "",
  venueAddress: "",
  mapUrl: "",
};

function queryText(value: QueryValue, maxLength: number, fallback: string): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return fallback;
  return raw.slice(0, maxLength);
}

export function readPage(value: string | string[] | undefined): number {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function formatUtcDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

export function formatUtcInput(date: Date): string {
  return date.toISOString().slice(0, 16);
}

export function eventStatusLabel(status: string): string {
  if (status === "PUBLISHED") return "Published";
  if (status === "CANCELLED") return "Cancelled";
  return "Draft";
}

export function attendanceStateLabel(status: string): string {
  if (status === "ATTENDED") return "Attendance recorded";
  if (status === "NO_SHOW") return "Recorded as no-show";
  return "Attendance not recorded";
}

export function arrivalStateLabel(checkedInAt: Date | null): string {
  if (!checkedInAt) return "No arrival recorded";
  return `Arrival recorded ${formatUtcDateTime(checkedInAt)} UTC`;
}

export function certificateStateLabel(
  status: string,
  certificateKey: string | null,
  certificateUploadedAt: Date | null,
): string {
  if (certificateKey && certificateUploadedAt) return "Certificate issued";
  if (status === "ATTENDED") return "Certificate not issued yet";
  return "Not eligible for a certificate";
}

export function firstQueryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function adminErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  if (code === "map_url") return MAP_URL_ERROR;
  if (Object.hasOwn(ADMIN_ERROR_MESSAGES, code)) {
    return ADMIN_ERROR_MESSAGES[code as keyof typeof ADMIN_ERROR_MESSAGES];
  }
  return "We could not complete that request. Please try again.";
}

export function hostErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  if (Object.hasOwn(HOST_FORM_ERRORS, code)) {
    return HOST_FORM_ERRORS[code as keyof typeof HOST_FORM_ERRORS];
  }
  if (Object.hasOwn(EVENT_HOST_ERROR_MESSAGES, code)) {
    return EVENT_HOST_ERROR_MESSAGES[code as keyof typeof EVENT_HOST_ERROR_MESSAGES];
  }
  return "We could not save this host right now. Please try again.";
}

export function imageErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  if (Object.hasOwn(EVENT_MEDIA_ERROR_MESSAGES, code)) {
    return EVENT_MEDIA_ERROR_MESSAGES[code as EventMediaErrorCode];
  }
  return "We could not save this image right now. The current image was kept.";
}

export function enteredEventFields(
  error: string | undefined,
  query: Partial<Record<keyof EnteredEventFields, QueryValue>>,
  fallback: EnteredEventFields,
): EnteredEventFields {
  if (!error) return fallback;
  return {
    title: queryText(query.title, EVENT_FORM_LIMITS.title, fallback.title),
    description: queryText(query.description, EVENT_FORM_LIMITS.description, fallback.description),
    location: queryText(query.location, EVENT_FORM_LIMITS.location, fallback.location),
    startsAt: queryText(query.startsAt, EVENT_FORM_LIMITS.startsAt, fallback.startsAt),
    endsAt: queryText(query.endsAt, EVENT_FORM_LIMITS.endsAt, fallback.endsAt),
    timeZone: queryText(query.timeZone, EVENT_FORM_LIMITS.timeZone, fallback.timeZone),
    capacity: queryText(query.capacity, EVENT_FORM_LIMITS.capacity, fallback.capacity),
    status: queryText(query.status, EVENT_FORM_LIMITS.status, fallback.status),
    venueName: queryText(query.venueName, EVENT_FORM_LIMITS.venueName, fallback.venueName),
    venueAddress: queryText(
      query.venueAddress,
      EVENT_FORM_LIMITS.venueAddress,
      fallback.venueAddress,
    ),
    mapUrl: queryText(query.mapUrl, EVENT_FORM_LIMITS.mapUrl, fallback.mapUrl),
  };
}

export function eventErrorPath(pathname: string, errorCode: string, formData: FormData): string {
  const params = new URLSearchParams({ error: errorCode });
  for (const key of Object.keys(EVENT_FORM_LIMITS) as Array<keyof typeof EVENT_FORM_LIMITS>) {
    const raw = formData.get(key);
    if (typeof raw !== "string") continue;
    if (key === "description" && raw.length > DESCRIPTION_REDIRECT_LIMIT) continue;
    params.set(key, raw.slice(0, EVENT_FORM_LIMITS[key]));
  }
  return `${pathname}?${params.toString()}`;
}

export function enteredHostFields(
  error: string | undefined,
  query: Partial<Record<keyof EnteredHostFields, QueryValue>>,
  fallback: EnteredHostFields,
): EnteredHostFields {
  if (!error) return fallback;
  return {
    name: queryText(query.name, HOST_FIELD_LIMITS.name, fallback.name),
    biography: queryText(query.biography, HOST_FIELD_LIMITS.biography, fallback.biography),
    publicEmail: queryText(
      query.publicEmail,
      HOST_FIELD_LIMITS.publicEmail,
      fallback.publicEmail,
    ),
  };
}

export function hostErrorPath(
  pathname: string,
  errorCode: string,
  fields: EnteredHostFields,
): string {
  const params = new URLSearchParams({
    error: errorCode,
    name: fields.name.slice(0, HOST_FIELD_LIMITS.name),
    biography: fields.biography.slice(0, HOST_FIELD_LIMITS.biography),
    publicEmail: fields.publicEmail.slice(0, HOST_FIELD_LIMITS.publicEmail),
  });
  return `${pathname}?${params.toString()}`;
}

export function searchHref(
  basePath: string,
  options: { page?: number; status?: string; arrival?: string; query?: string; filters?: string },
): string {
  const params = new URLSearchParams();
  if (options.page && options.page > 1) params.set("page", String(options.page));
  if (options.status && options.status !== "ALL") params.set("status", options.status);
  if (options.arrival && options.arrival !== "ALL") params.set("arrival", options.arrival);
  if (options.query) params.set("q", options.query);
  if (options.filters) params.set("filters", options.filters);
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
