import { Metadata } from "next";

export const metadata: Metadata = {
  manifest: "/manifest-staff.json",
};

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
