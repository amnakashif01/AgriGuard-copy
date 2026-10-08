
'use client';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Leaf, Sprout, LayoutDashboard, PlusCircle, ShoppingCart, User, Shield, LogOut, Bell, Settings, ChevronDown } from "lucide-react";
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { SkipToMain, FocusRing, AccessibleButton } from "@/components/ui/accessibility";
import { InteractiveCard, ScrollAnimation } from "@/components/ui/interactive";
import { useAuth } from "@/firebase";
import { getProfile } from "@/lib/repositories";
import React, { useEffect, useState } from "react";
import { UserProfile } from "@/lib/models";
import { useTranslation } from "react-i18next";

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, isUserLoading, auth, isAdmin } = useAuth();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const { t, i18n } = useTranslation();

    useEffect(() => {
        if (profile?.language) {
            i18n.changeLanguage(profile.language);
            document.documentElement.lang = profile.language === 'urdu' ? 'ur' : 'en';
            document.documentElement.dir = profile.language === 'urdu' ? 'rtl' : 'ltr';
        }
    }, [profile?.language, i18n]);

    // Auth guard: redirect unauthenticated users to login
    useEffect(() => {
        if (!isUserLoading && !user) {
            router.push('/login');
        }
    }, [user, isUserLoading, router]);

    useEffect(() => {
        const fetchProfile = () => {
            if (user) {
                getProfile(user.uid).then(setProfile);
            } else {
                setProfile(null);
            }
        };

        fetchProfile();

        window.addEventListener('profileUpdated', fetchProfile);
        return () => window.removeEventListener('profileUpdated', fetchProfile);
    }, [user]);

    // Show loading while auth is resolving
    if (isUserLoading) {
        return (
            <div className="flex h-screen w-screen items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-200 border-t-emerald-600 mx-auto"></div>
                    <p className="text-gray-500 font-medium">Loading...</p>
                </div>
            </div>
        );
    }

    // Don't render protected content if not authenticated
    if (!user) {
        return null;
    }

    const handleLogout = async () => {
        await auth.signOut();
        router.push('/login');
    };

    // Generate breadcrumbs based on current path
    const generateBreadcrumbs = () => {
        const pathSegments = pathname.split('/').filter(Boolean);
        const breadcrumbs = [
            { label: t('nav.home'), href: '/dashboard' }
        ];

        if (pathname === '/dashboard') {
            return [{ label: t('nav.dashboard'), href: '/dashboard' }];
        }

        if (pathname.startsWith('/my-crops')) {
            return [...breadcrumbs, { label: t('nav.my_crops'), href: '/my-crops' }];
        }

        let currentPath = '';
        pathSegments.forEach((segment, index) => {
            currentPath += `/${segment}`;
            const label = segment.charAt(0).toUpperCase() + segment.slice(1);
            breadcrumbs.push({
                label: label,
                href: currentPath
            });
        });

        return breadcrumbs;
    };

    const breadcrumbs = generateBreadcrumbs();

    // Only show Admin tab to admin phone numbers
    const menuItems = [
        { href: '/dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
        { href: '/my-crops', label: t('nav.my_crops'), icon: Sprout },
        { href: '/report/new', label: t('nav.new_report'), icon: PlusCircle },
        { href: '/marketplace', label: t('nav.marketplace'), icon: ShoppingCart },
        { href: '/profile', label: t('nav.profile'), icon: User },
        ...(isAdmin ? [{ href: '/admin', label: t('nav.admin'), icon: Shield }] : []),
    ];

    return (
        <>
            <SkipToMain />
            <SidebarProvider defaultOpen={true}>
                <Sidebar variant="inset" collapsible="icon">
                <SidebarHeader className="border-b border-emerald-100/50 bg-gradient-to-b from-emerald-50/80 via-green-50/40 to-white">
                  <Link href="/" aria-label="AgriGuard home" className="flex items-center gap-2.5 rounded-xl px-2 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
                    <div className="p-2 bg-gradient-to-br from-emerald-500 via-green-500 to-teal-600 rounded-xl shadow-lg group-data-[collapsible=icon]:p-2 transition-shadow hover:shadow-xl">
                      <Leaf className="h-6 w-6 text-white group-data-[collapsible=icon]:h-5 group-data-[collapsible=icon]:w-5 drop-shadow-sm" />
                    </div>
                    <div className="group-data-[collapsible=icon]:hidden">
                      <span className="text-xl font-bold font-headline bg-gradient-to-r from-emerald-700 via-green-600 to-teal-600 bg-clip-text text-transparent">AgriGuard</span>
                      <p className="text-xs text-gray-500 font-medium">AI-Powered Farming</p>
                    </div>
                  </Link>
                </SidebarHeader>
                <SidebarContent className="px-3 pb-3 pt-5">
                    <SidebarMenu className="space-y-3">
                        {menuItems.map((item) => {
                            const isActive = pathname === item.href || (item.href === '/my-crops' && pathname.startsWith('/my-crops/'));
                            // Only show Admin to admin users, assume true for now, can implement real check
                            return (
                                <SidebarMenuItem key={item.href}>
                                    <FocusRing focusClassName="ring-primary ring-2 ring-offset-2 rounded-md">
                                        <SidebarMenuButton 
                                            asChild 
                                            isActive={isActive} 
                                            tooltip={item.label}
                                            className={`group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:w-12 group-data-[collapsible=icon]:h-12 hover:bg-green-50 hover:text-green-700 hover:scale-[1.02] transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-lg ${isActive ? "bg-green-50 text-green-800 border-s-4 border-green-600 shadow-sm font-semibold" : "text-gray-600"}`}
                                            aria-label={`Navigate to ${item.label}`}
                                        >
                                            <Link 
                                                href={item.href} 
                                                className="flex items-center gap-3 focus:outline-none"
                                                aria-current={isActive ? "page" : undefined}
                                            >
                                                <item.icon className={`h-5 w-5 flex-shrink-0 transition-colors ${isActive ? "text-green-600" : "text-gray-500 group-hover:text-green-600"}`} aria-hidden="true" />
                                                <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                                            </Link>
                                        </SidebarMenuButton>
                                    </FocusRing>
                                </SidebarMenuItem>
                            )
                        })}
                    </SidebarMenu>
                </SidebarContent>
                <div className="border-t px-3 py-4">
                    <SidebarMenu className="space-y-2">
                        <SidebarMenuItem>
                            <SidebarMenuButton 
                                onClick={handleLogout} 
                                tooltip={t('nav.logout')}
                                className="group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:w-12 group-data-[collapsible=icon]:h-12 hover:bg-destructive/10 hover:text-destructive hover:scale-105 hover:shadow-md transition-all duration-300 rounded-lg"
                            >
                                <LogOut className="h-5 w-5 flex-shrink-0" />
                                <span className="group-data-[collapsible=icon]:hidden">{t('nav.logout')}</span>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </div>
            </Sidebar>
            <SidebarInset>
                <header className="sticky top-0 z-50 flex items-center justify-between border-b border-gray-100/80 bg-white/75 backdrop-blur-2xl supports-[backdrop-filter]:bg-white/60 px-3 py-3 shadow-sm sm:px-6 sm:py-4">
                    <div className="flex min-w-0 items-center gap-2 sm:gap-4">
                        <SidebarTrigger className="h-11 w-11 md:hidden" />
                        <Breadcrumb>
                            <BreadcrumbList>
                                {breadcrumbs.map((breadcrumb, index) => (
                                    <React.Fragment key={breadcrumb.href}>
                                        <BreadcrumbItem>
                                            {breadcrumb.href === pathname ? (
                                                <BreadcrumbPage>{breadcrumb.label}</BreadcrumbPage>
                                            ) : (
                                                <BreadcrumbLink asChild>
                                                    <Link href={breadcrumb.href}>{breadcrumb.label}</Link>
                                                </BreadcrumbLink>
                                            )}
                                        </BreadcrumbItem>
                                        {index < breadcrumbs.length - 1 && <BreadcrumbSeparator />}
                                    </React.Fragment>
                                ))}
                            </BreadcrumbList>
                        </Breadcrumb>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        {/* Notification bell removed - NotificationsPanel on dashboard provides full functionality */}
                        
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <AccessibleButton
                                    variant="ghost"
                                    className="flex items-center gap-2 px-3 py-2 h-auto hover:bg-primary/10 hover:scale-105 transition-all duration-200"
                                    aria-label="User menu"
                                    aria-describedby="user-info"
                                >
                                    <Avatar className="h-9 w-9 border-2 border-green-100 shadow-sm">
                                        <AvatarImage src={user?.photoURL || ''} alt="User profile picture" />
                                        <AvatarFallback aria-hidden="true" className="bg-green-100 text-green-800 font-bold">
                                            {(profile?.name || user?.displayName || 'F').charAt(0).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div id="user-info" className="hidden md:block text-left">
                                        <p className="text-sm font-medium">
                                            {profile?.name || user?.displayName || 'Farmer'}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {profile?.location || 'Pakistan'}
                                        </p>
                                    </div>
                                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                                </AccessibleButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuLabel>{t('nav.my_account')}</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => router.push('/profile')}>
                                    <User className="me-2 h-4 w-4" />
                                    {t('nav.profile')}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => router.push('/settings')}>
                                    <Settings className="me-2 h-4 w-4" />
                                    {t('nav.settings')}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                                    <LogOut className="me-2 h-4 w-4" />
                                    {t('nav.logout')}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </header>
                <main 
                    id="main-content"
                    className={`min-w-0 flex-1 min-h-screen focus:outline-none page-transition ${pathname.startsWith('/my-crops/') ? 'p-3 sm:p-5 lg:p-6' : 'p-4 sm:p-6 lg:p-8'}`}
                    style={{
                        background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 25%, #f0fdf4 50%, #f8fafc 75%, #ecfdf5 100%)',
                    }}
                    tabIndex={-1}
                    role="main"
                    aria-label="Main content"
                >
                    <ScrollAnimation animation="fadeIn" delay={100}>
                        {children}
                    </ScrollAnimation>
                </main>
            </SidebarInset>
        </SidebarProvider>
        </>
    );
}
