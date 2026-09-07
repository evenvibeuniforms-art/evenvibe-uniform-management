import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { logout } from "@/app/(auth)/login/actions";

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 font-sans">
      <Card className="w-full max-w-md shadow-sm border-red-100">
        <CardHeader className="space-y-2 text-center pb-6">
          <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <ShieldAlert className="w-6 h-6 text-red-600" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">
            Access Denied
          </CardTitle>
          <CardDescription className="text-slate-500 font-medium text-base">
            You do not have permission to access this area, or your account is inactive.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-4">
          <form action={logout} className="w-full">
            <Button type="submit" variant="default" className="w-full">
              Sign Out
            </Button>
          </form>
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-900">
            Return to Home
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
