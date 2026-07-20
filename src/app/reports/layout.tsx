import { FuturePreviewBanner } from "@/components/FuturePreviewBanner";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <FuturePreviewBanner />
      {children}
    </div>
  );
}
