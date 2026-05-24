import type { RouteFlashType } from "../components/route-flash-toast";

export function buildFlashHref(href: string, message: string, type: RouteFlashType = "info") {
  const normalizedHref = href.startsWith("/") ? href : `/${href}`;
  const url = new URL(normalizedHref, "http://gradientpeak.local");

  url.searchParams.set("flash", message);
  url.searchParams.set("flashType", type);

  return `${url.pathname}${url.search}${url.hash}`;
}
