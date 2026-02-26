import { useEffect, useMemo, useState } from 'react';

type PaginationOptions = {
  pageSize?: number;
  initialPage?: number;
  resetKey?: string | number;
};

export function usePagination<T>(items: T[], options: PaginationOptions = {}) {
  const pageSize = Math.max(1, options.pageSize ?? 8);
  const [page, setPage] = useState(Math.max(1, options.initialPage ?? 1));

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  const pageItems = useMemo(() => items.slice(startIndex, endIndex), [items, startIndex, endIndex]);

  useEffect(() => {
    if (safePage !== page) {
      setPage(safePage);
    }
  }, [page, safePage]);

  useEffect(() => {
    setPage(1);
  }, [options.resetKey]);

  return {
    page: safePage,
    pageSize,
    totalItems,
    totalPages,
    startIndex,
    endIndex,
    pageItems,
    setPage,
    canPrevious: safePage > 1,
    canNext: safePage < totalPages,
    next: () => setPage((current) => Math.min(current + 1, totalPages)),
    previous: () => setPage((current) => Math.max(current - 1, 1)),
  };
}
