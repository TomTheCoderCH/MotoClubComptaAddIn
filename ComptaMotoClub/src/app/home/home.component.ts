import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ComptaOfficeService } from '../compta-office.service';
import { ComptaMetadata, DataIndex } from '../types/compta-metadata';



@Component({
  selector: 'app-home',
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent {

  metadata: ComptaMetadata[] = [];
  index: DataIndex[] = [];
  async loadMetadata(): Promise<void> {
    try {
      await Excel.run(async (context) => {
        const comptaService = new ComptaOfficeService(context);
        this.metadata = await comptaService.getComptaMetadata();
      });
    } catch (error) {
      console.error(error);
    }
  }

  async indexData(): Promise<void> {
    try {
      await Excel.run(async (context) => {
        const comptaService = new ComptaOfficeService(context);
        this.index = await comptaService.indexComptaData(this.metadata);
      });
    } catch (error) {
      console.error(error);
    }
  }

}
