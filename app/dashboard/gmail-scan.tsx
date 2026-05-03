'use client';

import { useState, useCallback, useEffect } from 'react';
import { Mail, Loader2, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { signIn } from 'next-auth/react';

interface EmailScan {
  id: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  totalEmails: number;
  processedEmails: number;
  purchasesFound: number;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

interface GmailScanProps {
  onPurchasesChanged?: () => void | Promise<void>;
}

export function GmailScan({ onPurchasesChanged }: GmailScanProps) {
  const [scan, setScan] = useState<EmailScan | null>(null);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<EmailScan | null>(null);
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);

  // Check Gmail connection on mount
  useEffect(() => {
    fetchLatestScan();
  }, []);

  // Poll scan progress
  useEffect(() => {
    if (!scan || scan.status !== 'RUNNING') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/emails/scan?scanId=${scan.id}`);
        if (res.ok) {
          const data = await res.json();
          const updated = data.scan as EmailScan;
          const hadNewPurchases = updated.purchasesFound > (scan?.purchasesFound ?? 0);
          setScan(updated);
          if (hadNewPurchases) {
            void onPurchasesChanged?.();
          }
          if (updated.status !== 'RUNNING') {
            clearInterval(interval);
            setScanning(false);
            setLastScan(updated);
            setScan(null);
            if (updated.status === 'COMPLETED') {
              await onPurchasesChanged?.();
              toast.success(`Found ${updated.purchasesFound} purchases in ${updated.totalEmails} emails!`);
            } else if (updated.status === 'FAILED') {
              toast.error(updated.error || 'Scan failed');
            }
          }
        }
      } catch {
        // ignore poll errors
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [scan?.id, scan?.status]);

  const fetchLatestScan = useCallback(async () => {
    try {
      const res = await fetch('/api/emails/scan');
      if (res.ok) {
        const data = await res.json();
        setGmailConnected(true);
        if (data.scans?.length > 0) {
          const latest = data.scans[0];
          if (latest.status === 'RUNNING') {
            setScan(latest);
            setScanning(true);
          } else {
            setLastScan(latest);
          }
        }
      } else {
        setGmailConnected(false);
      }
    } catch {
      setGmailConnected(false);
    }
  }, []);

  async function startScan() {
    setScanning(true);
    try {
      const res = await fetch('/api/emails/scan', { method: 'POST' });
      const data = await res.json();

      if (res.status === 400 && data.error === 'GMAIL_NOT_CONNECTED') {
        setScanning(false);
        setGmailConnected(false);
        toast.error(data.message);
        return;
      }

      if (data.status === 'ALREADY_RUNNING') {
        setScan(data);
        toast.info('A scan is already running');
        return;
      }

      if (data.scanId) {
        setScan({ id: data.scanId, status: 'RUNNING', totalEmails: 0, processedEmails: 0, purchasesFound: 0, startedAt: new Date().toISOString() });
      }
    } catch {
      setScanning(false);
      toast.error('Failed to start scan');
    }
  }

  const progress = scan?.status === 'RUNNING' && scan.totalEmails > 0
    ? Math.round((scan.processedEmails / scan.totalEmails) * 100)
    : 0;

  return (
    <div className="bg-card p-5 rounded-lg stripe-shadow-sm border border-border/50">
      {gmailConnected === false ? (
        // Gmail not connected
        <div className="text-center py-3">
          <div className="flex items-center justify-center gap-2">
            <Mail className="w-5 h-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Connect Gmail to auto-detect purchases from your inbox</p>
          </div>
          <button
            onClick={() => signIn('google', { callbackUrl: window.location.href })}
            className="inline-flex items-center gap-2 mt-3 bg-white text-gray-800 px-5 py-2.5 rounded-md text-sm font-medium border border-gray-300 hover:bg-gray-50 transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Connect Gmail
          </button>
        </div>
      ) : scanning && !scan ? (
        // Loading state
        <div className="flex items-center justify-center py-3">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          <span className="ml-3 text-sm text-muted-foreground">Starting scan...</span>
        </div>
      ) : scan?.status === 'RUNNING' ? (
        // Active scan progress
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              <span className="text-sm font-medium">Scanning Gmail...</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {scan.processedEmails} emails processed
            </span>
          </div>
          <div className="w-full bg-secondary rounded-full h-2 mb-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-500"
              style={{ width: scan.totalEmails > 0 ? `${progress}%` : '10%' }}
            />
          </div>
          {scan.purchasesFound > 0 && (
            <p className="text-xs text-green-600 dark:text-green-400">
              {scan.purchasesFound} purchases found so far
            </p>
          )}
        </div>
      ) : (
        // Idle state — show last scan or prompt
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-gradient-to-br from-blue-50 to-green-50 dark:from-blue-900/20 dark:to-green-900/20 flex items-center justify-center">
              <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Gmail Scanner</p>
              <p className="text-xs text-muted-foreground">
                {lastScan
                  ? `Last scan: ${lastScan.purchasesFound} purchases found`
                  : 'Auto-detect purchases from your inbox'}
              </p>
            </div>
          </div>
          <button
            onClick={startScan}
            disabled={scanning}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Mail className="w-3.5 h-3.5" />
            Scan Gmail
          </button>
        </div>
      )}

      {/* Last scan results */}
      {lastScan && scan?.status !== 'RUNNING' && (
        <div className="mt-4 pt-4 border-t border-border/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {lastScan.status === 'COMPLETED' ? (
              <CheckCircle className="w-3.5 h-3.5 text-green-500" />
            ) : lastScan.status === 'FAILED' ? (
              <XCircle className="w-3.5 h-3.5 text-red-500" />
            ) : null}
            <span>
              {lastScan.status === 'COMPLETED'
                ? `Last scan found ${lastScan.purchasesFound} purchases in ${lastScan.totalEmails} emails`
                : lastScan.status === 'FAILED'
                ? 'Last scan failed'
                : ''}
            </span>
            {lastScan.completedAt && (
              <span className="ml-auto">
                {new Date(lastScan.completedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
