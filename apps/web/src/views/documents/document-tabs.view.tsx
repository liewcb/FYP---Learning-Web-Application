import Link from "next/link";

const documentTabs = [
  { key: "workspace", label: "Upload & analyse", href: "/documents" },
  { key: "manage", label: "Manage documents", href: "/documents/manage" },
] as const;

export type DocumentTabKey = (typeof documentTabs)[number]["key"];

interface DocumentTabsProps {
  readonly active: DocumentTabKey;
  readonly documentCount: number;
}

export function DocumentTabs({ active, documentCount }: DocumentTabsProps) {
  return (
    <nav className="document-tabs" aria-label="My Documents sections">
      {documentTabs.map((tab) => (
        <Link
          className={tab.key === active ? "document-tab active" : "document-tab"}
          href={tab.href}
          key={tab.key}
          aria-current={tab.key === active ? "page" : undefined}
        >
          {tab.label}
          {tab.key === "manage" ? (
            <span className="document-tab-count">{documentCount}</span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
