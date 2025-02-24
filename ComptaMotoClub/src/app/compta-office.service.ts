import { Injectable } from '@angular/core';
import { ComptaMetadata, DataColumn, DataIndex, DataType } from './types/compta-metadata';

import moment from 'moment';
import 'moment/locale/fr-ch';
import 'moment-timezone';
import 'moment-msdate';




@Injectable({
  providedIn: 'root'
})
export class ComptaOfficeService {
  
  constructor(private context: Excel.RequestContext) { }

  async getComptaMetadata(): Promise<ComptaMetadata[]> {
    const context = this.context;
    let result: ComptaMetadata[] = [];
    const tables = context.workbook.tables;
    tables.load("items");
    await context.sync();
    for (const t of tables.items) {
      t.worksheet.load("name");
      t.load(["columns", "columns.items"]);
      await context.sync();
      let cols: DataColumn[] = t.columns.items.map(c => ({ index: Number(c.index), name: c.name }));
      // for(const c of t.columns.items){

      // }
      result.push(new ComptaMetadata(t.name,cols,t.worksheet.name,t.worksheet.name.split(/\s+/).filter(s => s.length > 2)));
      
    }
    return result;
  }

  private convertExcelDateToJSDate(excelDate: number) {
    // Excel dates are based on 1/1/1900
    var excelEpoch = new Date(1899, 11, 30);
    var jsDate = new Date(excelEpoch.getTime() + excelDate * 86400000);
    return jsDate;
  }

  async indexComptaData(metadata: ComptaMetadata[]): Promise<DataIndex[]> {
    let result: DataIndex[] = [];
    
    
    
    for (const meta of metadata) {
      let table = this.context.workbook.tables.getItem(meta.tableName);
      table.load(["rows", "rows.items"]);
      await this.context.sync();
      let rows = table.rows.items;
      let dateIndex = meta.getColumnIndex("Date");
      if(dateIndex === undefined)
        return [];
      
      let index = new Map();
      let data: DataType[] = [];
      for (const r of rows) {
        r.load("valuesAsJsonLocal" );
        await this.context.sync();
        var cell = r.getRange().getCell(0,dateIndex as number);
        cell.load(["valuesAsJsonLocal","valueTypes","numberFormatLocal","text","numberFormat"]);
        await this.context.sync();
        var test = cell.valuesAsJsonLocal[0];
        var test2 = cell.valueTypes[0];
        var test3 = cell.numberFormatLocal[0];
        var test4 = cell.text[0];
        var test5 = r.valuesAsJsonLocal[0][0].basicValue as number;
        var test6 = this.convertExcelDateToJSDate(test5+1462);
        var test7 = moment(test6).format(cell.numberFormat[0][0]);
        var num = 10;
        
        // for (const v of r.valuesAsJsonLocal) {

        //   let msd = v[dateIndex as number];

        //   // const test : moment.Moment = moment();
        //   // const testDate = moment.fromOADate(msd);
          
        //   // if (testDate instanceof Date) {
        //   //   let key = testDate.toISOString().substr(0, 10);
        //   //   if (index.has(key)) {
        //   //     index.get(key).push(v);
        //   //   } else {
        //   //     index.set(key, [v]);
        //   //   }
        //   // }
        // }
      }
      result.push({
        tableName: meta.tableName,
        index: new Date(),
        data: data
      });
    }
    return result;
  }

}
