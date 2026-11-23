import { redirect } from "next/navigation";
import { checkIsAdmin } from "../../actions";
import LogisticsClient from "./LogisticsClient";

export const metadata = { title: "Logística - Café Amantti" };

export default async function LogisticsPage() {
  if (!(await checkIsAdmin())) redirect("/dashboard");
  return <LogisticsClient />;
}
