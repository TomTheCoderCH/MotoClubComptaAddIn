import { Component,Input } from '@angular/core';
import { RouterModule } from '@angular/router';
import { HousingLocation } from '../housing-location';


@Component({
  selector: 'app-housing-location',
  imports: [RouterModule],
  templateUrl: './housing-location.component.html',
  styleUrls: ['./housing-location.component.css']
})
export class HousingLocationComponent {
  @Input() housingLocation!:HousingLocation;
}
