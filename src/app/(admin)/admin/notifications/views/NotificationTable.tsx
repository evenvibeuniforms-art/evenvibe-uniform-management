"use client";

import { useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Eye,
  MoreHorizontal,
  Edit2,
  Send,
  Archive,
  Ban,
  Trash2,
  ChevronLeft,
  ChevronRight,
  BellOff,
  Clock,
  CheckCircle2,
  FileEdit,
} from "lucide-react";
import { NotificationRow, NotificationFilters } from "../types";
import { StatusActionType } from "./NotificationStatusDialog";

interface NotificationTableProps {
  notifications: NotificationRow[];
  totalCount: number;
  filters: NotificationFilters;
  onViewDetails: (item: NotificationRow) => void;
  onEdit: (item: NotificationRow) => void;
  onAction: (item: NotificationRow, action: StatusActionType) => void;
}

export function NotificationTable({
  notifications,
  totalCount,
  filters,
  onViewDetails,
  onEdit,
  onAction,
}: NotificationTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const totalPages = Math.ceil(totalCount / filters.pageSize) || 1;
  const startRow = totalCount > 0 ? (filters.page - 1) * filters.pageSize + 1 : 0;
  const endRow = Math.min(filters.page * filters.pageSize, totalCount);

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const handleSort = (columnKey: "title" | "status" | "type" | "created_at") => {
    const params = new URLSearchParams(searchParams.toString());
    if (filters.sortBy === columnKey) {
      params.set("sortAsc", filters.sortAsc ? "false" : "true");
    } else {
      params.set("sortBy", columnKey);
      params.set("sortAsc", "true");
    }
    params.set("page", "1");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const renderSortIcon = (columnKey: "title" | "status" | "type" | "created_at") => {
    if (filters.sortBy !== columnKey) {
      return <ArrowUpDown className="ml-1 h-3.5 w-3.5 text-slate-400 opacity-60" />;
    }
    return filters.sortAsc ? (
      <ArrowUp className="ml-1 h-3.5 w-3.5 text-slate-900 font-bold" />
    ) : (
      <ArrowDown className="ml-1 h-3.5 w-3.5 text-slate-900 font-bold" />
    );
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "—";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "—";
    }
  };

  const getStatusBadge = (status: NotificationRow["status"]) => {
    switch (status) {
      case "published":
        return (
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
            <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-600" /> Published
          </Badge>
        );
      case "scheduled":
        return (
          <Badge className="bg-blue-100 text-blue-800 border-blue-200">
            <Clock className="h-3 w-3 mr-1 text-blue-600" /> Scheduled
          </Badge>
        );
      case "draft":
        return (
          <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-300">
            <FileEdit className="h-3 w-3 mr-1 text-slate-500" /> Draft
          </Badge>
        );
      case "archived":
        return (
          <Badge variant="outline" className="bg-zinc-100 text-zinc-600 border-zinc-300">
            <Archive className="h-3 w-3 mr-1 text-zinc-500" /> Archived
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="outline" className="bg-rose-100 text-rose-700 border-rose-200">
            <Ban className="h-3 w-3 mr-1 text-rose-500" /> Cancelled
          </Badge>
        );
    }
  };

  const getTypeBadge = (type: NotificationRow["notificationType"]) => {
    const labels: Record<string, string> = {
      announcement: "Announcement",
      order: "Order",
      production: "Production",
      quality_check: "Quality Check",
      packing: "Packing",
      delivery: "Delivery",
      system: "System",
    };
    return (
      <Badge variant="secondary" className="capitalize text-xs">
        {labels[type] || type}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow className="border-b">
                <TableHead
                  onClick={() => handleSort("title")}
                  className="cursor-pointer font-semibold text-slate-900 hover:text-slate-700 min-w-[220px]"
                >
                  <div className="flex items-center">
                    Title {renderSortIcon("title")}
                  </div>
                </TableHead>
                <TableHead
                  onClick={() => handleSort("type")}
                  className="cursor-pointer font-semibold text-slate-900 hover:text-slate-700"
                >
                  <div className="flex items-center">
                    Type {renderSortIcon("type")}
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-slate-900">Audience</TableHead>
                <TableHead
                  onClick={() => handleSort("status")}
                  className="cursor-pointer font-semibold text-slate-900 hover:text-slate-700"
                >
                  <div className="flex items-center">
                    Status {renderSortIcon("status")}
                  </div>
                </TableHead>
                <TableHead
                  onClick={() => handleSort("created_at")}
                  className="cursor-pointer font-semibold text-slate-900 hover:text-slate-700"
                >
                  <div className="flex items-center">
                    Created {renderSortIcon("created_at")}
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-slate-900">Scheduled</TableHead>
                <TableHead className="font-semibold text-slate-900">Published</TableHead>
                <TableHead className="text-right font-semibold text-slate-900">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notifications.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-36 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-1">
                      <BellOff className="h-6 w-6 text-slate-400" />
                      <p className="font-medium text-slate-700">
                        {filters.search || filters.status !== "all" || filters.type !== "all" || filters.targetType !== "all" || filters.datePreset !== "all"
                          ? "No notifications match your filters."
                          : "No notifications found."}
                      </p>
                      <p className="text-xs text-slate-400">
                        Create announcements or adjust filter criteria.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                notifications.map((notif) => {
                  return (
                    <TableRow key={notif.id} className="hover:bg-slate-50/75 transition-colors">
                      <TableCell className="font-medium text-slate-900">
                        <div className="flex flex-col max-w-xs">
                          <span className="truncate font-semibold text-slate-900" title={notif.title}>
                            {notif.title}
                          </span>
                          <span className="truncate text-xs text-slate-400" title={notif.message}>
                            {notif.message}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell>{getTypeBadge(notif.notificationType)}</TableCell>

                      <TableCell>
                        {notif.targetType === "all_schools" ? (
                          <span className="text-xs font-semibold text-slate-700">
                            All Schools
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-blue-700">
                            {notif.targetSchoolCount} {notif.targetSchoolCount === 1 ? "School" : "Schools"}
                          </span>
                        )}
                      </TableCell>

                      <TableCell>{getStatusBadge(notif.status)}</TableCell>

                      <TableCell className="text-slate-500 text-sm">
                        {formatDate(notif.createdAt)}
                      </TableCell>

                      <TableCell className="text-slate-500 text-sm">
                        {formatDate(notif.scheduledAt)}
                      </TableCell>

                      <TableCell className="text-slate-500 text-sm">
                        {formatDate(notif.publishedAt)}
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onViewDetails(notif)}
                            className="h-8 px-2 text-slate-600 hover:text-slate-900"
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>

                          <DropdownMenu>
                            <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-md h-8 w-8 p-0 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors">
                              <MoreHorizontal className="h-4 w-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44 text-xs">
                              {/* Edit option for draft/scheduled */}
                              {(notif.status === "draft" || notif.status === "scheduled") && (
                                <DropdownMenuItem onClick={() => onEdit(notif)}>
                                  <Edit2 className="mr-2 h-3.5 w-3.5" />
                                  Edit Notification
                                </DropdownMenuItem>
                              )}

                              {/* Publish Now option */}
                              {(notif.status === "draft" || notif.status === "scheduled") && (
                                <DropdownMenuItem onClick={() => onAction(notif, "publish")}>
                                  <Send className="mr-2 h-3.5 w-3.5 text-emerald-600" />
                                  Publish Now
                                </DropdownMenuItem>
                              )}

                              {/* Cancel Scheduled option */}
                              {notif.status === "scheduled" && (
                                <DropdownMenuItem onClick={() => onAction(notif, "cancel_scheduled")}>
                                  <Ban className="mr-2 h-3.5 w-3.5 text-rose-600" />
                                  Cancel Schedule
                                </DropdownMenuItem>
                              )}

                              {/* Archive option */}
                              {notif.status === "published" && (
                                <DropdownMenuItem onClick={() => onAction(notif, "archive")}>
                                  <Archive className="mr-2 h-3.5 w-3.5 text-zinc-600" />
                                  Archive
                                </DropdownMenuItem>
                              )}

                              {/* Delete option for draft */}
                              {notif.status === "draft" && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => onAction(notif, "delete_draft")}
                                    className="text-red-600 focus:text-red-600"
                                  >
                                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                                    Delete Draft
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Server-side Pagination Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t bg-slate-50/50 px-4 py-3 text-xs text-slate-500">
          <div>
            Showing <span className="font-semibold text-slate-700">{startRow}</span> to{" "}
            <span className="font-semibold text-slate-700">{endRow}</span> of{" "}
            <span className="font-semibold text-slate-700">{totalCount}</span> records
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateParam("page", String(filters.page - 1))}
              disabled={filters.page <= 1 || isPending}
              className="h-8 px-2.5 text-xs border-slate-200"
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />
              Previous
            </Button>

            <span className="px-2 text-slate-600 font-medium">
              Page {filters.page} of {totalPages}
            </span>

            <Button
              variant="outline"
              size="sm"
              onClick={() => updateParam("page", String(filters.page + 1))}
              disabled={filters.page >= totalPages || isPending}
              className="h-8 px-2.5 text-xs border-slate-200"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
