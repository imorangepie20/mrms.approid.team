import Script from "next/script";

/* eslint-disable @next/next/no-css-tags -- Vite's same-origin static stylesheet is the admin app runtime. */

export default function AdminPage() {
  return (
    <>
      <link data-testid="admin-app-style" rel="stylesheet" href="/admin/assets/index.css" />
      <div data-testid="admin-root" id="root" />
      <Script data-testid="admin-app-script" strategy="afterInteractive" type="module" src="/admin/assets/index.js" />
    </>
  );
}
