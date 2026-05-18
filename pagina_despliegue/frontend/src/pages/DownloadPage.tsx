import { useEffect } from "react";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import DownloadHero from "../components/sections/download/DownloadHero";
import QuickInstall from "../components/sections/download/QuickInstall";
import ReleasesList from "../components/sections/download/ReleasesList";
import { useReleases } from "../components/sections/download/useReleases";

export default function DownloadPage() {
  const { releases, switchVersion } = useReleases();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 bg-black">
        <DownloadHero />
        <QuickInstall releases={releases} />
        <ReleasesList releases={releases} switchVersion={switchVersion} />
      </main>
      <Footer />
    </div>
  );
}
