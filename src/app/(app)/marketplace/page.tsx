'use client';

import { Input } from "@/components/ui/input";
import { Search, Filter, X } from "lucide-react";
import SuppliersCard from "@/components/agrisahayak/suppliers-card";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function MarketplacePage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [filterType, setFilterType] = useState('all');

    useEffect(() => {
        const timeoutId = window.setTimeout(() => setDebouncedQuery(searchQuery.trim()), 350);
        return () => window.clearTimeout(timeoutId);
    }, [searchQuery]);

    return (
        <div className="space-y-6">
            <div><h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Marketplace</h1>
            <p className="mt-2 text-lg text-slate-500">Find the right supplies, closer to your farm.</p></div>

            <SuppliersCard searchQuery={debouncedQuery} filterType={filterType} searchControls={<div className="flex gap-2">
                <div className="relative flex-grow">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                        aria-label="Search crops or supplies"
                        placeholder="Search crops, seeds, plants or equipment"
                        className="h-12 rounded-xl border border-slate-200 bg-white pl-10 pr-12 transition-colors focus-visible:border-emerald-500 focus-visible:ring-emerald-200"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            aria-label="Clear search"
                            title="Clear search"
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-emerald-100 hover:text-emerald-700"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="h-12 shrink-0 rounded-xl border-slate-200 bg-white px-3">
                            <Filter className="mr-2 h-4 w-4" />
                            {filterType === 'all' ? 'All Types' : filterType === 'supplier' ? 'Suppliers' : filterType === 'buyer' ? 'Buyers' : 'Logistics'}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="end">
                        <DropdownMenuRadioGroup value={filterType} onValueChange={setFilterType}>
                            <DropdownMenuRadioItem value="all">All Types</DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="supplier">Suppliers</DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="buyer">Buyers</DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="logistics">Logistics</DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>} />
        </div>
    );
}
