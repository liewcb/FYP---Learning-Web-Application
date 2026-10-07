import { HomeController } from "@/controllers/home/home.controller";
import { HomeView } from "@/views/home/home.view";

export default function Home() {
  const controller = new HomeController();

  return <HomeView model={controller.show()} />;
}
