import { redirect } from "next/navigation";

export default function LegacyCancelPage() {
  redirect("/billing/cancel");
}
