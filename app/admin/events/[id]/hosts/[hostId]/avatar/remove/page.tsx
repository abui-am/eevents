import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { removeHostAvatarAction } from "@app/actions/event-media";
import { RemoveImageConfirmation } from "@app/admin/events/remove-image-confirmation";
import { requireAdmin } from "@/lib/auth";
import { getAdminEvent } from "@/services/admin-event-service";

export const metadata: Metadata = { title: "Remove avatar" };

type RemoveAvatarPageProps = {
  params: Promise<{ id: string; hostId: string }>;
};

export default async function RemoveAvatarPage({ params }: RemoveAvatarPageProps) {
  const user = await requireAdmin();
  const { id, hostId } = await params;
  const event = await getAdminEvent(id);
  const host = event?.hosts.find((item) => item.id === hostId);
  if (!event || !host?.avatarKey) notFound();

  const editHref = `/admin/events/${event.id}/hosts/${host.id}`;
  return (
    <RemoveImageConfirmation
      user={user}
      backHref={editHref}
      backLabel="← Edit host"
      title="Remove avatar"
      message={`The avatar for ${host.name} will be deleted.`}
      action={removeHostAvatarAction}
      fields={[
        { name: "eventId", value: event.id },
        { name: "hostId", value: host.id },
        { name: "expectedKey", value: host.avatarKey },
      ]}
      cancelHref={editHref}
      cancelLabel="Back to edit host"
      submitLabel="Delete avatar"
    />
  );
}
