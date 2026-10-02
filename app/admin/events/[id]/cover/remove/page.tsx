import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { removeEventCoverAction } from "@app/actions/event-media";
import { RemoveImageConfirmation } from "@app/admin/events/remove-image-confirmation";
import { requireAdmin } from "@/lib/auth";
import { getAdminEvent } from "@/services/admin-event-service";

export const metadata: Metadata = { title: "Remove cover" };

type RemoveCoverPageProps = {
  params: Promise<{ id: string }>;
};

export default async function RemoveCoverPage({ params }: RemoveCoverPageProps) {
  const user = await requireAdmin();
  const { id } = await params;
  const event = await getAdminEvent(id);
  if (!event?.coverKey) notFound();

  const editHref = `/admin/events/${event.id}/edit`;
  return (
    <RemoveImageConfirmation
      user={user}
      backHref={editHref}
      backLabel="← Edit event"
      title="Remove cover"
      message={`The cover image for ${event.title} will be deleted.`}
      action={removeEventCoverAction}
      fields={[
        { name: "eventId", value: event.id },
        { name: "expectedKey", value: event.coverKey },
      ]}
      cancelHref={editHref}
      cancelLabel="Back to edit event"
      submitLabel="Delete cover"
    />
  );
}
