"use client";

import { trpc } from "@/lib/trpc/client";
import { type User } from "@supabase/supabase-js";
import { createContext, useContext } from "react";

type AuthContextType = {
  user: User | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { data: authData, isLoading } = trpc.auth.getUser.useQuery();

  const user = authData?.user || null;
  const loading = isLoading;

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
