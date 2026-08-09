"use client";

import { useState, useEffect, Suspense } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { login, signup } from "./actions";
import { Coffee, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

// The validation schema
const loginSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  password: z
    .string()
    .min(6, { message: "Password must be at least 6 characters" }),
});

const signupSchema = loginSchema.extend({
  firstName: z.string().min(2, { message: "First name is required" }),
  lastName: z.string().min(2, { message: "Last name is required" }),
  // Validate Colombian phone starting with +57
  phone: z.string().regex(/^(\+57)?\s?\d{10}$/, {
    message: "Invalid format. E.g: +57 3001234567",
  }),
  // Validate Cedula length
  cedula: z
    .string()
    .regex(/^\d{8,10}$/, { message: "Cédula must be 8-10 digits" }),
});

function LoginForm() {
  const [isLogin, setIsLogin] = useState(true);
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (urlError) {
      setErrorMsg(urlError);
    }
  }, [urlError]);

  const schema = isLogin ? loginSchema : signupSchema;

  type FormValues = z.infer<typeof signupSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      email: "",
      password: "",
      firstName: "",
      lastName: "",
      phone: "",
      cedula: "",
    },
  });

  const onSubmit = async (data: any) => {
    setErrorMsg("");
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value) formData.append(key, value as string);
    });

    const redirectTo = searchParams.get("redirectTo");
    if (redirectTo) {
      formData.append("redirectTo", redirectTo);
    }

    if (isLogin) {
      await login(formData);
    } else {
      await signup(formData);
    }
    // Note: No try/catch here because login/signup use redirect(), 
    // which shouldn't be caught by a generic error handler in the client.
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    reset();
    setErrorMsg("");
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
          href="/" 
          className="absolute -top-12 left-0 flex items-center gap-2 text-white/60 hover:text-white transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
          <span className="text-sm font-medium tracking-tight">Volver al inicio</span>
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
            {isLogin ? "Bienvenido de nuevo" : "Crea tu cuenta"}
          </p>
        </div>

        {errorMsg && (
          <div className="mb-8 p-4 bg-red-50 text-red-800 text-[11px] font-medium rounded-2xl border border-red-100 flex items-center gap-3">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
            {errorMsg}
          </div>
        )}

        {/* Auth Form */}
          <form
            suppressHydrationWarning
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-6"
          >
            {/* HONEYPOT FIELD - Hidden from humans, bots will fill it */}
            <div className="absolute left-[-9999px] top-[-9999px]" aria-hidden="true">
              <label htmlFor="website">Website</label>
              <input
                id="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                suppressHydrationWarning
                {...register("website" as any)}
              />
            </div>
          <div className="space-y-5">
            <div className="group">
              <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 mb-2 px-1 transition-colors group-focus-within:text-[#C2A878]">
                Email
              </label>
              <input
                {...register("email")}
                type="email"
                suppressHydrationWarning
                className="block w-full rounded-sm border border-white/20 bg-transparent px-5 py-4 text-sm text-[#F4F1ED] focus:border-[#C2A878] focus:outline-none transition-all placeholder:text-white/20"
                placeholder="hola@ejemplo.com"
              />
              {errors.email?.message && (
                <p className="mt-1.5 text-[10px] text-red-600 font-medium px-1">
                  {String(errors.email.message)}
                </p>
              )}
            </div>

            <div className="group">
              <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 mb-2 px-1 transition-colors group-focus-within:text-[#C2A878]">
                Contraseña
              </label>
              <input
                {...register("password")}
                type="password"
                suppressHydrationWarning
                className="block w-full rounded-sm border border-white/20 bg-transparent px-5 py-4 text-sm text-[#F4F1ED] focus:border-[#C2A878] focus:outline-none transition-all placeholder:text-white/20"
                placeholder="••••••••"
              />
              {errors.password?.message && (
                <p className="mt-1.5 text-[10px] text-red-600 font-medium px-1">
                  {String(errors.password.message)}
                </p>
              )}
            </div>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              suppressHydrationWarning
              className="w-full rounded-sm bg-[#C2A878] px-6 py-4 text-sm font-bold uppercase tracking-widest text-[#0B0B0B] hover:bg-[#F4F1ED] transition-all duration-500 disabled:opacity-50"
            >
              {isSubmitting ? "Espere..." : isLogin ? "Iniciar Sesión" : "Registrarse"}
            </button>
          </div>
        </form>

        <div className="mt-10 pt-10 border-t border-white/10 text-center">
          <p className="text-sm text-white/40">
            {isLogin ? "¿No tienes cuenta?" : "¿Ya tienes cuenta?"}{" "}
            <Link
              href={isLogin ? "/register" : "/login"}
              className="font-bold text-[#F4F1ED] hover:text-[#C2A878] transition-colors"
            >
              {isLogin ? "Sign up" : "Log in"}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#0B0B0B]">
        <div className="w-8 h-8 border-4 border-[#C2A878]/20 border-t-[#C2A878] rounded-full animate-spin" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
