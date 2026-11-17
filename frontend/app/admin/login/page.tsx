"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { apiRequest } from "@/lib/api";

export default function AdminLoginPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiRequest("/auth/me");
        if (!cancelled && res.success) {
          router.replace("/admin/dashboard");
        }
      } catch {
        /* stay on login form */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  return <AdminLoginForm />;
}
