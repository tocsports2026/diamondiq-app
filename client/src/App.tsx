import React from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import LoginPage from "./pages/LoginPage";
import ClientApp from "./layouts/ClientApp";
import AdminApp from "./layouts/AdminApp";

function AppRouter() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-bg-base">
        <div className="flex flex-col items-center gap-4">
          <div className="text-teal font-condensed text-2xl tracking-widest animate-pulse">
            DIAMONDIQ
          </div>
          <div className="text-text-secondary text-xs">Loading...</div>
        </div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  if (user.role === "osm_admin" || user.role === "osm_staff") {
    const path = window.location.pathname;
    if (path.startsWith("/admin")) return <AdminApp />;
    // Admin can view client side too — check hash
    return <AdminApp />;
  }

  return <ClientApp />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
