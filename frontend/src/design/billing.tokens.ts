/**
 * Billing Module Design Tokens (TypeScript/JavaScript exports)
 *
 * These tokens match billing.tokens.css and can be imported
 * into React components for programmatic styling.
 */

export const BillingColors = {
  // Background & Surface
  bgWarm: '#FFF7F2',
  surface: '#FFFFFF',
  surfaceTint: '#F7F3FF',
  surfaceGlass: 'rgba(255, 255, 255, 0.95)',

  // Text
  textStrong: '#2D2A32',
  textMedium: '#374151',
  textMuted: '#6B7280',
  textAccent: '#8B5CF6',

  // Gradient stops
  gradStart: '#FF8FAB',
  gradMid: '#FFB86B',
  gradEnd: '#C084FC',

  // Status
  success: '#10B981',
  successLight: '#D1FAE5',
  successDark: '#065F46',

  danger: '#EF4444',
  dangerLight: '#FEE2E2',
  dangerDark: '#991B1B',

  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  warningDark: '#92400E',

  info: '#3B82F6',
  infoLight: '#DBEAFE',
  infoDark: '#1E40AF',

  // Borders
  borderLight: '#F3E8FF',
  borderMedium: '#E9D5FF',
  borderStrong: '#C084FC',
} as const;

export const BillingGradients = {
  primary: 'linear-gradient(135deg, #FF8FAB, #FFB86B)',
  full: 'linear-gradient(135deg, #f9a8d4, #fbbf24, #c084fc)',
  warm: 'linear-gradient(135deg, #fdf2f8 0%, #fef7ed 50%, #f3e8ff 100%)',
  button: 'linear-gradient(135deg, #ec4899, #f59e0b, #8b5cf6)',
} as const;

export const BillingShadows = {
  card: '0 15px 35px rgba(255, 138, 171, 0.15), 0 4px 12px rgba(0, 0, 0, 0.03)',
  cardHover: '0 20px 45px rgba(255, 138, 171, 0.20), 0 8px 24px rgba(255, 184, 107, 0.20)',
  button: '0 6px 18px rgba(249, 168, 212, 0.35)',
  buttonHover: '0 8px 24px rgba(249, 168, 212, 0.45)',
  glass: '0 8px 24px rgba(236, 72, 153, 0.12), 0 2px 8px rgba(139, 69, 19, 0.06)',
} as const;

export const BillingRadius = {
  sm: '0.75rem',   // 12px
  md: '1rem',      // 16px
  lg: '1.5rem',    // 24px
  xl: '2rem',      // 32px
  full: '9999px',
} as const;

export const BillingSpacing = {
  xs: '0.25rem',   // 4px
  sm: '0.5rem',    // 8px
  md: '1rem',      // 16px
  lg: '1.5rem',    // 24px
  xl: '2rem',      // 32px
  '2xl': '3rem',   // 48px
} as const;

export const BillingFonts = {
  sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  display: "'Playfair Display', Georgia, serif",
} as const;

export const BillingTextSizes = {
  xs: '0.75rem',    // 12px
  sm: '0.875rem',   // 14px
  base: '1rem',     // 16px
  lg: '1.125rem',   // 18px
  xl: '1.25rem',    // 20px
  '2xl': '1.5rem',  // 24px
  '3xl': '1.875rem',// 30px
} as const;

export const BillingZIndex = {
  base: 1,
  dropdown: 10,
  sticky: 20,
  modal: 40,
  toast: 50,
} as const;

export const BillingTransitions = {
  fast: '150ms ease-in-out',
  base: '200ms ease-in-out',
  slow: '300ms ease-in-out',
} as const;

/**
 * Helper to build gradient background style
 */
export function buildGradientStyle(gradient: keyof typeof BillingGradients) {
  return { background: BillingGradients[gradient] };
}

/**
 * Helper for card styles
 */
export function buildCardStyle(variant: 'default' | 'glass' = 'default') {
  if (variant === 'glass') {
    return {
      background: BillingColors.surfaceGlass,
      backdropFilter: 'blur(16px)',
      borderRadius: BillingRadius.lg,
      border: `2px solid ${BillingColors.borderLight}`,
      boxShadow: BillingShadows.glass,
    };
  }
  return {
    background: BillingColors.surfaceGlass,
    backdropFilter: 'blur(16px)',
    borderRadius: BillingRadius.xl,
    boxShadow: BillingShadows.card,
    transition: `box-shadow ${BillingTransitions.base}`,
  };
}

/**
 * Helper for button styles
 */
export function buildButtonStyle(variant: 'primary' | 'secondary' = 'primary') {
  if (variant === 'secondary') {
    return {
      background: BillingColors.surface,
      color: BillingColors.textAccent,
      border: `2px solid ${BillingColors.borderMedium}`,
      borderRadius: BillingRadius.md,
      padding: '0.625rem 1rem',
      fontWeight: 600,
      fontFamily: BillingFonts.sans,
      transition: `all ${BillingTransitions.base}`,
      cursor: 'pointer',
    };
  }
  return {
    background: BillingGradients.full,
    color: 'white',
    border: 'none',
    borderRadius: BillingRadius.xl,
    padding: '0.75rem 1.25rem',
    fontWeight: 700,
    fontFamily: BillingFonts.sans,
    boxShadow: BillingShadows.button,
    transition: `all ${BillingTransitions.base}`,
    cursor: 'pointer',
  };
}
