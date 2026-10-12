import { Component } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";

@Component({
  selector: "app-root",
  standalone: true,
  template: `
    <main>
      <h1>Angular Docker Lab</h1>
      <p>Frontend application is running.</p>
    </main>
  `,
  styles: [`
    main {
      font-family: Arial, sans-serif;
      max-width: 700px;
      margin: 80px auto;
    }
  `]
})
class AppComponent {}

bootstrapApplication(AppComponent)
  .catch(error => console.error(error));
