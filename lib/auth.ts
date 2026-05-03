import { NextAuthOptions } from 'next-auth';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
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
    async signIn({ user, account }) {
      // Always allow sign-in. Account linking is handled by the adapter.
      if (account) {
        console.log('[NextAuth signIn] provider:', account.provider, 'type:', account.type);
      }
      return true;
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
