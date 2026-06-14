import { Request, Response, NextFunction } from "express";
import { createClerkClient } from "@clerk/backend";

export interface AuthenticatedRequest extends Request {
  auth?: {
    userId: string;
    email?: string;
    name?: string;
    isMock: boolean;
  };
}

const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkClient = clerkSecretKey ? createClerkClient({ secretKey: clerkSecretKey }) : null;

// Mock user mapping matching frontend profiles
const MOCK_USER_PROFILES: Record<string, { name: string; email: string }> = {
  usr_aisha: { name: "Aisha", email: "aisha@example.com" },
  usr_rohan: { name: "Rohan", email: "rohan@example.com" },
  usr_priya: { name: "Priya", email: "priya@example.com" },
  usr_meera: { name: "Meera", email: "meera@example.com" },
  usr_sam: { name: "Sam", email: "sam@example.com" },
};

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const token = authHeader.split(" ")[1];

  // 1. Check for Mock Token
  if (token.startsWith("mock-token-")) {
    const userId = token.replace("mock-token-", "");
    const profile = MOCK_USER_PROFILES[userId] || { name: "Demo User", email: `${userId}@example.com` };
    
    req.auth = {
      userId,
      email: profile.email,
      name: profile.name,
      isMock: true,
    };
    return next();
  }

  // 2. Real Clerk Token Verification
  if (!clerkClient) {
    res.status(401).json({
      error: "Clerk Authentication is not configured on this server, and no mock token was provided.",
    });
    return;
  }

  try {
    const requestState = await clerkClient.authenticateRequest(req, {
      jwtKey: process.env.CLERK_JWT_KEY,
      authorizedParties: process.env.CLERK_AUTHORIZED_PARTIES ? process.env.CLERK_AUTHORIZED_PARTIES.split(",") : undefined,
    });

    if (!requestState.isSignedIn) {
      res.status(401).json({ error: "Unauthorized session" });
      return;
    }

    const userId = requestState.toAuth().userId;
    
    // Fetch user details from Clerk if needed, or pass the userId along
    const userDetails = await clerkClient.users.getUser(userId);

    req.auth = {
      userId,
      email: userDetails.emailAddresses[0]?.emailAddress,
      name: userDetails.fullName || userDetails.firstName || "Clerk User",
      isMock: false,
    };
    next();
  } catch (error: any) {
    console.error("Clerk Authentication Error:", error);
    res.status(401).json({ error: "Failed to authenticate session token" });
  }
}
