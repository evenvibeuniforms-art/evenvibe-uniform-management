"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function signOutAction(): Promise<{ success: false; error: string } | void> {
  let signOutError: string | null = null;

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      // If the session was already expired, missing, or invalid, it is effectively logged out
      const msg = error.message?.toLowerCase() || "";
      const isMissingSession =
        msg.includes("session") && (msg.includes("missing") || msg.includes("not found"));

      if (!isMissingSession) {
        console.error("[signOutAction] Supabase auth.signOut error:", error.message);
        signOutError = error.message;
      }
    }
  } catch (err) {
    console.error(
      "[signOutAction] Unexpected error in signOut:",
      err instanceof Error ? err.message : String(err)
    );
    signOutError =
      err instanceof Error ? err.message : "An unexpected error occurred during sign out.";
  }

  if (signOutError) {
    return { success: false, error: signOutError };
  }

  // Explicitly delete any remaining Supabase auth cookies in the cookieStore
  try {
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    for (const cookie of allCookies) {
      if (
        cookie.name.startsWith("sb-") &&
        (cookie.name.includes("-auth-token") || cookie.name.endsWith("-token"))
      ) {
        cookieStore.set(cookie.name, "", {
          maxAge: 0,
          path: "/",
          expires: new Date(0),
        });
        cookieStore.delete(cookie.name);
      }
    }
  } catch (cookieErr) {
    console.error(
      "[signOutAction] Error clearing auth cookies:",
      cookieErr instanceof Error ? cookieErr.message : String(cookieErr)
    );
  }

  revalidatePath("/", "layout");
  redirect("/login");
}
