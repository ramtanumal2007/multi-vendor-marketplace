import React from "react";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ToastContainer } from "@/components/ui/Toast";
import { AdminNavigation } from "@/components/admin/AdminNavigation";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    redirect("/login?redirect=/admin");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || profile.role !== "admin") {
    console.error("[Admin Guard] Access denied for user:", user.id, "Profile error:", profileError, "Profile data:", profile);
    redirect("/");
  }

  return (
    <>
      <AdminNavigation>
        {children}
      </AdminNavigation>
      <ToastContainer />
    </>
  );
}
