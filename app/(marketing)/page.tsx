"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { ShoppingCart, Menu, X } from "lucide-react";
import { useLanguage } from "@/app/context/LanguageContext";
import { useCart } from "@/app/context/CartContext";
import { CartDrawer } from "@/app/components/CartDrawer";
import { HeroCarousel } from "@/app/components/HeroCarousel";
import { sendContactEmail } from "@/app/actions/contact";
import "./homepage.css";
import { ProductCarousel, ProductDef } from "@/app/components/ProductCarousel";

/* ────────────────────────────────────────────────
   Product data
   ──────────────────────────────────────────────── */

const PRODUCTS: ProductDef[] = [
  {
    key: "trad",
    id: "firma",
    nameKey: "home.tienda.tradName",
    notesKey: "home.tienda.tradNotes",
    descKey: "home.tienda.tradDesc",
    image: "/images/Premium_Bag.jpeg",
    model: "/3d/Coffee_Bag_Premium.glb",
    limited: false,
    weights: [
      { label: "250g", available: true },
      { label: "500g", available: true },
      { label: "2.5kg", available: true },
    ],
  },
  {
    key: "honey",
    id: "honey",
    nameKey: "home.tienda.honeyName",
    notesKey: "home.tienda.honeyNotes",
    descKey: "home.tienda.honeyDesc",
    image: "/images/Honey_Bag.jpeg",
    model: "/3d/Coffee_Bag_Honey.glb",
    limited: false,
    weights: [
      { label: "250g", available: true },
      { label: "500g", available: true },
      { label: "2.5kg", available: false },
    ],
  },
  {
    key: "micro",
    id: "microlot",
    nameKey: "home.tienda.microName",
    notesKey: "home.tienda.microNotes",
    descKey: "home.tienda.microDesc",
    image: "/images/Especial_Bag.jpeg",
    model: "/3d/Coffee_Bag_Especial.glb",
    limited: true,
    weights: [
      { label: "250g", available: true },
      { label: "500g", available: true },
      { label: "2.5kg", available: false },
    ],
  },
];

/* ────────────────────────────────────────────────
   Scroll reveal hook
   ──────────────────────────────────────────────── */
function useScrollReveal() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Respect reduced motion
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const inView = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return r.top < innerHeight * 0.95 && r.bottom > 0;
    };
    const reveal = (el: HTMLElement) => {
      el.classList.add("revealed");
      (el as any)._revealed = true;
    };

    // Never hide what's already on screen
    els.forEach((el) => {
      if (inView(el)) {
        el.classList.add("revealed");
        (el as any)._revealed = true;
      }
    });

    let ioAlive = false;
    let io: IntersectionObserver | null = null;

    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(
        (entries) => {
          ioAlive = true;
          entries.forEach((e) => {
            if (e.isIntersecting && !(e.target as any)._revealed) {
              reveal(e.target as HTMLElement);
              io!.unobserve(e.target);
            }
          });
        },
        { threshold: 0.12 }
      );
      els.forEach((el) => {
        if (!(el as any)._revealed) io!.observe(el);
      });
    }

    // Fallback sweep on scroll
    const sweep = () => els.forEach((el) => { if (!(el as any)._revealed && inView(el)) reveal(el); });
    const onScroll = () => sweep();
    addEventListener("scroll", onScroll, { passive: true });
    const t1 = setTimeout(sweep, 600);
    const t2 = setTimeout(() => {
      if (!ioAlive) els.forEach((el) => { if (!(el as any)._revealed) reveal(el); });
    }, 4000);

    return () => {
      io?.disconnect();
      removeEventListener("scroll", onScroll);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);
}

/* ────────────────────────────────────────────────
   Homepage
   ──────────────────────────────────────────────── */
