import { redirect } from "next/navigation";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth/server";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active) {
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
