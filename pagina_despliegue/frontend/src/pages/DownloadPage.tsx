import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import DownloadHero from "../components/sections/download/DownloadHero";
import QuickInstall from "../components/sections/download/QuickInstall";
import ReleasesList from "../components/sections/download/ReleasesList";

export default function DownloadPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 pt-24">
        <DownloadHero />
        <QuickInstall />
        <ReleasesList />
      </main>
      <Footer />
    </div>
  );
}
