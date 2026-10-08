import { redirect } from "next/navigation";
import { checkIsAdmin } from "../../actions";
import ComodatosClient from "./ComodatosClient";

export const metadata = { title: "Comodatos - Café Amantti" };

export default async function ComodatosPage() {
  if (!(await checkIsAdmin())) redirect("/dashboard");
  return <ComodatosClient />;
}
