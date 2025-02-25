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
        if(this.acronyms.length >= 2)
        {
            var composedAcronyms = this.acronyms.reduce<string>((prev, cur) => {
                return prev+cur[0];
            }, '');
            this.acronyms = [...this.acronyms, composedAcronyms];
        }
    }
}

export interface DataColumn {
    index: Number,
    name: string
}

export type DataType = String | Number | Date;

export interface DataIndex {
    tableName: string,
    index: number,
    data: DataType[][]
}

export interface DataVerification {
    index: number,
    journalEntry: DataType[],
    firstEntryTablename: string,
    secondEntryTablename: string,
    firstEntryData: DataType[],
    secondEntryData: DataType[],
}

export interface MissingDataVerification {
    index: number,
    entryTablename: string,
    entryData: DataType[],
}

export type DataVerificationResult = DataVerification | MissingDataVerification;
