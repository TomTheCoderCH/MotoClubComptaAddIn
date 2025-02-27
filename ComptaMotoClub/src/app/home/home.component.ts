import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ComptaOfficeService } from '../compta-office.service';
import { ComptaMetadata, DataIndex, DataVerificationResult, DataVerification, MissingDataVerification } from '../types/compta-metadata';



@Component({
  selector: 'app-home',
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent {

  metadata: ComptaMetadata[] = [];
  index: Map<string,DataIndex[]> = new Map<string,DataIndex[]>();
  verificationResults: DataVerificationResult[] = [];
  private comptaService: ComptaOfficeService = inject(ComptaOfficeService);

  async loadMetadata(): Promise<void> {
    this.metadata = await this.comptaService.getComptaMetadata();
  }

  async indexData(): Promise<void> {
    this.index = await this.comptaService.indexComptaData(this.metadata);
  }

  async verifyData(): Promise<void> {
    this.verificationResults = await this.comptaService.verifyComptaData(this.metadata, this.index);
    console.log(this.verificationResults);
  }

}
