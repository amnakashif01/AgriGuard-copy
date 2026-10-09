// Separable bicubic resampling with anti-aliasing and 8-bit intermediate pixels.
// Matches the model publisher's Pillow preprocessing, including upscaling.
const precision = 2 ** 22;
function cubic(x: number) {
  x = Math.abs(x);
  if (x < 1) return ((1.5 * x - 2.5) * x) * x + 1;
  if (x < 2) return ((-0.5 * x + 2.5) * x - 4) * x + 2;
  return 0;
}
function coefficients(input: number, output: number) {
  const scale = input / output, filter = Math.max(1, scale), support = 2 * filter;
  return Array.from({ length: output }, (_, position) => {
    const center = (position + .5) * scale;
    const first = Math.max(0, Math.trunc(center - support + .5));
    const last = Math.min(input, Math.trunc(center + support + .5));
    const weights = Array.from({ length: last - first }, (_, i) => cubic((first + i - center + .5) / filter));
    const total = weights.reduce((a, b) => a + b, 0);
    return { first, weights: weights.map(value => {
      const scaled = value / total * precision;
      return scaled < 0 ? Math.ceil(scaled - .5) : Math.floor(scaled + .5);
    }) };
  });
}
const pixel = (value: number) => Math.max(0, Math.min(255, Math.floor((value + precision / 2) / precision)));

export function classifierBicubicResize(data: Uint8Array, width: number, height: number, outWidth: number, outHeight: number): Uint8Array {
  let intermediate = data;
  if (outWidth !== width) {
    const horizontal = coefficients(width, outWidth);
    intermediate = new Uint8Array(outWidth * height * 3);
    for (let y = 0; y < height; y++) for (let x = 0; x < outWidth; x++) for (let c = 0; c < 3; c++) {
      const { first, weights } = horizontal[x]; let sum = 0;
      for (let k = 0; k < weights.length; k++) sum += weights[k] * data[(y * width + first + k) * 3 + c];
      intermediate[(y * outWidth + x) * 3 + c] = pixel(sum);
    }
  }
  if (outHeight === height) return intermediate;
  const vertical = coefficients(height, outHeight), output = new Uint8Array(outWidth * outHeight * 3);
  for (let y = 0; y < outHeight; y++) for (let x = 0; x < outWidth; x++) for (let c = 0; c < 3; c++) {
    const { first, weights } = vertical[y]; let sum = 0;
    for (let k = 0; k < weights.length; k++) sum += weights[k] * intermediate[((first + k) * outWidth + x) * 3 + c];
    output[(y * outWidth + x) * 3 + c] = pixel(sum);
  }
  return output;
}
