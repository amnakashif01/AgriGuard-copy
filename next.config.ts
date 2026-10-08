import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['onnxruntime-node', 'sharp'],
  outputFileTracingIncludes: {
    '/*': ['./models/plant-disease/detector.onnx', './node_modules/onnxruntime-node/bin/napi-v6/linux/x64/*'],
  },
  outputFileTracingExcludes: {
    '/*': ['./node_modules/onnxruntime-node/bin/napi-v6/darwin/**/*', './node_modules/onnxruntime-node/bin/napi-v6/win32/**/*', './node_modules/onnxruntime-node/bin/napi-v6/linux/arm64/**/*', './node_modules/onnxruntime-node/bin/napi-v6/linux/x64/*cuda*', './node_modules/onnxruntime-node/bin/napi-v6/linux/x64/*tensorrt*'],
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
