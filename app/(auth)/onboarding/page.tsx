import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

export default async function OnboardingPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch the existing profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("cedula_number, address")
    .eq("id", user.id)
    .single();

  // If already complete, go to dashboard
  if (profile?.cedula_number && profile?.address) {
    redirect("/portal/dashboard");
  }

  async function completeProfile(formData: FormData) {
    "use server";
    const supabaseServer = await createClient();
    const {
      data: { user },
    } = await supabaseServer.auth.getUser();

    if (user) {
      const cedula_number = formData.get("cedula_number") as string;
      const address = formData.get("address") as string;

      await supabaseServer
        .from("profiles")
        .update({ cedula_number, address })
        .eq("id", user.id);

      redirect("/portal/dashboard");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full p-8 bg-white rounded-xl shadow-lg">
        <h1 className="text-3xl font-bold mb-6 text-center text-gray-800">
          Complete Your Profile
        </h1>
        <p className="text-gray-600 mb-6 text-center">
          We need a few more details before you can continue.
        </p>

        <form action={completeProfile} className="space-y-4">
          <div>
            <label
              htmlFor="cedula_number"
              className="block text-sm font-medium text-gray-700"
            >
              Cédula Number (ID)
            </label>
            <input
              id="cedula_number"
              name="cedula_number"
              type="text"
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
            />
          </div>
          <div>
            <label
              htmlFor="address"
              className="block text-sm font-medium text-gray-700"
            >
              Shipping Address
            </label>
            <input
              id="address"
              name="address"
              type="text"
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
            />
          </div>

          <div className="pt-4">
            <button
              type="submit"
              className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            >
              Save & Continue
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
