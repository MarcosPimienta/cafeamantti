"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

const CAROUSEL_IMAGES = [
  { src: "/images/BG00.jpeg", alt: "Café Amantti Background 1" },
  { src: "/images/BG01.jpg", alt: "Café Amantti Background 2" },
  { src: "/images/BG02.jpeg", alt: "Café Amantti Background 3" },
  { src: "/images/BG03.png", alt: "Café Amantti Background 4" },
];

export function HeroCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % CAROUSEL_IMAGES.length);
    }, 5000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="absolute inset-0 z-0 overflow-hidden bg-zinc-900">
      {CAROUSEL_IMAGES.map((img, index) => (
        <div
          key={img.src}
          className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
            index === currentIndex ? "opacity-100 scale-105 transition-transform duration-[6000ms]" : "opacity-0 scale-100"
          }`}
        >
          <Image
            src={img.src}
            alt={img.alt}
            fill
            priority={index === 0}
            className="object-cover object-center"
            sizes="100vw"
          />
        </div>
      ))}

      {/* Slide Indicators */}
      <div className="absolute bottom-6 left-8 z-20 flex items-center gap-2">
        {CAROUSEL_IMAGES.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentIndex(index)}
            className={`h-2 rounded-full transition-all duration-500 cursor-pointer ${
              index === currentIndex
                ? "w-8 bg-[#C59F59]"
                : "w-2 bg-white/40 hover:bg-white/70"
            }`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
