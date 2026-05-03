'use client';

import { useState } from 'react';
import { ExternalLink, Trash2, ChevronDown } from 'lucide-react';

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

const STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Pending', color: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300' },
  { value: 'KEEP', label: 'Keep', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  { value: 'RETURN_STARTED', label: 'Return Started', color: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300' },
  { value: 'RETURNED', label: 'Returned', color: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' },
  { value: 'REFUNDED', label: 'Refunded', color: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300' },
] as const;

function getDaysLeft(deadline: string): number {
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function getDeadlineBadge(daysLeft: number, status: string) {
  if (status === 'RETURNED' || status === 'REFUNDED' || status === 'KEEP') {
    return null;
  }
  if (daysLeft < 0) {
    return (
      <span className="text-xs font-medium px-2.5 py-1 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
        OVERDUE
      </span>
    );
  }
  if (daysLeft <= 3) {
    return (
      <span className="text-xs font-medium px-2.5 py-1 rounded bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400">
        {daysLeft} day{daysLeft !== 1 ? 's' : ''} left
      </span>
    );
  }
  if (daysLeft <= 7) {
    return (
      <span className="text-xs font-medium px-2.5 py-1 rounded bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
        {daysLeft} days left
      </span>
    );
  }
  return (
    <span className="text-xs font-medium px-2.5 py-1 rounded bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300">
      {daysLeft} days left
    </span>
  );
}

export function PurchaseCard({
  purchase,
  onUpdateStatus,
  onDelete,
}: {
  purchase: Purchase;
  onUpdateStatus: (id: string, status: string) => void;
  onDelete: (id: string) => void;
}) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const daysLeft = getDaysLeft(purchase.deadline);
  const currentStatus = STATUS_OPTIONS.find((s) => s.value === purchase.status) ?? STATUS_OPTIONS[0];

  return (
    <div className="bg-card border border-border/50 rounded-lg p-5 stripe-shadow-sm hover:stripe-shadow transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="text-sm font-medium text-foreground truncate">
              {purchase.itemDescription}
            </h3>
            {getDeadlineBadge(daysLeft, purchase.status)}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{purchase.storeName}</span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span>${purchase.amount.toFixed(2)}</span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span>Due {new Date(purchase.deadline).toLocaleDateString()}</span>
          </div>
          {purchase.notes && (
            <p className="text-xs text-muted-foreground mt-2 truncate">{purchase.notes}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {purchase.returnPortalUrl && (
            <a
              href={purchase.returnPortalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              title="Return portal"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

          {/* Status dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowStatusMenu(!showStatusMenu)}
              className={`inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded ${currentStatus.color} transition-colors`}
            >
              {currentStatus.label}
              <ChevronDown className="w-3 h-3" />
            </button>
            {showStatusMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowStatusMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 bg-popover border border-border rounded-md shadow-lg py-1 w-36">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        onUpdateStatus(purchase.id, opt.value);
                        setShowStatusMenu(false);
                      }}
                      className="block w-full text-left text-xs px-3 py-2 hover:bg-accent transition-colors text-popover-foreground"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Delete */}
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onDelete(purchase.id)}
                className="text-xs px-2 py-1 bg-destructive text-destructive-foreground rounded"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs px-2 py-1 text-muted-foreground"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-destructive"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
