"use client";

import { useCallback, useState } from "react";
import Link from "next/link";

type Stats = {
  totalEventSessions: number;
  responseCount: number;
  funnel: Record<string, number>;
  deviceCounts: Record<string, number>;
  countryCounts: Record<string, number>;
  qTouch: Record<string, number>;
  submitCounts: Record<string, number>;
  likertMeans: { note_id: string; item: string; mean: number; n: number }[];
  recentResponses: Record<string, unknown>[];
};

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const w = max > 0 ? Math.round((100 * value) / max) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="w-40 shrink-0 truncate text-slate-600" title={label}>{label}</div>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${w}%` }} />
      </div>
      <div className="w-10 tabular-nums text-right text-slate-800">{value}</div>
    </div>
  );
}

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState("");

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

  const funnelMax = stats ? Math.max(1, ...Object.values(stats.funnel)) : 1;
  const deviceMax = stats ? Math.max(1, ...Object.values(stats.deviceCounts)) : 1;
  const countryMax = stats ? Math.max(1, ...Object.values(stats.countryCounts)) : 1;
  const qKeys = stats
    ? Object.entries(stats.qTouch).sort((a, b) => b[1] - a[1]).slice(0, 25)
    : [];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <h1 className="text-lg font-semibold">SmartFAQs — admin</h1>
          <div className="flex gap-2">
            <Link href="/" className="rounded-lg px-3 py-1.5 text-sm text-teal-700 hover:underline">
              Survey
            </Link>
            {authed && (
              <>
                <button type="button" onClick={() => void refresh()} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm">
                  Refresh
                </button>
                <button type="button" onClick={() => void logout()} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm">
                  Log out
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
        {!authed ? (
          <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-600">Sign in to view analytics (stored in <code className="rounded bg-slate-100 px-1">.data/</code> locally or Upstash on Vercel).</p>
            <input
              type="password"
              className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void login()}
            />
            {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
            <button
              type="button"
              onClick={() => void login()}
              className="mt-4 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-medium text-white"
            >
              Unlock
            </button>
          </div>
        ) : stats ? (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase text-slate-500">Sessions (events)</p>
                <p className="text-2xl font-semibold">{stats.totalEventSessions}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase text-slate-500">Saved responses</p>
                <p className="text-2xl font-semibold">{stats.responseCount}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase text-slate-500">Question touches (tracked)</p>
                <p className="text-2xl font-semibold">{Object.keys(stats.qTouch).length}</p>
              </div>
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-800">Funnel (unique sessions)</h2>
              <div className="mt-4 space-y-2">
                {Object.entries(stats.funnel).map(([k, v]) => (
                  <Bar key={k} label={k} value={v} max={funnelMax} />
                ))}
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-800">Device (UA heuristic)</h2>
                <div className="mt-4 space-y-2">
                  {Object.entries(stats.deviceCounts).map(([k, v]) => (
                    <Bar key={k} label={k} value={v} max={deviceMax} />
                  ))}
                </div>
              </section>
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-800">Country (Vercel / client)</h2>
                <div className="mt-4 space-y-2">
                  {Object.entries(stats.countryCounts).length === 0 ? (
                    <p className="text-sm text-slate-500">No country data yet (local dev often blank).</p>
                  ) : (
                    Object.entries(stats.countryCounts)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 12)
                      .map(([k, v]) => <Bar key={k} label={k} value={v} max={countryMax} />)
                  )}
                </div>
              </section>
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-800">Top question touches</h2>
              <div className="mt-4 space-y-2">
                {qKeys.length === 0 ? (
                  <p className="text-sm text-slate-500">No touches yet.</p>
                ) : (
                  qKeys.map(([k, v]) => <Bar key={k} label={k} value={v} max={qKeys[0]![1]} />)
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-800">Submissions by note</h2>
              <div className="mt-4 space-y-2">
                {Object.entries(stats.submitCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, v]) => (
                    <Bar key={k} label={k} value={v} max={Math.max(1, ...Object.values(stats.submitCounts))} />
                  ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-800">Likert means by note</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-2">Note</th>
                      <th className="py-2 pr-2">Item</th>
                      <th className="py-2 pr-2">Mean</th>
                      <th className="py-2">n</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.likertMeans.slice(0, 80).map((row, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="py-1.5 font-mono">{row.note_id}</td>
                        <td className="py-1.5">{row.item}</td>
                        <td className="py-1.5 tabular-nums">{row.mean.toFixed(2)}</td>
                        <td className="py-1.5 tabular-nums">{row.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-800">Recent responses</h2>
              <p className="mt-1 text-xs text-slate-500">Contains email — protect this page.</p>
              <div className="mt-4 overflow-x-auto text-xs">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="py-2 pr-2">Time</th>
                      <th className="py-2 pr-2">Form</th>
                      <th className="py-2 pr-2">Note</th>
                      <th className="py-2 pr-2">Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentResponses.map((r, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="py-1.5 whitespace-nowrap">{String(r.submitted_at_utc ?? "")}</td>
                        <td className="py-1.5">{String(r.form_id ?? "")}</td>
                        <td className="py-1.5 font-mono">{String(r.note_id ?? "")}</td>
                        <td className="py-1.5">{String(r.participant_email ?? "")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : (
          <p className="text-sm text-slate-500">Loading…</p>
        )}
      </div>
    </div>
  );
}
