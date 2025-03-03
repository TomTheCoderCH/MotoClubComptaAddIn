import { Injectable } from '@angular/core';
import {
  ComptaMetadata,
  DataColumn,
  DataIndex,
  DataType,
  Libelle,
  DataVerificationEntry,
  DataVerificationResult,
  DataVerification,
  ColumnNames,
  MissingDataVerification,

} from './types/compta-metadata';
import moment from 'moment';
import 'moment/locale/fr-ch';
import 'moment-timezone';
import 'moment-msdate';
import * as utils from './utils';

@Injectable({
  providedIn: 'root'
})
export class ComptaOfficeService {
  async getComptaMetadata(): Promise<ComptaMetadata[]> {
    try {
      let result: ComptaMetadata[] = [];
      await Excel.run(async (context) => {
        const tables = context.workbook.tables;
        tables.load("items");
        await context.sync();
        for (const t of tables.items) {
          t.worksheet.load("name");
          t.load(["columns", "columns.items"]);
          await context.sync();
          let cols: DataColumn[] = t.columns.items.map(c => ({ index: Number(c.index), name: c.name }));
          result.push(new ComptaMetadata(t.name, cols, t.worksheet.name, t.worksheet.name.split(/\s+/).filter(s => s.length > 2)));

        }
      });
      return result;
    } catch (error) {
      console.error(error);
    }
    return [];
  }

  async indexComptaData(metadata: ComptaMetadata[]): Promise<Map<string, DataIndex[]>> {
    try {
      let result: DataIndex[] = [];
      await Excel.run(async (context) => {
        for (const meta of metadata) {
          let table = context.workbook.tables.getItem(meta.tableName);
          table.load(["rows", "rows.items", "rows.length"]);
          await context.sync();
          let rows = table.rows.items;
          const dateIndex = meta.getColumnIndex(ColumnNames.Date);
          const libelleIndex = meta.getColumnIndex(ColumnNames.Libelle);
          const doitIndex = meta.getColumnIndex(ColumnNames.Doit);
          const avoirIndex = meta.getColumnIndex(ColumnNames.Avoir);
          const montantIndex = meta.getColumnIndex(ColumnNames.Montant);
          if (dateIndex === undefined || libelleIndex === undefined)
            return;



          let index = new Map<number, DataIndex>();
          let data: DataType[][] = [];

          for (const r of rows) {
            r.load("values");
            await context.sync();
            for (const v of r.values) {

              if (v[0] === "") {
                continue;
              }
              let serialDate = v[dateIndex];
              const date: moment.Moment = moment.fromOADate(serialDate + 1462);

              const libelle: string = v[libelleIndex];
              let values: DataType[];
              if (meta.tableName === "Journal") {
                if (montantIndex === undefined)
                  return;
                const montant: number = utils.toNumber(v[montantIndex]);
                values = [date.toDate(), new Libelle(libelle), montant];
              }
              else {
                if (doitIndex === undefined || avoirIndex === undefined)
                  return;
                const doit: number = utils.toNumber(v[doitIndex]);
                const avoir: number = utils.toNumber(v[avoirIndex]);
                values = [date.toDate(), new Libelle(libelle), doit, avoir];
              }


              if (index.has(serialDate)) {
                index.get(serialDate)?.data.push(values);
              }
              else {
                index.set(serialDate, { tableName: meta.tableName, index: serialDate, data: [values] });
              }
            }
          }
          result.push(...index.values());
        }
      });
      return Map.groupBy(result, ({ tableName }) => tableName);
    } catch (error) {
      console.log(error);
    }
    return new Map<string, DataIndex[]>();
  }

