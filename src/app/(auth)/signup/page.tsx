'use client'

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import Link from "next/link"
import { Building2, Loader2, CheckCircle2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { signupSchool, SignupFormValues } from "./actions"

// Define the schema here again for client-side validation to match server
const signupSchema = z.object({
  schoolName: z.string().trim().min(3, "School name must be at least 3 characters"),
  schoolCode: z.string().trim().min(2, "School code is required"),
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
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
        <Card className="w-full max-w-md shadow-lg border-slate-200">
          <CardHeader className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 mb-4">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">Registration Submitted</CardTitle>
            <CardDescription className="text-base mt-2">
              {requireEmail 
                ? "Please check your email to confirm your account. After confirmation, your school account will be pending approval from EVENVIBE UNIFORMS."
                : "Your school account has been created and is currently awaiting approval from EVENVIBE UNIFORMS."}
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col space-y-4">
            <Link href="/login" className="w-full">
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" size="lg">
                Go to Login
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <Card className="w-full max-w-3xl shadow-lg border-slate-200">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-emerald-100 p-3">
              <Building2 className="h-6 w-6 text-emerald-600" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">
            School Registration
          </CardTitle>
          <CardDescription>
            Register your school with EVENVIBE UNIFORMS
          </CardDescription>
        </CardHeader>

        {error && (
          <div className="mx-6 p-4 bg-red-50 text-red-600 rounded-md text-sm font-medium text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-8 mt-4">
            
            {/* School Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-slate-900 border-b pb-2">School Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="schoolName">School Name *</Label>
                  <Input id="schoolName" {...register("schoolName")} placeholder="Enter school name" />
                  {errors.schoolName && <p className="text-xs text-red-500">{errors.schoolName.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="schoolCode">School Code *</Label>
                  <Input id="schoolCode" {...register("schoolCode")} placeholder="Unique identifier" />
                  {errors.schoolCode && <p className="text-xs text-red-500">{errors.schoolCode.message}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contactName">Primary Contact Name *</Label>
                  <Input id="contactName" {...register("contactName")} placeholder="Full name" />
                  {errors.contactName && <p className="text-xs text-red-500">{errors.contactName.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactEmail">School / Contact Email *</Label>
                  <Input id="contactEmail" type="email" {...register("contactEmail")} placeholder="school@example.com" />
                  {errors.contactEmail && <p className="text-xs text-red-500">{errors.contactEmail.message}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contactPhone">Contact Phone</Label>
                  <Input id="contactPhone" {...register("contactPhone")} placeholder="Optional" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Input id="address" {...register("address")} placeholder="Optional" />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" {...register("city")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="district">District</Label>
                  <Input id="district" {...register("district")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input id="state" {...register("state")} defaultValue="Tamil Nadu" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pincode">Pincode</Label>
                  <Input id="pincode" {...register("pincode")} />
                </div>
              </div>
            </div>

            {/* Admin Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-slate-900 border-b pb-2">Admin Account Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="adminFullName">Admin Full Name *</Label>
                  <Input id="adminFullName" {...register("adminFullName")} placeholder="Your full name" />
                  {errors.adminFullName && <p className="text-xs text-red-500">{errors.adminFullName.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adminEmail">Admin Login Email *</Label>
                  <Input id="adminEmail" type="email" {...register("adminEmail")} placeholder="login@example.com" />
                  {errors.adminEmail && <p className="text-xs text-red-500">{errors.adminEmail.message}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="password">Password *</Label>
                  <Input id="password" type="password" {...register("password")} />
                  {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password *</Label>
                  <Input id="confirmPassword" type="password" {...register("confirmPassword")} />
                  {errors.confirmPassword && <p className="text-xs text-red-500">{errors.confirmPassword.message}</p>}
                </div>
              </div>
            </div>

          </CardContent>
          <CardFooter className="flex flex-col space-y-4 bg-slate-50 pt-6 rounded-b-xl border-t border-slate-100">
            <Button 
              type="submit" 
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" 
              size="lg"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Registering School...
                </>
              ) : (
                "Create School Account"
              )}
            </Button>
            <div className="text-center text-sm text-slate-500">
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-emerald-600 hover:text-emerald-500">
                Sign In
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
