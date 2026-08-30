"use client";

import { useState } from "react";
import { Coffee, Lock, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { updatePassword } from "../actions";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg("");

    if (password.length < 6) {
      setErrorMsg("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg("Las contraseñas no coinciden.");
      return;
    }

    setIsSubmitting(true);
    const formData = new FormData();
    formData.append("password", password);
    formData.append("confirmPassword", confirmPassword);

    const response = await updatePassword(null, formData);
    setIsSubmitting(false);

    if (response?.error) {
      setErrorMsg(response.error);
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
        {/* Logo & Headline */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 bg-[#C2A878] rounded-sm flex items-center justify-center mb-6 shadow-xl ring-8 ring-[#C2A878]/10 border border-[#C2A878]/20">
            <Coffee className="w-10 h-10 text-[#0B0B0B]" strokeWidth={1.2} />
          </div>
          <h1 className="text-5xl md:text-6xl font-bodoni italic text-center mb-3 text-[#F4F1ED] tracking-tight leading-none">
            amantti.
          </h1>
          <p className="text-[10px] text-white/40 text-center font-bold tracking-[0.3em] uppercase">
            Establecer Nueva Contraseña
          </p>
        </div>

        <p className="text-xs text-white/60 mb-6 text-center leading-relaxed">
          Ingresa tu nueva contraseña para acceder nuevamente a tu cuenta.
        </p>

        {errorMsg && (
          <div className="mb-6 p-4 bg-red-50 text-red-800 text-[11px] font-medium rounded-2xl border border-red-100 flex items-center gap-3">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="group">
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 mb-2 px-1 transition-colors group-focus-within:text-[#C2A878]">
              Nueva Contraseña
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-[#C2A878] transition-colors" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="block w-full rounded-sm border border-white/20 bg-transparent pl-12 pr-5 py-4 text-sm text-[#F4F1ED] focus:border-[#C2A878] focus:outline-none transition-all placeholder:text-white/20"
              />
            </div>
          </div>

          <div className="group">
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 mb-2 px-1 transition-colors group-focus-within:text-[#C2A878]">
              Confirmar Nueva Contraseña
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-[#C2A878] transition-colors" />
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="block w-full rounded-sm border border-white/20 bg-transparent pl-12 pr-5 py-4 text-sm text-[#F4F1ED] focus:border-[#C2A878] focus:outline-none transition-all placeholder:text-white/20"
              />
            </div>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-sm bg-[#C2A878] px-6 py-4 text-sm font-bold uppercase tracking-widest text-[#0B0B0B] hover:bg-[#F4F1ED] transition-all duration-500 disabled:opacity-50"
            >
              {isSubmitting ? "Actualizando..." : "Guardar Contraseña"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
