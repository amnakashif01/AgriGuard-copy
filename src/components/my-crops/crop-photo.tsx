'use client';

import { useState } from 'react';
import { Sprout } from 'lucide-react';
import { cropPhotoSource } from '@/lib/my-crops/crop-photos';

export function CropPhoto({ name }: { name: string }) {
  const src = cropPhotoSource(name);
  const [failedSrc, setFailedSrc] = useState<string>();

  return <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-950/5 sm:h-24 sm:w-24">
    {src && src !== failedSrc ? <img
      src={src}
      alt={`${name} crop`}
      width={96}
      height={96}
      loading="lazy"
      decoding="async"
      onError={() => setFailedSrc(src)}
      className="h-full w-full object-cover"
    /> : <Sprout aria-hidden="true" className="h-8 w-8" />}
  </div>;
}
