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

export interface SchoolUniformDesign {
  id: string
  school_id: string
  design_name: string
  academic_year: string
  storage_path: string
  mime_type: string
  file_size: number
  original_filename: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SchoolLogo {
  id: string
  school_id: string
  storage_path: string
  original_filename: string | null
  mime_type: string
  file_size: number
  created_at: string
  updated_at: string
}

