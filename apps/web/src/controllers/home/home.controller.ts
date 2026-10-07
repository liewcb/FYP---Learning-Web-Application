import {
  createHomePageModel,
  type HomePageModel,
} from "@/models/home/home.model";

export class HomeController {
  show(): HomePageModel {
    return createHomePageModel();
  }
}
