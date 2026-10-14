import type {NextConfig} from 'next';

const diagnosticAssets = ['./models/plant-disease/detector.onnx', './models/crop-disease/davit.onnx'];
const diagnosticRuntime = ['./node_modules/onnxruntime-node/bin/napi-v6/linux/x64/*'];
const diagnosisRoutes = [
  '/dashboard', '/report/new', '/report/\\[id\\]',
  '/my-crops/\\[cropId\\]/new',
  '/my-crops/\\[cropId\\]/\\[plantId\\]',
  '/my-crops/\\[cropId\\]/\\[plantId\\]/new',
  '/api/coordinator/tasks', '/api/coordinator/process/pending',
];

const nextConfig: NextConfig = {
  serverExternalPackages: ['onnxruntime-node', 'sharp'],
  outputFileTracingIncludes: {
    // Force model/runtime assets only where inference runs. Other routes keep
    // their automatically traced dependencies without an extra native bundle.
    ...Object.fromEntries(diagnosisRoutes.map(route => [route, [...diagnosticAssets, ...diagnosticRuntime]])),
  },
  outputFileTracingExcludes: {
    '/*': ['./node_modules/onnxruntime-node/bin/napi-v6/darwin/**/*', './node_modules/onnxruntime-node/bin/napi-v6/win32/**/*', './node_modules/onnxruntime-node/bin/napi-v6/linux/arm64/**/*', './node_modules/onnxruntime-node/bin/napi-v6/linux/x64/*cuda*', './node_modules/onnxruntime-node/bin/napi-v6/linux/x64/*tensorrt*'],
    // These endpoints only read metrics, schedule weather, or review highlights.
    // The shared coordinator/flow imports must not give each a 500 MB model bundle.
    '/api/coordinator/metrics': diagnosticAssets,
    '/api/coordinator/schedule/weather': diagnosticAssets,
    '/report/*/compare': diagnosticAssets,
    '/report/history': diagnosticAssets,
  },
  /* config options here */
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
