# Café Amantti — Complete Project Blueprint

> A full-stack B2C/B2B coffee brand platform for a Colombian specialty coffee roaster, combining an e-commerce storefront, subscription management, and a rich internal operations back-office.

---

## 1. Tech Stack

| Layer | Technology |
|---|---|
| Framework | **Next.js 16** (App Router, React 19) |
| Language | **TypeScript 5** |
| Styling | **Tailwind CSS v4** (utility-first, no component library) |
| Database & Auth | **Supabase** (PostgreSQL + Row-Level Security + Auth) |
| PDF Generation | **html2pdf.js**, **jsPDF + jspdf-autotable** |
| Drag-and-drop | **@dnd-kit/core**, **@dnd-kit/sortable** |
| Charts | **Recharts** |
| Forms | **react-hook-form** + **Zod** |
| Icons | **Lucide React** |
| Fonts | Geist Sans, Geist Mono, Playfair Display, Bodoni Moda (Google Fonts) |
| Hosting | **Vercel** |

---

## 2. Architecture Overview

```
cafeamantti/
├── app/
│   ├── (marketing)/          ← Public landing page (guests)
│   ├── (auth)/               ← Login, Register, Onboarding, Recovery
│   ├── (shop)/               ← Subscription builder + product page
│   ├── (portal)/             ← Authenticated customer dashboard
│   ├── (admin)/              ← Full back-office (admin role only)
│   ├── actions/              ← Shared server actions (checkout)
│   ├── components/           ← Shared UI components (Cart, Modal, etc.)
│   ├── context/              ← React context providers (Cart, Language)
│   ├── dictionaries/         ← i18n translations (es.ts, en.ts)
│   ├── layout.tsx            ← Root layout (fonts, Providers wrapper)
│   ├── globals.css           ← Global Tailwind CSS styles
│   └── providers.tsx         ← CartProvider + LanguageProvider
├── utils/
│   ├── supabase/             ← Supabase client helpers (client, server, middleware, storage)
│   └── pdf/
│       └── quoteGenerator.ts ← PDF generation utility (quotes + proposals)
├── supabase/
│   └── migrations/           ← 26 SQL migration files (schema + seed)
├── public/
│   └── images/               ← Coffee bag renders, backgrounds, service photos
├── middleware.ts             ← Route protection + role-based redirect
└── next.config.ts            ← Next.js configuration
```

---

## 3. Route Groups & Pages

### 3.1 `(marketing)` — Public Landing Page (`/`)

A single-page marketing site with the following **sections**:

| Section | Description |
|---|---|
| **Fixed Navbar** | Logo (Bodoni italic), anchor links, language switcher (ES/EN), cart icon with badge, "My Account" / Dashboard link |
| **Hero** | Full-width hero image with gradient overlay, brand headline, CTA button |
| **Our Story** (`#historia`) | Two-column layout: text + brand values grid (Tradition, Passion, Sustainability) + locale-specific image |
| **Services** (`#servicios`) | Dark section with 3 image cards: Barismo Training, Equipment Maintenance, Ongoing Support |
| **Subscription Plans** (`#suscripciones`) | 3 plan cards (Devoción Esencial / Alquimia & Contraste / Curaduría Privada) with product bag renders, plan details, subscribe CTA |
| **Shop** (`#tienda`) | Product cards for individual purchase with weight selector (250g / 500g / 2.5kg), whole-bean vs. ground toggle, grind-level selector, dynamic price, add-to-cart with animated feedback |
| **Contact** (`#contacto`) | Contact form + social links (Facebook, Twitter, YouTube, Instagram, WhatsApp) |
| **Footer** | Brand links, terms modal trigger |

**Key behaviours:**
- `ProductCard` component manages local state per card (weight, grind, grind level)
- Price recalculated with multipliers: `250g = 1×`, `500g = 1.8×`, `2.5kg = 8×`
- Add-to-cart triggers a 800ms spinner → green ✓ feedback state
- User auth state read on mount (shows "Dashboard" vs "My Account")
- Language switcher persists locale preference in cookie (`NEXT_LOCALE`)

