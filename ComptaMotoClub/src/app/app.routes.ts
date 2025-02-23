import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';

export const routes: Routes = [
    // { path: 'index.html', redirectTo: '' },
    {
        path: '',
        component: HomeComponent,
        title: 'Home Page'
    }
];
