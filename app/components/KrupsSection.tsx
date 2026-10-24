"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Check, Cog, Gauge, Ruler, ShieldCheck, ShoppingCart, Sparkles, Truck } from "lucide-react";
import { useLanguage } from "@/app/context/LanguageContext";
import { useCart } from "@/app/context/CartContext";
import { getComboUnitsLeft } from "@/app/actions/combo";
import type { TranslationKey } from "@/app/dictionaries/en";
import { COMBO_WEIGHT, STORE_COMBOS } from "@/utils/pricing";

const COMBO_ID = "krups-coffee-crush";
const COMBO = STORE_COMBOS[COMBO_ID];
const IMAGE = "/images/krups-coffee-crush.jpg";
const GOLD = "#C2A878";
const serif = "var(--font-bodoni), 'Bodoni Moda', serif";

const cop = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

const FEATURES: { Icon: typeof Cog; title: TranslationKey; desc: TranslationKey }[] = [
  { Icon: Cog, title: "krups.f1Title", desc: "krups.f1Desc" },
  { Icon: Gauge, title: "krups.f2Title", desc: "krups.f2Desc" },
  { Icon: Sparkles, title: "krups.f3Title", desc: "krups.f3Desc" },
  { Icon: Ruler, title: "krups.f4Title", desc: "krups.f4Desc" },
];

// [label, value]: a plain string value is the same in every language.
const SPECS: [TranslationKey, TranslationKey | string][] = [
  ["krups.specBrand", "KRUPS"],
  ["krups.specModel", "Coffee Crush Experience"],
  ["krups.specRef", "8010001512"],
  ["krups.specType", "krups.specTypeValue"],
  ["krups.specPressure", "15 bar"],
  ["krups.specPower", "1.490 W"],
  ["krups.specWater", "1,8 L"],
  ["krups.specBeans", "150 g"],
  ["krups.specGrind", "5"],
  ["krups.specCoffee", "krups.specCoffeeValue"],
  ["krups.specDrinks", "krups.specDrinksValue"],
  ["krups.specOther", "krups.specOtherValue"],
  ["krups.specSize", "krups.specSizeValue"],
  ["krups.specCountry", "krups.specCountryValue"],
  ["krups.specWarranty", "krups.specWarrantyValue"],
];

/**
 * Home section of the KRUPS Coffee Crush combo: what it is, its specs, and
 * "add to cart" (which opens the home's cart through `onAdded`).
 */
