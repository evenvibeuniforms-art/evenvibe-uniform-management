"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  UserCheck,
  UserX,
  School,
} from "lucide-react";
import {
  PaginatedUsersResponse,
  SchoolOption,
  UserFilters as FiltersType,
  UserManagementRow,
} from "../types";
import { UserFilters } from "./UserFilters";
import { UserTable } from "./UserTable";
import { UserDetailsDialog } from "./UserDetailsDialog";
import { UserStatusDialog } from "./UserStatusDialog";

interface AdminUsersViewProps {
  initialData: PaginatedUsersResponse;
  schools: SchoolOption[];
  filters: FiltersType;
  currentUserId?: string;
}

export function AdminUsersView({
  initialData,
  schools,
  filters,
  currentUserId,
}: AdminUsersViewProps) {
  const router = useRouter();

  const [detailsUser, setDetailsUser] = useState<UserManagementRow | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const [statusUser, setStatusUser] = useState<UserManagementRow | null>(null);
  const [statusAction, setStatusAction] = useState<"activate" | "deactivate" | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);

  const handleViewDetails = (user: UserManagementRow) => {
    setDetailsUser(user);
    setDetailsOpen(true);
  };

  const handleUpdateStatus = (
    user: UserManagementRow,
    action: "activate" | "deactivate"
  ) => {
    setStatusUser(user);
    setStatusAction(action);
    setStatusOpen(true);
  };

  const handleActionSuccess = () => {
    router.refresh();
  };

  const { kpis, users, totalCount } = initialData;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          User Management
        </h1>
        <p className="text-slate-500 mt-1">
          Manage School Admin accounts and access.
        </p>
      </div>

      {/* Top Section KPI Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">
              Total Users
            </CardTitle>
            <Users className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {kpis.totalUsers}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">All registered accounts</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">
              Active Users
            </CardTitle>
            <UserCheck className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700">
              {kpis.activeUsers}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Permitted system access</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">
              Inactive Users
            </CardTitle>
            <UserX className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700">
              {kpis.inactiveUsers}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Disabled or pending approval</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">
              School Admins
            </CardTitle>
            <School className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">
              {kpis.schoolAdmins}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">School portal administrators</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters Bar */}
      <UserFilters filters={filters} schools={schools} />

      {/* Users Table */}
      <UserTable
        users={users}
        totalCount={totalCount}
        filters={filters}
        currentUserId={currentUserId}
        onViewDetails={handleViewDetails}
        onUpdateStatus={handleUpdateStatus}
      />

      {/* User Details Dialog */}
      <UserDetailsDialog
        user={detailsUser}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />

      {/* User Status Confirmation Dialog */}
      <UserStatusDialog
        user={statusUser}
        targetAction={statusAction}
        open={statusOpen}
        onOpenChange={setStatusOpen}
        onSuccess={handleActionSuccess}
      />
    </div>
  );
}
