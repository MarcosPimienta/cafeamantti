"use client";

import { useState, Suspense, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows, useGLTF } from "@react-three/drei";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { useCart } from "@/app/context/CartContext";
import { calculateCoffeePrice } from "@/app/(shop)/builder/page";

// Export the type so page.tsx can use it
export interface ProductDef {
  key: string;
  id: string;
  nameKey: string;
  notesKey: string;
  descKey: string;
  image: string;
  model: string;
  limited: boolean;
  weights: { label: string; available: boolean }[];
}

import * as THREE from "three";

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  
  useEffect(() => {
    scene.traverse((node: any) => {
      if (node.isMesh && node.material) {
        // Make the texture emit light so it's always perfectly readable
        if (node.material.map) {
          node.material.emissive = new THREE.Color(0xffffff);
          node.material.emissiveMap = node.material.map;
          // Amantti Seleccion (Premium bag) is darker, so it needs more light to be visible
          if (url.includes('Premium')) {
            node.material.emissiveIntensity = 0.9;
          } else {
            node.material.emissiveIntensity = 0.15; // Lowered to prevent light bags from blowing out
          }
        }
      }
    });
  }, [scene, url]);

  return <primitive object={scene} scale={2.8} position={[0, -1.2, 0]} rotation={[0, Math.PI, 0]} />;
}

// Preload models disabled to fix Next.js blob texture error in dev

