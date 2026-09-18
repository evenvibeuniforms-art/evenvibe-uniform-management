"use client";

import { useTransition, useState, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, RotateCcw } from "lucide-react";
import { NotificationFilters as FiltersType } from "../types";

interface NotificationFiltersProps {
  filters: FiltersType;
}

export function NotificationFilters({ filters }: NotificationFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchInput, setSearchInput] = useState(filters.search);
  const [customStart, setCustomStart] = useState(filters.customStartDate || "");
  const [customEnd, setCustomEnd] = useState(filters.customEndDate || "");

  const updateQuery = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, val]) => {
        if (val === null || val === "" || val === "all") {
          params.delete(key);
        } else {
          params.set(key, val);
        }
      });

      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`);
      });
    },
    [pathname, router, searchParams]
  );

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateQuery({ search: searchInput.trim(), page: "1" });
  };

  const handleApplyCustomDates = () => {
    updateQuery({
      date: "custom",
      start: customStart || null,
      end: customEnd || null,
      page: "1",
    });
  };

  const handleReset = () => {
    setSearchInput("");
    setCustomStart("");
    setCustomEnd("");
    startTransition(() => {
      router.push(pathname);
    });
  };

  const hasActiveFilters =
    Boolean(filters.search) ||
    filters.status !== "all" ||
    filters.type !== "all" ||
    filters.targetType !== "all" ||
    filters.datePreset !== "all";

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-white p-4 shadow-sm">
      <form
        onSubmit={handleSearchSubmit}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3"
      >
        {/* Search input */}
        <div className="relative sm:col-span-2 lg:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search notifications..."
            className="pl-9 pr-20 bg-slate-50 border-slate-200"
          />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            Search
          </Button>
        </div>

        {/* Status filter */}
        <div>
          <Select
            value={filters.status}
            onValueChange={(val) => updateQuery({ status: val, page: "1" })}
          >
            <SelectTrigger className="w-full bg-slate-50 border-slate-200">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Type filter */}
        <div>
          <Select
            value={filters.type}
            onValueChange={(val) => updateQuery({ type: val, page: "1" })}
          >
            <SelectTrigger className="w-full bg-slate-50 border-slate-200">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="announcement">Announcement</SelectItem>
              <SelectItem value="order">Order</SelectItem>
              <SelectItem value="production">Production</SelectItem>
              <SelectItem value="quality_check">Quality Check</SelectItem>
              <SelectItem value="packing">Packing</SelectItem>
              <SelectItem value="delivery">Delivery</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Audience filter */}
        <div>
          <Select
            value={filters.targetType}
            onValueChange={(val) => updateQuery({ audience: val, page: "1" })}
          >
            <SelectTrigger className="w-full bg-slate-50 border-slate-200">
              <SelectValue placeholder="All Audiences" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Audiences</SelectItem>
              <SelectItem value="all_schools">All Schools</SelectItem>
              <SelectItem value="selected_schools">Selected Schools</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Date preset filter */}
        <div>
          <Select
            value={filters.datePreset}
            onValueChange={(val) => {
              if (val !== "custom") {
                updateQuery({ date: val, start: null, end: null, page: "1" });
              } else {
                updateQuery({ date: "custom" });
              }
            }}
          >
            <SelectTrigger className="w-full bg-slate-50 border-slate-200">
              <SelectValue placeholder="Date Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="last_month">Last Month</SelectItem>
              <SelectItem value="custom">Custom Date</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </form>

      {/* Custom Date Range Sub-Row */}
      {filters.datePreset === "custom" && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t text-xs">
          <span className="text-slate-500 font-medium">Custom Range:</span>
          <Input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="w-36 h-8 text-xs bg-slate-50"
          />
          <span className="text-slate-400">to</span>
          <Input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="w-36 h-8 text-xs bg-slate-50"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleApplyCustomDates}
            disabled={isPending}
            className="h-8 px-2.5 text-xs"
          >
            Apply
          </Button>
        </div>
      )}

      {/* Reset button bar */}
      {hasActiveFilters && (
        <div className="flex justify-end pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={isPending}
            className="h-8 text-xs text-slate-500 hover:text-slate-800"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Clear all filters
          </Button>
        </div>
      )}
    </div>
  );
}
