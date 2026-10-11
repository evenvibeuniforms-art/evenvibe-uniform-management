export type AppRole = 'evenvibe_admin' | 'school_admin'

export interface School {
  id: string
  name: string
  school_code: string
  address: string | null
  city: string | null
  district: string | null
  state: string
  pincode: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string // UUID referencing auth.users
  full_name: string | null
  role: AppRole
  school_id: string | null // UUID referencing schools
  phone: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}



export interface SchoolUniformConfiguration {
  id: string
  school_id: string
  gender: 'Male' | 'Female'
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SchoolUniformConfigurationItem {
  id: string
  configuration_id: string
  item_name: string
  available_sizes: string[]
  is_required: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface TcStudent {
  id: string
  school_id: string
  student_id: string
  tc_date: string | null
  tc_number?: string | null
  created_at: string
  updated_at: string
}

export interface TcStudentWithStudent extends TcStudent {
  student: {
    id: string
    student_name: string
    admission_number: string
    class_name: string
    section: string
    gender: string
  }
}

export interface UniformStyle {
  id: string
  school_id: string
  style_name: string
  item_name: string
  gender: 'Male' | 'Female' | 'All' | null
  is_active: boolean
  available_sizes: string[]
  is_required: boolean
  sort_order: number
  description?: string | null
  created_at: string
  updated_at: string
}

export interface UniformStyleClass {
  id: string
  style_id: string
  class_name: string
  created_at: string
}

export interface UniformStyleImage {
  id: string
  style_id: string
  storage_path: string
  original_filename: string | null
  mime_type: string
  file_size: number
  sort_order: number
  created_at: string
}

export interface UniformStyleColor {
  id: string
  style_id: string
  class_name: string
  color_name: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface UniformStyleWithDetails extends UniformStyle {
  classes: string[]
  images: (UniformStyleImage & { signed_url?: string })[]
  colors?: UniformStyleColor[]
  schools?: { id: string; name: string } | null
}

export interface DeliveryProofImage {
  id: string
  order_id: string
  storage_path: string
  file_name: string
  mime_type: string
  file_size: number | null
  caption: string | null
  uploaded_by: string | null
  created_at: string
  display_order: number
  signed_url?: string | null
  profiles?: {
    id?: string
    full_name: string | null
    role: string | null
  } | null
}

export type DeliveryActualClassification = 'exact' | 'extra' | 'short' | 'not_delivered';

export interface OrderDeliveryActualItem {
  id: string;
  order_id: string;
  style_name: string;
  item_name: string;
  color: string;
  size: string;
  original_quantity: number;
  actual_quantity: number;
  difference: number;
  classification: DeliveryActualClassification;
  extra_quantity: number;
  short_quantity: number;
  not_delivered_quantity: number;
  batch_id?: string | null;
  batch_number?: number;
  created_at: string;
  updated_at: string;
}

export type DeliveryBatchStatus = 'draft' | 'dispatched' | 'in_transit' | 'delivered' | 'cancelled';

export interface OrderDeliveryBatch {
  id: string;
  order_id: string;
  batch_number: number;
  batch_reference: string;
  status: DeliveryBatchStatus;
  dispatched_at: string | null;
  delivered_at: string | null;
  courier_name: string | null;
  tracking_number: string | null;
  estimated_delivery: string | null;
  remarks: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  items?: OrderDeliveryActualItem[];
}

export type DeliveryReturnStatus = 'pending' | 'dispatched' | 'in_transit' | 'completed' | 'cancelled';

export interface OrderDeliveryReturn {
  id: string;
  order_id: string;
  school_id: string;
  style_name: string;
  item_name: string;
  color: string;
  size: string;
  quantity: number;
  reason: string;
  status: DeliveryReturnStatus;
  dispatch_date: string | null;
  tracking_details: string | null;
  remarks: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  schools?: { id: string; name: string } | null;
}

export type FollowupDispatchStatus = 'scheduled' | 'dispatched' | 'in_transit' | 'delivered' | 'cancelled';

export interface OrderFollowupDispatchItem {
  id: string;
  followup_dispatch_id: string;
  order_id: string;
  style_name: string;
  item_name: string;
  color: string;
  size: string;
  quantity: number;
  created_at: string;
}

export interface OrderFollowupDispatch {
  id: string;
  order_id: string;
  school_id: string;
  dispatch_reference: string;
  courier_name: string | null;
  tracking_number: string | null;
  dispatch_date: string;
  status: FollowupDispatchStatus;
  remarks: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  items?: OrderFollowupDispatchItem[];
  schools?: { id: string; name: string } | null;
}