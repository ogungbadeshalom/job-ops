import { useOnboardingStatus } from "@client/hooks/useOnboardingStatus";
import { isAdminFromToken } from "@client/lib/jwt";
import type React from "react";
import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { getAuthBootstrapStatus } from "@/client/api";
import { useSettings } from "@/client/hooks/useSettings";

export const OnboardingGate: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);

  useEffect(() => {
    const handleOffline = () => {
      navigate("/offline", { replace: true });
    };
    window.addEventListener("offline", handleOffline);
    return () => window.removeEventListener("offline", handleOffline);
  }, [navigate]);

  useEffect(() => {
    if (
      location.pathname === "/onboarding" ||
      location.pathname === "/sign-in" ||
      location.pathname === "/offline"
    ) {
      setSetupRequired(null);
      return;
    }

    let cancelled = false;
    setSetupRequired(null);

    void (async () => {
      try {
        const bootstrap = await getAuthBootstrapStatus();
        if (!cancelled) setSetupRequired(bootstrap.setupRequired);
      } catch {
        if (!cancelled) setSetupRequired(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  if (location.pathname === "/onboarding" && !navigator.onLine) {
    return <Navigate to="/offline" replace />;
  }

  if (
    location.pathname === "/onboarding" ||
    location.pathname === "/sign-in" ||
    location.pathname === "/offline"
  ) {
    return null;
  }

  if (setupRequired === null) {
    return null;
  }

  if (setupRequired) {
    return <Navigate to="/onboarding" replace />;
  }

  return <OnboardingRedirect />;
};

const OnboardingRedirect: React.FC = () => {
  const { error } = useSettings();
  const { checking, complete } = useOnboardingStatus();
  const isAdmin = isAdminFromToken();

  if (error) {
    if (!navigator.onLine) {
      return <Navigate to="/offline" replace />;
    }
    if (isAdmin) {
      return <Navigate to="/onboarding" replace />;
    }
    return null;
  }

  if (checking || complete) {
    return null;
  }

  if (isAdmin) {
    return <Navigate to="/onboarding" replace />;
  }

  return null;
};
