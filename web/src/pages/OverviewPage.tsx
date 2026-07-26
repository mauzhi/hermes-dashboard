import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ComponentType,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  CalendarClock,
  CheckCircle2,
  Clock,
  Cpu,
  HardDrive,
  HeartPulse,
  MessageSquare,
  Play,
  Radio,
  RefreshCw,
  ScrollText,
  Server,
  Sparkles,
  Zap,
} from "lucide-react";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { Button } from "@nous-research/ui/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@nous-research/ui/ui/components/card";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { api, getManagementProfile } from "@/lib/api";
import type {
  CronJob,
  PaginatedSessions,
  SessionInfo,
  SessionStoreStats,
  StatusResponse,
  SystemStats,
} from "@/lib/api";
import {
  collectOperationalIssues,
  countHealthyPlatforms,
  operationalSummary,
  type OperationalIssue,
} from "@/lib/dashboard-overview";
import { normalizeSessionTitle } from "@/lib/chat-title";
import { cn, timeAgo } from "@/lib/utils";
import { usePageHeader } from "@/contexts/usePageHeader";
import { PluginSlot } from "@/plugins";

interface OverviewData {
  status: StatusResponse | null;
  stats: SystemStats | null;
  sessions: PaginatedSessions | null;
  sessionStats: SessionStoreStats | null;
  jobs: CronJob[];
}

