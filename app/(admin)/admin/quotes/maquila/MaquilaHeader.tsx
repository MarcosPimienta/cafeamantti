import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function MaquilaHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-4">
      <Link href="/admin/quotes?tab=maquila" className="p-3 bg-white border border-foreground/5 rounded-xl hover:bg-foreground/5" aria-label="Volver">
        <ArrowLeft className="w-5 h-5 text-foreground/60" />
      </Link>
      <div>
        <h1 className="text-2xl sm:text-3xl font-serif text-foreground mb-1">{title}</h1>
        <p className="text-foreground/60 text-sm">Empaque y etiquetado del café del cliente, cobrado por unidad empacada.</p>
      </div>
    </div>
  );
}
