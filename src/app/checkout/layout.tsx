import Logo from "@/components/Logo";

// Plain frame for the page shown after Stripe Checkout. It sits outside any
// workspace, so it doesn't use the app sidebar.
export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-14 items-center border-b border-white/10 px-4 sm:px-8">
        <Logo href="/dashboard" />
      </header>
      <main className="flex-1 px-4 py-10 sm:px-8">{children}</main>
    </div>
  );
}
