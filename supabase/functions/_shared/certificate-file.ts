export const MAX_CERTIFICATE_BYTES = 5 * 1024 * 1024;

const PDF_MAGIC = new TextEncoder().encode("%PDF-");

export function validateCertificatePdf(
  declaredSize: number,
  bytes: Uint8Array,
): "file_too_large" | "invalid_pdf" | null {
  if (!Number.isSafeInteger(declaredSize) || declaredSize < 0) {
    return "invalid_pdf";
  }
  if (declaredSize > MAX_CERTIFICATE_BYTES) return "file_too_large";
  if (
    declaredSize !== bytes.byteLength || bytes.byteLength < PDF_MAGIC.length
  ) {
    return "invalid_pdf";
  }
  if (!PDF_MAGIC.every((byte, index) => bytes[index] === byte)) {
    return "invalid_pdf";
  }
  return null;
}
