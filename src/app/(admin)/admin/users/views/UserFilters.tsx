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
import { SchoolOption, UserFilters as FiltersType } from "../types";

interface UserFiltersProps {
  filters: FiltersType;
  schools: SchoolOption[];
}

export function UserFilters({ filters, schools }: UserFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchInput, setSearchInput] = useState(filters.search);

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

  const handleReset = () => {
    setSearchInput("");
    startTransition(() => {
      router.push(pathname);
    });
  };

  const hasActiveFilters =
    Boolean(filters.search) ||
    filters.role !== "all" ||
    filters.schoolId !== "all" ||
    filters.status !== "all";

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-white p-4 shadow-sm">
      <form
        onSubmit={handleSearchSubmit}
        className="flex flex-col md:flex-row items-stretch md:items-center gap-3"
      >
        {/* Search input with Submit */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, email, phone, school name or code..."
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

        {/* Role filter */}
        <div className="w-full md:w-44">
          <Select
            value={filters.role}
            onValueChange={(val) => updateQuery({ role: val, page: "1" })}
          >
            <SelectTrigger className="w-full bg-slate-50 border-slate-200">
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="evenvibe_admin">EvenVive Admin</SelectItem>
              <SelectItem value="school_admin">School Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* School filter */}
        <div className="w-full md:w-56">
          <Select
            value={filters.schoolId}
            onValueChange={(val) => updateQuery({ school: val, page: "1" })}
          >
            <SelectTrigger className="w-full bg-slate-50 border-slate-200 truncate">
              <SelectValue placeholder="All Schools" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Schools</SelectItem>
              {schools.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} ({s.school_code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status filter */}
        <div className="w-full md:w-36">
          <Select
            value={filters.status}
            onValueChange={(val) => updateQuery({ status: val, page: "1" })}
          >
            <SelectTrigger className="w-full bg-slate-50 border-slate-200">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Reset button */}
        {hasActiveFilters && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={isPending}
            className="h-10 text-slate-600 hover:text-slate-900 border-slate-200 shrink-0"
          >
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Reset
          </Button>
        )}
      </form>
    </div>
  );
}
