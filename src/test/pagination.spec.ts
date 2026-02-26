import { renderHook, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePagination } from '@/hooks/usePagination';

describe('usePagination', () => {
  it('pagina lista e calcula total corretamente', () => {
    const { result } = renderHook(() => usePagination([1, 2, 3, 4, 5], { pageSize: 2 }));

    expect(result.current.totalPages).toBe(3);
    expect(result.current.pageItems).toEqual([1, 2]);

    act(() => {
      result.current.next();
    });

    expect(result.current.page).toBe(2);
    expect(result.current.pageItems).toEqual([3, 4]);
  });

  it('reseta para primeira página quando resetKey muda', () => {
    const { result, rerender } = renderHook(
      ({ resetKey }) => usePagination([1, 2, 3, 4], { pageSize: 2, resetKey }),
      { initialProps: { resetKey: 'a' } },
    );

    act(() => {
      result.current.setPage(2);
    });

    expect(result.current.page).toBe(2);

    rerender({ resetKey: 'b' });

    expect(result.current.page).toBe(1);
    expect(result.current.pageItems).toEqual([1, 2]);
  });
});
