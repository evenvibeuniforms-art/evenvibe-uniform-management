import { redirect } from "next/navigation";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    const profile = await getCurrentProfile();
    
    if (!profile) {
      // User is authenticated but has no profile, log them out.
      const supabase = await createClient();
      await supabase.auth.signOut();
      return <LoginForm />;
    }

    if (!profile.is_active) {
      redirect("/unauthorized");
    }

    if (profile.role === "evenvibe_admin") {
      redirect("/admin");
    } else if (profile.role === "school_admin" && profile.school_id) {
      redirect("/school");
    } else {
      redirect("/unauthorized");
    }
  }

  return <LoginForm />;
}
