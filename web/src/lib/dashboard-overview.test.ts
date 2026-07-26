import { describe, expect, it } from "vitest";
import type { CronJob, StatusResponse, SystemStats } from "@/lib/api";
import {
  collectOperationalIssues,
  countHealthyPlatforms,
  operationalSummary,
} from "./dashboard-overview";

function status(overrides: Partial<StatusResponse> = {}): StatusResponse {
  return {
    active_sessions: 0,
    config_path: "config.yaml",
    config_version: 3,
    env_path: ".env",
    gateway_exit_reason: null,
    gateway_health_url: null,
    gateway_pid: 42,
    gateway_platforms: {},
    gateway_running: true,
    gateway_state: "running",
    gateway_updated_at: null,
    hermes_home: ".hermes",
    latest_config_version: 3,
    release_date: "",
    version: "test",
    ...overrides,
  };
}

function stats(overrides: Partial<SystemStats> = {}): SystemStats {
  return {
    os: "Linux",
    os_release: "test",
    os_version: "test",
    platform: "linux",
    arch: "x64",
    hostname: "host",
    python_version: "3.11",
    python_impl: "CPython",
    hermes_version: "test",
    cpu_count: 4,
    psutil: true,
    ...overrides,
  };
}

describe("dashboard operational overview", () => {
  it("recognizes healthy platform states without counting stopped channels", () => {
    expect(
      countHealthyPlatforms(
        status({
          gateway_platforms: {
            telegram: { state: "connected", updated_at: "" },
            discord: { state: "READY", updated_at: "" },
            slack: { state: "stopped", updated_at: "" },
          },
        }),
      ),
    ).toBe(2);
  });

  it("surfaces service, capacity, configuration, channel, and automation failures", () => {
    const jobs: CronJob[] = [
      {
        id: "brief",
        name: "Daily brief",
        enabled: true,
        last_status: "failed",
        last_error: "provider unavailable",
      },
    ];
    const issues = collectOperationalIssues(
      status({
        gateway_running: false,
        gateway_exit_reason: "process exited",
        config_version: 2,
        latest_config_version: 3,
        gateway_platforms: {
          telegram: {
            state: "error",
            error_message: "token rejected",
            updated_at: "",
          },
        },
      }),
      stats({
        cpu_percent: 86,
        memory: { total: 100, available: 3, used: 97, percent: 97 },
        disk: { total: 100, used: 50, free: 50, percent: 50 },
      }),
      jobs,
    );

    expect(issues.map((issue) => issue.id)).toEqual(
      expect.arrayContaining([
        "gateway",
        "config-version",
        "platform:telegram",
        "cpu",
        "memory",
        "cron:default:brief",
      ]),
    );
    expect(issues[0].severity).toBe("critical");
    expect(operationalSummary(issues)).toBe("Action required");
  });

  it.each(["disconnected", "retrying", "fatal", "startup_failed"])(
    "treats a %s channel as needing attention without an error message",
    (stateValue) => {
      const issues = collectOperationalIssues(
        status({
          gateway_platforms: {
            telegram: { state: stateValue, updated_at: "" },
          },
        }),
        stats(),
        [],
      );

      expect(issues).toEqual([
        expect.objectContaining({
          id: "platform:telegram",
          severity: "warning",
          detail: stateValue,
        }),
      ]);
      expect(operationalSummary(issues)).toBe("Review recommended");
    },
  );

  it("reports a clean system when no signal needs action", () => {
    const issues = collectOperationalIssues(status(), stats({ cpu_percent: 12 }), []);
    expect(issues).toEqual([]);
    expect(operationalSummary(issues)).toBe("All systems operational");
  });
});
