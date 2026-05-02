'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import Link from 'next/link';
import { Plus, Package, DollarSign, Clock, TriangleAlert as AlertTriangle, Filter } from 'lucide-react';
import SubscriptionsList from './SubscriptionsList';
import { toast } from 'sonner';
import { PurchaseCard } from './purchase-card';
import { GmailScan } from './gmail-scan';

interface Purchase {
  id: string;
  storeName: string;
  itemDescription: string;
  orderDate: string;
  returnWindowDays: number;
  deadline: string;
  amount: number;
  status: 'KEEP' | 'RETURN_STARTED' | 'RETURNED' | 'REFUNDED';
  notes: string | null;
  returnPortalUrl: string | null;
}

type FilterStatus = 'ALL' | 'ACTIVE' | 'KEEP' | 'RETURN_STARTED' | 'RETURNED' | 'REFUNDED';

export default function DashboardPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>('ALL');
  const [sortBy, setSortBy] = useState<'deadline' | 'store' | 'amount'>('deadline');

  const fetchPurchases = useCallback(async () => {
    try {
      const res = await fetch('/api/purchases');
      if (res.ok) {
        const data = await res.json();
        setPurchases(data);
      }
    } catch {
      toast.error('Failed to load purchases');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  async function updateStatus(id: string, status: string) {
    try {
      const res = await fetch(`/api/purchases/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setPurchases((prev) =>
          prev.map((p) => (p.id === id ? { ...p, status: status as Purchase['status'] } : p))
        );
        toast.success('Status updated');
      }
    } catch {
      toast.error('Failed to update status');
    }
  }

  async function deletePurchase(id: string) {
    try {
      const res = await fetch(`/api/purchases/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setPurchases((prev) => prev.filter((p) => p.id !== id));
        toast.success('Purchase removed');
      }
    } catch {
      toast.error('Failed to delete purchase');
    }
  }

  const totalSaved = purchases
    .filter((p) => p.status === 'REFUNDED')
    .reduce((sum, p) => sum + p.amount, 0);

  const activePurchases = purchases.filter(
    (p) => p.status !== 'KEEP' && p.status !== 'REFUNDED'
  );

  const overduePurchases = purchases.filter((p) => {
    const daysLeft = Math.ceil((new Date(p.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return daysLeft < 0 && p.status !== 'RETURNED' && p.status !== 'REFUNDED' && p.status !== 'KEEP';
  });

  const filteredPurchases = purchases.filter((p) => {
    if (filter === 'ALL') return true;
    if (filter === 'ACTIVE') return p.status !== 'KEEP' && p.status !== 'REFUNDED';
    return p.status === filter;
  });

  const sortedPurchases = [...filteredPurchases].sort((a, b) => {
    if (sortBy === 'deadline') return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    if (sortBy === 'store') return a.storeName.localeCompare(b.storeName);
    return b.amount - a.amount;
  });

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-card rounded-lg stripe-shadow-sm animate-pulse" />
          ))}
        </div>
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-card rounded-lg stripe-shadow-sm animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="space-y-8">
      {/* Gmail Scanner */}
      <GmailScan />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card p-5 rounded-lg stripe-shadow-sm border border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Saved</p>
              <p className="text-xl font-semibold text-foreground">${totalSaved.toFixed(2)}</p>
            </div>
          </div>
        </div>
        <div className="bg-card p-5 rounded-lg stripe-shadow-sm border border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
              <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active Returns</p>
              <p className="text-xl font-semibold text-foreground">{activePurchases.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-card p-5 rounded-lg stripe-shadow-sm border border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Overdue</p>
              <p className="text-xl font-semibold text-foreground">{overduePurchases.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-muted-foreground" />
          {(['ALL', 'ACTIVE', 'KEEP', 'RETURN_STARTED', 'RETURNED', 'REFUNDED'] as FilterStatus[]).map(
            (f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                  filter === f
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-accent'
                }`}
              >
                {f === 'RETURN_STARTED' ? 'In Progress' : f.charAt(0) + f.slice(1).toLowerCase()}
              </button>
            )
          )}
        </div>
        <div className="flex items-center gap-3">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="text-xs border border-input rounded-md px-3 py-1.5 bg-background text-foreground"
          >
            <option value="deadline">Sort by deadline</option>
            <option value="store">Sort by store</option>
            <option value="amount">Sort by amount</option>
          </select>
          <Link
            href="/dashboard/add"
            className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-md text-xs font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Purchase
          </Link>
        </div>
      </div>

      {/* Purchase List */}
      {sortedPurchases.length === 0 ? (
        <div className="text-center py-20">
          <Package className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-light text-foreground mb-2">
            {filter === 'ALL' ? 'No purchases tracked yet' : 'No purchases match this filter'}
          </h3>
          <p className="text-sm text-muted-foreground mb-6">
            {filter === 'ALL'
              ? 'Add your first purchase to start tracking return deadlines.'
              : 'Try a different filter or add a new purchase.'}
          </p>
          {filter === 'ALL' && (
            <Link
              href="/dashboard/add"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              Add your first purchase
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {sortedPurchases.map((purchase) => (
            <PurchaseCard
              key={purchase.id}
              purchase={purchase}
              onUpdateStatus={updateStatus}
              onDelete={deletePurchase}
            />
          ))}
        </div>
      )}
    </div>

    <SubscriptionsList />
    </>
  );
}
