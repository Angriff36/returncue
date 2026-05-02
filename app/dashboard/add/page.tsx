'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader as Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const POPULAR_STORES = [
  { name: 'Amazon', days: 30 },
  { name: 'Zara', days: 30 },
  { name: 'Nike', days: 60 },
  { name: 'REI', days: 365 },
  { name: 'Nordstrom', days: 40 },
  { name: 'Target', days: 90 },
  { name: 'Apple', days: 14 },
  { name: 'Best Buy', days: 15 },
];

export default function AddPurchasePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [returnWindowDays, setReturnWindowDays] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [returnPortalUrl, setReturnPortalUrl] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!storeName.trim()) newErrors.storeName = 'Store name is required';
    if (!itemDescription.trim()) newErrors.itemDescription = 'Item description is required';
    if (!orderDate) newErrors.orderDate = 'Order date is required';
    if (!returnWindowDays || parseInt(returnWindowDays) < 1)
      newErrors.returnWindowDays = 'Valid return window is required';
    if (!amount || parseFloat(amount) < 0) newErrors.amount = 'Valid amount is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName: storeName.trim(),
          itemDescription: itemDescription.trim(),
          orderDate,
          returnWindowDays,
          amount,
          notes: notes.trim() || null,
          returnPortalUrl: returnPortalUrl.trim() || null,
        }),
      });

      if (res.ok) {
        toast.success('Purchase added');
        router.push('/dashboard');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to add purchase');
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  function selectStore(store: { name: string; days: number }) {
    setStoreName(store.name);
    setReturnWindowDays(store.days.toString());
  }

  const deadline = orderDate && returnWindowDays
    ? new Date(new Date(orderDate).getTime() + parseInt(returnWindowDays) * 86400000).toLocaleDateString()
    : null;

  return (
    <div className="max-w-lg mx-auto">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to dashboard
      </Link>

      <h1 className="text-2xl font-light text-foreground mb-1">Add Purchase</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Track a new purchase and its return deadline.
      </p>

      {/* Quick store selection */}
      <div className="mb-8">
        <p className="text-xs text-muted-foreground mb-2">Quick select store:</p>
        <div className="flex flex-wrap gap-2">
          {POPULAR_STORES.map((store) => (
            <button
              key={store.name}
              type="button"
              onClick={() => selectStore(store)}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                storeName === store.name
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/50'
              }`}
            >
              {store.name} ({store.days}d)
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label htmlFor="storeName" className="block text-sm font-medium text-foreground mb-1.5">
              Store Name *
            </label>
            <input
              id="storeName"
              type="text"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g. Amazon"
            />
            {errors.storeName && <p className="text-xs text-destructive mt-1">{errors.storeName}</p>}
          </div>

          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-foreground mb-1.5">
              Amount ($) *
            </label>
            <input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="0.00"
            />
            {errors.amount && <p className="text-xs text-destructive mt-1">{errors.amount}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="itemDescription" className="block text-sm font-medium text-foreground mb-1.5">
            Item Description *
          </label>
          <input
            id="itemDescription"
            type="text"
            value={itemDescription}
            onChange={(e) => setItemDescription(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="e.g. Blue running shoes, size 10"
          />
          {errors.itemDescription && <p className="text-xs text-destructive mt-1">{errors.itemDescription}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label htmlFor="orderDate" className="block text-sm font-medium text-foreground mb-1.5">
              Order Date *
            </label>
            <input
              id="orderDate"
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.orderDate && <p className="text-xs text-destructive mt-1">{errors.orderDate}</p>}
          </div>

          <div>
            <label htmlFor="returnWindowDays" className="block text-sm font-medium text-foreground mb-1.5">
              Return Window (days) *
            </label>
            <input
              id="returnWindowDays"
              type="number"
              min="1"
              value={returnWindowDays}
              onChange={(e) => setReturnWindowDays(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="30"
            />
            {errors.returnWindowDays && <p className="text-xs text-destructive mt-1">{errors.returnWindowDays}</p>}
          </div>
        </div>

        {deadline && (
          <div className="bg-secondary/50 px-4 py-3 rounded-md">
            <p className="text-xs text-muted-foreground">
              Return deadline: <span className="font-medium text-foreground">{deadline}</span>
            </p>
          </div>
        )}

        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-foreground mb-1.5">
            Notes <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            placeholder="Any details about the return..."
          />
        </div>

        <div>
          <label htmlFor="returnPortalUrl" className="block text-sm font-medium text-foreground mb-1.5">
            Return Portal URL <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <input
            id="returnPortalUrl"
            type="url"
            value={returnPortalUrl}
            onChange={(e) => setReturnPortalUrl(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="https://..."
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="bg-primary text-primary-foreground px-5 py-2.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Add Purchase
          </button>
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
