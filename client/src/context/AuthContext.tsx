import React, { createContext, useContext, useEffect, useState } from "react";
import { User, AthleteProfile } from "@shared/types";
import api from "../lib/api";

interface AuthContextValue {
  user: User | null;
  athlete: AthleteProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  athlete: null,
  loading: true,
  login: async () => null,
  logout: async () => {},
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [athlete, setAthlete] = useState<AthleteProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const res = await api.get<{ user: User; athlete: AthleteProfile | null }>("/auth/me");
    if (res.ok) {
      setUser(res.data.user);
      setAthlete(res.data.athlete);
    } else {
      setUser(null);
      setAthlete(null);
    }
  };

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string): Promise<string | null> => {
    const res = await api.post<{ user: User; athlete: AthleteProfile | null }>("/auth/login", {
      email,
      password,
    });
    if (res.ok) {
      setUser(res.data.user);
      setAthlete(res.data.athlete);
      return null;
    }
    return res.error || "Login failed";
  };

  const logout = async () => {
    await api.post("/auth/logout");
    setUser(null);
    setAthlete(null);
  };

  return (
    <AuthContext.Provider value={{ user, athlete, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