  async verifyComptaData(metadata: ComptaMetadata[], index: Map<string, DataIndex[]>): Promise<DataVerificationResult[]> { // DataVerification | MissingDataVerification
    let result: DataVerificationResult[] = [];
    let indexCopy: Map<string, DataIndex[]> = new Map(JSON.parse(JSON.stringify(Array.from(index))));
    let metadataMap: Map<string, ComptaMetadata> = new Map(metadata.map(m => [m.tableName, m]));
    try {
      // Get and remove the Journal index
      let journal = indexCopy.get("Journal");
      const journalMetadata = metadataMap.get("Journal")!;
      const journalDateIndex = journalMetadata.getColumnIndex(ColumnNames.Date)!;
      const journalLibelleIndex = journalMetadata.getColumnIndex(ColumnNames.Libelle)!;
      const journalMontantIndex = journalMetadata.getColumnIndex(ColumnNames.Montant)!;
      indexCopy.delete("Journal");

      // Parse journal and search for corresponding entries in other tables (same date, same label and same amount)
      // Reverse the journal and iterate over it in reverse order to be able to remove entries
      // So we still process element in the right order
      journal?.sort((a, b) => b.index - a.index);
      if (journal === undefined) {
        console.error("Journal not found");
        return [];
      }
      let journalIndex = journal.length;
      let journalLibelle: Libelle | undefined = undefined;
      let journalDate: Date | undefined = undefined;
      let journalMontant: number | undefined = undefined;
      let sourceMetadata: ComptaMetadata | undefined = undefined;
      let destinationMetadata: ComptaMetadata | undefined = undefined;
      let sourceEntry: DataVerificationEntry | undefined = undefined;
      let destinationEntry: DataVerificationEntry | undefined = undefined;
      let sourceSearched: boolean = false;
      let destinationSearched: boolean = false;

      while (--journalIndex >= 0) {
        const journalEntry = journal[journalIndex];
        for (const data of journalEntry.data) {
          journalLibelle = data[journalLibelleIndex] as Libelle;
          journalDate = data[journalDateIndex] as Date;
          journalMontant = data[journalMontantIndex] as number;
          if (journalLibelle !== undefined) {
            if (journalLibelle.sourceAcronym !== undefined) {
              sourceMetadata = ComptaMetadata.findMetadataByAcronym(journalLibelle.sourceAcronym, metadata);
              if (sourceMetadata !== undefined) {
                sourceSearched = true;
                sourceEntry = this.findMatchingEntry(sourceMetadata, indexCopy.get(sourceMetadata.tableName)!, journalEntry.index, journalDate, journalLibelle, journalMontant);
              }
            }
            if (journalLibelle.destinationAcronym !== undefined) {
              destinationMetadata = ComptaMetadata.findMetadataByAcronym(journalLibelle.destinationAcronym, metadata);
              if (destinationMetadata !== undefined) {
                destinationSearched = true;
                destinationEntry = this.findMatchingEntry(destinationMetadata, indexCopy.get(destinationMetadata.tableName)!, journalEntry.index, journalDate, journalLibelle, journalMontant);
              }
            }

          }
          sourceSearched = false;
          destinationSearched = false;
          let verificationResult: DataVerification = {
            index: journalEntry.index,
            journalEntry: data,
            foundEntries: []
          };
          if (sourceEntry !== undefined) {
            verificationResult.foundEntries.push(sourceEntry);
          }
          if (destinationEntry !== undefined) {
            verificationResult.foundEntries.push(destinationEntry);
          }
          if (verificationResult.foundEntries.length > 0) {
            result.push(verificationResult);
          }
          else {
            let missingDataVerification: MissingDataVerification = {
              index: journalEntry.index,
              entryTablename: journalEntry.tableName,
              entryData: data
            };
            result.push(missingDataVerification);
          }

        }

      }

      return result;
    }
    catch (error) {
      console.error(error);
    }

    return [];
  }

  private findMatchingEntry(metadata: ComptaMetadata, index: DataIndex[], indexValue: number, date: Date, libelle: Libelle, montant: number): DataVerificationEntry | undefined {
    var entry = index.findIndex((v) => v.index === indexValue);
    if (entry === -1) {
      return undefined;
    }
    const dateIndex = metadata.getColumnIndex(ColumnNames.Date)! as number;
    const libelleIndex = metadata.getColumnIndex(ColumnNames.Libelle)! as number;
    const doitIndex = metadata.getColumnIndex(ColumnNames.Doit)! as number;
    const avoirIndex = metadata.getColumnIndex(ColumnNames.Avoir)! as number;
    let foundEntry: DataVerificationEntry | undefined = undefined;
    let foundEntryIndex: number | undefined = undefined;
    let dataLibelle: Libelle;
    let indexLibelle: Libelle = Libelle.fromObject(libelle);
    for (const [iData, data] of index[entry].data.entries()) {
      
      dataLibelle = Libelle.fromObject(data[libelleIndex]);
      if (data[dateIndex] === date && dataLibelle.areEquals(indexLibelle) && (data[doitIndex] === montant || data[avoirIndex] === montant)) {
        foundEntry = { tableName: index[entry].tableName, data: data };
        foundEntryIndex = iData;
        break;
      }
    }
    if (foundEntryIndex !== undefined) {
      index[entry].data.splice(foundEntryIndex, 1);
      return foundEntry;
    }
    // test
    var test = 1 + 1;
    return undefined;
  }

//   convertToClass<T>(cls: new (...args: any[]) => T, obj: any): T {
//     return Object.assign(new cls(), obj);
// }


}
