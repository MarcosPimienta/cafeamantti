import React from "react";
import { ArrowLeft, History, FileText, CheckCircle, XCircle, Edit, Trash2, PlusCircle } from "lucide-react";
import Link from "next/link";
import { getCashflowHistory } from "../actions";

export default async function CashflowHistoryPage() {
  const history = await getCashflowHistory();

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'CREATE_EXPENSE': return <PlusCircle className="w-5 h-5 text-green-500" />;
      case 'UPDATE_EXPENSE': return <Edit className="w-5 h-5 text-blue-500" />;
      case 'DELETE_EXPENSE': return <Trash2 className="w-5 h-5 text-red-500" />;
      case 'UPDATE_CASHFLOW': return <FileText className="w-5 h-5 text-purple-500" />;
      default: return <History className="w-5 h-5 text-gray-500" />;
    }
  };

  const getActionName = (type: string) => {
    switch (type) {
      case 'CREATE_EXPENSE': return "Gasto Creado";
      case 'UPDATE_EXPENSE': return "Gasto Actualizado";
      case 'DELETE_EXPENSE': return "Gasto Eliminado";
      case 'UPDATE_CASHFLOW': return "Cierre de Caja Actualizado";
      default: return type;
    }
  };

  return (
    <div className="space-y-8 pb-24">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link 
          href="/admin/cashflow" 
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-foreground/10 text-foreground/60 hover:text-foreground hover:border-foreground/30 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-serif text-foreground">Historial y Auditoría</h1>
          <p className="text-foreground/60">Bitácora de movimientos en los gastos y cierres de caja.</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-8 border border-foreground/5 shadow-sm">
        {history.length === 0 ? (
          <div className="text-center py-12 text-foreground/40">
            <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No hay registros en el historial todavía.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {history.map((log: any) => (
              <div key={log.id} className="flex gap-4 p-4 border border-foreground/5 rounded-xl bg-[#fdfbf7]">
                <div className="mt-1">
                  {getActionIcon(log.action_type)}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between items-start">
                    <p className="font-bold text-foreground">
                      {getActionName(log.action_type)}
                    </p>
                    <span className="text-xs text-foreground/50">
                      {new Date(log.created_at).toLocaleString('es-CO')}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/70">
                    Realizado por: <span className="font-semibold">{log.profiles?.full_name || log.profiles?.email || 'Usuario Desconocido'}</span>
                  </p>
                  
                  {log.cashflow?.date && (
                    <p className="text-xs font-mono text-foreground/50 bg-foreground/5 px-2 py-1 rounded inline-block mt-2">
                      Fecha de Caja: {log.cashflow.date}
                    </p>
                  )}

                  <div className="mt-4 bg-white border border-foreground/5 rounded-lg p-3 overflow-x-auto text-xs font-mono text-foreground/60">
                    {log.details?.old && (
                      <div className="mb-2">
                        <span className="text-red-500 font-bold">Anterior:</span> {JSON.stringify(log.details.old)}
                      </div>
                    )}
                    {log.details?.new && (
                      <div>
                        <span className="text-green-500 font-bold">Nuevo:</span> {JSON.stringify(log.details.new)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