---

### 3.2 `(auth)` — Authentication

| Route | Description |
|---|---|
| `/login` | Email + password login; honeypot field for bot protection; redirects to `redirectTo` param after login |
| `/register` | Registration form with first/last name, email, password; honeypot field; creates Supabase auth user (trigger auto-creates profile row) |
| `/recovery` | Password recovery via Supabase magic link |
| `/onboarding` | Post-registration onboarding step (profile completion) |

---

### 3.3 `(shop)` — Subscription Builder (`/builder`)

A **4-step form** (no page navigation, single URL with sticky summary) allowing authenticated users to create or edit their subscription:

1. **Plan Selection** — 3 plan cards with product bag renders
2. **Customization** — Weight (250g/500g/2.5kg), whole/ground toggle, grind level (espresso/drip/french press) if ground
3. **Delivery Frequency** — Weekly, Bi-weekly, Monthly
4. **Shipping Info** — Department (all 33 Colombian departments dropdown), city, exact address, apartment details

Right sidebar: **Sticky summary card** showing current plan image, selections, and calculated price in COP. "Confirm Subscription" button.

If `?id=<uuid>` is in URL → loads existing subscription from Supabase for **edit mode** (IDOR-protected).
If `?plan=<id>` → pre-selects the plan.

Server action `upsertSubscription` → inserts or updates `subscriptions` table, then redirects to `/dashboard`.

---

### 3.4 `(portal)` — Customer Dashboard (`/dashboard`)

A **tabbed SSR dashboard** with 3 tabs (driven by `?tab=` search param):

| Tab | Content |
|---|---|
| **Overview** | Active subscription card (plan name, frequency, weight/grind, next delivery date, edit/cancel actions); empty state with "Subscribe" CTA |
| **Orders** | List of all user orders with status badge (Pending / Paid / Processing / Shipped / Delivered / Cancelled) and amount in COP |
| **Profile** | Editable form: first name, last name, cédula, phone, department, city, address. Server action `updateUserProfile` |

**Sidebar:** Coffee brand quote card with dark background.

**DashboardCart component:** Inline cart within the dashboard allowing checkout from any tab.

Auth guard: Server-side redirect to `/login` if no session.

---

### 3.5 `(admin)` — Back-Office Admin Panel (`/admin/*`)

Role-gated (middleware checks `profiles.role === 'admin'`). Uses `AdminNav` sidebar layout.

#### 3.5.1 Admin Dashboard (`/admin`)
- KPI cards: **Total Revenue** (COP), **Total Orders** (count), **Active Subscriptions** (count)
- Recent orders table (5 rows) with customer name, date, amount, status badge

#### 3.5.2 Orders (`/admin/orders`)
Full orders management:
- Table of all orders with filters and status management
- `OrderActions` client component with inline status update
- **Manual Order Modal** (`ManualOrderModal.tsx`): Create/edit orders for B2B clients without an account
  - Client selector (from `clients` CRM table)
  - Contact email/phone
  - Shipping info (address, city, state)
  - Line items builder: select inventory items (SKU search), quantity, custom price
  - On submit: validates stock, inserts `order` row, inserts `order_items`, deducts inventory (`salida` movement), logs to audit trail
  - On delete: reverts inventory movements atomically

#### 3.5.3 Inventory (`/admin/inventory`)

The most complex page (~3,600 lines). A **tabbed single-page inventory management system**:

