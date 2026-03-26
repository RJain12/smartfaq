"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  BarChart3,
  ClipboardList,
  Database,
  Download,
  Globe,
  Layers,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import { noteIdToPatientLabel } from "@/lib/study";

type Stats = {
  totalEventSessions: number;
  responseCount: number;
  uniqueSessionsWithSubmit: number;
  funnel: Record<string, number>;
  deviceCounts: Record<string, number>;
  countryCounts: Record<string, number>;
  qTouch: Record<string, number>;
  submitCounts: Record<string, number>;
  submissionsByForm: Record<string, number>;
  submitDestinationCounts: { key: string; label: string; count: number }[];
  likertMeans: { note_id: string; item: string; mean: number; n: number }[];
  recentResponses: Record<string, unknown>[];
  storage?: {
    surveyRowsInGoogleSheets: boolean;
    adminAnalyticsUsesKv: boolean;
    adminMissingSubmissionsUnlessKv: boolean;
  };
  generatedAt?: string;
};

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const w = max > 0 ? Math.round((100 * value) / max) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="w-44 shrink-0 truncate text-[#495057]" title={label}>
        {label}
      </div>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-[#17a2b8] transition-all" style={{ width: `${w}%` }} />
      </div>
      <div className="w-10 shrink-0 tabular-nums text-right font-medium text-[#2c3e50]">{value}</div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-[#e7f1ff] p-2 text-[#138496]">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-[#6c757d]">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-[#2c3e50]">{value}</p>
          {hint ? <p className="mt-1 text-xs leading-snug text-[#6c757d]">{hint}</p> : null}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="flex items-center gap-2 text-base font-semibold text-[#2c3e50]">
        <Icon className="h-5 w-5 text-[#17a2b8]" aria-hidden />
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState("");
  const [exporting, setExporting] = useState(false);

  const login = async () => {
    setErr("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      setErr("Wrong password.");
      return;
    }
    setAuthed(true);
    await refresh();
  };

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/stats");
    if (res.status === 401) {
      setAuthed(false);
      setErr("Session expired.");
      return;
    }
    if (!res.ok) return;
    setStats((await res.json()) as Stats);
  }, []);

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthed(false);
    setStats(null);
  };

  const downloadCsv = async () => {
    setExporting(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/export", { credentials: "include" });
      if (res.status === 401) {
        setAuthed(false);
        setErr("Session expired. Sign in again.");
        return;
      }
      if (!res.ok) {
        setErr("Export failed.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `smartfaq-responses-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErr("Export failed.");
    } finally {
      setExporting(false);
    }
  };

  const funnelMax = stats ? Math.max(1, ...Object.values(stats.funnel)) : 1;
  const deviceMax = stats ? Math.max(1, ...Object.values(stats.deviceCounts)) : 1;
  const countryMax = stats ? Math.max(1, ...Object.values(stats.countryCounts)) : 1;
  const qKeys = useMemo(
    () =>
      stats ? Object.entries(stats.qTouch).sort((a, b) => b[1] - a[1]).slice(0, 30) : [],
    [stats]
  );

  const formMax = stats
    ? Math.max(1, ...Object.values(stats.submissionsByForm), ...Object.values(stats.submitCounts))
    : 1;

  const generatedLabel = stats?.generatedAt
    ? new Date(stats.generatedAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-[#212529]">
      <header className="bg-[#2c3e50] px-4 py-3 text-white sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold sm:text-lg">SmartFAQs — Study dashboard</h1>
            <p className="text-xs text-white/70">Team-only analytics & exports</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/"
              className="rounded border border-white/30 px-3 py-1.5 text-sm text-white/90 hover:bg-white/10"
            >
              Open survey
            </Link>
            {authed && (
              <>
                <button
                  type="button"
                  onClick={() => void downloadCsv()}
                  disabled={exporting}
                  className="inline-flex items-center gap-1.5 rounded border border-white/30 bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/15 disabled:opacity-50"
                >
                  <Download className="h-4 w-4" aria-hidden />
                  {exporting ? "Exporting…" : "Download CSV"}
                </button>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="inline-flex items-center gap-1.5 rounded border border-white/30 bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/15"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="rounded border border-white/30 px-3 py-1.5 text-sm text-white/90 hover:bg-white/10"
                >
                  Log out
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {!authed ? (
          <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#2c3e50]">Sign in</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#495057]">
              Enter the study team password to view session analytics, submission counts, and download response data
              stored in this app&apos;s database (Upstash on Vercel, or local files in development).
            </p>
            <input
              type="password"
              className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#17a2b8] focus:ring-2 focus:ring-[#17a2b8]/25"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void login()}
              autoComplete="current-password"
            />
            {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
            <button
              type="button"
              onClick={() => void login()}
              className="mt-4 w-full rounded-lg bg-[#2c3e50] py-2.5 text-sm font-semibold text-white transition hover:bg-[#34495e]"
            >
              Unlock dashboard
            </button>
          </div>
        ) : stats ? (
          <>
            {stats.storage?.adminMissingSubmissionsUnlessKv && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <strong className="font-semibold">Responses not mirrored here.</strong> Submissions are configured to
                write to an external spreadsheet only, without copying rows into this app&apos;s database. This dashboard
                will stay empty for counts and CSV. Add Upstash/KV environment variables on Vercel to mirror each
                submission here, or use your spreadsheet as the system of record.
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6c757d]">
              {generatedLabel ? <span>Data snapshot: {generatedLabel}</span> : null}
              <span className="font-mono text-[11px]">
                Loads up to 50k responses / 50k events from KV for accuracy.
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi
                icon={Activity}
                label="Tracked sessions"
                value={stats.totalEventSessions}
                hint="Unique session IDs in loaded events"
              />
              <Kpi
                icon={ClipboardList}
                label="Note submissions"
                value={stats.responseCount}
                hint="Rows in KV / local store (this dashboard)"
              />
              <Kpi
                icon={Layers}
                label="Sessions with ≥1 submit"
                value={stats.uniqueSessionsWithSubmit}
                hint="Distinct session_id on saved rows"
              />
              <Kpi
                icon={Database}
                label="Data backend"
                value={stats.storage?.adminAnalyticsUsesKv ? "KV active" : "Local file"}
                hint={
                  stats.storage?.surveyRowsInGoogleSheets
                    ? "Sheet append also configured (not read here)"
                    : "No Sheet env on server"
                }
              />
            </div>

            {stats.submitDestinationCounts.length > 0 && (
              <Section title="Submission pipeline (server)" icon={BarChart3}>
                <p className="mb-3 text-xs text-[#6c757d]">
                  From <code className="rounded bg-slate-100 px-1">submit_success</code> events — where each POST
                  landed.
                </p>
                <div className="space-y-2">
                  {stats.submitDestinationCounts.map((row) => (
                    <Bar key={row.key} label={row.label} value={row.count} max={stats.responseCount || 1} />
                  ))}
                </div>
              </Section>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              <Section title="Submissions by form" icon={Layers}>
                {Object.keys(stats.submissionsByForm).length === 0 ? (
                  <p className="text-sm text-[#6c757d]">No responses loaded.</p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(stats.submissionsByForm)
                      .sort((a, b) => b[1] - a[1])
                      .map(([k, v]) => (
                        <Bar key={k} label={`Form ${k}`} value={v} max={formMax} />
                      ))}
                  </div>
                )}
              </Section>

              <Section title="Submissions by note" icon={ClipboardList}>
                {Object.keys(stats.submitCounts).length === 0 ? (
                  <p className="text-sm text-[#6c757d]">No responses loaded.</p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(stats.submitCounts)
                      .sort((a, b) => b[1] - a[1])
                      .map(([k, v]) => (
                        <Bar
                          key={k}
                          label={`${noteIdToPatientLabel(k)} (${k})`}
                          value={v}
                          max={formMax}
                        />
                      ))}
                  </div>
                )}
              </Section>
            </div>

            <Section title="Funnel (unique sessions)" icon={Activity}>
              <div className="space-y-2">
                {Object.entries(stats.funnel).map(([k, v]) => (
                  <Bar key={k} label={k.replace(/_/g, " ")} value={v} max={funnelMax} />
                ))}
              </div>
            </Section>

            <div className="grid gap-6 lg:grid-cols-2">
              <Section title="Device (from session)" icon={Smartphone}>
                <div className="space-y-2">
                  {Object.keys(stats.deviceCounts).length === 0 ? (
                    <p className="text-sm text-[#6c757d]">No device data.</p>
                  ) : (
                    Object.entries(stats.deviceCounts).map(([k, v]) => (
                      <Bar key={k} label={k} value={v} max={deviceMax} />
                    ))
                  )}
                </div>
              </Section>

              <Section title="Country (Vercel / client)" icon={Globe}>
                <div className="space-y-2">
                  {Object.keys(stats.countryCounts).length === 0 ? (
                    <p className="text-sm text-[#6c757d]">No country data (common on localhost).</p>
                  ) : (
                    Object.entries(stats.countryCounts)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 16)
                      .map(([k, v]) => <Bar key={k} label={k} value={v} max={countryMax} />)
                  )}
                </div>
              </Section>
            </div>

            <Section title="Question touches (sample)" icon={BarChart3}>
              <div className="space-y-2">
                {qKeys.length === 0 ? (
                  <p className="text-sm text-[#6c757d]">No touches yet.</p>
                ) : (
                  qKeys.map(([k, v]) => <Bar key={k} label={k} value={v} max={qKeys[0]![1]} />)
                )}
              </div>
            </Section>

            <Section title="Likert means by note" icon={BarChart3}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[#6c757d]">
                      <th className="py-2 pr-3">Note</th>
                      <th className="py-2 pr-3">Item</th>
                      <th className="py-2 pr-3">Mean</th>
                      <th className="py-2">n</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.likertMeans.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-4 text-sm text-[#6c757d]">
                          No Likert data (1–10) in loaded responses.
                        </td>
                      </tr>
                    ) : (
                      stats.likertMeans.map((row, i) => (
                        <tr key={i} className="border-b border-slate-100">
                          <td className="py-2 pr-3 font-mono text-[11px]">{row.note_id}</td>
                          <td className="py-2 pr-3">{row.item}</td>
                          <td className="py-2 pr-3 tabular-nums">{row.mean.toFixed(2)}</td>
                          <td className="py-2 tabular-nums">{row.n}</td>
                      </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section title="Recent submissions" icon={ClipboardList}>
              <p className="mb-3 text-xs text-[#6c757d]">
                Newest first (60 rows). Contains PII — keep this dashboard access-controlled. Full export: Download
                CSV.
              </p>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="bg-slate-50">
                    <tr className="text-[#6c757d]">
                      <th className="px-2 py-2 pr-2">Time (UTC)</th>
                      <th className="px-2 py-2 pr-2">Form</th>
                      <th className="px-2 py-2 pr-2">Patient</th>
                      <th className="px-2 py-2 pr-2">Note ID</th>
                      <th className="px-2 py-2 pr-2">Email</th>
                      <th className="px-2 py-2">HC understand</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentResponses.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-2 py-6 text-center text-sm text-[#6c757d]">
                          No rows in KV / local store.
                        </td>
                      </tr>
                    ) : (
                      stats.recentResponses.map((r, i) => (
                        <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/80">
                          <td className="whitespace-nowrap px-2 py-2 font-mono text-[11px]">
                            {String(r.submitted_at_utc ?? "")}
                          </td>
                          <td className="px-2 py-2">{String(r.form_id ?? "")}</td>
                          <td className="px-2 py-2 font-medium">{noteIdToPatientLabel(String(r.note_id ?? ""))}</td>
                          <td className="px-2 py-2 font-mono text-[11px]">{String(r.note_id ?? "")}</td>
                          <td className="max-w-[180px] truncate px-2 py-2" title={String(r.participant_email ?? "")}>
                            {String(r.participant_email ?? "")}
                          </td>
                          <td className="px-2 py-2 tabular-nums">{String(r.hc_understand ?? "")}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Section>
          </>
        ) : (
          <p className="text-sm text-[#6c757d]">Loading dashboard…</p>
        )}

        {authed && err && !stats ? <p className="text-sm text-rose-600">{err}</p> : null}
        {authed && stats && err ? <p className="text-sm text-rose-600">{err}</p> : null}
      </div>
    </div>
  );
}
