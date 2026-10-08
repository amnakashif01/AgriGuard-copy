export async function preparePlantPhoto(file: File): Promise<{ imageThumb: string; analysisImage: string }> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG or WebP photo.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Choose a photo smaller than 10 MB.');
  const image = new Image();
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('This photo could not be opened. Choose another image.'));
      image.src = url;
    });
    const compress = (size: number, maxCharacters: number, quality: number) => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Photo processing is unavailable in this browser.');
      for (let attempt = 0; attempt < 5; attempt++) {
        const scale = Math.min(1, (size * Math.pow(0.8, attempt)) / Math.max(image.naturalWidth, image.naturalHeight));
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL('image/jpeg', quality - attempt * 0.06);
        if (data.length <= maxCharacters) return data;
      }
      throw new Error('This photo is too detailed to save. Please choose a smaller crop photo.');
    };
    // Preserve original bytes when they fit: JPEG re-encoding can erase the
    // textures used by the detector, even for a small, already-compressed photo.
    let analysisImage: string | undefined;
    if (file.size <= 314000 && image.naturalWidth * image.naturalHeight <= 16000000) {
      analysisImage = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('This photo could not be read. Please select it again.'));
        reader.readAsDataURL(file);
      });
    }
    return {
      imageThumb: compress(360, 100000, 0.82),
      analysisImage: analysisImage && analysisImage.length <= 420000
        ? analysisImage : compress(1280, 420000, 0.92),
    };
  } finally { URL.revokeObjectURL(url); }
}
