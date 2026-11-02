import Logo from "./Logo";
import { navLinks, site } from "@/lib/site";

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-slate-950">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-10 sm:px-6 md:flex-row md:justify-between">
        <Logo />
        <nav className="flex gap-6 text-sm text-slate-400">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} className="hover:text-white">
              {link.label}
            </a>
          ))}
        </nav>
        <div className="text-center text-sm text-slate-500 md:text-right">
          <p>
            © {site.year} {site.name}
          </p>
          <p>Created by {site.builder}</p>
        </div>
      </div>
    </footer>
  );
}
