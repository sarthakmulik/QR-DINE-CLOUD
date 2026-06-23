export type UserRole = "superadmin" | "hotel_owner" | "staff";
export type HotelPlan = "basic" | "pro" | "elite";
export type HotelStatus = "active" | "paused" | "suspended";
export type ServiceType = "dine_in" | "quick_service";
export type SessionStatus = "draft" | "payment_pending" | "open" | "checkout_initiated" | "bill_printed" | "closed" | "ready_for_pickup" | "cancelled";
export type PaymentMethod = "Cash" | "UPI" | "Card";

export interface Profile {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  hotel_id: string | null;
  created_at: string;
}

export interface Hotel {
  id: string;
  name: string;
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  login_email: string;
  plan: HotelPlan;
  status: HotelStatus;
  service_type: ServiceType;
  billing_amount: number;
  daily_order_sequence: number;
  last_sequence_reset: string | null;
  last_payment_date: string | null;
  next_due_date: string | null;
  gst_number: string | null;
  logo: string | null;
  address: string | null;
  tax_rate: number;
  created_at: string;
  kitchen_pin: string | null;
  upi_id: string | null;
  secure_qr?: boolean | null;
  quick_service_token?: string | null;
  customizations?: {
    theme?: string;
    qsTheme?: string;
    qsPrimaryColor?: string;
    qsBgColor?: string;
    qsTextColor?: string;
    qsCardBgColor?: string;
    primaryColor?: string;
    secondaryColor?: string;
    textColor?: string;
    fontFamily?: string;
    announcementText?: string;
    welcomeMessage?: string;
    layout?: string;
  } | null;
  payment_settings?: {
    active_pg?: "none" | "razorpay" | "phonepe";
    razorpay?: {
      key_id: string;
      key_secret: string;
    };
    phonepe?: {
      merchant_id: string;
      salt_key: string;
      salt_index: string;
      env?: "TEST" | "PROD";
    };
  } | null;
  welcome_animation_enabled?: boolean | null;
  welcome_animation_preset?: string | null;
}

export interface RestaurantTable {
  id: string;
  hotel_id: string;
  table_number: number;
  label: string | null;
  qr_code_url: string | null;
  current_session_id: string | null;
}

export interface TableSession {
  id: string;
  hotel_id: string;
  table_id: string | null;
  table_number: number | null;
  order_number: number | null;
  start_time: string;
  end_time: string | null;
  status: SessionStatus;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total: number;
  payment_method: PaymentMethod | null;
  payment_reference: string | null;
  closed_at: string | null;
  customer_count: number;
  coupon_code: string | null;
  discount_percent: number;
}

export interface SessionItem {
  id: string;
  session_id: string;
  menu_item_id: string | null;
  name: string;
  price: number;
  quantity: number;
  added_at: string;
  status: "preparing" | "ready" | "served";
}

export interface MenuCategory {
  id: string;
  hotel_id: string;
  name: string;
  sort_order: number;
}

export interface MenuItem {
  id: string;
  hotel_id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  spicy_level?: number | null;
  prep_time?: number | null;
  is_vegetarian?: boolean | null;
  contains_nuts?: boolean | null;
  is_gluten_free?: boolean | null;
  is_recommended?: boolean | null;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  hotelId: string | null;
  hotelPlan?: string | null;
}

/** Map DB snake_case hotel to API camelCase */
export function mapHotel(h: Hotel) {
  const plan = (h.plan || "basic").toLowerCase();
  let customizations = h.customizations ?? null;
  if (!customizations) {
    customizations = { qsTheme: "neo_brutalism" };
  } else {
    let layout = customizations.layout || "default";
    if (plan === "basic") {
      layout = "default";
    } else if (plan === "pro") {
      if (layout !== "default" && layout !== "compact" && layout !== "masonry") {
        layout = "default";
      }
    }
    customizations = {
      ...customizations,
      layout,
      qsTheme: customizations.qsTheme || "neo_brutalism",
    };
  }

  return {
    id: h.id,
    name: h.name,
    ownerName: h.owner_name,
    ownerEmail: h.owner_email,
    ownerPhone: h.owner_phone,
    loginEmail: h.login_email,
    plan: h.plan,
    status: h.status,
    serviceType: h.service_type || 'dine_in',
    billingAmount: Number(h.billing_amount),
    lastPaymentDate: h.last_payment_date,
    nextDueDate: h.next_due_date,
    gstNumber: h.gst_number,
    logo: h.logo,
    address: h.address,
    taxRate: Number(h.tax_rate),
    createdAt: h.created_at,
    kitchenPin: h.kitchen_pin ?? null,
    upiId: h.upi_id ?? null,
    secureQr: !!h.secure_qr,
    welcomeAnimationEnabled: h.welcome_animation_enabled ?? true,
    welcomeAnimationPreset: h.welcome_animation_preset || "elegant",
    quickServiceToken: h.quick_service_token ?? null,
    customizations,
    paymentSettings: h.payment_settings ? {
      active_pg: h.payment_settings.active_pg || "none",
      razorpay: h.payment_settings.razorpay ? { key_id: h.payment_settings.razorpay.key_id } : undefined,
      phonepe: h.payment_settings.phonepe ? { env: h.payment_settings.phonepe.env } : undefined,
    } : null,
  };
}

export function mapSessionItem(i: any) {
  return {
    id: i.id,
    sessionId: i.session_id,
    menuItemId: i.menu_item_id,
    name: i.name,
    price: Number(i.price),
    quantity: i.quantity,
    addedAt: i.added_at,
    status: i.status || "preparing",
  };
}

export function mapTableSession(
  s: TableSession,
  items: SessionItem[] = [],
  hotel?: Hotel,
  table?: RestaurantTable
) {
  return {
    id: s.id,
    hotelId: s.hotel_id,
    tableId: s.table_id,
    tableNumber: s.table_number,
    orderNumber: s.order_number,
    startTime: s.start_time,
    endTime: s.end_time,
    status: s.status,
    subtotal: Number(s.subtotal),
    discountAmount: Number(s.discount_amount || 0),
    taxAmount: Number(s.tax_amount),
    total: Number(s.total),
    paymentMethod: s.payment_method,
    paymentReference: s.payment_reference ?? null,
    closedAt: s.closed_at,
    customerCount: s.customer_count,
    couponCode: s.coupon_code ?? null,
    discountPercent: Number(s.discount_percent || 0),
    items: items.map(mapSessionItem),
    hotel: hotel ? mapHotel(hotel) : undefined,
    table: table
      ? {
          id: table.id,
          label: table.label,
          tableNumber: table.table_number,
        }
      : undefined,
  };
}

export function mapMenuItem(i: MenuItem) {
  return {
    id: i.id,
    hotelId: i.hotel_id,
    categoryId: i.category_id,
    name: i.name,
    description: i.description,
    price: Number(i.price),
    imageUrl: i.image_url,
    isAvailable: i.is_available,
    spicyLevel: i.spicy_level !== null && i.spicy_level !== undefined ? Number(i.spicy_level) : null,
    prepTime: Number(i.prep_time ?? 15),
    isVegetarian: !!i.is_vegetarian,
    containsNuts: !!i.contains_nuts,
    isGlutenFree: !!i.is_gluten_free,
    isRecommended: !!i.is_recommended,
  };
}
