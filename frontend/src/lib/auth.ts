// lib/auth.ts
import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";

export const authOptions: NextAuthOptions = {
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials) return null;
        const { username, password } = credentials as Record<string, string>;
        if ((username === "demo" || username === "user") && password === "demo") {
          return {
            id: "1",
            name: "Demo User",
            email: "demo@example.com",
            username,
            createdAt: new Date().toISOString(),
          } as any;
        }
        return null;
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/auth" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.username = (user as any).username ?? user.name;
        token.createdAt = (user as any).createdAt;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).username = token.username as string;
        (session.user as any).createdAt = token.createdAt as string;
      }
      return session;
    },
  },
};
