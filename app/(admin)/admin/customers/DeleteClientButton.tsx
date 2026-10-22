"use client";

import React, { useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { deleteClientCRM } from "../../actions";
import { useTr } from "@/app/(admin)/AdminI18n";

/** Deletes a client with nothing attached (the server refuses otherwise). */
export default function DeleteClientButton({ client }: { client: { id: string; name: string } }) {
  const tr = useTr();
  const [isPending, startTransition] = useTransition();

  const remove = () => {
    if (!window.confirm(tr("¿Eliminar el cliente {name}? No se puede deshacer.", { name: client.name }))) return;
    startTransition(async () => {
      const res = await deleteClientCRM(client.id);
      if (!res.success) window.alert(tr.msg(res.error));
    });
  };

  return (
    <button type="button" onClick={remove} disabled={isPending} className="p-1.5 rounded-lg text-foreground/40 hover:text-red-600 hover:bg-foreground/5 disabled:opacity-50" aria-label={tr("Eliminar {name}", { name: client.name })}>
      {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
    </button>
  );
}
