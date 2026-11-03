import { defaultParseSearch, Link } from "@tanstack/react-router";
import type { ComponentProps } from "react";

/** Backend navigation DTOs contain hrefs, while Router expects path/search/hash separately. */
export function AppHrefLink({ href, ...props }: ComponentProps<"a"> & { href: string }) {
  if (!href.startsWith("/") || href.startsWith("//")) return <a {...props} href={href} />;
  const url = new URL(href, "https://gradientpeak.invalid");
  return (
    <Link
      {...props}
      to={url.pathname}
      search={defaultParseSearch(url.search)}
      hash={url.hash.slice(1)}
    />
  );
}
