'use client';

import { useEffect, useState } from 'react';

interface Subscription {
  id: string;
  serviceName: string;
  amount: number;
  currency: string;
  billingFrequency: string;
  lastBilledAt: string;
  nextBilledAt: string | null;
  status: string;
  sourceEmailId: string | null;
  createdAt: string;
}

export default function SubscriptionsList() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchSubscriptions = async () => {
    try {
      const res = await fetch('/api/subscriptions');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setSubscriptions(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'cancelled' : 'active';
    try {
      await fetch('/api/subscriptions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus }),
      });
      setSubscriptions(prev =>
        prev.map(s => s.id === id ? { ...s, status: newStatus } : s)
      );
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const totalMonthly = subscriptions
    .filter(s => s.status === 'active' && s.billingFrequency === 'monthly')
    .reduce((sum, s) => sum + s.amount, 0);

  const totalAnnual = subscriptions
    .filter(s => s.status === 'active' && s.billingFrequency === 'annual')
    .reduce((sum, s) => sum + s.amount, 0);

  if (loading) {
    return <div className="animate-pulse text-gray-400 mt-6">Scanning subscriptions…</div>;
  }

  if (error) {
    return <div className="text-red-400 mt-6">Error: {error}</div>;
  }

  if (subscriptions.length === 0) {
    return (
      <div className="mt-6 p-6 border border-gray-700 rounded-lg bg-gray-800/50">
        <h2 className="text-xl font-bold text-white mb-2">💰 Subscriptions</h2>
        <p className="text-gray-400">No subscriptions detected yet. Run an email scan to find them.</p>
      </div>
    );
  }

  return (
    <div className="mt-6 p-6 border border-gray-700 rounded-lg bg-gray-800/50">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">💰 Subscriptions</h2>
        <div className="flex gap-4 text-sm">
          {totalMonthly > 0 && (
            <span className="text-yellow-400">${totalMonthly.toFixed(2)}/mo</span>
          )}
          {totalAnnual > 0 && (
            <span className="text-orange-400">${totalAnnual.toFixed(2)}/yr</span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {subscriptions.map(sub => (
          <div
            key={sub.id}
            className={`p-3 rounded-lg border ${
              sub.status === 'active'
                ? 'border-gray-600 bg-gray-700/50'
                : 'border-gray-700 bg-gray-800/50 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-white font-medium">{sub.serviceName}</span>
                <span className="text-gray-400 ml-2 text-sm">
                  ${sub.amount.toFixed(2)} · {sub.billingFrequency}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {sub.nextBilledAt && sub.status === 'active' && (
                  <span className="text-gray-400 text-xs">
                    next: {new Date(sub.nextBilledAt).toLocaleDateString()}
                  </span>
                )}
                {sub.status === 'active' && (
                  <span className="text-green-400 text-xs bg-green-400/10 px-2 py-0.5 rounded">
                    active
                  </span>
                )}
                <button
                  onClick={() => toggleStatus(sub.id, sub.status)}
                  className={`text-xs px-2 py-0.5 rounded transition-colors ${
                    sub.status === 'active'
                      ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                      : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                  }`}
                >
                  {sub.status === 'active' ? 'cancel' : 'restore'}
                </button>
              </div>
            </div>
            <div className="text-gray-500 text-xs mt-1">
              last billed: {new Date(sub.lastBilledAt).toLocaleDateString()}
              {sub.billingFrequency !== 'unknown' && sub.nextBilledAt && (
                <> · next: {new Date(sub.nextBilledAt).toLocaleDateString()}</>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
