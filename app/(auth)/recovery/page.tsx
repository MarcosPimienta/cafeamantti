"use client";

import { useState } from "react";
import { Coffee, ArrowLeft, Mail, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { requestPasswordReset } from "./actions";

export default function RecoveryPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg("");
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const response = await requestPasswordReset(null, formData);

    setIsSubmitting(false);

    if (response?.error) {
      setErrorMsg(response.error);
    } else {
      setIsSuccess(true);
    }
  };

  return (
    <main suppressHydrationWarning className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Brand Background */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat z-0 scale-105 blur-[2px]"
        style={{ backgroundImage: "url('/images/AmanttiBG02.png')" }}
      />
      <div className="absolute inset-0 bg-black/80 backdrop-blur-[2px] z-10" />

      <div className="max-w-md w-full p-10 bg-[#0B0B0B]/90 backdrop-blur-2xl rounded-sm shadow-2xl border border-[#C2A878]/20 relative z-20 animate-in fade-in zoom-in duration-700">
        <Link 
          href="/login" 
          className="absolute -top-12 left-0 flex items-center gap-2 text-white/60 hover:text-white transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
          <span className="text-sm font-medium tracking-tight">Volver al inicio de sesión</span>
        </Link>

        {/* Logo & Headline */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 bg-[#C2A878] rounded-sm flex items-center justify-center mb-6 shadow-xl ring-8 ring-[#C2A878]/10 border border-[#C2A878]/20">
            <Coffee className="w-10 h-10 text-[#0B0B0B]" strokeWidth={1.2} />
          </div>
          <h1 className="text-5xl md:text-6xl font-bodoni italic text-center mb-3 text-[#F4F1ED] tracking-tight leading-none">
            amantti.
          </h1>
          <p className="text-[10px] text-white/40 text-center font-bold tracking-[0.3em] uppercase">
            Recuperación de Contraseña
          </p>
        </div>

        {isSuccess ? (
          <div className="space-y-6 text-center animate-in fade-in duration-500">
            <div className="w-16 h-16 bg-[#C2A878]/10 border border-[#C2A878]/30 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-[#C2A878]" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-serif text-[#F4F1ED]">Enlace enviado</h2>
              <p className="text-xs text-white/60 leading-relaxed">
                Hemos enviado un correo a <span className="text-[#C2A878] font-medium">{email}</span> con las instrucciones para restablecer tu contraseña.
              </p>
              <p className="text-[11px] text-white/40 pt-2">
                Si no lo encuentras en unos minutos, revisa tu carpeta de spam.
              </p>
            </div>
            <div className="pt-4">
              <Link
                href="/login"
                className="inline-block w-full rounded-sm bg-[#C2A878] px-6 py-4 text-sm font-bold uppercase tracking-widest text-[#0B0B0B] hover:bg-[#F4F1ED] transition-all duration-500"
              >
                Regresar a Iniciar Sesión
              </Link>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-white/60 mb-6 text-center leading-relaxed">
              Ingresa el correo electrónico asociado a tu cuenta y te enviaremos un enlace seguro para restablecer tu contraseña.
            </p>

            {errorMsg && (
              <div className="mb-6 p-4 bg-red-50 text-red-800 text-[11px] font-medium rounded-2xl border border-red-100 flex items-center gap-3">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Honeypot */}
              <div className="absolute left-[-9999px] top-[-9999px]" aria-hidden="true">
                <input name="website" type="text" tabIndex={-1} autoComplete="off" />
              </div>

              <div className="group">
                <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 mb-2 px-1 transition-colors group-focus-within:text-[#C2A878]">
                  Correo Electrónico
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-[#C2A878] transition-colors" />
                  <input
                    name="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="hola@ejemplo.com"
                    className="block w-full rounded-sm border border-white/20 bg-transparent pl-12 pr-5 py-4 text-sm text-[#F4F1ED] focus:border-[#C2A878] focus:outline-none transition-all placeholder:text-white/20"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-sm bg-[#C2A878] px-6 py-4 text-sm font-bold uppercase tracking-widest text-[#0B0B0B] hover:bg-[#F4F1ED] transition-all duration-500 disabled:opacity-50"
                >
                  {isSubmitting ? "Enviando..." : "Enviar Enlace"}
                </button>
              </div>
            </form>

            <div className="mt-8 pt-8 border-t border-white/10 text-center">
              <p className="text-sm text-white/40">
                ¿Recordaste tu contraseña?{" "}
                <Link
                  href="/login"
                  className="font-bold text-[#F4F1ED] hover:text-[#C2A878] transition-colors"
                >
                  Iniciar Sesión
                </Link>
              </p>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
