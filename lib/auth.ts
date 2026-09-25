import "server-only";
import { redirect } from "next/navigation";
import { createSessionClient } from "./supabase/server";

/** Every admin page and admin action calls this first. */
export async function requireAdmin() {
  const supabase = await createSessionClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  // RLS on `admins` only returns rows to admins, so a hit here proves admin rights.
  const { data: admin } = await supabase.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!admin) redirect("/admin/login?error=not_admin");

  return { supabase, user };
}
