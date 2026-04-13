import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { type NextRequest } from "next/server";

const intlMiddleware = createIntlMiddleware(routing);

export default function middleware(request: NextRequest) {
  return intlMiddleware(request);
}

export const config = {
  matcher: ["/", "/(en|bn)/:path*"],
};
