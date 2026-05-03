import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

export const authOptions: NextAuthOptions = {
  // No adapter — we use JWT strategy and handle persistence manually.
  // Adapters with JWT cause inconsistent behavior in NextAuth v4.
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password required');
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.password) {
          throw new Error('Invalid credentials');
        }

        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) {
          throw new Error('Invalid credentials');
        }

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            authorization: {
              params: {
                scope: 'openid email profile https://www.googleapis.com/auth/gmail.readonly',
                access_type: 'offline',
                prompt: 'consent',
              },
            },
          }),
        ]
      : []),
  ],
  session: {
    strategy: 'jwt',
  },
  logger: {
    error(code, ...message) {
      console.error('[NextAuth Error]', code, JSON.stringify(message));
    },
    warn(code, ...message) {
      console.warn('[NextAuth Warn]', code, JSON.stringify(message));
    },
    debug(code, ...message) {
      console.log('[NextAuth Debug]', code, JSON.stringify(message));
    },
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      // Handle user creation and account linking manually since we removed the adapter
      try {
        if (account?.provider === 'google') {
          const email = profile?.email || user.email;
          if (!email) {
            console.error('[signIn] No email from Google profile');
            return false;
          }

          // Find or create user
          let dbUser = await prisma.user.findUnique({ where: { email } });
          if (!dbUser) {
            dbUser = await prisma.user.create({
              data: {
                email,
                name: profile?.name || user.name || email.split('@')[0],
                image: profile?.image || (profile as any)?.picture || null,
              },
            });
            console.log('[signIn] Created user:', dbUser.id, dbUser.email);
          } else {
            // Update name/image if they changed
            await prisma.user.update({
              where: { id: dbUser.id },
              data: {
                name: profile?.name || dbUser.name,
                image: profile?.image || (profile as any)?.picture || dbUser.image,
              },
            });
            console.log('[signIn] Existing user:', dbUser.id, dbUser.email);
          }

          // Upsert account record
          await prisma.account.upsert({
            where: {
              provider_providerAccountId: {
                provider: account.provider,
                providerAccountId: account.providerAccountId,
              },
            },
            create: {
              userId: dbUser.id,
              type: account.type,
              provider: account.provider,
              providerAccountId: account.providerAccountId,
              access_token: account.access_token,
              refresh_token: account.refresh_token,
              expires_at: account.expires_at,
              token_type: account.token_type,
              scope: account.scope,
              id_token: account.id_token,
            },
            update: {
              access_token: account.access_token,
              refresh_token: account.refresh_token,
              expires_at: account.expires_at,
              token_type: account.token_type,
              scope: account.scope,
              id_token: account.id_token,
            },
          });
          console.log('[signIn] Account upserted for user:', dbUser.id);

          // Set user.id so JWT callback picks it up
          user.id = dbUser.id;
        }
        return true;
      } catch (err: any) {
        console.error('[signIn] Error:', err.message, err.stack);
        return false;
      }
    },
    async jwt({ token, user, account }) {
      // On first sign-in, store user id
      if (user) {
        token.id = user.id;
      }
      // On OAuth sign-in, store the provider tokens for Gmail access
      if (account) {
        token.provider = account.provider;
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const u = session.user as any;
        u.id = token.id;
        u.accessToken = token.accessToken;
        u.refreshToken = token.refreshToken;
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
};
