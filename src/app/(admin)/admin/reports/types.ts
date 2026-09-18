export type DateFilterOption =
  | "all"
  | "today"
  | "7d"
  | "30d"
  | "this_month"
  | "last_month"
  | "custom";

export interface GlobalReportFilters {
  dateFilter: DateFilterOption;
  customStartDate?: string;
  customEndDate?: string;
  schoolId?: string;
  searchQuery?: string;
}

export interface DashboardKPISummary {
  totalSchools: number;
  totalStudents: number;
  totalOrders: number;
  totalOrderedItems: number;
  ordersInProduction: number;
  ordersInQC: number;
  ordersPacked: number;
  ordersDelivered: number;
}

export interface OrderStatusCount {
  status: string;
  label: string;
  count: number;
  percentage: number;
}

export interface QualitySummaryKPI {
  totalChecked: number;
  totalPassed: number;
  totalDefective: number;
  defectRate: number;
}

export interface DeliverySummaryKPI {
  totalDispatched: number;
  inTransit: number;
  delivered: number;
  pendingDelivery: number;
  completionRate: number;
}

export interface SchoolPerformanceRow {
  schoolId: string;
  schoolName: string;
  schoolCode: string;
  totalStudents: number;
  orderCount: number;
  totalItems: number;
  currentOrderStage: string;
  deliveredOrders: number;
  pendingOrders: number;
}

export interface StudentReportRow {
  studentId: string;
  studentName: string;
  admissionNumber: string;
  schoolName: string;
  className: string;
  section: string;
  gender: string;
  sizeStatus: "completed" | "pending";
  orderParticipationCount: number;
}

export interface UniformSizeReportItem {
  schoolName: string;
  className: string;
  section: string;
  gender: string;
  itemName: string;
  size: string;
  quantity: number;
}

export interface OrderReportRow {
  orderId: string;
  orderNumber: string;
  schoolName: string;
  orderDate: string;
  totalStudents: number | string;
  totalItems: number;
  status: string;
  lastUpdated: string;
}

export interface ProductionReportRow {
  orderId: string;
  orderNumber: string;
  schoolName: string;
  totalQuantity: number;
  completedQuantity: number;
  pendingQuantity: number;
  stage: string;
  startedAt: string | null;
  completedAt: string | null;
  remarks: string | null;
}

export interface QualityCheckReportRow {
  orderId: string;
  orderNumber: string;
  schoolName: string;
  totalQuantity: number;
  checkedQuantity: number;
  passedQuantity: number;
  defectiveQuantity: number;
  defectRate: number;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface PackingReportRow {
  orderId: string;
  orderNumber: string;
  schoolName: string;
  totalQuantity: number;
  packedQuantity: number;
  pendingQuantity: number;
  status: string;
  progressPercent: number;
  startedAt: string | null;
  completedAt: string | null;
}

export interface DeliveryReportRow {
  orderId: string;
  orderNumber: string;
  schoolName: string;
  courierName: string | null;
  trackingNumber: string | null;
  estimatedDelivery: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  status: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  data: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SchoolOption {
  id: string;
  name: string;
}
