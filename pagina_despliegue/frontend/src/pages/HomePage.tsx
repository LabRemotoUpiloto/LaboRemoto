import Header from "../components/Header";
import Hero from "../components/Hero";
import Footer from "../components/Footer";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1">
        <Hero />
      </main>
      <Footer />
    </div>
  );
}
