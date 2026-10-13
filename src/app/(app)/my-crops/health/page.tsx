"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { CropFrame } from "@/components/my-crops/shared";
const CareDashboard = dynamic(
  () => import("@/components/crop-care/care-dashboard"),
  { loading: () => <p role="status">Loading Health & Care…</p> },
);
function Content() {
  const p = useSearchParams();
  return (
    <CropFrame
      title="Crop health & care"
      subtitle="Your growing seasons, treatments and observations."
      wide
      back={{ href: "/my-crops", label: "My Crops" }}
    >
      <CareDashboard
        crop={p.get("crop") || ""}
        cropId={p.get("cropId") || undefined}
        initialSeasonId={p.get("seasonId") || ""}
      />
    </CropFrame>
  );
}
export default function Page() {
  return (
    <Suspense fallback={<p role="status">Opening crop care…</p>}>
      <Content />
    </Suspense>
  );
}
