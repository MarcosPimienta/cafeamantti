import { redirect } from "next/navigation";
import { checkIsAdmin } from "../../../../actions";
import { getMaquilaProposal } from "../actions";
import MaquilaForm from "../MaquilaForm";
import { loadMaquilaFormData } from "../loadFormData";
import { MaquilaHeader as Header } from "../MaquilaHeader";
import { getProposalAssetSignedUrl } from "@/utils/supabase/storage";

export default async function EditMaquilaPage(props: { params: Promise<{ id: string }> }) {
  if (!(await checkIsAdmin())) redirect("/dashboard");
  const { id } = await props.params;
  const [proposal, { clients, packaging, coffeeCostPerKg, optionPrices, sellerName }] = await Promise.all([getMaquilaProposal(id), loadMaquilaFormData()]);
  if (!proposal) redirect("/admin/quotes?tab=maquila");
  // Signed URLs expire, so they are made fresh for each visit.
  const signed = (path: unknown) => (typeof path === "string" && path ? getProposalAssetSignedUrl(path) : Promise.resolve(null));
  const [background, allyLogo] = await Promise.all([signed(proposal.settings?.background_path), signed(proposal.settings?.ally_logo_path)]);
  return (
    <div className="space-y-6">
      <Header title="Editar propuesta de maquila" />
      <MaquilaForm key={proposal.updated_at} clients={clients} packaging={packaging} coffeeCostPerKg={coffeeCostPerKg} optionPrices={optionPrices} initial={proposal} initialAssetUrls={{ background, allyLogo }} sellerName={sellerName} />
    </div>
  );
}
