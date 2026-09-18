"use client";

import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DateFilterOption } from "../../types";
import { Calendar } from "lucide-react";

interface ReportDateFilterProps {
  value: DateFilterOption;
  customStartDate?: string;
  customEndDate?: string;
  onChange: (option: DateFilterOption, start?: string, end?: string) => void;
}

export function ReportDateFilter({
  value,
  customStartDate,
  customEndDate,
  onChange,
}: ReportDateFilterProps) {
  const [isCustom, setIsCustom] = useState(value === "custom");
  const [start, setStart] = useState(customStartDate || "");
  const [end, setEnd] = useState(customEndDate || "");

  const handlePresetChange = (preset: string | null) => {
    if (!preset) return;
    const nextVal = preset as DateFilterOption;
    if (nextVal === "custom") {
      setIsCustom(true);
    } else {
      setIsCustom(false);
      onChange(nextVal);
    }
  };

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (start && end) {
      onChange("custom", start, end);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5">
        <Calendar className="h-4 w-4 text-slate-400" />
        <Select value={value} onValueChange={handlePresetChange}>
          <SelectTrigger className="w-[150px] h-9 text-xs bg-white">
            <SelectValue placeholder="Date Range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="7d">Last 7 Days</SelectItem>
            <SelectItem value="30d">Last 30 Days</SelectItem>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="last_month">Last Month</SelectItem>
            <SelectItem value="custom">Custom Range</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isCustom && (
        <form onSubmit={handleApplyCustom} className="flex items-center gap-2">
          <Input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="h-9 w-[135px] text-xs bg-white"
            required
          />
          <span className="text-xs text-slate-400">to</span>
          <Input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="h-9 w-[135px] text-xs bg-white"
            required
          />
          <Button type="submit" size="sm" className="h-9 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white">
            Apply
          </Button>
        </form>
      )}
    </div>
  );
}
