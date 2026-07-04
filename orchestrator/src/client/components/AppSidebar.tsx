import { logout } from "@client/api";
import { LogOut, X } from "lucide-react";
import { getUsernameFromToken } from "@client/lib/jwt";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  loadRememberedAuthUsers,
  type RememberedAuthUser,
} from "../lib/remembered-auth-users";
import { getNavLinks, isNavActive } from "./navigation";

export const AppSidebar: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [rememberedUsers, setRememberedUsers] = useState<RememberedAuthUser[]>(
    () => loadRememberedAuthUsers(),
  );

  useEffect(() => {
    setRememberedUsers(loadRememberedAuthUsers());
  }, []);

  const handleNav = (to: string) => {
    if (isNavActive(location.pathname, to)) return;
    navigate(to);
    onClose();
  };

  const handleSignOut = async () => {
    await logout();
  };

  const navLinks = getNavLinks();
  const hidden = location.pathname === "/sign-in" || location.pathname === "/onboarding" || location.pathname === "/offline";

  const username = getUsernameFromToken();

  if (hidden) return null;

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 border-r bg-card transition-transform duration-200 flex flex-col",
          "lg:translate-x-0 lg:z-30",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between border-b px-4">
          <span className="font-semibold text-sm">JobOps</span>
          {username && <span className="text-xs text-muted-foreground truncate ml-2">{username}</span>}
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
          {navLinks.map(({ to, label, icon: NavIcon, activePaths }) => (
            <button
              key={to}
              type="button"
              onClick={() => handleNav(to)}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground text-left",
                isNavActive(location.pathname, to, activePaths)
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground",
              )}
            >
              <NavIcon className="h-4 w-4 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </nav>
        <div className="border-t p-3 space-y-2">
          <Button variant="ghost" size="sm" className="w-full justify-start text-xs text-muted-foreground" onClick={handleSignOut}>
            <LogOut className="h-3.5 w-3.5 mr-2" />
            Sign out
          </Button>
        </div>
      </aside>
    </>
  );
};
