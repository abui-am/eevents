export function certificatePath(token: string): string {
  return `/certificates/${token}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

/** A complete immutable document, with no scripts, external fonts or asset URLs. */
export function renderCertificate(input: {
  id: string; participantName: string; eventTitle: string; organizerName: string;
  startsAt: Date; endsAt: Date; issuedAt: Date;
}): string {
  const date = (value: Date) => escapeHtml(new Intl.DateTimeFormat("en-GB", {
    dateStyle: "long", timeStyle: "short", timeZone: "UTC",
  }).format(value));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer"><title>Participation certificate</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#eeeae3;color:#20241f;font-family:Georgia,'Times New Roman',serif;line-height:1.5;padding:clamp(16px,4vw,48px)}main{max-width:1100px;margin:auto;background:#fffdf7;border:1px solid #777c68;padding:clamp(24px,6vw,80px);text-align:center;overflow-wrap:anywhere}header{border-bottom:1px solid #b6b8a5;padding-bottom:24px}.eyebrow{font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:.14em;font-size:12px;color:#515943}h1{font-size:clamp(32px,5vw,60px);font-weight:normal;line-height:1.15;margin:12px 0}.name{font-size:clamp(28px,4vw,48px);line-height:1.2;margin:20px 0}.event{font-size:clamp(22px,3vw,32px);margin:16px 0}section{padding:24px 0}footer{border-top:1px solid #b6b8a5;padding-top:24px;display:flex;justify-content:space-between;gap:24px;text-align:left;font-family:Arial,sans-serif;font-size:14px}footer p{margin:0}.hint{font-family:Arial,sans-serif;text-align:center;font-size:14px;max-width:1100px;margin:20px auto}@media(max-width:600px){footer{flex-direction:column}}@page{size:A4 landscape;margin:12mm}@media print{body{background:white;padding:0}main{max-width:none;padding:12mm;break-inside:avoid}.hint{display:none}h1{font-size:36pt}.name{font-size:28pt}.event{font-size:22pt}footer{flex-direction:row}section{padding:12px 0}}
</style></head><body><main aria-labelledby="certificate-title"><header><p class="eyebrow">eevents · Verified participation</p><h1 id="certificate-title">Certificate of participation</h1></header><section><p>This certificate is presented to</p><p class="name">${escapeHtml(input.participantName)}</p><p>for attending and remaining through the end of</p><h2 class="event">${escapeHtml(input.eventTitle)}</h2><p>${date(input.startsAt)} – ${date(input.endsAt)} UTC</p><p>End presence verified by the event administrator.</p></section><footer><div><p>Issued by</p><p><strong>${escapeHtml(input.organizerName)}</strong></p></div><div><p>Issued ${date(input.issuedAt)} UTC</p><p>Certificate ID: ${escapeHtml(input.id)}</p></div></footer></main><p class="hint">Keep this link to open your certificate later. Use your browser’s Print command to print or save as PDF.</p></body></html>`;
}
