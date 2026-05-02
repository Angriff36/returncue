'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Package, Clock, DollarSign, ArrowRight, Shield } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session) router.replace('/dashboard');
  }, [session, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse w-8 h-8 rounded-full bg-primary/30" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-sm border-b border-border/50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            <span className="font-semibold text-foreground tracking-tight">ReturnCue</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/auth/signin"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/auth/signup"
              className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 transition-opacity"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-light text-foreground tracking-tight leading-[1.1] mb-6">
            Never miss a<br />
            <span className="text-primary">return deadline</span> again
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            Every store has different return windows. ReturnCue tracks them all in one place,
            so you never lose money on expired returns.
          </p>
          <Link
            href="/auth/signup"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-md text-sm font-medium hover:opacity-90 transition-opacity stripe-shadow"
          >
            Start tracking for free
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 bg-secondary/30">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-card p-8 rounded-lg stripe-shadow-sm">
              <Clock className="w-8 h-8 text-primary mb-4" />
              <h3 className="text-base font-medium text-foreground mb-2">Deadline Tracking</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                See exactly how many days you have left for each return. Color-coded countdowns make urgency clear at a glance.
              </p>
            </div>
            <div className="bg-card p-8 rounded-lg stripe-shadow-sm">
              <DollarSign className="w-8 h-8 text-primary mb-4" />
              <h3 className="text-base font-medium text-foreground mb-2">Savings Counter</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Track how much money you have saved from successful returns. A motivating metric that grows with each refund.
              </p>
            </div>
            <div className="bg-card p-8 rounded-lg stripe-shadow-sm">
              <Shield className="w-8 h-8 text-primary mb-4" />
              <h3 className="text-base font-medium text-foreground mb-2">Status Management</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Mark items as Keep, Return Started, Returned, or Refunded. Stay organized through the entire return process.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-sm text-muted-foreground uppercase tracking-wider mb-4">The problem</p>
          <h2 className="text-2xl md:text-3xl font-light text-foreground mb-6">
            The $890B return ecosystem is built for merchants, not shoppers
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Amazon gives you 30 days. Zara gives you 30 days. Nike gives you 60 days. REI gives you 365 days.
            All buried in different emails, different portals, different policies.
            ReturnCue puts you back in control.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-border">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">ReturnCue</span>
          </div>
          <p className="text-xs text-muted-foreground">Built for shoppers who value their money.</p>
        </div>
      </footer>
    </div>
  );
}
