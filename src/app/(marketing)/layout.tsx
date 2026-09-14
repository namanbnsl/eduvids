import Navbar from "@/components/navbar";
import { MarketingFooter } from "@/components/marketing/footer";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <Navbar />
      <div className="flex-1 overflow-y-auto">
        <main>{children}</main>
        <MarketingFooter />
      </div>
    </div>
  );
}
