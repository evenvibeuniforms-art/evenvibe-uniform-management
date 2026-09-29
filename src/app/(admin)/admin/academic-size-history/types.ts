export interface HistoryFilters {
  school_id?: string | null;
  academic_year?: string | null;
  class_name?: string | null;
  section?: string | null;
  gender?: string | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
}

export interface StudentHistorySummaryRow {
  student_id: string;
  student_name: string;
  admission_number: string;
  school_id: string;
  school_name: string;
  class_name: string;
  section: string | null;
  gender: string | null;
  years_count: number;
  years_list: string[];
}

export interface DetailedHistoryRecord {
  id: string;
  student_id: string;
  school_id: string;
  school_name?: string;
  student_name?: string;
  admission_number?: string;
  academic_year: string;
  style_id: string | null;
  style_name: string | null;
  item_name: string;
  gender: string | null;
  size: string;
  color: string | null;
  class_name: string | null;
  section: string | null;
  source_type: "historical_record" | "manual_baseline";
  created_at: string;
  updated_at: string;
}

export interface HistorySummaryStats {
  totalStudents: number;
  academicYearsCount: number;
  sizeRecordsCount: number;
  schoolsCount: number;
}

export interface AcademicYearOverviewItem {
  academic_year: string;
  count: number;
}

export interface SchoolOption {
  id: string;
  name: string;
  code: string;
}

export interface AcademicSizeHistoryResponse {
  students: StudentHistorySummaryRow[];
  totalStudentsCount: number;
  stats: HistorySummaryStats;
  yearOverview: AcademicYearOverviewItem[];
  schools: SchoolOption[];
}
