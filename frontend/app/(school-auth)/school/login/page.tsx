"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SchoolLoginPage } from "@/components/school/school-login-page";
import { schoolAuthMe } from "@/lib/school-api";

export default function SchoolLoginRoute() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await schoolAuthMe();
        if (!cancelled && res.success && res.data?.email) {
          router.replace("/school/portal?tab=registration");
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

  return <SchoolLoginPage />;
}
