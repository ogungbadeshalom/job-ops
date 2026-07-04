import { hasAuthenticatedSession } from "@/client/api/auth-session";
import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

interface AuthGuardProps {
  children: React.ReactNode;
  requiredRole?: "admin" | "worker" | "client";
}

export const AuthGuard: React.FC<AuthGuardProps> = ({
  children,
  requiredRole,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const isSignedIn = hasAuthenticatedSession();

  useEffect(() => {
    if (!isSignedIn) {
      const next = encodeURIComponent(
        location.pathname + location.search + location.hash,
      );
      navigate(`/sign-in?next=${next}`, { replace: true });
    }
  }, [isSignedIn, navigate, location]);

  if (!isSignedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Checking authentication...</p>
      </div>
    );
  }

  return <>{children}</>;
};
