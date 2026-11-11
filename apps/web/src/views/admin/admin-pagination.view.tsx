import Link from "next/link";

interface AdminPaginationProps {
  readonly page: number;
  readonly pageCount: number;
  readonly hrefFor: (page: number) => string;
}

export function AdminPagination({ page, pageCount, hrefFor }: AdminPaginationProps) {
  if (pageCount <= 1) {
    return null;
  }

  return (
    <nav className="admin-pagination" aria-label="Pages">
      {page > 1 ? <Link href={hrefFor(page - 1)}>← Previous</Link> : <span />}
      <span>Page {page} of {pageCount}</span>
      {page < pageCount ? <Link href={hrefFor(page + 1)}>Next →</Link> : <span />}
    </nav>
  );
}
