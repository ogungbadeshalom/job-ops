import type React from "react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { hasAuthenticatedSession } from "@/client/api/auth-session";
import { getRoleFromToken, isAdminFromToken } from "@/client/lib/jwt";

interface AuthGuardProps {
  children: React.ReactNode;
  requiredRole?: "admin" | "worker" | "client";
  requireNonClientRole?: boolean;
}

export const AuthGuard: React.FC<AuthGuardProps> = ({
  children,
  requiredRole,
  requireNonClientRole,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [checking, setChecking] = useState(true);

  const isSignedIn = hasAuthenticatedSession();

  useEffect(() => {
    if (!isSignedIn) {
      const next = encodeURIComponent(
        location.pathname + location.search + location.hash,
      );
      navigate(`/sign-in?next=${next}`, { replace: true });
      return;
    }

    if (!requiredRole && !requireNonClientRole) {
      setChecking(false);
      return;
    }

    if (requiredRole) {
      if (requiredRole === "admin") {
        if (!isAdminFromToken()) {
          navigate("/", { replace: true });
          return;
        }
      } else {
        const role = getRoleFromToken();
        if (role !== requiredRole) {
          navigate("/", { replace: true });
          return;
        }
      }
    }

    if (requireNonClientRole) {
      const role = getRoleFromToken();
      if (role === "client") {
        navigate("/", { replace: true });
        return;
      }
    }

    setChecking(false);
  }, [isSignedIn, requiredRole, requireNonClientRole, navigate, location]);

  if (!isSignedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Checking authentication...
        </p>
      </div>
    );
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Checking authorization...
        </p>
      </div>
    );
  }

  return <>{children}</>;
};
