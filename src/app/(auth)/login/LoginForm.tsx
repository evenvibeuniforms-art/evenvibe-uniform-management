'use client'

import { useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { login } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginForm() {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(formData: FormData) {
    setError(null)
    setIsLoading(true)
    
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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 font-sans">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="space-y-2 text-center pb-8">
          <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">
            EVENVIBE UNIFORMS
          </CardTitle>
          <CardDescription className="text-slate-500 font-medium text-base">
            Management Platform Sign In
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="admin@evenvibe.in"
                  required
                  disabled={isLoading}
                  autoComplete="email"
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    disabled={isLoading}
                    autoComplete="current-password"
                    className="w-full pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 disabled:opacity-50"
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
            </div>

            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 font-medium">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
            
            <div className="text-center text-sm text-slate-500 pt-2">
              Don&apos;t have a school account?{" "}
              <a href="/signup" className="font-semibold text-emerald-600 hover:text-emerald-500">
                Register your school
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
