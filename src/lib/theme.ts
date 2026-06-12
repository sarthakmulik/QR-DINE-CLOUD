export interface CustomizationSettings {
  theme: string;
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  fontFamily: string;
  announcementText: string;
  welcomeMessage: string;
  layout: string;
}

export const defaultCustomization: CustomizationSettings = {
  theme: "default",
  primaryColor: "#ea580c",
  secondaryColor: "#ffedd5",
  textColor: "#ffffff",
  fontFamily: "Inter",
  announcementText: "",
  welcomeMessage: "Welcome to our Restaurant",
  layout: "default"
};

export const themePresets = [
  {
    id: "default",
    name: "Sunset Orange (Default)",
    primaryColor: "#ea580c",
    secondaryColor: "#ffedd5",
    textColor: "#ffffff"
  },
  {
    id: "midnight_gold",
    name: "Midnight Gold",
    primaryColor: "#0f172a",
    secondaryColor: "#fef08a",
    textColor: "#ffffff"
  },
  {
    id: "forest_luxury",
    name: "Forest Luxury",
    primaryColor: "#064e3b",
    secondaryColor: "#fef3c7",
    textColor: "#ffffff"
  },
  {
    id: "minimalist_dark",
    name: "Minimalist Dark",
    primaryColor: "#111827",
    secondaryColor: "#e5e7eb",
    textColor: "#ffffff"
  }
];

export function hexToHsl(hex: string) {
  hex = hex.replace(/^#/, "");
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  if (hex.length !== 6) {
    return { h: 24, s: 96, l: 53 }; // default orange HSL
  }

  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

export function hexToRgb(hex: string) {
  hex = hex.replace(/^#/, "");
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  if (hex.length !== 6) {
    return { r: 234, g: 88, b: 12 }; // default orange
  }
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return { r, g, b };
}

export function generateBrandColors(primaryHex: string): Record<string, string> {
  const { h, s, l } = hexToHsl(primaryHex);
  const { r, g, b } = hexToRgb(primaryHex);
  
  return {
    "--brand-50": `hsl(${h}, ${s}%, 97%)`,
    "--brand-100": `hsl(${h}, ${s}%, 93%)`,
    "--brand-200": `hsl(${h}, ${s}%, 85%)`,
    "--brand-300": `hsl(${h}, ${s}%, 75%)`,
    "--brand-400": `hsl(${h}, ${s}%, 65%)`,
    "--brand-500": `hsl(${h}, ${s}%, 55%)`,
    "--brand-600": `hsl(${h}, ${s}%, 45%)`,
    "--brand-700": `hsl(${h}, ${s}%, 35%)`,
    "--brand-800": `hsl(${h}, ${s}%, 25%)`,
    "--brand-900": `hsl(${h}, ${s}%, 15%)`,
    "--brand-rgb": `${r}, ${g}, ${b}`,
  };
}
