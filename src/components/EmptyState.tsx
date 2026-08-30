/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * EmptyState — consistent "nothing here" UI for all dashboard sections.
 *
 * Usage:
 *   <EmptyState
 *     icon={<Inbox className="w-10 h-10" />}
 *     title="No notifications yet"
 *     description="When something happens, you'll see it here."
 *   />
 *   <EmptyState
 *     icon={<FolderOpen className="w-10 h-10" />}
 *     title="No projects found"
 *     description="Try adjusting your filters or post a new project."
 *     action={<Button onClick={postProject}>Post Project</Button>}
 *   />
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import type { ReactNode } from 'react';

interface EmptyStateProps {
  /** Lucide icon element, e.g. <Inbox className="w-10 h-10" /> */
  icon: ReactNode;
  /** Short heading — "No projects yet" */
  title: string;
  /** Optional description — additional context */
  description?: string;
  /** Optional action button/link */
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-4">
        {icon}
      </div>
      <h3 className="font-display text-base font-bold text-slate-900 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-slate-500 max-w-sm mb-4">{description}</p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}
