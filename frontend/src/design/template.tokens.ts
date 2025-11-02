/**
 * Template module design tokens.
 * Mirrors the CSS custom properties defined in styles/template.tokens.css
 * so that React components can reuse them directly in inline styles.
 */

export const TemplateColors = {
  bgWarm: '#FFF7F2',
  surface: '#FFFFFF',
  surfaceSoft: '#FFF9F5',
  surfaceTint: '#F9F5FF',
  textPrimary: '#2C2738',
  textSecondary: '#5B5671',
  textMuted: '#8A829F',
  accent: '#8B5CF6',
  accentSoft: '#E9D5FF',
  danger: '#F87171',
  dangerBorder: '#FECACA',
  success: '#34D399',
  border: '#F2E8FF',
} as const;

export const TemplateGradients = {
  primary: 'linear-gradient(135deg, #FF8FAB, #FFB86B)',
  pillActive: 'linear-gradient(135deg, rgba(253, 213, 240, 1), rgba(255, 222, 201, 1))',
  subtle: 'linear-gradient(135deg, rgba(255, 245, 240, 0.7), rgba(249, 245, 255, 0.9))',
} as const;

export const TemplateShadows = {
  card: '0 15px 35px rgba(255, 138, 171, 0.15), 0 4px 12px rgba(0, 0, 0, 0.03)',
  hover: '0 8px 24px rgba(255, 184, 107, 0.20)',
  button: '0 6px 18px rgba(255, 182, 141, 0.35)',
  focus: '0 0 0 3px rgba(139, 92, 246, 0.25)',
} as const;

export const TemplateRadius = {
  sm: '0.75rem',
  md: '1rem',
  lg: '1.5rem',
  xl: '2rem',
  full: '9999px',
} as const;

export const TemplateSpacing = {
  xs: '0.5rem',
  sm: '0.75rem',
  md: '1rem',
  lg: '1.5rem',
  xl: '2rem',
  xxl: '3rem',
} as const;

export const TemplateTypography = {
  sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  display: "'Playfair Display', Georgia, serif",
  mono: "'JetBrains Mono', 'Fira Code', monospace",
} as const;

export const TemplateTransitions = {
  fast: '150ms ease-in-out',
  base: '220ms ease-in-out',
  slow: '320ms ease',
} as const;

export const TemplateZIndex = {
  base: 1,
  sticky: 10,
  modal: 40,
  toast: 50,
} as const;

export function templateGradientBackground(variant: keyof typeof TemplateGradients = 'primary') {
  return { background: TemplateGradients[variant] };
}

export function templateCardStyle(hover = false) {
  return {
    background: TemplateColors.surface,
    borderRadius: TemplateRadius.lg,
    boxShadow: hover ? TemplateShadows.hover : TemplateShadows.card,
    transition: `box-shadow ${TemplateTransitions.base}`,
  };
}