export function KrupsSection({ onAdded }: { onAdded: () => void }) {
  const { t } = useLanguage();
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);
  const [unitsLeft, setUnitsLeft] = useState<number | null>(null);

  useEffect(() => {
    getComboUnitsLeft(COMBO_ID).then(setUnitsLeft).catch(() => {});
  }, []);

  const soldOut = unitsLeft === 0;
  const spec = (v: TranslationKey | string) => (v.startsWith("krups.") ? t(v as TranslationKey) : v);

  const addToCart = () => {
    addItem({ id: COMBO_ID, nameKey: "krups.comboName", price: COMBO.price, weight: COMBO_WEIGHT, grind: "whole", image: IMAGE });
    setAdded(true);
    onAdded();
    setTimeout(() => setAdded(false), 2000);
  };

  const buyBox = (compact = false) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: compact ? "center" : "flex-start" }}>
      <p style={{ margin: 0, fontFamily: serif, fontSize: "clamp(34px, 5vw, 46px)", color: "#F4F1ED" }}>{cop(COMBO.price)}</p>
      <p style={{ margin: 0, fontSize: 12, letterSpacing: ".18em", textTransform: "uppercase", color: soldOut ? "#f87171" : GOLD }}>
        {soldOut ? t("krups.soldOut") : unitsLeft !== null ? t("krups.unitsLeft").replace("{n}", String(unitsLeft)) : t("krups.limited")}
      </p>
      <button
        type="button"
        onClick={addToCart}
        disabled={soldOut}
        className="inline-flex items-center justify-center gap-3 rounded-sm px-10 py-4 text-[11px] font-bold uppercase tracking-[0.2em] transition-colors disabled:opacity-40"
        style={{ background: GOLD, color: "#0B0B0B" }}
      >
        {added ? <Check size={16} /> : <ShoppingCart size={16} />}
        {soldOut ? t("krups.soldOut") : added ? t("krups.added") : t("krups.addToCart")}
      </button>
    </div>
  );

  return (
    <section id="krups" style={{ padding: "0 clamp(20px, 5vw, 48px) 140px", background: "#0B0B0B", color: "#F4F1ED" }}>
        <div className="section-inner" style={{ display: "flex", flexDirection: "column", gap: 110, borderTop: "1px solid rgba(194,168,120,.25)", paddingTop: 56 }}>
          {/* Hero: photo + what it is + buy */}
          <section className="grid gap-12 md:grid-cols-2 md:items-center">
            <div className="relative w-full overflow-hidden rounded-sm" style={{ aspectRatio: "3 / 4", border: "1px solid rgba(194,168,120,.2)" }}>
              <Image src={IMAGE} alt="KRUPS Coffee Crush Experience con Café Amantti Premium" fill sizes="(min-width: 768px) 50vw, 100vw" style={{ objectFit: "cover" }} />
            </div>
            <div className="flex flex-col gap-6 min-w-0">
              <p style={{ margin: 0, fontSize: 11, letterSpacing: ".3em", textTransform: "uppercase", color: GOLD }}>{t("krups.eyebrow")}</p>
              <h2 style={{ margin: 0, fontFamily: serif, fontSize: "clamp(34px, 5vw, 56px)", lineHeight: 1.08 }}>{t("krups.title")}</h2>
              <p style={{ margin: 0, color: "rgba(244,241,237,.7)", lineHeight: 1.7 }}>{t("krups.intro")}</p>
              <p style={{ margin: 0, color: "rgba(244,241,237,.85)", lineHeight: 1.7 }}>{t("krups.introCombo")}</p>
              <ul className="flex flex-col gap-2 text-sm" style={{ color: "rgba(244,241,237,.8)", listStyle: "none", padding: 0, margin: 0 }}>
                <li className="flex items-center gap-3"><Truck size={16} color={GOLD} /> {t("krups.freeShipping")}</li>
                <li className="flex items-center gap-3"><ShieldCheck size={16} color={GOLD} /> {t("krups.warranty")}</li>
              </ul>
              {buyBox()}
              <p style={{ margin: 0, fontSize: 12, color: "rgba(244,241,237,.4)" }}>{t("krups.shippingNote")}</p>
            </div>
          </section>

          {/* Features */}
          <section>
            <h2 className="heading-section" style={{ marginTop: 0, marginBottom: 40 }}>{t("krups.featuresTitle")}</h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map(({ Icon, title, desc }) => (
                <div key={title} className="flex flex-col gap-3 rounded-sm p-6" style={{ border: "1px solid rgba(194,168,120,.2)" }}>
                  <Icon size={22} color={GOLD} strokeWidth={1.5} />
                  <h3 style={{ margin: 0, fontFamily: serif, fontSize: 20 }}>{t(title)}</h3>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "rgba(244,241,237,.65)" }}>{t(desc)}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Specs + what's included */}
          <section className="grid gap-12 lg:grid-cols-[3fr_2fr]">
            <div className="min-w-0">
              <h2 className="heading-section" style={{ marginTop: 0, marginBottom: 32 }}>{t("krups.specsTitle")}</h2>
              <dl style={{ margin: 0 }}>
                {SPECS.map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4 py-3 text-sm" style={{ borderBottom: "1px solid rgba(244,241,237,.08)" }}>
                    <dt style={{ color: "rgba(244,241,237,.5)" }}>{t(label)}</dt>
                    <dd style={{ margin: 0 }}>{spec(value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="min-w-0">
              <h2 className="heading-section" style={{ marginTop: 0, marginBottom: 32 }}>{t("krups.includesTitle")}</h2>
              <ul className="flex flex-col gap-4" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {(["krups.inc1", "krups.inc2", "krups.inc3", "krups.inc4"] as TranslationKey[]).map((k) => (
                  <li key={k} className="flex gap-3 text-sm leading-relaxed" style={{ color: "rgba(244,241,237,.8)" }}>
                    <Check size={16} color={GOLD} className="shrink-0 mt-0.5" /> {t(k)}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Closing */}
          <section className="flex flex-col items-center gap-8 text-center" style={{ borderTop: "1px solid rgba(194,168,120,.25)", paddingTop: 72 }}>
            <h2 style={{ margin: 0, fontFamily: serif, fontStyle: "italic", fontSize: "clamp(26px, 4vw, 38px)", maxWidth: 720 }}>{t("krups.closingTitle")}</h2>
            <p style={{ margin: 0, maxWidth: 680, lineHeight: 1.8, color: "rgba(244,241,237,.7)" }}>{t("krups.closingText")}</p>
            {buyBox(true)}
          </section>
        </div>
    </section>
  );
}
