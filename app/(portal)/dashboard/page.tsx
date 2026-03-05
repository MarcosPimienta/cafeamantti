import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const supabase = await createClient();

  // We know the user is authenticated thanks to middleware,
  // but let's get the user ID to check their profile.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch the existing profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("cedula_number, address, first_name")
    .eq("id", user.id)
    .single();

  // Onboarding Check: If missing required fields, force redirect
  if (!profile?.cedula_number || !profile?.address) {
    redirect("/onboarding");
  }

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">Customer Dashboard</h1>
      <p className="mt-4">Welcome back, {profile.first_name || "Customer"}.</p>
      <div className="mt-8 p-4 bg-gray-100 rounded-md">
        <h2 className="font-semibold text-lg">Your Profile Data</h2>
        <ul className="mt-2 text-sm text-gray-700">
          <li>
            <strong>Cédula:</strong> {profile.cedula_number}
          </li>
          <li>
            <strong>Address:</strong> {profile.address}
          </li>
        </ul>
      </div>
    </main>
  );
}
