"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Plus, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MyCrop, MyPlant } from "@/lib/my-crops/models";
import { CropFrame, LoadState, useCropData } from "./shared";
const CropWorkspace = dynamic(
  () => import("@/components/crop-care/crop-workspace"),
  { loading: () => <p role="status">Opening crop reports and care…</p> },
);

export function PlantsPage({ cropId }: { cropId: string }) {
  const cropState = useCropData<MyCrop>(`crops/${cropId}`);
  const plants = useCropData<MyPlant>(`crops/${cropId}/plants`, true);
  const [plantId, setPlantId] = useState("");
  const crop = cropState.data[0];
  const plant = plants.data.find((p) => p.id === plantId);
  const loading = cropState.loading || plants.loading;
  const error = cropState.error || plants.error;
  return (
    <CropFrame
      wide
      title={crop?.name || "Your crop"}
      eyebrow="MY CROPS"
      subtitle="Reports, progress and care — together for every growing season."
      back={{ href: "/my-crops", label: "All my crops" }}
    >
      <LoadState loading={loading} error={error} missing={!loading && !crop} />
      {!loading && !error && crop && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-emerald-100 bg-white p-4">
            <div className="min-w-0 flex-1 basis-64">
              <label
                htmlFor="crop-plant"
                className="text-sm font-medium text-emerald-950"
              >
                Plant / growing area
              </label>
              <select
                id="crop-plant"
                className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                value={plantId}
                onChange={(e) => setPlantId(e.target.value)}
              >
                <option value="">All growing areas · {crop.name}</option>
                {plants.data.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.code}
                  </option>
                ))}
              </select>
            </div>
            <Button asChild variant="outline">
              <Link href={`/my-crops/${cropId}/new`}>
                <Plus className="mr-2 h-4 w-4" />
                Add a plant
              </Link>
            </Button>
          </div>
          {plant && (
            <div className="flex items-center gap-3 px-1">
              <img
                src={plant.imageThumb}
                alt={plant.name}
                className="h-14 w-14 rounded-xl object-cover"
              />
              <div>
                <h2 className="font-semibold text-emerald-950">{plant.name}</h2>
                <p className="text-xs text-slate-500">
                  {plant.code} · {plant.recordCount} saved checks
                </p>
              </div>
              <Button asChild variant="link" size="sm">
                <Link href={`/my-crops/${cropId}/${plant.id}`}>Open plant</Link>
              </Button>
            </div>
          )}
          {!plants.data.length && (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Sprout className="h-4 w-4 shrink-0" />
              Track a field by season, or add a named plant for repeat-photo
              comparisons.
            </p>
          )}
          <Suspense fallback={<p role="status">Opening crop care…</p>}>
            <CropWorkspace
              key={cropId + (plant?.id || "")}
              crop={crop}
              plant={plant}
            />
          </Suspense>
        </div>
      )}
    </CropFrame>
  );
}
