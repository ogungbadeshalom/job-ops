import { getRoleFromToken, isAdminFromToken } from "@client/lib/jwt";
import {
  Building2,
  ClipboardList,
  Columns3,
  Home,
  Inbox,
  LayoutDashboard,
  Settings,
  UserCog,
  Users,
} from "lucide-react";

export type NavLink = {
  to: string;
  label: string;
  icon: typeof Home;
  activePaths?: string[];
};

const WORKER_NAV: NavLink[] = [
  {
    to: "/jobs/ready",
    label: "Jobs",
    icon: LayoutDashboard,
    activePaths: ["/jobs/ready", "/jobs/discovered", "/jobs/applied"],
  },
  {
    to: "/applications/in-progress",
    label: "Pipeline Board",
    icon: Columns3,
    activePaths: ["/applications/in-progress"],
  },
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
    to: "/admin",
    label: "Overview",
    icon: Home,
    activePaths: [],
  },
  {
    to: "/admin/work-log",
    label: "Work Log",
    icon: ClipboardList,
    activePaths: ["/admin/work-log"],
  },
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
  { to: "/settings", label: "Settings", icon: Settings },
];

export function getNavLinks(): NavLink[] {
  const role = getRoleFromToken();
  const isAdmin = isAdminFromToken();

  if (role === "client") {
    return CLIENT_NAV;
  }

  const settingsLabel = isAdmin ? "Settings" : "Account";

  if (isAdmin) {
    return [
      ...ADMIN_NAV,
      {
        to: "/jobs/ready",
        label: "Jobs",
        icon: LayoutDashboard,
        activePaths: ["/jobs/ready", "/jobs/discovered", "/jobs/applied"],
      },
      {
        to: "/applications/in-progress",
        label: "Pipeline Board",
        icon: Columns3,
        activePaths: ["/applications/in-progress"],
      },
      { to: "/tracking-inbox", label: "Tracking Inbox", icon: Inbox },
      { to: "/settings", label: settingsLabel, icon: Settings },
    ];
  }

  // Workers (and members)
  return [
    ...AGENCY_NAV,
    ...WORKER_NAV,
    { to: "/settings", label: settingsLabel, icon: Settings },
  ];
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
