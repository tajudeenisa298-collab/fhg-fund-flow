import { useState } from "react";
import { Button } from "@/components/ui/button";

const DEFAULT_PAGE = 10;

export function usePagedList<T>(items: T[], pageSize = DEFAULT_PAGE) {
  const [visible, setVisible] = useState(pageSize);
  const slice = items.slice(0, visible);
  const hasMore = items.length > visible;
  const showMore = () => setVisible((v) => v + pageSize);
  const reset = () => setVisible(pageSize);
  return { slice, hasMore, showMore, reset, total: items.length, visible };
}

export function ShowMoreButton({
  hasMore,
  onClick,
  remaining,
  className,
}: {
  hasMore: boolean;
  onClick: () => void;
  remaining: number;
  className?: string;
}) {
  if (!hasMore) return null;
  return (
    <div className={`flex justify-center border-t bg-muted/20 px-4 py-2 ${className ?? ""}`}>
      <Button variant="ghost" size="sm" onClick={onClick}>
        Show more ({remaining} remaining)
      </Button>
    </div>
  );
}
