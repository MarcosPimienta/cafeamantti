"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Coffee, ArrowRight, User, Mail, Lock, Phone, CreditCard, Globe, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { signup } from "../login/actions"; // Reusing the signup action

const signupSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
  firstName: z.string().min(2, { message: "First name is required" }),
  lastName: z.string().min(2, { message: "Last name is required" }),
  phone: z.string().regex(/^(\+57)?\s?\d{10}$/, {
    message: "Invalid format. E.g: 3001234567",
  }),
  cedula: z.string().regex(/^\d{8,10}$/, { message: "Cédula must be 8-10 digits" }),
  address: z.string().min(5, { message: "Address is too short" }),
  terms: z.boolean().refine((val) => val === true, {
    message: "Debes aceptar los términos y condiciones",
  }),
});

type FormValues = z.infer<typeof signupSchema>;

export default function RegisterPage() {
  const [errorMsg, setErrorMsg] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      email: "",
      password: "",
      firstName: "",
      lastName: "",
      phone: "",
      cedula: "",
      address: "",
      terms: false as any,
    },
  });

  const onSubmit = async (data: FormValues) => {
    setErrorMsg("");
    try {
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (key !== "terms") {
          formData.append(key, String(value));
        }
      });
      await signup(formData);
    } catch (e: any) {
      setErrorMsg("An unexpected error occurred.");
    }
  };

  return (
    <main suppressHydrationWarning className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Brand Background */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat z-0 scale-105 blur-[2px]"
        style={{ backgroundImage: "url('/images/AmanttiBG02.png')" }}
      />
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-10" />

      <div className="max-w-xl w-full p-10 bg-white/90 backdrop-blur-2xl rounded-[2.5rem] shadow-2xl border border-white/20 relative z-20 animate-in fade-in zoom-in duration-700">
        <Link 
          href="/" 
          className="absolute -top-12 left-0 flex items-center gap-2 text-white/60 hover:text-white transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
          <span className="text-sm font-medium tracking-tight">Volver al inicio</span>
        </Link>
        <div className="relative z-10">
          <div className="flex flex-col items-center mb-10">
            <Link href="/" className="mb-6">
              <div className="w-16 h-16 bg-foreground rounded-full flex items-center justify-center shadow-lg transform hover:scale-110 transition-transform ring-8 ring-foreground/5">
                <Coffee className="w-8 h-8 text-background" strokeWidth={1.5} />
              </div>
            </Link>
            <h1 className="text-5xl md:text-6xl font-bodoni italic text-center mb-3 tracking-tight">
              amantti.
            </h1>
            <p className="text-[10px] text-foreground/40 text-center font-bold tracking-[0.3em] uppercase max-w-xs leading-relaxed">
              Crea tu perfil y comienza a disfrutar del café más selecto de Colombia.
            </p>
          </div>

          {errorMsg && (
            <div className="mb-8 p-4 bg-red-50 text-red-800 text-[11px] font-medium rounded-2xl border border-red-100 flex items-center gap-3">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
              {errorMsg}
            </div>
          )}

          <form suppressHydrationWarning onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="group space-y-2">
                <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/30 px-1 transition-colors group-focus-within:text-[#C59F59]">Nombre</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/20 group-focus-within:text-[#C59F59] transition-colors" />
                  <input
                    {...register("firstName")}
                    suppressHydrationWarning
                    className="w-full rounded-2xl border border-foreground/10 bg-white/50 px-12 py-4 text-sm focus:border-[#C59F59] focus:outline-none focus:ring-4 focus:ring-[#C59F59]/5 transition-all placeholder:text-foreground/20"
                    placeholder="Juan"
                  />
                </div>
                {errors.firstName && <p className="text-[10px] text-red-500 mt-1 px-1 font-medium">{errors.firstName.message}</p>}
              </div>

              <div className="group space-y-2">
                <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/30 px-1 transition-colors group-focus-within:text-[#C59F59]">Apellido</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/20 group-focus-within:text-[#C59F59] transition-colors" />
                  <input
                    {...register("lastName")}
                    suppressHydrationWarning
                    className="w-full rounded-2xl border border-foreground/10 bg-white/50 px-12 py-4 text-sm focus:border-[#C59F59] focus:outline-none focus:ring-4 focus:ring-[#C59F59]/5 transition-all placeholder:text-foreground/20"
                    placeholder="Pérez"
                  />
                </div>
                {errors.lastName && <p className="text-[10px] text-red-500 mt-1 px-1 font-medium">{errors.lastName.message}</p>}
              </div>
            </div>

            <div className="group space-y-2">
              <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/30 px-1 transition-colors group-focus-within:text-[#C59F59]">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/20 group-focus-within:text-[#C59F59] transition-colors" />
                <input
                  {...register("email")}
                  type="email"
                  suppressHydrationWarning
                  className="w-full rounded-2xl border border-foreground/10 bg-white/50 px-12 py-4 text-sm focus:border-[#C59F59] focus:outline-none focus:ring-4 focus:ring-[#C59F59]/5 transition-all placeholder:text-foreground/20"
                  placeholder="juan@ejemplo.com"
                />
              </div>
              {errors.email && <p className="text-[10px] text-red-500 mt-1 px-1 font-medium">{errors.email.message}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="group space-y-2">
                <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/30 px-1 transition-colors group-focus-within:text-[#C59F59]">Teléfono</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/20 group-focus-within:text-[#C59F59] transition-colors" />
                  <input
                    {...register("phone")}
                    suppressHydrationWarning
                    className="w-full rounded-2xl border border-foreground/10 bg-white/50 px-12 py-4 text-sm focus:border-[#C59F59] focus:outline-none focus:ring-4 focus:ring-[#C59F59]/5 transition-all placeholder:text-foreground/20"
                    placeholder="3001234567"
                  />
                </div>
                {errors.phone && <p className="text-[10px] text-red-500 mt-1 px-1 font-medium">{errors.phone.message}</p>}
              </div>

              <div className="group space-y-2">
                <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/30 px-1 transition-colors group-focus-within:text-[#C59F59]">Cédula</label>
                <div className="relative">
                  <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/20 group-focus-within:text-[#C59F59] transition-colors" />
                  <input
                    {...register("cedula")}
                    suppressHydrationWarning
                    className="w-full rounded-2xl border border-foreground/10 bg-white/50 px-12 py-4 text-sm focus:border-[#C59F59] focus:outline-none focus:ring-4 focus:ring-[#C59F59]/5 transition-all placeholder:text-foreground/20"
                    placeholder="1029384756"
                  />
                </div>
                {errors.cedula && <p className="text-[10px] text-red-500 mt-1 px-1 font-medium">{errors.cedula.message}</p>}
              </div>
            </div>

            <div className="group space-y-2">
              <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/30 px-1 transition-colors group-focus-within:text-[#C59F59]">Dirección de Envío</label>
              <div className="relative">
                <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/20 group-focus-within:text-[#C59F59] transition-colors" />
                <input
                  {...register("address")}
                  suppressHydrationWarning
                  className="w-full rounded-2xl border border-foreground/10 bg-white/50 px-12 py-4 text-sm focus:border-[#C59F59] focus:outline-none focus:ring-4 focus:ring-[#C59F59]/5 transition-all placeholder:text-foreground/20"
                  placeholder="Calle 123 # 45 - 67, Bogotá"
                />
              </div>
              {errors.address && <p className="text-[10px] text-red-500 mt-1 px-1 font-medium">{errors.address.message}</p>}
            </div>

            <div className="group space-y-2">
              <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/30 px-1 transition-colors group-focus-within:text-[#C59F59]">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/20 group-focus-within:text-[#C59F59] transition-colors" />
                <input
                  {...register("password")}
                  type="password"
                  suppressHydrationWarning
                  className="w-full rounded-2xl border border-foreground/10 bg-white/50 px-12 py-4 text-sm focus:border-[#C59F59] focus:outline-none focus:ring-4 focus:ring-[#C59F59]/5 transition-all placeholder:text-foreground/20"
                  placeholder="••••••••"
                />
              </div>
              {errors.password && <p className="text-[10px] text-red-500 mt-1 px-1 font-medium">{errors.password.message}</p>}
            </div>

            <div className="flex items-start gap-3 px-1 mt-6">
              <div className="flex h-5 items-center mt-1">
                <input
                  id="terms"
                  type="checkbox"
                  {...register("terms")}
                  className="w-4 h-4 rounded border-foreground/20 text-[#C59F59] focus:ring-[#C59F59]"
                />
              </div>
              <div className="text-sm">
                <label htmlFor="terms" className="text-foreground/60">
                  Acepto los <Link href="/terms" target="_blank" className="font-bold text-[#C59F59] hover:underline">Términos y Condiciones</Link>
                </label>
                {errors.terms && <p className="text-[10px] text-red-500 mt-1 font-medium">{errors.terms.message}</p>}
              </div>
            </div>

            <div className="pt-6">
              <button
                type="submit"
                disabled={isSubmitting}
                suppressHydrationWarning
                className="group w-full rounded-2xl bg-foreground px-6 py-4 text-sm font-bold uppercase tracking-widest text-background shadow-xl hover:bg-[#C59F59] hover:text-white transition-all duration-500 flex items-center justify-center gap-3 disabled:opacity-50"
              >
                <span>{isSubmitting ? "Registrando..." : "Crear Cuenta"}</span>
                {!isSubmitting && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
              </button>
            </div>
          </form>

          <div className="mt-10 pt-10 border-t border-foreground/5 text-center">
            <p className="text-sm text-foreground/40">
              ¿Ya tienes cuenta?{" "}
              <Link href="/login" className="font-bold text-foreground hover:text-[#C59F59] transition-colors">
                Inicia Sesión
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
