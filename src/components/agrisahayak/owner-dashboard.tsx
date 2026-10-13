"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Sprout,
  Users,
  Wifi,
} from "lucide-react";
import { useAuth } from "@/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OWNER_EMAIL, type OwnerOverview } from "@/lib/owner-admin";
import type { WorkspaceApi } from "@/lib/farmer-workspace";
import FarmerWorkspace, { farmCard } from "./farmer-workspace";
const when = (v: string | null) =>
  v
    ? new Date(v).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Not recorded";
export default function OwnerDashboard() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<OwnerOverview | null>(null),
    [selected, setSelected] = useState(""),
    [search, setSearch] = useState(""),
    [term, setTerm] = useState(""),
    [filter, setFilter] = useState("all"),
    [page, setPage] = useState(1),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const sequence = useRef(0);
  const api = useCallback<WorkspaceApi>(
    async (query = "", action) => {
      if (!user) throw new Error("Please sign in again.");
      const response = await fetch(`/api/owner${query}`, {
        method: action ? "POST" : "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${await user.getIdToken()}`,
          ...(action ? { "Content-Type": "application/json" } : {}),
        },
        ...(action ? { body: JSON.stringify(action) } : {}),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Unable to open this account.");
      return result;
    },
    [user],
  );
  const load = useCallback(
    async (silent = false) => {
      const id = ++sequence.current;
      if (!silent) setLoading(true);
      try {
        const result = await api<OwnerOverview>(
          `?${new URLSearchParams({ search: term, filter, page: String(page) })}`,
        );
        if (id === sequence.current) {
          setOverview(result);
          setError("");
        }
      } catch (e) {
        if (id === sequence.current) setError((e as Error).message);
      } finally {
        if (id === sequence.current) setLoading(false);
      }
    },
    [api, term, filter, page],
  );
  useEffect(() => {
    const t = setTimeout(() => {
      setTerm(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    if (selected) return;
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 60000);
    return () => {
      sequence.current++;
      clearInterval(timer);
    };
  }, [load, selected]);
  if (selected)
    return (
      <FarmerWorkspace
        key={selected}
        uid={selected}
        owner
        api={api}
        onBack={() => setSelected("")}
      />
    );
  const metrics = [
    {
      name: "Registered accounts",
      value: overview?.stats.farmers,
      icon: Users,
    },
    { name: "Active now", value: overview?.stats.online, icon: Wifi },
    { name: "Total crops", value: overview?.stats.crops, icon: Sprout },
    {
      name: "Diagnosis reports",
      value: overview?.stats.reports,
      icon: FileText,
    },
  ];
  return (
    <div className="mx-auto max-w-[1600px] space-y-6 text-slate-900">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">
            Administration
          </p>
          <h1 className="mt-2 text-3xl font-bold">Owner dashboard</h1>
          <p className="mt-2 text-sm text-slate-500">
            Open and manage a farmer’s complete account workspace.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-white px-4 py-3">
          <ShieldCheck className="text-emerald-700" />
          <div>
            <p className="text-sm font-semibold">Website owner</p>
            <p className="text-xs text-slate-500">{OWNER_EMAIL}</p>
          </div>
        </div>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
          <Button
            variant="outline"
            size="sm"
            className="ml-3"
            onClick={() => void load()}
          >
            Retry
          </Button>
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {metrics.map((m) => (
          <section
            key={m.name}
            className={`${farmCard} flex items-center gap-3 !p-4`}
          >
            <span className="rounded-full bg-emerald-50 p-3 text-emerald-700">
              <m.icon size={23} />
            </span>
            <div>
              <p className="text-xs text-slate-500">{m.name}</p>
              <p className="mt-1 text-3xl font-semibold">{m.value ?? "—"}</p>
            </div>
          </section>
        ))}
      </div>
      <section className={farmCard}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Farmers</h2>
            <p className="mt-1 text-xs text-slate-500">
              Crops, plants, reports, history and account controls
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span className="ml-2">Refresh</span>
          </Button>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <div className="relative min-w-[180px] flex-1">
            <Search
              size={16}
              className="absolute left-3 top-3 text-slate-400"
            />
            <Input
              aria-label="Search farmers"
              className="pl-9"
              placeholder="Search by name, email or city"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            aria-label="Filter accounts"
            className="rounded-lg border bg-white px-3 py-2 text-sm"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All accounts</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                {["Farmer", "Crops", "Reports", "Last active", "Action"].map(
                  (t) => (
                    <th className="p-3 font-medium" key={t}>
                      {t}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {overview?.farmers.map((f) => (
                <tr key={f.uid}>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-800">
                        {f.name.charAt(0)}
                      </span>
                      <div>
                        <p className="font-semibold">{f.name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {f.protected
                            ? "Owner account"
                            : f.disabled
                              ? "Suspended"
                              : f.location || f.email || f.phone}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3">{f.cropCount}</td>
                  <td className="p-3">{f.reportCount}</td>
                  <td className="whitespace-nowrap p-3 text-xs">
                    {f.online ? (
                      <span className="text-emerald-700">Active now</span>
                    ) : (
                      when(f.lastSeenAt || f.lastSignInAt)
                    )}
                  </td>
                  <td className="p-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="whitespace-nowrap border-emerald-200 text-emerald-800"
                      onClick={() => setSelected(f.uid)}
                    >
                      Open farmer account
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && !overview && (
          <p
            role="status"
            className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500"
          >
            <Loader2 size={18} className="animate-spin" />
            Loading registered accounts…
          </p>
        )}
        {overview && !overview.farmers.length && (
          <p className="py-10 text-center text-sm text-slate-500">
            No farmers match this search.
          </p>
        )}
        {overview && (
          <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500">
            <p>
              {overview.total} accounts · Page {overview.page}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                aria-label="Previous farmer page"
                disabled={overview.page <= 1 || loading}
                onClick={() => setPage(overview.page - 1)}
              >
                <ArrowLeft size={15} />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Next farmer page"
                disabled={
                  overview.page * overview.pageSize >= overview.total || loading
                }
                onClick={() => setPage(overview.page + 1)}
              >
                <ArrowRight size={15} />
              </Button>
            </div>
          </div>
        )}
      </section>
      <section className={farmCard}>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Activity size={19} />
          Recent owner actions
        </h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {overview?.activity.map((a) => (
            <div key={a.id} className="rounded-xl bg-slate-50 p-3">
              <p className="text-sm">
                {a.targetName} · {a.action.replaceAll(".", " · ")}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {when(a.createdAt)} · {a.status}
              </p>
            </div>
          ))}
        </div>
        {!overview?.activity.length && (
          <p className="mt-4 text-sm text-slate-500">
            Owner changes will appear here.
          </p>
        )}
      </section>
    </div>
  );
}
