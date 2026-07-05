import { logout } from "@client/api";
import { ExternalLink, LogOut, Menu, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useVersionCheck } from "../hooks/useVersionCheck";
import {
  loadRememberedAuthUsers,
  type RememberedAuthUser,
} from "../lib/remembered-auth-users";
import { getNavLinks, isNavActive } from "./navigation";
import { Tip } from "./Tip";

const buildSignInPath = (username: string, nextPath: string): string => {
  const params = new URLSearchParams();
  params.set("user", username);
  if (
    nextPath &&
    nextPath !== "/sign-in" &&
    !nextPath.startsWith("/sign-in?")
  ) {
    params.set("next", nextPath);
  }
  return `/sign-in?${params.toString()}`;
};

export const DesktopSidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [rememberedUsers, setRememberedUsers] = useState<RememberedAuthUser[]>(
    () => loadRememberedAuthUsers(),
  );
  const { version, updateAvailable } = useVersionCheck();

  useEffect(() => {
    setRememberedUsers(loadRememberedAuthUsers());
  }, []);

  const handleNavClick = (to: string, activePaths?: string[]) => {
    if (isNavActive(location.pathname, to, activePaths)) return;
    navigate(to);
  };

  const handleRememberedUserClick = async (username: string) => {
    await logout({ redirect: false });
    navigate(buildSignInPath(username, location.pathname), { replace: true });
  };

  const handleSignOut = async () => {
    await logout();
  };

  const navLinks = getNavLinks();
  const isHidden =
    location.pathname === "/sign-in" ||
    location.pathname === "/onboarding" ||
    location.pathname === "/offline";

  if (isHidden) return null;

  return (
    <aside className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:w-60 lg:border-r lg:bg-card overflow-y-auto">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="h-8 w-8 rounded-lg border flex items-center justify-center bg-muted/30">
          <Menu className="h-4 w-4 text-muted-foreground" />
        </div>
        <span className="font-semibold text-sm">JobOps</span>
      </div>
      <nav className="flex-1 flex flex-col gap-1 p-3 overflow-y-auto">
        {navLinks.map(({ to, label, icon: NavIcon, activePaths }) => (
          <button
            key={to}
            type="button"
            onClick={() => handleNavClick(to, activePaths)}
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
      <div className="border-t p-3 space-y-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-full justify-start gap-2 px-2 text-xs"
            >
              <UserRound className="h-3.5 w-3.5" />
              <span>Account</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Remembered</DropdownMenuLabel>
            {rememberedUsers.length > 0 ? (
              rememberedUsers.map((user) => (
                <DropdownMenuItem
                  key={user.username}
                  onSelect={() => void handleRememberedUserClick(user.username)}
                  className="flex min-w-0 items-start gap-2"
                >
                  <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {user.displayName ?? user.username}
                    </span>
                    {user.displayName ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {user.username}
                      </span>
                    ) : null}
                  </span>
                </DropdownMenuItem>
              ))
            ) : (
              <DropdownMenuItem disabled>
                Sign in once to remember a username here.
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => void handleSignOut()}
              className="gap-2"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex flex-col items-start gap-2">
          <a
            href="https://github.com/DaKheera47/job-ops/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="truncate">Version {version}</span>
            {updateAvailable && (
              <Tip asChild content={<p>Update available</p>}>
                <span className="h-2 w-2 shrink-0 cursor-pointer rounded-full bg-emerald-500" />
              </Tip>
            )}
          </a>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              window.open("/docs", "_blank", "noopener,noreferrer")
            }
            className="h-7 gap-1.5 px-2 text-xs"
          >
            <span>Docs</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </aside>
  );
};
