"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSessionClient } from "@/lib/supabase/server";

export async function sendLoginLink(fd: FormData) {
  const email = z.string().trim().email().safeParse(fd.get("email"));
  if (!email.success) redirect("/admin/login?error=email");

  const supabase = await createSessionClient();
  // shouldCreateUser: false → only accounts you created in Supabase can log in.
  await supabase.auth.signInWithOtp({
    email: email.data,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  });
  // Same message whether or not the email exists: don't reveal who the admin is.
  redirect("/admin/login?sent=1");
}
