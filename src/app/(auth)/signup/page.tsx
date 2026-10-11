'use client'

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import Link from "next/link"
import Image from "next/image"
import { Users, Ruler, Package, BarChart3, ShieldCheck, Loader2, CheckCircle2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { signupSchool, SignupFormValues } from "./actions"

// Define the schema here again for client-side validation to match server
const signupSchema = z.object({
  schoolName: z.string().trim().min(3, "School name must be at least 3 characters"),
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
  district: z.string().trim().optional(),
  state: z.string().trim().optional(),
  pincode: z.string().trim().optional(),
  contactName: z.string().trim().min(2, "Contact name is required"),
  contactEmail: z.string().trim().email("Invalid email address"),
  contactPhone: z.string().trim().optional(),
  
  adminFullName: z.string().trim().min(2, "Admin full name is required"),
  adminEmail: z.string().trim().email("Invalid admin email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
})

const LeftColumn = () => (
  <div className="w-full lg:w-[35%] xl:w-[35%] p-6 sm:p-10 lg:p-12 xl:p-16 flex flex-col justify-center z-10 shrink-0 lg:sticky lg:top-0 lg:h-[100svh]">
    <div className="mb-6 lg:mb-10">
      <h1 className="text-3xl font-black tracking-tight text-evenvibe-deep mb-1">
        EVENVIBE
      </h1>
      <h2 className="text-sm font-bold tracking-[0.2em] text-evenvibe-primary uppercase">
        Uniforms
      </h2>
      <div className="h-1 w-12 bg-evenvibe-primary mt-4 rounded-full opacity-80" />
    </div>

    <div className="hidden lg:block">
      <h2 className="text-3xl md:text-4xl font-bold text-slate-900 leading-tight mb-5">
        Complete Uniform<br className="hidden xl:block" /> Management for<br className="hidden xl:block" /> Modern Schools
      </h2>
      <p className="text-slate-600 mb-10 text-sm leading-relaxed max-w-md">
        From student management to size collection, uniform requirements, orders, production, delivery and alterations — manage your school&apos;s uniform process seamlessly with EvenVibe.
      </p>

      <div className="space-y-6">
        {/* Feature 1 */}
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#EAF6E5] flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-[#65B741]" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">Student Management</h4>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">Manage all your students in one place</p>
          </div>
        </div>
        {/* Feature 2 */}
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#EAF6E5] flex items-center justify-center shrink-0">
            <Ruler className="w-5 h-5 text-[#65B741]" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">Size Collection</h4>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">Easy and accurate size management</p>
          </div>
        </div>
        {/* Feature 3 */}
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#EAF6E5] flex items-center justify-center shrink-0">
            <Package className="w-5 h-5 text-[#65B741]" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">Order Tracking</h4>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">Track production to delivery</p>
          </div>
        </div>
        {/* Feature 4 */}
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#EAF6E5] flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5 text-[#65B741]" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">Reports & Insights</h4>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">Get complete school-wise reports</p>
          </div>
        </div>
      </div>

      <div className="mt-14 flex items-center gap-2 text-slate-500">
        <ShieldCheck className="w-5 h-5 text-[#65B741]" />
        <span className="text-xs font-medium">Secure school management access</span>
      </div>
    </div>
  </div>
);

const RightColumn = () => (
  <div className="hidden lg:block lg:w-[25%] xl:w-[25%] z-0 bg-[#EAF6E5]/40 overflow-hidden lg:sticky lg:top-0 lg:h-[100svh]">
    <div className="relative w-full h-full">
      <svg className="absolute left-0 top-0 h-full w-[150px] z-20 text-[#F7F9F6] fill-current" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d="M0,0 Q100,50 0,100 Z" />
      </svg>
      <div className="absolute top-24 right-16 z-30 transform rotate-[-4deg]">
        <h3 className="font-serif italic text-3xl xl:text-4xl leading-tight text-[#17452D]/90 text-right">
          Uniforms <br />
          for a brighter <br />
          tomorrow
        </h3>
        <div className="h-0.5 w-24 bg-[#65B741]/60 mt-4 ml-auto rounded-full rotate-[-2deg]" />
      </div>
      <Image
        src="/images/login-school-campus.jpg"
        alt="Premium modern school campus"
        fill
        priority
        sizes="(min-width: 1024px) 50vw, 100vw"
        className="object-cover opacity-90 mix-blend-multiply"
      />
      <div className="absolute inset-0 bg-gradient-to-tr from-[#65B741]/20 to-transparent" />
    </div>
  </div>
);

export default function SignupPage() {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [requireEmail, setRequireEmail] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      state: "Tamil Nadu", // default
    }
  })

  const onSubmit = async (data: SignupFormValues) => {
    setError(null)
    const result = await signupSchool(data)
    
    if (result.success) {
      setSuccess(true)
      if (result.requireEmailConfirmation) {
        setRequireEmail(true)
      }
    } else {
      setError(result.error || "An error occurred during registration.")
    }
  }

  if (success) {
    return (
      <div className="h-[100svh] w-full flex flex-col lg:flex-row bg-[#F7F9F6] font-sans relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[#EAF6E5] opacity-60 blur-[100px] pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[30%] w-[40%] h-[40%] rounded-full bg-[#EAF6E5] opacity-40 blur-[80px] pointer-events-none" />

        <LeftColumn />

        <div className="w-full lg:w-[40%] xl:w-[40%] flex items-center justify-center p-4 sm:p-10 z-20 relative">
          <div className="w-full max-w-[480px] bg-white rounded-[22px] border border-[#E2E8F0] shadow-2xl shadow-slate-200/50 p-8 sm:p-10 lg:p-12 relative overflow-hidden text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#EAF6E5] mb-6">
              <CheckCircle2 className="h-8 w-8 text-[#65B741]" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-2">Registration Submitted</h3>
            <p className="text-sm text-slate-500 font-medium mb-8 leading-relaxed">
              {requireEmail 
                ? "Please check your email to confirm your account. After confirmation, your school account will be pending approval from EVENVIBE UNIFORMS."
                : "Your school account has been created and is currently awaiting approval from EVENVIBE UNIFORMS."}
            </p>
            <Link href="/login" className="w-full">
              <Button className="w-full h-[52px] rounded-xl bg-[#65B741] hover:bg-[#17452D] text-white font-semibold text-base transition-all duration-300 shadow-md shadow-[#65B741]/20">
                Go to Login
              </Button>
            </Link>
          </div>
        </div>

        <RightColumn />
      </div>
    )
  }

  const inputClass = "w-full h-[52px] border-[#E2E8F0] rounded-xl focus:border-[#65B741] focus:ring-[#65B741] focus:ring-1 bg-white transition-all text-sm font-medium"
  const labelClass = "text-xs font-bold text-slate-700 mb-2 block"

  return (
    <div className="h-[100svh] w-full flex flex-col lg:flex-row bg-[#F7F9F6] font-sans relative overflow-hidden">
      
      {/* Decorative background organic shapes */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[#EAF6E5] opacity-60 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[30%] w-[40%] h-[40%] rounded-full bg-[#EAF6E5] opacity-40 blur-[80px] pointer-events-none" />

      <LeftColumn />

      {/* CENTER COLUMN: Registration Form (35-40% on Desktop) */}
      <div className="w-full lg:w-[40%] xl:w-[40%] flex justify-center p-4 sm:p-6 lg:p-10 z-20 relative flex-1 min-h-0 lg:h-[100svh] lg:flex-none items-center">
        <div className="w-full max-w-[600px] bg-white rounded-[22px] border border-[#E2E8F0] shadow-2xl shadow-slate-200/50 flex flex-col overflow-hidden max-h-full lg:max-h-[calc(100svh-48px)]">
          
          <div className="text-center p-6 sm:px-10 shrink-0 bg-white z-10 sticky top-0 border-b border-slate-50">
            <h3 className="text-2xl font-black text-slate-900 mb-2">School Registration</h3>
            <p className="text-sm text-slate-500 font-medium">Register your school with EVENVIBE UNIFORMS</p>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide p-6 sm:p-10 pt-6">
            {error && (
              <div className="rounded-xl bg-red-50 p-4 mb-8 text-sm text-[#EF4444] font-medium border border-red-100 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
              
              {/* School Information */}
              <div className="space-y-5">
                <h4 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 uppercase tracking-wider">School Information</h4>
                
                <div>
                  <Label htmlFor="schoolName" className={labelClass}>School Name *</Label>
                  <Input id="schoolName" {...register("schoolName")} placeholder="Enter school name" className={inputClass} />
                  {errors.schoolName && <p className="text-xs text-[#EF4444] mt-1.5 font-medium">{errors.schoolName.message}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <Label htmlFor="contactName" className={labelClass}>Primary Contact Name *</Label>
                    <Input id="contactName" {...register("contactName")} placeholder="Full name" className={inputClass} />
                    {errors.contactName && <p className="text-xs text-[#EF4444] mt-1.5 font-medium">{errors.contactName.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="contactEmail" className={labelClass}>School / Contact Email *</Label>
                    <Input id="contactEmail" type="email" {...register("contactEmail")} placeholder="school@example.com" className={inputClass} />
                    {errors.contactEmail && <p className="text-xs text-[#EF4444] mt-1.5 font-medium">{errors.contactEmail.message}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <Label htmlFor="contactPhone" className={labelClass}>Contact Phone</Label>
                    <Input id="contactPhone" {...register("contactPhone")} placeholder="Optional" className={inputClass} />
                  </div>
                  <div>
                    <Label htmlFor="address" className={labelClass}>Address</Label>
                    <Input id="address" {...register("address")} placeholder="Optional" className={inputClass} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <Label htmlFor="city" className={labelClass}>City</Label>
                    <Input id="city" {...register("city")} className={inputClass} />
                  </div>
                  <div>
                    <Label htmlFor="district" className={labelClass}>District</Label>
                    <Input id="district" {...register("district")} className={inputClass} />
                  </div>
                  <div>
                    <Label htmlFor="state" className={labelClass}>State</Label>
                    <Input id="state" {...register("state")} defaultValue="Tamil Nadu" className={inputClass} />
                  </div>
                  <div>
                    <Label htmlFor="pincode" className={labelClass}>Pincode</Label>
                    <Input id="pincode" {...register("pincode")} className={inputClass} />
                  </div>
                </div>
              </div>

              {/* Admin Information */}
              <div className="space-y-5 pt-2">
                <h4 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 uppercase tracking-wider">Admin Account Information</h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <Label htmlFor="adminFullName" className={labelClass}>Admin Full Name *</Label>
                    <Input id="adminFullName" {...register("adminFullName")} placeholder="Your full name" className={inputClass} />
                    {errors.adminFullName && <p className="text-xs text-[#EF4444] mt-1.5 font-medium">{errors.adminFullName.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="adminEmail" className={labelClass}>Admin Login Email *</Label>
                    <Input id="adminEmail" type="email" {...register("adminEmail")} placeholder="login@example.com" className={inputClass} />
                    {errors.adminEmail && <p className="text-xs text-[#EF4444] mt-1.5 font-medium">{errors.adminEmail.message}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <Label htmlFor="password" className={labelClass}>Password *</Label>
                    <Input id="password" type="password" {...register("password")} className={inputClass} />
                    {errors.password && <p className="text-xs text-[#EF4444] mt-1.5 font-medium">{errors.password.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="confirmPassword" className={labelClass}>Confirm Password *</Label>
                    <Input id="confirmPassword" type="password" {...register("confirmPassword")} className={inputClass} />
                    {errors.confirmPassword && <p className="text-xs text-[#EF4444] mt-1.5 font-medium">{errors.confirmPassword.message}</p>}
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100">
                <Button 
                  type="submit" 
                  className="w-full h-[52px] rounded-xl bg-[#65B741] hover:bg-[#17452D] text-white font-semibold text-base transition-all duration-300 shadow-md shadow-[#65B741]/20" 
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Registering School...
                    </>
                  ) : (
                    "Create School Account"
                  )}
                </Button>
                <div className="text-center text-sm text-slate-500 pt-5">
                  Already have an account?{" "}
                  <Link href="/login" className="font-bold text-[#65B741] hover:text-[#17452D] transition-colors ml-1">
                    Sign In
                  </Link>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>

      <RightColumn />
      
    </div>
  )
}
