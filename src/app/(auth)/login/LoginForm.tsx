'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Eye, EyeOff, Users, Ruler, Package, BarChart3, Mail, Lock, ShieldCheck } from 'lucide-react'
import { login } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginForm() {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isLoading) return

    const formData = new FormData(e.currentTarget)
    setError(null)
    setIsLoading(true)

    // Yield execution to the browser paint cycle so React renders and paints the loading state before the network request starts
    await new Promise((resolve) => setTimeout(resolve, 0))

    try {
      const response = await login(formData)
      if (response?.error) {
        setError(response.error)
        setIsLoading(false)
      }
    } catch (error) {
      const err = error as Error & { digest?: string };
      // Re-throw Next.js redirect exceptions so the router can process the navigation
      if (err?.message === 'NEXT_REDIRECT' || err?.digest?.startsWith('NEXT_REDIRECT')) {
        throw err
      }
      setError('Unable to sign in right now. Please try again.')
      setIsLoading(false)
    }
  }

  return (
    <div className="h-[100svh] w-full overflow-hidden bg-[#F7F9F6] font-sans relative">
      {/* Decorative background organic shapes */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[#EAF6E5] opacity-60 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[30%] w-[40%] h-[40%] rounded-full bg-[#EAF6E5] opacity-40 blur-[80px] pointer-events-none" />

      <div className="h-full w-full flex flex-col lg:flex-row relative z-10 overflow-y-auto scrollbar-hide lg:overflow-hidden">
        {/* LEFT COLUMN: Brand & Features (30-35% on Desktop) */}
        <div className="w-full lg:w-[35%] xl:w-[35%] p-6 sm:p-10 lg:p-12 xl:p-16 flex flex-col justify-center shrink-0 lg:h-[100svh]">
        <div className="mb-10">
          <h1 className="text-3xl font-black tracking-tight text-evenvibe-deep mb-1">
            EVENVIBE
          </h1>
          <h2 className="text-sm font-bold tracking-[0.2em] text-evenvibe-primary uppercase">
            Uniforms
          </h2>
          <div className="h-1 w-12 bg-evenvibe-primary mt-4 rounded-full opacity-80" />
        </div>

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

      {/* CENTER COLUMN: Login Form (35-40% on Desktop) */}
      <div className="w-full lg:w-[40%] xl:w-[40%] flex items-center justify-center p-4 sm:p-10 relative shrink-0 lg:h-[100svh]">
        <div className="w-full max-w-[480px] bg-white rounded-[22px] border border-[#E2E8F0] shadow-2xl shadow-slate-200/50 p-8 sm:p-10 lg:p-12 relative overflow-hidden">
          
          <div className="text-center mb-10">
            <div className="mb-8">
              <h1 className="text-2xl font-black tracking-tight text-evenvibe-deep mb-1">
                EVENVIBE
              </h1>
              <h2 className="text-xs font-bold tracking-[0.2em] text-evenvibe-primary uppercase">
                Uniforms
              </h2>
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-2">Welcome back</h3>
            <p className="text-sm text-slate-500 font-medium">Sign in to your EVENVIBE management account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-bold text-slate-700">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="Enter your email address"
                  required
                  disabled={isLoading}
                  autoComplete="email"
                  className="w-full h-[52px] pl-10 border-[#E2E8F0] rounded-xl focus:border-[#65B741] focus:ring-[#65B741] focus:ring-1 bg-white transition-all text-sm font-medium"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-bold text-slate-700">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  required
                  disabled={isLoading}
                  autoComplete="current-password"
                  className="w-full h-[52px] pl-10 pr-10 border-[#E2E8F0] rounded-xl focus:border-[#65B741] focus:ring-[#65B741] focus:ring-1 bg-white transition-all text-sm font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 disabled:opacity-50 transition-colors h-8 w-8 flex items-center justify-center rounded-md hover:bg-slate-50"
                  disabled={isLoading}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  suppressHydrationWarning
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 p-4 text-sm text-[#EF4444] font-medium border border-red-100 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <Button 
              type="submit" 
              aria-busy={isLoading}
              className="w-full h-[52px] rounded-xl bg-[#65B741] hover:bg-[#17452D] text-white font-semibold text-base transition-all duration-300 shadow-md shadow-[#65B741]/20 disabled:opacity-90 disabled:cursor-not-allowed flex items-center justify-center select-none"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2.5">
                  <svg
                    className="size-5 animate-spin text-white motion-reduce:animate-none shrink-0"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="9"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    />
                    <circle
                      className="opacity-100"
                      cx="12"
                      cy="12"
                      r="9"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeDasharray="42 18"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span>Signing in...</span>
                </span>
              ) : (
                <span>Sign In</span>
              )}
            </Button>
            
            <div className="text-center text-sm text-slate-500 pt-4">
              Don&apos;t have a school account?{" "}
              <a href="/signup" className="font-bold text-[#65B741] hover:text-[#17452D] transition-colors ml-1">
                Register your school
              </a>
            </div>
          </form>
        </div>
      </div>

      {/* RIGHT COLUMN: Visual Environment (25-30% on Desktop) */}
      <div className="hidden lg:block lg:w-[25%] xl:w-[25%] z-0 bg-[#EAF6E5]/40 overflow-hidden lg:h-[100svh]">
        <div className="relative w-full h-full">
          {/* Curving decorative organic edge overlaying the image */}
          <svg className="absolute left-0 top-0 h-full w-[150px] z-20 text-[#F7F9F6] fill-current" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d="M0,0 Q100,50 0,100 Z" />
          </svg>

          {/* Brand Atmosphere Statement */}
          <div className="absolute top-24 right-16 z-30 transform rotate-[-4deg]">
            <h3 className="font-serif italic text-3xl xl:text-4xl leading-tight text-[#17452D]/90 text-right">
              Uniforms <br />
              for a brighter <br />
              tomorrow
            </h3>
            <div className="h-0.5 w-24 bg-[#65B741]/60 mt-4 ml-auto rounded-full rotate-[-2deg]" />
          </div>

          {/* High Quality Campus Visual Area */}
          <Image
            src="/images/login-school-campus.jpg"
            alt="Premium modern school campus"
            fill
            priority
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover opacity-90 mix-blend-multiply"
          />

          {/* Soft overlay gradient to blend into the green theme */}
          <div className="absolute inset-0 bg-gradient-to-tr from-[#65B741]/20 to-transparent" />
        </div>
      </div>

      </div>
    </div>
  )
}