export function ProductCarousel({ products, t }: { products: ProductDef[], t: (key: any) => string }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const product = products[currentIndex];

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev === 0 ? products.length - 1 : prev - 1));
  };
  
  const handleNext = () => {
    setCurrentIndex((prev) => (prev === products.length - 1 ? 0 : prev + 1));
  };

  const [selectedWeight, setSelectedWeight] = useState("250g");
  const [selectedGrind, setSelectedGrind] = useState("whole");
  const [isAdding, setIsAdding] = useState(false);
  const { addItem } = useCart();

  // Reset selected weight when product changes if current weight is not available
  useEffect(() => {
    const isAvailable = product.weights.find(w => w.label === selectedWeight)?.available;
    if (!isAvailable) {
      const firstAvailable = product.weights.find(w => w.available);
      if (firstAvailable) {
        setSelectedWeight(firstAvailable.label);
      }
    }
  }, [product, selectedWeight]);

  const price = calculateCoffeePrice(product.id, selectedWeight);
  const formattedPrice = "$ " + price.toLocaleString("es-CO");

  const handleAdd = () => {
    setIsAdding(true);
    addItem({
      id: product.id,
      nameKey: product.nameKey,
      price,
      weight: selectedWeight,
      grind: selectedGrind === "whole" ? "whole" : "ground",
      image: product.image, // Still passing image to cart
    });
    setTimeout(() => setIsAdding(false), 800);
  };

  return (
    <div className="product-carousel-container" data-reveal="" style={{ width: "100%" }}>
      {/* 3D Viewer Section */}
      <div 
        className="carousel-3d-wrapper" 
        style={{ 
          position: "relative", 
          height: "450px", 
          width: "100%",
          display: "flex", 
          alignItems: "center", 
          justifyContent: "center",
          marginBottom: "24px"
        }}
      >
        <button 
          onClick={handlePrev} 
          aria-label="Previous product"
          style={{ 
            position: "absolute", 
            left: "max(10px, calc(50% - 350px))", 
            zIndex: 10, 
            background: "rgba(11,11,11,0.6)", 
            border: "1px solid rgba(194,168,120,.5)", 
            borderRadius: "50%", 
            padding: 12, 
            color: "#C2A878", 
            cursor: "pointer",
            transition: "all 0.3s ease",
            backdropFilter: "blur(4px)"
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(194,168,120,0.2)"}
          onMouseLeave={(e) => e.currentTarget.style.background = "rgba(11,11,11,0.6)"}
        >
          <ChevronLeft size={28} />
        </button>

        {product.limited && (
          <div style={{ position: "absolute", top: 20, right: "max(20px, calc(50% - 350px))", zIndex: 10 }}>
            <span
              style={{
                fontSize: 10,
                letterSpacing: ".2em",
                textTransform: "uppercase",
                color: "#C2A878",
                border: "1px solid rgba(194,168,120,.4)",
                padding: "6px 10px",
                borderRadius: 2,
                fontFamily: "var(--font-archivo), 'Archivo', sans-serif",
                background: "rgba(11,11,11,0.4)",
                backdropFilter: "blur(4px)"
              }}
            >
              {t("home.tienda.edicionLimitada")}
            </span>
          </div>
        )}

        <div style={{ width: "100%", height: "100%", cursor: "grab", maxWidth: "800px" }}>
          <Canvas shadows camera={{ position: [0, 0, 5], fov: 45 }}>
            {/* Cinematic Lighting Setup */}
            <ambientLight intensity={0.4} color="#ffe8cc" />
            <spotLight position={[5, 10, 5]} angle={0.25} penumbra={1} intensity={2} castShadow color="#ffffff" />
            <spotLight position={[-10, 5, -10]} angle={0.3} penumbra={1} intensity={1.5} color="#d4b483" />
            <directionalLight position={[0, -5, 5]} intensity={0.8} color="#4a3b2c" />
            <directionalLight position={[5, 0, 5]} intensity={1.2} color="#f4f1ed" />
            
            <Suspense fallback={null}>
              {products.map((p, index) => (
                <group key={p.key} visible={index === currentIndex}>
                  <Model url={p.model} />
                </group>
              ))}
            </Suspense>
            
            <OrbitControls 
              enableZoom={true} 
              enablePan={false} 
              minDistance={3} 
              maxDistance={8} 
              minPolarAngle={Math.PI / 6} 
              maxPolarAngle={Math.PI / 1.5} 
            />
            <ContactShadows position={[0, -1.4, 0]} opacity={0.75} scale={10} blur={2.5} far={4} />

            {/* Post Processing Effects */}
            <EffectComposer>
              <Bloom luminanceThreshold={0.9} mipmapBlur intensity={0.8} />
              <Vignette eskil={false} offset={0.1} darkness={1.1} />
            </EffectComposer>
          </Canvas>
        </div>

        <button 
          onClick={handleNext} 
          aria-label="Next product"
          style={{ 
            position: "absolute", 
            right: "max(10px, calc(50% - 350px))", 
            zIndex: 10, 
            background: "rgba(11,11,11,0.6)", 
            border: "1px solid rgba(194,168,120,.5)", 
            borderRadius: "50%", 
            padding: 12, 
            color: "#C2A878", 
            cursor: "pointer",
            transition: "all 0.3s ease",
            backdropFilter: "blur(4px)"
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(194,168,120,0.2)"}
          onMouseLeave={(e) => e.currentTarget.style.background = "rgba(11,11,11,0.6)"}
        >
          <ChevronRight size={28} />
        </button>
      </div>

      {/* Product Details Section */}
      <div className="carousel-info-wrapper" style={{ maxWidth: 700, margin: "0 auto", textAlign: "center", padding: "0 20px" }}>
        
        {/* Name */}
        <h3 style={{ margin: 0, fontFamily: "var(--font-bodoni), 'Bodoni Moda', serif", fontStyle: "italic", fontWeight: 400, fontSize: 36, color: "#F4F1ED", transition: "all 0.3s" }}>
          {t(product.nameKey)}
        </h3>

        {/* Tasting notes */}
        <p style={{ margin: "12px 0 0", fontSize: 13, letterSpacing: ".16em", textTransform: "uppercase", color: "#C2A878", fontFamily: "var(--font-archivo), 'Archivo', sans-serif" }}>
          {t(product.notesKey)}
        </p>

        {/* Description */}
        <p style={{ margin: "20px auto 36px", fontSize: 15, lineHeight: 1.7, color: "rgba(244,241,237,.6)", fontFamily: "var(--font-archivo), 'Archivo', sans-serif", maxWidth: "500px" }}>
          {t(product.descKey)}
        </p>

        {/* Selectors Grid */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "32px 48px", marginBottom: 36 }}>
          {/* Weight selector */}
          <div>
            <p style={{ margin: "0 0 12px", fontSize: 11, letterSpacing: ".2em", textTransform: "uppercase", color: "rgba(244,241,237,.4)", fontFamily: "var(--font-archivo), 'Archivo', sans-serif" }}>
              {t("home.tienda.pesoLabel")}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              {product.weights.map((w) => (
                <button
                  key={w.label}
                  suppressHydrationWarning
                  disabled={!w.available}
                  onClick={() => w.available && setSelectedWeight(w.label)}
                  className={`chip ${selectedWeight === w.label ? "chip-active" : ""}`}
                >
                  {w.label}
                  {!w.available && ` · ${t("home.tienda.premium")}`}
                </button>
              ))}
            </div>
          </div>

          {/* Grind selector */}
          <div>
            <p style={{ margin: "0 0 12px", fontSize: 11, letterSpacing: ".2em", textTransform: "uppercase", color: "rgba(244,241,237,.4)", fontFamily: "var(--font-archivo), 'Archivo', sans-serif" }}>
              {t("home.tienda.moliendaLabel")}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button
                suppressHydrationWarning
                onClick={() => setSelectedGrind("whole")}
                className={`chip ${selectedGrind === "whole" ? "chip-active" : ""}`}
              >
                {t("home.tienda.granoEntero")}
              </button>
              <button
                suppressHydrationWarning
                onClick={() => setSelectedGrind("ground")}
                className={`chip ${selectedGrind === "ground" ? "chip-active" : ""}`}
              >
                {t("home.tienda.molido")}
              </button>
            </div>
          </div>
        </div>

        {/* Price & Add to Cart */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 32, borderTop: "1px solid rgba(194,168,120,.25)", paddingTop: 32 }}>
          <p style={{ margin: 0, fontFamily: "var(--font-bodoni), 'Bodoni Moda', serif", fontSize: 32, color: "#F4F1ED" }}>
            {formattedPrice}
          </p>
          <button
            suppressHydrationWarning
            onClick={handleAdd}
            disabled={isAdding}
            className="btn-primary"
            style={{ padding: "16px 36px", fontSize: 13, letterSpacing: ".2em" }}
          >
            {isAdding ? "..." : t("home.tienda.anadirBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}
