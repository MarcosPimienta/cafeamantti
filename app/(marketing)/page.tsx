import Link from "next/link";
import Image from "next/image";
import {
  ShoppingCart,
  Calendar,
  CalendarClock,
  CalendarDays,
  Facebook,
  Twitter,
  Youtube,
  Instagram,
} from "lucide-react";

export default function Home() {
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
              Nuestra Historia
            </Link>
            <Link
              href="#suscripciones"
              className="text-sm font-medium text-foreground/80 hover:text-foreground"
            >
              Suscripciones
            </Link>
            <Link
              href="/shop"
              className="text-sm font-medium text-foreground/80 hover:text-foreground"
            >
              Tienda
            </Link>
            <Link
              href="/login"
              className="text-sm font-medium text-foreground/80 hover:text-foreground"
            >
              Mi Cuenta
            </Link>
            <button
              suppressHydrationWarning
              className="relative p-2 hover:bg-foreground/5 rounded-full transition-colors"
              aria-label="Cart"
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
                Pasión y tradición en cada taza.
              </p>
              <button
                suppressHydrationWarning
                className="px-8 py-3 bg-[#C59F59] hover:bg-[#b08d4f] text-white text-lg font-medium rounded-md transition-all shadow-lg"
              >
                Suscríbete Ahora
              </button>
            </div>
          </div>
        </section>

        {/* Subscription Builder Section */}
        <section className="py-20 bg-background relative" id="suscripciones">
          <div className="container mx-auto px-6 max-w-6xl relative z-10">
            <h2 className="text-4xl font-serif text-foreground mb-12">
              Crea Tu Experiencia de Café
            </h2>

            <div className="grid lg:grid-cols-3 gap-12 lg:gap-8 border-b border-foreground/10 pb-16">
              {/* Step 1: Coffee */}
              <div className="flex flex-col">
                <h3 className="text-xl font-medium mb-6">1. Elige Tu Café</h3>
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
                      <span className="font-bold">Variety</span>
                      <span className="text-foreground/80">
                        Caturro & Tabbi
                      </span>
                    </div>
                    <div className="grid grid-cols-[80px_1fr] gap-2">
                      <span className="font-bold">Profile</span>
                      <span className="text-foreground/80">
                        Caramel, Panela
                      </span>
                    </div>
                    <div className="grid grid-cols-[80px_1fr] gap-2">
                      <span className="font-bold">Altitude</span>
                      <span className="text-foreground/80">1800 mts</span>
                    </div>
                    <div className="grid grid-cols-[80px_1fr] gap-2">
                      <span className="font-bold">Notes</span>
                      <span className="text-foreground/80 leading-tight">
                        Sweet Caramel, Sugar Cane, Chocolate and Orange
                      </span>
                    </div>
                  </div>

                  <div className="mt-auto flex gap-4 pt-4 border-t border-foreground/10 justify-center">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="grind"
                        className="w-4 h-4 text-[#C59F59] focus:ring-[#C59F59]"
                        defaultChecked
                        suppressHydrationWarning
                      />
                      <span className="text-sm font-medium">Grain</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="grind"
                        className="w-4 h-4 text-[#C59F59] focus:ring-[#C59F59]"
                        suppressHydrationWarning
                      />
                      <span className="text-sm font-medium">Grinded</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Step 2: Frequency */}
              <div className="flex flex-col">
                <h3 className="text-xl font-medium mb-6">
                  2. Delivery Frequency
                </h3>
                <div className="flex flex-col sm:flex-row lg:flex-col gap-4">
                  {/* Option 1 */}
                  <button
                    suppressHydrationWarning
                    className="flex-1 lg:flex-none flex flex-col items-center justify-center p-6 border border-foreground/20 rounded-xl hover:border-[#C59F59] transition-all bg-white"
                  >
                    <Calendar
                      className="w-10 h-10 text-foreground/70 mb-3"
                      strokeWidth={1.5}
                    />
                    <span className="font-medium text-sm">Weekly</span>
                  </button>

                  {/* Option 2 (Selected) */}
                  <button
                    suppressHydrationWarning
                    className="flex-1 lg:flex-none flex flex-col items-center justify-center p-6 border-2 border-[#C59F59] rounded-xl bg-[#C59F59]/5 relative overflow-hidden transition-all shadow-sm"
                  >
                    <CalendarClock
                      className="w-10 h-10 text-[#C59F59] mb-3"
                      strokeWidth={1.5}
                    />
                    <span className="font-medium text-sm">Bi-Weekly</span>
                    <span className="text-[10px] text-foreground/60 mt-1">
                      (Recommended)
                    </span>
                  </button>

                  {/* Option 3 */}
                  <button
                    suppressHydrationWarning
                    className="flex-1 lg:flex-none flex flex-col items-center justify-center p-6 border border-foreground/20 rounded-xl hover:border-[#C59F59] transition-all bg-white"
                  >
                    <CalendarDays
                      className="w-10 h-10 text-foreground/70 mb-3"
                      strokeWidth={1.5}
                    />
                    <span className="font-medium text-sm">Monthly</span>
                  </button>
                </div>
              </div>

              {/* Step 3: Summary */}
              <div className="flex flex-col">
                <h3 className="text-xl font-medium mb-6">
                  3. Subscription Summary
                </h3>
                <div className="border border-foreground/20 rounded-2xl p-8 bg-[#fbf9f4] shadow-sm flex flex-col h-full min-h-[300px]">
                  <div className="mb-8">
                    <h4 className="font-bold text-lg mb-1">
                      Premium Coffee - Ground
                    </h4>
                    <p className="text-foreground/70 text-sm mb-6">
                      Bi-Weekly Delivery
                    </p>

                    <div className="flex justify-between items-center text-sm border-t border-foreground/10 pt-4 mb-2">
                      <span className="text-foreground/80">
                        Price per shipment:
                      </span>
                      <span className="font-bold text-base">$X.XX</span>
                    </div>
                  </div>

                  <button
                    suppressHydrationWarning
                    className="w-full py-4 bg-[#C59F59] hover:bg-[#b08d4f] text-white font-medium rounded-xl transition-all shadow-md mt-auto text-lg flex items-center justify-center gap-2"
                  >
                    Complete Subscription
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