const EMPTY_DATA: OverviewData = {
  status: null,
  stats: null,
  sessions: null,
  sessionStats: null,
  jobs: [],
};

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function formatNextRun(value?: string | null): string {
  if (!value) return "No next run";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return date.toLocaleString(undefined, {
    ...(sameDay ? {} : { month: "short", day: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  });
}

function sessionTitle(session: SessionInfo): string {
  return (
    normalizeSessionTitle(session.title) ||
    normalizeSessionTitle(session.preview)?.slice(0, 72) ||
    "Untitled conversation"
  );
}

function SectionHeading({
  title,
  description,
  href,
  linkLabel = "View all",
}: {
  title: string;
  description: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex min-w-0 items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      {href ? (
        <Link
          to={href}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground sm:min-h-0 sm:py-1"
        >
          {linkLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  href,
  tone = "neutral",
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  detail: string;
  href: string;
  tone?: "neutral" | "success" | "warning";
}) {
  return (
    <Link
      to={href}
      className="group min-w-0 rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/25 hover:bg-muted/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "grid h-9 w-9 place-items-center rounded-lg border",
            tone === "success" && "border-success/25 bg-success/8 text-success",
            tone === "warning" && "border-warning/25 bg-warning/8 text-warning",
            tone === "neutral" && "border-border bg-muted/20 text-muted-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <ArrowRight className="h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>
      <div className="mt-4 text-2xl font-semibold tabular-nums tracking-[-0.04em] text-foreground">
        {value}
      </div>
      <div className="mt-1 text-sm font-medium text-foreground">{label}</div>
      <div className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</div>
    </Link>
  );
}

function ResourceMeter({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number | null;
  detail: string;
}) {
  const percent = Math.max(0, Math.min(100, value ?? 0));
  const tone = percent >= 95 ? "bg-destructive" : percent >= 85 ? "bg-warning" : "bg-success";
  return (
    <div className="min-w-0 py-3 first:pt-0 last:pb-0">
      <div className="mb-2 flex items-center gap-2 text-sm">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="font-medium text-foreground">{label}</span>
        <span className="ml-auto tabular-nums text-muted-foreground">
          {value === null ? "—" : `${Math.round(value)}%`}
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted/35"
        role="meter"
        aria-label={`${label} utilization`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value ?? undefined}
      >
        <div className={cn("h-full rounded-full transition-[width]", tone)} style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1.5 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function AttentionItem({ issue }: { issue: OperationalIssue }) {
  return (
    <Link
      to={issue.href}
      className="group flex min-h-14 min-w-0 items-center gap-3 border-t border-border px-4 py-3 first:border-t-0 hover:bg-muted/20 sm:px-5"
    >
      <span
        className={cn(
          "grid h-8 w-8 shrink-0 place-items-center rounded-full",
          issue.severity === "critical"
            ? "bg-destructive/10 text-destructive"
            : "bg-warning/10 text-warning",
        )}
      >
        <AlertTriangle className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{issue.title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{issue.detail}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function EmptyAttention() {
  return (
    <div className="flex min-h-28 items-center gap-3 px-4 py-5 sm:px-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-success/10 text-success">
        <CheckCircle2 className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-medium text-foreground">Nothing needs attention</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Gateway, channels, automations, and host capacity look healthy.
        </p>
      </div>
    </div>
  );
}

function SessionRow({ session }: { session: SessionInfo }) {
  return (
    <Link
      to={`/chat?resume=${encodeURIComponent(session.id)}`}
      className="group flex min-h-16 min-w-0 items-center gap-3 border-t border-border px-4 py-3 first:border-t-0 hover:bg-muted/20 sm:px-5"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-muted/15 text-muted-foreground">
        <MessageSquare className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{sessionTitle(session)}</span>
        <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="shrink-0 capitalize">{session.source || "chat"}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate">{session.model || "default model"}</span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0">{timeAgo(session.last_active)}</span>
        </span>
      </span>
      {session.is_active ? <Badge tone="success">active</Badge> : null}
      <Play className="h-4 w-4 shrink-0 text-muted-foreground/50 group-hover:text-foreground" />
    </Link>
  );
}

function JobRow({ job }: { job: CronJob }) {
  const failed = Boolean(job.last_error || job.last_delivery_error || ["error", "failed", "failure"].includes((job.last_status || "").toLowerCase()));
  return (
    <Link
      to="/cron"
      className="group flex min-h-16 min-w-0 items-center gap-3 border-t border-border px-4 py-3 first:border-t-0 hover:bg-muted/20 sm:px-5"
    >
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-lg border",
          failed
            ? "border-warning/25 bg-warning/8 text-warning"
            : "border-border bg-muted/15 text-muted-foreground",
        )}
      >
        <CalendarClock className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{job.name || "Untitled schedule"}</span>
        <span className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          <span className="truncate">{job.schedule_display || job.schedule?.display || "Schedule unavailable"}</span>
          {job.profile_name || job.profile ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="shrink-0">{job.profile_name || job.profile}</span>
            </>
          ) : null}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-xs font-medium text-foreground">{formatNextRun(job.next_run_at)}</span>
        <span className={cn("mt-1 block text-[0.7rem]", failed ? "text-warning" : "text-muted-foreground")}>
          {failed ? "Last run failed" : job.enabled ? "Enabled" : "Paused"}
        </span>
      </span>
    </Link>
  );
}

const QUICK_ACTIONS = [
  { href: "/chat", icon: Sparkles, label: "Start a chat", detail: "Work with Hermes" },
  { href: "/sessions", icon: ScrollText, label: "Find a session", detail: "Search history" },
  { href: "/cron", icon: CalendarClock, label: "Add automation", detail: "Schedule a task" },
  { href: "/logs", icon: Activity, label: "Inspect logs", detail: "Trace an issue" },
] as const;

export default function OverviewPage() {
  const navigate = useNavigate();
  const { setAfterTitle, setEnd } = usePageHeader();
  const [data, setData] = useState<OverviewData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failedLoads, setFailedLoads] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    const profile = getManagementProfile() || "default";
    const results = await Promise.allSettled([
      api.getStatus(),
      api.getSystemStats(),
      api.getSessions(6, 0, undefined, "recent"),
      api.getSessionStats(),
      api.getCronJobs(profile),
    ]);
    setFailedLoads(results.filter((result) => result.status === "rejected").length);
    setData((current) => ({
      status: results[0].status === "fulfilled" ? results[0].value : current.status,
      stats: results[1].status === "fulfilled" ? results[1].value : current.stats,
      sessions: results[2].status === "fulfilled" ? results[2].value : current.sessions,
      sessionStats: results[3].status === "fulfilled" ? results[3].value : current.sessionStats,
      jobs: results[4].status === "fulfilled" ? results[4].value : current.jobs,
    }));
    setUpdatedAt(new Date());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  useLayoutEffect(() => {
    setAfterTitle(
      <div className="flex items-center gap-1.5">
        <span className="hidden text-xs text-muted-foreground sm:inline">
          Live command center
        </span>
        <div className="flex items-center gap-1 sm:hidden">
          <Button
            ghost
            size="icon"
            className="h-10 w-10"
            onClick={() => navigate("/chat")}
            aria-label="Start a new chat"
            title="Start a new chat"
          >
            <Sparkles className="h-4 w-4" />
          </Button>
          <Button
            ghost
            size="icon"
            className="h-10 w-10"
            onClick={() => void load(true)}
            disabled={refreshing}
            aria-label="Refresh overview"
            title="Refresh overview"
          >
            {refreshing ? <Spinner /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>,
    );
    setEnd(
      <div className="hidden w-full items-center gap-2 sm:flex sm:w-auto">
        <Button className="min-h-11 flex-1 sm:min-h-0 sm:flex-none" size="sm" onClick={() => navigate("/chat")} prefix={<Sparkles className="h-3.5 w-3.5" />}>
          New chat
        </Button>
        <Button
          ghost
          size="icon"
          className="h-11 w-11 shrink-0 sm:h-8 sm:w-8"
          onClick={() => void load(true)}
          disabled={refreshing}
          aria-label="Refresh overview"
          title="Refresh overview"
        >
          {refreshing ? <Spinner /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>,
    );
    return () => {
      setAfterTitle(null);
      setEnd(null);
    };
  }, [load, loading, navigate, refreshing, setAfterTitle, setEnd]);

  const issues = useMemo(
    () => collectOperationalIssues(data.status, data.stats, data.jobs),
    [data.jobs, data.stats, data.status],
  );
  const summary = failedLoads > 0 ? "Live status incomplete" : operationalSummary(issues);
  const connectedPlatforms = countHealthyPlatforms(data.status);
  const enabledJobs = data.jobs.filter((job) => job.enabled).length;
  const upcomingJobs = [...data.jobs]
    .filter((job) => job.enabled && job.next_run_at)
    .sort((a, b) => Date.parse(a.next_run_at || "") - Date.parse(b.next_run_at || ""))
    .slice(0, 4);
  const critical = issues.some((issue) => issue.severity === "critical");
  const needsReview = failedLoads > 0 || issues.length > 0;

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center" aria-busy="true" aria-live="polite">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Loading command center…
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 sm:gap-8">
      <PluginSlot name="overview:top" />

      {failedLoads > 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm" role="status">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="min-w-0">
            <p className="font-medium text-foreground">Some live data could not be refreshed</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Showing the latest available information. Try refresh again.</p>
          </div>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={cn(
                "grid h-11 w-11 shrink-0 place-items-center rounded-full",
                critical
                  ? "bg-destructive/10 text-destructive"
                  : needsReview
                    ? "bg-warning/10 text-warning"
                    : "bg-success/10 text-success",
              )}
            >
              {critical ? <AlertTriangle className="h-5 w-5" /> : <HeartPulse className="h-5 w-5" />}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold tracking-[-0.025em] text-foreground">{summary}</h2>
                <Badge tone={critical ? "destructive" : needsReview ? "warning" : "success"}>
                  {critical ? "critical" : failedLoads > 0 ? "partial data" : issues.length ? `${issues.length} notice${issues.length === 1 ? "" : "s"}` : "healthy"}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.status?.gateway_running ? "Gateway is running" : "Gateway is unavailable"}
                {data.stats?.hostname ? ` on ${data.stats.hostname}` : ""}
                {updatedAt ? ` · checked ${timeAgo(updatedAt.getTime() / 1000)}` : ""}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-border rounded-lg border border-border bg-background/20 text-center sm:min-w-[19rem]">
            <div className="px-2 py-2.5">
              <div className="text-sm font-semibold tabular-nums text-foreground">{data.status?.active_sessions ?? 0}</div>
              <div className="mt-0.5 text-[0.68rem] text-muted-foreground">active</div>
            </div>
            <div className="px-2 py-2.5">
              <div className="text-sm font-semibold tabular-nums text-foreground">{connectedPlatforms}</div>
              <div className="mt-0.5 text-[0.68rem] text-muted-foreground">channels</div>
            </div>
            <div className="px-2 py-2.5">
              <div className="text-sm font-semibold tabular-nums text-foreground">{enabledJobs}</div>
              <div className="mt-0.5 text-[0.68rem] text-muted-foreground">automations</div>
            </div>
          </div>
        </div>
      </section>

      <section aria-label="Key metrics" className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4">
        <MetricCard icon={Zap} label="Active sessions" value={data.status?.active_sessions ?? 0} detail={`${data.sessionStats?.total ?? data.sessions?.total ?? 0} conversations stored`} href="/sessions" tone={data.status?.active_sessions ? "success" : "neutral"} />
        <MetricCard icon={Radio} label="Connected channels" value={connectedPlatforms} detail={`${Object.keys(data.status?.gateway_platforms ?? {}).length} configured`} href="/channels" tone={data.status?.gateway_running ? "success" : "warning"} />
        <MetricCard icon={Bot} label="Enabled automations" value={enabledJobs} detail={`${data.jobs.length} schedules total`} href="/cron" tone={enabledJobs ? "success" : "neutral"} />
        <MetricCard icon={Server} label="Host uptime" value={data.stats?.uptime_seconds ? `${Math.floor(data.stats.uptime_seconds / 86400)}d` : "—"} detail={data.stats ? `${data.stats.os} · ${data.stats.cpu_count ?? "—"} cores` : "Host unavailable"} href="/system" />
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.75fr)]">
        <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
          <div className="p-4 sm:p-5">
            <SectionHeading title="Needs attention" description="Exceptions and failed operations, ordered by severity" href={issues.length ? "/logs" : undefined} linkLabel="Open logs" />
          </div>
          <div className="border-t border-border">
            {issues.length ? issues.slice(0, 6).map((issue) => <AttentionItem key={issue.id} issue={issue} />) : <EmptyAttention />}
          </div>
        </div>

        <Card className="min-w-0">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Cpu className="h-4 w-4 text-muted-foreground" /> Host capacity
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <ResourceMeter icon={Cpu} label="CPU" value={data.stats?.cpu_percent ?? null} detail={data.stats?.load_avg ? `Load ${data.stats.load_avg.map((value) => value.toFixed(2)).join(" / ")}` : `${data.stats?.cpu_count ?? "—"} cores`} />
            <ResourceMeter icon={Activity} label="Memory" value={data.stats?.memory?.percent ?? null} detail={data.stats?.memory ? `${formatBytes(data.stats.memory.used)} of ${formatBytes(data.stats.memory.total)}` : "Install psutil for memory metrics"} />
            <ResourceMeter icon={HardDrive} label="Disk" value={data.stats?.disk?.percent ?? null} detail={data.stats?.disk ? `${formatBytes(data.stats.disk.used)} of ${formatBytes(data.stats.disk.total)}` : "Install psutil for disk metrics"} />
          </CardContent>
        </Card>
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-2">
        <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
          <div className="p-4 sm:p-5">
            <SectionHeading title="Recent conversations" description="Pick up where you left off" href="/sessions" />
          </div>
          <div className="border-t border-border">
            {data.sessions?.sessions.length ? data.sessions.sessions.slice(0, 5).map((session) => <SessionRow key={session.id} session={session} />) : (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">No conversations yet.</div>
            )}
          </div>
        </div>

        <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
          <div className="p-4 sm:p-5">
            <SectionHeading title="Coming up" description="Next enabled scheduled runs" href="/cron" />
          </div>
          <div className="border-t border-border">
            {upcomingJobs.length ? upcomingJobs.map((job) => <JobRow key={`${job.profile || "default"}:${job.id}`} job={job} />) : (
              <div className="flex min-h-32 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No scheduled runs coming up.</p>
                <Link to="/cron" className="text-xs font-medium text-primary hover:underline">Create an automation</Link>
              </div>
            )}
          </div>
        </div>
      </section>

      <section>
        <SectionHeading title="Quick actions" description="Common operator workflows in one tap" />
        <div className="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4">
          {QUICK_ACTIONS.map(({ href, icon: Icon, label, detail }) => (
            <Link key={href} to={href} className="group flex min-h-20 min-w-0 items-center gap-3 rounded-lg border border-border bg-card p-3.5 hover:border-foreground/25 hover:bg-muted/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:p-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted/25 text-muted-foreground group-hover:text-foreground"><Icon className="h-4 w-4" /></span>
              <span className="min-w-0"><span className="block truncate text-sm font-medium text-foreground">{label}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{detail}</span></span>
            </Link>
          ))}
        </div>
      </section>

      <PluginSlot name="overview:bottom" />
    </div>
  );
}
