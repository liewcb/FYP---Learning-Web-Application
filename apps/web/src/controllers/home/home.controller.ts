import {
  createHomePageModel,
  type HomePageModel,
} from "@/models/home/home.model";
import type { Viewer } from "@/models/profile/profile.model";

export class HomeController {
  show(viewer: Viewer): HomePageModel {
    return createHomePageModel({
      displayName: viewer.displayName,
      initials: viewer.initials,
      programme: "Undergraduate learner",
    });
  }
}
