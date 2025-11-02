import { redirect } from "next/navigation";

export default function LegacySuccessPage() {
  redirect("/billing/success");
}
