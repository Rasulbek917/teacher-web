export interface PaginationQuery {
  page?: number | string;
  pageSize?: number | string;
  search?: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function getPagination(query: PaginationQuery, defaultSize = 20) {
  const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
  let pageSize = parseInt(String(query.pageSize ?? defaultSize), 10) || defaultSize;
  pageSize = Math.min(100, Math.max(1, pageSize));
  const search = (query.search ?? '').trim();
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize, search };
}

export function paginate<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): Paginated<T> {
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
