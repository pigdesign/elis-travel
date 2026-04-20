import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { HeroSection } from "@/components/sections/HeroSection";
import { SearchBar } from "@/components/sections/SearchBar";
import { PopularDestinations } from "@/components/sections/PopularDestinations";
import { FeatureSection } from "@/components/sections/FeatureSection";
import { BestServices } from "@/components/sections/BestServices";
import { PopularTours } from "@/components/sections/PopularTours";
import { EasySteps } from "@/components/sections/EasySteps";
import { WhyChooseUs } from "@/components/sections/WhyChooseUs";
import { Testimonials } from "@/components/sections/Testimonials";
import { AdventureHero } from "@/components/sections/AdventureHero";

export function HomePage() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background w-full overflow-x-hidden">
      <Header />
      <main className="flex-1 w-full">
        <HeroSection />
        <SearchBar />
        <PopularDestinations />
        <FeatureSection />
        <BestServices />
        <PopularTours />
        <EasySteps />
        <WhyChooseUs />
        <Testimonials />
        <AdventureHero />
      </main>
      <Footer />
    </div>
  );
}
