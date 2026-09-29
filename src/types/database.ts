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