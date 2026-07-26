import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Database,
  HardDrive,
  Home,
  RefreshCw,
  Server,
} from "lucide-react";
import { Button } from "@nous-research/ui/ui/components/button";
import { Card, CardContent } from "@nous-research/ui/ui/components/card";
import { Spinner } from "@nous-research/ui/ui/components/spinner";

import { usePageHeader } from "@/contexts/usePageHeader";
import { api, type StorageBreakdownScope, type SystemStorageResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const scaled = value / 1024 ** index;
  const digits = scaled >= 100 || index === 0 ? 0 : scaled >= 10 ? 1 : 2;
  return `${scaled.toFixed(digits)} ${units[index]}`;
}

function ScopeIcon({ id }: { id: string }) {
  if (id === "home") return <Home className="h-4 w-4" />;
  if (id === "hermes") return <Database className="h-4 w-4" />;
  return <Server className="h-4 w-4" />;
}

function CapacityCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="flex min-h-28 flex-col justify-between gap-3 p-5">
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-text-tertiary">
          {label}
        </span>
        <div>
          <div className="text-2xl font-semibold tracking-[-0.035em] text-midground">
            {value}
          </div>
          <div className="mt-1 text-xs text-text-tertiary">{hint}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function BreakdownRows({ scope }: { scope: StorageBreakdownScope }) {
  const maxBytes = Math.max(1, ...scope.items.map((item) => item.bytes));
  const visibleTotal = Math.max(1, scope.visible_bytes);

  if (scope.items.length === 0) {
    return (
      <div className="flex min-h-52 items-center justify-center px-6 text-center text-sm text-text-tertiary">
        No visible usage was reported for this area.
      </div>
    );
  }

  return (
    <div className="divide-y divide-current/8">
      {scope.items.map((item, index) => {
        const relativeWidth = Math.max(2, (item.bytes / maxBytes) * 100);
        const share = (item.bytes / visibleTotal) * 100;
        return (
          <div className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3" key={item.name}>
            <span className="text-right font-mono text-[0.68rem] text-text-tertiary">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-medium text-midground">{item.name}</span>
                <span className="shrink-0 text-[0.68rem] text-text-tertiary">
                  {share.toFixed(share >= 10 ? 0 : 1)}%
                </span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-midground/8">
                <div
                  className="h-full rounded-full bg-midground/55"
                  style={{ width: `${relativeWidth}%` }}
                />
              </div>
            </div>
            <span className="min-w-20 text-right font-mono text-xs text-text-secondary">
              {formatBytes(item.bytes)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function StoragePage() {
  const [data, setData] = useState<SystemStorageResponse | null>(null);
  const [activeScopeId, setActiveScopeId] = useState("server");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const { setAfterTitle, setEnd } = usePageHeader();

  const load = useCallback((refresh = false) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    api
      .getSystemStorage(refresh)
      .then((response) => {
        if (requestId !== requestIdRef.current) return;
        setData(response);
        setActiveScopeId((current) =>
          response.scopes.some((scope) => scope.id === current)
            ? current
            : response.scopes[0]?.id ?? "server",
        );
      })
      .catch((reason) => {
        if (requestId === requestIdRef.current) setError(String(reason));
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    // Dashboard pages perform their initial API load on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(false);
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  useLayoutEffect(() => {
    setAfterTitle(
      <Button
        aria-label="Refresh storage usage"
        disabled={loading}
        ghost
        onClick={() => load(true)}
        size="icon"
        type="button"
      >
        {loading ? <Spinner /> : <RefreshCw />}
      </Button>,
    );
    setEnd(null);
    return () => {
      setAfterTitle(null);
      setEnd(null);
    };
  }, [load, loading, setAfterTitle, setEnd]);

  const activeScope = useMemo(
    () => data?.scopes.find((scope) => scope.id === activeScopeId) ?? data?.scopes[0],
    [activeScopeId, data],
  );

  if (loading && !data) {
    return (
      <div
        aria-live="polite"
        className="flex min-h-[50vh] items-center justify-center"
        role="status"
      >
        <div className="flex items-center gap-3 text-sm text-text-secondary">
          <Spinner /> Scanning server storage…
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <Card>
        <CardContent className="flex min-h-64 flex-col items-center justify-center gap-4 p-8 text-center">
          <AlertTriangle className="h-7 w-7 text-warning" />
          <div>
            <div className="font-medium text-midground">Storage scan unavailable</div>
            <div className="mt-1 max-w-lg text-sm text-text-tertiary">{error}</div>
          </div>
          <Button onClick={() => load(true)} outlined>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const disk = data.filesystem;
  const generated = new Date(data.generated_at).toLocaleString();

  return (
    <div aria-busy={loading} className="flex flex-col gap-6">
      <section aria-labelledby="storage-capacity-heading">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-midground" id="storage-capacity-heading">
              Filesystem capacity
            </h2>
            <p className="mt-1 text-xs text-text-tertiary">
              Volume {disk.mount} · updated {generated}{data.cached ? " · cached" : ""}
            </p>
          </div>
          <span className="font-mono text-xs text-text-secondary">{disk.percent.toFixed(1)}% used</span>
        </div>

        <div className="mb-4 h-2 overflow-hidden rounded-full bg-midground/8" role="progressbar" aria-label="Disk space used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={disk.percent}>
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500",
              disk.percent >= 90 ? "bg-destructive" : disk.percent >= 75 ? "bg-warning" : "bg-success",
            )}
            style={{ width: `${Math.min(100, Math.max(0, disk.percent))}%` }}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <CapacityCard label="Used" value={formatBytes(disk.used)} hint={`${disk.percent.toFixed(1)}% of the volume`} />
          <CapacityCard label="Free" value={formatBytes(disk.free)} hint={`${(disk.total ? (disk.free / disk.total) * 100 : 0).toFixed(1)}% available`} />
          <CapacityCard label="Total" value={formatBytes(disk.total)} hint="Filesystem capacity" />
        </div>
      </section>

      <section aria-labelledby="storage-breakdown-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-midground" id="storage-breakdown-heading">
              What is using space
            </h2>
            <p className="mt-1 text-xs text-text-tertiary">
              Ranked visible usage. Protected files may not be included.
            </p>
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Storage breakdown area">
            {data.scopes.map((scope) => (
              <Button
                aria-pressed={scope.id === activeScope?.id}
                key={scope.id}
                onClick={() => setActiveScopeId(scope.id)}
                outlined={scope.id !== activeScope?.id}
                size="sm"
                type="button"
              >
                <ScopeIcon id={scope.id} />
                {scope.id === "server" ? "Server" : scope.id === "home" ? "Home" : "Hermes"}
              </Button>
            ))}
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between gap-4 border-b border-current/10 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium text-midground">
                <HardDrive className="h-4 w-4 text-text-tertiary" />
                {activeScope?.label}
              </div>
              <span className="font-mono text-xs text-text-tertiary">
                {formatBytes(activeScope?.visible_bytes ?? 0)} visible
              </span>
            </div>
            {activeScope?.error && (
              <div
                className="flex items-center gap-2 border-b border-warning/25 bg-warning/5 px-4 py-2.5 text-xs text-warning"
                role="status"
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {activeScope.error}
              </div>
            )}
            {activeScope && <BreakdownRows scope={activeScope} />}
          </CardContent>
        </Card>
      </section>

      {(error || data.refresh_error) && (
        <div className="flex items-center gap-2 text-xs text-warning" role="status">
          <AlertTriangle className="h-3.5 w-3.5" /> Refresh failed; showing the last successful scan.
        </div>
      )}
    </div>
  );
}
