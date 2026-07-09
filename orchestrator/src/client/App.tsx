/**
 * Main App component.
 */

import { Menu, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { CSSTransition, SwitchTransition } from "react-transition-group";

import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { AppSidebar } from "./components/AppSidebar";
import { AuthGuard } from "./components/AuthGuard";
import { OnboardingGate } from "./components/OnboardingGate";
import { SidebarProvider, useSidebar } from "./components/SidebarContext";

const AppSidebarWrapper: React.FC = () => {
  const { open, setOpen } = useSidebar();
  return <AppSidebar open={open} onClose={() => setOpen(false)} />;
};

const MobileSidebarToggle: React.FC = () => {
  const { setOpen } = useSidebar();
  const location = useLocation();
  const isHidden =
    location.pathname === "/sign-in" ||
    location.pathname === "/onboarding" ||
    location.pathname === "/offline";

  if (isHidden) return null;

  return (
    <div className="sticky top-0 z-20 flex items-center gap-2 border-b bg-card px-4 py-2 lg:hidden">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <span className="text-sm font-semibold">JobOps</span>
    </div>
  );
};

import { useAnalyticsIdentity } from "./hooks/useAnalyticsIdentity";
import { useDemoInfo } from "./hooks/useDemoInfo";
import { setAuthNavigator } from "./lib/auth-navigation";
import { AdminClientEditPage } from "./pages/admin/AdminClientEditPage";
import { AdminClientNewPage } from "./pages/admin/AdminClientNewPage";
import { AdminClientsPage } from "./pages/admin/AdminClientsPage";
import { AdminOverviewPage } from "./pages/admin/AdminOverviewPage";
import { AdminWorkersPage } from "./pages/admin/AdminWorkersPage";
import { AdminWorkLogPage } from "./pages/admin/AdminWorkLogPage";
import { WorkerClientDashboardPage } from "./pages/agency/WorkerClientDashboardPage";
import { WorkerClientsPage } from "./pages/agency/WorkerClientsPage";
import { MyJobDetailPage } from "./pages/client/MyJobDetailPage";
import { MyJobsPage } from "./pages/client/MyJobsPage";
import { DesignResumePage } from "./pages/DesignResumePage";
import { GmailOauthCallbackPage } from "./pages/GmailOauthCallbackPage";
import { HomePage } from "./pages/HomePage";
import { JobPage } from "./pages/JobPage";
import { OfflinePage } from "./pages/OfflinePage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { OrchestratorPage } from "./pages/OrchestratorPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SignInPage } from "./pages/SignInPage";
import { TracerLinksPage } from "./pages/TracerLinksPage";
import { TrackingInboxPage } from "./pages/TrackingInboxPage";
import { VisaSponsorsPage } from "./pages/VisaSponsorsPage";
import { WatchlistPage } from "./pages/WatchlistPage";

/** Backwards-compatibility redirects: old URL paths -> new URL paths */
const REDIRECTS: Array<{ from: string; to: string }> = [
  { from: "/", to: "/jobs/ready" },
  { from: "/home", to: "/overview" },
  { from: "/ready", to: "/jobs/ready" },
  { from: "/ready/:jobId", to: "/jobs/ready/:jobId" },
  { from: "/discovered", to: "/jobs/discovered" },
  { from: "/discovered/:jobId", to: "/jobs/discovered/:jobId" },
  { from: "/applied", to: "/jobs/applied" },
  { from: "/applied/:jobId", to: "/jobs/applied/:jobId" },
  { from: "/in-progress", to: "/jobs/ready" },
  { from: "/in-progress/:jobId", to: "/jobs/ready" },
  { from: "/jobs/in_progress", to: "/jobs/ready" },
  { from: "/jobs/in_progress/:jobId", to: "/jobs/ready" },
  { from: "/applications/in-progress", to: "/jobs/ready" },
  { from: "/all", to: "/jobs/all" },
  { from: "/all/:jobId", to: "/jobs/all/:jobId" },
];