export default function Home() {
  const { t, locale, setLocale } = useLanguage();
  const { itemCount } = useCart();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [contactStatus, setContactStatus] = useState<{ type: "idle" | "loading" | "success" | "error"; message?: string }>({ type: "idle" });

  const handleContactSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setContactStatus({ type: "loading" });
    const formData = new FormData(e.currentTarget);
    const result = await sendContactEmail(formData);
    
    if (result.error) {
      setContactStatus({ type: "error", message: result.error });
    } else {
      setContactStatus({ type: "success", message: "¡Mensaje enviado con éxito! Nos pondremos en contacto pronto." });
      (e.target as HTMLFormElement).reset();
    }
  };
  const [profile, setProfile] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useScrollReveal();

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

  const getSubscribeHref = useCallback((planId: string) => {
    const baseUrl = `/builder?plan=${planId}`;
    if (!user) return `/login?redirectTo=${encodeURIComponent(baseUrl)}`;
    return baseUrl;
  }, [user]);

  const closeMobileMenu = useCallback(() => setIsMobileMenuOpen(false), []);

  return (
    <div style={{ background: "#0B0B0B", color: "#F4F1ED", fontFamily: "var(--font-archivo), 'Archivo', sans-serif", minHeight: "100vh" }}>
      {/* ── Nav ──────────────────────────────── */}
      <nav className="amantti-nav">
        <Link
          href="/"
          style={{
            fontFamily: "var(--font-bodoni), 'Bodoni Moda', serif",
            fontStyle: "italic",
            fontSize: 26,
            color: "#F4F1ED",
            letterSpacing: ".02em",
            textDecoration: "none",
          }}
        >
          amantti
        </Link>

        {/* Desktop links */}
        <div
          className="hidden md:flex"
          style={{ alignItems: "center", gap: "clamp(14px, 2.6vw, 34px)" }}
        >
          <a href="#historia" className="amantti-nav-link">{t("nav.ourStory")}</a>
          <a href="#servicios" className="amantti-nav-link">{t("nav.services")}</a>
          <a href="#suscripciones" className="amantti-nav-link">{t("nav.subscriptions")}</a>
          <a href="#tienda" className="amantti-nav-link">{t("nav.shop")}</a>

          <Link href="#suscripciones" className="amantti-nav-pill">
            {t("home.nav.subscribe")}
          </Link>

          {/* Cart icon */}
          <button
            onClick={() => setIsCartOpen(true)}
            style={{
              position: "relative",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
            }}
            aria-label={t("nav.cart")}
          >
            <ShoppingCart size={18} color="rgba(244,241,237,.75)" strokeWidth={1.5} />
            {itemCount > 0 && <span className="cart-badge">{itemCount}</span>}
          </button>

          {/* Language Toggle */}
          <button
            suppressHydrationWarning
            onClick={() => setLocale(locale === "en" ? "es" : "en")}
            className="text-[#F4F1ED]/70 hover:text-[#C2A878] transition-colors text-[10px] font-bold uppercase tracking-widest px-2"
            aria-label="Toggle language"
          >
            {locale === "en" ? "ES" : "EN"}
          </button>
        </div>

        {/* Mobile hamburger + cart */}
        <div className="flex md:hidden" style={{ alignItems: "center", gap: 16 }}>
          <button
            onClick={() => setIsCartOpen(true)}
            style={{ position: "relative", background: "none", border: "none", cursor: "pointer", padding: 4 }}
            aria-label={t("nav.cart")}
          >
            <ShoppingCart size={18} color="rgba(244,241,237,.75)" strokeWidth={1.5} />
            {itemCount > 0 && <span className="cart-badge">{itemCount}</span>}
          </button>
          {/* Language Toggle */}
          <button
            suppressHydrationWarning
            onClick={() => setLocale(locale === "en" ? "es" : "en")}
            className="text-[#F4F1ED]/70 hover:text-[#C2A878] transition-colors text-[10px] font-bold uppercase tracking-widest px-2"
            aria-label="Toggle language"
          >
            {locale === "en" ? "ES" : "EN"}
          </button>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? (
              <X size={22} color="#F4F1ED" strokeWidth={1.5} />
            ) : (
              <Menu size={22} color="#F4F1ED" strokeWidth={1.5} />
            )}
          </button>
        </div>
      </nav>

      {/* ── Mobile menu ──────────────────────── */}
      <div className={`mobile-menu ${isMobileMenuOpen ? "open" : ""}`}>
        <a href="#historia" className="mobile-menu-link" onClick={closeMobileMenu}>{t("nav.ourStory")}</a>
        <a href="#servicios" className="mobile-menu-link" onClick={closeMobileMenu}>{t("nav.services")}</a>
        <a href="#suscripciones" className="mobile-menu-link" onClick={closeMobileMenu}>{t("nav.subscriptions")}</a>
        <a href="#tienda" className="mobile-menu-link" onClick={closeMobileMenu}>{t("nav.shop")}</a>
        <a href="#contacto" className="mobile-menu-link" onClick={closeMobileMenu}>
          {locale === "es" ? "Contacto" : "Contact"}
        </a>
        <Link
          href={user ? "/dashboard" : "/login"}
          className="mobile-menu-link"
          onClick={closeMobileMenu}
        >
          {user ? "Dashboard" : t("nav.myAccount")}
        </Link>
      </div>

      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} profile={profile} epaycoKey={process.env.NEXT_PUBLIC_EPAYCO_PUBLIC_KEY || ""} />

      {/* ── Hero ─────────────────────────────── */}
      <header id="hero" style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <HeroCarousel />

        {/* Gradient overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background: "linear-gradient(180deg, rgba(11,11,11,.72) 0%, rgba(11,11,11,.55) 45%, rgba(11,11,11,.92) 100%)",
          }}
        />

        {/* Film grain */}
        <div className="film-grain" />

        {/* Content */}
        <div style={{ position: "relative", textAlign: "center", padding: "0 24px", maxWidth: 900 }}>
          <p
            className="hero-fade hero-fade-1"
            style={{
              margin: "0 0 26px",
              fontSize: 11,
              letterSpacing: ".34em",
              textTransform: "uppercase",
              color: "#C2A878",
              fontFamily: "var(--font-archivo), 'Archivo', sans-serif",
            }}
          >
            {t("home.hero.eyebrow")}
          </p>

          <h1
            className="hero-fade hero-fade-2"
            style={{
              margin: 0,
              fontFamily: "var(--font-bodoni), 'Bodoni Moda', serif",
              fontStyle: "italic",
              fontWeight: 400,
              fontSize: "clamp(72px, 13vw, 168px)",
              lineHeight: .95,
              color: "#F4F1ED",
            }}
          >
            amantti
          </h1>

          <p
            className="hero-fade hero-fade-3"
            style={{
              margin: "30px 0 0",
              fontFamily: "var(--font-bodoni), 'Bodoni Moda', serif",
              fontSize: "clamp(20px, 2.6vw, 30px)",
              fontWeight: 400,
              color: "rgba(244,241,237,.9)",
            }}
          >
            {t("home.hero.tagline")}
          </p>

          <div
            className="hero-fade hero-fade-4"
            style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 48, flexWrap: "wrap" }}
          >
            <Link href={getSubscribeHref("custom")} className="btn-primary">
              {t("home.hero.ctaPrimary")}
            </Link>
            <a href="#contacto" className="btn-secondary">
              {t("home.hero.ctaSecondary")}
            </a>
          </div>
        </div>

        {/* Scroll cue line */}
        <div
          style={{
            position: "absolute",
            bottom: 34,
            left: "50%",
            transform: "translateX(-50%)",
            width: 1,
            height: 56,
            background: "linear-gradient(rgba(194,168,120,0), #C2A878)",
          }}
        />
      </header>

      {/* ── Historia ─────────────────────────── */}
      <section id="historia" className="section-dark">
        <div className="section-inner">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))",
              gap: 80,
              alignItems: "center",
            }}
          >
            {/* Text column */}
            <div data-reveal="">
              <p className="eyebrow-serif">{t("home.historia.eyebrow")}</p>
              <h2 className="heading-section" style={{ marginBottom: 28, color: "#F4F1ED" }}>
                {t("home.historia.title")}
              </h2>
              <p className="body-muted" style={{ marginBottom: 44, maxWidth: "52ch" }}>
                {t("home.historia.body")}
              </p>

              {/* Definition list */}
              <div>
                <div className="hairline-gold" style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 20, padding: "22px 0" }}>
                  <h3 className="def-term">{t("home.historia.tradicionTerm")}</h3>
                  <p className="def-desc">{t("home.historia.tradicionDesc")}</p>
                </div>
                <div className="hairline-gold" style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 20, padding: "22px 0" }}>
                  <h3 className="def-term">{t("home.historia.pasionTerm")}</h3>
                  <p className="def-desc">{t("home.historia.pasionDesc")}</p>
                </div>
                <div className="hairline-gold hairline-gold-bottom" style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 20, padding: "22px 0" }}>
                  <h3 className="def-term">{t("home.historia.sostenibilidadTerm")}</h3>
                  <p className="def-desc">{t("home.historia.sostenibilidadDesc")}</p>
                </div>
              </div>
            </div>

            {/* Image column */}
            <div data-reveal="" style={{ position: "relative" }}>
              <div className="offset-frame" />
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "4/5",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <Image
                  src="/images/AmanttiRootsESP.png"
                  alt={t("home.historia.eyebrow")}
                  fill
                  className="object-cover photo-treatment"
                  sizes="(max-width: 900px) 100vw, 50vw"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Servicios (Cream) ────────────────── */}
      <section id="servicios" className="section-cream">
        <div className="section-inner">
          <div data-reveal="" style={{ maxWidth: 640, marginBottom: 70 }}>
            <p className="eyebrow-serif-dark">{t("home.servicios.eyebrow")}</p>
            <h2 className="heading-section" style={{ color: "#0B0B0B" }}>
              {t("home.servicios.title")}
            </h2>
            <p className="body-muted-dark">
              {t("home.servicios.intro")}
            </p>
          </div>

          {/* Service cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 36 }}>
            {/* Barismo */}
            <div data-reveal="" style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  width: "100%",
                  aspectRatio: "4/3",
                  borderRadius: 2,
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <Image
                  src="/images/LatteArt.jpg"
                  alt="Barista"
                  fill
                  className="object-cover transition-transform duration-700 hover:scale-105"
                  sizes="(max-width: 900px) 100vw, 33vw"
                />
              </div>
              <h3
                style={{
                  margin: "26px 0 0",
                  fontFamily: "var(--font-bodoni), 'Bodoni Moda', serif",
                  fontStyle: "italic",
                  fontWeight: 400,
                  fontSize: 23,
                  color: "#0B0B0B",
                }}
              >
                {t("home.servicios.barismoTitle")}
              </h3>
              <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: 1.75, color: "rgba(11,11,11,.6)", fontFamily: "var(--font-archivo), 'Archivo', sans-serif" }}>
                {t("home.servicios.barismoDesc")}
              </p>
            </div>

            {/* Equipos */}
            <div data-reveal="" style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  width: "100%",
                  aspectRatio: "4/3",
                  borderRadius: 2,
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <Image
                  src="/images/Guy_Repairing.png"
                  alt={t("home.servicios.equiposTitle")}
                  fill
                  className="object-cover photo-treatment"
                  sizes="(max-width: 900px) 100vw, 33vw"
                />
              </div>
              <h3
                style={{
                  margin: "26px 0 0",
                  fontFamily: "var(--font-bodoni), 'Bodoni Moda', serif",
                  fontStyle: "italic",
                  fontWeight: 400,
                  fontSize: 23,
                  color: "#0B0B0B",
                }}
              >
                {t("home.servicios.equiposTitle")}
              </h3>
              <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: 1.75, color: "rgba(11,11,11,.6)", fontFamily: "var(--font-archivo), 'Archivo', sans-serif" }}>
                {t("home.servicios.equiposDesc")}
              </p>
            </div>

            {/* Soporte */}
            <div data-reveal="" style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  width: "100%",
                  aspectRatio: "4/3",
                  borderRadius: 2,
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <Image
                  src="/images/SoporteContinuo.jpg"
                  alt={t("home.servicios.soporteTitle")}
                  fill
                  className="object-cover photo-treatment"
                  sizes="(max-width: 900px) 100vw, 33vw"
                />
              </div>
              <h3
                style={{
                  margin: "26px 0 0",
                  fontFamily: "var(--font-bodoni), 'Bodoni Moda', serif",
                  fontStyle: "italic",
                  fontWeight: 400,
                  fontSize: 23,
                  color: "#0B0B0B",
                }}
              >
                {t("home.servicios.soporteTitle")}
              </h3>
              <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: 1.75, color: "rgba(11,11,11,.6)", fontFamily: "var(--font-archivo), 'Archivo', sans-serif" }}>
                {t("home.servicios.soporteDesc")}
              </p>
            </div>
          </div>

          <div data-reveal="" style={{ marginTop: 60 }}>
            <a href="#contacto" className="btn-outline-dark">
              {t("home.servicios.cta")}
            </a>
          </div>
        </div>
      </section>

      {/* ── Suscripciones ────────────────────── */}
      <section id="suscripciones" className="section-dark" style={{ position: "relative", overflow: "hidden" }}>
        {/* Background Image & Filter */}
        <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
          <Image
            src="/images/Three_Bags.jpeg"
            alt="Suscripciones Café Amantti"
            fill
            className="object-cover"
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(to bottom, rgba(11,11,11,0.6) 0%, rgba(11,11,11,0.95) 100%)",
              pointerEvents: "none",
            }}
          />
        </div>

        <div className="section-inner" style={{ position: "relative", zIndex: 10 }}>
          {/* Header */}
          <div data-reveal="" style={{ textAlign: "center", maxWidth: 680, margin: "0 auto 64px" }}>
            <p className="eyebrow-serif">{t("home.suscripciones.eyebrow")}</p>
            <h2 className="heading-section" style={{ color: "#F4F1ED" }}>
              {t("home.suscripciones.title")}
            </h2>
            <p className="body-muted">
              {t("home.suscripciones.intro")}
            </p>
          </div>

          {/* Feature cells */}
          <div className="feature-grid">
            <div className="feature-cell" data-reveal="">
              <p
                style={{
                  margin: "0 0 12px",
                  fontFamily: "var(--font-bodoni), 'Bodoni Moda', serif",
                  fontStyle: "italic",
                  fontSize: 18,
                  color: "#C2A878",
                }}
              >
                {t("home.suscripciones.libertadTitle")}
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: "rgba(244,241,237,.6)",
                  fontFamily: "var(--font-archivo), 'Archivo', sans-serif",
                }}
              >
                {t("home.suscripciones.libertadDesc")}
              </p>
            </div>
            <div className="feature-cell" data-reveal="">
              <p
                style={{
                  margin: "0 0 12px",
                  fontFamily: "var(--font-bodoni), 'Bodoni Moda', serif",
                  fontStyle: "italic",
                  fontSize: 18,
                  color: "#C2A878",
                }}
              >
                {t("home.suscripciones.envioTitle")}
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: "rgba(244,241,237,.6)",
                  fontFamily: "var(--font-archivo), 'Archivo', sans-serif",
                }}
              >
                {t("home.suscripciones.envioDesc")}
              </p>
            </div>
            <div className="feature-cell" data-reveal="">
              <p
                style={{
                  margin: "0 0 12px",
                  fontFamily: "var(--font-bodoni), 'Bodoni Moda', serif",
                  fontStyle: "italic",
                  fontSize: 18,
                  color: "#C2A878",
                }}
              >
                {t("home.suscripciones.sinAtadurasTitle")}
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: "rgba(244,241,237,.6)",
                  fontFamily: "var(--font-archivo), 'Archivo', sans-serif",
                }}
              >
                {t("home.suscripciones.sinAtadurasDesc")}
              </p>
            </div>
          </div>

          {/* CTA */}
          <div data-reveal="" style={{ textAlign: "center", marginTop: 56 }}>
            <Link href={getSubscribeHref("custom")} className="btn-primary" style={{ padding: "16px 38px" }}>
              {t("home.suscripciones.cta")}
            </Link>
          </div>
        </div>
      </section>

      {/* ── Tienda ───────────────────────────── */}
      <section id="tienda" style={{ padding: "0 clamp(20px, 5vw, 48px) 140px", background: "#0B0B0B", color: "#F4F1ED" }}>
        <div className="section-inner">
          {/* Header row */}
          <div
            data-reveal=""
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 24,
              flexWrap: "wrap",
              borderTop: "1px solid rgba(194,168,120,.25)",
              paddingTop: 56,
              marginBottom: 64,
            }}
          >
            <h2 className="heading-section" style={{ margin: 0, color: "#F4F1ED" }}>
              {t("home.tienda.title")}
            </h2>
            <p
              style={{
                margin: 0,
                fontFamily: "var(--font-bodoni), 'Bodoni Moda', serif",
                fontStyle: "italic",
                fontSize: 19,
                color: "#C2A878",
              }}
            >
              {t("home.tienda.subtitle")}
            </p>
          </div>

          {/* Product Carousel */}
          <ProductCarousel products={PRODUCTS} t={t} />

          {/* Meta labels */}
          <div
            data-reveal=""
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 56,
              flexWrap: "wrap",
              marginTop: 80,
            }}
          >
            {(["metaEnvio", "metaTostado", "metaOrigen", "metaCalidad"] as const).map((key) => (
              <p
                key={key}
                style={{
                  margin: 0,
                  fontSize: 11,
                  letterSpacing: ".24em",
                  textTransform: "uppercase",
                  color: "rgba(244,241,237,.45)",
                  fontFamily: "var(--font-archivo), 'Archivo', sans-serif",
                }}
              >
                {t(`home.tienda.${key}`)}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contacto (Cream) ─────────────────── */}
      <section id="contacto" className="section-cream">
        <div
          className="section-inner-narrow"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))",
            gap: 80,
            alignItems: "start",
          }}
        >
          {/* Info column */}
          <div data-reveal="">
            <p className="eyebrow-serif-dark">{t("home.contacto.eyebrow")}</p>
            <h2 className="heading-section" style={{ color: "#0B0B0B" }}>
              {t("home.contacto.title")}
            </h2>
            <p className="body-muted-dark" style={{ marginBottom: 36, maxWidth: "44ch" }}>
              {t("home.contacto.body")}
            </p>
            <a
              href="https://wa.me/573332843078"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 11,
                letterSpacing: ".22em",
                textTransform: "uppercase",
                color: "#0B0B0B",
                borderBottom: "1px solid #A98C5D",
                paddingBottom: 6,
                textDecoration: "none",
                fontFamily: "var(--font-archivo), 'Archivo', sans-serif",
                transition: "color .3s ease",
              }}
            >
              {t("home.contacto.whatsappLink")}
            </a>
            <p style={{ margin: "40px 0 0", fontSize: 13, color: "rgba(11,11,11,.45)" }}>
              <a
                href="https://www.instagram.com/cafeamantti"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "rgba(11,11,11,.6)", textDecoration: "none" }}
              >
                @cafeamantti
              </a>
            </p>
          </div>

          {/* Form column */}
          {/* Form column */}
          <form data-reveal="" style={{ display: "grid", gap: 14 }} onSubmit={handleContactSubmit}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <input
                suppressHydrationWarning
                type="text"
                name="nombre"
                required
                placeholder={t("home.contacto.nombrePlaceholder")}
                className="contact-input"
              />
              <input
                suppressHydrationWarning
                type="email"
                name="email"
                required
                placeholder={t("home.contacto.correoPlaceholder")}
                className="contact-input"
              />
            </div>
            <input
              suppressHydrationWarning
              type="text"
              name="negocio"
              placeholder={t("home.contacto.negocioPlaceholder")}
              className="contact-input"
            />
            <select suppressHydrationWarning name="servicio" className="contact-select" defaultValue="">
              <option value="" disabled>{t("home.contacto.servicioDefault")}</option>
              <option value="barismo">{t("home.contacto.servicioBarismo")}</option>
              <option value="equipos">{t("home.contacto.servicioEquipos")}</option>
              <option value="soporte">{t("home.contacto.servicioSoporte")}</option>
              <option value="todos">{t("home.contacto.servicioTodos")}</option>
            </select>
            <textarea
              suppressHydrationWarning
              name="mensaje"
              required
              placeholder={t("home.contacto.mensajePlaceholder")}
              rows={5}
              className="contact-input"
              style={{ resize: "vertical" }}
            />
            
            {contactStatus.message && (
              <div style={{ 
                padding: "10px", 
                borderRadius: "4px", 
                backgroundColor: contactStatus.type === "error" ? "rgba(220, 38, 38, 0.1)" : "rgba(34, 197, 94, 0.1)",
                color: contactStatus.type === "error" ? "#ef4444" : "#22c55e",
                fontSize: "14px",
                border: contactStatus.type === "error" ? "1px solid rgba(220, 38, 38, 0.2)" : "1px solid rgba(34, 197, 94, 0.2)"
              }}>
                {contactStatus.message}
              </div>
            )}

            <button 
              suppressHydrationWarning 
              type="submit" 
              className="contact-submit"
              disabled={contactStatus.type === "loading"}
              style={{ opacity: contactStatus.type === "loading" ? 0.7 : 1 }}
            >
              {contactStatus.type === "loading" ? "Enviando..." : t("home.contacto.submitBtn")}
            </button>
          </form>
        </div>
      </section>

      {/* ── Footer ───────────────────────────── */}
      <footer
        style={{
          padding: "72px clamp(20px, 5vw, 48px) 48px",
          borderTop: "1px solid rgba(194,168,120,.2)",
          background: "#0B0B0B",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 18, textAlign: "center" }}>
          <p
            style={{
              margin: 0,
              fontFamily: "var(--font-bodoni), 'Bodoni Moda', serif",
              fontStyle: "italic",
              fontSize: 30,
              color: "#F4F1ED",
            }}
          >
            amantti
          </p>
          <p
            style={{
              margin: 0,
              fontFamily: "var(--font-bodoni), 'Bodoni Moda', serif",
              fontSize: 15,
              color: "#C2A878",
            }}
          >
            {t("home.footer.tagline")}
          </p>
          <div style={{ display: "flex", gap: 28, marginTop: 12 }}>
            <a
              href="https://www.instagram.com/cafeamantti"
              target="_blank"
              rel="noopener noreferrer"
              className="amantti-nav-link"
              style={{ color: "rgba(244,241,237,.5)" }}
            >
              instagram
            </a>
            <a
              href="https://wa.me/573332843078"
              target="_blank"
              rel="noopener noreferrer"
              className="amantti-nav-link"
              style={{ color: "rgba(244,241,237,.5)" }}
            >
              whatsapp
            </a>
          </div>
          <p style={{ margin: "20px 0 0", fontSize: 11, color: "rgba(244,241,237,.3)", fontFamily: "var(--font-archivo), 'Archivo', sans-serif" }}>
            {t("home.footer.legal")}
          </p>
        </div>
      </footer>
    </div>
  );
}
