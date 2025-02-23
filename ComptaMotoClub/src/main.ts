import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';


if (Office !== undefined && Office.initialize !== undefined)
{
  Office.initialize = function () {
    bootstrapApplication(AppComponent, appConfig)
      .catch((err) => console.error(err));
  };
}
else
{
  bootstrapApplication(AppComponent, appConfig)
      .catch((err) => console.error(err));
}
