export const EVENT_MEDIA_ERROR_MESSAGES = {
  invalid_input: "Use a JPEG, PNG, or WebP image up to 2 MB.",
  output_too_large:
    "That image is still over 1 MB after processing. The current image was kept.",
  origin_rejected: "The upload could not be verified. Reload the page and try again.",
  event_not_found: "That event could not be found.",
  host_not_found: "That host could not be found for this event.",
  storage_unavailable: "Image storage is unavailable. The current image was kept.",
  conflict: "The image changed while you were saving. Reload and try again.",
  cleanup_failed:
    "The image reference was saved, but an unused file could not be deleted.",
  unavailable: "We could not save this image right now. The current image was kept.",
} as const;

export type EventMediaErrorCode = keyof typeof EVENT_MEDIA_ERROR_MESSAGES;

export class EventMediaError extends Error {
  constructor(readonly code: EventMediaErrorCode) {
    super(code);
    this.name = "EventMediaError";
  }
}
