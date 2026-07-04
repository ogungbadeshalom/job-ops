import {
  Building2,
  Columns3,
  Eye,
  FilePenLine,
  Home,
  Inbox,
  LayoutDashboard,
  Link2,
  Settings,
  Shield,
  UserCog,
  Users,
} from "lucide-react";

export type NavLink = {
  to: string;
  label: string;
  icon: typeof Home;
  activePaths?: string[];
};

function decodePayload(token: string): Record<string, unknown> | null {
  try {
    const raw = token.split(".")[1];
    if (!raw) return null;
    const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const decoded = JSON.parse(atob(padded));
    return decoded && typeof decoded === "object" ? (decoded as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function getRoleFromToken(): string | null {
  const token = localStorage.getItem("jobops.authToken");
  if (!token) return null;
  const decoded = decodePayload(token);
  if (!decoded) return null;
  return typeof decoded.role === "string" ? decoded.role : null;
}

function isAdminFromToken(): boolean {
  const token = localStorage.getItem("jobops.authToken");
  if (!token) return false;
  const decoded = decodePayload(token);
  if (!decoded) return false;
  return decoded.isSystemAdmin === true;
}

const SHARED_NAV: NavLink[] = [
  { to: "/overview", label: "Overview", icon: Home },
  {
    to: "/jobs/ready",
    label: "Jobs",
    icon: LayoutDashboard,
    activePaths: [
      "/jobs/ready",
      "/jobs/discovered",
      "/jobs/applied",
      "/jobs/all",
    ],
  },
  {
    to: "/applications/in-progress",
    label: "In Progress",
    icon: Columns3,
    activePaths: ["/applications/in-progress"],
  },
  {
    to: "/design-resume",
    label: "Resume Studio",
    icon: FilePenLine,
    activePaths: ["/design-resume"],
  },
  { to: "/tracking-inbox", label: "Tracking Inbox", icon: Inbox },
];

const AGENCY_NAV: NavLink[] = [
  {
    to: "/agency/clients",
    label: "My Clients",
    icon: Users,
    activePaths: ["/agency/clients"],
  },
];

const ADMIN_NAV: NavLink[] = [
  {
    to: "/admin/clients",
    label: "Clients",
    icon: Building2,
    activePaths: ["/admin/clients"],
  },
  {
    to: "/admin/workers",
    label: "Workers",
    icon: UserCog,
    activePaths: ["/admin/workers"],
  },
];

const CLIENT_NAV: NavLink[] = [
  {
    to: "/my-jobs",
    label: "My Jobs",
    icon: LayoutDashboard,
    activePaths: ["/my-jobs"],
  },
];

export function getNavLinks(): NavLink[] {
  const role = getRoleFromToken();
  const isAdmin = isAdminFromToken();

  if (role === "client") {
    return CLIENT_NAV;
  }

  const links = [...SHARED_NAV];

  if (isAdmin) {
    links.push(...ADMIN_NAV);
  }

  if (role !== "client") {
    links.push(...AGENCY_NAV);
  }

  links.push(
    {
      to: "/tracer-links",
      label: "Tracer Links",
      icon: Link2,
      activePaths: ["/tracer-links"],
    },
    { to: "/visa-sponsors", label: "Visa Sponsors", icon: Shield },
    { to: "/watchlist", label: "Watchlist", icon: Eye },
    { to: "/settings", label: "Settings", icon: Settings },
  );

  return links;
}

export const NAV_LINKS: NavLink[] = getNavLinks();

export const isNavActive = (
  pathname: string,
  to: string,
  activePaths?: string[],
) => {
  if (pathname === to) return true;
  if (!activePaths) return false;
  return activePaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
};
