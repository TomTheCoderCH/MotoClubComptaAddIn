import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButton } from '@angular/material/button';
import { ComptaOfficeService } from '../compta-office.service';
import { ComptaMetadata, DataIndex, DataVerificationResult, Libelle, DataType, DataVerification, MissingDataVerification } from '../types/compta-metadata';



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

  isDataVerification(result: DataVerificationResult): result is DataVerification {
    return (result as DataVerification).journalEntry !== undefined;
  }

  isMissingDataVerification(result: DataVerificationResult): result is MissingDataVerification {
    return (result as MissingDataVerification).entryTablename !== undefined;
  }

  isLibelle(data: DataType): data is Libelle {
    return (data as Libelle).sourceAcronym !== undefined;
  }

}
