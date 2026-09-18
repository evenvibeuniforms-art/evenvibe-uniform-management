"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Bell,
  FileEdit,
  Clock,
  CheckCircle2,
  Archive,
  Plus,
} from "lucide-react";
import {
  PaginatedNotificationsResponse,
  SchoolOption,
  NotificationFilters as FiltersType,
  NotificationRow,
} from "../types";
import { NotificationFilters } from "./NotificationFilters";
import { NotificationTable } from "./NotificationTable";
import { NotificationFormDialog } from "./NotificationFormDialog";
import { NotificationDetailsDialog } from "./NotificationDetailsDialog";
import {
  NotificationStatusDialog,
  StatusActionType,
} from "./NotificationStatusDialog";
import { useRealtimeRefresh } from "@/lib/supabase/useRealtime";

interface AdminNotificationsViewProps {
  initialData: PaginatedNotificationsResponse;
  schools: SchoolOption[];
  filters: FiltersType;
}

export function AdminNotificationsView({
  initialData,
  schools,
  filters,
}: AdminNotificationsViewProps) {
  const router = useRouter();

  useRealtimeRefresh({
    table: "notifications",
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editingNotification, setEditingNotification] = useState<NotificationRow | null>(null);

  const [detailsUser, setDetailsNotification] = useState<NotificationRow | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const [statusNotification, setStatusNotification] = useState<NotificationRow | null>(null);
  const [statusAction, setStatusAction] = useState<StatusActionType | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);

  const handleOpenCreate = () => {
    setEditingNotification(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (notif: NotificationRow) => {
    setEditingNotification(notif);
    setFormOpen(true);
  };

  const handleViewDetails = (notif: NotificationRow) => {
    setDetailsNotification(notif);
    setDetailsOpen(true);
  };

  const handleAction = (notif: NotificationRow, action: StatusActionType) => {
    setStatusNotification(notif);
    setStatusAction(action);
    setStatusOpen(true);
  };

  const handleRefresh = () => {
    router.refresh();
  };

  const { kpis, notifications, totalCount } = initialData;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Notifications Management
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Create, schedule, and broadcast announcements and operational notifications to schools.
          </p>
        </div>
        <Button
          onClick={handleOpenCreate}
          className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Create Notification
        </Button>
      </div>

      {/* Top Section KPI Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total
            </CardTitle>
            <Bell className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {kpis.totalNotifications}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">All notifications created</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Drafts
            </CardTitle>
            <FileEdit className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-700">
              {kpis.drafts}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Unpublished drafts</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Scheduled
            </CardTitle>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">
              {kpis.scheduled}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Awaiting future dispatch</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Published
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700">
              {kpis.published}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Active & visible in schools</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Archived
            </CardTitle>
            <Archive className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-700">
              {kpis.archived}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Preserved past records</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters Bar */}
      <NotificationFilters filters={filters} />

      {/* Notifications Table */}
      <NotificationTable
        notifications={notifications}
        totalCount={totalCount}
        filters={filters}
        onViewDetails={handleViewDetails}
        onEdit={handleOpenEdit}
        onAction={handleAction}
      />

      {/* Create / Edit Form Dialog */}
      <NotificationFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        schools={schools}
        editingNotification={editingNotification}
        onSuccess={handleRefresh}
      />

      {/* Details Dialog */}
      <NotificationDetailsDialog
        notification={detailsUser}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />

      {/* Status Confirmation Dialog */}
      <NotificationStatusDialog
        notification={statusNotification}
        actionType={statusAction}
        open={statusOpen}
        onOpenChange={setStatusOpen}
        onSuccess={handleRefresh}
      />
    </div>
  );
}
