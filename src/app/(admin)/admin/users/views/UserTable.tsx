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
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Eye,
  UserCheck,
  UserX,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import { UserManagementRow, UserFilters } from "../types";

interface UserTableProps {
  users: UserManagementRow[];
  totalCount: number;
  filters: UserFilters;
  currentUserId?: string;
  onViewDetails: (user: UserManagementRow) => void;
  onUpdateStatus: (user: UserManagementRow, action: "activate" | "deactivate") => void;
}

export function UserTable({
  users,
  totalCount,
  filters,
  currentUserId,
  onViewDetails,
  onUpdateStatus,
}: UserTableProps) {
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

  const handleSort = (columnKey: "name" | "role" | "school" | "created_at" | "status") => {
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

  const renderSortIcon = (columnKey: "name" | "role" | "school" | "created_at" | "status") => {
    if (filters.sortBy !== columnKey) {
      return <ArrowUpDown className="ml-1 h-3.5 w-3.5 text-slate-400 opacity-60" />;
    }
    return filters.sortAsc ? (
      <ArrowUp className="ml-1 h-3.5 w-3.5 text-slate-900 font-bold" />
    ) : (
      <ArrowDown className="ml-1 h-3.5 w-3.5 text-slate-900 font-bold" />
    );
  };

  const formatDate = (dateStr: string) => {
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

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow className="border-b">
                <TableHead
                  onClick={() => handleSort("name")}
                  className="cursor-pointer font-semibold text-slate-900 hover:text-slate-700"
                >
                  <div className="flex items-center">
                    Name {renderSortIcon("name")}
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-slate-900">Email</TableHead>
                <TableHead
                  onClick={() => handleSort("role")}
                  className="cursor-pointer font-semibold text-slate-900 hover:text-slate-700"
                >
                  <div className="flex items-center">
                    Role {renderSortIcon("role")}
                  </div>
                </TableHead>
                <TableHead
                  onClick={() => handleSort("school")}
                  className="cursor-pointer font-semibold text-slate-900 hover:text-slate-700"
                >
                  <div className="flex items-center">
                    School {renderSortIcon("school")}
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-slate-900">Phone</TableHead>
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
                <TableHead className="text-right font-semibold text-slate-900">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-36 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-1">
                      <ShieldAlert className="h-6 w-6 text-slate-400" />
                      <p className="font-medium text-slate-700">
                        {filters.search || filters.role !== "all" || filters.schoolId !== "all" || filters.status !== "all"
                          ? "No users match your filters."
                          : "No users found."}
                      </p>
                      <p className="text-xs text-slate-400">
                        Try adjusting your search terms or filters.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => {
                  const isEvenViveAdmin = user.role === "evenvibe_admin";
                  const isSelf = currentUserId === user.id;

                  return (
                    <TableRow key={user.id} className="hover:bg-slate-50/75 transition-colors">
                      <TableCell className="font-medium text-slate-900">
                        <div className="flex flex-col">
                          <span>{user.fullName}</span>
                          {isSelf && (
                            <span className="text-[10px] text-purple-600 font-semibold uppercase tracking-wider">
                              (You)
                            </span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="text-slate-600 text-sm">{user.email}</TableCell>

                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            isEvenViveAdmin
                              ? "bg-purple-50 text-purple-700 border-purple-200 font-medium"
                              : "bg-blue-50 text-blue-700 border-blue-200 font-medium"
                          }
                        >
                          {isEvenViveAdmin ? "EvenVive Admin" : "School Admin"}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        {isEvenViveAdmin ? (
                          <span className="text-xs font-medium text-slate-500 italic">
                            EvenVive Admin
                          </span>
                        ) : user.schoolName ? (
                          <div className="flex flex-col">
                            <span className="font-medium text-slate-800 text-sm">
                              {user.schoolName}
                            </span>
                            {user.schoolCode && (
                              <span className="font-mono text-xs text-slate-400">
                                {user.schoolCode}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-amber-600 font-medium">
                            No School Assigned
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="text-slate-600 text-sm">
                        {user.phone || "—"}
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant={user.isActive ? "default" : "secondary"}
                          className={
                            user.isActive
                              ? "bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100 font-medium"
                              : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-100 font-medium"
                          }
                        >
                          {user.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-slate-500 text-sm">
                        {formatDate(user.createdAt)}
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onViewDetails(user)}
                            className="h-8 px-2 text-slate-600 hover:text-slate-900"
                            title="View Details"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            <span className="hidden sm:inline text-xs">Details</span>
                          </Button>

                          {/* Activation / Deactivation controls */}
                          {isEvenViveAdmin ? (
                            <span
                              className="text-[11px] text-slate-400 italic px-2 py-1 select-none"
                              title="EvenVive Admin accounts cannot be deactivated"
                            >
                              Protected
                            </span>
                          ) : user.isActive ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onUpdateStatus(user, "deactivate")}
                              className="h-8 px-2 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                              title="Deactivate School Admin"
                            >
                              <UserX className="h-3.5 w-3.5 mr-1" />
                              <span className="text-xs">Deactivate</span>
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onUpdateStatus(user, "activate")}
                              className="h-8 px-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
                              title="Activate School Admin"
                            >
                              <UserCheck className="h-3.5 w-3.5 mr-1" />
                              <span className="text-xs">Activate</span>
                            </Button>
                          )}
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
