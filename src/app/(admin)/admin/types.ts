export interface DashboardPrimaryKPIs {
  activeSchoolsCount: number;
  totalStudentsCount: number;
  activeOrdersCount: number;
  ordersInProductionCount: number;
}

export interface DashboardSecondaryKPIs {
  pendingSchoolsCount: number;
  qcPendingCount: number;
  packingPendingCount: number;
  deliveryPendingCount: number;
}

export type OrderStage = 
  | "submitted"
  | "under_review"
  | "confirmed"
  | "production"
  | "quality_check"
  | "packed"
  | "dispatched"
  | "in_transit"
  | "delivered"
  | "cancelled";

export interface PipelineStageCount {
  stage: OrderStage;
  label: string;
  count: number;
  colorClass: string;
}

export interface RecentOrderSummary {
  id: string;
  order_number: string;
  school_id: string;
  school_name: string;
  created_at: string;
  students_count: number;
  items_count: number;
  status: string;
}

export interface SchoolOperationalSummary {
  id: string;
  name: string;
  school_code: string;
  students_count: number;
  orders_count: number;
  latest_order_number: string | null;
  latest_order_status: string | null;
  latest_order_date: string | null;
  is_active: boolean;
}

export interface ProductionOverviewData {
  productionOrdersCount: number;
  completedProductionCount: number;
  totalQuantity: number;
  completedQuantity: number;
  pendingQuantity: number;
}

export interface QualityCheckOverviewData {
  pending: number;
  in_progress: number;
  passed: number;
  failed: number;
}

export interface PackingDeliveryOverviewData {
  packingPending: number;
  packingInProgress: number;
  readyForDispatch: number;
  inTransit: number;
  delivered: number;
}

export interface AdminDashboardData {
  primaryKPIs: DashboardPrimaryKPIs;
  secondaryKPIs: DashboardSecondaryKPIs;
  pipelineStages: PipelineStageCount[];
  recentOrders: RecentOrderSummary[];
  schoolOverview: SchoolOperationalSummary[];
  productionOverview: ProductionOverviewData;
  qcOverview: QualityCheckOverviewData;
  packingDeliveryOverview: PackingDeliveryOverviewData;
}