| Tab | Functionality |
|---|---|
| **Inventario** | Full SKU table with stock status badges (OK / Low / Out), sortable columns, search + category filter, low-stock toggle. Summary cards: Total SKUs, Low Stock count, Zero Stock count. Per-row actions: Adjust Modal, History Drawer |
| **Entradas** | Log incoming stock: select product, quantity, movement date, lot (`lote`), responsible person, entry type (compra / donación / ajuste). Inserts `entrada` movement + updates stock |
| **Trilla** | Green coffee hulling process: input product (green coffee) → output product (hulled), quantities, notes. Creates `trilla_batch` record + `salida` on input + `entrada` on output. Historical table |
| **Proceso Tostión** | Roasting batch: input (hulled/green) → output (roasted kg), quantities, batch notes. Creates `tostion_batch` + movements. Historical table |
| **Empaque / Altas** | Production packing: logs finished packaged units into inventory. Selects output product (e.g. 250g bags), quantity produced, date, lot. Also logs simultaneous packaging material consumption (bags + stickers as `salida` movements) |
| **Salidas** | Manual exit log: select product, quantity, reason, date. Creates `salida` movement + deducts stock |
| **Reportes** | Visual analytics using Recharts: Bar chart (stock by product), Pie chart (stock by category), Line chart (movement trends over time). Filterable by category |
| **Auditoría** | Full audit log table from `inventory_audit_logs`: action type (CREATE/UPDATE/DELETE), entity type, entity ID, admin user, timestamp |

**Shared sub-components within InventoryClient:**
- `AdjustModal` — Modal with entrada/salida/ajuste type toggle + quantity + reason
- `HistoryDrawer` — Side drawer showing all movements for a specific SKU
- `StockBadge` — Color-coded status pill
- `FeedbackBanner` — Success/error feedback
- `SortableTh` / `SortingIcon` — Sortable table headers
- `ProductSelect` — Filterable select for inventory items

#### 3.5.4 Subscriptions (`/admin/subscriptions`)
- Lists all subscriptions with joined profile data
- Shows plan name, frequency, weight, grind, next delivery date
- Inline `<form>` with `<select>` to update status → server action `updateSubscriptionStatus`

#### 3.5.5 Users (`/admin/users`)
- Lists registered auth users (via `profiles` table)
- `CreateCustomerModal`: Uses **Supabase Admin API** (service role key) to create an auth user programmatically → trigger auto-creates profile row → admin updates extra fields (cédula, phone, address). Default password: `Amantti2026*`

#### 3.5.6 Customers / CRM (`/admin/customers`)
B2B client directory — **separate from auth users**:
- `clients` table: name, document_type, document_number, email, phone, address, city, department
- `CreateCRMClientModal`: form to add B2B/wholesale clients without an online account
- Table showing clients with order count (aggregated from `orders.client_id`)
- Used as client selector in Manual Orders and Proposals

#### 3.5.7 Quotes & Proposals (`/admin/quotes`)

Two sub-modules:

**Quotes** (`/admin/quotes`):
- List of all generated commercial quotes
- Create new quote (`/admin/quotes/new`) via `NewQuoteForm`
- View/download quote PDF (`/admin/quotes/[id]`)
- `QuoteHTMLTemplate` — HTML template rendered to PDF via jsPDF
- `QuoteActions` — Per-row actions (view, download, delete)
- Server actions: `createQuote`, `updateQuote`, `deleteQuote`

**Proposals** (`/admin/quotes/proposals`):
- Full block-based commercial proposal editor (`/admin/quotes/proposals/new`)
- `ProposalForm` — Two-column layout: **Block Editor** (left) | **Sticky Live Preview** (right, debounced 300ms)
- **Block types:**
  - `rich-text` — Title + free-text textarea
  - `price-table` — Line items with cost price, PVP, and auto-calculated margin %
  - `checklist` — Title + multi-item checklist
- Blocks are **drag-and-drop reorderable** via `@dnd-kit`
- **BrandIdentityPanel:** Upload ally partner logo + background image to Supabase Storage; adjust background opacity
- PDF download: `generateProposalPDF()` converts `ProposalHTMLTemplate` to PDF via html2pdf.js
- Server actions: `createProposal`, `updateProposal`, `deleteProposal`, `getProposalAssetSignedUrl`
- Proposal statuses: Borrador / Enviada / Aprobada

#### 3.5.8 Settings (`/admin/settings`)
- Store name, admin email, base currency
- Default shipping cost, free shipping threshold
- Server actions: `updateStoreSettings`, `updateShippingSettings`

---

## 4. Database Schema

### Core Tables

