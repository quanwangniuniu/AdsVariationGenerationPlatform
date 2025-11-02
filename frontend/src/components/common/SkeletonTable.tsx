import {
  TemplateColors,
  TemplateRadius,
  TemplateSpacing,
  TemplateShadows,
  TemplateTransitions,
} from '@/design/template.tokens';

interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export default function SkeletonTable({ rows = 5, columns = 4, className = '' }: SkeletonTableProps) {
  return (
    <div className={`skeleton-table ${className}`} role="status" aria-live="polite" aria-label="Loading templates">
      <div className="header" />
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="row">
          {Array.from({ length: columns }).map((__, colIndex) => (
            <div key={colIndex} className="cell">
              <span />
            </div>
          ))}
        </div>
      ))}

      <style jsx>{`
        .skeleton-table {
          border-radius: ${TemplateRadius.lg};
          box-shadow: ${TemplateShadows.card};
          overflow: hidden;
          background: ${TemplateColors.surface};
        }

        .header {
          height: 3.5rem;
          background: ${TemplateColors.surfaceSoft};
        }

        .row {
          display: grid;
          grid-template-columns: repeat(${columns}, minmax(0, 1fr));
          gap: 1px;
          background: ${TemplateColors.surfaceSoft};
        }

        .cell {
          background: ${TemplateColors.surface};
          padding: ${TemplateSpacing.sm} ${TemplateSpacing.md};
        }

        .cell span {
          display: block;
          width: 100%;
          height: 1.1rem;
          border-radius: ${TemplateRadius.sm};
          background: linear-gradient(90deg, #f3f0ff 0%, #fff 50%, #f3f0ff 100%);
          background-size: 200% 100%;
          animation: shimmer 1.8s infinite;
        }

        @keyframes shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }

        @media (max-width: 768px) {
          .row {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>
    </div>
  );
}

