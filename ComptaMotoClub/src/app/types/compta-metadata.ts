export class ComptaMetadata {
    tableName: string;
    columns: DataColumn[];
    sheetName: string;
    acronyms: string[];

    constructor(tableName: string, columns: DataColumn[], sheetName: string, acronyms: string[]) {
        this.tableName = tableName;
        this.columns = columns;
        this.sheetName = sheetName;
        this.acronyms = acronyms;
        if (this.acronyms.length >= 2) {
            var composedAcronyms = this.acronyms.reduce<string>((prev, cur) => {
                return prev + cur[0];
            }, '');
            this.acronyms = [...this.acronyms, composedAcronyms];
        }
    }

    getColumnIndex(name: string): Number | undefined {
        return this.columns.find(c => c.name === name)?.index;
    }

    acronymsMatch(acronym: string): boolean {
        return this.acronyms.includes(acronym);
    }

    static findMetadataByAcronym(acronym: string, metadata: ComptaMetadata[]): ComptaMetadata | undefined {
        return metadata.find(m => m.acronymsMatch(acronym));
    }
}



export interface DataColumn {
    index: Number,
    name: string;
}

export type DataType = String | Number | Date | Libelle;

export interface DataIndex {
    tableName: string,
    index: number,
    data: DataType[][]
}

export interface DataVerificationEntry {
    tableName: string,
    data: DataType[];
}
export interface DataVerification {
    index: number,
    journalEntry: DataType[],
    foundEntries: DataVerificationEntry[];
}

export interface MissingDataVerification {
    index: number,
    entryTablename: string,
    entryData: DataType[],
}

export type DataVerificationResult = DataVerification | MissingDataVerification;

export class Libelle {
    sourceAcronym?: string = undefined;
    destinationAcronym?: string = undefined;
    libelle: string = '';
    public value: String;
    
    constructor(value?: String){
        if (value !== undefined) {
            this.value = value;
            this.parseLibelle();
        }
        else {
            this.value = '';
        }
    }

    static fromString(value: String): Libelle {
        return new Libelle(value);
    }

    static fromObject(obj: any): Libelle {
        const keys = Object.keys(obj);
        let libelle = new Libelle();
        if (keys.includes('value')) {
            libelle.value = obj.value;
        }
        if (keys.includes('sourceAcronym')) {
            libelle.sourceAcronym = obj.sourceAcronym;
        }
        if (keys.includes('destinationAcronym')) {
            libelle.destinationAcronym = obj.destinationAcronym;
        }
        if (keys.includes('libelle')) {
            libelle.libelle = obj.libelle;
        }
        return libelle;
    }

    setValue(value: String): void {
        this.value = value;
        this.parseLibelle(); 
    }

    private parseLibelle() {
        if (this.value === undefined) {
            return;
        }
        const libelleSeparator = ' - ';
        const acronymSeparator = ' à ';
        if (this.value.includes(libelleSeparator)) {
            var parts = this.value.split(libelleSeparator, 2);
            this.libelle = parts[1].trim().toString();
            if (parts[0].includes(acronymSeparator)) {
                var acronyms = parts[0].split(acronymSeparator, 2);
                this.sourceAcronym = acronyms[0].trim().toString();
                this.destinationAcronym = acronyms[1].trim().toString();
            }
            else {
                this.sourceAcronym = parts[0].trim().toString();
            }
        }
        else {
            this.libelle = this.value.trim().toString();
        }
    }
    public areEquals(other: Libelle): boolean {    
        return this.libelle === other.libelle && this.sourceAcronym === other.sourceAcronym && this.destinationAcronym === other.destinationAcronym;
    }

}