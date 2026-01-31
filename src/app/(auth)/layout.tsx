import Navbar from "@/components/navbar";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-full">
      <Navbar />
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
