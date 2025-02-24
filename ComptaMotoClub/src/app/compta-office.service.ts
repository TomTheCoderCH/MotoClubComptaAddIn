import { Injectable } from '@angular/core';
import { ComptaMetadata, DataColumn, DataIndex, DataType } from './types/compta-metadata';
import * as moment from 'moment';



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
        r.load("values" );
        await this.context.sync();
        
        for (const v of r.values) {
          let msd = v[dateIndex as number];
          // @ts-ignore
          let d = moment.fn.fromOADate(msd);
          if (d instanceof Date) {
            let key = d.toISOString().substr(0, 10);
            if (index.has(key)) {
              index.get(key).push(v);
            } else {
              index.set(key, [v]);
            }
          }
        }
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
