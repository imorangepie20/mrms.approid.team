import Script from "next/script";
import { readdirSync } from "node:fs";
import { join } from "node:path";

function adminAsset(extension: "js" | "css") {
  const assets = readdirSync(join(process.cwd(), "public/admin/assets"));
  const prefix = extension === "css" ? "style-" : "index-";
  const name = assets.find((asset) => asset.startsWith(prefix) && asset.endsWith(`.${extension}`));
  if (!name) throw new Error(`Admin ${extension} asset is missing`);
  return `/admin/assets/${name}`;
}

/* eslint-disable @next/next/no-css-tags -- Vite's same-origin static stylesheet is the admin app runtime. */

export default function AdminPage() {
  return (
    <>
      <link data-testid="admin-app-style" rel="stylesheet" href={adminAsset("css")} />
      <div data-testid="admin-root" id="root" />
      <Script data-testid="admin-app-script" strategy="afterInteractive" type="module" src={adminAsset("js")} />
    </>
  );
}
