"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import {
  ShoppingCart,
  Calendar,
  CalendarClock,
  CalendarDays,
  Facebook,
  Twitter,
  Youtube,
  Instagram,
  Globe,
  Coffee,
  Wrench,
  Headset,
} from "lucide-react";
import { useLanguage } from "@/app/context/LanguageContext";

export default function Home() {
  const { t, locale, setLocale } = useLanguage();
  const [grind, setGrind] = useState<"grain" | "grinded">("grain");
  const [frequency, setFrequency] = useState<"weekly" | "biWeekly" | "monthly">(
    "biWeekly"
  );

  // Map internal state keys to translation keys for display
  const grindLabel = grind === "grain" ? t("builder.grain") : t("builder.grinded");
  const frequencyLabel =
    frequency === "weekly"
      ? t("builder.weekly")
      : frequency === "biWeekly"
        ? t("builder.biWeekly")
        : t("builder.monthly");

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground overflow-x-hidden">
      {/* Navigation */}
      <header className="sticky top-0 z-50 w-full border-b border-foreground/5 bg-background/95 backdrop-blur">
        <div className="container mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <span className="font-bodoni italic text-3xl font-bold tracking-tight">
              amantti
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            <Link
              href="#historia"
              className="text-sm font-medium text-foreground/80 hover:text-foreground"
            >
              {t("nav.ourStory")}
            </Link>
            <Link
              href="#servicios"
              className="text-sm font-medium text-foreground/80 hover:text-foreground"
            >
              {t("nav.services")}
            </Link>
            <Link
              href="#suscripciones"
              className="text-sm font-medium text-foreground/80 hover:text-foreground"
            >
              {t("nav.subscriptions")}
            </Link>
            <Link
              href="/shop"
              className="text-sm font-medium text-foreground/80 hover:text-foreground"
            >
              {t("nav.shop")}
            </Link>
            <Link
              href="/login"
              className="text-sm font-medium text-foreground/80 hover:text-foreground"
            >
              {t("nav.myAccount")}
            </Link>

            {/* Language Switcher */}
            <button
              suppressHydrationWarning
              onClick={() => setLocale(locale === "es" ? "en" : "es")}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full border border-foreground/20 hover:border-[#C59F59] hover:bg-[#C59F59]/5 transition-all text-foreground/80 hover:text-foreground"
              aria-label="Switch language"
            >
              <Globe className="w-4 h-4" strokeWidth={2} />
              <span>{locale === "es" ? "EN" : "ES"}</span>
            </button>

            <button
              suppressHydrationWarning
              className="relative p-2 hover:bg-foreground/5 rounded-full transition-colors"
              aria-label={t("nav.cart")}
            >
              <ShoppingCart
                className="w-5 h-5 text-foreground/80"
                strokeWidth={2}
              />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#C59F59] text-white text-[10px] font-bold flex items-center justify-center rounded-full leading-none">
                0
              </span>
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative w-full h-[500px] flex items-center overflow-hidden">
          {/* Background Image Placeholder */}
          <div
            className="absolute inset-0 bg-zinc-800 bg-cover bg-center bg-no-repeat z-0"
            style={{ backgroundImage: "url('/images/AmanttiBG02.png')" }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/10 to-transparent z-10" />

          <div className="container mx-auto px-8 relative z-20">
            <div className="max-w-2xl">
              <h1 className="text-6xl md:text-8xl font-bodoni italic text-white mb-2 leading-none">
                amantti.
              </h1>
              <p className="text-2xl md:text-3xl text-white/90 mb-8 font-light tracking-wide">
                {t("hero.tagline")}
              </p>
              <button
                suppressHydrationWarning
                className="px-8 py-3 bg-[#C59F59] hover:bg-[#b08d4f] text-white text-lg font-medium rounded-md transition-all shadow-lg"
              >
                {t("hero.cta")}
              </button>
            </div>
          </div>
        </section>

        {/* Services Section */}
        <section className="py-24 bg-[#1a1a1a] text-white relative overflow-hidden" id="servicios">
          {/* Subtle background pattern */}
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "40px 40px" }} />

          <div className="container mx-auto px-6 max-w-6xl relative z-10">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-serif mb-6">
                {t("services.title")}
              </h2>
              <p className="text-white/70 text-lg max-w-2xl mx-auto leading-relaxed">
                {t("services.subtitle")}
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {/* Barismo Training */}
              <div className="group relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden hover:bg-white/10 hover:border-[#C59F59]/40 transition-all duration-300">
                <div className="relative w-full h-48 overflow-hidden">
                  <Image
                    src="/images/Guy_Barism.png"
                    alt="Barismo Training"
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] via-transparent to-transparent" />
                  <div className="absolute bottom-3 right-3 w-10 h-10 rounded-lg bg-[#C59F59]/90 flex items-center justify-center">
                    <Coffee className="w-5 h-5 text-white" strokeWidth={1.5} />
                  </div>
                </div>
                <div className="p-8 pt-5">
                  <h3 className="text-xl font-semibold mb-3">
                    {t("services.barismoTitle")}
                  </h3>
                  <p className="text-white/60 leading-relaxed text-sm">
                    {t("services.barismoDesc")}
                  </p>
                </div>
              </div>

              {/* Equipment Maintenance */}
              <div className="group relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden hover:bg-white/10 hover:border-[#C59F59]/40 transition-all duration-300">
                <div className="relative w-full h-48 overflow-hidden">
                  <Image
                    src="/images/Guy_Repairing.png"
                    alt="Equipment Maintenance"
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] via-transparent to-transparent" />
                  <div className="absolute bottom-3 right-3 w-10 h-10 rounded-lg bg-[#C59F59]/90 flex items-center justify-center">
                    <Wrench className="w-5 h-5 text-white" strokeWidth={1.5} />
                  </div>
                </div>
                <div className="p-8 pt-5">
                  <h3 className="text-xl font-semibold mb-3">
                    {t("services.maintenanceTitle")}
                  </h3>
                  <p className="text-white/60 leading-relaxed text-sm">
                    {t("services.maintenanceDesc")}
                  </p>
                </div>
              </div>

              {/* Ongoing Support */}
              <div className="group relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden hover:bg-white/10 hover:border-[#C59F59]/40 transition-all duration-300">
                <div className="relative w-full h-48 overflow-hidden">
                  <Image
                    src="/images/Guy_Explains.png"
                    alt="Ongoing Support"
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] via-transparent to-transparent" />
                  <div className="absolute bottom-3 right-3 w-10 h-10 rounded-lg bg-[#C59F59]/90 flex items-center justify-center">
                    <Headset className="w-5 h-5 text-white" strokeWidth={1.5} />
                  </div>
                </div>
                <div className="p-8 pt-5">
                  <h3 className="text-xl font-semibold mb-3">
                    {t("services.supportTitle")}
                  </h3>
                  <p className="text-white/60 leading-relaxed text-sm">
                    {t("services.supportDesc")}
                  </p>
                </div>
              </div>
            </div>

            <div className="text-center mt-12">
              <button
                suppressHydrationWarning
                className="px-8 py-3 bg-transparent border-2 border-[#C59F59] text-[#C59F59] hover:bg-[#C59F59] hover:text-white text-lg font-medium rounded-md transition-all"
              >
                {t("services.cta")}
              </button>
            </div>
          </div>
        </section>

        {/* Subscription Builder Section */}
        <section className="py-20 bg-background relative" id="suscripciones">
          <div className="container mx-auto px-6 max-w-6xl relative z-10">
            <h2 className="text-4xl font-serif text-foreground mb-12">
              {t("builder.title")}
            </h2>

            <div className="grid lg:grid-cols-3 gap-12 lg:gap-8 border-b border-foreground/10 pb-16">
              {/* Step 1: Coffee */}
              <div className="flex flex-col">
                <h3 className="text-xl font-medium mb-6">{t("builder.step1")}</h3>
                <div className="border-2 border-[#C59F59] rounded-2xl p-6 bg-white shadow-sm flex flex-col relative overflow-hidden">
                  <div className="w-full h-64 bg-zinc-100 rounded-xl mb-6 flex items-center justify-center overflow-hidden relative">
                    <Image
                      src="/images/Amantti_Coffee_Bag.png"
                      alt="Amantti Premium Blend Coffee Bag"
                      fill
                      className="object-contain p-4"
                    />
                  </div>

                  <div className="space-y-2 mb-6 text-sm">
                    <div className="grid grid-cols-[80px_1fr] gap-2">
                      <span className="font-bold">{t("builder.variety")}</span>
                      <span className="text-foreground/80">
                        {t("builder.varietyValue")}
                      </span>
                    </div>
                    <div className="grid grid-cols-[80px_1fr] gap-2">
                      <span className="font-bold">{t("builder.profile")}</span>
                      <span className="text-foreground/80">
                        {t("builder.profileValue")}
                      </span>
                    </div>
                    <div className="grid grid-cols-[80px_1fr] gap-2">
                      <span className="font-bold">{t("builder.altitude")}</span>
                      <span className="text-foreground/80">{t("builder.altitudeValue")}</span>
                    </div>
                    <div className="grid grid-cols-[80px_1fr] gap-2">
                      <span className="font-bold">{t("builder.notes")}</span>
                      <span className="text-foreground/80 leading-tight">
                        {t("builder.notesValue")}
                      </span>
                    </div>
                  </div>

                  <div className="mt-auto flex gap-4 pt-4 border-t border-foreground/10 justify-center">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="grind"
                        value="grain"
                        checked={grind === "grain"}
                        onChange={() => setGrind("grain")}
                        className="w-4 h-4 text-[#C59F59] focus:ring-[#C59F59]"
                        suppressHydrationWarning
                      />
                      <span className="text-sm font-medium">{t("builder.grain")}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="grind"
                        value="grinded"
                        checked={grind === "grinded"}
                        onChange={() => setGrind("grinded")}
                        className="w-4 h-4 text-[#C59F59] focus:ring-[#C59F59]"
                        suppressHydrationWarning
                      />
                      <span className="text-sm font-medium">{t("builder.grinded")}</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Step 2: Frequency */}
              <div className="flex flex-col">
                <h3 className="text-xl font-medium mb-6">
                  {t("builder.step2")}
                </h3>
                <div className="flex flex-col sm:flex-row lg:flex-col gap-4">
                  {/* Option 1 */}
                  <button
                    onClick={() => setFrequency("weekly")}
                    suppressHydrationWarning
                    className={`flex-1 lg:flex-none flex flex-col items-center justify-center p-6 rounded-xl transition-all ${frequency === "weekly" ? "border-2 border-[#C59F59] bg-[#C59F59]/5 shadow-sm relative overflow-hidden" : "border border-foreground/20 hover:border-[#C59F59] bg-white"}`}
                  >
                    <Calendar
                      className={`w-10 h-10 mb-3 ${frequency === "weekly" ? "text-[#C59F59]" : "text-foreground/70"}`}
                      strokeWidth={1.5}
                    />
                    <span className="font-medium text-sm">{t("builder.weekly")}</span>
                  </button>

                  {/* Option 2 */}
                  <button
                    onClick={() => setFrequency("biWeekly")}
                    suppressHydrationWarning
                    className={`flex-1 lg:flex-none flex flex-col items-center justify-center p-6 rounded-xl transition-all ${frequency === "biWeekly" ? "border-2 border-[#C59F59] bg-[#C59F59]/5 shadow-sm relative overflow-hidden" : "border border-foreground/20 hover:border-[#C59F59] bg-white"}`}
                  >
                    <CalendarClock
                      className={`w-10 h-10 mb-3 ${frequency === "biWeekly" ? "text-[#C59F59]" : "text-foreground/70"}`}
                      strokeWidth={1.5}
                    />
                    <span className="font-medium text-sm">{t("builder.biWeekly")}</span>
                    <span className="text-[10px] text-foreground/60 mt-1">
                      {t("builder.recommended")}
                    </span>
                  </button>

                  {/* Option 3 */}
                  <button
                    onClick={() => setFrequency("monthly")}
                    suppressHydrationWarning
                    className={`flex-1 lg:flex-none flex flex-col items-center justify-center p-6 rounded-xl transition-all ${frequency === "monthly" ? "border-2 border-[#C59F59] bg-[#C59F59]/5 shadow-sm relative overflow-hidden" : "border border-foreground/20 hover:border-[#C59F59] bg-white"}`}
                  >
                    <CalendarDays
                      className={`w-10 h-10 mb-3 ${frequency === "monthly" ? "text-[#C59F59]" : "text-foreground/70"}`}
                      strokeWidth={1.5}
                    />
                    <span className="font-medium text-sm">{t("builder.monthly")}</span>
                  </button>
                </div>
              </div>

              {/* Step 3: Summary */}
              <div className="flex flex-col">
                <h3 className="text-xl font-medium mb-6">
                  {t("builder.step3")}
                </h3>
                <div className="border border-foreground/20 rounded-2xl p-8 bg-[#fbf9f4] shadow-sm flex flex-col h-full min-h-[300px]">
                  <div className="mb-8">
                    <h4 className="font-bold text-lg mb-1">
                      {t("builder.premiumCoffee")} –{" "}
                      {grind === "grain" ? t("builder.wholeBean") : t("builder.ground")}
                    </h4>
                    <p className="text-foreground/70 text-sm mb-6">
                      {frequencyLabel} · {t("builder.delivery")}
                    </p>

                    <div className="flex justify-between items-center text-sm border-t border-foreground/10 pt-4 mb-2">
                      <span className="text-foreground/80">
                        {t("builder.priceLabel")}
                      </span>
                      <span className="font-bold text-base">$X.XX</span>
                    </div>
                  </div>

                  <button
                    suppressHydrationWarning
                    className="w-full py-4 bg-[#C59F59] hover:bg-[#b08d4f] text-white font-medium rounded-xl transition-all shadow-md mt-auto text-lg flex items-center justify-center gap-2"
                  >
                    {t("builder.completeSub")}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Decorative Plant Graphics (Bottom Left/Right placeholders) */}
          <div
            className="absolute bottom-0 left-0 opacity-20 pointer-events-none w-80 h-80 bg-no-repeat bg-bottom bg-contain"
            style={{ backgroundImage: "url('/images/branch-left.png')" }}
          />
          <div
            className="absolute bottom-0 right-0 opacity-20 pointer-events-none w-80 h-80 bg-no-repeat bg-bottom bg-contain"
            style={{ backgroundImage: "url('/images/branch-right.png')" }}
          />
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-background py-8 border-t border-foreground/10 relative z-20">
        <div className="container mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex gap-4">
            <Link
              href="#"
              className="w-8 h-8 rounded-full border border-foreground/30 flex items-center justify-center hover:bg-foreground/5 transition-colors text-foreground/70 hover:text-foreground"
            >
              <Facebook className="w-4 h-4" />
            </Link>
            <Link
              href="#"
              className="w-8 h-8 rounded-full border border-foreground/30 flex items-center justify-center hover:bg-foreground/5 transition-colors text-foreground/70 hover:text-foreground"
            >
              <Twitter className="w-4 h-4" />
            </Link>
            <Link
              href="#"
              className="w-8 h-8 rounded-full border border-foreground/30 flex items-center justify-center hover:bg-foreground/5 transition-colors text-foreground/70 hover:text-foreground"
            >
              <Youtube className="w-4 h-4" />
            </Link>
            <Link
              href="#"
              className="w-8 h-8 rounded-full border border-foreground/30 flex items-center justify-center hover:bg-foreground/5 transition-colors text-foreground/70 hover:text-foreground"
            >
              <Instagram className="w-4 h-4" />
            </Link>
          </div>

          <div className="text-sm font-medium text-foreground/60 hover:text-foreground transition-colors">
            <Link href="https://instagram.com/cafeamantti" target="_blank">
              @cafeamantti
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
