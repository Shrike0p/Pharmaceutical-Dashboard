import { Link } from "react-router-dom";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";

const LINKS = [
  { href: "#audit-trail", label: "Audit trail" },
  { href: "#capabilities", label: "Capabilities" },
  { href: "#under-the-hood", label: "Under the hood" },
];

export function LandingNav() {
  return (
    <header className="sticky top-0 z-40 h-16 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <BrandMark className="size-6" />
          <span className="font-heading text-sm font-semibold text-foreground">Equipment Cleaning Log</span>
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-brand-700"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <Button asChild size="sm" className="ml-auto rounded-full px-4">
          <Link to="/signin">Sign in</Link>
        </Button>
      </div>
    </header>
  );
}
