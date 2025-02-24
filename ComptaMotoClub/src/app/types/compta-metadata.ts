export class ComptaMetadata {
    tableName: string;
    columns: DataColumn[];
    sheetName: string;
    acronyms: string[];
    getColumnIndex(name: string): Number | undefined
    {
        return this.columns.find(c => c.name === name)?.index
    }
    constructor(tableName: string, columns: DataColumn[], sheetName: string, acronyms: string[])
    {
        this.tableName = tableName;
        this.columns = columns;
        this.sheetName = sheetName;
        this.acronyms = acronyms;
    }
    setColumns(columns: DataColumn[])
    {
        this.columns = columns;
    }
}

export interface DataColumn {
    index: Number,
    name: string
}

export type DataType = "string" | "number" | "date" | "boolean" | "object" | "array" | "null";
export interface DataIndex {
    tableName: string,
    index: Date,
    data: DataType[]
}