import { Injectable } from '@angular/core';
import { ComptaMetadata, DataColumn, DataIndex, DataType, DataVerificationResult, DataVerification, MissingDataVerification } from './types/compta-metadata';
import moment from 'moment';
import 'moment/locale/fr-ch';
import 'moment-timezone';
import 'moment-msdate';

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

  async indexComptaData(metadata: ComptaMetadata[]): Promise<DataIndex[]> {
    try {
      let result: DataIndex[] = [];
      await Excel.run(async (context) => {
        for (const meta of metadata) {
          let table = context.workbook.tables.getItem(meta.tableName);
          table.load(["rows", "rows.items", "rows.length"]);
          await context.sync();
          let rows = table.rows.items;
          const dateIndex = meta.getColumnIndex("Date");
          const libelleIndex = meta.getColumnIndex("Libellé");
          const doitIndex = meta.getColumnIndex("Doit");
          const avoirIndex = meta.getColumnIndex("Avoir");
          const montantIndex = meta.getColumnIndex("Montant");
          if (dateIndex === undefined)
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
              let serialDate = v[dateIndex as number];
              const date: moment.Moment = moment.fromOADate(serialDate + 1462);

              const libelle: String = v[libelleIndex as number];
              let values: DataType[];
              if (meta.tableName === "Journal") {
                const montant: number = this.toNumber(v[montantIndex as number]);
                values = [date.toDate(), libelle, montant];
              }
              else {
                const doit: number = this.toNumber(v[doitIndex as number]);
                const avoir: number = this.toNumber(v[avoirIndex as number]);
                values = [date.toDate(), libelle, doit, avoir];
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
      return result;
    } catch (error) {
      console.log(error);
    }
    return [];
  }

  async verifyComptaData(index: DataIndex[]): Promise<DataVerificationResult[]> { // DataVerification | MissingDataVerification
    let result: DataVerificationResult[] = [];
    let indexCopy = index.slice();
    try {
      
      return result;
    }
    catch (error) {
      console.error(error);
    }
    return [];
  }

  private convertExcelDateToJSDate(excelDate: number) {
    // Excel dates are based on 1/1/1900
    var excelEpoch = new Date(1899, 11, 30);
    var jsDate = new Date(excelEpoch.getTime() + excelDate * 86400000);
    return jsDate;
  }

  private toNumber(value: string | number): number {
    if (typeof value === "string" && value.trim() === "") {
      return 0; // Default value for empty string
    }
    return Number(value);
  }

}
