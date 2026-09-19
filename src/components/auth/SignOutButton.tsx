"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LogOut, Loader2 } from "lucide-react";
import { signOutAction } from "@/lib/auth/actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SignOutButtonProps {
  className?: string;
  variant?: "outline" | "default" | "ghost" | "destructive" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  children?: React.ReactNode;
}

export function SignOutButton({
  className,
  variant = "outline",
  size = "sm",
  children,
}: SignOutButtonProps) {
  const [isPending, setIsPending] = useState(false);

  const handleSignOut = async () => {
    if (isPending) return;
    setIsPending(true);
    try {
      const result = await signOutAction();
      if (result && !result.success) {
        toast.error(result.error || "Failed to sign out. Please try again.");
        setIsPending(false);
      }
    } catch (err) {
      console.error("[SignOutButton] Error during sign out:", err);
      setIsPending(false);
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleSignOut}
      disabled={isPending}
      className={cn("justify-start", className)}
    >
      {isPending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          <span>Signing out...</span>
        </>
      ) : (
        children || (
          <>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Sign Out</span>
          </>
        )
      )}
    </Button>
  );
}
