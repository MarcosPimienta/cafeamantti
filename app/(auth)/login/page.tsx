"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { login, signup } from "./actions";
import { Coffee } from "lucide-react";
import Link from "next/link";

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

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

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
    try {
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (value) formData.append(key, value as string);
      });

      // Call standard server actions
      if (isLogin) {
        await login(formData);
      } else {
        await signup(formData);
      }
    } catch (e: any) {
      setErrorMsg("An unexpected error occurred.");
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    reset();
    setErrorMsg("");
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4 font-sans text-foreground">
      <div className="max-w-md w-full p-8 bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-gray-100">
        {/* Logo & Headline */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-foreground rounded-full flex items-center justify-center mb-4">
            {/* Themed dark icon representation */}
            <Coffee className="w-8 h-8 text-background" strokeWidth={1.5} />
          </div>
          <h1 className="text-4xl font-serif text-center mb-2 text-foreground">
            Amantti
          </h1>
          <p className="text-sm text-foreground/70 text-center font-medium tracking-wide uppercase">
            {isLogin ? "Welcome Back" : "Create an Account"}
          </p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-3 bg-red-50 text-red-800 text-sm rounded-md border border-red-200">
            {errorMsg}
          </div>
        )}

        {/* Auth Form */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-5"
          suppressHydrationWarning
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Email
              </label>
              <input
                {...register("email")}
                type="email"
                suppressHydrationWarning
                className="block w-full rounded-lg border border-gray-200 bg-white/80 px-4 py-2.5 text-foreground placeholder:text-gray-400 focus:border-foreground focus:outline-none focus:ring-1 focus:ring-foreground transition-all"
                placeholder="hello@example.com"
              />
              {errors.email?.message && (
                <p className="mt-1.5 text-sm text-red-600 font-medium">
                  {String(errors.email.message)}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Password
              </label>
              <input
                {...register("password")}
                type="password"
                suppressHydrationWarning
                className="block w-full rounded-lg border border-gray-200 bg-white/80 px-4 py-2.5 text-foreground placeholder:text-gray-400 focus:border-foreground focus:outline-none focus:ring-1 focus:ring-foreground transition-all"
                placeholder="••••••••"
              />
              {errors.password?.message && (
                <p className="mt-1.5 text-sm text-red-600 font-medium">
                  {String(errors.password.message)}
                </p>
              )}
            </div>
          </div>

          {/* Signup Only Fields */}
          {!isLogin && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1">
                    First Name
                  </label>
                  <input
                    {...register("firstName")}
                    className="block w-full rounded-lg border border-gray-200 bg-white/80 px-4 py-2.5 text-foreground placeholder:text-gray-400 focus:border-foreground focus:outline-none focus:ring-1 focus:ring-foreground transition-all"
                  />
                  {errors.firstName?.message && (
                    <p className="mt-1.5 text-sm text-red-600 font-medium">
                      {String(errors.firstName.message)}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1">
                    Last Name
                  </label>
                  <input
                    {...register("lastName")}
                    className="block w-full rounded-lg border border-gray-200 bg-white/80 px-4 py-2.5 text-foreground placeholder:text-gray-400 focus:border-foreground focus:outline-none focus:ring-1 focus:ring-foreground transition-all"
                  />
                  {errors.lastName?.message && (
                    <p className="mt-1.5 text-sm text-red-600 font-medium">
                      {String(errors.lastName.message)}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  Phone Number
                </label>
                <div className="relative border border-gray-200 bg-white/80 rounded-lg flex items-center focus-within:ring-1 focus-within:ring-foreground focus-within:border-foreground transition-all">
                  <span className="pl-4 text-foreground/60 text-sm font-medium">
                    +57
                  </span>
                  <input
                    {...register("phone")}
                    placeholder="300 123 4567"
                    className="block w-full bg-transparent pl-2 pr-4 py-2.5 text-foreground placeholder:text-gray-400 focus:outline-none"
                  />
                </div>
                {errors.phone?.message && (
                  <p className="mt-1.5 text-sm text-red-600 font-medium">
                    {String(errors.phone.message)}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  Cédula
                </label>
                <input
                  {...register("cedula")}
                  placeholder="10293847"
                  className="block w-full rounded-lg border border-gray-200 bg-white/80 px-4 py-2.5 text-foreground placeholder:text-gray-400 focus:border-foreground focus:outline-none focus:ring-1 focus:ring-foreground transition-all"
                />
                {errors.cedula?.message && (
                  <p className="mt-1.5 text-sm text-red-600 font-medium">
                    {String(errors.cedula.message)}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              suppressHydrationWarning
              className="w-full rounded-lg bg-foreground px-4 py-3 text-sm font-semibold text-background shadow-lg hover:bg-foreground/90 focus:outline-none focus:ring-2 focus:ring-foreground focus:ring-offset-2 disabled:opacity-50 transition-all font-serif tracking-wide"
            >
              {isSubmitting ? "Please wait..." : isLogin ? "Log In" : "Sign Up"}
            </button>
          </div>
        </form>

        <div className="mt-8 text-center sm:text-sm">
          <p className="text-foreground/70">
            {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
            <Link
              href={isLogin ? "/register" : "/login"}
              className="font-semibold text-foreground hover:underline focus:outline-none transition-all"
            >
              {isLogin ? "Sign up" : "Log in"}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
