import { SiteFooter, SiteHeader } from "@/components/brand/site-chrome";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}
