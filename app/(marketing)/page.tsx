import Link from "next/link";
import { Coffee, MapPin, Leaf, CheckCircle2 } from "lucide-react";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      {/* Navigation */}
      <header className="sticky top-0 z-50 w-full border-b border-foreground/10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Coffee className="w-6 h-6" strokeWidth={1.5} />
            <span className="font-serif text-xl font-medium tracking-tight">
              Amantti
            </span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              href="/shop"
              className="text-sm font-medium text-foreground/80 hover:text-foreground transition-colors"
            >
              Shop
            </Link>
            <Link
              href="/login"
              className="text-sm font-medium px-4 py-2 rounded-full border border-foreground/20 hover:bg-foreground/5 transition-colors"
            >
              Log In
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative px-4 py-32 md:py-48 flex items-center justify-center overflow-hidden">
          {/* Subtle background decoration */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-foreground/5 via-background to-background -z-10" />

          <div className="container mx-auto text-center max-w-4xl">
            <h1 className="text-5xl md:text-7xl font-serif tracking-tight mb-6 leading-tight fade-in slide-in-from-bottom-4 animate-in duration-700">
              The True Essence of <br />
              <span className="italic text-foreground/80">
                Colombian Coffee
              </span>
            </h1>
            <p className="text-lg md:text-xl text-foreground/70 mb-10 max-w-2xl mx-auto font-medium fade-in slide-in-from-bottom-5 animate-in duration-700 delay-150 fill-mode-forwards opacity-0">
              Sourced sustainably from the high altitudes of the Andes. Roasted
              to perfection. Delivered fresh to your door.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 fade-in slide-in-from-bottom-6 animate-in duration-700 delay-300 fill-mode-forwards opacity-0">
              <Link
                href="/shop"
                className="w-full sm:w-auto px-8 py-3.5 bg-foreground text-background rounded-full font-medium hover:bg-foreground/90 transition-all shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:ring-offset-2"
              >
                Shop Now
              </Link>
              <Link
                href="#our-story"
                className="w-full sm:w-auto px-8 py-3.5 bg-transparent border border-foreground/20 rounded-full font-medium hover:bg-foreground/5 transition-all focus:outline-none focus:ring-2 focus:ring-foreground focus:ring-offset-2"
              >
                Our Story
              </Link>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section
          className="py-24 bg-foreground/[0.02] border-y border-foreground/10"
          id="our-story"
        >
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-serif mb-4">Why Amantti?</h2>
              <p className="text-foreground/60 max-w-xl mx-auto">
                We believe that every cup tells a story. From the soil it was
                grown in to the hands that picked it.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-12">
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-background border border-foreground/10 flex items-center justify-center mb-6 shadow-sm">
                  <MapPin
                    className="w-6 h-6 text-foreground/80"
                    strokeWidth={1.5}
                  />
                </div>
                <h3 className="text-xl font-serif mb-3">Single Origin</h3>
                <p className="text-foreground/70 leading-relaxed text-sm">
                  Sourced exclusively from small-holder farms in specific
                  microclimates to ensure distinct, memorable flavor profiles.
                </p>
              </div>

              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-background border border-foreground/10 flex items-center justify-center mb-6 shadow-sm">
                  <CheckCircle2
                    className="w-6 h-6 text-foreground/80"
                    strokeWidth={1.5}
                  />
                </div>
                <h3 className="text-xl font-serif mb-3">Artisan Roasted</h3>
                <p className="text-foreground/70 leading-relaxed text-sm">
                  Carefully roasted in small batches to highlight the natural
                  sweetness and complex acidity intrinsic to Colombian beans.
                </p>
              </div>

              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-background border border-foreground/10 flex items-center justify-center mb-6 shadow-sm">
                  <Leaf
                    className="w-6 h-6 text-foreground/80"
                    strokeWidth={1.5}
                  />
                </div>
                <h3 className="text-xl font-serif mb-3">Fair Trade</h3>
                <p className="text-foreground/70 leading-relaxed text-sm">
                  We pay premium prices directly to farmers, empowering local
                  communities and fostering sustainable agricultural practices.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-background py-12 border-t border-foreground/10">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <Coffee className="w-5 h-5 text-foreground/60" strokeWidth={1.5} />
            <span className="font-serif font-medium text-foreground/80">
              Amantti
            </span>
          </div>
          <p className="text-sm text-foreground/60">
            © {new Date().getFullYear()} Amantti Coffee. All rights reserved.
          </p>
          <div className="flex gap-4 text-sm font-medium text-foreground/60">
            <Link href="#" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            <Link href="#" className="hover:text-foreground transition-colors">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
