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
    const compress = (size: number, maxCharacters: number) => {
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
        const data = canvas.toDataURL('image/jpeg', 0.82 - attempt * 0.08);
        if (data.length <= maxCharacters) return data;
      }
      throw new Error('This photo is too detailed to save. Please choose a smaller crop photo.');
    };
    return { imageThumb: compress(360, 100000), analysisImage: compress(1200, 420000) };
  } finally { URL.revokeObjectURL(url); }
}
