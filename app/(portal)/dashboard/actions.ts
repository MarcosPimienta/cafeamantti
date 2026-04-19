"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateUserProfile(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const sanitize = (str: string) => str ? str.replace(/<[^>]*>?/gm, '') : str;

  const first_name = sanitize(formData.get("first_name") as string);
  const last_name = sanitize(formData.get("last_name") as string);
  const phone_number = sanitize(formData.get("phone_number") as string);
  const cedula_number = sanitize(formData.get("cedula_number") as string);
  const department = sanitize(formData.get("department") as string);
  const city = sanitize(formData.get("city") as string);
  const address = sanitize(formData.get("address") as string);

  const { error } = await supabase
    .from("profiles")
    .update({
      first_name,
      last_name,
      phone_number,
      cedula_number,
      department,
      city,
      address,
    })
    .eq("id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard?tab=profile");
}
