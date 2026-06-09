import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TeamBoard",
    short_name: "TeamBoard",
    description: "Tableaux de tâches partagés pour l'équipe",
    start_url: "/",
    display: "standalone",
    background_color: "#F6F7F9",
    theme_color: "#5B57F2",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
