import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButton } from '@angular/material/button';
import { ComptaOfficeService } from '../compta-office.service';
import { ComptaMetadata, DataIndex, DataVerificationResult, DataVerification, MissingDataVerification } from '../types/compta-metadata';



@Component({
  selector: 'app-home',
  imports: [CommonModule,MatButton],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent {

  metadata: ComptaMetadata[] = [];
  index: Map<string,DataIndex[]> = new Map<string,DataIndex[]>();
  verificationResults: DataVerificationResult[] = [];
  private comptaService: ComptaOfficeService = inject(ComptaOfficeService);

  async loadMetadata(): Promise<void> {
    this.metadata = [];
    this.index.clear();
    this.verificationResults = [];
    this.metadata = await this.comptaService.getComptaMetadata();
  }

  async indexData(): Promise<void> {
    this.index.clear();
    this.verificationResults = [];
    this.index = await this.comptaService.indexComptaData(this.metadata);
  }

  async verifyData(): Promise<void> {
    this.verificationResults = [];
    this.verificationResults = await this.comptaService.verifyComptaData(this.metadata, this.index);
    console.log(this.verificationResults);
  }

}
