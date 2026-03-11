export const en = {
  // Nav
  "nav.ourStory": "Our Story",
  "nav.subscriptions": "Subscriptions",
  "nav.services": "Services",
  "nav.shop": "Shop",
  "nav.myAccount": "My Account",
  "nav.cart": "Cart",

  // Hero
  "hero.tagline": "Passion and tradition in every cup.",
  "hero.cta": "Subscribe Now",

  // Services
  "services.title": "More Than Just Coffee",
  "services.subtitle": "We partner with businesses that share our passion. When you buy Amantti coffee to serve your clients, we become part of your team.",
  "services.barismoTitle": "Barismo Training",
  "services.barismoDesc": "We train your staff in the art of coffee preparation — from espresso calibration to latte art — so every cup served represents the best of Amantti.",
  "services.maintenanceTitle": "Equipment Maintenance",
  "services.maintenanceDesc": "Keep your machines performing at their best. We provide regular maintenance, diagnostics, and repair support to minimize downtime.",
  "services.supportTitle": "Ongoing Support",
  "services.supportDesc": "From menu consulting to quality control, our team is always available to help you grow your coffee offering and delight your customers.",
  "services.cta": "Learn More",

  // Subscription Builder
  "builder.title": "Create Your Coffee Experience",
  "builder.step1": "1. Choose Your Coffee",
  "builder.variety": "Variety",
  "builder.varietyValue": "Caturro & Tabbi",
  "builder.profile": "Profile",
  "builder.profileValue": "Caramel, Panela",
  "builder.altitude": "Altitude",
  "builder.altitudeValue": "1800 mts",
  "builder.notes": "Notes",
  "builder.notesValue": "Sweet Caramel, Sugar Cane, Chocolate and Orange",
  "builder.grain": "Grain",
  "builder.grinded": "Grinded",

  // Frequency
  "builder.step2": "2. Delivery Frequency",
  "builder.weekly": "Weekly",
  "builder.biWeekly": "Bi-Weekly",
  "builder.recommended": "(Recommended)",
  "builder.monthly": "Monthly",

  // Summary
  "builder.step3": "3. Subscription Summary",
  "builder.premiumCoffee": "Premium Coffee",
  "builder.wholeBean": "Whole Bean",
  "builder.ground": "Ground",
  "builder.delivery": "Delivery",
  "builder.priceLabel": "Price per shipment:",
  "builder.completeSub": "Complete Subscription",
} as const;

export type TranslationKey = keyof typeof en;
