import type { CronJob, StatusResponse, SystemStats } from "@/lib/api";

export type OperationalIssueSeverity = "critical" | "warning";

export interface OperationalIssue {
  id: string;
  severity: OperationalIssueSeverity;
  title: string;
  detail: string;
  href: string;
}

const HEALTHY_PLATFORM_STATES = new Set([
  "connected",
  "healthy",
  "online",
  "ready",
  "running",
]);

const FAILED_JOB_STATES = new Set(["error", "failed", "failure"]);

export function isHealthyPlatformState(state: string | null | undefined): boolean {
  return HEALTHY_PLATFORM_STATES.has((state ?? "").trim().toLowerCase());
}

export function countHealthyPlatforms(status: StatusResponse | null): number {
  if (!status) return 0;
  return Object.values(status.gateway_platforms).filter((platform) =>
    isHealthyPlatformState(platform.state),
  ).length;
}

function resourceIssue(
  id: string,
  label: string,
  percent: number | undefined,
): OperationalIssue | null {
  if (typeof percent !== "number" || percent < 85) return null;
  const critical = percent >= 95;
  return {
    id,
    severity: critical ? "critical" : "warning",
    title: `${label} is ${critical ? "critically" : "heavily"} utilized`,
    detail: `${Math.round(percent)}% in use`,
    href: id === "disk" ? "/storage" : "/system",
  };
}

export function collectOperationalIssues(
  status: StatusResponse | null,
  stats: SystemStats | null,
  jobs: CronJob[],
): OperationalIssue[] {
  const issues: OperationalIssue[] = [];

  if (status && !status.gateway_running) {
    issues.push({
      id: "gateway",
      severity: "critical",
      title: "Gateway is stopped",
      detail: status.gateway_exit_reason || status.gateway_state || "Messaging is unavailable",
      href: "/system",
    });
  }

  if (
    status &&
    status.latest_config_version > status.config_version
  ) {
    issues.push({
      id: "config-version",
      severity: "warning",
      title: "Configuration needs migration",
      detail: `Version ${status.config_version} of ${status.latest_config_version}`,
      href: "/config",
    });
  }

  for (const [name, platform] of Object.entries(status?.gateway_platforms ?? {})) {
    const state = platform.state.trim().toLowerCase();
    if (platform.error_message || state === "error" || state === "failed") {
      issues.push({
        id: `platform:${name}`,
        severity: "warning",
        title: `${name} needs attention`,
        detail: platform.error_message || platform.state,
        href: "/channels",
      });
    }
  }

  const resourceIssues = [
    resourceIssue("cpu", "CPU", stats?.cpu_percent),
    resourceIssue("memory", "Memory", stats?.memory?.percent),
    resourceIssue("disk", "Disk", stats?.disk?.percent),
  ].filter((issue): issue is OperationalIssue => issue !== null);
  issues.push(...resourceIssues);

  for (const job of jobs) {
    const statusValue = (job.last_status ?? "").trim().toLowerCase();
    if (!job.last_error && !job.last_delivery_error && !FAILED_JOB_STATES.has(statusValue)) {
      continue;
    }
    issues.push({
      id: `cron:${job.profile ?? "default"}:${job.id}`,
      severity: "warning",
      title: `${job.name || "Scheduled job"} failed`,
      detail: job.last_error || job.last_delivery_error || job.last_status || "Last run failed",
      href: "/cron",
    });
  }

  return issues.sort((a, b) => {
    if (a.severity === b.severity) return a.title.localeCompare(b.title);
    return a.severity === "critical" ? -1 : 1;
  });
}

export function operationalSummary(issues: OperationalIssue[]): string {
  if (issues.some((issue) => issue.severity === "critical")) return "Action required";
  if (issues.length > 0) return "Review recommended";
  return "All systems operational";
}
