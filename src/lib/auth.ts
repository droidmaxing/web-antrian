import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/modules/shared/rate-limit";
import { isGoogleLoginEnabled, readGoogleLoginCredentials } from "@/modules/platform/google-login";

const credentialsSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase().trim()),
  password: z.string().min(1).max(128),
});

/**
 * Google login dikonfigurasi dari konsol Master Admin dan disimpan di database,
 * jadi kredensialnya baru diketahui saat request berjalan. Auth.js menerima
 * konfigurasi berupa fungsi untuk alasan ini: provider Google dibangun ulang per
 * request dari database, dengan environment sebagai fallback.
 */
export async function isGoogleSignInEnabled() {
  if (!(await isGoogleLoginEnabled())) return false;
  return (await readGoogleLoginCredentials()) !== null;
}

export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  const googleCredentials = await readGoogleLoginCredentials();
  const useGoogle = googleCredentials !== null && (await isGoogleLoginEnabled());

  return {
    adapter: PrismaAdapter(prisma),
    session: { strategy: "jwt" },
    pages: { signIn: "/login", error: "/login" },
    providers: [
      ...(useGoogle && googleCredentials
        ? [Google({ clientId: googleCredentials.clientId, clientSecret: googleCredentials.clientSecret })]
        : []),
      Credentials({
        credentials: { email: {}, password: { type: "password" } },
        async authorize(input, request) {
          const parsed = credentialsSchema.safeParse(input);
          if (!parsed.success) return null;

          const address =
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            request.headers.get("x-real-ip") ??
            "unknown";
          await enforceRateLimit(
            `login:${parsed.data.email}:${address}`,
            10,
            5 * 60,
          );
          const user = await prisma.user.findUnique({
            where: { email: parsed.data.email },
          });
          if (!user?.active || !user.passwordHash) return null;

          const passwordMatches = await compare(
            parsed.data.password,
            user.passwordHash,
          );
          if (!passwordMatches) return null;

          return { id: user.id, name: user.name, email: user.email };
        },
      }),
    ],
    callbacks: {
      /**
       * OAuth sign-in bypasses `authorize`, so a deactivated account has to be
       * stopped here — otherwise disabling a user would not revoke Google access.
       */
      async signIn({ user, account }) {
        if (account?.provider !== "google" || !user?.id) return true;
        const record = await prisma.user.findUnique({
          where: { id: user.id },
          select: { active: true },
        });
        return record?.active ?? false;
      },
      jwt({ token, user }) {
        if (user?.id) token.sub = user.id;
        return token;
      },
      session({ session, token }) {
        if (session.user && token.sub) session.user.id = token.sub;
        return session;
      },
    },
  };
});
