export const REGISTRATION_DEADLINE_LABEL = "31th October 2026";
/** Inclusive last calendar day for registration (local timezone). */
export const REGISTRATION_DEADLINE_ISO = "2026-09-30";
export const OLYMPIAD_YEAR_LABEL = "2026-2027";
export const REGISTRATION_FEE_LABEL = "INR 150 per Olympiad";
export const WHATSAPP_NUMBER = "+91 80745 63902";
/** Digits only, country code included (no +) — for WhatsApp app deep links */
export const WHATSAPP_E164 = "918074563902";

/** True while today is on or before the registration last date. */
export function isRegistrationOpen(now = new Date()) {
  const [y, m, d] = REGISTRATION_DEADLINE_ISO.split("-").map(Number);
  const deadlineEnd = new Date(y, m - 1, d, 23, 59, 59, 999);
  return now.getTime() <= deadlineEnd.getTime();
}

/**
 * Opens the WhatsApp app directly (not WhatsApp Web / wa.me website).
 * Optional prefilled message is supported.
 */
export function buildWhatsAppAppUrl(text?: string) {
  const params = new URLSearchParams({ phone: WHATSAPP_E164 });
  if (text?.trim()) params.set("text", text.trim());
  return `whatsapp://send?${params.toString()}`;
}

export const WHATSAPP_APP_HREF = buildWhatsAppAppUrl();

export const ANNOUNCEMENT_OLYMPIADS = [
  {
    code: "IMO",
    name: "Innovative Maths Olympiad",
    examDate: "14th December 2026",
    href: "/imo",
  },
  {
    code: "ISO",
    name: "Innovative Science Olympiad",
    examDate: "16th December 2026",
    href: "/iso",
  },
  {
    code: "IEO",
    name: "Innovative English Olympiad",
    examDate: "18th December 2026",
    href: "/ieo",
  },
] as const;

/** localStorage key — bump when Olympiad Year changes */
export const INTRO_POPUP_STORAGE_KEY = "icape-intro-popup-dismissed-2026-2027";