const DEMO_WAITLIST_BANNER_DISMISSED_KEY = "jobops.demoWaitlistBannerDismissed";

export const App: React.FC = () => {
  useAnalyticsIdentity();
  const location = useLocation();
  const navigate = useNavigate();
  const nodeRef = useRef<HTMLDivElement>(null);
  const isSignInPage = location.pathname === "/sign-in";
  const isChromeless =
    isSignInPage ||
    location.pathname === "/onboarding" ||
    location.pathname === "/offline";
  const demoInfo = useDemoInfo({ enabled: !isSignInPage });
  const showDemoBanners = !isSignInPage && demoInfo?.demoMode;
  const [demoWaitlistBannerDismissed, setDemoWaitlistBannerDismissed] =
    useState(() => {
      try {
        return localStorage.getItem(DEMO_WAITLIST_BANNER_DISMISSED_KEY) === "1";
      } catch {
        return false;
      }
    });

  // Determine a stable key for transitions to avoid unnecessary unmounts when switching sub-tabs
  const pageKey = React.useMemo(() => {
    const firstSegment = location.pathname.split("/")[1] || "jobs";
    if (firstSegment === "jobs") {
      return "orchestrator";
    }
    return firstSegment;
  }, [location.pathname]);

  useEffect(() => {
    setAuthNavigator((nextPath) => {
      const search = new URLSearchParams();
      if (
        nextPath &&
        nextPath !== "/sign-in" &&
        !nextPath.startsWith("/sign-in?")
      ) {
        search.set("next", nextPath);
      }
      navigate(`/sign-in${search.toString() ? `?${search.toString()}` : ""}`, {
        replace: true,
      });
    });

    return () => {
      setAuthNavigator(null);
    };
  }, [navigate]);

  const routes = (
    <AppErrorBoundary>
      <Routes location={location}>
        {/* Backwards-compatibility redirects */}
        {REDIRECTS.map(({ from, to }) => (
          <Route
            key={from}
            path={from}
            element={<Navigate to={to} replace />}
          />
        ))}

        {/* Application routes */}
        <Route path="/overview" element={<HomePage />} />
        <Route
          path="/oauth/gmail/callback"
          element={<GmailOauthCallbackPage />}
        />
        <Route path="/job/:id" element={<JobPage />} />
        <Route path="/job/:id/:view" element={<JobPage />} />
        <Route
          path="/design-resume"
          element={
            <AuthGuard requireNonClientRole>
              <DesignResumePage />
            </AuthGuard>
          }
        />
        <Route
          path="/design-resume/:section"
          element={
            <AuthGuard requireNonClientRole>
              <DesignResumePage />
            </AuthGuard>
          }
        />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/offline" element={<OfflinePage />} />
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route
          path="/tracer-links"
          element={
            <AuthGuard requireNonClientRole>
              <TracerLinksPage />
            </AuthGuard>
          }
        />
        <Route
          path="/visa-sponsors"
          element={
            <AuthGuard requiredRole="admin">
              <VisaSponsorsPage />
            </AuthGuard>
          }
        />
        <Route
          path="/tracking-inbox"
          element={
            <AuthGuard requiredRole="admin">
              <TrackingInboxPage />
            </AuthGuard>
          }
        />
        <Route
          path="/watchlist"
          element={
            <AuthGuard requireNonClientRole>
              <WatchlistPage />
            </AuthGuard>
          }
        />
        <Route
          path="/agency/clients"
          element={
            <AuthGuard>
              <WorkerClientsPage />
            </AuthGuard>
          }
        />
        <Route
          path="/agency/clients/:id"
          element={
            <AuthGuard>
              <WorkerClientDashboardPage />
            </AuthGuard>
          }
        />
        <Route
          path="/admin"
          element={
            <AuthGuard requiredRole="admin">
              <AdminOverviewPage />
            </AuthGuard>
          }
        />
        <Route
          path="/admin/clients"
          element={
            <AuthGuard requiredRole="admin">
              <AdminClientsPage />
            </AuthGuard>
          }
        />
        <Route
          path="/admin/clients/new"
          element={
            <AuthGuard requiredRole="admin">
              <AdminClientNewPage />
            </AuthGuard>
          }
        />
        <Route
          path="/admin/clients/:id"
          element={
            <AuthGuard requiredRole="admin">
              <AdminClientEditPage />
            </AuthGuard>
          }
        />
        <Route
          path="/admin/workers"
          element={
            <AuthGuard requiredRole="admin">
              <AdminWorkersPage />
            </AuthGuard>
          }
        />
        <Route
          path="/admin/work-log"
          element={
            <AuthGuard requiredRole="admin">
              <AdminWorkLogPage />
            </AuthGuard>
          }
        />
        <Route
          path="/my-jobs"
          element={
            <AuthGuard requiredRole="client">
              <MyJobsPage />
            </AuthGuard>
          }
        />
        <Route
          path="/my-jobs/:id"
          element={
            <AuthGuard requiredRole="client">
              <MyJobDetailPage />
            </AuthGuard>
          }
        />
        <Route path="/jobs/:tab" element={<OrchestratorPage />} />
        <Route path="/jobs/:tab/:jobId" element={<OrchestratorPage />} />
      </Routes>
    </AppErrorBoundary>
  );

  // Chromeless routes (sign-in, onboarding, offline) render full-screen
  // without the sidebar, mobile toggle, or left margin so they center correctly.
  if (isChromeless) {
    return (
      <SidebarProvider>
        <OnboardingGate />
        {routes}
        <Toaster position="bottom-right" richColors closeButton />
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <OnboardingGate />
      <AppSidebarWrapper />
      <div className="lg:ml-64">
        <MobileSidebarToggle />
        {showDemoBanners && (
          <div className="sticky top-0 z-50 w-full border-b border-amber-400/50 bg-amber-500/20 px-4 py-2 text-xs text-amber-100 shadow-sm backdrop-blur">
            <div className="mx-auto flex items-center justify-center gap-3">
              <p className="flex-1 text-center">
                <span className="font-medium">
                  Demo mode: integrations are simulated and data resets every{" "}
                  {demoInfo.resetCadenceHours} hours.
                </span>
                {!demoWaitlistBannerDismissed && (
                  <>
                    {" "}
                    This is a read-only demo. Want JobOps without the Docker
                    setup?{" "}
                    <a
                      className="font-semibold underline underline-offset-2 hover:text-amber-50"
                      href="https://try.jobops.app?utm_source=demo&utm_medium=banner&utm_campaign=waitlist"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Join the waitlist.
                    </a>
                  </>
                )}
              </p>
              {!demoWaitlistBannerDismissed && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 rounded-full text-amber-100 hover:bg-amber-400/20 hover:text-amber-50"
                  onClick={() => {
                    setDemoWaitlistBannerDismissed(true);
                    try {
                      localStorage.setItem(
                        DEMO_WAITLIST_BANNER_DISMISSED_KEY,
                        "1",
                      );
                    } catch {
                      // Ignore storage errors in restricted browser contexts.
                    }
                  }}
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Dismiss demo waitlist banner</span>
                </Button>
              )}
            </div>
          </div>
        )}
        <div>
          <SwitchTransition mode="out-in">
            <CSSTransition
              key={pageKey}
              nodeRef={nodeRef}
              timeout={100}
              classNames="page"
              unmountOnExit
            >
              <div ref={nodeRef}>{routes}</div>
            </CSSTransition>
          </SwitchTransition>
        </div>
      </div>

      <Toaster position="bottom-right" richColors closeButton />
    </SidebarProvider>
  );
};
