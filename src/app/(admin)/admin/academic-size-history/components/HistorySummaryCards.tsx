"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Users, Calendar, Shirt, School } from "lucide-react";
import { HistorySummaryStats } from "../types";

interface HistorySummaryCardsProps {
  stats: HistorySummaryStats;
  isLoading?: boolean;
}

export function HistorySummaryCards({ stats, isLoading }: HistorySummaryCardsProps) {
  const cards = [
    {
      title: "Total Students",
      value: stats.totalStudents.toLocaleString(),
      description: "Students with historical size data",
      icon: Users,
      color: "text-blue-600 bg-blue-50 border-blue-100",
    },
    {
      title: "Academic Years",
      value: stats.academicYearsCount.toLocaleString(),
      description: "Tracked academic years",
      icon: Calendar,
      color: "text-evenvibe-primary bg-evenvibe-light border-evenvibe-light",
    },
    {
      title: "Size Records",
      value: stats.sizeRecordsCount.toLocaleString(),
      description: "Total actual historical records",
      icon: Shirt,
      color: "text-evenvibe-primary bg-evenvibe-light border-emerald-100",
    },
    {
      title: "Schools",
      value: stats.schoolsCount.toLocaleString(),
      description: "Schools represented in history",
      icon: School,
      color: "text-evenvibe-primary bg-evenvibe-light border-evenvibe-light",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.title} className="shadow-xs border-slate-200 h-full">
            <CardContent className="p-4 flex items-center justify-between h-full">
              <div className="space-y-1">
                <p className="text-xs font-medium text-slate-500">{card.title}</p>
                <div className="text-2xl font-bold tracking-tight text-slate-900">
                  {isLoading ? (
                    <div className="h-7 w-16 bg-slate-200 animate-pulse rounded" />
                  ) : (
                    card.value
                  )}
                </div>
                <p className="text-[11px] text-slate-500">{card.description}</p>
              </div>
              <div className={`p-3 rounded-lg border ${card.color}`}>
                <Icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
