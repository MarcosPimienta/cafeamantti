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
  MessageCircle,
  Send,
  Menu,
  X,
} from "lucide-react";
import { useLanguage } from "@/app/context/LanguageContext";

export default function Home() {
  const { t, locale, setLocale } = useLanguage();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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

          {/* Mobile Menu Toggle Button */}
          <div className="flex items-center gap-4 md:hidden">
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
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 -mr-2 text-foreground/80 hover:text-foreground transition-colors"
              aria-label="Toggle mobile menu"
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6" strokeWidth={1.5} />
              ) : (
                <Menu className="w-6 h-6" strokeWidth={1.5} />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        <div
          className={`md:hidden absolute top-20 left-0 w-full bg-background border-b border-foreground/10 shadow-lg transition-all duration-300 ease-in-out overflow-hidden z-40 ${
            isMobileMenuOpen ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <nav className="flex flex-col px-6 py-6 space-y-6">
            <Link
              href="#historia"
              onClick={() => setIsMobileMenuOpen(false)}
              className="text-lg font-medium text-foreground/80 hover:text-foreground"
            >
              {t("nav.ourStory")}
            </Link>
            <Link
              href="#servicios"
              onClick={() => setIsMobileMenuOpen(false)}
              className="text-lg font-medium text-foreground/80 hover:text-foreground"
            >
              {t("nav.services")}
            </Link>
            <Link
              href="#suscripciones"
              onClick={() => setIsMobileMenuOpen(false)}
              className="text-lg font-medium text-foreground/80 hover:text-foreground"
            >
              {t("nav.subscriptions")}
            </Link>
            <Link
              href="/shop"
              onClick={() => setIsMobileMenuOpen(false)}
              className="text-lg font-medium text-foreground/80 hover:text-foreground"
            >
              {t("nav.shop")}
            </Link>
            <Link
              href="/login"
              onClick={() => setIsMobileMenuOpen(false)}
              className="text-lg font-medium text-foreground/80 hover:text-foreground"
            >
              {t("nav.myAccount")}
            </Link>

            <div className="pt-4 border-t border-foreground/10 flex items-center justify-between">
              <span className="text-sm font-medium text-foreground/60 uppercase tracking-wider">
                Language
              </span>
              <button
                suppressHydrationWarning
                onClick={() => setLocale(locale === "es" ? "en" : "es")}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full bg-foreground/5 hover:bg-foreground/10 transition-colors"
                aria-label="Switch language"
              >
                <Globe className="w-4 h-4" strokeWidth={2} />
                <span>{locale === "es" ? "English" : "Español"}</span>
              </button>
            </div>
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
              <a
                href="#contacto"
                className="inline-block px-8 py-3 bg-transparent border-2 border-[#C59F59] text-[#C59F59] hover:bg-[#C59F59] hover:text-white text-lg font-medium rounded-md transition-all"
              >
                {t("services.cta")}
              </a>
            </div>
          </div>
        </section>

        {/* Subscription Plans Section */}
        <section className="py-24 bg-background relative overflow-hidden" id="suscripciones">
          <div className="container mx-auto px-6 max-w-7xl relative z-10">
            <div className="text-center mb-20">
              <h2 suppressHydrationWarning className="text-4xl md:text-6xl font-serif text-foreground mb-6">
                {t("plans.title")}
              </h2>
              <div className="w-24 h-1 bg-[#C59F59] mx-auto mb-8"></div>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
              {/* Plan I: Devoción Esencial */}
              <div className="group relative bg-white border border-foreground/5 rounded-3xl p-8 shadow-sm hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 flex flex-col overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Coffee className="w-24 h-24 rotate-12" />
                </div>
                
                {/* Visual Representation of Plan */}
                <div className="relative w-full h-40 mb-6 flex items-center justify-center">
                  <div className="relative w-32 h-full transition-transform duration-500 group-hover:scale-110">
                    <Image
                      src="/images/Amantti_Coffee_Bag.png"
                      alt="Amantti Essential Bag"
                      fill
                      className="object-contain drop-shadow-xl"
                    />
                  </div>
                </div>

                <div className="mb-8">
                  <span className="text-[#C59F59] font-bold text-sm tracking-widest uppercase mb-2 block">Plan I</span>
                  <h3 suppressHydrationWarning className="text-3xl font-serif mb-2">{t("plans.essentialTitle")}</h3>
                  <p suppressHydrationWarning className="text-foreground/40 text-sm italic mb-6">{t("plans.essentialSubtitle")}</p>
                  <p suppressHydrationWarning className="text-lg font-bodoni italic text-foreground/80 leading-relaxed border-l-2 border-[#C59F59] pl-4">
                    {t("plans.essentialQuote")}
                  </p>
                </div>

                <div className="space-y-6 mb-10 flex-1">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#C59F59] mb-2">{t("plans.contentLabel")}</h4>
                    <p className="text-foreground/70">{t("plans.essentialContent")}</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#C59F59] mb-2">{t("plans.differenceLabel")}</h4>
                    <p className="text-foreground/70">{t("plans.essentialDifference")}</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#C59F59] mb-2">{t("plans.frequencyLabel")}</h4>
                    <p className="text-foreground/70">{t("plans.essentialFrequency")}</p>
                  </div>
                  <div className="pt-4 border-t border-foreground/5">
                    <p className="text-sm font-medium text-foreground/50">
                      <span className="text-foreground/80 italic">{t("plans.idealLabel")}:</span> {t("plans.essentialIdeal")}
                    </p>
                  </div>
                </div>

                <button 
                  suppressHydrationWarning
                  className="w-full py-4 bg-foreground text-background hover:bg-[#C59F59] hover:text-white font-medium rounded-xl transition-all duration-300 shadow-md group-hover:shadow-xl"
                >
                  {t("plans.subscribe")}
                </button>
              </div>

              {/* Plan II: Alquimia & Contraste */}
              <div className="group relative bg-[#FDFBF7] border-2 border-[#C59F59] rounded-3xl p-8 shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 flex flex-col overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <span className="bg-[#C59F59] text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-tighter">Popular</span>
                </div>

                {/* Visual Representation of Plan */}
                <div className="relative w-full h-40 mb-6 flex items-center justify-center">
                  <div className="relative w-40 h-full transition-transform duration-500 group-hover:scale-110">
                    <Image
                      src="/images/Amantti_Coffee_Bag.png"
                      alt="Amantti Premium Bag"
                      fill
                      className="object-contain drop-shadow-xl -rotate-6 -translate-x-4"
                    />
                    <Image
                      src="/images/Amantti_Coffee_Bag.png"
                      alt="Amantti Honey Bag"
                      fill
                      className="object-contain drop-shadow-2xl rotate-6 translate-x-4 mix-blend-multiply"
                    />
                  </div>
                </div>

                <div className="mb-8">
                  <span className="text-[#C59F59] font-bold text-sm tracking-widest uppercase mb-2 block">Plan II</span>
                  <h3 suppressHydrationWarning className="text-3xl font-serif mb-2">{t("plans.alchemyTitle")}</h3>
                  <p suppressHydrationWarning className="text-foreground/40 text-sm italic mb-6">{t("plans.alchemySubtitle")}</p>
                  <p suppressHydrationWarning className="text-lg font-bodoni italic text-foreground/80 leading-relaxed border-l-2 border-[#C59F59] pl-4">
                    {t("plans.alchemyQuote")}
                  </p>
                </div>

                <div className="space-y-6 mb-10 flex-1">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#C59F59] mb-2">{t("plans.contentLabel")}</h4>
                    <p className="text-foreground/70">{t("plans.alchemyContent")}</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#C59F59] mb-2">{t("plans.differenceLabel")}</h4>
                    <p className="text-foreground/70">{t("plans.alchemyDifference")}</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#C59F59] mb-2">{t("plans.frequencyLabel")}</h4>
                    <p className="text-foreground/70">{t("plans.alchemyFrequency")}</p>
                  </div>
                  <div className="pt-4 border-t border-foreground/5">
                    <p className="text-sm font-medium text-foreground/50">
                      <span className="text-foreground/80 italic">{t("plans.idealLabel")}:</span> {t("plans.alchemyIdeal")}
                    </p>
                  </div>
                </div>

                <button 
                  suppressHydrationWarning
                  className="w-full py-4 bg-[#C59F59] hover:bg-[#b08d4f] text-white font-medium rounded-xl transition-all duration-300 shadow-md group-hover:shadow-xl scale-105"
                >
                  {t("plans.subscribe")}
                </button>
              </div>

              {/* Plan III: Curaduría Privada */}
              <div className="group relative bg-[#1a1a1a] border border-white/5 rounded-3xl p-8 shadow-sm hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 flex flex-col overflow-hidden text-white">
                <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
                  <CalendarClock className="w-24 h-24 -rotate-12 text-[#C59F59]" />
                </div>

                {/* Visual Representation of Plan */}
                <div className="relative w-full h-40 mb-6 flex items-center justify-center">
                  <div className="relative w-48 h-full transition-transform duration-500 group-hover:scale-110">
                    <Image
                      src="/images/Amantti_Coffee_Bag.png"
                      alt="Amantti Bag 1"
                      fill
                      className="object-contain drop-shadow-xl -rotate-12 -translate-x-8 opacity-60"
                    />
                    <Image
                      src="/images/Amantti_Coffee_Bag.png"
                      alt="Amantti Bag 2"
                      fill
                      className="object-contain drop-shadow-xl rotate-12 translate-x-8 opacity-60"
                    />
                    <Image
                      src="/images/Amantti_Coffee_Bag.png"
                      alt="Amantti Microlot Bag"
                      fill
                      className="object-contain drop-shadow-2xl scale-110 brightness-110"
                    />
                  </div>
                </div>

                <div className="mb-8">
                  <span className="text-[#C59F59] font-bold text-sm tracking-widest uppercase mb-2 block tracking-[0.2em]">Exclusivo</span>
                  <h3 suppressHydrationWarning className="text-3xl font-serif mb-2">{t("plans.curatorTitle")}</h3>
                  <p suppressHydrationWarning className="text-white/40 text-sm italic mb-6">{t("plans.curatorSubtitle")}</p>
                  <p suppressHydrationWarning className="text-lg font-bodoni italic text-white/80 leading-relaxed border-l-2 border-[#C59F59] pl-4">
                    {t("plans.curatorQuote")}
                  </p>
                </div>

                <div className="space-y-6 mb-10 flex-1">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#C59F59] mb-2">{t("plans.contentLabel")}</h4>
                    <p className="text-white/70">{t("plans.curatorContent")}</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#C59F59] mb-2">{t("plans.differenceLabel")}</h4>
                    <p className="text-white/70">{t("plans.curatorDifference")}</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#C59F59] mb-2">{t("plans.frequencyLabel")}</h4>
                    <p className="text-white/70">{t("plans.curatorFrequency")}</p>
                  </div>
                  <div className="pt-4 border-t border-white/10">
                    <p className="text-sm font-medium text-white/50">
                      <span className="text-white/80 italic">{t("plans.idealLabel")}:</span> {t("plans.curatorIdeal")}
                    </p>
                  </div>
                </div>

                <button 
                  suppressHydrationWarning
                  className="w-full py-4 bg-white text-black hover:bg-[#C59F59] hover:text-white font-medium rounded-xl transition-all duration-300 shadow-md group-hover:shadow-xl"
                >
                  {t("plans.subscribe")}
                </button>
              </div>
            </div>
          </div>

          {/* Decorative elements */}
          <div className="absolute top-1/2 left-0 w-64 h-64 bg-[#C59F59]/5 rounded-full blur-3xl -translate-x-1/2"></div>
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-[#C59F59]/5 rounded-full blur-3xl translate-x-1/4 translate-y-1/4"></div>
        </section>

        {/* Contact Form Section - Split Layout */}
        <section className="bg-[#f7f4ef] w-full" id="contacto">
          <div className="flex flex-col lg:flex-row w-full min-h-[800px]">
            {/* Left Side - Image */}
            <div className="relative w-full lg:w-1/2 min-h-[400px] lg:min-h-full">
              <Image
                src="/images/Chemex&Cup.png"
                alt="Amantti Coffee Experience"
                fill
                className="object-cover"
                priority
              />
            </div>

            {/* Right Side - Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8 md:p-16 lg:p-24">
              <div className="w-full max-w-xl">
                <div className="mb-12">
                  <h2 className="text-4xl md:text-5xl font-serif text-foreground mb-4">
                    {t("contact.title")}
                  </h2>
                  <p className="text-foreground/60 text-lg leading-relaxed">
                    {t("contact.subtitle")}
                  </p>
                </div>

                <form
                  onSubmit={(e) => e.preventDefault()}
                  className="space-y-6"
                >
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-foreground/80 mb-2">
                        {t("contact.name")}
                      </label>
                      <input
                        type="text"
                        suppressHydrationWarning
                        className="w-full px-4 py-3 rounded-xl border border-foreground/15 bg-white focus:outline-none focus:border-[#C59F59] focus:ring-1 focus:ring-[#C59F59] transition-colors text-sm"
                        placeholder={t("contact.name")}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground/80 mb-2">
                        {t("contact.email")}
                      </label>
                      <input
                        type="email"
                        suppressHydrationWarning
                        className="w-full px-4 py-3 rounded-xl border border-foreground/15 bg-white focus:outline-none focus:border-[#C59F59] focus:ring-1 focus:ring-[#C59F59] transition-colors text-sm"
                        placeholder={t("contact.email")}
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-foreground/80 mb-2">
                        {t("contact.business")}
                      </label>
                      <input
                        type="text"
                        suppressHydrationWarning
                        className="w-full px-4 py-3 rounded-xl border border-foreground/15 bg-white focus:outline-none focus:border-[#C59F59] focus:ring-1 focus:ring-[#C59F59] transition-colors text-sm"
                        placeholder={t("contact.business")}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground/80 mb-2">
                        {t("contact.service")}
                      </label>
                      <select
                        suppressHydrationWarning
                        className="w-full px-4 py-3 rounded-xl border border-foreground/15 bg-white focus:outline-none focus:border-[#C59F59] focus:ring-1 focus:ring-[#C59F59] transition-colors text-sm text-foreground/80"
                        defaultValue=""
                      >
                        <option value="" disabled>
                          {t("contact.serviceDefault")}
                        </option>
                        <option value="barismo">{t("contact.serviceBarismo")}</option>
                        <option value="maintenance">{t("contact.serviceMaintenance")}</option>
                        <option value="support">{t("contact.serviceSupport")}</option>
                        <option value="all">{t("contact.serviceAll")}</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground/80 mb-2">
                      {t("contact.message")}
                    </label>
                    <textarea
                      rows={4}
                      suppressHydrationWarning
                      className="w-full px-4 py-3 rounded-xl border border-foreground/15 bg-white focus:outline-none focus:border-[#C59F59] focus:ring-1 focus:ring-[#C59F59] transition-colors text-sm resize-none"
                      placeholder={t("contact.messagePlaceholder")}
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-4 pt-4">
                    <button
                      type="submit"
                      suppressHydrationWarning
                      className="w-full sm:w-auto px-8 py-4 bg-[#C59F59] hover:bg-[#b08d4f] text-white font-medium rounded-xl transition-all shadow-md hover:shadow-lg text-lg flex items-center justify-center gap-2"
                    >
                      <Send className="w-5 h-5" strokeWidth={2} />
                      {t("contact.submit")}
                    </button>

                    <a
                      href="https://wa.me/573332843078"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full sm:w-auto px-6 py-4 bg-[#25D366] hover:bg-[#1fb855] text-white font-medium rounded-xl transition-all shadow-md hover:shadow-lg text-lg flex items-center justify-center gap-2"
                    >
                      <MessageCircle className="w-5 h-5" strokeWidth={2} />
                      {t("contact.whatsapp")}
                    </a>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Floating WhatsApp Button */}
      <a
        href="https://wa.me/573332843078"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-[#25D366] hover:bg-[#1fb855] rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all hover:scale-110"
        aria-label="WhatsApp"
      >
        <MessageCircle className="w-7 h-7 text-white" strokeWidth={2} />
      </a>

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
