"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ShieldCheck, Sprout, RefreshCw } from "lucide-react";
import { useAuth } from "@/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { WorkspaceApi } from "@/lib/farmer-workspace";
import FarmerWorkspace, { farmCard } from "./farmer-workspace";
type Profile = { uid: string; name: string; city: string };
type Mine = { enabled: boolean; previouslyShared: boolean };
export default function CommunityPanel() {
  const { user } = useAuth();
  const [farmers, setFarmers] = useState<Profile[]>([]),
    [mine, setMine] = useState<Mine | null>(null),
    [selected, setSelected] = useState(""),
    [search, setSearch] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const seq = useRef(0);
  const api = useCallback<WorkspaceApi>(
    async (query = "", action) => {
      if (!user) throw new Error("Please sign in.");
      const response = await fetch(`/api/community${query}`, {
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
        throw new Error(result.error || "Unable to load the community.");
      return result;
    },
    [user],
  );
  const load = useCallback(
    async (silent = false) => {
      const request = ++seq.current;
      if (!silent) setLoading(true);
      try {
        const [directory, own] = await Promise.all([
          api<{ farmers: Profile[] }>(),
          api<Mine>("?resource=mine"),
        ]);
        if (request !== seq.current) return;
        setFarmers(directory.farmers);
        setMine(own);
        setError("");
      } catch (e) {
        if (request === seq.current) setError((e as Error).message);
      } finally {
        if (request === seq.current) setLoading(false);
      }
    },
    [api],
  );
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 60000);
    return () => {
      seq.current++;
      clearInterval(timer);
    };
  }, [load]);
  async function toggle(enabled: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api("", { action: "sharing.set", enabled });
      setMine({ enabled, previouslyShared: false });
      setNotice(
        enabled
          ? "Your crops, plant images, full reports and care progress are now shared with signed-in farmers."
          : "Your profile and farm records are now hidden from other farmers.",
      );
      if (!enabled && selected === user?.uid) setSelected("");
      await load(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const visible = farmers.filter((p) =>
    `${p.name} ${p.city}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-bold">Farmer community</h1>
        <p className="mt-2 text-sm text-slate-500">
          Learn from shared crops, reports and growing journeys.
        </p>
      </header>
      <section className="flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck size={28} className="shrink-0 text-emerald-700" />
          <div>
            <label
              htmlFor="share-my-information"
              className="text-lg font-semibold"
            >
              Share my information
            </label>
            <p
              id="sharing-details"
              className="mt-1 max-w-2xl text-sm leading-6 text-slate-600"
            >
              Share your name, city, crops, plant images, full reports, care
              history and progress with signed-in farmers. Phone, email, exact
              address and login details stay private.
            </p>
            {mine?.previouslyShared && (
              <p className="mt-2 text-xs text-emerald-800">
                This replaces the earlier per-report sharing. Turn ON to allow
                the expanded profile.
              </p>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-end gap-3">
            <Switch
              id="share-my-information"
              aria-describedby="sharing-details"
              checked={mine?.enabled || false}
              disabled={!mine || busy}
              onCheckedChange={(value) => void toggle(value)}
            />
            <span className="text-sm font-semibold text-emerald-800">
              {busy ? "Saving…" : mine?.enabled ? "ON" : "OFF"}
            </span>
          </div>
          <p className="max-w-xs text-xs leading-5 text-slate-500">
            Turn off to hide your profile. You can still browse shared farmers.
          </p>
        </div>
      </section>
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
      {notice && (
        <p role="status" className="text-sm text-emerald-800">
          {notice}
        </p>
      )}
      {selected ? (
        <FarmerWorkspace
          key={selected}
          uid={selected}
          owner={false}
          api={api}
          onBack={() => setSelected("")}
        />
      ) : (
        <>
          <div className="flex flex-wrap justify-between gap-3">
            <Input
              className="max-w-md"
              aria-label="Search community farmers"
              placeholder="Search farmer name or city"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => void load()}
            >
              <RefreshCw size={15} className="mr-2" />
              Refresh
            </Button>
          </div>
          {loading && (
            <p role="status" className="text-sm text-slate-500">
              Loading community…
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((p) => (
              <article key={p.uid} className={farmCard}>
                <span className="inline-flex rounded-xl bg-emerald-50 p-3 text-emerald-700">
                  <Sprout />
                </span>
                <h2 className="mt-3 text-lg font-semibold">
                  {p.name}
                  {p.uid === user?.uid ? " (you)" : ""}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {p.city || "City not shared"}
                </p>
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Crops, full reports, care history and progress · View only
                </p>
                <Button
                  variant="outline"
                  className="mt-4 w-full border-emerald-200 text-emerald-800"
                  onClick={() => setSelected(p.uid)}
                >
                  Open shared account
                </Button>
              </article>
            ))}
          </div>
          {!loading && !visible.length && (
            <p className={farmCard}>
              {search
                ? "No matching shared farmers."
                : "No farmers have enabled full profile sharing yet. Profiles appear here when their owners turn on “Share my information”."}
            </p>
          )}
        </>
      )}
    </div>
  );
}
