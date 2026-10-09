import { redirect } from "next/navigation";
import { checkIsAdmin } from "../../../../actions";
import { getMaquilaProposal } from "../actions";
import MaquilaForm from "../MaquilaForm";
import { loadMaquilaFormData } from "../loadFormData";
import { MaquilaHeader as Header } from "../MaquilaHeader";

export default async function EditMaquilaPage(props: { params: Promise<{ id: string }> }) {
  if (!(await checkIsAdmin())) redirect("/dashboard");
  const { id } = await props.params;
  const [proposal, { clients, packaging, sellerName }] = await Promise.all([getMaquilaProposal(id), loadMaquilaFormData()]);
  if (!proposal) redirect("/admin/quotes?tab=maquila");
  return (
    <div className="space-y-6">
      <Header title="Editar propuesta de maquila" />
      <MaquilaForm key={proposal.updated_at} clients={clients} packaging={packaging} initial={proposal} sellerName={sellerName} />
    </div>
  );
}
