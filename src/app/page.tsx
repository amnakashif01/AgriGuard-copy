'use client';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Leaf, Bot, Languages, ArrowRight, CheckCircle, Users, Zap, Shield, Sparkles, Star, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import ChatWidget from '@/components/agrisahayak/chat-widget';
import { useAuth } from '@/firebase';

export default function Home() {
  const { user, isUserLoading } = useAuth();

  return (
    <div className="flex flex-col min-h-screen bg-white overflow-hidden">
      {/* ═══ PREMIUM HEADER ═══ */}
      <header className="relative z-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex justify-between items-center">
            <Link href="/" aria-label="AgriGuard home" className="flex items-center gap-3 group rounded-xl focus-visible:ring-2 focus-visible:ring-emerald-600">
              <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl shadow-lg group-hover:shadow-xl group-hover:scale-105 transition-all duration-300">
                <Leaf className="h-7 w-7 text-white" />
              </div>
              <div>
                <span className="text-2xl font-bold font-headline bg-gradient-to-r from-emerald-700 via-green-600 to-teal-600 bg-clip-text text-transparent">AgriGuard</span>
                <p className="text-xs text-gray-500 font-medium -mt-0.5">AI-Powered Agriculture</p>
              </div>
            </Link>
            <div className="flex items-center gap-3">
              {!isUserLoading && user ? (
                  <Button asChild className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 font-bold px-6 rounded-xl">
                    <Link href="/dashboard">Go to Dashboard</Link>
                  </Button>
              ) : (
                  <>
                    <Button variant="ghost" asChild className="font-semibold text-gray-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors">
                      <Link href="/login">Sign In</Link>
                    </Button>
                    <Button asChild className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 font-bold px-6 rounded-xl">
                      <Link href="/login">Get Started</Link>
                    </Button>
                  </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-grow">
        {/* ═══ PREMIUM HERO SECTION ═══ */}
        <section className="relative overflow-hidden">
          {/* Animated gradient background */}
          <div className="absolute inset-0"
               style={{
                 background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 20%, #ffffff 40%, #f0fdfa 60%, #ecfdf5 80%, #f5f3ff 100%)',
                 backgroundSize: '200% 200%',
                 animation: 'gradient-shift 12s ease infinite'
               }}
          />

          {/* Floating decorative elements */}
          <div className="absolute top-20 left-10 w-72 h-72 bg-emerald-200/30 rounded-full blur-3xl animate-blob pointer-events-none" />
          <div className="absolute top-40 right-20 w-64 h-64 bg-teal-200/25 rounded-full blur-3xl animate-blob pointer-events-none" style={{ animationDelay: '2s' }} />
          <div className="absolute bottom-10 left-1/3 w-80 h-80 bg-cyan-200/20 rounded-full blur-3xl animate-blob pointer-events-none" style={{ animationDelay: '4s' }} />
          <div className="absolute top-1/2 right-1/3 w-32 h-32 bg-violet-200/20 rounded-full blur-2xl animate-float-slow pointer-events-none" />

          {/* Grid pattern overlay */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
               style={{
                 backgroundImage: 'radial-gradient(circle, #10b981 1px, transparent 1px)',
                 backgroundSize: '40px 40px'
               }}
          />

          <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center py-24 md:py-36 relative">
            <div className="max-w-4xl mx-auto">
              {/* Badge */}
              <div className="animate-fadeInUp inline-block" style={{ animationDelay: '0.1s', animationFillMode: 'forwards' }}>
                <Badge className="mb-8 px-5 py-2.5 text-sm font-bold bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-700 border border-emerald-200/60 shadow-sm hover:shadow-md transition-shadow rounded-full">
                  <Sparkles className="w-4 h-4 me-2 text-emerald-500 animate-pulse" />
                  Powered by AI Technology
                </Badge>
              </div>

              {/* Hero title */}
              <h1 className="text-5xl md:text-7xl font-extrabold font-headline tracking-tight leading-[1.1] mb-6 opacity-0 animate-fadeInUp" style={{ animationDelay: '0.2s', animationFillMode: 'forwards' }}>
                <span className="bg-gradient-to-r from-emerald-700 via-green-600 to-teal-600 bg-clip-text text-transparent">Simple Steps</span>
                <br />
                <span className="bg-gradient-to-r from-gray-900 via-gray-800 to-emerald-800 bg-clip-text text-transparent">to Healthier Crops</span>
              </h1>

              {/* Subtitle */}
              <p className="mt-6 max-w-3xl mx-auto text-xl md:text-2xl text-gray-600 leading-relaxed opacity-0 animate-fadeInUp" style={{ animationDelay: '0.35s', animationFillMode: 'forwards' }}>
                Transform your farming with AI-powered crop diagnosis, personalized treatment plans, and real-time weather alerts designed specifically for Pakistani farmers.
              </p>

              {/* CTA Buttons */}
              <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center opacity-0 animate-fadeInUp" style={{ animationDelay: '0.5s', animationFillMode: 'forwards' }}>
                <Button size="lg" asChild className="bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 hover:from-emerald-700 hover:via-green-700 hover:to-teal-700 text-lg px-10 py-7 rounded-2xl shadow-xl hover:shadow-2xl hover:scale-105 transition-all duration-300 font-bold animate-pulse-glow">
                  <Link href={user ? "/dashboard" : "/login"}>
                    {user ? "Go to Dashboard" : "Get Your First Diagnosis"}
                    <ArrowRight className="ms-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="text-lg px-10 py-7 rounded-2xl border-2 border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 transition-all duration-300 font-bold shadow-sm hover:shadow-lg">
                  <Link href="/demo">Watch Demo</Link>
                </Button>
              </div>

              {/* Trust Indicators */}
              <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6 text-center opacity-0 animate-fadeInUp" style={{ animationDelay: '0.65s', animationFillMode: 'forwards' }}>
                <TrustIndicator
                  icon={<Users className="h-7 w-7" />}
                  gradient="from-emerald-500 to-green-600"
                  value="10,000+"
                  label="Happy Farmers"
                />
                <TrustIndicator
                  icon={<Shield className="h-7 w-7" />}
                  gradient="from-blue-500 to-indigo-600"
                  value="95%"
                  label="Accuracy Rate"
                />
                <TrustIndicator
                  icon={<Zap className="h-7 w-7" />}
                  gradient="from-violet-500 to-purple-600"
                  value="24/7"
                  label="AI Support"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ═══ PREMIUM FEATURES SECTION ═══ */}
        <section id="features" className="relative py-28 overflow-hidden">
          {/* Background */}
          <div className="absolute inset-0 bg-gradient-to-b from-white via-gray-50/50 to-white" />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-200 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-200 to-transparent" />

          <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
            <div className="text-center mb-20">
              <Badge className="mb-5 px-4 py-2 bg-emerald-50 text-emerald-700 border-emerald-200/60 font-bold rounded-full">
                <Star className="w-3.5 h-3.5 me-1.5" />
                Features
              </Badge>
              <h2 className="text-4xl md:text-5xl font-extrabold font-headline tracking-tight mb-6">
                <span className="bg-gradient-to-r from-gray-900 via-gray-800 to-emerald-800 bg-clip-text text-transparent">Everything You Need for</span>
                <br />
                <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">Smart Farming</span>
              </h2>
              <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
                Our comprehensive platform combines AI technology with local expertise to provide you with the best agricultural solutions.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <EnhancedFeatureCard
                icon={<Bot className="h-10 w-10" />}
                title="AI-Powered Diagnosis"
                description="Upload a photo of your crop and get instant, accurate disease identification with confidence scores and detailed analysis."
                features={["Instant Results", "95% Accuracy", "Multiple Languages"]}
                gradient="from-blue-500 via-indigo-500 to-violet-600"
                bgGlow="from-blue-100/50 to-indigo-100/30"
                index={0}
              />
              <EnhancedFeatureCard
                icon={<Leaf className="h-10 w-10" />}
                title="Personalized Treatment Plans"
                description="Receive step-by-step treatment protocols with local product names, cost estimates in PKR, and safety guidelines."
                features={["Local Products", "Cost Estimates", "Safety Guidelines"]}
                gradient="from-emerald-500 via-green-500 to-teal-600"
                bgGlow="from-emerald-100/50 to-green-100/30"
                index={1}
              />
              <EnhancedFeatureCard
                icon={<Languages className="h-10 w-10" />}
                title="Weather & Marketplace"
                description="Get proactive weather alerts and connect with nearby suppliers for all your agricultural needs."
                features={["Weather Alerts", "Local Suppliers", "Real-time Updates"]}
                gradient="from-purple-500 via-fuchsia-500 to-pink-600"
                bgGlow="from-purple-100/50 to-fuchsia-100/30"
                index={2}
              />
            </div>
          </div>
        </section>

        {/* ═══ HOW IT WORKS SECTION ═══ */}
        <section className="relative py-28 overflow-hidden">
          {/* Background */}
          <div className="absolute inset-0"
               style={{
                 background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdfa 50%, #ecfdf5 100%)',
                 backgroundSize: '200% 200%',
                 animation: 'gradient-shift 10s ease infinite'
               }}
          />
          <div className="absolute top-20 right-10 w-64 h-64 bg-emerald-200/20 rounded-full blur-3xl animate-float pointer-events-none" />
          <div className="absolute bottom-20 left-10 w-48 h-48 bg-teal-200/20 rounded-full blur-3xl animate-float-slow pointer-events-none" />

          <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
            <div className="text-center mb-20">
              <Badge className="mb-5 px-4 py-2 bg-white/80 text-emerald-700 border-emerald-200/60 font-bold rounded-full shadow-sm backdrop-blur-sm">
                <TrendingUp className="w-3.5 h-3.5 me-1.5" />
                Simple Process
              </Badge>
              <h2 className="text-4xl md:text-5xl font-extrabold font-headline tracking-tight mb-6">
                <span className="bg-gradient-to-r from-gray-900 to-emerald-800 bg-clip-text text-transparent">How It Works</span>
              </h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
                Get started in just 3 simple steps
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
              {/* Connecting line (desktop only) */}
              <div className="hidden md:block absolute top-16 left-1/6 right-1/6 h-0.5 bg-gradient-to-r from-emerald-300 via-green-400 to-teal-300 opacity-40" />

              <StepCard
                step={1}
                title="Upload & Describe"
                description="Take a photo of your crop and describe the symptoms you've observed."
                icon={<Bot className="h-6 w-6" />}
                gradient="from-emerald-500 to-green-600"
              />
              <StepCard
                step={2}
                title="AI Analysis"
                description="Our AI analyzes your image and symptoms to provide an accurate diagnosis."
                icon={<Zap className="h-6 w-6" />}
                gradient="from-blue-500 to-cyan-600"
              />
              <StepCard
                step={3}
                title="Get Treatment Plan"
                description="Receive a personalized treatment plan with local products and cost estimates."
                icon={<CheckCircle className="h-6 w-6" />}
                gradient="from-violet-500 to-purple-600"
              />
            </div>
          </div>
        </section>
      </main>

      {/* ═══ PREMIUM FOOTER ═══ */}
      <footer className="relative overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-900 to-emerald-950" />
        <div className="absolute inset-0 opacity-5 pointer-events-none"
             style={{
               backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(16,185,129,0.3) 0, transparent 50%), radial-gradient(circle at 80% 80%, rgba(6,182,212,0.2) 0, transparent 50%)'
             }}
        />

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16 relative">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
            <div className="col-span-1 md:col-span-2">
              <Link href="/" aria-label="AgriGuard home" className="flex w-fit items-center gap-3 mb-5 rounded-xl focus-visible:ring-2 focus-visible:ring-emerald-400">
                <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl shadow-lg">
                  <Leaf className="h-6 w-6 text-white" />
                </div>
                <span className="text-xl font-bold bg-gradient-to-r from-white to-emerald-200 bg-clip-text text-transparent">AgriGuard</span>
              </Link>
              <p className="text-gray-300 mb-6 max-w-md leading-relaxed">
                Empowering Pakistani farmers with AI technology for better crop health and higher yields.
              </p>
              <div className="flex gap-3">
                <Button asChild className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 font-bold shadow-lg rounded-xl">
                  <Link href="/login">Get Started</Link>
                </Button>
                <Button asChild variant="ghost" size="sm" className="text-gray-300 hover:text-white hover:bg-white/10 rounded-xl">
                  <a href="#features">Learn More</a>
                </Button>
              </div>
            </div>
            <div>
              <h3 className="font-bold mb-5 text-white text-sm uppercase tracking-wider">Features</h3>
              <ul className="space-y-3 text-gray-300">
                <li><Link href="/report/new" className="hover:text-emerald-400 transition-colors focus-visible:underline">AI Diagnosis</Link></li>
                <li><Link href="/report/history" className="hover:text-emerald-400 transition-colors focus-visible:underline">Treatment Plans</Link></li>
                <li><Link href="/dashboard" className="hover:text-emerald-400 transition-colors focus-visible:underline">Weather Alerts</Link></li>
                <li><Link href="/marketplace" className="hover:text-emerald-400 transition-colors focus-visible:underline">Marketplace</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold mb-5 text-white text-sm uppercase tracking-wider">Support</h3>
              <ul className="space-y-3 text-gray-300">
                <li className="hover:text-emerald-400 transition-colors cursor-pointer">Help Center</li>
                <li className="hover:text-emerald-400 transition-colors cursor-pointer">Contact Us</li>
                <li className="hover:text-emerald-400 transition-colors cursor-pointer">Privacy Policy</li>
                <li className="hover:text-emerald-400 transition-colors cursor-pointer">Terms of Service</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 mt-12 pt-8 text-center">
            <p className="text-gray-400">&copy; {new Date().getFullYear()} AgriGuard. All rights reserved.</p>
            <p className="text-xs bg-emerald-800/50 text-emerald-100 px-5 py-2 rounded-full inline-block mt-4 border border-emerald-600/30 shadow-sm backdrop-blur-sm">
              Developed by Ayesha & Amna (FYP Students)
            </p>
            <p className="text-sm mt-3 text-gray-300">Empowering farmers with AI technology.</p>
          </div>
        </div>
      </footer>

      {/* ═══ CHAT WIDGET ═══ */}
      <ChatWidget />
    </div>
  );
}

/* ─── Trust Indicator ─── */
function TrustIndicator({ icon, gradient, value, label }: { icon: React.ReactNode; gradient: string; value: string; label: string; }) {
  return (
    <div className="group flex flex-col items-center p-6 rounded-2xl bg-white/70 backdrop-blur-sm border border-gray-100/80 shadow-sm hover:shadow-xl hover:scale-105 transition-all duration-300">
      <div className={`p-3.5 bg-gradient-to-br ${gradient} rounded-2xl mb-4 text-white shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
        {icon}
      </div>
      <h3 className="text-3xl font-extrabold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent mb-1">{value}</h3>
      <p className="text-gray-500 font-medium">{label}</p>
    </div>
  );
}

/* ─── Enhanced Feature Card ─── */
function EnhancedFeatureCard({
  icon,
  title,
  description,
  features,
  gradient,
  bgGlow,
  index = 0
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  features: string[];
  gradient: string;
  bgGlow: string;
  index?: number;
}) {
  return (
    <Card className={`group relative overflow-hidden hover:shadow-2xl transition-all duration-500 border border-gray-100/80 bg-white/90 backdrop-blur-sm rounded-3xl hover:-translate-y-2 opacity-0 animate-fadeInUp`}
          style={{ animationDelay: `${index * 150 + 200}ms`, animationFillMode: 'forwards' }}
    >
      {/* Background glow on hover */}
      <div className={`absolute inset-0 bg-gradient-to-br ${bgGlow} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

      {/* Shimmer line */}
      <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

      <CardHeader className="text-center pb-4 relative">
        <div className={`mx-auto bg-gradient-to-br ${gradient} rounded-2xl p-5 w-fit mb-5 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 shadow-lg group-hover:shadow-xl`}>
          <div className="text-white">
            {icon}
          </div>
        </div>
        <CardTitle className="text-xl font-bold text-gray-900 mb-3">{title}</CardTitle>
        <CardDescription className="text-gray-600 leading-relaxed">{description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0 relative">
        <ul className="space-y-3">
          {features.map((feature, i) => (
            <li key={i} className="flex items-center text-sm text-gray-600 group-hover:text-gray-700 transition-colors">
              <div className={`me-3 p-1 rounded-full bg-gradient-to-br ${gradient} flex-shrink-0`}>
                <CheckCircle className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="font-medium">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/* ─── Step Card ─── */
function StepCard({
  step,
  title,
  description,
  icon,
  gradient
}: {
  step: number;
  title: string;
  description: string;
  icon: React.ReactNode;
  gradient: string;
}) {
  return (
    <div className="text-center group relative">
      <div className="relative mb-8 inline-block">
        {/* Outer glow ring */}
        <div className={`absolute -inset-3 bg-gradient-to-br ${gradient} rounded-full opacity-10 group-hover:opacity-25 blur-lg transition-all duration-500`} />

        <div className={`relative w-20 h-20 bg-gradient-to-br ${gradient} rounded-full flex items-center justify-center mx-auto text-white font-extrabold text-2xl shadow-xl group-hover:scale-110 group-hover:shadow-2xl transition-all duration-500`}>
          {step}
        </div>
        <div className="absolute -top-1 -right-1 w-9 h-9 bg-white rounded-full flex items-center justify-center shadow-lg border border-gray-100 text-gray-700 group-hover:scale-110 transition-transform duration-300">
          {icon}
        </div>
      </div>
      <h3 className="text-xl font-bold text-gray-900 mb-3">{title}</h3>
      <p className="text-gray-600 leading-relaxed max-w-xs mx-auto">{description}</p>
    </div>
  );
}
