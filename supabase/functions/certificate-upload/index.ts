// Deploy this retirement response when upgrading an existing installation.
// Old PDF objects remain private and downloadable through the application.
Deno.serve(() => new Response("PDF uploads are retired. Certificates are generated after the final onsite scan.", {
  status: 410,
  headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
}));
