import {
  CalendarDaysIcon,
  ShieldCheckIcon,
  TicketIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { logOut } from "@app/actions/auth";
import type { AuthenticatedUser } from "@/lib/auth";

type SiteHeaderProps = {
  user: AuthenticatedUser | null;
  current?: "events" | "my" | "admin" | "login" | "signup";
};

function DestinationIcon({
  kind,
  size,
}: {
  kind: "events" | "my" | "admin";
  size: number;
}) {
  const iconProps = { "aria-hidden": true as const, width: size, height: size, className: "nav-icon" };
  if (kind === "events") return <CalendarDaysIcon {...iconProps} />;
  if (kind === "my") return <TicketIcon {...iconProps} />;
  return <ShieldCheckIcon {...iconProps} />;
}

function SectionLinks({ user, current, iconSize }: SiteHeaderProps & { iconSize: number }) {
  return (
    <>
      <Link href="/" aria-current={current === "events" ? "page" : undefined}>
        <DestinationIcon kind="events" size={iconSize} />
        Events
      </Link>
      {user ? (
        <Link href="/my" aria-current={current === "my" ? "page" : undefined}>
          <DestinationIcon kind="my" size={iconSize} />
          My events
        </Link>
      ) : null}
      {user?.role === "ADMIN" ? (
        <Link href="/admin" aria-current={current === "admin" ? "page" : undefined}>
          <DestinationIcon kind="admin" size={iconSize} />
          Admin
        </Link>
      ) : null}
    </>
  );
}

export function SiteHeader({ user, current }: SiteHeaderProps) {
  const showDock = current !== "login" && current !== "signup";

  return (
    <header className="site-header">
      <Link className="wordmark" href="/" aria-label="eevents home">
        eevents
      </Link>

      <nav className="site-nav" aria-label="Main">
        <SectionLinks user={user} current={current} iconSize={20} />
      </nav>

      <nav className="account-nav" aria-label="Account navigation">
        {user ? (
          <>
            <span className="account-name">{user.name}</span>
            <form action={logOut}>
              <button className="text-button" type="submit">
                Sign out
              </button>
            </form>
          </>
        ) : (
          <>
            <Link href="/login" aria-current={current === "login" ? "page" : undefined}>Log in</Link>
            <Link className="button button-small" href="/signup" aria-current={current === "signup" ? "page" : undefined}>
              Sign up
            </Link>
          </>
        )}
      </nav>

      {showDock ? (
        <nav className="site-dock" aria-label="Main">
          <SectionLinks user={user} current={current} iconSize={24} />
        </nav>
      ) : null}
    </header>
  );
}