| Table | Key Columns |
|---|---|
| `profiles` | `id` (FK → auth.users), `role` (user/admin), `first_name`, `last_name`, `cedula_number`, `phone_number`, `department`, `city`, `address` |
| `subscriptions` | `user_id`, `plan_id` (essential/alchemy/curator), `frequency` (weekly/bi-weekly/monthly), `weight` (250g/500g/1kg), `grind` (whole/ground), `grind_level`, `status` (active/paused/cancelled), `next_delivery_date`, `shipping_state/city/address/details` |
| `orders` | `user_id`, `client_id` (FK → clients, nullable), `total_amount`, `status`, `contact_email`, `contact_phone`, `shipping_info` (JSONB) |
| `order_items` | `order_id`, `product_id` (text - flexible after migration), `weight`, `grind`, `quantity`, `price_at_time` |
| `store_settings` | `id=1`, `store_name`, `admin_email`, `base_currency`, `default_shipping_cost`, `free_shipping_threshold` |

### Inventory Tables

| Table | Key Columns |
|---|---|
| `inventory` | `product_code` (unique), `product_name`, `category` (cafe/empaque/accesorio), `unit`, `current_stock`, `min_stock`, `notes` |
| `inventory_movements` | `inventory_id`, `type` (entrada/salida/ajuste), `quantity` (signed int), `reason`, `lote`, `movement_date`, `responsable`, `entry_type`, `tab_source`, `created_by` |
| `production_batches` | `process_type` (trilla/tostion), `input_inventory_id`, `input_quantity_kg`, `output_inventory_id`, `output_quantity_kg`, `weight_loss_pct`, `rendimiento_pct`, `movement_date`, `notes` |
| `inventory_audit_logs` | `admin_id`, `action_type` (CREATE/UPDATE/DELETE), `entity_type` (MOVEMENT/TRILLA_BATCH/TOSTION_BATCH), `entity_id`, `inventory_id`, `details` (JSONB) |

### CRM & Sales Tables

| Table | Key Columns |
|---|---|
| `clients` | `name`, `document_type`, `document_number`, `email`, `phone`, `address`, `city`, `department` |
| `quotes` | `client_id`, `title`, `content` (JSONB), `status`, `total_amount` |
| `proposals` | `client_id`, `title`, `subtitle`, `content` (JSONB array of blocks), `status` (Borrador/Enviada/Aprobada), `ally_logo_url`, `background_image_url`, `background_opacity` |

### RLS Strategy
- All tables have RLS enabled
- Admin access via a reusable `is_admin()` PostgreSQL function (checks `profiles.role = 'admin'`)
- Users can only access their own rows on `profiles`, `subscriptions`, `orders`

---

## 5. Global State & Providers

### CartContext (`/app/context/CartContext.tsx`)
- Persisted to `localStorage` under key `amantti_cart`
- Cart item uniqueness: `id + weight + grind + grindLevel`
- Exposed: `items`, `addItem`, `removeItem`, `updateQuantity`, `clearCart`, `itemCount`, `subtotal`

### LanguageContext (`/app/context/LanguageContext.tsx`)
- Locale: `es` (default) or `en`
- Persisted to cookie `NEXT_LOCALE`
- Dictionaries: `app/dictionaries/es.ts` and `app/dictionaries/en.ts`
- `t(key)` function for all UI strings

---

## 6. Middleware (`middleware.ts`)

Path-based guard logic:

| Path Pattern | Rule |
|---|---|
| `/portal/*`, `/dashboard/*` | Requires session → redirect to `/login` |
| `/admin/*` | Requires session + `profile.role === 'admin'` → redirect to `/dashboard` if not admin |
| `/login`, `/register` | If already logged in → redirect to `/dashboard` |
| Public paths | Fast-path pass-through (no DB calls) |

Session refresh is only triggered when a `sb-*` cookie is present (optimization).

---

## 7. Shared Components

| Component | Purpose |
|---|---|
| `CartDrawer` | Slide-in cart panel from right. Shows items, quantity controls, subtotal, checkout button |
| `CheckoutModal` | Checkout flow: shipping form → ePayco payment integration |
| `DashboardCart` | Inline cart rendered inside the user dashboard |
| `TermsModal` | Terms & conditions modal (trigger in footer) |
| `AdminNav` | Admin sidebar navigation with links to all admin sections |

