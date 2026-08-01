"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
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
  Plus,
  Check,
  Truck,
  Leaf,
  SlidersHorizontal,
} from "lucide-react";
import { useLanguage } from "@/app/context/LanguageContext";
import { useCart } from "@/app/context/CartContext";
import { CartDrawer } from "@/app/components/CartDrawer";
import { calculateCoffeePrice } from "@/app/(shop)/builder/page";

interface ProductCardProps {
  id: string;
  titleKey: string;
  descKey: string;
  profileKey: string;
  basePrice: number;
  imageSrc: string;
  t: (key: any) => string;
}

function ProductCard({ id, titleKey, descKey, profileKey, basePrice, imageSrc, t }: ProductCardProps) {
  const [weight, setWeight] = useState("250g");
  const [isGround, setIsGround] = useState(false);
  const [grindLevel, setGrindLevel] = useState("drip");
  const [isAdding, setIsAdding] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const { addItem } = useCart();

  const handleAddToCart = () => {
    setIsAdding(true);
    
    // Add to cart context
    addItem({
      id,
      nameKey: titleKey,
      price: calculatePrice(),
      weight,
      grind: isGround ? "ground" : "whole",
      grindLevel: isGround ? grindLevel : undefined,
      image: imageSrc,
    });

    setTimeout(() => {
      setIsAdding(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    }, 800);
  };

  const calculatePrice = () => {
    return calculateCoffeePrice(id, weight);
  };

  const getPriceFormated = () => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(calculatePrice());
  };

  return (
    <div className="group relative bg-white border border-foreground/5 rounded-3xl overflow-hidden shadow-sm hover:shadow-2xl transition-all duration-500 flex flex-col">
      {/* Product Image */}
      <div className="relative h-64 bg-[#f9f7f2] flex items-center justify-center p-8 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-black/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
        <div className="relative w-48 h-full transition-transform duration-700 group-hover:scale-110 group-hover:rotate-2">
          <Image
            src={imageSrc}
            alt={t(titleKey)}
            fill
            className="object-contain drop-shadow-2xl"
          />
        </div>
        {id === "microlot" && (
          <div className="absolute top-4 left-4">
            <span className="bg-[#C59F59] text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-lg">Limited Edition</span>
          </div>
        )}
      </div>
      <div className="p-8 flex flex-col flex-1">
        <div className="mb-6">
          <h3 suppressHydrationWarning className="text-2xl font-serif mb-2 group-hover:text-[#C59F59] transition-colors">{t(titleKey)}</h3>
          <p suppressHydrationWarning className="text-foreground/60 text-sm leading-relaxed mb-4 line-clamp-2">{t(descKey)}</p>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#C59F59]/80">
            <Leaf className="w-3 h-3" />
            <span suppressHydrationWarning>{t(profileKey)}</span>
          </div>
        </div>

        <div className="space-y-6 mt-auto">
          {/* Weight Selection */}
          <div className="space-y-3">
            <label suppressHydrationWarning className="text-[10px] font-bold uppercase tracking-tighter text-foreground/40">{t("products.weightLabel")}</label>
            <div className="grid grid-cols-3 gap-2">
              {["250g", "500g", "2.5kg"].map((w) => {
                const is2k5Restricted = w === "2.5kg" && (id === "honey" || id === "microlot");
                return (
                  <button
                    key={w}
                    suppressHydrationWarning
                    disabled={is2k5Restricted}
                    onClick={() => {
                      if (!is2k5Restricted) setWeight(w);
                    }}
                    className={`py-2 text-xs font-medium rounded-lg border transition-all ${
                      weight === w 
                        ? "bg-[#C59F59] border-[#C59F59] text-white shadow-md shadow-[#C59F59]/20" 
                        : is2k5Restricted
                        ? "opacity-40 cursor-not-allowed border-foreground/5 bg-foreground/5 text-foreground/40"
                        : "bg-transparent border-foreground/10 text-foreground/60 hover:border-[#C59F59]/40 hover:text-[#C59F59]"
                    }`}
                    title={is2k5Restricted ? "Presentación 2.5kg disponible exclusivamente para Café Premium" : undefined}
                  >
                    {w}
                    {is2k5Restricted && <span className="block text-[7px] text-amber-700 font-semibold leading-none mt-0.5">Solo Premium</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Grind Toggle */}
          <div className="space-y-3">
            <label suppressHydrationWarning className="text-[10px] font-bold uppercase tracking-tighter text-foreground/40">{t("products.grindLabel")}</label>
            <div className="flex p-1 bg-foreground/5 rounded-xl">
              <button
                suppressHydrationWarning
                onClick={() => setIsGround(false)}
                className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
                  !isGround ? "bg-white text-foreground shadow-sm" : "text-foreground/40 hover:text-foreground/60"
                }`}
              >
                {t("products.wholeBean")}
              </button>
              <button
                suppressHydrationWarning
                onClick={() => setIsGround(true)}
                className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
                  isGround ? "bg-white text-foreground shadow-sm" : "text-foreground/40 hover:text-foreground/60"
                }`}
              >
                {t("products.ground")}
              </button>
            </div>
          </div>

          {/* Grind Level (Animated) */}
          <div className={`space-y-3 transition-all duration-300 ${isGround ? "opacity-100 max-h-24" : "opacity-0 max-h-0 overflow-hidden"}`}>
            <label suppressHydrationWarning className="text-[10px] font-bold uppercase tracking-tighter text-foreground/40">{t("products.grindLevelLabel")}</label>
            <select
              value={grindLevel}
              suppressHydrationWarning
              onChange={(e) => setGrindLevel(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-foreground/10 bg-transparent focus:outline-none focus:border-[#C59F59]"
            >
              <option suppressHydrationWarning value="espresso">{t("products.grind.espresso")}</option>
              <option suppressHydrationWarning value="drip">{t("products.grind.drip")}</option>
              <option suppressHydrationWarning value="french">{t("products.grind.frenchPress")}</option>
            </select>
          </div>

          {/* Price and Add Button */}
          <div className="pt-6 border-t border-foreground/5 flex items-center justify-between">
            <div className="flex flex-col">
              <span suppressHydrationWarning className="text-2xl font-serif text-[#C59F59]">{getPriceFormated()}</span>
            </div>
            <button
              onClick={handleAddToCart}
              suppressHydrationWarning
              disabled={isAdding}
              className={`relative px-6 py-3 rounded-xl font-medium text-sm transition-all duration-300 flex items-center gap-2 overflow-hidden ${
                showSuccess 
                  ? "bg-green-500 text-white" 
                  : "bg-foreground text-background hover:bg-[#C59F59] hover:text-white"
              }`}
            >
              {isAdding ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : showSuccess ? (
                <>
                  <Check className="w-4 h-4" />
                  <span suppressHydrationWarning>{t("products.addedToCart")}</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span suppressHydrationWarning>{t("products.addToCart")}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { t, locale, setLocale } = useLanguage();
  const { itemCount } = useCart();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
        setProfile(data);
      }
    };
    fetchProfile();
  }, [supabase]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const getSubscribeHref = (planId: string) => {
    const baseUrl = `/builder?plan=${planId}`;
    if (!user) {
      return `/login?redirectTo=${encodeURIComponent(baseUrl)}`;
    }
    return baseUrl;
  };

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground overflow-x-hidden">
      {/* Navigation */}
      <header className="fixed top-0 left-0 z-50 w-full border-b border-foreground/5 bg-background/95 backdrop-blur">
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
              href="#tienda"
              className="text-sm font-medium text-foreground/80 hover:text-foreground"
            >
              {t("nav.shop")}
            </Link>
            <Link
              href={user ? "/dashboard" : "/login"}
              className="text-sm font-medium text-foreground/80 hover:text-foreground flex items-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-foreground/20 border-t-foreground/60 rounded-full animate-spin" />
              ) : (
                user ? "Dashboard" : t("nav.myAccount")
              )}
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
              onClick={() => setIsCartOpen(true)}
              className="relative p-2 hover:bg-foreground/5 rounded-full transition-colors"
              aria-label={t("nav.cart")}
            >
              <ShoppingCart
                className="w-5 h-5 text-foreground/80"
                strokeWidth={2}
              />
              {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#C59F59] text-white text-[10px] font-bold flex items-center justify-center rounded-full leading-none">
                  {itemCount}
                </span>
              )}
            </button>
          </nav>

          {/* Mobile Menu Toggle Button */}
          <div className="flex items-center gap-4 md:hidden">
            <button
              suppressHydrationWarning
              onClick={() => setIsCartOpen(true)}
              className="relative p-2 hover:bg-foreground/5 rounded-full transition-colors"
              aria-label={t("nav.cart")}
            >
              <ShoppingCart
                className="w-5 h-5 text-foreground/80"
                strokeWidth={2}
              />
              {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#C59F59] text-white text-[10px] font-bold flex items-center justify-center rounded-full leading-none">
                  {itemCount}
                </span>
              )}
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
              href="#tienda"
              onClick={() => setIsMobileMenuOpen(false)}
              className="text-lg font-medium text-foreground/80 hover:text-foreground"
            >
              {t("nav.shop")}
            </Link>
            <Link
              href={user ? "/dashboard" : "/login"}
              onClick={() => setIsMobileMenuOpen(false)}
              className="text-lg font-medium text-foreground/80 hover:text-foreground flex items-center gap-2"
            >
              {user ? "Dashboard" : t("nav.myAccount")}
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

      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} profile={profile} epaycoKey={process.env.NEXT_PUBLIC_EPAYCO_PUBLIC_KEY || ""} />

      <main className="flex-1 pt-20">
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



        {/* Our Story Section */}
        <section className="py-24 bg-background overflow-hidden" id="historia">
          <div className="container mx-auto px-6 max-w-7xl">
            <div className="flex flex-col lg:flex-row items-center gap-16">
              {/* Text Content */}
              <div className="w-full lg:w-1/2">
                <div className="max-w-xl">
                  <span className="text-[#C59F59] font-bold text-sm tracking-widest uppercase mb-4 block">
                    {locale === "es" ? "Nuestra Historia" : "Our Story"}
                  </span>
                  <h2 suppressHydrationWarning className="text-4xl md:text-5xl font-serif text-foreground mb-8 leading-tight">
                    {t("story.title")}
                  </h2>
                  <div className="space-y-6">
                    <p suppressHydrationWarning className="text-foreground/70 text-lg leading-relaxed">
                      {t("story.content")}
                    </p>
                  </div>

                  {/* Values Grid */}
                  <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-8">
                    <div className="space-y-3">
                      <div className="w-10 h-10 rounded-full bg-[#C59F59]/10 flex items-center justify-center">
                        <Globe className="w-5 h-5 text-[#C59F59]" strokeWidth={1.5} />
                      </div>
                      <h4 suppressHydrationWarning className="text-sm font-bold uppercase tracking-wider text-foreground">
                        {t("story.traditionTitle")}
                      </h4>
                      <p suppressHydrationWarning className="text-foreground/60 text-xs leading-relaxed">
                        {t("story.traditionDesc")}
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div className="w-10 h-10 rounded-full bg-[#C59F59]/10 flex items-center justify-center">
                        <Coffee className="w-5 h-5 text-[#C59F59]" strokeWidth={1.5} />
                      </div>
                      <h4 suppressHydrationWarning className="text-sm font-bold uppercase tracking-wider text-foreground">
                        {t("story.passionTitle")}
                      </h4>
                      <p suppressHydrationWarning className="text-foreground/60 text-xs leading-relaxed">
                        {t("story.passionDesc")}
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div className="w-10 h-10 rounded-full bg-[#C59F59]/10 flex items-center justify-center">
                        <Leaf className="w-5 h-5 text-[#C59F59]" strokeWidth={1.5} />
                      </div>
                      <h4 suppressHydrationWarning className="text-sm font-bold uppercase tracking-wider text-foreground">
                        {t("story.sustainabilityTitle")}
                      </h4>
                      <p suppressHydrationWarning className="text-foreground/60 text-xs leading-relaxed">
                        {t("story.sustainabilityDesc")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Image Content */}
              <div className="w-full lg:w-1/2">
                <div className="relative aspect-[4/5] rounded-3xl overflow-hidden shadow-2xl">
                  <Image
                    src={locale === "es" ? "/images/AmanttiRootsESP.png" : "/images/AmanttiRoots.png"}
                    alt={t("nav.ourStory")}
                    fill
                    className="object-cover transition-transform duration-700 hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                </div>
              </div>
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
          <div className="container mx-auto px-6 max-w-5xl relative z-10">
            <div className="text-center mb-12">
              <span className="text-[#C59F59] font-bold text-xs tracking-[0.25em] uppercase mb-3 block">El Ritual Del Café Recién Tostado</span>
              <h2 suppressHydrationWarning className="text-4xl md:text-6xl font-serif text-foreground mb-6">
                Crea Tu Suscripción
              </h2>
              <div className="w-24 h-1 bg-[#C59F59] mx-auto mb-6"></div>
              <p suppressHydrationWarning className="text-foreground/60 text-lg max-w-2xl mx-auto font-light leading-relaxed">
                Arma tu combinación libre de café. Selecciona las variedades que deseas recibir, la presentación, molienda y frecuencia. Envíos en el Área Metropolitana con <strong className="text-[#C59F59] font-semibold">tarifa según radio desde $10.000 COP</strong>.
              </p>
            </div>

            {/* Feature Card */}
            <div className="bg-white border border-[#C59F59]/30 rounded-[2.5rem] p-8 md:p-14 shadow-2xl relative overflow-hidden flex flex-col lg:flex-row items-center justify-between gap-12">
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <SlidersHorizontal className="w-64 h-64 rotate-12 text-[#C59F59]" />
              </div>

              {/* Visual Showcase */}
              <div className="relative w-full lg:w-1/2 h-64 sm:h-80 flex items-center justify-center">
                <div className="relative w-72 h-full">
                  <Image
                    src="/images/Front_Paper_Traditional_Coffee_Bag.png"
                    alt="Amantti Traditional"
                    fill
                    className="object-contain drop-shadow-xl -rotate-[15deg] -translate-x-14 translate-y-2 opacity-90"
                  />
                  <Image
                    src="/images/Front_White_Honey_Coffee_Bag.png"
                    alt="Amantti Honey"
                    fill
                    className="object-contain drop-shadow-xl rotate-[15deg] translate-x-14 translate-y-2 opacity-90"
                  />
                  <Image
                    src="/images/Amantti_Coffee_Bag.png"
                    alt="Amantti Microlot"
                    fill
                    className="object-contain drop-shadow-2xl scale-110 z-10"
                  />
                </div>
              </div>

              {/* Content & Benefits */}
              <div className="w-full lg:w-1/2 space-y-6 text-left relative z-10">
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-xl bg-[#C59F59]/10 text-[#C59F59] flex items-center justify-center shrink-0 mt-0.5">
                      <Coffee className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-serif font-semibold text-foreground text-lg">Libertad Total de Selección</h4>
                      <p className="text-xs text-foreground/60 leading-relaxed">Combina bolsas de Selección Premium, Honey Process o Microlote del Mes en las cantidades que desees.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-xl bg-[#C59F59]/10 text-[#C59F59] flex items-center justify-center shrink-0 mt-0.5">
                      <Truck className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-serif font-semibold text-foreground text-lg">Envío por Radio Metropolitano (Desde $10.000 COP)</h4>
                      <p className="text-xs text-foreground/60 leading-relaxed">Calculamos la tarifa según tu municipio en el Área Metropolitana (Radio 0–10km $10k, 10–20km $14k, 20–35km $18k).</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-xl bg-[#C59F59]/10 text-[#C59F59] flex items-center justify-center shrink-0 mt-0.5">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-serif font-semibold text-foreground text-lg">Flexibilidad y Control</h4>
                      <p className="text-xs text-foreground/60 leading-relaxed">Ajusta tu frecuencia (semanal, quincenal o mensual), pausa o cancela en cualquier momento desde tu panel.</p>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-foreground/5">
                  <Link 
                    href={getSubscribeHref('custom')}
                    suppressHydrationWarning
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 bg-foreground text-background hover:bg-[#C59F59] hover:text-white text-sm font-bold uppercase tracking-widest rounded-2xl transition-all duration-300 shadow-xl hover:shadow-2xl hover:scale-105 text-center"
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                    Personaliza tu Suscripción
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Decorative elements */}
          <div className="absolute top-1/2 left-0 w-64 h-64 bg-[#C59F59]/5 rounded-full blur-3xl -translate-x-1/2"></div>
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-[#C59F59]/5 rounded-full blur-3xl translate-x-1/4 translate-y-1/4"></div>
        </section>

        {/* Individual Products Section */}
        <section className="py-24 bg-[#fdfbf7] relative" id="tienda">
          <div className="container mx-auto px-6 max-w-7xl relative z-10">
            <div className="text-center mb-16">
              <h2 suppressHydrationWarning className="text-4xl md:text-5xl font-serif text-foreground mb-6">
                {t("products.title")}
              </h2>
              <p suppressHydrationWarning className="text-foreground/60 text-lg max-w-2xl mx-auto">
                {t("products.subtitle")}
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              <ProductCard
                id="firma"
                titleKey="products.firmaTitle"
                descKey="products.firmaDesc"
                profileKey="products.firmaProfile"
                basePrice={35000}
                imageSrc="/images/Front_Paper_Traditional_Coffee_Bag.png"
                t={t}
              />
              <ProductCard
                id="honey"
                titleKey="products.honeyTitle"
                descKey="products.honeyDesc"
                profileKey="products.honeyProfile"
                basePrice={48000}
                imageSrc="/images/Front_White_Honey_Coffee_Bag.png"
                t={t}
              />
              <ProductCard
                id="microlot"
                titleKey="products.microlotTitle"
                descKey="products.microlotDesc"
                profileKey="products.microlotProfile"
                basePrice={65000}
                imageSrc="/images/Amantti_Coffee_Bag.png"
                t={t}
              />
            </div>

            {/* Quick Benefits */}
            <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8 py-10 border-t border-foreground/5">
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
                  <Truck className="w-6 h-6 text-[#C59F59]" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-foreground/40">Envío Nacional</span>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
                  <Coffee className="w-6 h-6 text-[#C59F59]" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-foreground/40">Recién Tostado</span>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
                  <Check className="w-6 h-6 text-[#C59F59]" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-foreground/40">Calidad Premium</span>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
                  <Leaf className="w-6 h-6 text-[#C59F59]" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-foreground/40">Origen Único</span>
              </div>
            </div>
          </div>
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
              href="https://www.instagram.com/cafeamantti?igsh=aHdoaGZzd3NlMnF1"
              target="_blank"
              rel="noopener noreferrer"
              className="w-8 h-8 rounded-full border border-foreground/30 flex items-center justify-center hover:bg-foreground/5 transition-colors text-foreground/70 hover:text-foreground"
            >
              <Instagram className="w-4 h-4" />
            </Link>
          </div>

          <div className="text-sm font-medium text-foreground/60 hover:text-foreground transition-colors">
            <Link href="https://www.instagram.com/cafeamantti?igsh=aHdoaGZzd3NlMnF1" target="_blank" rel="noopener noreferrer">
              @cafeamantti
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
