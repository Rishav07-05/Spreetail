import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth as useClerkAuth, useUser as useClerkUser, ClerkProvider } from "@clerk/clerk-react";

// Mock users for development/demo mode
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  imageUrl?: string;
}

export const MOCK_USERS: UserProfile[] = [
  { id: "usr_aisha", name: "Aisha", email: "aisha@example.com", imageUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Aisha" },
  { id: "usr_rohan", name: "Rohan", email: "rohan@example.com", imageUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Rohan" },
  { id: "usr_priya", name: "Priya", email: "priya@example.com", imageUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Priya" },
  { id: "usr_meera", name: "Meera", email: "meera@example.com", imageUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Meera" },
  { id: "usr_sam", name: "Sam", email: "sam@example.com", imageUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sam" },
];

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  isMock: boolean;
  signOut: () => Promise<void>;
  signInAs: (userId: string) => void;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Configuration check for Clerk publishable key
const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function InnerAuthProvider({ children }: { children: React.ReactNode }) {
  const isClerkAvailable = !!CLERK_PUBLISHABLE_KEY;

  // Real Clerk Hooks (will only work/be called if Clerk is enabled)
  let clerkAuth: any = null;
  let clerkUser: any = null;

  try {
    if (isClerkAvailable) {
      clerkAuth = useClerkAuth();
      clerkUser = useClerkUser();
    }
  } catch (e) {
    console.warn("Clerk context error, falling back to mock authentication.", e);
  }

  // Mock State
  const [mockUser, setMockUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem("mock_user");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return MOCK_USERS[0]; // Default to Aisha for testing
  });

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate initial loading state
    const timer = setTimeout(() => setIsLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const signInAs = (userId: string) => {
    const found = MOCK_USERS.find((u) => u.id === userId);
    if (found) {
      setMockUser(found);
      localStorage.setItem("mock_user", JSON.stringify(found));
      // Reload page to reset queries/states
      window.location.reload();
    }
  };

  const signOutMock = async () => {
    setMockUser(null);
    localStorage.removeItem("mock_user");
    window.location.reload();
  };

  // Resolve active profile & state
  const activeUser: UserProfile | null = isClerkAvailable && clerkUser?.isSignedIn && clerkUser.user
    ? {
        id: clerkUser.user.id,
        name: clerkUser.user.fullName || clerkUser.user.firstName || "Clerk User",
        email: clerkUser.user.primaryEmailAddress?.emailAddress || "",
        imageUrl: clerkUser.user.imageUrl,
      }
    : mockUser;

  const activeLoading = isClerkAvailable && clerkAuth
    ? !clerkAuth.isLoaded || !clerkUser.isLoaded
    : isLoading;

  const getActiveToken = async (): Promise<string | null> => {
    if (isClerkAvailable && clerkAuth?.isSignedIn) {
      return clerkAuth.getToken();
    }
    // Return mock token representing active mock user
    return activeUser ? `mock-token-${activeUser.id}` : null;
  };

  const handleSignOut = async () => {
    if (isClerkAvailable && clerkAuth?.isSignedIn) {
      await clerkAuth.signOut();
    } else {
      await signOutMock();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user: activeUser,
        isLoading: activeLoading,
        isMock: !isClerkAvailable || !clerkAuth?.isSignedIn,
        signOut: handleSignOut,
        signInAs,
        getToken: getActiveToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (CLERK_PUBLISHABLE_KEY) {
    return (
      <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
        <InnerAuthProvider>{children}</InnerAuthProvider>
      </ClerkProvider>
    );
  }

  // Fallback direct rendering for mock mode
  return <InnerAuthProvider>{children}</InnerAuthProvider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