---

## 8. PDF Generation (`utils/pdf/quoteGenerator.ts`)

Two generation modes:
1. **Quote PDF** — jsPDF + jspdf-autotable, landscape orientation, table-based layout
2. **Proposal PDF** — html2pdf.js, renders `ProposalHTMLTemplate` (React → HTML string → PDF), supports custom background images (Base64 encoded), ally logos, and custom opacity

---

## 9. Internationalization

- **Two languages:** Spanish (`es`) and English (`en`)
- Dictionary files are plain TypeScript objects (`es.ts`, `en.ts`)
- Language switcher in navbar toggles locale and persists to cookie
- Dashboard SSR reads locale from cookie to render server components in the correct language
- Key UI text areas: nav, hero, story, services, plans, products, dashboard tabs, profile form labels, order statuses

---

## 10. Payment Integration

- **ePayco** referenced in `supabase/migrations/20260326000000_add_epayco_refs.sql`
- `app/actions/checkout.ts` handles the checkout server action
- `CheckoutModal` component collects shipping + triggers payment gateway
- ePayco reference fields added to `orders` table

---

## 11. Supabase Storage

Used for proposal assets:
- Bucket: `proposal-assets`
- Upload: ally logo + background images
- Signed URLs generated server-side via `getProposalAssetSignedUrl(path)`
- Images Base64-encoded at PDF generation time for embedding

---

## 12. Key Design Tokens

| Token | Value |
|---|---|
| Brand gold | `#C59F59` |
| Brand gold hover | `#b08d4f` |
| Background warm | `#fdfbf7` / `#f9f7f2` |
| Dark background (services) | `#1a1a1a` |
| Foreground | System foreground (supports dark mode via CSS vars) |
| Font serif | Playfair Display (used as `font-serif`) |
| Font display | Bodoni Moda (used as `font-bodoni`) |
| Border radius | Rounded-3xl (24px) prevalent, rounded-2xl (16px) for sub-cards |

---

## 13. Replication Checklist

To replicate this project from scratch:

- [ ] Create Next.js 16 app with TypeScript + Tailwind v4
- [ ] Install all dependencies from `package.json`
- [ ] Create Supabase project; apply all 26 migrations in order
- [ ] Set `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Create Supabase Storage bucket `proposal-assets`
- [ ] Seed the `inventory` table (already in migration `20260414000000_inventory.sql`)
- [ ] Seed `store_settings` (migration `20260325000000_store_settings.sql`)
- [ ] Set first user's `role = 'admin'` in `profiles` table manually
- [ ] Add your own product images to `/public/images/`
- [ ] Configure ePayco keys in environment variables
- [ ] Deploy to Vercel

---

## 14. Inventory SKUs (Pre-seeded)

| Code | Product | Category | Unit |
|---|---|---|---|
| CAPG-001 | Café Pergamino | cafe | kg |
| CAFV-001 | Café Verde | cafe | kg |
| CAFT-125G | Café Tostado 125g | cafe | unidad |
| CAFT-250G | Café Tostado 250g | cafe | unidad |
| CAFT-500G | Café Tostado 500g | cafe | unidad |
| CAFT-2K5 | Café Tostado 2.5kg | cafe | unidad |
| CAFT-001 | Café Tostado KG | cafe | kg |
| EMP-BOLSA | Bolsa Empaque | empaque | unidad |
| ETQ-CAFE | Etiqueta Café | empaque | unidad |
| STK-AMT | Stickers Amantti | empaque | unidad |
| POC-001 | Pocillo | accesorio | unidad |
| SACF-001 | Sacos de fique | empaque | unidad |

---

## 15. Subscription Plans

| Plan ID | Name | Base Price (COP) |
|---|---|---|
| `essential` | Devoción Esencial | 35,000 |
| `alchemy` | Alquimia & Contraste | 48,000 |
| `curator` | Curaduría Privada | 65,000 |

Price multipliers by weight: `250g = 1×`, `500g = 1.8×`, `2.5kg = 8×`
