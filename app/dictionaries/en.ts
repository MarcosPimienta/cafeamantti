export const en = {
  // Nav
  "nav.ourStory": "Our Story",
  "nav.subscriptions": "Subscriptions",
  "nav.shop": "Shop",
  "nav.myAccount": "My Account",
  "nav.cart": "Cart",

  // Hero
  "hero.tagline": "Passion and tradition in every cup.",
  "hero.cta": "Subscribe Now",

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
